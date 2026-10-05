import { Router } from 'express';
import { pool } from '../db.js';
import { requestEnrichment, getSchedulerStatus } from '../enrichment/scheduler.js';
import { revertEnrichment } from '../enrichment/service.js';
import { LEVEL_LABELS } from '../enrichment/levels.js';

const router = Router();

// ========== ENRICHISSEMENT (cascade de recherche web sourcée) ==========

const UUID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

/**
 * Met en file les vins correspondant au filtre SQL (sur l'alias w).
 * Réponse immédiate : l'enrichissement prend 1 à 3 minutes par vin.
 */
export const enqueueWines = async (whereSql, limit) => {
  const { rows } = await pool.query(
    `SELECT w.id FROM wines w WHERE ${whereSql} ORDER BY w.enriched_at NULLS FIRST, w.created_at DESC LIMIT $1`,
    [Math.min(Math.max(parseInt(limit) || 50, 1), 500)]
  );
  rows.forEach((r) => requestEnrichment(r.id, 'manual'));
  return rows.length;
};

router.get('/enrichment/status', async (req, res) => {
  try {
    const counts = (await pool.query(`
      SELECT
        count(*) FILTER (WHERE enrichment_basis IS NULL)::int AS never,
        count(*) FILTER (WHERE enrichment_status = 'needs_review')::int AS needs_review,
        count(*) FILTER (WHERE enrichment_status = 'error')::int AS errors,
        count(*) FILTER (WHERE enrichment_next_check_at <= now())::int AS due
      FROM wines`)).rows[0];
    const byBasis = (await pool.query(
      `SELECT coalesce(enrichment_basis, 'NONE') AS basis, count(*)::int AS n FROM wines GROUP BY 1`
    )).rows;
    res.json({ ...getSchedulerStatus(), counts, byBasis, levels: LEVEL_LABELS });
  } catch (error) {
    console.error('enrichment status error:', error);
    res.status(500).json({ error: 'Failed to read enrichment status' });
  }
});

// Lot : { scope: 'missing' | 'weak' | 'all', limit }
router.post('/enrichment/run', async (req, res) => {
  const { scope = 'missing', limit = 50 } = req.body || {};
  const filters = {
    missing: 'w.enrichment_basis IS NULL',
    weak: "w.enrichment_basis IN ('APPELLATION', 'REGLES') OR w.enrichment_basis IS NULL",
    all: 'true',
  };
  if (!filters[scope]) return res.status(400).json({ error: 'scope must be missing, weak or all' });
  if (!getSchedulerStatus().engine) return res.status(503).json({ error: 'Aucun moteur d\'enrichissement configuré' });
  try {
    const queued = await enqueueWines(filters[scope], limit);
    res.status(202).json({ queued, engine: getSchedulerStatus().engine });
  } catch (error) {
    console.error('enrichment run error:', error);
    res.status(500).json({ error: 'Failed to queue enrichment' });
  }
});

router.post(`/wines/:id${UUID}/enrich`, async (req, res) => {
  if (!getSchedulerStatus().engine) return res.status(503).json({ error: 'Aucun moteur d\'enrichissement configuré' });
  const { rows } = await pool.query('SELECT id FROM wines WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
  res.status(202).json(requestEnrichment(req.params.id, 'manual'));
});

router.get(`/wines/:id${UUID}/enrichment`, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT enrichment_basis, enrichment_sources, enriched_at, enrichment_next_check_at, enrichment_status,
              enrichment_candidates, enrichment_hint, enrichment_error
         FROM wines WHERE id = $1`, [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const log = (await pool.query(
      `SELECT id, created_at, engine, trigger, ok, basis, changes, error, reverted_at
         FROM enrichment_log WHERE wine_id = $1 ORDER BY created_at DESC LIMIT 10`, [req.params.id]
    )).rows;
    const w = rows[0];
    const status = getSchedulerStatus();
    res.json({
      basis: w.enrichment_basis,
      basisLabel: w.enrichment_basis ? LEVEL_LABELS[w.enrichment_basis] : null,
      sources: w.enrichment_sources || [],
      enrichedAt: w.enriched_at,
      nextCheckAt: w.enrichment_next_check_at,
      status: w.enrichment_status,
      candidates: w.enrichment_candidates || [],
      hint: w.enrichment_hint,
      error: w.enrichment_error,
      inProgress: status.running?.wineId === req.params.id,
      queuePosition: status.queue.findIndex((j) => j.wineId === req.params.id) + 1 || null,
      log,
    });
  } catch (error) {
    console.error('enrichment read error:', error);
    res.status(500).json({ error: 'Failed to read enrichment' });
  }
});

// Départage des homonymes : { candidateIndex } ou { hint: "texte libre" }
router.post(`/wines/:id${UUID}/enrichment/choose`, async (req, res) => {
  try {
    const { candidateIndex, hint } = req.body || {};
    const { rows } = await pool.query('SELECT enrichment_candidates FROM wines WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    let text = typeof hint === 'string' ? hint.trim() : '';
    if (!text && Number.isInteger(candidateIndex)) {
      const c = (rows[0].enrichment_candidates || [])[candidateIndex];
      if (!c) return res.status(400).json({ error: 'Unknown candidate' });
      text = [c.producer, c.cuvee, c.location, c.url].filter(Boolean).join(' — ');
    }
    if (!text) return res.status(400).json({ error: 'candidateIndex or hint required' });
    await pool.query(
      `UPDATE wines SET enrichment_hint = $1, enrichment_status = NULL, enrichment_candidates = NULL,
         enrichment_next_check_at = now() WHERE id = $2`, [text.slice(0, 500), req.params.id]
    );
    res.status(202).json({ hint: text, ...(getSchedulerStatus().engine ? requestEnrichment(req.params.id, 'manual') : { queued: false }) });
  } catch (error) {
    console.error('enrichment choose error:', error);
    res.status(500).json({ error: 'Failed to record choice' });
  }
});

router.post(`/wines/:id${UUID}/enrichment/revert/:logId(\\d+)`, async (req, res) => {
  try {
    const result = await revertEnrichment(req.params.id, Number(req.params.logId));
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    console.error('enrichment revert error:', error);
    res.status(500).json({ error: 'Failed to revert enrichment' });
  }
});

export default router;
