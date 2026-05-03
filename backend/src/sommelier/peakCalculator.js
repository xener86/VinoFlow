// Per-wine peak drinking window via LLM.
//
// The formula in peakWindow.js (vintage+5..+10) is correct for entry-level
// wines but wildly wrong for:
//   - Bordeaux Grand Cru Classé (peak: vintage+15..+50)
//   - Vin Jaune (peak: vintage+10..+50)
//   - Sauternes / VT (peak: vintage+10..+50)
//   - Vintage Champagne (peak: vintage+10..+25)
//   - Bourgogne Grand Cru (peak: vintage+10..+25)
//   - Beaujolais village (peak: vintage+1..+3)
//
// This module asks the LLM to return the realistic peak window per wine,
// considering: producer prestige, appellation level, vintage quality,
// wine style.

import { generateJson } from '../services/aiService.js';

const SYSTEM_PROMPT = `Tu es un sommelier expert en garde des vins. Pour un vin précis, donne sa fenêtre optimale de consommation (apogée).

Considère :
- Niveau de l'appellation (Grand Cru, 1er Cru, Cru Bourgeois, AOC simple, vin de table)
- Réputation du producteur (Premier Cru Classé > cru bourgeois > propriétaire-récoltant)
- Qualité du millésime (un 1982 ou 2005 Bordeaux dure beaucoup plus longtemps qu'un 2003)
- Style de vin (Vin Jaune et liquoreux ont des fenêtres de 30-50 ans, Beaujolais = 2-5 ans)
- Le vin actuel a-t-il déjà passé son apogée ? (un 1980 Cru Classé peut encore être à son sommet ; un 2018 Beaujolais générique est déjà passé)

Si tu n'es pas sûr du producteur exact, base-toi sur le niveau de l'appellation. Sois honnête sur la confiance.

Réponds UNIQUEMENT en JSON :
{
  "peak_start_year": 2025,
  "peak_end_year": 2045,
  "confidence": "HIGH|MEDIUM|LOW",
  "reasoning": "1-2 phrases expliquant le raisonnement (niveau du vin, millésime, style)"
}

L'année actuelle est ${new Date().getFullYear()}. Pour les vins NV (Champagne sans année), considère que peak_start = année d'achat estimée et peak_end = peak_start + 5.`;

/**
 * Compute peak window for a single wine.
 * @returns {Object} { peakStart, peakEnd, confidence, reasoning }
 */
export const computePeak = async (wine) => {
  if (!wine.vintage && wine.type !== 'SPARKLING') {
    return null;
  }

  const userPrompt = [
    `Vin : ${wine.producer || '?'} - ${wine.name || '?'} ${wine.cuvee ? '(' + wine.cuvee + ')' : ''}`,
    `Millésime : ${wine.vintage || 'NV'}`,
    `Région : ${wine.region || '?'}${wine.appellation ? ' / ' + wine.appellation : ''}`,
    `Type : ${wine.type}`,
    Array.isArray(wine.grapeVarieties) && wine.grapeVarieties.length > 0
      ? `Cépages : ${wine.grapeVarieties.join(', ')}`
      : null,
  ].filter(Boolean).join('\n');

  const result = await generateJson('extract-criteria', {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  });

  const peakStart = parseInt(result.peak_start_year);
  const peakEnd = parseInt(result.peak_end_year);

  if (isNaN(peakStart) || isNaN(peakEnd) || peakEnd < peakStart) {
    throw new Error(`Invalid peak window returned: ${JSON.stringify(result)}`);
  }

  return {
    peakStart,
    peakEnd,
    confidence: result.confidence || 'MEDIUM',
    reasoning: result.reasoning || '',
  };
};

/**
 * Determine the current status from a peak window.
 */
export const peakStatus = (peakStart, peakEnd) => {
  const currentYear = new Date().getFullYear();
  if (currentYear < peakStart) return 'Garde';
  if (currentYear > peakEnd) return 'Apogée passée';
  // Within the peak window — flag end-of-window
  if (peakEnd - currentYear <= 1) return 'Boire Vite';
  return 'À Boire';
};
