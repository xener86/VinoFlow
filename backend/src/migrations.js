// Runner de migrations SQL, exécuté au démarrage du backend.
//
// - Base vide (pas de table users) : applique d'abord db/init.sql (schéma de base).
// - Table schema_migrations : un enregistrement par fichier db/migrations/*.sql appliqué.
// - Chaque fichier manquant est appliqué dans l'ordre, dans sa propre transaction
//   (les fichiers ne doivent donc pas contenir BEGIN/COMMIT).
// - Base antérieure au runner (schema_migrations absente) : les migrations
//   historiques 001-004 sont détectées via le schéma et seulement marquées.
// - Un fichier contenant la ligne `-- vinoflow:optional` peut échouer sans
//   bloquer le démarrage (ex. pgvector absent) : il est retenté au démarrage suivant.
// - Un verrou consultatif évite que deux backends migrent en même temps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK_KEY = 74_206_001; // arbitraire, propre à VinoFlow

// En dev : <repo>/db ; dans l'image Docker : /app/db.
export const findDbDir = () => {
  const candidates = [
    process.env.VINOFLOW_DB_DIR,
    path.resolve(HERE, '..', 'db'),
    path.resolve(HERE, '..', '..', 'db'),
  ].filter(Boolean);
  const dir = candidates.find((d) => fs.existsSync(path.join(d, 'migrations')));
  if (!dir) throw new Error(`Dossier db/ introuvable (cherché : ${candidates.join(', ')})`);
  return dir;
};

const columnExists = (table, column) => `EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}')`;
const tableExists = (table) => `to_regclass('public.${table}') IS NOT NULL`;
const constraintExists = (name) => `EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}')`;

// Migrations appliquées à la main (ou via les scripts d'init Docker) avant
// l'existence du runner : on reconnaît leur présence au schéma.
const LEGACY_PROBES = {
  '001_sommelier_v2.sql': [
    tableExists('pairing_feedback'), tableExists('pairing_cache'), tableExists('taste_profile'),
    columnExists('wines', 'aroma_source'), constraintExists('wines_aroma_source_check'),
  ],
  '002_pgvector.sql': [columnExists('wines', 'embedding')],
  '003_peak_window.sql': [
    columnExists('wines', 'peak_verified_by'), constraintExists('wines_peak_confidence_check'),
  ],
  '004_auth_tokens.sql': [
    tableExists('refresh_tokens'), tableExists('password_reset_tokens'),
    columnExists('users', 'password_changed_at'),
  ],
};

const OPTIONAL_MARKER = /^--\s*vinoflow:optional\b/m;
const TRANSACTION_STATEMENT = /^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im;

const readSql = (file) => {
  const sql = fs.readFileSync(file, 'utf8');
  if (TRANSACTION_STATEMENT.test(sql)) {
    throw new Error(`${path.basename(file)} contient BEGIN/COMMIT : le runner gère déjà la transaction.`);
  }
  return sql;
};

const inTransaction = async (client, fn) => {
  await client.query('BEGIN');
  try {
    await fn();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
};

/**
 * Applique les migrations manquantes.
 * @returns {Promise<{ baseline: boolean, detected: string[], applied: string[], skipped: string[] }>}
 */
export async function runMigrations(pool, { dbDir = findDbDir(), log = console.log } = {}) {
  const migrationsDir = path.join(dbDir, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const report = { baseline: false, detected: [], applied: [], skipped: [] };

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    const one = async (sql) => (await client.query(`SELECT (${sql}) AS ok`)).rows[0].ok;

    if (!(await one(tableExists('users')))) {
      const initSql = readSql(path.join(dbDir, 'init.sql'));
      await inTransaction(client, () => client.query(initSql));
      report.baseline = true;
      log('🗄️  Base vide : schéma initial (db/init.sql) appliqué');
    }

    const runnerExisted = await one(tableExists('schema_migrations'));
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamp with time zone DEFAULT now() NOT NULL,
      detected boolean DEFAULT false NOT NULL
    )`);

    if (!runnerExisted) {
      for (const file of files) {
        const probes = LEGACY_PROBES[file];
        if (probes && (await one(probes.join(' AND ')))) {
          await client.query(
            'INSERT INTO schema_migrations (filename, detected) VALUES ($1, true) ON CONFLICT DO NOTHING',
            [file]
          );
          report.detected.push(file);
        }
      }
      if (report.detected.length) {
        log(`🗄️  Migrations déjà présentes, marquées : ${report.detected.join(', ')}`);
      }
    }

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const done = new Set(rows.map((r) => r.filename));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readSql(path.join(migrationsDir, file));
      try {
        await inTransaction(client, async () => {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        });
      } catch (error) {
        if (!OPTIONAL_MARKER.test(sql)) {
          throw new Error(`${file} : ${error.message}`);
        }
        report.skipped.push(file);
        log(`⚠️  Migration facultative ignorée : ${file} (${error.message})`);
        continue;
      }
      report.applied.push(file);
      log(`🗄️  Migration appliquée : ${file}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return report;
}
