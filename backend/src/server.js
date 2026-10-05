import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import { ALLOW_CLIENT_AI_KEYS, FRONTEND_URL } from './config.js';
import { pool } from './db.js';
import { convertKeysToCamelCase } from './utils/case.js';
import { loadInventory } from './services/inventory.js';
import { authenticate } from './middleware/auth.js';
import { aiLimiter } from './middleware/rateLimits.js';
import { runPairing, suggestDishesForWine, pairMenu, explainPairing } from './sommelier/coordinator.js';
import { applyFeedback, getTasteProfile, upsertTasteProfile } from './sommelier/tasteProfile.js';
import { isProviderConfigured, getTaskDefaults, runWithRequestKeys } from './services/aiService.js';
import { enrichWine, aromasFromTastingNotes } from './sommelier/enrich.js';
import { computePeak } from './sommelier/peakCalculator.js';
import { extractFromLabel } from './sommelier/ocr.js';
import { computeBudget } from './sommelier/budget.js';
import { updateMissingEmbeddings } from './sommelier/embeddings.js';
import { extractCriteria } from './sommelier/llm1.js';
import { setCriteriaCache } from './sommelier/cache.js';
import {
  drinkBeforeAlerts,
  anticipationForEvent,
  purchaseSuggestions,
} from './sommelier/proactive.js';
import {
  buildVerticalTasting,
  compareForDish,
  blindTasting,
  agingRecommendations,
  findDuplicates,
  cellarProjection,
} from './sommelier/advanced.js';
import authRouter from './routes/auth.js';
import winesRouter from './routes/wines.js';
import bottlesRouter from './routes/bottles.js';
import racksRouter from './routes/racks.js';
import spiritsRouter from './routes/spirits.js';
import tastingsRouter from './routes/tastings.js';
import historyRouter from './routes/history.js';
import wishlistRouter from './routes/wishlist.js';

const app = express();
const port = process.env.PORT || 3100;

// nginx (frontend container) sits in front of the backend: trust exactly one
// hop so req.ip is the real client IP (rate limiting). Set TRUST_PROXY=2 if
// another reverse proxy (Traefik, Caddy…) sits in front of nginx.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
// HSTS : à poser sur le reverse proxy TLS (le backend ne voit que du HTTP).
app.use(helmet({ strictTransportSecurity: false }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', authRouter);

// ========== Protected routes (require JWT) ==========
// All /api/* routes below this point require a valid JWT token.
app.use('/api', authenticate);

// Coûteuses en appels IA → limitées par utilisateur.
app.use(
  [
    '/api/sommelier',
    '/api/wines/enrich-aromas',
    '/api/wines/refresh-peaks',
    '/api/wines/bulk-set-peaks',
    '/api/wines/extract-from-image',
    '/api/wines/refresh-embeddings',
  ],
  aiLimiter
);

// ========== AI keys per-request middleware ==========
// Frontend can send the user's Settings keys via headers, so the backend can
// use them when env vars are not set (env vars always win). AsyncLocalStorage
// propagates them through the entire request chain without changing function
// signatures. Risque : ces clés vivent dans le localStorage du navigateur
// (exposées à toute XSS) et transitent à chaque requête — préférer les
// variables d'environnement, et ALLOW_CLIENT_AI_KEYS=false pour les refuser.
app.use('/api', (req, res, next) => {
  const keys = ALLOW_CLIENT_AI_KEYS
    ? {
        gemini: req.headers['x-vinoflow-gemini-key'] || null,
        claude: req.headers['x-vinoflow-claude-key'] || null,
      }
    : {};
  runWithRequestKeys(keys, () => next());
});

app.use('/api', winesRouter);

app.use('/api', bottlesRouter);

app.use('/api', racksRouter);

app.use('/api', spiritsRouter);

app.use('/api', tastingsRouter);

app.use('/api', historyRouter);

app.use('/api', wishlistRouter);

// ========== SOMMELIER V2 ENDPOINTS ==========

// Run the full pairing pipeline (LLM1 → rules → score → LLM2)
app.post('/api/sommelier/pair', async (req, res) => {
  try {
    const { dish, context, skipCache } = req.body;
    if (!dish) return res.status(400).json({ error: 'dish is required' });

    const inventory = await loadInventory();
    const userId = req.user?.userId;

    // Load few-shot from feedback (limited to recent 30 entries)
    let userFeedback = [];
    if (userId) {
      const fb = await pool.query(`
        SELECT pf.dish, pf.rating, pf.category, w.name || ' ' || COALESCE(w.vintage::text, '') AS wine_label
          FROM pairing_feedback pf
          LEFT JOIN wines w ON w.id = pf.wine_id
         WHERE pf.user_id = $1
         ORDER BY pf.created_at DESC
         LIMIT 30
      `, [userId]);
      userFeedback = fb.rows;
    }

    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;

    const result = await runPairing({
      pool,
      inventory,
      dish,
      context: context || {},
      userId,
      userFeedback,
      tasteProfile,
      skipCache: Boolean(skipCache),
    });

    res.json(result);
  } catch (error) {
    console.error('Sommelier pair error:', error);
    res.status(500).json({ error: 'Failed to compute pairing', details: error.message });
  }
});

// Record user feedback on a sommelier suggestion
app.post('/api/sommelier/feedback', async (req, res) => {
  try {
    const { wineId, dish, rating, category, criteria, context } = req.body;
    if (!dish || !rating || !['UP', 'DOWN'].includes(rating)) {
      return res.status(400).json({ error: 'dish and rating (UP|DOWN) are required' });
    }

    const userId = req.user?.userId;
    await pool.query(`
      INSERT INTO pairing_feedback (user_id, wine_id, dish, rating, category, criteria_json, context_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, wineId || null, dish, rating, category || null, criteria || null, context || null]);

    // Update taste profile (Phase 2.10)
    if (userId && wineId) {
      const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
      if (wineRes.rows.length > 0) {
        const wine = convertKeysToCamelCase(wineRes.rows[0]);
        const current = await getTasteProfile(pool, userId);
        const next = applyFeedback(current, wine, rating);
        await upsertTasteProfile(pool, userId, next);
      }
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Sommelier feedback error:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

// Phase 7.1 — Reverse pairing: vin → plats
app.post('/api/sommelier/reverse-pair', async (req, res) => {
  try {
    const { wineId } = req.body;
    if (!wineId) return res.status(400).json({ error: 'wineId required' });
    const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
    if (wineRes.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(wineRes.rows[0]);
    const result = await suggestDishesForWine(wine);
    res.json(result);
  } catch (error) {
    console.error('Reverse pair error:', error);
    res.status(500).json({ error: 'Failed to compute reverse pairing' });
  }
});

// Phase 7.2 — Multi-course menu pairing
app.post('/api/sommelier/menu', async (req, res) => {
  try {
    const { dishes, context } = req.body;
    if (!Array.isArray(dishes) || dishes.length === 0) {
      return res.status(400).json({ error: 'dishes must be a non-empty array' });
    }
    const userId = req.user?.userId;
    const inventory = await loadInventory();
    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;
    const result = await pairMenu({ pool, inventory, dishes, userId, userFeedback: [], tasteProfile });
    res.json(result);
  } catch (error) {
    console.error('Menu pair error:', error);
    res.status(500).json({ error: 'Failed to pair menu' });
  }
});

// Phase 13.1 — Mode "explique-moi" pour un accord
app.post('/api/sommelier/explain', async (req, res) => {
  try {
    const { dish, wineId, criteria } = req.body;
    if (!dish || !wineId) return res.status(400).json({ error: 'dish and wineId required' });
    const wineRes = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
    if (wineRes.rows.length === 0) return res.status(404).json({ error: 'Wine not found' });
    const wine = convertKeysToCamelCase(wineRes.rows[0]);
    const explanation = await explainPairing(dish, wine, criteria);
    res.json({ explanation });
  } catch (error) {
    console.error('Explain pairing error:', error);
    res.status(500).json({ error: 'Failed to explain pairing' });
  }
});

// ────────────────────────────────────────────
// Phase 8 — Proactive features
// ────────────────────────────────────────────

app.get('/api/sommelier/alerts/drink-before', async (req, res) => {
  try {
    const horizon = parseInt(req.query.horizonMonths) || 12;
    const inventory = await loadInventory();
    const alerts = drinkBeforeAlerts(inventory, { horizonMonths: horizon });
    res.json({ count: alerts.length, alerts });
  } catch (error) {
    console.error('drink-before error:', error);
    res.status(500).json({ error: 'Failed to compute alerts' });
  }
});

app.post('/api/sommelier/anticipation', async (req, res) => {
  try {
    const { eventDate, limit } = req.body;
    if (!eventDate) return res.status(400).json({ error: 'eventDate required' });
    const inventory = await loadInventory();
    const result = anticipationForEvent(inventory, eventDate, { limit: limit ?? 5 });
    res.json({ event: eventDate, count: result.length, suggestions: result });
  } catch (error) {
    console.error('anticipation error:', error);
    res.status(500).json({ error: 'Failed to compute anticipation' });
  }
});

app.get('/api/sommelier/purchase-suggestions', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const journal = (await pool.query('SELECT * FROM journal ORDER BY date DESC LIMIT 500')).rows;
    const suggestions = purchaseSuggestions(inventory, convertKeysToCamelCase(journal));
    res.json({ count: suggestions.length, suggestions });
  } catch (error) {
    console.error('purchase-suggestions error:', error);
    res.status(500).json({ error: 'Failed to compute purchase suggestions' });
  }
});

// ────────────────────────────────────────────
// Phase 10 — Advanced pairing modes
// ────────────────────────────────────────────

app.post('/api/sommelier/vertical', async (req, res) => {
  try {
    const { producer } = req.body;
    if (!producer) return res.status(400).json({ error: 'producer required' });
    const inventory = await loadInventory();
    const result = buildVerticalTasting(inventory, producer);
    res.json(result);
  } catch (error) {
    console.error('vertical error:', error);
    res.status(500).json({ error: 'Failed to build vertical' });
  }
});

app.post('/api/sommelier/compare', async (req, res) => {
  try {
    const { dish, wineAId, wineBId } = req.body;
    if (!dish || !wineAId || !wineBId) {
      return res.status(400).json({ error: 'dish, wineAId, wineBId required' });
    }
    const r = await pool.query('SELECT * FROM wines WHERE id = ANY($1)', [[wineAId, wineBId]]);
    if (r.rows.length !== 2) return res.status(404).json({ error: 'Wines not found' });
    const wineA = convertKeysToCamelCase(r.rows.find(w => w.id === wineAId));
    const wineB = convertKeysToCamelCase(r.rows.find(w => w.id === wineBId));
    const result = await compareForDish(dish, wineA, wineB);
    res.json(result);
  } catch (error) {
    console.error('compare error:', error);
    res.status(500).json({ error: 'Failed to compare wines' });
  }
});

app.get('/api/sommelier/blind', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const result = blindTasting(inventory);
    if (!result) return res.status(404).json({ error: 'No wine in cave' });
    res.json(result);
  } catch (error) {
    console.error('blind error:', error);
    res.status(500).json({ error: 'Failed to start blind tasting' });
  }
});

// ────────────────────────────────────────────
// Phase 11 — Wine lifecycle
// ────────────────────────────────────────────

app.get('/api/wines/aging-recommendations', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const recs = agingRecommendations(inventory);
    res.json({ count: recs.length, recommendations: recs });
  } catch (error) {
    console.error('aging-recommendations error:', error);
    res.status(500).json({ error: 'Failed to compute aging recommendations' });
  }
});

app.get('/api/wines/duplicates', async (req, res) => {
  try {
    const inventory = await loadInventory();
    const dupes = findDuplicates(inventory);
    res.json({ count: dupes.length, groups: dupes });
  } catch (error) {
    console.error('duplicates error:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

app.get('/api/cellar/projection', async (req, res) => {
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

// Phase per-wine peak — compute drinking peak windows in batch
// Body: { onlyMissing: boolean, limit: number, force: boolean }
app.post('/api/wines/refresh-peaks', async (req, res) => {
  try {
    const { onlyMissing = true, limit = 50, force = false } = req.body || {};
    const userId = req.user?.userId;

    const filter = (onlyMissing && !force) ? `WHERE peak_start IS NULL OR peak_end IS NULL` : '';
    const result = await pool.query(`SELECT * FROM wines ${filter} ORDER BY created_at DESC LIMIT $1`, [limit]);
    const wines = convertKeysToCamelCase(result.rows);

    const updated = [];
    const failed = [];

    for (const wine of wines) {
      try {
        const peak = await computePeak(wine);
        if (!peak) continue;
        await pool.query(`
          UPDATE wines SET
            peak_start = $1,
            peak_end = $2,
            peak_source = 'AI',
            peak_confidence = $3,
            peak_reasoning = $4,
            peak_computed_at = now(),
            updated_at = now()
          WHERE id = $5
        `, [peak.peakStart, peak.peakEnd, peak.confidence, peak.reasoning, wine.id]);
        updated.push({
          id: wine.id,
          name: wine.name,
          vintage: wine.vintage,
          peak_start: peak.peakStart,
          peak_end: peak.peakEnd,
          confidence: peak.confidence,
        });
      } catch (err) {
        console.error(`Peak failed for ${wine.id}:`, err.message);
        failed.push({ id: wine.id, name: wine.name, error: err.message });
      }
    }

    res.json({
      processed: wines.length,
      updated: updated.length,
      failed: failed.length,
      results: updated,
      errors: failed,
    });
  } catch (error) {
    console.error('Refresh peaks error:', error);
    res.status(500).json({ error: 'Failed to refresh peaks', details: error.message });
  }
});

// Bulk peak update — accepts an array of {wineId, peakStart, peakEnd, reasoning}.
// Designed for Claude (in the chat) to set all wines' peaks at once based on
// its own knowledge, instead of having the backend call an LLM.
// source defaults to 'AI' but caller can pass 'USER' for manual reviews.
app.post('/api/wines/bulk-set-peaks', async (req, res) => {
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
app.put('/api/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/peak', async (req, res) => {
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
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Update peak error:', error);
    res.status(500).json({ error: 'Failed to update peak' });
  }
});

// Phase 13.3 — Budget tracking
app.get('/api/cellar/budget', async (req, res) => {
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

// Phase 5 — pgvector embeddings management
app.post('/api/wines/refresh-embeddings', async (req, res) => {
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
app.post('/api/wines/extract-from-image', async (req, res) => {
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

// Get current user's taste profile
app.get('/api/sommelier/taste-profile', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const profile = await getTasteProfile(pool, userId);
    res.json(profile || null);
  } catch (error) {
    console.error('Get taste-profile error:', error);
    res.status(500).json({ error: 'Failed to fetch taste profile' });
  }
});

// Discover which AI providers are configured (used by frontend Settings)
app.get('/api/ai/providers', async (req, res) => {
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
app.post('/api/wines/enrich-aromas', async (req, res) => {
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
app.get('/api/wines/audit', async (req, res) => {
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
app.post('/api/wines/:id/refresh-from-tastings', async (req, res) => {
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
app.put('/api/wines/:id/aroma-profile', async (req, res) => {
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

// Phase 4.4 — Pre-warming common dishes at startup.
// Pre-computes LLM1 criteria for the 50 most common dishes so the very first
// pairing request is fast.
const COMMON_DISHES = [
  'poulet rôti', 'saumon grillé', 'sushis', 'fromage de chèvre', 'fromage à pâte dure',
  'magret de canard', 'côte de bœuf', 'agneau de pré-salé', 'cassoulet', 'choucroute',
  'bouillabaisse', 'risotto aux champignons', 'pâtes carbonara', 'pizza margherita', 'fondue savoyarde',
  'raclette', 'plateau de charcuterie', 'huîtres', 'tartare de bœuf', 'curry de poulet',
  'bo bun', 'pad thaï', 'paella', 'tagine d\'agneau', 'couscous',
  'tajine de poisson', 'apéritif léger', 'apéritif charcuterie', 'foie gras', 'comté',
  'roquefort', 'tarte au citron', 'tarte tatin', 'fondant chocolat', 'crème brûlée',
  'salade de chèvre chaud', 'pissaladière', 'quiche lorraine', 'blanquette de veau', 'navarin d\'agneau',
  'pintade rôtie', 'lapin moutarde', 'gigot d\'agneau', 'magret au miel', 'truite aux amandes',
  'lotte au safran', 'cabillaud beurre blanc', 'sole meunière', 'noix de saint-jacques', 'risotto truffe',
];

const prewarmCommonDishes = async () => {
  if (process.env.VINOFLOW_PREWARM !== 'true') return;
  console.log('🔥 Pre-warming pairing cache for common dishes...');
  let warmed = 0;
  for (const dish of COMMON_DISHES) {
    try {
      const criteria = await extractCriteria(dish, {});
      await setCriteriaCache(pool, dish, criteria);
      warmed++;
    } catch (e) {
      // Skip silently — likely no API key
    }
    // Avoid hammering the API
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`🔥 Pre-warmed ${warmed}/${COMMON_DISHES.length} dishes`);
};

// Start server
app.listen(port, () => {
  console.log(`🍷 VinoFlow Backend running on port ${port}`);
  // Run pre-warming in background after server is up
  setTimeout(() => { prewarmCommonDishes().catch(() => {}); }, 5000);
});
