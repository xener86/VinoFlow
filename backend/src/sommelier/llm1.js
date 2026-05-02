// LLM1 — Extract pairing criteria from a dish description.
//
// This is the first step of Sommelier v2. Instead of sending the full cellar
// to a single LLM, we ask a fast model (Gemini Flash by default) to break the
// dish down into structured criteria. The cellar is queried locally afterwards.
//
// Output shape:
// {
//   "decomposition": {
//     "protein": "...",
//     "sauce": "...",
//     "cooking": "...",
//     "spices": "...",
//     "intensity": "light" | "medium" | "rich"
//   },
//   "wine_profile": {
//     "types": ["WHITE", "SPARKLING"],
//     "body":      [40, 70],   // 0-100 range
//     "acidity":   [60, 90],
//     "tannin":    [0, 30],
//     "sweetness": [0, 20],
//     "alcohol":   [40, 65],
//     "regions":   ["Alsace", "Loire", "Mosel"],   // suggested
//     "grapes":    ["Riesling", "Gewurztraminer"], // suggested
//     "aromas":    ["agrumes", "fleur blanche", "miel", "gingembre"],
//     "avoid":     ["vins boisés", "rouges tanniques"],
//     "service_temperature_c": [8, 10]
//   },
//   "rationale": "Le curry de poulet appelle un blanc..."
// }

import { generateJson } from '../services/aiService.js';

const SYSTEM_PROMPT = `Tu es un sommelier expert. Pour un plat donné, analyse-le et génère un profil de vin idéal en JSON structuré.

D'abord décompose le plat (protéine, sauce, mode de cuisson, épices, intensité globale).
Ensuite déduis le profil de vin idéal: types autorisés, fourchettes sensorielles (corps, acidité, tanin, sucre, alcool sur 0-100), régions et cépages suggérés, arômes recherchés, ce qu'il faut éviter, et la température de service.

Sois précis. Les fourchettes doivent être étroites (10-30 points de large) pour un vrai filtrage. La liste 'avoid' doit citer les profils incompatibles (ex: "rouges tanniques" pour du poisson cru, "blanc sec" pour dessert chocolat).

Réponds en JSON uniquement, suivant exactement la structure de l'exemple suivant:

{
  "decomposition": {
    "protein": "...",
    "sauce": "...",
    "cooking": "...",
    "spices": "...",
    "intensity": "light|medium|rich"
  },
  "wine_profile": {
    "types": ["WHITE"],
    "body": [40, 70],
    "acidity": [60, 90],
    "tannin": [0, 30],
    "sweetness": [0, 30],
    "alcohol": [40, 65],
    "regions": ["..."],
    "grapes": ["..."],
    "aromas": ["..."],
    "avoid": ["..."],
    "service_temperature_c": [8, 12]
  },
  "rationale": "Une phrase expliquant le raisonnement"
}`;

export const extractCriteria = async (dish, context = {}) => {
  if (!dish || typeof dish !== 'string') {
    throw new Error('dish must be a non-empty string');
  }

  const userPrompt = [
    `Plat: ${dish}`,
    context.mood ? `Ambiance: ${context.mood}` : null,
    context.occasion ? `Occasion: ${context.occasion}` : null,
    context.season ? `Saison: ${context.season}` : null,
  ].filter(Boolean).join('\n');

  const response = await generateJson('extract-criteria', {
    system: SYSTEM_PROMPT,
    user: userPrompt,
  });

  return validateCriteria(response);
};

const validateCriteria = (raw) => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('LLM1 returned invalid response (not an object)');
  }
  if (!raw.wine_profile) {
    throw new Error('LLM1 response missing wine_profile');
  }

  const wp = raw.wine_profile;
  return {
    decomposition: raw.decomposition || {},
    wine_profile: {
      types: Array.isArray(wp.types) ? wp.types : [],
      body: arrayRange(wp.body, [0, 100]),
      acidity: arrayRange(wp.acidity, [0, 100]),
      tannin: arrayRange(wp.tannin, [0, 100]),
      sweetness: arrayRange(wp.sweetness, [0, 100]),
      alcohol: arrayRange(wp.alcohol, [0, 100]),
      regions: Array.isArray(wp.regions) ? wp.regions : [],
      grapes: Array.isArray(wp.grapes) ? wp.grapes : [],
      aromas: Array.isArray(wp.aromas) ? wp.aromas : [],
      avoid: Array.isArray(wp.avoid) ? wp.avoid : [],
      service_temperature_c: arrayRange(wp.service_temperature_c, [4, 22]),
    },
    rationale: raw.rationale || '',
  };
};

const arrayRange = (val, fallback) => {
  if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'number' && typeof val[1] === 'number') {
    return [val[0], val[1]];
  }
  return fallback;
};
