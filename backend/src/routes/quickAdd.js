import { Router } from 'express';
import { withTransaction } from '../db.js';
import { validateBatch, BatchError } from '../quickAdd/validate.js';
import { applyBatch } from '../quickAdd/apply.js';
import { requestEnrichment } from '../enrichment/scheduler.js';

const router = Router();

// ========== AJOUT RAPIDE (rafale) ==========
// Toute la rafale en une transaction ; idempotente par batchId.
router.post('/quick-add', async (req, res) => {
  try {
    const batch = validateBatch(req.body);
    const { result, enrich } = await withTransaction((client) => applyBatch(client, batch, req.user?.userId ?? null));
    for (const wineId of enrich) {
      try {
        requestEnrichment(wineId, 'manual');
      } catch (error) {
        console.error('Quick add enrichment request failed:', error);
      }
    }
    return res.json(result);
  } catch (error) {
    if (error instanceof BatchError) return res.status(400).json({ error: error.message, lines: error.lines });
    console.error('Quick add error:', error);
    return res.status(500).json({ error: 'L’enregistrement de la rafale a échoué ; rien n’a été enregistré.' });
  }
});

export default router;
