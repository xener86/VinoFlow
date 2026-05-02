// LLM2 — Argument and pick the final 3 propositions among the top candidates.
//
// Receives:
//   - dish description
//   - LLM1 criteria (rationale, decomposition, profile)
//   - top N candidate wines (already pre-filtered + scored)
//   - few-shot examples from user feedback (Phase 2.9)
//   - user taste profile (Phase 2.10)
//
// Returns three categorized recommendations:
//   - SAFE     : the textbook pairing, plays it safe
//   - PERSONAL : tuned to the user's known preferences
//   - CREATIVE : an audacious but defensible choice

import { generateJson } from '../services/aiService.js';

const SYSTEM_PROMPT = `Tu es un sommelier expert français. À partir d'un plat, du profil de vin idéal et d'une liste de vins candidats déjà pré-filtrés depuis la cave de l'utilisateur, choisis 3 recommandations:

1. SAFE: l'accord classique, défendu par les règles d'accord traditionnelles. Joue la sécurité.
2. PERSONAL: l'accord qui correspond le mieux aux goûts personnels de l'utilisateur (basé sur ses retours précédents si fournis).
3. CREATIVE: un accord plus audacieux mais cohérent. Doit surprendre tout en restant défendable.

Pour chaque recommandation:
- Identifie le vin par son ID (champ id)
- Explique en 2-3 phrases POURQUOI cet accord fonctionne (mécanisme: contraste, complémentarité, pont aromatique...)
- Indique la température de service idéale et un éventuel décantage

Si aucun candidat ne convient pour une catégorie, mets null pour cette catégorie avec une raison.

Réponds en JSON pur, structure exacte:
{
  "safe":     { "wine_id": "...", "reason": "...", "service_temp_c": 16, "decant_minutes": 30 } | null,
  "personal": { ... } | null,
  "creative": { ... } | null,
  "global_advice": "Conseil court sur l'ordre de service ou l'accompagnement"
}`;

/**
 * @param {string} dish
 * @param {Object} criteria - LLM1 output
 * @param {Array} candidates - top wines with score breakdown
 * @param {Object} options - { userFeedback, tasteProfile }
 */
export const argueAndPick = async (dish, criteria, candidates, options = {}) => {
  if (!candidates || candidates.length === 0) {
    return {
      safe: null,
      personal: null,
      creative: null,
      global_advice: 'Aucun vin de votre cave ne correspond à ce plat. Pensez à votre wishlist.',
    };
  }

  const candidatesText = candidates.map((c, i) => {
    const w = c.wine;
    return `[${i + 1}] id=${w.id} | ${w.producer ?? '?'} - ${w.name} ${w.cuvee || ''} ${w.vintage || ''} | ${w.type} | ${w.region || '?'} ${w.appellation ? '/ ' + w.appellation : ''} | corps:${w.sensoryProfile?.body ?? '?'} acidite:${w.sensoryProfile?.acidity ?? '?'} tanin:${w.sensoryProfile?.tannin ?? '?'} | aromes: ${(w.aromaProfile || []).join(', ') || '?'} | confiance: ${w.aromaConfidence || w.aroma_confidence || 'aucune'} (${w.aromaSource || w.aroma_source || 'inconnue'}) | score: ${c.score.toFixed(2)}`;
  }).join('\n');

  const fewShotBlock = formatFewShotExamples(options.userFeedback);
  const tasteBlock = formatTasteProfile(options.tasteProfile);

  const userPrompt = [
    `Plat: ${dish}`,
    '',
    'Profil de vin idéal extrait du plat:',
    JSON.stringify(criteria.wine_profile, null, 2),
    '',
    `Décomposition du plat: ${JSON.stringify(criteria.decomposition || {})}`,
    `Rationale: ${criteria.rationale || ''}`,
    '',
    tasteBlock,
    fewShotBlock,
    '',
    'Vins candidats (déjà pré-filtrés et scorés depuis la cave):',
    candidatesText,
    '',
    'Choisis les 3 recommandations (SAFE / PERSONAL / CREATIVE) parmi ces candidats.',
  ].filter(Boolean).join('\n');

  const result = await generateJson('argue', {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  });

  return validateLlm2Response(result, candidates);
};

const formatFewShotExamples = (userFeedback) => {
  if (!userFeedback || userFeedback.length === 0) return '';
  const liked = userFeedback.filter(f => f.rating === 'UP').slice(0, 5);
  const disliked = userFeedback.filter(f => f.rating === 'DOWN').slice(0, 3);

  const lines = ['Préférences de l\'utilisateur (basé sur ses retours passés):'];
  if (liked.length > 0) {
    lines.push('A AIMÉ ces accords:');
    liked.forEach(f => {
      lines.push(`- "${f.dish}" avec ${f.wine_label || 'un vin'}`);
    });
  }
  if (disliked.length > 0) {
    lines.push('N\'A PAS AIMÉ:');
    disliked.forEach(f => {
      lines.push(`- "${f.dish}" avec ${f.wine_label || 'un vin'}`);
    });
  }
  return lines.join('\n');
};

const formatTasteProfile = (profile) => {
  if (!profile) return '';
  return `Profil de goût: ${JSON.stringify(profile)}`;
};

const validateLlm2Response = (raw, candidates) => {
  const validIds = new Set(candidates.map(c => c.wine.id));
  const ensure = (rec) => {
    if (!rec) return null;
    if (!validIds.has(rec.wine_id)) {
      console.warn(`LLM2 returned an unknown wine_id: ${rec.wine_id}`);
      return null;
    }
    return {
      wine_id: rec.wine_id,
      reason: String(rec.reason || ''),
      service_temp_c: typeof rec.service_temp_c === 'number' ? rec.service_temp_c : null,
      decant_minutes: typeof rec.decant_minutes === 'number' ? rec.decant_minutes : 0,
    };
  };

  return {
    safe: ensure(raw.safe),
    personal: ensure(raw.personal),
    creative: ensure(raw.creative),
    global_advice: String(raw.global_advice || ''),
  };
};
