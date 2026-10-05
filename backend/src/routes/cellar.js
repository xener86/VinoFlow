import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { serializeWine } from '../utils/wine.js';
import { loadInventory } from '../services/inventory.js';
import { getSchedulerStatus } from '../enrichment/scheduler.js';
import { enqueueWines } from './enrichment.js';
import { computeBudget } from '../sommelier/budget.js';
import { agingRecommendations, findDuplicates, cellarProjection } from '../sommelier/advanced.js';

const router = Router();

// ────────────────────────────────────────────
// Phase 11 — Wine lifecycle
// ────────────────────────────────────────────

router.get('/wines/aging-recommendations', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const recs = agingRecommendations(inventory);
    res.json({ count: recs.length, recommendations: recs });
  } catch (error) {
    console.error('aging-recommendations error:', error);
    res.status(500).json({ error: 'Failed to compute aging recommendations' });
  }
});

router.get('/wines/duplicates', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const dupes = findDuplicates(inventory);
    res.json({ count: dupes.length, groups: dupes });
  } catch (error) {
    console.error('duplicates error:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

router.get('/cellar/projection', async (req, res) => {
  try {
    const yearsAhead = parseInt(req.query.yearsAhead) || 5;
    const inventory = await loadInventory();
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const result = cellarProjection(inventory, convertKeysToCamelCase(journal), { yearsAhead });
    res.json(result);
  } catch (error) {
    console.error('projection error:', error);
    res.status(500).json({ error: 'Failed to compute projection' });
  }
});

// Fenêtres d'apogée en lot : mises en file pour la cascade de recherche web
// (enrichment/), qui calcule profil et apogée en une passe. Réponse immédiate.
// Body: { onlyMissing: boolean, limit: number, force: boolean }
router.post('/wines/refresh-peaks', async (req, res) => {
  try {
    const { onlyMissing = true, limit = 50, force = false } = req.body || {};
    if (!getSchedulerStatus().engine) return res.status(503).json({ error: 'Aucun moteur d\'enrichissement configuré' });
    const where = (onlyMissing && !force)
      ? "(w.peak_start IS NULL OR w.peak_end IS NULL) AND w.peak_source IS DISTINCT FROM 'USER'"
      : "w.peak_source IS DISTINCT FROM 'USER'";
    const queued = await enqueueWines(where, limit);
    res.status(202).json({ queued, engine: getSchedulerStatus().engine });
  } catch (error) {
    console.error('Refresh peaks error:', error);
    res.status(500).json({ error: 'Failed to queue peak refresh', details: error.message });
  }
});

// Bulk peak update — accepts an array of {wineId, peakStart, peakEnd, reasoning}.
// Designed for Claude (in the chat) to set all wines' peaks at once based on
// its own knowledge, instead of having the backend call an LLM.
// source defaults to 'AI' but caller can pass 'USER' for manual reviews.
router.post('/wines/bulk-set-peaks', async (req, res) => {
  try {
    const { updates, source = 'AI', confidence = 'HIGH' } = req.body || {};
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates must be an array' });
    }
    const userId = req.user?.userId;
    let success = 0;
    const errors = [];
    for (const u of updates) {
      if (!u.wineId || !Number.isInteger(u.peakStart) || !Number.isInteger(u.peakEnd) || u.peakEnd < u.peakStart) {
        errors.push({ wineId: u.wineId, error: 'Invalid payload' });
        continue;
      }
      try {
        const result = await pool.query(`
          UPDATE wines SET
            peak_start = $1, peak_end = $2,
            peak_source = $3, peak_confidence = $4,
            peak_reasoning = $5,
            peak_verified_by = $6,
            peak_computed_at = now(),
            updated_at = now()
          WHERE id = $7
          RETURNING id
        `, [u.peakStart, u.peakEnd, source, u.confidence || confidence, u.reasoning || null, userId || null, u.wineId]);
        if (result.rowCount > 0) success++;
        else errors.push({ wineId: u.wineId, error: 'Wine not found' });
      } catch (err) {
        errors.push({ wineId: u.wineId, error: err.message });
      }
    }
    res.json({ processed: updates.length, success, failed: errors.length, errors });
  } catch (error) {
    console.error('Bulk peaks error:', error);
    res.status(500).json({ error: 'Bulk update failed', details: error.message });
  }
});

// Manual peak override (USER source)
router.put('/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/peak', async (req, res) => {
  try {
    const { id } = req.params;
    const { peakStart, peakEnd, reasoning } = req.body || {};
    if (!Number.isInteger(peakStart) || !Number.isInteger(peakEnd) || peakEnd < peakStart) {
      return res.status(400).json({ error: 'peakStart and peakEnd must be integers with end >= start' });
    }
    const result = await pool.query(`
      UPDATE wines SET
        peak_start = $1,
        peak_end = $2,
        peak_source = 'USER',
        peak_confidence = 'HIGH',
        peak_reasoning = $3,
        peak_computed_at = now(),
        updated_at = now()
      WHERE id = $4
      RETURNING *
    `, [peakStart, peakEnd, reasoning || null, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    res.json(serializeWine(result.rows[0]));
  } catch (error) {
    console.error('Update peak error:', error);
    res.status(500).json({ error: 'Failed to update peak' });
  }
});

// Phase 13.3 — Budget tracking
router.get('/cellar/budget', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const inventory = await loadInventory();
    // Inventory needs bottles attached for budget; fetch them
    const bottlesRes = await pool.query('SELECT * FROM bottles');
    const bottles = convertKeysToCamelCase(bottlesRes.rows);
    const enriched = inventory.map(w => ({ ...w, bottles: bottles.filter(b => b.wineId === w.id) }));
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const result = computeBudget(enriched, convertKeysToCamelCase(journal), { monthsBack: months });
    res.json(result);
  } catch (error) {
    console.error('budget error:', error);
    res.status(500).json({ error: 'Failed to compute budget' });
  }
});

export default router;
