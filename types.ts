// types.ts - Fichier complet avec les corrections

export interface Wine {
  id: string;
  name: string;
  cuvee?: string;
  parcel?: string;
  producer: string;
  vintage: number;
  region: string;
  appellation?: string;
  country: string;
  type: WineType;
  grapeVarieties: string[];
  format: string;
  personalNotes: string[];
  sensoryDescription: string;
  aromaProfile: string[];
  tastingNotes: string;
  suggestedFoodPairings: string[];
  producerHistory: string;
  enrichedByAi: boolean;
  aiConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  isFavorite: boolean;
  sensoryProfile: SensoryProfile;
  createdAt: string;
  updatedAt: string;
  // Aroma profile provenance (sommelier v2)
  aromaConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  aromaSource?: 'AI' | 'USER' | 'TASTING' | 'COMMUNITY' | 'CONSENSUS' | null;
  aromaVerifiedAt?: string | null;
  aromaVerifiedBy?: string | null;
  aromaProvider?: string | null;
  // Peak drinking window — optionally stored by AI/USER on the backend
  peakStart?: number;
  peakEnd?: number;
  peakSource?: 'AI' | 'USER' | 'COMMUNITY' | 'NAIVE';
  peakConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  peakReasoning?: string | null;
  peakComputedAt?: string | null;
  // Enrichissement sourcé : niveau atteint, sources vérifiées, état
  enrichmentBasis?: EnrichmentLevel | null;
  enrichmentSources?: EnrichmentSource[] | null;
  enrichmentStatus?: 'ok' | 'needs_review' | 'error' | null;
  peakVerifiedBy?: string | null;
}

export interface Bottle {
  id: string;
  wineId: string;
  location: BottleLocation | string;
  addedByUserId: string;
  purchaseDate?: string;
  purchasePrice?: number;
  isConsumed: boolean;
  consumedDate?: string;
  giftedTo?: string;
  giftOccasion?: string;
  createdAt?: string;
}

export interface WishlistItem {
  id: string;
  name: string;
  producer?: string;
  region?: string;
  appellation?: string;
  type?: WineType;
  vintage?: number;
  notes?: string;
  source?: string;
  estimatedPrice?: number;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  addedAt: string;
}

export interface BottleLocation {
  rackId: string;
  x: number;
  y: number;
}

export interface CellarWine extends Wine {
  inventoryCount: number;
  bottles: Bottle[];
}

export interface Rack {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'SHELF' | 'BOX';
  sortOrder?: number;
  createdAt?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  type: 'IN' | 'OUT' | 'MOVE' | 'GIFT' | 'NOTE';
  wineId?: string;
  wineName: string;
  wineVintage?: number;
  quantity?: number;
  description?: string;
  fromLocation?: string;
  toLocation?: string;
  recipient?: string;
  occasion?: string;
  note?: string;
  userId?: string;
}

// Note de dégustation telle que renvoyée par /api/tasting-notes (table
// tasting_notes), plus deux champs dérivés par storageService.getTastingNotes.
export interface TastingNote {
  id: string;
  wineId: string;
  date: string;
  overallRating: number | null; // 0-5 étoiles
  visualNotes: unknown;
  noseNotes: unknown;
  palateNotes: unknown;
  generalNotes: string | null; // texte libre, ou JSON de la dégustation express
  occasion: string | null;
  companions: string | null;
  createdAt: string;
  updatedAt: string;
  // Dérivés
  rating: number | null; // = overallRating
  notes: string; // phrase libre de la dégustation express, sinon generalNotes
}

// Corps de POST /api/tasting-notes.
export interface NewTastingNote {
  wineId: string;
  date?: string;
  overallRating?: number | null;
  visualNotes?: unknown;
  noseNotes?: unknown;
  palateNotes?: unknown;
  generalNotes?: string | null;
  occasion?: string | null;
  companions?: string | null;
}

export interface SensoryProfile {
  body: number;
  acidity: number;
  tannin: number;
  sweetness: number;
  alcohol: number;
  flavors: string[];
}

export type WineType = 'RED' | 'WHITE' | 'ROSE' | 'SPARKLING' | 'DESSERT' | 'FORTIFIED';

export enum SpiritType {
  WHISKY = 'WHISKY',
  GIN = 'GIN',
  VODKA = 'VODKA',
  RUM = 'RUM',
  TEQUILA = 'TEQUILA',
  COGNAC = 'COGNAC',
  VERMOUTH = 'VERMOUTH',
  LIQUEUR = 'LIQUEUR',
  BITTER = 'BITTER',
  OTHER = 'OTHER'
}

export interface Spirit {
  id: string;
  name: string;
  category: SpiritType;
  distillery: string;
  region?: string;
  country?: string;
  age?: string;
  caskType?: string;
  abv: number;
  format: number;
  description: string;
  producerHistory: string;
  tastingNotes: string;
  aromaProfile: string[];
  suggestedCocktails: string[];
  culinaryPairings: string[];
  enrichedByAi: boolean;
  addedAt: string;
  isOpened: boolean;
  inventoryLevel: number;
  isLuxury: boolean;
}

export interface CocktailIngredient {
  name: string;
  amount: number;
  unit: 'ml' | 'cl' | 'oz' | 'dash' | 'spoon' | 'piece';
  optional: boolean;
}

export interface CocktailRecipe {
  id: string;
  name: string;
  category: 'CLASSIC' | 'MODERN' | 'TIKI' | 'SOUR' | 'HIGHBALL' | 'NON_ALCOHOLIC';
  baseSpirit?: string;
  ingredients: CocktailIngredient[];
  instructions: string[];
  glassType: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  prepTime: number;
  imageUrl?: string;
  source: 'API' | 'MANUAL' | 'AI';
  tags: string[];
  isFavorite: boolean;
}

// Clés IA saisies dans les Réglages : envoyées au serveur, qui les utilise en
// secours de ses propres clés (ALLOW_CLIENT_AI_KEYS). Aucun appel IA ne part du navigateur.
export interface AIConfig {
  keys: {
    gemini?: string;
    claude?: string;
  };
}

// ─── Enrichissement sourcé (cascade de recherche web) ───
export type EnrichmentLevel = 'EXACT' | 'AUTRE_MILLESIME' | 'PRODUCTEUR' | 'APPELLATION' | 'REGLES';

export interface EnrichmentSource {
  url: string;
  title?: string;
  excerpt?: string;
  level?: EnrichmentLevel;
  vintage?: number | null;
  check?: 'verified' | 'not_found' | 'unreachable';
  domain?: string | null;
}

export interface EnrichmentCandidate {
  producer?: string | null;
  cuvee?: string | null;
  location?: string | null;
  evidence?: string | null;
  url?: string | null;
}

export interface EnrichmentLogEntry {
  id: number;
  created_at: string;
  engine: string;
  trigger: string;
  ok: boolean;
  basis: EnrichmentLevel | null;
  changes: Record<string, any> | null;
  error: string | null;
  reverted_at: string | null;
}

export interface WineEnrichment {
  basis: EnrichmentLevel | null;
  basisLabel: string | null;
  sources: EnrichmentSource[];
  enrichedAt: string | null;
  nextCheckAt: string | null;
  status: 'ok' | 'needs_review' | 'error' | null;
  candidates: EnrichmentCandidate[];
  hint: string | null;
  error: string | null;
  inProgress: boolean;
  queuePosition: number | null;
  log: EnrichmentLogEntry[];
}

// ─── Valeur de la cave ───
/** `value` est null tant qu'aucune bouteille en cave n'a de cote à cette date. */
export interface CellarValuePoint { month: string; invested: number; value: number | null; estimatedPurchase: number; }
export interface ValueMover { wineId: string; name: string; vintage: number | null; price: number; avgPurchase: number; gainPerBottle: number; gainTotal: number; }
export interface CellarValue {
  series: CellarValuePoint[];
  today: { invested: number; estimatedPurchase: number; value: number; gain: number; gainPct: number | null };
  coverage: { bottles: number; withPrice: number; withValuation: number };
  movers: { up: ValueMover[]; down: ValueMover[] };
}
export interface ValuationSource { url: string; title: string; quote: string; price_eur: number; format_ml: number; status: 'verified' | 'not_found' | 'unreachable'; counted?: boolean; }
export interface WineValuation {
  id: number; wineId: string; valuedAt: string; priceEur: number; lowEur: number | null; highEur: number | null;
  basis: 'EXACT' | 'AUTRE_MILLESIME' | 'USER'; basisVintage: number | null; sources: ValuationSource[]; engine: string | null; note: string | null;
}
export interface WineValuations { latest: WineValuation | null; history: WineValuation[]; status: 'OK' | 'NONE' | 'ERROR' | null; nextCheckAt: string | null; }
export interface MissingPriceRow { wineId: string; name: string; cuvee: string | null; vintage: number | null; format: string | null; missing: number; suggestedPrice: number | null; }
