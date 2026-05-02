// Self-critic loop (Phase 6.2).
// After LLM2 produces 3 picks, run a small LLM3 that verifies coherence:
// - Does each wine actually exist in the candidate list?
// - Is the reasoning coherent with the dish?
// - Are there obvious red flags (e.g. tannic red on raw fish)?
// If criticism is severe, regenerate with stricter constraints.

import { generateJson } from '../services/aiService.js';

const SYSTEM_PROMPT = `Tu es un sommelier critique. Évalue 3 propositions d'accords mets-vins en termes de cohérence et de qualité. Pour chaque proposition, juge:
- pertinence du choix (0-10): l'accord fonctionne-t-il vraiment avec ce plat?
- crédibilité de l'argument (0-10): la justification est-elle solide?
- y a-t-il un drapeau rouge évident?

Réponds en JSON strict:
{
  "safe":     { "pertinence": 8, "credibility": 9, "red_flag": null, "suggestion": null },
  "personal": { ... },
  "creative": { ... },
  "needs_regenerate": false,
  "global_comment": "..."
}

Marque needs_regenerate: true uniquement si au moins 2 propositions ont une pertinence < 5 OU un drapeau rouge majeur.`;

export const critiquePicks = async (dish, criteria, picks, candidates) => {
  const formatPick = (label, pick) => {
    if (!pick) return `${label}: null`;
    const wine = candidates.find(c => c.wine.id === pick.wine_id)?.wine;
    return `${label}: ${wine?.producer || '?'} ${wine?.name || ''} ${wine?.vintage || ''} (${wine?.type || '?'}) — raison: ${pick.reason}`;
  };

  const userPrompt = [
    `Plat: ${dish}`,
    `Profil idéal: ${JSON.stringify(criteria.wine_profile?.aromas || [])}, types ${(criteria.wine_profile?.types || []).join(',')}`,
    '',
    'Propositions à critiquer:',
    formatPick('SAFE', picks.safe),
    formatPick('PERSONAL', picks.personal),
    formatPick('CREATIVE', picks.creative),
  ].join('\n');

  try {
    const critique = await generateJson('argue', {
      system: SYSTEM_PROMPT,
      user: userPrompt,
    });
    return critique;
  } catch (e) {
    console.warn('Self-critic failed, accepting picks as-is:', e.message);
    return null;
  }
};
