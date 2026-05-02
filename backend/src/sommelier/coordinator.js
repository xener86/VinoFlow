// Sommelier v2 coordinator.
// Wires together: cache → LLM1 → hard rules → scoring → LLM2 → cache.

import { extractCriteria } from './llm1.js';
import { buildHardFilter } from './rules.js';
import { rankWines } from './scoring.js';
import { argueAndPick } from './llm2.js';
import { critiquePicks } from './selfCritic.js';
import { generateText, generateJson } from '../services/aiService.js';
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
  let inStock = inventory.filter(w => (w.inventoryCount ?? 0) > 0);

  // Phase 7.3 — apply user-supplied constraints
  if (context.constraints) {
    inStock = applyConstraints(inStock, context.constraints);
  }

  // Hard rules pre-filter
  const hardFilter = buildHardFilter(criteria);
  const passable = inStock.filter(hardFilter);

  // Score and rank
  const ranked = rankWines(passable, criteria, 8);

  // Phase 7.4 — no-match fallback: too few candidates? short-circuit
  if (ranked.length === 0) {
    return {
      criteria,
      candidates: [],
      picks: {
        safe: null,
        personal: null,
        creative: null,
        global_advice: 'Aucun vin de votre cave ne correspond à ce plat. Pensez à votre wishlist pour combler ce manque.',
      },
      fromCache: null,
      cave_size: inStock.length,
      cave_after_filter: passable.length,
      no_match: true,
    };
  }

  // LLM2: argue and pick 3
  const picks = await argueAndPick(dish, criteria, ranked, {
    userFeedback,
    tasteProfile,
    explainMode: context.explainMode === true,
  });

  // Phase 6.2 — self-critic loop (optional, costly but improves quality)
  let critique = null;
  if (context.selfCritic !== false && process.env.VINOFLOW_SELF_CRITIC !== 'false') {
    critique = await critiquePicks(dish, criteria, picks, ranked);
  }

  const result = {
    criteria,
    candidates: ranked.map(c => ({
      wine_id: c.wine.id,
      score: c.score,
      breakdown: c.breakdown,
    })),
    picks,
    critique,
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

/**
 * Phase 7.3 — Apply user-supplied constraints to the candidate pool.
 *
 * Supported constraints:
 *   { maxPrice: 30, types: ['RED'], regions: ['Bordeaux'], openedOnly: true }
 */
const applyConstraints = (wines, constraints) => {
  return wines.filter(w => {
    if (constraints.types && Array.isArray(constraints.types) && constraints.types.length > 0) {
      if (!constraints.types.includes(w.type)) return false;
    }
    if (constraints.regions && Array.isArray(constraints.regions) && constraints.regions.length > 0) {
      const r = (w.region || '').toLowerCase();
      if (!constraints.regions.some(target => r.includes(String(target).toLowerCase()))) return false;
    }
    if (constraints.maxPrice && Number(constraints.maxPrice) > 0) {
      const prices = (w.bottles || [])
        .map(b => b.purchasePrice ?? b.purchase_price)
        .filter(p => typeof p === 'number');
      const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
      if (avg !== null && avg > constraints.maxPrice) return false;
    }
    return true;
  });
};

/**
 * Phase 7.1 — Reverse pairing: given a wine, suggest dishes.
 */
export const suggestDishesForWine = async (wine) => {
  const SYSTEM = `Tu es un sommelier. À partir d'un vin précis, suggère 5 plats qui s'accorderont magnifiquement avec, en variant les types (entrée, plat, dessert, fromage, casual). Pour chaque plat, explique en 1 phrase pourquoi.

Réponds en JSON pur:
{
  "suggestions": [
    { "dish": "...", "type": "entrée|plat|dessert|fromage|casual", "reason": "..." }
  ],
  "global_advice": "Conseil sur le service du vin"
}`;
  const user = `Vin: ${wine.producer || ''} ${wine.name || ''} ${wine.cuvee || ''} ${wine.vintage || ''}\nType: ${wine.type}\nRégion: ${wine.region || '?'}\nArômes: ${(wine.aromaProfile || []).join(', ') || '?'}\nProfil: corps ${wine.sensoryProfile?.body ?? '?'}, acidité ${wine.sensoryProfile?.acidity ?? '?'}, tanin ${wine.sensoryProfile?.tannin ?? '?'}`;
  return generateJson('argue', { system: SYSTEM, user });
};

/**
 * Phase 7.2 — Multi-course menu pairing.
 * Takes an array of dishes and pairs each, considering progression coherence.
 */
export const pairMenu = async ({ pool, inventory, dishes, userId, userFeedback, tasteProfile }) => {
  if (!Array.isArray(dishes) || dishes.length === 0) {
    throw new Error('dishes must be a non-empty array');
  }
  const courses = [];
  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i];
    // Reduce inventory: a wine already used in a previous course is less likely
    const usedIds = new Set(courses.flatMap(c => [c.picks.safe?.wine_id, c.picks.personal?.wine_id, c.picks.creative?.wine_id].filter(Boolean)));
    const adjustedInventory = inventory.map(w => usedIds.has(w.id) ? { ...w, _alreadyUsed: true } : w);
    const courseResult = await runPairing({
      pool, inventory: adjustedInventory, dish, context: { courseIndex: i, totalCourses: dishes.length },
      userId, userFeedback, tasteProfile, skipCache: true,
    });
    courses.push({ dish, ...courseResult });
  }
  return { courses };
};

/**
 * Phase 13.1 — Mode "explique-moi" : génère une explication pédagogique
 * pour l'accord (mécanisme, contraste, complémentarité).
 */
export const explainPairing = async (dish, wine, criteria) => {
  const SYSTEM = `Tu es un sommelier pédagogue. Explique en 3-4 paragraphes courts pourquoi ce vin va avec ce plat. Aborde:
1. Le mécanisme principal (contraste, complémentarité, pont aromatique, accord territorial...)
2. Les axes spécifiques qui s'alignent (acidité du vin / gras du plat, etc.)
3. Les pièges évités (pourquoi pas autre chose)
4. Conseil pratique de service

Texte clair en français, pas de jargon obscur, ton chaleureux.`;
  const user = `Plat: ${dish}\n\nVin: ${wine.producer || ''} ${wine.name || ''} ${wine.cuvee || ''} ${wine.vintage || ''} (${wine.type}, ${wine.region || '?'})\n\nProfil idéal extrait du plat: ${JSON.stringify(criteria?.wine_profile || {})}`;
  return generateText('argue', { system: SYSTEM, user });
};
