// Accord mets-vin sur la cave : agent à outils (flag VINOFLOW_SOMMELIER_AGENT +
// Claude configuré) avec repli sur le pipeline. Partagé par POST /sommelier/pair,
// la passerelle MenuFlow (conseil par dîner) et « Une autre idée ».
import { pool } from '../db.js';
import { loadInventory } from '../services/inventory.js';
import { isProviderConfigured } from '../services/aiService.js';
import { runAgentPairing } from './agent.js';
import { runPairing } from './coordinator.js';
import { getTasteProfile } from './tasteProfile.js';

const loadUserFeedback = async (userId) => {
  const fb = await pool.query(`
    SELECT pf.dish, pf.rating, pf.category, w.name || ' ' || COALESCE(w.vintage::text, '') AS wine_label
      FROM pairing_feedback pf
      LEFT JOIN wines w ON w.id = pf.wine_id
     WHERE pf.user_id = $1
     ORDER BY pf.created_at DESC
     LIMIT 30
  `, [userId]);
  return fb.rows;
};

export const pairForDish = async ({ dish, context = {}, userId = null, skipCache = false, exclude = [], inventory: provided } = {}) => {
  const excluded = new Set(exclude);
  const inventory = (provided ?? await loadInventory()).filter((w) => !excluded.has(w.id));
  const userFeedback = userId ? await loadUserFeedback(userId) : [];
  const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;

  // Sommelier en un appel avec outils (flag) — voir sommelier/agent.js.
  // En cas d'échec (pas de clé Claude, erreur API), on retombe sur le pipeline.
  if (process.env.VINOFLOW_SOMMELIER_AGENT === 'true' && isProviderConfigured('claude')) {
    try {
      const inStock = inventory.filter((w) => (w.inventoryCount ?? 0) > 0);
      const agent = await runAgentPairing({ inventory, dish, tasteProfile, userFeedback });
      return {
        criteria: null,
        candidates: agent.candidates,
        picks: agent.picks,
        critique: null,
        fromCache: null,
        cave_size: inStock.length,
        cave_after_filter: null,
        engine: 'agent',
        turns: agent.turns,
      };
    } catch (error) {
      console.warn('Sommelier agent en échec, repli sur le pipeline :', error.message);
    }
  }

  return runPairing({
    pool,
    inventory,
    dish,
    context: context || {},
    userId,
    userFeedback,
    tasteProfile,
    skipCache: Boolean(skipCache) || excluded.size > 0,
  });
};

export const pickInStock = (result, inventoryById) => {
  const p = result?.picks;
  if (!p) return null;
  for (const pick of [p.safe, p.personal, p.creative]) {
    if (pick?.wine_id && (inventoryById.get(pick.wine_id)?.inventoryCount ?? 0) > 0) {
      return { wine_id: pick.wine_id, reason: pick.reason || null };
    }
  }
  return null;
};
