// Enum for wine types
export enum WineType {
  RED = 'RED',
  WHITE = 'WHITE',
  ROSE = 'ROSE',
  SPARKLING = 'SPARKLING',
  DESSERT = 'DESSERT',
  FORTIFIED = 'FORTIFIED'
}

// Enum for Spirit types
export enum SpiritType {
  WHISKY = 'WHISKY',
  RUM = 'RUM',
  GIN = 'GIN',
  VODKA = 'VODKA',
  TEQUILA = 'TEQUILA',
  COGNAC = 'COGNAC',
  LIQUEUR = 'LIQUEUR',
  VERMOUTH = 'VERMOUTH',
  BITTER = 'BITTER',
  OTHER = 'OTHER'
}

// --- AI CONFIGURATION ---
export type AIProvider = 'GEMINI' | 'OPENAI' | 'MISTRAL';

export interface AIConfig {
  provider: AIProvider;
  keys: {
    gemini: string;
    openai: string;
    mistral: string;
  };
}

// Represents the SQL 'users' table
export interface User {
  id: string;
  name: string;
  role: 'admin' | 'member';
  preferences: string[];
}

// Represents the sensory profile (JSON blob in SQL)
export interface SensoryProfile {
  body: number;
  acidity: number;
  tannin: number;
  sweetness: number;
  alcohol: number;
  flavors: string[];
}

// Represents the SQL 'wines' table (The Master Data)
export interface Wine {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  region: string;
  country: string;
  type: WineType;
  grapeVarieties: string[];
  cuvee?: string;
  parcel?: string;
  format: string;
  personalNotes: string[];
  sensoryDescription: string;
  aromaProfile?: string[];
  tastingNotes?: string;
  suggestedFoodPairings: string[];
  producerHistory?: string;
  enrichedByAI: boolean;
  aiConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  sensoryProfile: SensoryProfile;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Physical Location System
export interface BottleLocation {
  rackId: string;
  x: number;
  y: number;
}

export interface Rack {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'SHELF' | 'DIAMOND' | 'BOX';
}

// Represents the SQL 'bottles' table (Inventory)
export interface Bottle {
  id: string;
  wineId: string;
  location: string | BottleLocation;
  addedByUserId: string;
  purchaseDate: string;
  isConsumed: boolean;
  consumedDate?: string;
  notes?: string;
}

export interface TimelineEvent {
  date: string;
  type: 'IN' | 'OUT' | 'MOVE';
  description: string;
  user: string;
}

// --- BAR & COCKTAILS ---

export interface Spirit {
  id: string;
  name: string;
  type: SpiritType;  // Alias for category (used in UI)
  category?: SpiritType;  // Original field
  brand?: string;
  distillery?: string;
  region?: string;
  country?: string;
  age?: string;
  caskType?: string;
  abv?: number;
  format?: number;
  description?: string;
  notes?: string;
  producerHistory?: string;
  tastingNotes?: string;
  aromaProfile?: string[];
  suggestedCocktails?: string[];
  culinaryPairings?: string[];
  image?: string;
  enrichedByAI?: boolean;
  addedAt?: string;
  isOpened?: boolean;
  openedAt?: string;
  level: number;  // 1-5 bottle level
  inventoryLevel?: number;  // Percentage (legacy)
  isPrestige: boolean;
  isLuxury?: boolean;  // Alias for isPrestige
  icon?: string;
}

export interface CocktailIngredient {
  name: string;
  amount: number;
  unit: 'ml' | 'cl' | 'oz' | 'dash' | 'spoon' | 'slice' | 'piece';
  optional: boolean;
}

export interface CocktailRecipe {
  id: string;
  name: string;
  category: 'CLASSIC' | 'MODERN' | 'TROPICAL' | 'NON_ALCOHOLIC' | 'OTHER';
  baseSpirit?: string;
  ingredients: CocktailIngredient[];
  instructions: string[];
  glassType: string;
  difficulty: 'Easy' | 'Medium' | 'Expert';
  prepTime: number;
  description?: string;
  history?: string;
  tags: string[];
  imageUrl?: string;
  source: 'MANUAL' | 'API' | 'AI';
  isFavorite: boolean;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  category: 'SPIRIT' | 'MIXER' | 'FRUIT' | 'OTHER';
  quantity: number;
  isChecked: boolean;
  forRecipeId?: string;
}

// --- SOMMELIER & TASTE PROFILE ---

export interface UserTasteProfile {
  id: string;
  userId: string;
  favoriteGrapes: Record<string, number>;
  favoriteRegions: Record<string, number>;
  stylePreferences: SensoryProfile;
  lastUpdated: string;
}

export interface TastingHistory {
  id: string;
  wineId: string;
  rating: number;
  date: string;
  context?: string;
  notes?: string;
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
    type: 'COCKTAIL' | 'WINE';
    id?: string;
    name: string;
    description: string;
    pairingSnack?: string;
  };
  mainCourse: {
    dishName: string;
    wineId?: string;
    wineName: string;
    pairingReason: string;
  };
  digestif: {
    spiritId?: string;
    spiritName: string;
    description: string;
  };
}

// --- SHOPPING / WINE FAIR ---

export interface BuyingSuggestion {
  id: string;
  region: string;
  type: WineType;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  budgetRecommendation?: string;
  specificTarget?: string;
}

export interface CellarGapAnalysis {
  generalAnalysis: string;
  gaps: string[];
  suggestions: BuyingSuggestion[];
}

// Combined view for UI
export interface CellarWine extends Wine {
  inventoryCount: number;
  bottles: Bottle[];
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
