import express, { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { parseCsv, CsvFormatError } from '../csvImport/parse.js';
import { toPatches } from '../csvImport/rows.js';
import { buildPlan } from '../csvImport/plan.js';
import { loadCellar, applyPlan } from '../csvImport/apply.js';
import { MAX_ROWS as MAX_CSV_ROWS } from '../csvImport/columns.js';

const router = Router();

// ========== IMPORT (restauration d'une sauvegarde) ==========
//
// Reçoit le JSON produit par exportFullData (services/storageService.ts) :
// { wines, bottles, racks, spirits, tastingNotes, history, wishlist?, cocktails?, timestamp }
// où chaque tableau est la réponse du GET correspondant (clés en camelCase).
//
// Stratégie : FUSION par identifiant, dans une seule transaction.
// - Une ligne dont l'id existe déjà est remplacée par la version de la sauvegarde
//   (seules les colonnes présentes dans le fichier sont écrites) ;
//   une ligne absente est créée avec son id d'origine.
// - Rien n'est supprimé : ce qui a été ajouté depuis la sauvegarde est conservé.
// - L'id faisant foi, réimporter le même fichier ne crée aucun doublon ;
//   un fichier contenant deux fois le même id est refusé.
// - Tout ou rien : la moindre ligne invalide annule l'import (400).

// Ordre d'insertion : les vins avant les bouteilles et dégustations (clés étrangères).
const SECTIONS = [
  { key: 'racks', table: 'racks', required: ['name', 'width', 'height'] },
  { key: 'wines', table: 'wines', required: ['name'] },
  { key: 'bottles', table: 'bottles', required: ['wineId'], wineRef: true },
  { key: 'spirits', table: 'spirits', required: ['name'] },
  { key: 'tastingNotes', table: 'tasting_notes', required: ['wineId'], wineRef: true },
  { key: 'history', table: 'journal', required: ['type'] },
  { key: 'wishlist', table: 'wishlist', required: ['name'] },
  { key: 'cocktails', table: 'cocktails', required: ['name'], textId: true },
];

// Colonnes jamais restaurées : l'embedding (pgvector) est recalculé, et son
// modèle doit rester cohérent avec le vecteur déjà en base.
const SKIPPED_COLUMNS = { wines: ['embedding', 'embedding_model'] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 50_000;

const toSnakeCase = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

class ImportError extends Error {}

/**
 * Valide la structure du fichier et renvoie { section.key: rows[] }.
 * Lève ImportError avec un message lisible au premier problème.
 */
export const parseBackup = (data) => {
  if (!isObject(data)) throw new ImportError('Le fichier doit contenir un objet JSON.');
  const sections = {};
  for (const { key } of SECTIONS) {
    if (data[key] === undefined || data[key] === null) continue;
    if (!Array.isArray(data[key])) throw new ImportError(`« ${key} » doit être un tableau.`);
    sections[key] = data[key];
  }
  // Ancien format éventuel : bouteilles seulement imbriquées dans les vins.
  if (!sections.bottles && sections.wines) {
    const nested = sections.wines.flatMap((w) => (isObject(w) && Array.isArray(w.bottles) ? w.bottles : []));
    if (nested.length) sections.bottles = nested;
  }
  if (Object.keys(sections).length === 0) {
    throw new ImportError('Aucune donnée VinoFlow reconnue (wines, bottles, racks, spirits…).');
  }
  const total = Object.values(sections).reduce((n, rows) => n + rows.length, 0);
  if (total > MAX_ROWS) throw new ImportError(`Fichier trop volumineux (${total} lignes, maximum ${MAX_ROWS}).`);

  for (const { key, required, textId } of SECTIONS) {
    const seen = new Set();
    (sections[key] || []).forEach((row, i) => {
      const where = `${key}[${i}]`;
      if (!isObject(row)) throw new ImportError(`${where} : objet attendu.`);
      const validId = textId
        ? typeof row.id === 'string' && row.id.trim() !== '' && row.id.length <= 200
        : typeof row.id === 'string' && UUID.test(row.id);
      if (!validId) throw new ImportError(`${where} : identifiant manquant ou invalide.`);
      if (seen.has(row.id)) throw new ImportError(`${where} : identifiant ${row.id} en double dans le fichier.`);
      seen.add(row.id);
      const missing = required.filter((f) => isBlank(row[f]));
      if (missing.length) throw new ImportError(`${where} : champ(s) obligatoire(s) manquant(s) : ${missing.join(', ')}.`);
      if (key === 'bottles' || key === 'tastingNotes') {
        if (!UUID.test(row.wineId)) throw new ImportError(`${where} : wineId invalide.`);
      }
    });
  }
  return sections;
};

// Colonnes réelles des tables (le schéma évolue avec les migrations : un champ
// inconnu du fichier est ignoré, une colonne absente du fichier n'est pas touchée).
const loadColumns = async (client) => {
  const { rows } = await client.query(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [SECTIONS.map((s) => s.table)]
  );
  const columns = {};
  for (const r of rows) (columns[r.table_name] ||= new Map()).set(r.column_name, r.data_type);
  return columns;
};

const toDbValue = (value, dataType) => {
  if (value === undefined || value === null) return null;
  // jsonb : sérialisé à la main (un tableau JS partirait en tableau Postgres,
  // une chaîne comme "Non trié" doit devenir la chaîne JSON '"Non trié"').
  if (dataType === 'jsonb' || dataType === 'json') return JSON.stringify(value);
  return value;
};

const upsertRow = async (client, table, columnTypes, row) => {
  const skipped = SKIPPED_COLUMNS[table] || [];
  const entries = Object.entries(row)
    .map(([key, value]) => [toSnakeCase(key), value])
    .filter(([col]) => columnTypes.has(col) && !skipped.includes(col) && columnTypes.get(col) !== 'USER-DEFINED');
  const cols = entries.map(([col]) => col);
  const values = entries.map(([col, value]) => toDbValue(value, columnTypes.get(col)));
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`);
  const { rows } = await client.query(
    `INSERT INTO ${table} (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}
     RETURNING (xmax = 0) AS inserted`,
    values
  );
  return rows[0].inserted;
};

// Une sauvegarde complète dépasse vite la limite globale de 1 Mo : parseur
// dédié, monté après l'authentification (voir app.js).
export const importBodyParser = express.json({ limit: '25mb' });

router.post('/import', importBodyParser, async (req, res) => {
  let sections;
  try {
    sections = parseBackup(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  let current = null;
  try {
    const summary = await withTransaction(async (client) => {
      const columns = await loadColumns(client);

      // Bouteilles et dégustations : leur vin doit être dans le fichier ou déjà en base.
      const fileWineIds = new Set((sections.wines || []).map((w) => w.id));
      const referenced = [...new Set(SECTIONS.filter((s) => s.wineRef)
        .flatMap((s) => (sections[s.key] || []).map((r) => r.wineId))
        .filter((id) => !fileWineIds.has(id)))];
      if (referenced.length) {
        const { rows } = await client.query('SELECT id FROM wines WHERE id = ANY($1::uuid[])', [referenced]);
        const known = new Set(rows.map((r) => r.id));
        const unknown = referenced.filter((id) => !known.has(id));
        if (unknown.length) {
          throw new ImportError(`${unknown.length} bouteille(s)/dégustation(s) font référence à un vin absent (ex. ${unknown[0]}).`);
        }
      }

      const result = {};
      for (const { key, table } of SECTIONS) {
        if (!sections[key]) continue;
        if (!columns[table]) throw new Error(`Table ${table} absente du schéma`);
        const counts = { inserted: 0, updated: 0 };
        for (const [i, row] of sections[key].entries()) {
          current = `${key}[${i}]`;
          if (await upsertRow(client, table, columns[table], row)) counts.inserted++;
          else counts.updated++;
        }
        result[key] = counts;
      }
      current = null;
      return result;
    });
    res.json({ success: true, mode: 'merge', imported: summary });
  } catch (error) {
    if (error instanceof ImportError) return res.status(400).json({ error: error.message });
    // 22xxx (donnée invalide) / 23xxx (contrainte) : la faute vient du fichier.
    if (/^2[23]/.test(error.code || '')) {
      return res.status(400).json({ error: `${current ?? 'Import'} : ${error.message}` });
    }
    console.error('Error importing backup:', error);
    res.status(500).json({ error: 'Failed to import backup' });
  }
});

// ========== IMPORT CSV (aller-retour avec l'export) ==========
//
// { csv, dryRun: true }  → { plan } : aperçu, aucune écriture.
// { csv, dryRun: false, planHash } → le plan est recalculé sur la cave actuelle ;
// s'il diffère de l'aperçu (planHash) → 409, sinon application en une transaction.
const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const csvBodyParser = express.json({ limit: '4mb' });

router.post('/import/csv', csvBodyParser, async (req, res) => {
  const { csv, dryRun, planHash } = req.body || {};
  if (typeof csv !== 'string') return res.status(400).json({ error: 'Fichier CSV manquant.' });
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
    return res.status(413).json({ error: 'Fichier trop volumineux (2 Mo maximum).' });
  }
  try {
    const table = parseCsv(csv);
    if (table.rows.length > MAX_CSV_ROWS) return res.status(400).json({ error: `Trop de lignes (${MAX_CSV_ROWS} maximum).` });
    const { patches, errors } = toPatches(table);

    if (dryRun !== false) {
      return res.json({ plan: buildPlan(patches, await loadCellar(pool), errors) });
    }
    const applied = await withTransaction(async (client) => {
      const plan = buildPlan(patches, await loadCellar(client), errors);
      return plan.planHash === planHash ? applyPlan(client, plan, req.user?.userId ?? null) : null;
    });
    if (!applied) return res.status(409).json({ error: 'La cave a changé depuis l’aperçu, relance-le.' });
    return res.json({ applied });
  } catch (error) {
    if (error instanceof CsvFormatError) return res.status(400).json({ error: error.message });
    console.error('CSV import error:', error);
    return res.status(500).json({ error: 'L’import CSV a échoué ; rien n’a été modifié.' });
  }
});

export default router;
