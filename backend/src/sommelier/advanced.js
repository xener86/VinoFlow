// Phase 10 + 11 — Advanced sommelier modes.

import { generateJson, generateText } from '../services/aiService.js';
import { getPeakWindow } from './peakWindow.js';

/**
 * Phase 10.1 — Mode verticale
 * Given a producer, returns the wines from that producer in cave with a
 * suggested tasting order (typically youngest → oldest, or vice versa for
 * styles where age dominance is reverse).
 */
export const buildVerticalTasting = (inventory, producer) => {
  const wines = inventory
    .filter(w => (w.producer || '').toLowerCase() === String(producer || '').toLowerCase())
    .filter(w => w.vintage && (w.inventoryCount ?? 0) > 0);

  if (wines.length < 2) {
    return { wines: [], note: 'Pas assez de millésimes différents pour une verticale (minimum 2).' };
  }

  // Default: youngest → oldest (let aromatic intensity build up)
  const ordered = [...wines].sort((a, b) => (b.vintage || 0) - (a.vintage || 0));

  return {
    producer,
    wines: ordered.map(w => ({
      id: w.id,
      name: w.name,
      cuvee: w.cuvee,
      vintage: w.vintage,
      peak: getPeakWindow(w.vintage, w.type),
    })),
    note: 'Ordre suggéré: du plus jeune au plus âgé (en finissant sur les évolutions tertiaires).',
  };
};

/**
 * Phase 10.2 — Decision assistant
 * User hesitates between 2 wines for a dish. Compare them in context.
 */
export const compareForDish = async (dish, wineA, wineB) => {
  const SYSTEM = `Tu es un sommelier. Compare deux vins pour un plat précis et choisis le meilleur accord, en argumentant. Sois honnête sur les forces et faiblesses de chacun.

Réponds en JSON pur:
{
  "winner": "A" | "B" | "tie",
  "reasoning": "...",
  "wine_a_strengths": "...",
  "wine_a_weaknesses": "...",
  "wine_b_strengths": "...",
  "wine_b_weaknesses": "...",
  "advice": "..."
}`;
  const formatWine = (w) => `${w.producer || '?'} ${w.name} ${w.cuvee || ''} ${w.vintage || ''} (${w.type}, ${w.region || '?'})`;
  const user = `Plat: ${dish}\n\nVin A: ${formatWine(wineA)}\nArômes A: ${(wineA.aromaProfile || []).join(', ') || '?'}\n\nVin B: ${formatWine(wineB)}\nArômes B: ${(wineB.aromaProfile || []).join(', ') || '?'}`;
  return generateJson('argue', { system: SYSTEM, user });
};

/**
 * Phase 10.3 — Mode aveugle
 * Returns a wine description with the identity hidden, plus the answer.
 * The frontend reveals on demand.
 */
export const blindTasting = (inventory) => {
  const candidates = inventory.filter(w => (w.inventoryCount ?? 0) > 0);
  if (candidates.length === 0) return null;
  const wine = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    blind_clues: {
      type: wine.type,
      country: wine.country,
      vintage_range: wine.vintage ? [Math.floor(wine.vintage / 10) * 10, Math.floor(wine.vintage / 10) * 10 + 10] : null,
      sensory_profile: wine.sensoryProfile,
    },
    reveal: {
      id: wine.id,
      producer: wine.producer,
      name: wine.name,
      cuvee: wine.cuvee,
      vintage: wine.vintage,
      region: wine.region,
      appellation: wine.appellation,
    },
  };
};

/**
 * Phase 11.1 — Aging recommendations
 * For each wine in cave, calculate days/months until optimal drinking and
 * flag those entering or leaving their peak window.
 */
export const agingRecommendations = (inventory) => {
  const currentYear = new Date().getFullYear();
  return inventory
    .filter(w => (w.inventoryCount ?? 0) > 0 && w.vintage)
    .map(w => {
      const peak = getPeakWindow(w.vintage, w.type);
      if (!peak) return null;
      let phase, message;
      if (currentYear < peak.peakStart) {
        const yearsToPeak = peak.peakStart - currentYear;
        phase = 'AGING';
        message = `À garder encore ${yearsToPeak} an${yearsToPeak > 1 ? 's' : ''} avant l'ouverture optimale`;
      } else if (currentYear <= peak.peakEnd) {
        const yearsLeft = peak.peakEnd - currentYear;
        phase = 'PEAK';
        message = yearsLeft > 0
          ? `À son apogée, encore ${yearsLeft} an${yearsLeft > 1 ? 's' : ''} de fenêtre`
          : 'À boire dans l\'année';
      } else {
        phase = 'PAST';
        message = `Au-delà de la fenêtre optimale (depuis ${currentYear - peak.peakEnd} an${currentYear - peak.peakEnd > 1 ? 's' : ''}). Prioriser.`;
      }
      return { wine: w, peak, phase, message };
    })
    .filter(Boolean);
};

/**
 * Phase 11.2 — Detection des doublons
 * Returns groups of wines that look like duplicates (same producer + name + vintage).
 */
export const findDuplicates = (inventory) => {
  const groups = {};
  for (const w of inventory) {
    if (!w.name) continue;
    const key = [
      (w.producer || '').toLowerCase().trim(),
      w.name.toLowerCase().trim(),
      w.cuvee?.toLowerCase().trim() || '',
      w.vintage || 0,
    ].join('|');
    if (!groups[key]) groups[key] = [];
    groups[key].push(w);
  }
  const duplicates = Object.values(groups).filter(g => g.length > 1);
  return duplicates.map(g => ({
    label: `${g[0].producer || ''} ${g[0].name} ${g[0].cuvee || ''} ${g[0].vintage || ''}`.trim(),
    wines: g.map(w => ({ id: w.id, region: w.region, inventoryCount: w.inventoryCount })),
  }));
};

/**
 * Phase 11.3 — Wine cellar simulation
 * Project the cave size N years from now using current consumption rate.
 */
export const cellarProjection = (inventory, journalEntries, options = {}) => {
  const yearsAhead = options.yearsAhead ?? 5;
  const monthsBack = 12;
  const cutoff = Date.now() - monthsBack * 30 * 24 * 60 * 60 * 1000;

  const consumedByType = {};
  let consumedTotal = 0;
  for (const e of journalEntries || []) {
    if ((e.type !== 'OUT' && e.type !== 'GIFT') || new Date(e.date).getTime() < cutoff) continue;
    const wine = inventory.find(w => w.id === e.wineId);
    if (!wine || !wine.type) continue;
    consumedByType[wine.type] = (consumedByType[wine.type] || 0) + (e.quantity || 1);
    consumedTotal += (e.quantity || 1);
  }

  const monthlyRate = consumedTotal / monthsBack;
  const projection = [];
  let stock = inventory.filter(w => (w.inventoryCount ?? 0) > 0).reduce((s, w) => s + w.inventoryCount, 0);

  for (let year = 1; year <= yearsAhead; year++) {
    stock = Math.max(0, stock - monthlyRate * 12);
    projection.push({ year_offset: year, projected_stock: Math.round(stock) });
  }

  return {
    monthly_consumption: Math.round(monthlyRate * 10) / 10,
    by_type: consumedByType,
    projection,
  };
};
