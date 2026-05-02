// Phase 5 — Embedding-based wine matching.
//
// Uses Gemini text-embedding-004 to compute a vector representation of each
// wine's profile. Stored in the wines.embedding column (pgvector vector(768)).
// Pairing then uses cosine similarity in SQL — O(1) regardless of cave size.
//
// Optional: pgvector extension must be installed (default in pgvector/pgvector
// Docker image, or `CREATE EXTENSION vector` on a vanilla postgres).

import { GoogleGenAI } from '@google/genai';
import { resolveProviderKey } from '../services/aiService.js';

let lazyClient = null;
let lazyKey = null;
const getClient = () => {
  const key = resolveProviderKey('gemini');
  if (!key) throw new Error('Gemini key required for embeddings');
  if (!lazyClient || lazyKey !== key) {
    lazyClient = new GoogleGenAI({ apiKey: key });
    lazyKey = key;
  }
  return lazyClient;
};

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

/**
 * Compute an embedding vector for a piece of text.
 * Returns an array of 768 floats.
 */
export const computeEmbedding = async (text) => {
  const client = getClient();
  const result = await client.models.embedContent({
    model: 'text-embedding-004',
    contents: text,
  });
  return result.embeddings[0].values;
};

/**
 * Update embeddings for wines that don't have one (or have been modified
 * since their embedding was computed).
 *
 * Returns { processed, updated, errors }.
 */
export const updateMissingEmbeddings = async (pool, options = {}) => {
  const limit = options.limit ?? 100;
  // Skip if pgvector not available — the column may not exist
  let hasColumn = true;
  try {
    await pool.query(`SELECT embedding FROM wines LIMIT 1`);
  } catch {
    hasColumn = false;
  }
  if (!hasColumn) {
    return { processed: 0, updated: 0, errors: [], note: 'pgvector column not available — run migration 002 first' };
  }

  const result = await pool.query(`
    SELECT id, name, cuvee, producer, vintage, region, appellation, country, type,
           grape_varieties, aroma_profile, sensory_description, sensory_profile
      FROM wines
     WHERE embedding IS NULL
     ORDER BY updated_at DESC
     LIMIT $1
  `, [limit]);

  const updated = [];
  const errors = [];

  for (const row of result.rows) {
    try {
      // Reconstruct camelCase shape for buildWineDocument
      const wine = {
        ...row,
        grapeVarieties: row.grape_varieties,
        aromaProfile: row.aroma_profile,
        sensoryDescription: row.sensory_description,
        sensoryProfile: row.sensory_profile,
      };
      const doc = buildWineDocument(wine);
      const vec = await computeEmbedding(doc);
      await pool.query(`UPDATE wines SET embedding = $1 WHERE id = $2`, [`[${vec.join(',')}]`, row.id]);
      updated.push(row.id);
    } catch (err) {
      errors.push({ id: row.id, error: err.message });
    }
  }

  return { processed: result.rows.length, updated: updated.length, errors };
};

/**
 * Search wines closest to a query (criteria from LLM1 transformed into text).
 */
export const semanticSearch = async (pool, queryText, topN = 8) => {
  let hasColumn = true;
  try {
    await pool.query(`SELECT embedding FROM wines LIMIT 1`);
  } catch {
    hasColumn = false;
  }
  if (!hasColumn) return null;

  const queryVec = await computeEmbedding(queryText);
  const result = await pool.query(`
    SELECT *, embedding <=> $1::vector AS distance
      FROM wines
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2
  `, [`[${queryVec.join(',')}]`, topN]);

  return result.rows;
};
