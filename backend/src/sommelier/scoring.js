// Code-side matching score.
// Given a wine and the criteria from LLM1, computes a 0..1 score reflecting
// how well the wine matches the desired profile.
//
// Score components:
//   - aroma_match    (0.35) : Jaccard similarity between wine aromas and target aromas
//   - sensory_match  (0.25) : Distance between wine sensory profile and target ranges
//   - region_grape   (0.10) : Bonus if wine matches a suggested region or grape
//   - maturity       (0.20) : Wine is in or near its peak drinking window
//   - confidence     (×0..1): Multiplier — discounts wines with weak data
//
// confidence multiplier source:
//   USER / TASTING / CONSENSUS = 1.00
//   AI HIGH                    = 0.85
//   AI MEDIUM                  = 0.65
//   AI LOW                     = 0.40
//   none                       = 0.50  (don't kill the wine, just discount)

import { getPeakWindow } from './peakWindow.js';

const CONFIDENCE_FACTOR = {
  USER: 1.00,
  TASTING: 1.00,
  CONSENSUS: 1.00,
  COMMUNITY: 0.85,
  AI_HIGH: 0.85,
  AI_MEDIUM: 0.65,
  AI_LOW: 0.40,
  NONE: 0.50,
};

const confidenceFactor = (wine) => {
  const source = wine.aromaSource || wine.aroma_source;
  const conf = wine.aromaConfidence || wine.aroma_confidence;
  if (!source && !conf) return CONFIDENCE_FACTOR.NONE;
  if (source && source !== 'AI') return CONFIDENCE_FACTOR[source] ?? CONFIDENCE_FACTOR.NONE;
  // source = AI
  if (conf === 'HIGH') return CONFIDENCE_FACTOR.AI_HIGH;
  if (conf === 'MEDIUM') return CONFIDENCE_FACTOR.AI_MEDIUM;
  if (conf === 'LOW') return CONFIDENCE_FACTOR.AI_LOW;
  return CONFIDENCE_FACTOR.NONE;
};

/**
 * Jaccard similarity between two arrays of strings (case-insensitive).
 */
const jaccard = (a = [], b = []) => {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(s => String(s).toLowerCase()));
  const setB = new Set(b.map(s => String(s).toLowerCase()));
  const inter = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? inter / union : 0;
};

/**
 * How well a wine sensory dimension fits within a target range.
 * Returns 1.0 if within range, decreasing linearly as it falls outside.
 */
const rangeFit = (value, [lo, hi], slack = 30) => {
  if (value == null || isNaN(value)) return 0.5; // neutral if unknown
  if (value >= lo && value <= hi) return 1.0;
  const distance = value < lo ? lo - value : value - hi;
  return Math.max(0, 1 - distance / slack);
};

const sensoryMatch = (wineSensory, profile) => {
  if (!wineSensory) return 0.5;
  const dims = ['body', 'acidity', 'tannin', 'sweetness', 'alcohol'];
  const fits = dims.map(d => rangeFit(wineSensory[d], profile[d] || [0, 100]));
  return fits.reduce((a, b) => a + b, 0) / fits.length;
};

const regionGrapeBonus = (wine, profile) => {
  const wineRegion = (wine.region || '').toLowerCase();
  const wineAppellation = (wine.appellation || '').toLowerCase();
  const wineGrapes = (wine.grapeVarieties || wine.grape_varieties || []).map(s => String(s).toLowerCase());

  const wantedRegions = (profile.regions || []).map(s => s.toLowerCase());
  const wantedGrapes = (profile.grapes || []).map(s => s.toLowerCase());

  let score = 0;
  if (wantedRegions.some(r => wineRegion.includes(r) || wineAppellation.includes(r))) score += 0.6;
  if (wantedGrapes.some(g => wineGrapes.some(wg => wg.includes(g) || g.includes(wg)))) score += 0.4;
  return Math.min(1, score);
};

/**
 * Maturity score: 1.0 if at peak, lower if too young or too old.
 */
const maturityScore = (wine) => {
  if (!wine.vintage || !wine.type) return 0.5;
  const peak = getPeakWindow(wine.vintage, wine.type);
  if (!peak) return 0.5;
  const status = peak.status;
  if (status === 'À Boire') return 1.0;
  if (status === 'Boire Vite') return 0.8;
  if (status === 'Garde') return 0.55;
  return 0.5;
};

/**
 * @returns {number} score in [0, 1] and {Object} breakdown
 */
export const scoreWine = (wine, criteria) => {
  const profile = criteria.wine_profile || {};
  const aromaTarget = profile.aromas || [];
  const wineAromas = wine.aromaProfile || wine.aroma_profile || [];
  const wineSensory = wine.sensoryProfile || wine.sensory_profile || {};

  const aromaJaccard = jaccard(wineAromas, aromaTarget);
  const sensory = sensoryMatch(wineSensory, profile);
  const regionGrape = regionGrapeBonus(wine, profile);
  const maturity = maturityScore(wine);
  const confidence = confidenceFactor(wine);

  const raw =
    aromaJaccard * 0.35 +
    sensory * 0.25 +
    regionGrape * 0.10 +
    maturity * 0.20;

  // Note: aromas and sensory totals = 0.60. The remaining 0.10 is left as
  // headroom for a personalization bonus added later (Phase 2.9).
  const final = raw * confidence;

  return {
    score: final,
    breakdown: {
      aroma: aromaJaccard,
      sensory,
      regionGrape,
      maturity,
      confidence,
    },
  };
};

/**
 * Score and rank a list of wines, returning the top N.
 */
export const rankWines = (wines, criteria, topN = 8) => {
  return wines
    .map(wine => ({ wine, ...scoreWine(wine, criteria) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
};
