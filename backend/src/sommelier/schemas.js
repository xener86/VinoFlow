// JSON Schemas des sorties structurées (Claude output_config.format, Gemini
// responseJsonSchema). Contraintes communes aux deux fournisseurs : chaque
// objet en additionalProperties: false avec tous ses champs requis — un champ
// facultatif est donc « nullable » plutôt qu'absent. Pas de minimum/maximum
// (non supportés) : les bornes sont vérifiées après coup.

const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const arr = (items) => ({ type: 'array', items });
const enumOf = (...values) => ({ type: 'string', enum: values });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const range = arr(num); // [min, max] sur 0-100

export const WINE_TYPES = ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED'];

export const CRITERIA_SCHEMA = obj({
  decomposition: obj({
    protein: str,
    sauce: str,
    cooking: str,
    spices: str,
    intensity: enumOf('light', 'medium', 'rich'),
  }),
  wine_profile: obj({
    types: arr(enumOf(...WINE_TYPES)),
    body: range,
    acidity: range,
    tannin: range,
    sweetness: range,
    alcohol: range,
    regions: arr(str),
    grapes: arr(str),
    aromas: arr(str),
    avoid: arr(str),
    service_temperature_c: range,
  }),
  rationale: str,
});

const pick = nullable(obj({
  wine_id: str,
  reason: str,
  service_temp_c: nullable(num),
  decant_minutes: nullable(int),
}));

export const PICKS_SCHEMA = obj({
  safe: pick,
  personal: pick,
  creative: pick,
  global_advice: str,
  // Autres accords qui fonctionnent vraiment, par ordre de préférence (0 à 5).
  alternatives: arr(obj({ wine_id: str, reason: str })),
});

// Discussion avec le sommelier (sommelier/chat.js)
export const CHAT_REPLY_SCHEMA = obj({
  reply: str,
  wine_ids: arr(str),
  revised_dish: nullable(str),
});

const review = nullable(obj({
  pertinence: int,
  credibility: int,
  red_flag: nullable(str),
  suggestion: nullable(str),
}));

export const CRITIQUE_SCHEMA = obj({
  safe: review,
  personal: review,
  creative: review,
  needs_regenerate: bool,
  global_comment: str,
});

export const DISHES_SCHEMA = obj({
  suggestions: arr(obj({
    dish: str,
    type: enumOf('entrée', 'plat', 'dessert', 'fromage', 'casual'),
    reason: str,
  })),
  global_advice: str,
});

export const COMPARE_SCHEMA = obj({
  winner: enumOf('A', 'B', 'tie'),
  reasoning: str,
  wine_a_strengths: str,
  wine_a_weaknesses: str,
  wine_b_strengths: str,
  wine_b_weaknesses: str,
  advice: str,
});

export const OCR_SCHEMA = obj({
  producer: nullable(str),
  name: nullable(str),
  cuvee: nullable(str),
  vintage: nullable(int),
  region: nullable(str),
  appellation: nullable(str),
  country: nullable(str),
  type: nullable(enumOf(...WINE_TYPES)),
  abv: nullable(num),
  format: nullable(str),
  grape_varieties: arr(str),
  confidence: enumOf('HIGH', 'MEDIUM', 'LOW'),
  notes: nullable(str),
});

export const schemaHelpers = { str, int, num, bool, nullable, arr, enumOf, obj };

// ─── Assistant de saisie (ajout de vin, Bar) — ex-services/geminiService.ts ───

// Identification d'un vin depuis une saisie libre. Champs inconnus → null.
export const WINE_IDENTIFY_SCHEMA = obj({
  name: nullable(str),
  producer: nullable(str),
  cuvee: nullable(str),
  parcel: nullable(str),
  vintage: nullable(int),
  type: nullable(enumOf(...WINE_TYPES)),
  region: nullable(str),
  appellation: nullable(str),
  country: nullable(str),
  grapeVarieties: arr(str),
  sensoryDescription: nullable(str),
  tastingNotes: nullable(str),
  aromaProfile: arr(str),
  suggestedFoodPairings: arr(str),
  producerHistory: nullable(str),
  sensoryProfile: nullable(obj({
    body: int,
    acidity: int,
    tannin: int,
    sweetness: int,
    alcohol: int,
    flavors: arr(str),
  })),
  confidence: enumOf('HIGH', 'MEDIUM', 'LOW'),
});

export const SPIRIT_TYPES = ['WHISKY', 'GIN', 'VODKA', 'RUM', 'TEQUILA', 'COGNAC', 'VERMOUTH', 'LIQUEUR', 'BITTER', 'OTHER'];

export const SPIRIT_SCHEMA = obj({
  category: enumOf(...SPIRIT_TYPES),
  distillery: nullable(str),
  region: nullable(str),
  country: nullable(str),
  caskType: nullable(str),
  abv: nullable(num),
  format: nullable(int),
  description: str,
  producerHistory: nullable(str),
  tastingNotes: nullable(str),
  aromaProfile: arr(str),
  suggestedCocktails: arr(str),
  culinaryPairings: arr(str),
});

export const COCKTAIL_SCHEMA = obj({
  name: str,
  description: str,
  ingredients: arr(obj({ name: str, amount: nullable(num), unit: nullable(str), optional: bool })),
  instructions: arr(str),
  glassType: str,
  difficulty: enumOf('Easy', 'Medium', 'Hard'),
});

// Newsletter : « mot du sommelier » (vins choisis parmi la liste fournie).
export const NEWSLETTER_NOTE_SCHEMA = obj({
  intro: str,
  picks: arr(obj({ wineId: str, reason: str })),
  seasonalPairing: nullable(str),
  closing: nullable(str),
});
