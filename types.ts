// types.ts - Fichier complet avec les corrections

export interface Wine {
  id: string;
  name: string;
  cuvee?: string;
  parcel?: string;
  producer: string;
  vintage: number;
  region: string;
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
}

export interface Bottle {
  id: string;
  wineId: string;
  location: BottleLocation | string;
  addedByUserId: string;
  purchaseDate?: string;
  isConsumed: boolean;
  consumedDate?: string;
  giftedTo?: string;
  giftOccasion?: string;
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
}

export interface TimelineEvent {
  date: string;
  type: 'IN' | 'OUT' | 'MOVE' | 'GIFT' | 'NOTE';
  description: string;
  user: string;
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

export interface ShoppingListItem {
  id: string;
  name: string;
  category: 'SPIRIT' | 'MIXER' | 'FRUIT' | 'GARNISH' | 'OTHER';
  quantity: number;
  isChecked: boolean;
}

export interface SommelierRecommendation {
  wineId: string;
  score: number;
  reasoning: string;
  servingTemp: string;
  decanting: boolean;
  foodPairingMatch: string;
  alternative?: string;
}

export interface EveningPlan {
  theme: string;
  aperitif: {
    type: string;
    name: string;
    description: string;
    pairingSnack?: string;
  };
  mainCourse: {
    dishName: string;
    wineName: string;
    pairingReason: string;
  };
  digestif: {
    spiritName: string;
    description: string;
  };
}

export interface UserTasteProfile {
  id: string;
  userId: string;
  favoriteGrapes: Record<string, number>;
  favoriteRegions: Record<string, number>;
  stylePreferences: SensoryProfile;
  lastUpdated: string;
}

export interface CellarGapAnalysis {
  generalAnalysis: string;
  gaps: string[];
  suggestions: {
    id?: string;
    region: string;
    type: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    budgetRecommendation: string;
    specificTarget: string;
  }[];
}

export type AIProvider = 'GEMINI' | 'OPENAI' | 'MISTRAL';

export interface AIConfig {
  provider: AIProvider;
  keys: {
    gemini: string;
    openai: string;
    mistral: string;
  };
}

export interface FullBackupData {
  wines: Wine[];
  bottles: Bottle[];
  racks: Rack[];
  spirits: Spirit[];
  cocktails: CocktailRecipe[];
  shoppingList: ShoppingListItem[];
  timestamp: string;
}