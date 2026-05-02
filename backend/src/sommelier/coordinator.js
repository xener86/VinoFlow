// Sommelier v2 coordinator.
// Wires together: cache → LLM1 → hard rules → scoring → LLM2 → cache.

import { extractCriteria } from './llm1.js';
import { buildHardFilter } from './rules.js';
import { rankWines } from './scoring.js';
import { argueAndPick } from './llm2.js';
import {
  computeCaveHash,
  getCriteriaCache,
  setCriteriaCache,
  getResultCache,
  setResultCache,
} from './cache.js';

/**
 * Run the full pairing pipeline.
 *
 * @param {Object} params
 * @param {Object} params.pool       - pg Pool
 * @param {Array}  params.inventory  - all wines in cave (with bottles attached)
 * @param {string} params.dish
 * @param {Object} params.context    - { mood, occasion, season, ...}
 * @param {string} params.userId
 * @param {Array}  params.userFeedback - past feedback for few-shot
 * @param {Object} params.tasteProfile - persistent taste profile
 * @param {boolean} params.skipCache - bypass cache (for forced refresh)
 *
 * @returns {Object} { criteria, candidates, picks, fromCache, breakdown }
 */
export const runPairing = async ({
  pool,
  inventory,
  dish,
  context = {},
  userId,
  userFeedback = [],
  tasteProfile = null,
  skipCache = false,
}) => {
  const caveHash = computeCaveHash(inventory.filter(w => (w.inventoryCount ?? 0) > 0));

  // Level 2 cache: full result for this user
  if (!skipCache && userId) {
    const cached = await getResultCache(pool, dish, caveHash, userId);
    if (cached) {
      return { ...cached, fromCache: 'level2' };
    }
  }

  // Level 1 cache: dish → criteria (shared)
  let criteria = null;
  if (!skipCache) {
    criteria = await getCriteriaCache(pool, dish);
  }
  if (!criteria) {
    criteria = await extractCriteria(dish, context);
    if (!skipCache) {
      await setCriteriaCache(pool, dish, criteria).catch(e => console.warn('Cache write failed:', e));
    }
  }

  // Filter to wines actually in stock
  const inStock = inventory.filter(w => (w.inventoryCount ?? 0) > 0);

  // Hard rules pre-filter
  const hardFilter = buildHardFilter(criteria);
  const passable = inStock.filter(hardFilter);

  // Score and rank
  const ranked = rankWines(passable, criteria, 8);

  // LLM2: argue and pick 3
  const picks = await argueAndPick(dish, criteria, ranked, {
    userFeedback,
    tasteProfile,
  });

  const result = {
    criteria,
    candidates: ranked.map(c => ({
      wine_id: c.wine.id,
      score: c.score,
      breakdown: c.breakdown,
    })),
    picks,
    fromCache: null,
    cave_size: inStock.length,
    cave_after_filter: passable.length,
  };

  // Cache the full result for 24h
  if (userId) {
    await setResultCache(pool, dish, caveHash, userId, result).catch(e => console.warn('Cache write failed:', e));
  }

  return result;
};
