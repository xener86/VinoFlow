import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { isProviderConfigured, getTaskDefaults } from '../services/aiService.js';
import { enrichWine, aromasFromTastingNotes } from '../sommelier/enrich.js';
import { extractFromLabel } from '../sommelier/ocr.js';
import { updateMissingEmbeddings } from '../sommelier/embeddings.js';

const router = Router();

// Phase 5 — pgvector embeddings management
router.post('/wines/refresh-embeddings', async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit) || 100;
    const result = await updateMissingEmbeddings(pool, { limit });
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

// Phase 3.1 - Enrich aromas in batch (vins sans profil)
// Body: { onlyMissing: boolean, useConsensus: boolean, limit: number }
router.post('/wines/enrich-aromas', async (req, res) => {
  try {
    const { onlyMissing = true, useConsensus = false, limit = 50 } = req.body || {};
    const userId = req.user?.userId;

    const filter = onlyMissing
      ? `WHERE aroma_profile IS NULL OR array_length(aroma_profile, 1) IS NULL OR array_length(aroma_profile, 1) < 3 OR aroma_source IS NULL`
      : '';
    const result = await pool.query(`SELECT * FROM wines ${filter} ORDER BY created_at DESC LIMIT $1`, [limit]);
    const wines = convertKeysToCamelCase(result.rows);

    const enriched = [];
    const failed = [];

    for (const wine of wines) {
      try {
        const profile = await enrichWine(wine, { useConsensus });
        await pool.query(`
          UPDATE wines SET
            aroma_profile = $1,
            aroma_source = $2,
            aroma_confidence = $3,
            aroma_provider = $4,
            aroma_verified_at = CASE WHEN $2 = 'CONSENSUS' THEN now() ELSE aroma_verified_at END,
            updated_at = now()
          WHERE id = $5
        `, [
          profile.aromas,
          profile.source,
          profile.confidence,
          (profile.providers || []).join(',') || 'gemini',
          wine.id,
        ]);
        enriched.push({ id: wine.id, name: wine.name, aromas: profile.aromas, confidence: profile.confidence });
      } catch (err) {
        console.error(`Enrich failed for ${wine.id}:`, err.message);
        failed.push({ id: wine.id, name: wine.name, error: err.message });
      }
    }

    res.json({
      processed: wines.length,
      enriched: enriched.length,
      failed: failed.length,
      results: enriched,
      errors: failed,
    });
  } catch (error) {
    console.error('Batch enrich error:', error);
    res.status(500).json({ error: 'Failed to enrich aromas', details: error.message });
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
    res.json({ wine: convertKeysToCamelCase(result.rows[0]), aromas });
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
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Update aroma-profile error:', error);
    res.status(500).json({ error: 'Failed to update aroma profile' });
  }
});

export default router;
