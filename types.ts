

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
  body: number; // 0-100
  acidity: number; // 0-100
  tannin: number; // 0-100
  sweetness: number; // 0-100
  alcohol: number; // 0-100
  flavors: string[]; // ["Cherry", "Leather", "Oak"]
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
  
  cuvee?: string; // Ex: "Orgasme", "Grande Réserve"
  parcel?: string; // Ex: "Monts de Milieu", "Les Clos"
  
  format: string;
  personalNotes: string[];
  
  sensoryDescription: string;
  aromaProfile: string[];
  tastingNotes: string;
  suggestedFoodPairings: string[];
  producerHistory: string;
  enrichedByAI: boolean;
  aiConfidence?: 'HIGH' | 'MEDIUM' | 'LOW'; // New field for validation

  sensoryProfile: SensoryProfile;
  
  isFavorite?: boolean;
  
  createdAt: string;
  updatedAt: string;
}

// Physical Location System
export interface BottleLocation {
  rackId: string;
  x: number; // Column
  y: number; // Row
}

export interface Rack {
  id: string;
  name: string;
  width: number; // Columns
  height: number; // Rows
  type: 'SHELF' | 'DIAMOND' | 'BOX';
}

// Represents the SQL 'bottles' table (Inventory)
export interface Bottle {
  id: string;
  wineId: string;
  location: string | BottleLocation; // Updated to support complex objects
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

// --- V2: BAR & COCKTAILS ---

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
  format: number; // ml
  
  description: string;
  producerHistory: string;
  tastingNotes: string; // "Nez: X, Bouche: Y, Finale: Z"
  aromaProfile: string[];
  
  suggestedCocktails: string[]; // Names of classic cocktails
  culinaryPairings: string[];
  
  image?: string;
  enrichedByAI: boolean;
  addedAt: string;
  isOpened: boolean;
  openedAt?: string;
  inventoryLevel: number; // 0-100%
  
  isLuxury: boolean; // If true, excluded from standard cocktail suggestions
  icon?: string; // Optional custom icon name
}

export interface CocktailIngredient {
  name: string;
  amount: number; // 0 if garnish
  unit: 'ml' | 'cl' | 'oz' | 'dash' | 'spoon' | 'slice' | 'piece';
  optional: boolean;
}

export interface CocktailRecipe {
  id: string;
  name: string;
  category: 'CLASSIC' | 'MODERN' | 'TROPICAL' | 'NON_ALCOHOLIC' | 'OTHER';
  baseSpirit?: string; // e.g., "Gin"
  ingredients: CocktailIngredient[];
  instructions: string[];
  glassType: string;
  difficulty: 'Easy' | 'Medium' | 'Expert';
  prepTime: number; // minutes
  
  description?: string;
  history?: string; // AI generated context
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
  forRecipeId?: string; // Linked to a party or recipe
}

// --- V2: SOMMELIER & TASTE PROFILE ---

export interface UserTasteProfile {
  id: string;
  userId: string;
  favoriteGrapes: Record<string, number>; // Grape name -> Score (0-100)
  favoriteRegions: Record<string, number>;
  stylePreferences: SensoryProfile; // The "Ideal" wine profile for this user
  lastUpdated: string;
}

export interface TastingHistory {
  id: string;
  wineId: string;
  rating: number; // 1-5
  date: string;
  context?: string; // "Dinner with friends"
  notes?: string;
}

export interface SommelierRecommendation {
  wineId: string;
  score: number; // Match score 0-100
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
    id?: string; // ID of cocktail or wine if in stock
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

// --- V2: SHOPPING / WINE FAIR ---

export interface BuyingSuggestion {
  id: string;
  region: string;
  type: WineType;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string; // "To balance your lack of whites"
  budgetRecommendation?: string; // "20-30€"
  specificTarget?: string; // "Look for 2019 Gigondas"
}

export interface CellarGapAnalysis {
  generalAnalysis: string; // "Your cellar is heavily focused on Bordeaux..."
  gaps: string[]; // ["Missing mineral whites", "No dessert wines"]
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
