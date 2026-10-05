// Niveau RÈGLES : fenêtre d'apogée déterministe quand aucune source ne permet
// mieux. Reprend la formule de sommelier/peakWindow.js (rouge +5/+10, blanc
// +2/+7, autres +1/+6), avec deux cas qu'elle ne couvrait pas :
// liquoreux et mutés (garde longue), vins sans millésime (à boire dès maintenant).
import { getPeakWindow } from '../sommelier/peakWindow.js';

const NV_YEARS = { SPARKLING: 3, FORTIFIED: 10, DESSERT: 5 };
const LONG_AGING = { DESSERT: [5, 25], FORTIFIED: [3, 30] };

export const hasVintage = (vintage) => Number.isInteger(vintage) && vintage > 1800;

export const rulePeak = (wine, now = new Date()) => {
  const year = now.getFullYear();
  if (!hasVintage(wine.vintage)) {
    const span = NV_YEARS[wine.type] ?? 2;
    return { peakStart: year, peakEnd: year + span, reasoning: `Vin sans millésime : à boire dans les ${span} ans (règle générique).` };
  }
  if (LONG_AGING[wine.type]) {
    const [a, b] = LONG_AGING[wine.type];
    return { peakStart: wine.vintage + a, peakEnd: wine.vintage + b, reasoning: `Règle générique pour un vin ${wine.type === 'DESSERT' ? 'liquoreux' : 'muté'} : millésime +${a} à +${b} ans.` };
  }
  const w = getPeakWindow(wine.vintage, wine.type);
  if (!w) return null;
  return { peakStart: w.peakStart, peakEnd: w.peakEnd, reasoning: 'Règle générique selon la couleur et le millésime.' };
};
