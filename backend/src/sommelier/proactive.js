// Phase 8 — Proactive / predictive features.
//
// Computed on-demand at request time (no cron yet) — the frontend can call
// these endpoints to display dashboards or notifications.

import { getPeakWindow } from './peakWindow.js';
import { classifyWine } from '../notifications/classify.js';

/**
 * Phase 8.1 — "À boire avant"
 * Vins dont la fenêtre se referme dans l'horizon ou dont l'apogée est passée,
 * du plus urgent au moins urgent (même classification que les notifications).
 */
export const drinkBeforeAlerts = (inventory, options = {}) => {
  const horizonMonths = options.horizonMonths ?? 12;
  const now = options.now ?? new Date();
  return inventory
    .map((wine) => ({ wine, c: classifyWine(wine, { horizonMonths, now }) }))
    .filter(({ c }) => c && (c.state === 'SE_REFERME' || c.state === 'DEPASSEE'))
    .map(({ wine, c }) => ({ wine, peak: getPeakWindow(wine), monthsLeft: c.monthsLeft, state: c.state, estimated: c.estimated }))
    .sort((a, b) => a.monthsLeft - b.monthsLeft);
};

/**
 * Phase 8.2 — Anticipation occasion
 * Given a date for an event, returns wines worth pulling out and decanting
 * X days in advance. Selects wines at their peak with high confidence.
 */
export const anticipationForEvent = (inventory, eventDate, options = {}) => {
  const limit = options.limit ?? 5;
  const targetYear = new Date(eventDate).getFullYear();

  return inventory
    .filter(w => (w.inventoryCount ?? 0) > 0 && w.vintage)
    .map(w => {
      const peak = getPeakWindow(w);
      if (!peak) return null;
      const isAtPeak = targetYear >= peak.peakStart && targetYear <= peak.peakEnd;
      if (!isAtPeak) return null;

      // Prestige bonus
      const isPrestige = (w.isFavorite === true) || (w.isLuxury === true);
      const score = (peak.peakEnd - targetYear) + (isPrestige ? 5 : 0);
      return { wine: w, peak, score, prestige: isPrestige };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

/**
 * Phase 8.3 — Suggestion d'achat predictive
 * Analyzes consumption patterns over the last N days/months and suggests
 * categories the user is running low on.
 */
export const purchaseSuggestions = (inventory, journalEntries, options = {}) => {
  const monthsBack = options.monthsBack ?? 6;
  const cutoff = Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000;

  // Count consumption per type from journal
  const consumed = {};
  for (const entry of journalEntries || []) {
    if (entry.type !== 'OUT' && entry.type !== 'GIFT') continue;
    if (new Date(entry.date).getTime() < cutoff) continue;
    const wine = inventory.find(w => w.id === entry.wineId);
    if (!wine || !wine.type) continue;
    consumed[wine.type] = (consumed[wine.type] || 0) + (entry.quantity || 1);
  }

  // Current stock per type
  const stock = {};
  for (const w of inventory) {
    if (!w.type || (w.inventoryCount ?? 0) <= 0) continue;
    stock[w.type] = (stock[w.type] || 0) + w.inventoryCount;
  }

  const monthlyRate = (type) => (consumed[type] || 0) / monthsBack;
  const monthsOfStock = (type) => {
    const rate = monthlyRate(type);
    return rate > 0 ? (stock[type] || 0) / rate : Infinity;
  };

  const suggestions = [];
  for (const type of ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED']) {
    const monthly = monthlyRate(type);
    if (monthly < 0.1) continue; // user doesn't drink this type
    const months = monthsOfStock(type);
    if (months < 3) {
      const suggested = Math.max(2, Math.ceil(monthly * 6 - (stock[type] || 0)));
      suggestions.push({
        type,
        monthly_rate: Math.round(monthly * 10) / 10,
        current_stock: stock[type] || 0,
        months_of_stock: months === Infinity ? null : Math.round(months * 10) / 10,
        suggested_purchase: suggested,
        priority: months < 1 ? 'HIGH' : months < 2 ? 'MEDIUM' : 'LOW',
      });
    }
  }

  return suggestions.sort((a, b) =>
    (a.priority === 'HIGH' ? 0 : a.priority === 'MEDIUM' ? 1 : 2) -
    (b.priority === 'HIGH' ? 0 : b.priority === 'MEDIUM' ? 1 : 2)
  );
};
