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
  enrichedByAI: boolean;
  aiConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  isFavorite: boolean;
  sensoryProfile: SensoryProfile;
  createdAt: string;
  updatedAt: string;
  // Peak drinking window — optionally stored by AI/USER on the backend
  peakStart?: number;
  peakEnd?: number;
  peakSource?: 'AI' | 'USER' | 'NAIVE';
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

// Forme utilisée par le front (hooks/useTastingNotes). Diffère de la table
// tasting_notes renvoyée par /api/tasting-notes (overallRating, noseNotes…).
export interface TastingNote {
  id: string;
  wineId: string;
  wineName: string;
  wineVintage: number;
  date: string;
  visual: number;
  visualNotes: string;
  nose: string[];
  body: number;
  acidity: number;
  tannin: number;
  finish: number;
  rating: number;
  pairedWith?: string;
  pairingQuality?: number;
  pairingSuggestion?: string;
  notes: string;
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
  enrichedByAI: boolean;
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

export type AIProvider = 'GEMINI' | 'OPENAI' | 'MISTRAL' | 'CLAUDE';

export interface AIConfig {
  provider: AIProvider;
  keys: {
    gemini: string;
    openai: string;
    mistral: string;
    claude?: string;
  };
}
