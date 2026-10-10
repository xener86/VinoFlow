import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { loadInventory } from '../services/inventory.js';
import { pairForDish } from '../sommelier/pairForDish.js';
import { suggestDishesForWine, pairMenu, explainPairing } from '../sommelier/coordinator.js';
import { applyFeedback, getTasteProfile, upsertTasteProfile } from '../sommelier/tasteProfile.js';
import { drinkBeforeAlerts, anticipationForEvent, purchaseSuggestions } from '../sommelier/proactive.js';
import { buildVerticalTasting, compareForDish, blindTasting } from '../sommelier/advanced.js';
import { answerQuestion, MAX_MESSAGE_CHARS } from '../sommelier/chat.js';
import { runTurn, listConversations, getConversation, deleteConversation } from '../sommelier/conversations.js';

const router = Router();

// ========== SOMMELIER V2 ENDPOINTS ==========

// Run the full pairing pipeline (LLM1 → rules → score → LLM2)
router.post('/sommelier/pair', async (req, res) => {
  try {
    const { dish, context, skipCache } = req.body;
    if (!dish) return res.status(400).json({ error: 'dish is required' });
    res.json(await pairForDish({ dish, context, userId: req.user?.userId, skipCache }));
  } catch (error) {
    console.error('Sommelier pair error:', error);
    res.status(500).json({ error: 'Failed to compute pairing', details: error.message });
  }
});

// Record user feedback on a sommelier suggestion
router.post('/sommelier/feedback', async (req, res) => {
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
router.post('/sommelier/reverse-pair', async (req, res) => {
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
router.post('/sommelier/menu', async (req, res) => {
  try {
    const { dishes } = req.body;
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
router.post('/sommelier/explain', async (req, res) => {
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

router.get('/sommelier/alerts/drink-before', async (req, res) => {
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

router.post('/sommelier/anticipation', async (req, res) => {
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

router.get('/sommelier/purchase-suggestions', async (req, res) => {
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

router.post('/sommelier/vertical', async (req, res) => {
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

router.post('/sommelier/compare', async (req, res) => {
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

router.get('/sommelier/blind', async (req, res) => {
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
// Discussion avec le sommelier après un accord (sommelier/chat.js,
// sommelier/conversations.js). Conversations propres au compte.
// ────────────────────────────────────────────

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

router.post('/sommelier/chat', async (req, res) => {
  const userId = req.user?.userId;
  const { conversationId, dish, pairing } = req.body || {};
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return res.status(400).json({ error: `Message requis (${MAX_MESSAGE_CHARS} caractères au plus)` });
  }
  if (conversationId && !isUuid(conversationId)) return res.status(404).json({ error: 'Discussion introuvable' });
  if (!conversationId && (!dish || typeof dish !== 'string' || !dish.trim() || !pairing || typeof pairing !== 'object')) {
    return res.status(400).json({ error: 'dish et pairing requis pour une nouvelle discussion' });
  }
  try {
    const inventory = await loadInventory();
    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;
    const result = await runTurn({
      userId, conversationId, dish: String(dish || '').trim().slice(0, 500), pairing, message,
      answer: (ctx) => answerQuestion({ ...ctx, inventory, tasteProfile }),
    });
    if (!result) return res.status(404).json({ error: 'Discussion introuvable' });
    res.json(result);
  } catch (error) {
    console.error('Sommelier chat error:', error);
    res.status(502).json({ error: 'Le sommelier n’a pas pu répondre ; réessayez dans un instant.' });
  }
});

router.get('/sommelier/conversations', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    res.json({ conversations: await listConversations(req.user?.userId, limit) });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

router.get('/sommelier/conversations/:id', async (req, res) => {
  try {
    const conv = isUuid(req.params.id) ? await getConversation(req.user?.userId, req.params.id) : null;
    if (!conv) return res.status(404).json({ error: 'Discussion introuvable' });
    res.json(conv);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

router.delete('/sommelier/conversations/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !(await deleteConversation(req.user?.userId, req.params.id))) {
      return res.status(404).json({ error: 'Discussion introuvable' });
    }
    res.status(204).end();
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Get current user's taste profile
router.get('/sommelier/taste-profile', async (req, res) => {
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

export default router;
