import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { serializeWine } from '../utils/wine.js';
import { isProviderConfigured, getTaskDefaults } from '../services/aiService.js';
import { aromasFromTastingNotes } from '../sommelier/enrich.js';
import { getSchedulerStatus } from '../enrichment/scheduler.js';
import { enqueueWines } from './enrichment.js';
import { extractFromLabel } from '../sommelier/ocr.js';
import { updateMissingEmbeddings } from '../sommelier/embeddings.js';

const router = Router();

// Phase 5 — pgvector embeddings management
// Body: { limit?: number, all?: boolean } — all: recalcul complet (changement de modèle).
router.post('/wines/refresh-embeddings', async (req, res) => {
  try {
    const all = req.body?.all === true;
    const limit = parseInt(req.body?.limit) || (all ? 10000 : 100);
    const result = await updateMissingEmbeddings(pool, { limit, all });
    res.json(result);
  } catch (error) {
    console.error('refresh-embeddings error:', error);
    res.status(500).json({ error: 'Failed to refresh embeddings', details: error.message });
  }
});

// Phase 6.1 — OCR: extract wine info from a label image
// Body: { image: "base64...", mimeType: "image/jpeg" }
router.post('/wines/extract-from-image', async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) required' });
    const extracted = await extractFromLabel(image, mimeType || 'image/jpeg');
    res.json(extracted);
  } catch (error) {
    console.error('OCR error:', error);
    res.status(500).json({ error: 'Failed to extract from image', details: error.message });
  }
});

// Coût et volume des appels IA (table ai_calls), par tâche et par modèle.
router.get('/ai/usage', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const { rows } = await pool.query(
      `SELECT task, provider, model,
              count(*)::int AS calls,
              count(*) FILTER (WHERE NOT ok)::int AS failures,
              coalesce(sum(input_tokens), 0)::int AS input_tokens,
              coalesce(sum(output_tokens), 0)::int AS output_tokens,
              coalesce(sum(cache_read_tokens), 0)::int AS cache_read_tokens,
              coalesce(sum(web_searches), 0)::int AS web_searches,
              round(avg(latency_ms))::int AS avg_latency_ms,
              coalesce(sum(cost_usd), 0)::float AS cost_usd
         FROM ai_calls
        WHERE created_at > now() - make_interval(days => $1)
        GROUP BY task, provider, model
        ORDER BY cost_usd DESC`,
      [days]
    );
    const total = rows.reduce((s, r) => s + r.cost_usd, 0);
    res.json({ days, total_cost_usd: Math.round(total * 10000) / 10000, by_task: rows });
  } catch (error) {
    console.error('ai usage error:', error);
    res.status(500).json({ error: 'Failed to compute AI usage' });
  }
});

// Discover which AI providers are configured (used by frontend Settings)
router.get('/ai/providers', async (req, res) => {
  res.json({
    providers: {
      gemini: isProviderConfigured('gemini'),
      claude: isProviderConfigured('claude'),
    },
    defaults: getTaskDefaults(),
  });
});

// Lot d'enrichissement (profil aromatique + apogée) des vins sans profil :
// mis en file pour la cascade de recherche web (enrichment/), réponse immédiate.
// Body: { onlyMissing: boolean, limit: number }
router.post('/wines/enrich-aromas', async (req, res) => {
  try {
    const { onlyMissing = true, limit = 50 } = req.body || {};
    if (!getSchedulerStatus().engine) return res.status(503).json({ error: 'Aucun moteur d\'enrichissement configuré' });
    const where = onlyMissing ? "(w.aroma_profile IS NULL OR cardinality(w.aroma_profile) < 3) AND w.aroma_source IS DISTINCT FROM 'USER'" : 'true';
    const queued = await enqueueWines(where, limit);
    res.status(202).json({ queued, engine: getSchedulerStatus().engine });
  } catch (error) {
    console.error('Enrich aromas error:', error);
    res.status(500).json({ error: 'Failed to queue enrichment', details: error.message });
  }
});

// Phase 3.4 - Audit dashboard: vins suspects (profils faibles ou vides)
router.get('/wines/audit', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, name, producer, vintage, region, type,
        aroma_profile, aroma_source, aroma_confidence, aroma_verified_at, updated_at
      FROM wines
      WHERE
        aroma_profile IS NULL
        OR array_length(aroma_profile, 1) IS NULL
        OR array_length(aroma_profile, 1) < 3
        OR aroma_source IS NULL
        OR (aroma_source = 'AI' AND aroma_confidence = 'LOW')
        OR (aroma_source = 'AI' AND updated_at < now() - interval '12 months')
      ORDER BY
        CASE WHEN aroma_profile IS NULL THEN 0 ELSE 1 END,
        CASE WHEN aroma_confidence = 'LOW' THEN 0 WHEN aroma_confidence = 'MEDIUM' THEN 1 ELSE 2 END,
        updated_at ASC
      LIMIT 100
    `);
    res.json({
      count: result.rowCount,
      wines: convertKeysToCamelCase(result.rows),
    });
  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: 'Failed to run audit' });
  }
});

// Phase 3.3 - Re-derive aroma profile from tasting notes (closes the loop)
router.post('/wines/:id/refresh-from-tastings', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const notesRes = await pool.query('SELECT * FROM tasting_notes WHERE wine_id = $1 ORDER BY date DESC', [id]);
    const aromas = aromasFromTastingNotes(convertKeysToCamelCase(notesRes.rows));
    if (aromas.length < 3) {
      return res.status(400).json({ error: 'Not enough aromas in tasting notes (need ≥3)', found: aromas.length });
    }
    const result = await pool.query(`
      UPDATE wines SET
        aroma_profile = $1,
        aroma_source = 'TASTING',
        aroma_confidence = 'HIGH',
        aroma_verified_at = now(),
        aroma_verified_by = $2,
        updated_at = now()
      WHERE id = $3
      RETURNING *
    `, [aromas, userId || null, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json({ wine: serializeWine(result.rows[0]), aromas });
  } catch (error) {
    console.error('Refresh-from-tastings error:', error);
    res.status(500).json({ error: 'Failed to refresh from tastings' });
  }
});

// Update aroma profile manually (Phase 1.4 - validation UI)
router.put('/wines/:id/aroma-profile', async (req, res) => {
  try {
    const { id } = req.params;
    const { aromaProfile, source, confidence } = req.body;
    if (!Array.isArray(aromaProfile)) {
      return res.status(400).json({ error: 'aromaProfile must be an array' });
    }
    const userId = req.user?.userId;
    const result = await pool.query(`
      UPDATE wines SET
        aroma_profile = $1,
        aroma_source = $2,
        aroma_confidence = $3,
        aroma_verified_at = now(),
        aroma_verified_by = $4,
        updated_at = now()
      WHERE id = $5
      RETURNING *
    `, [
      aromaProfile,
      source || 'USER',
      confidence || 'HIGH',
      userId || null,
      id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json(serializeWine(result.rows[0]));
  } catch (error) {
    console.error('Update aroma-profile error:', error);
    res.status(500).json({ error: 'Failed to update aroma profile' });
  }
});

export default router;
