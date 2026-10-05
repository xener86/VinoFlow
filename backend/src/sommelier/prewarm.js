import { pool } from '../db.js';
import { extractCriteria } from './llm1.js';
import { setCriteriaCache } from './cache.js';

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

export const prewarmCommonDishes = async () => {
  if (process.env.VINOFLOW_PREWARM !== 'true') return;
  console.log('🔥 Pre-warming pairing cache for common dishes...');
  let warmed = 0;
  for (const dish of COMMON_DISHES) {
    try {
      const criteria = await extractCriteria(dish, {});
      await setCriteriaCache(pool, dish, criteria);
      warmed++;
    } catch {
      // Skip silently — likely no API key
    }
    // Avoid hammering the API
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`🔥 Pre-warmed ${warmed}/${COMMON_DISHES.length} dishes`);
};
