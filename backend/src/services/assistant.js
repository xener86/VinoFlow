// Assistant de saisie : identification d'un vin pendant la frappe, fiche d'un
// spiritueux, cocktail sur mesure. Ces appels se faisaient depuis le navigateur
// (services/geminiService.ts, clés en localStorage) ; ils passent désormais par
// aiService (modèles par tâche, repli fournisseur, journal des coûts).

import { generateJson } from './aiService.js';
import { WINE_IDENTIFY_SCHEMA, SPIRIT_SCHEMA, COCKTAIL_SCHEMA } from '../sommelier/schemas.js';

const ANTI_HALLUCINATION = `RÈGLES STRICTES :
- Si tu n'es PAS certain d'une information, mets null (ou une liste vide) plutôt que d'inventer.
- "confidence" reflète ta certitude globale : HIGH = vin connu et vérifié, MEDIUM = probable mais non confirmé, LOW = hypothèse sur peu d'indices.
- Ne complète JAMAIS les cépages ou l'appellation sans source fiable.
- Mieux vaut un JSON incomplet qu'un JSON avec des données inventées.`;

const clean = (s, max = 500) => String(s ?? '').trim().slice(0, max);

export const identifyWine = async ({ name, vintage, hint }) => {
  const label = clean(name, 200);
  const year = Number.isInteger(vintage) ? ` (${vintage})` : '';
  const extra = clean(hint);
  const result = await generateJson('identify-wine', {
    system: `Tu es expert en vin. À partir d'une saisie libre, identifie le vin (producteur, cuvée, lieu-dit/climat, appellation, millésime, couleur) et décris-le EN FRANÇAIS. Profil sensoriel sur 0-100.\n\n${ANTI_HALLUCINATION}`,
    user: `Vin : "${label}"${year}${extra && extra !== label ? `\nSaisie complète : ${extra}` : ''}`,
    schema: WINE_IDENTIFY_SCHEMA,
  });
  return { ...result, enrichedByAi: true, aiConfidence: result.confidence || 'MEDIUM' };
};

export const enrichSpirit = async ({ name, hint }) => {
  const result = await generateJson('enrich-spirit', {
    system: `Tu es expert en spiritueux. Décris le spiritueux demandé EN FRANÇAIS : catégorie, distillerie, région, pays, degré, format (cl → ml), description, notes de dégustation, profil aromatique, cocktails suggérés et accords culinaires.
Si tu n'es pas certain d'une information (degré, type de fût…), mets null plutôt que d'inventer.`,
    user: `Spiritueux : "${clean(name, 200)}"${hint ? `\nPrécision : ${clean(hint)}` : ''}`,
    schema: SPIRIT_SCHEMA,
  });
  return { ...result, enrichedByAi: true };
};

export const createCocktail = async ({ ingredients, query }) => {
  const list = (Array.isArray(ingredients) ? ingredients : []).map((i) => clean(i, 100)).filter(Boolean).slice(0, 100);
  const result = await generateJson('cocktail', {
    system: `Tu es mixologue expert. Crée une recette de cocktail originale EN FRANÇAIS.
- Utilise UNIQUEMENT les ingrédients listés (+ glace, sucre, eau gazeuse autorisés).
- Description en 1 à 2 phrases.
- Instructions : étapes claires et concises, une par élément.
- Nom créatif et évocateur.`,
    user: `Ingrédients disponibles : ${list.join(', ') || 'aucun'}\nDemande : "${clean(query)}"`,
    schema: COCKTAIL_SCHEMA,
  });
  return { ...result, category: 'MODERN', prepTime: 5, source: 'AI', isFavorite: false, tags: ['AI'] };
};
