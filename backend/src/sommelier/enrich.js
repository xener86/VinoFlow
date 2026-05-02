// Aroma profile enrichment service.
//
// Given a wine, ask the AI for a structured aromatic profile and store it
// with provenance metadata. Optionally cross-source with consensus.

import { generateJson, consensusJson } from '../services/aiService.js';

const SYSTEM_PROMPT = `Tu es un expert en dégustation de vin. Pour un vin donné (producteur, cuvée, millésime, région, cépages), génère un profil aromatique structuré.

Si tu n'es pas sûr de ce vin spécifique, dis-le clairement avec confidence: "LOW".
Si tu connais bien le domaine et le millésime, confidence: "HIGH".
Sinon "MEDIUM".

Réponds UNIQUEMENT en JSON, structure exacte:
{
  "aromas": ["3 à 8 arômes spécifiques en français, ex: 'cassis', 'vanille', 'tabac'"],
  "families": ["1 à 3 familles parmi: fruity, floral, spicy, oaky, earthy, herbaceous, mineral"],
  "intensity": 0-100,
  "evolution": "primary|secondary|tertiary",
  "confidence": "HIGH|MEDIUM|LOW",
  "reasoning": "1 phrase justifiant la confiance et les arômes"
}`;

const buildUserPrompt = (wine) => {
  const parts = [
    `Producteur: ${wine.producer || 'inconnu'}`,
    `Cuvée: ${wine.cuvee || wine.name || 'inconnue'}`,
    `Millésime: ${wine.vintage || 'inconnu'}`,
    `Région: ${wine.region || 'inconnue'}`,
    wine.appellation ? `Appellation: ${wine.appellation}` : null,
    `Type: ${wine.type || 'inconnu'}`,
    Array.isArray(wine.grapeVarieties) && wine.grapeVarieties.length > 0
      ? `Cépages: ${wine.grapeVarieties.join(', ')}`
      : null,
  ].filter(Boolean);
  return parts.join('\n');
};

/**
 * Enrich a single wine.
 * @param {Object} wine
 * @param {Object} options - { useConsensus: boolean }
 * @returns {Object} { aromas, confidence, source, reasoning, raw }
 */
export const enrichWine = async (wine, options = {}) => {
  const userPrompt = buildUserPrompt(wine);

  if (options.useConsensus) {
    const consensus = await consensusJson('enrich', {
      system: SYSTEM_PROMPT,
      user: userPrompt,
    });
    return {
      aromas: consensus.result?.aromas || [],
      families: consensus.result?.families || [],
      intensity: consensus.result?.intensity ?? null,
      evolution: consensus.result?.evolution ?? null,
      confidence: consensus.confidence,
      source: 'CONSENSUS',
      providers: consensus.sources,
      agreement: consensus.agreement,
    };
  }

  const result = await generateJson('enrich', {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  });

  return {
    aromas: result.aromas || [],
    families: result.families || [],
    intensity: result.intensity ?? null,
    evolution: result.evolution ?? null,
    confidence: result.confidence || 'MEDIUM',
    source: 'AI',
    reasoning: result.reasoning || '',
  };
};

/**
 * Convert palate/nose tasting notes into aroma updates.
 * Used for the "tasting → aroma" feedback loop (Phase 3.3).
 *
 * Aromas mentioned across multiple tasting notes get higher weight.
 * Returns a deduplicated list of aromas inferred from tastings.
 */
export const aromasFromTastingNotes = (tastingNotes) => {
  if (!Array.isArray(tastingNotes) || tastingNotes.length === 0) return [];

  const counter = {};
  for (const note of tastingNotes) {
    const sources = [
      note.noseNotes,
      note.nose_notes,
      note.palateNotes,
      note.palate_notes,
    ].filter(Boolean);

    for (const src of sources) {
      // Tolerant extraction: arrays of strings, or {aromas: [...]}, or text
      const list = Array.isArray(src)
        ? src
        : Array.isArray(src?.aromas) ? src.aromas
        : typeof src === 'object' ? Object.values(src).flat().filter(v => typeof v === 'string')
        : typeof src === 'string' ? src.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
        : [];

      for (const item of list) {
        const key = String(item).toLowerCase().trim();
        if (key.length > 0 && key.length < 40) {
          counter[key] = (counter[key] || 0) + 1;
        }
      }
    }
  }

  // Keep aromas that appear at least once, sorted by frequency
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .map(([aroma]) => aroma);
};
