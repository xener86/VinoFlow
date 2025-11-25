import { 
  Wine, Bottle, CellarWine, Rack, Spirit, SpiritType, 
  FullBackupData, TimelineEvent, BottleLocation, CocktailRecipe, 
  ShoppingListItem, UserTasteProfile, AIConfig, SensoryProfile,
  WineType
} from '../types';

// Storage keys
const STORAGE_KEYS = {
  WINES: 'vf_wines',
  BOTTLES: 'vf_bottles',
  RACKS: 'vf_racks',
  SPIRITS: 'vf_spirits',
  COCKTAILS: 'vf_cocktails',
  SHOPPING: 'vf_shopping',
  TASTE_PROFILE: 'vf_taste_profile',
  AI_CONFIG: 'vf_ai_config',
} as const;

// Default sensory profile
const defaultSensoryProfile: SensoryProfile = {
  body: 50,
  acidity: 50,
  tannin: 50,
  sweetness: 10,
  alcohol: 50,
  flavors: []
};

// Mock Data - Wines
const MOCK_WINES: Wine[] = [
  {
    id: 'w1',
    name: 'Château Margaux',
    producer: 'Château Margaux',
    vintage: 2015,
    region: 'Bordeaux',
    country: 'France',
    type: WineType.RED,
    grapeVarieties: ['Cabernet Sauvignon', 'Merlot', 'Petit Verdot'],
    format: '750ml',
    personalNotes: ['Cadeau de Jean', 'Ouvrir après 2025'],
    sensoryDescription: 'Un immense bouquet de fruits noirs, de fleurs printanières, de chêne raffiné et de graphite.',
    aromaProfile: ['Cassis', 'Violette', 'Graphite', 'Cèdre', 'Tabac'],
    tastingNotes: 'Robe rubis profond. Le nez est complexe avec des couches de fruits noirs.',
    suggestedFoodPairings: ['Agneau rôti au romarin', 'Bœuf Wellington', 'Risotto à la truffe'],
    producerHistory: 'Château Margaux, Premier Grand Cru Classé, remonte au XIIe siècle.',
    enrichedByAI: true,
    sensoryProfile: { body: 90, acidity: 75, tannin: 85, sweetness: 5, alcohol: 70, flavors: ['Cassis', 'Violette', 'Cèdre'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'w2',
    name: 'Cloudy Bay Sauvignon Blanc',
    producer: 'Cloudy Bay',
    vintage: 2023,
    region: 'Marlborough',
    country: 'Nouvelle-Zélande',
    type: WineType.WHITE,
    grapeVarieties: ['Sauvignon Blanc'],
    format: '750ml',
    personalNotes: [],
    sensoryDescription: 'Vibrant et expressif, offrant une explosion de fruit de la passion et de combava.',
    aromaProfile: ['Fruit de la Passion', 'Combava', 'Pamplemousse'],
    suggestedFoodPairings: ['Huîtres fraîches', 'Salade de chèvre chaud'],
    producerHistory: 'Fondé en 1985, Cloudy Bay fut l\'un des premiers domaines de Marlborough.',
    enrichedByAI: true,
    sensoryProfile: { body: 40, acidity: 95, tannin: 0, sweetness: 10, alcohol: 60, flavors: ['Passionfruit', 'Citron vert'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

// Mock Data - Physical Cellar Racks
const MOCK_RACKS: Rack[] = [
  { id: 'r1', name: 'EuroCave Principal', width: 6, height: 8, type: 'SHELF' },
  { id: 'box1', name: 'Caisse Margaux 2015', width: 3, height: 2, type: 'BOX' } 
];

// Mock Data - Bottles with physical locations
const MOCK_BOTTLES: Bottle[] = [
  { id: 'b1', wineId: 'w1', location: { rackId: 'r1', x: 0, y: 0 }, addedByUserId: 'u1', purchaseDate: '2020-01-01', isConsumed: false },
  { id: 'b2', wineId: 'w1', location: { rackId: 'r1', x: 1, y: 0 }, addedByUserId: 'u1', purchaseDate: '2020-01-01', isConsumed: false },
  { id: 'b3', wineId: 'w2', location: { rackId: 'r1', x: 0, y: 1 }, addedByUserId: 'u2', purchaseDate: '2023-12-01', isConsumed: false },
  { id: 'b4', wineId: 'w1', location: { rackId: 'box1', x: 0, y: 0 }, addedByUserId: 'u1', purchaseDate: '2016-05-20', isConsumed: false },
  { id: 'b5', wineId: 'w1', location: { rackId: 'box1', x: 1, y: 0 }, addedByUserId: 'u1', purchaseDate: '2016-05-20', isConsumed: false },
  { id: 'b6', wineId: 'w1', location: { rackId: 'box1', x: 2, y: 0 }, addedByUserId: 'u1', purchaseDate: '2016-05-20', isConsumed: false },
];

// Mock Data - Spirits
const MOCK_SPIRITS: Spirit[] = [
  {
    id: 's1',
    name: 'Lagavulin 16',
    type: SpiritType.WHISKY,
    brand: 'Lagavulin',
    distillery: 'Lagavulin',
    region: 'Islay',
    country: 'Scotland',
    age: '16 Year',
    caskType: 'Oak',
    abv: 43,
    format: 700,
    description: 'Un single malt d\'Islay intensément tourbé, riche et sec.',
    producerHistory: 'Située sur la côte sud d\'Islay, la distillerie Lagavulin produit des whiskies tourbés depuis 1816.',
    tastingNotes: 'Fumée de tourbe intense, iode, fruits secs riches.',
    aromaProfile: ['Tourbe', 'Fumée', 'Iode', 'Sherry'],
    suggestedCocktails: ['Penicillin', 'Smoky Old Fashioned'],
    culinaryPairings: ['Roquefort', 'Chocolat noir'],
    enrichedByAI: true,
    addedAt: new Date().toISOString(),
    isOpened: true,
    level: 3,
    isPrestige: true
  },
  {
    id: 's2',
    name: 'Hendrick\'s Gin',
    type: SpiritType.GIN,
    brand: 'Hendrick\'s',
    distillery: 'Girvan',
    region: 'Scotland',
    country: 'Scotland',
    abv: 41.4,
    format: 700,
    description: 'Un gin infusé à la rose et au concombre, curieusement rafraîchissant.',
    aromaProfile: ['Rose', 'Concombre', 'Genévrier', 'Agrumes'],
    suggestedCocktails: ['Gin & Tonic', 'Cucumber Cooler', 'Martini'],
    culinaryPairings: ['Salade de concombre', 'Saumon fumé'],
    enrichedByAI: true,
    addedAt: new Date().toISOString(),
    isOpened: false,
    level: 5,
    isPrestige: false
  }
];

// Mock Cocktails
const MOCK_COCKTAILS: CocktailRecipe[] = [
  {
    id: 'c1',
    name: 'Old Fashioned',
    category: 'CLASSIC',
    baseSpirit: 'Whisky',
    ingredients: [
      { name: 'Whisky', amount: 60, unit: 'ml', optional: false },
      { name: 'Sucre', amount: 1, unit: 'piece', optional: false },
      { name: 'Angostura Bitters', amount: 3, unit: 'dash', optional: false },
    ],
    instructions: ['Mélanger le sucre, l\'eau et le bitter dans un verre.', 'Ajouter le whisky et la glace.'],
    glassType: 'Old Fashioned',
    difficulty: 'Easy',
    prepTime: 5,
    tags: ['Classic', 'Strong'],
    source: 'MANUAL',
    isFavorite: true
  }
];

const MOCK_SHOPPING: ShoppingListItem[] = [
  { id: 'sl1', name: 'Citrons Verts', category: 'FRUIT', quantity: 6, isChecked: false },
  { id: 'sl2', name: 'Tonic Water', category: 'MIXER', quantity: 4, isChecked: true },
];

const MOCK_TASTE_PROFILE: UserTasteProfile = {
  id: 'profile1',
  userId: 'u1',
  favoriteGrapes: { 'Pinot Noir': 85, 'Chardonnay': 70, 'Syrah': 60 },
  favoriteRegions: { 'Bourgogne': 90, 'Vallée du Rhône': 65 },
  stylePreferences: { body: 60, acidity: 75, tannin: 40, sweetness: 10, alcohol: 50, flavors: ['Fruité', 'Floral'] },
  lastUpdated: new Date().toISOString()
};

// --- Helper Functions ---

const getFromStorage = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const saveToStorage = <T>(key: string, data: T): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Storage save failed:', e);
  }
};

// --- Wine & Inventory ---

export const getWines = (): Wine[] => {
  return getFromStorage(STORAGE_KEYS.WINES, MOCK_WINES);
};

export const getBottles = (): Bottle[] => {
  return getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
};

export const getConsumptionHistory = (): Array<{ date: string; wineId: string }> => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  return bottles
    .filter(b => b.isConsumed && b.consumedDate)
    .map(b => ({ date: b.consumedDate!, wineId: b.wineId }));
};

export const getInventory = (): CellarWine[] => {
  const wines: Wine[] = getFromStorage(STORAGE_KEYS.WINES, MOCK_WINES);
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);

  return wines.map(wine => {
    const wineBottles = bottles.filter(b => b.wineId === wine.id && !b.isConsumed);
    return {
      ...wine,
      inventoryCount: wineBottles.length,
      bottles: wineBottles
    };
  });
};

export const getWineById = (id: string): CellarWine | null => {
  const inventory = getInventory();
  return inventory.find(w => w.id === id) || null;
};

export const getWineHistory = (wineId: string): TimelineEvent[] => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  const relevantBottles = bottles.filter(b => b.wineId === wineId);
  const events: TimelineEvent[] = [];

  relevantBottles.forEach(b => {
    events.push({
      date: b.purchaseDate || new Date().toISOString(),
      type: 'IN',
      description: 'Achat / Ajout',
      user: 'Moi'
    });

    if (b.isConsumed && b.consumedDate) {
      events.push({
        date: b.consumedDate,
        type: 'OUT',
        description: 'Consommée',
        user: 'Moi'
      });
    }
  });

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const saveWine = (wine: Wine, count: number): void => {
  const wines: Wine[] = getFromStorage(STORAGE_KEYS.WINES, MOCK_WINES);
  const existingIdx = wines.findIndex(w => w.id === wine.id);
  
  if (existingIdx >= 0) {
    wines[existingIdx] = wine;
  } else {
    wines.push(wine);
  }
  saveToStorage(STORAGE_KEYS.WINES, wines);

  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  for (let i = 0; i < count; i++) {
    bottles.push({
      id: crypto.randomUUID(),
      wineId: wine.id,
      location: 'Non trié',
      addedByUserId: 'current',
      purchaseDate: new Date().toISOString(),
      isConsumed: false
    });
  }
  saveToStorage(STORAGE_KEYS.BOTTLES, bottles);
};

export const updateWine = (wine: Wine): void => {
  const wines: Wine[] = getFromStorage(STORAGE_KEYS.WINES, MOCK_WINES);
  const existingIdx = wines.findIndex(w => w.id === wine.id);
  if (existingIdx >= 0) {
    wines[existingIdx] = { ...wines[existingIdx], ...wine, updatedAt: new Date().toISOString() };
    saveToStorage(STORAGE_KEYS.WINES, wines);
  }
};

export const addBottles = (wineId: string, count: number): void => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  for (let i = 0; i < count; i++) {
    bottles.push({
      id: crypto.randomUUID(),
      wineId: wineId,
      location: 'Non trié',
      addedByUserId: 'current',
      purchaseDate: new Date().toISOString(),
      isConsumed: false
    });
  }
  saveToStorage(STORAGE_KEYS.BOTTLES, bottles);
};

export const addBottleAtLocation = (wineId: string, location: BottleLocation): void => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  bottles.push({
    id: crypto.randomUUID(),
    wineId: wineId,
    location: location,
    addedByUserId: 'current',
    purchaseDate: new Date().toISOString(),
    isConsumed: false
  });
  saveToStorage(STORAGE_KEYS.BOTTLES, bottles);
};

export const consumeBottle = (wineId: string): void => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  const targetBottle = bottles.find(b => b.wineId === wineId && !b.isConsumed);
  if (targetBottle) {
    targetBottle.isConsumed = true;
    targetBottle.consumedDate = new Date().toISOString();
    saveToStorage(STORAGE_KEYS.BOTTLES, bottles);
  }
};

export const consumeSpecificBottle = (bottleId: string): void => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  const targetBottle = bottles.find(b => b.id === bottleId);
  if (targetBottle) {
    targetBottle.isConsumed = true;
    targetBottle.consumedDate = new Date().toISOString();
    saveToStorage(STORAGE_KEYS.BOTTLES, bottles);
  }
};

export const moveBottle = (bottleId: string, newLocation: BottleLocation): boolean => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  const bottleIdx = bottles.findIndex(b => b.id === bottleId);
  
  if (bottleIdx >= 0) {
    bottles[bottleIdx].location = newLocation;
    saveToStorage(STORAGE_KEYS.BOTTLES, bottles);
    return true;
  }
  return false;
};

// --- Racks ---

export const getRacks = (): Rack[] => {
  return getFromStorage(STORAGE_KEYS.RACKS, MOCK_RACKS);
};

export const saveRack = (rack: Rack): void => {
  const racks = getRacks();
  const existingIndex = racks.findIndex(r => r.id === rack.id);
  if (existingIndex >= 0) {
    racks[existingIndex] = rack;
  } else {
    racks.push(rack);
  }
  saveToStorage(STORAGE_KEYS.RACKS, racks);
};

export const updateRack = (id: string, updates: Partial<Rack>): void => {
  const racks = getRacks();
  const index = racks.findIndex(r => r.id === id);
  if (index >= 0) {
    racks[index] = { ...racks[index], ...updates };
    saveToStorage(STORAGE_KEYS.RACKS, racks);
  }
};

export const deleteRack = (id: string): void => {
  // First update bottles to mark them as unsorted
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  const updatedBottles = bottles.map(b => {
    if (typeof b.location !== 'string' && b.location.rackId === id) {
      return { ...b, location: 'Non trié' as string };
    }
    return b;
  });
  saveToStorage(STORAGE_KEYS.BOTTLES, updatedBottles);
  
  // Then remove the rack
  const racks = getRacks().filter(r => r.id !== id);
  saveToStorage(STORAGE_KEYS.RACKS, racks);
};

export const fillRackWithWine = (rackId: string, wineId: string, width: number, height: number): void => {
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isOccupied = bottles.some((b: Bottle) => 
        !b.isConsumed && 
        typeof b.location !== 'string' && 
        b.location.rackId === rackId && 
        b.location.x === x && 
        b.location.y === y
      );

      if (!isOccupied) {
        bottles.push({
          id: crypto.randomUUID(),
          wineId: wineId,
          location: { rackId, x, y },
          addedByUserId: 'current',
          purchaseDate: new Date().toISOString(),
          isConsumed: false
        });
      }
    }
  }
  saveToStorage(STORAGE_KEYS.BOTTLES, bottles);
};

export const findNextAvailableSlot = (): { location: BottleLocation; rackName: string } | null => {
  const racks = getRacks().filter(r => r.type === 'SHELF');
  const bottles: Bottle[] = getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES);

  for (const rack of racks) {
    for (let y = 0; y < rack.height; y++) {
      for (let x = 0; x < rack.width; x++) {
        const isOccupied = bottles.some((b: Bottle) => 
          !b.isConsumed && 
          typeof b.location !== 'string' && 
          b.location.rackId === rack.id && 
          b.location.x === x && 
          b.location.y === y
        );
        
        if (!isOccupied) {
          return {
            location: { rackId: rack.id, x, y },
            rackName: rack.name
          };
        }
      }
    }
  }
  return null;
};

// --- Spirits ---

export const getSpirits = (): Spirit[] => {
  return getFromStorage(STORAGE_KEYS.SPIRITS, MOCK_SPIRITS);
};

export const saveSpirits = (spirits: Spirit[]): void => {
  saveToStorage(STORAGE_KEYS.SPIRITS, spirits);
};

export const getSpiritById = (id: string): Spirit | undefined => {
  return getSpirits().find(s => s.id === id);
};

export const saveSpirit = (spirit: Spirit): void => {
  const spirits = getSpirits();
  const existingIndex = spirits.findIndex(s => s.id === spirit.id);
  if (existingIndex >= 0) {
    spirits[existingIndex] = spirit;
  } else {
    spirits.push(spirit);
  }
  saveToStorage(STORAGE_KEYS.SPIRITS, spirits);
};

export const toggleSpiritLuxury = (id: string): void => {
  const spirits = getSpirits();
  const spirit = spirits.find(s => s.id === id);
  if (spirit) {
    spirit.isLuxury = !spirit.isLuxury;
    saveToStorage(STORAGE_KEYS.SPIRITS, spirits);
  }
};

// --- Cocktails ---

export const getCocktails = (): CocktailRecipe[] => {
  return getFromStorage(STORAGE_KEYS.COCKTAILS, MOCK_COCKTAILS);
};

export const saveCocktail = (recipe: CocktailRecipe): void => {
  const cocktails = getCocktails();
  const existing = cocktails.findIndex(c => c.id === recipe.id);
  if (existing >= 0) {
    cocktails[existing] = recipe;
  } else {
    cocktails.push(recipe);
  }
  saveToStorage(STORAGE_KEYS.COCKTAILS, cocktails);
};

// --- Shopping List ---

export const getShoppingList = (): ShoppingListItem[] => {
  return getFromStorage(STORAGE_KEYS.SHOPPING, MOCK_SHOPPING);
};

export const toggleShoppingItem = (id: string): void => {
  const list = getShoppingList();
  const item = list.find(i => i.id === id);
  if (item) {
    item.isChecked = !item.isChecked;
    saveToStorage(STORAGE_KEYS.SHOPPING, list);
  }
};

export const addToShoppingList = (name: string, quantity: number, category: 'SPIRIT' | 'MIXER' | 'FRUIT' | 'OTHER' = 'OTHER'): void => {
  const list = getShoppingList();
  list.push({
    id: crypto.randomUUID(),
    name,
    quantity,
    category,
    isChecked: false
  });
  saveToStorage(STORAGE_KEYS.SHOPPING, list);
};

// --- User Profile ---

export const getUserTasteProfile = (): UserTasteProfile => {
  return getFromStorage(STORAGE_KEYS.TASTE_PROFILE, MOCK_TASTE_PROFILE);
};

export const updateUserTasteProfile = (profile: UserTasteProfile): void => {
  saveToStorage(STORAGE_KEYS.TASTE_PROFILE, profile);
};

// --- AI Configuration ---

export const getAIConfig = (): AIConfig => {
  const stored = getFromStorage<AIConfig | null>(STORAGE_KEYS.AI_CONFIG, null);
  if (!stored) {
    const legacyKey = typeof window !== 'undefined' ? localStorage.getItem('vf_api_key') || '' : '';
    return {
      provider: 'GEMINI',
      keys: {
        gemini: legacyKey,
        openai: '',
        mistral: ''
      }
    };
  }
  return stored;
};

export const saveAIConfig = (config: AIConfig): void => {
  saveToStorage(STORAGE_KEYS.AI_CONFIG, config);
};

// Legacy helpers
export const getStoredApiKey = (): string | null => getAIConfig().keys.gemini;
export const setStoredApiKey = (key: string): void => {
  const config = getAIConfig();
  config.keys.gemini = key;
  saveAIConfig(config);
};

// --- Data Management (Export/Import) ---

export const exportFullData = (): string => {
  const data: FullBackupData = {
    wines: getFromStorage(STORAGE_KEYS.WINES, MOCK_WINES),
    bottles: getFromStorage(STORAGE_KEYS.BOTTLES, MOCK_BOTTLES),
    racks: getFromStorage(STORAGE_KEYS.RACKS, MOCK_RACKS),
    spirits: getFromStorage(STORAGE_KEYS.SPIRITS, MOCK_SPIRITS),
    cocktails: getFromStorage(STORAGE_KEYS.COCKTAILS, MOCK_COCKTAILS),
    shoppingList: getFromStorage(STORAGE_KEYS.SHOPPING, MOCK_SHOPPING),
    timestamp: new Date().toISOString()
  };
  return JSON.stringify(data, null, 2);
};

export const importFullData = (jsonString: string): boolean => {
  try {
    const data: FullBackupData = JSON.parse(jsonString);
    if (!data.wines || !data.bottles) throw new Error("Invalid Format");
    
    saveToStorage(STORAGE_KEYS.WINES, data.wines);
    saveToStorage(STORAGE_KEYS.BOTTLES, data.bottles);
    if (data.racks) saveToStorage(STORAGE_KEYS.RACKS, data.racks);
    if (data.spirits) saveToStorage(STORAGE_KEYS.SPIRITS, data.spirits);
    if (data.cocktails) saveToStorage(STORAGE_KEYS.COCKTAILS, data.cocktails);
    if (data.shoppingList) saveToStorage(STORAGE_KEYS.SHOPPING, data.shoppingList);
    
    return true;
  } catch (e) {
    console.error("Import failed", e);
    return false;
  }
};
