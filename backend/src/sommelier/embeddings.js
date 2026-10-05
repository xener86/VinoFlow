// Phase 5 — Embedding-based wine matching.
//
// Vecteurs gemini-embedding-001 en 768 dimensions (tâche 'embedding'
// d'aiService), stockés dans wines.embedding (pgvector vector(768)) avec le
// modèle qui les a produits (wines.embedding_model). Les vecteurs d'un autre
// modèle (ex. text-embedding-004) sont incompatibles : ils sont recalculés.
//
// Optional: pgvector extension must be installed (default in pgvector/pgvector
// Docker image, or `CREATE EXTENSION vector` on a vanilla postgres).

import { embedTexts, getEmbeddingModel } from '../services/aiService.js';

/**
 * Build the textual representation of a wine that gets embedded.
 * Concatenates all the searchable / matchable signals.
 */
export const buildWineDocument = (wine) => {
  return [
    wine.name,
    wine.cuvee,
    wine.producer,
    wine.region,
    wine.appellation,
    wine.country,
    wine.type,
    wine.vintage ? `millésime ${wine.vintage}` : null,
    Array.isArray(wine.grapeVarieties) ? `cépages: ${wine.grapeVarieties.join(', ')}` : null,
    Array.isArray(wine.aromaProfile) ? `arômes: ${wine.aromaProfile.join(', ')}` : null,
    wine.sensoryDescription,
    wine.sensoryProfile ? `corps ${wine.sensoryProfile.body}, acidité ${wine.sensoryProfile.acidity}, tanin ${wine.sensoryProfile.tannin}` : null,
  ].filter(Boolean).join(' | ');
};

const BATCH_SIZE = 50;

/**
 * Calcule les embeddings manquants ou produits par un autre modèle.
 * @param {{ limit?: number, all?: boolean }} options - all: recalcule tout
 * Returns { processed, updated, errors, model }.
 */
export const updateMissingEmbeddings = async (pool, options = {}) => {
  const limit = options.limit ?? 100;
  const model = getEmbeddingModel();
  // Skip if pgvector not available — the column may not exist
  let hasColumn = true;
  try {
    await pool.query(`SELECT embedding, embedding_model FROM wines LIMIT 1`);
  } catch {
    hasColumn = false;
  }
  if (!hasColumn) {
    return { processed: 0, updated: 0, errors: [], note: 'pgvector column not available — migration 002 not applied' };
  }

  const result = await pool.query(`
    SELECT id, name, cuvee, producer, vintage, region, appellation, country, type,
           grape_varieties, aroma_profile, sensory_description, sensory_profile
      FROM wines
     WHERE $2::boolean OR embedding IS NULL OR embedding_model IS DISTINCT FROM $3
     ORDER BY updated_at DESC
     LIMIT $1
  `, [limit, options.all === true, model]);

  let updated = 0;
  const errors = [];

  for (let i = 0; i < result.rows.length; i += BATCH_SIZE) {
    const rows = result.rows.slice(i, i + BATCH_SIZE);
    try {
      const docs = rows.map((row) => buildWineDocument({
        ...row,
        grapeVarieties: row.grape_varieties,
        aromaProfile: row.aroma_profile,
        sensoryDescription: row.sensory_description,
        sensoryProfile: row.sensory_profile,
      }));
      const vectors = await embedTexts(docs);
      for (let j = 0; j < rows.length; j++) {
        await pool.query(
          `UPDATE wines SET embedding = $1, embedding_model = $2 WHERE id = $3`,
          [`[${vectors[j].join(',')}]`, model, rows[j].id]
        );
        updated++;
      }
    } catch (err) {
      rows.forEach((row) => errors.push({ id: row.id, error: err.message }));
    }
  }

  return { processed: result.rows.length, updated, errors, model };
};
