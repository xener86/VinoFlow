// Prépare la base de test des tests d'API : schéma remis à zéro puis
// construit par le runner de migrations (ce qui le teste au passage).
import pg from 'pg';
import { runMigrations } from '../src/migrations.js';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await runMigrations(pool, { log: () => {} });
  } finally {
    await pool.end();
  }
}
