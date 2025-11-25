import { Wine, Bottle, CellarWine, Rack, Spirit, SpiritType, FullBackupData, TimelineEvent, BottleLocation, CocktailRecipe, ShoppingListItem, UserTasteProfile, AIConfig } from '../types';

// --- MOCK DATA ---
const MOCK_WINES: Wine[] = [
  {
    id: 'w1',
    name: 'Château Margaux',
    producer: 'Château Margaux',
    vintage: 2015,
    region: 'Bordeaux',
    country: 'France',
    type: 'RED' as any,
    grapeVarieties: ['Cabernet Sauvignon', 'Merlot', 'Petit Verdot'],
    format: '750ml',
    personalNotes: ['Cadeau de Jean', 'Ouvrir après 2025'],
    sensoryDescription: 'Un immense bouquet de fruits noirs, de fleurs printanières, de chêne raffiné et de graphite. Corsé et concentré avec une longue finale royale.',
    aromaProfile: ['Cassis', 'Violette', 'Graphite', 'Cèdre', 'Tabac'],
    tastingNotes: 'Robe rubis profond. Le nez est complexe avec des couches de fruits noirs. La bouche est structurée avec des tanins soyeux et une acidité équilibrée.',
    suggestedFoodPairings: ['Agneau rôti au romarin', 'Bœuf Wellington', 'Risotto à la truffe'],
    producerHistory: 'Château Margaux, Premier Grand Cru Classé, remonte au XIIe siècle. Le domaine est connu pour son processus de sélection rigoureux et son terroir unique combinant graves et argilo-calcaire.',
    enrichedByAI: true,
    isFavorite: true,
    sensoryProfile: {
      body: 90,
      acidity: 75,
      tannin: 85,
      sweetness: 5,
      alcohol: 70,
      flavors: ['Cassis', 'Violette', 'Cèdre']
    },
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
    type: 'WHITE' as any,
    grapeVarieties: ['Sauvignon Blanc'],
    format: '750ml',
    personalNotes: [],
    sensoryDescription: 'Vibrant et expressif, offrant une explosion de fruit de la passion, de combava et de fleurs de verger, équilibré par une minéralité zestée.',
    aromaProfile: ['Fruit de la Passion', 'Combava', 'Pamplemousse', 'Herbe Coupée', 'Fruits à noyau'],
    tastingNotes: 'Paille pâle vert. Aromatiques intenses. La bouche est juteuse et désaltérante avec une longue finale croquante.',
    suggestedFoodPairings: ['Huîtres fraîches', 'Salade de chèvre chaud', 'Asperges grillées au citron'],
    producerHistory: 'Fondé en 1985, Cloudy Bay fut l\'un des cinq premiers domaines de Marlborough. Il a joué un rôle crucial pour placer le Sauvignon Blanc néo-zélandais sur la carte mondiale.',
    enrichedByAI: true,
    isFavorite: false,
    sensoryProfile: {
      body: 40,
      acidity: 95,
      tannin: 0,
      sweetness: 10,
      alcohol: 60,
      flavors: ['Passionfruit', 'Citron vert', 'Herbe']
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

const MOCK_RACKS: Rack[] = [
  { id: 'r1', name: 'EuroCave Principal', width: 6, height: 8, type: 'SHELF' },
  { id: 'box1', name: 'Caisse Margaux 2015', width: 3, height: 2, type: 'BOX' } 
];

const MOCK_BOTTLES: Bottle[] = [
  { id: 'b1', wineId: 'w1', location: { rackId: 'r1', x: 0, y: 0 }, addedByUserId: 'u1', purchaseDate: '2020-01-01', isConsumed: false },
  { id: 'b2', wineId: 'w1', location: { rackId: 'r1', x: 1, y: 0 }, addedByUserId: 'u1', purchaseDate: '2020-01-01', isConsumed: false },
  { id: 'b3', wineId: 'w2', location: { rackId: 'r1', x: 0, y: 1 }, addedByUserId: 'u2', purchaseDate: '2023-12-01', isConsumed: false },
  { id: 'b4', wineId: 'w1', location: { rackId: 'box1', x: 0, y: 0 }, addedByUserId: 'u1', purchaseDate: '2016-05-20', isConsumed: false },
  { id: 'b5', wineId: 'w1', location: { rackId: 'box1', x: 1, y: 0 }, addedByUserId: 'u1', purchaseDate: '2016-05-20', isConsumed: false },
  { id: 'b6', wineId: 'w1', location: { rackId: 'box1', x: 2, y: 0 }, addedByUserId: 'u1', purchaseDate: '2016-05-20', isConsumed: false },
];

const MOCK_SPIRITS: Spirit[] = [
  {
    id: 's1',
    name: 'Lagavulin 16',
    category: SpiritType.WHISKY,
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
    inventoryLevel: 45,
    isLuxury: true
  },
  {
    id: 's2',
    name: 'Hendrick\'s Gin',
    category: SpiritType.GIN,
    distillery: 'Girvan',
    region: 'Scotland',
    country: 'Scotland',
    age: 'NAS',
    caskType: 'N/A',
    abv: 41.4,
    format: 700,
    description: 'Un gin infusé à la rose et au concombre, curieusement rafraîchissant.',
    producerHistory: 'Produit en Écosse, Hendrick\'s utilise deux types d\'alambics pour créer son profil unique.',
    tastingNotes: 'Floral, frais, agrumes doux, finale concombre.',
    aromaProfile: ['Rose', 'Concombre', 'Genévrier', 'Agrumes'],
    suggestedCocktails: ['Gin & Tonic', 'Cucumber Cooler', 'Martini'],
    culinaryPairings: ['Salade de concombre', 'Saumon fumé'],
    enrichedByAI: true,
    addedAt: new Date().toISOString(),
    isOpened: false,
    inventoryLevel: 100,
    isLuxury: false
  }
];

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
            { name: 'Eau', amount: 1, unit: 'spoon', optional: false },
            { name: 'Zeste d\'orange', amount: 0, unit: 'piece', optional: true }
        ],
        instructions: ['Mélanger le sucre, l\'eau et le bitter dans un verre.', 'Ajouter le whisky et la glace.', 'Remuer doucement.', 'Garnir avec le zeste.'],
        glassType: 'Old Fashioned',
        difficulty: 'Easy',
        prepTime: 5,
        tags: ['Classic', 'Strong', 'Dinner'],
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
  stylePreferences: {
    body: 60,
    acidity: 75,
    tannin: 40,
    sweetness: 10,
    alcohol: 50,
    flavors: ['Fruité', 'Floral', 'Minéral']
  },
  lastUpdated: new Date().toISOString()
};

// --- JOURNAL HELPERS ---

export const addJournalEntry = (entry: Omit<any, 'id'>): void => {
    const journal = JSON.parse(localStorage.getItem('vf_cellar_journal') || '[]');
    journal.push({
        ...entry,
        id: crypto.randomUUID(),
        date: new Date().toISOString()
    });
    localStorage.setItem('vf_cellar_journal', JSON.stringify(journal));
};

// --- WINE FUNCTIONS ---

export const getInventory = (): CellarWine[] => {
  const storedWines = localStorage.getItem('vf_wines');
  const storedBottles = localStorage.getItem('vf_bottles');

  const wines: Wine[] = storedWines ? JSON.parse(storedWines) : MOCK_WINES;
  const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : MOCK_BOTTLES;

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
  const storedBottles = localStorage.getItem('vf_bottles');
  const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : MOCK_BOTTLES;
  
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
       const description = b.giftedTo ? `Offert à ${b.giftedTo}` : 'Consommée';
       events.push({
        date: b.consumedDate,
        type: b.giftedTo ? 'GIFT' : 'OUT',
        description: description,
        user: 'Moi'
      });
    }
  });

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const saveWine = (wine: Wine, quantity: number = 1, location: string | BottleLocation = 'Non trié'): string => {
  const storedWines = localStorage.getItem('vf_wines');
  const wines: Wine[] = storedWines ? JSON.parse(storedWines) : [];

  const existingIndex = wines.findIndex(w => w.id === wine.id);
  if (existingIndex >= 0) {
    wines[existingIndex] = wine;
  } else {
    wines.push(wine);
  }
  
  localStorage.setItem('vf_wines', JSON.stringify(wines));

  if (quantity > 0) {
    addBottles(wine.id, quantity, location);
    
    // Log journal entry
    let locationLabel = 'Non trié';
    if (typeof location !== 'string') {
        const racks = getRacks();
        const rack = racks.find(r => r.id === location.rackId);
        const rackName = rack?.name || 'Rack Inconnu';
        const rowLabel = String.fromCharCode(65 + location.y);
        locationLabel = `${rackName} [${rowLabel}${location.x + 1}]`;
    } else {
        locationLabel = location;
    }
    
    addJournalEntry({
        type: 'IN',
        wineId: wine.id,
        wineName: wine.name,
        quantity,
        location: locationLabel,
        description: `Ajout de ${quantity} bouteille(s) de ${wine.name} ${wine.vintage} (${locationLabel})`,
        userId: 'current-user'
    });
  }
  
  return wine.id;
};

export const updateWine = (id: string, updates: Partial<Wine>): void => {
  const storedWines = localStorage.getItem('vf_wines');
  const wines: Wine[] = storedWines ? JSON.parse(storedWines) : [];

  const index = wines.findIndex(w => w.id === id);
  if (index >= 0) {
    wines[index] = { ...wines[index], ...updates, updatedAt: new Date().toISOString() };
    localStorage.setItem('vf_wines', JSON.stringify(wines));
  }
};

export const deleteWine = (id: string): void => {
  const storedWines = localStorage.getItem('vf_wines');
  const wines: Wine[] = storedWines ? JSON.parse(storedWines) : [];
  const filtered = wines.filter(w => w.id !== id);
  localStorage.setItem('vf_wines', JSON.stringify(filtered));

  const storedBottles = localStorage.getItem('vf_bottles');
  const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];
  const filteredBottles = bottles.filter(b => b.wineId !== id);
  localStorage.setItem('vf_bottles', JSON.stringify(filteredBottles));
};

export const toggleFavorite = (id: string): void => {
  const storedWines = localStorage.getItem('vf_wines');
  const wines: Wine[] = storedWines ? JSON.parse(storedWines) : [];
  const wine = wines.find(w => w.id === id);
  if (wine) {
    wine.isFavorite = !wine.isFavorite;
    localStorage.setItem('vf_wines', JSON.stringify(wines));
  }
};

// --- BOTTLE FUNCTIONS ---

export const addBottles = (wineId: string, count: number, location: string | BottleLocation = 'Non trié'): void => {
  const storedBottles = localStorage.getItem('vf_bottles');
  const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];

  for (let i = 0; i < count; i++) {
    bottles.push({
      id: crypto.randomUUID(),
      wineId,
      location,
      addedByUserId: 'current-user',
      purchaseDate: new Date().toISOString(),
      isConsumed: false
    });
  }

  localStorage.setItem('vf_bottles', JSON.stringify(bottles));
};

export const addBottleAtLocation = (wineId: string, location: BottleLocation): void => {
    const storedBottles = localStorage.getItem('vf_bottles');
    const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];

    bottles.push({
        id: crypto.randomUUID(),
        wineId,
        location,
        addedByUserId: 'current-user',
        purchaseDate: new Date().toISOString(),
        isConsumed: false
    });

    localStorage.setItem('vf_bottles', JSON.stringify(bottles));
    
    // Log journal entry
    const racks = getRacks();
    const rack = racks.find(r => r.id === location.rackId);
    const rackName = rack?.name || 'Rack Inconnu';
    const rowLabel = String.fromCharCode(65 + location.y);
    const locationLabel = `${rackName} [${rowLabel}${location.x + 1}]`;
    
    const wine = getWineById(wineId);
    if (wine) {
        addJournalEntry({
            type: 'IN',
            wineId: wine.id,
            wineName: wine.name,
            quantity: 1,
            location: locationLabel,
            description: `Ajout d'une bouteille de ${wine.name} ${wine.vintage} (${locationLabel})`,
            userId: 'current-user'
        });
    }
};

export const consumeSpecificBottle = (wineId: string, bottleId: string): void => {
  const storedBottles = localStorage.getItem('vf_bottles');
  const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];

  const bottle = bottles.find(b => b.id === bottleId && b.wineId === wineId);
  if (bottle) {
    bottle.isConsumed = true;
    bottle.consumedDate = new Date().toISOString();
    
      // Log journal entry with location
      let locationLabel = 'Non trié';
      if (typeof bottle.location !== 'string') {
          const bottleLocation: BottleLocation = bottle.location;
          const racks = getRacks();
          const rack = racks.find(r => r.id === bottleLocation.rackId);
          const rackName = rack?.name || 'Rack Inconnu';
          const rowLabel = String.fromCharCode(65 + bottleLocation.y);
          locationLabel = `${rackName} [${rowLabel}${bottleLocation.x + 1}]`;
      } else {
          locationLabel = bottle.location;
      }
    
    const wine = getWineById(wineId);
    if (wine) {
        addJournalEntry({
            type: 'OUT',
            wineId: wine.id,
            wineName: wine.name,
            quantity: 1,
            location: locationLabel,
            description: `Consommation d'une bouteille de ${wine.name} ${wine.vintage} (${locationLabel})`,
            userId: 'current-user'
        });
    }
    
    localStorage.setItem('vf_bottles', JSON.stringify(bottles));
  }
};

export const moveBottle = (bottleId: string, newLocation: string | BottleLocation): void => {
  const storedBottles = localStorage.getItem('vf_bottles');
  const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];

  const bottle = bottles.find(b => b.id === bottleId);
  if (bottle) {
    const oldLocation = bottle.location;
    bottle.location = newLocation;
    
    // Log journal entry
    const wine = getWineById(bottle.wineId);
    if (wine) {
        let fromLabel = 'Non trié';
        if (typeof oldLocation !== 'string') {
            const racks = getRacks();
            const rack = racks.find(r => r.id === oldLocation.rackId);
            const rackName = rack?.name || 'Rack Inconnu';
            const rowLabel = String.fromCharCode(65 + oldLocation.y);
            fromLabel = `${rackName} [${rowLabel}${oldLocation.x + 1}]`;
        } else {
            fromLabel = oldLocation;
        }
        
        let toLabel = 'Non trié';
        if (typeof newLocation !== 'string') {
            const racks = getRacks();
            const rack = racks.find(r => r.id === newLocation.rackId);
            const rackName = rack?.name || 'Rack Inconnu';
            const rowLabel = String.fromCharCode(65 + newLocation.y);
            toLabel = `${rackName} [${rowLabel}${newLocation.x + 1}]`;
        } else {
            toLabel = newLocation;
        }
        
        addJournalEntry({
            type: 'MOVE',
            wineId: wine.id,
            wineName: wine.name,
            quantity: 1,
            fromLocation: fromLabel,
            toLocation: toLabel,
            description: `Déplacement d'une bouteille de ${wine.name} ${wine.vintage} de ${fromLabel} vers ${toLabel}`,
            userId: 'current-user'
        });
    }
    
    localStorage.setItem('vf_bottles', JSON.stringify(bottles));
  }
};

export const giftBottle = (wineId: string, bottleId: string, recipient: string, occasion: string): void => {
    const storedBottles = localStorage.getItem('vf_bottles');
    const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];

    const bottle = bottles.find(b => b.id === bottleId && b.wineId === wineId);
    if (bottle) {
        bottle.isConsumed = true;
        bottle.consumedDate = new Date().toISOString();
        bottle.giftedTo = recipient;
        bottle.giftOccasion = occasion;

        // Log journal entry
        const wine = getWineById(wineId);
        if (wine) {
            addJournalEntry({
                type: 'GIFT',
                wineId: wine.id,
                wineName: wine.name,
                quantity: 1,
                recipient,
                occasion,
                description: `Bouteille de ${wine.name} ${wine.vintage} offerte à ${recipient} pour ${occasion}`,
                userId: 'current-user'
            });
        }

        localStorage.setItem('vf_bottles', JSON.stringify(bottles));
    }
};

export const fillRackWithWine = (rackId: string, wineId: string): void => {
    const racks = getRacks();
    const rack = racks.find(r => r.id === rackId);
    if (!rack) return;

    const storedBottles = localStorage.getItem('vf_bottles');
    const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];

    let addedCount = 0;
    for (let y = 0; y < rack.height; y++) {
        for (let x = 0; x < rack.width; x++) {
            const isOccupied = bottles.some(b => 
                !b.isConsumed && 
                typeof b.location !== 'string' && 
                b.location.rackId === rackId && 
                b.location.x === x && 
                b.location.y === y
            );

            if (!isOccupied) {
                bottles.push({
                    id: crypto.randomUUID(),
                    wineId,
                    location: { rackId, x, y },
                    addedByUserId: 'current-user',
                    purchaseDate: new Date().toISOString(),
                    isConsumed: false
                });
                addedCount++;
            }
        }
    }

    localStorage.setItem('vf_bottles', JSON.stringify(bottles));
    
    // Log journal entry
    const wine = getWineById(wineId);
    if (wine && addedCount > 0) {
        addJournalEntry({
            type: 'IN',
            wineId: wine.id,
            wineName: wine.name,
            quantity: addedCount,
            location: rack.name,
            description: `Remplissage de ${rack.name} avec ${addedCount} bouteille(s) de ${wine.name} ${wine.vintage}`,
            userId: 'current-user'
        });
    }
};

export const findNextAvailableSlot = (): { location: BottleLocation; rackName: string } | null => {
    const racks = getRacks();
    const storedBottles = localStorage.getItem('vf_bottles');
    const bottles: Bottle[] = storedBottles ? JSON.parse(storedBottles) : [];

    for (const rack of racks) {
        for (let y = 0; y < rack.height; y++) {
            for (let x = 0; x < rack.width; x++) {
                const isOccupied = bottles.some(b => 
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

// --- RACK FUNCTIONS ---

export const getRacks = (): Rack[] => {
  const storedRacks = localStorage.getItem('vf_racks');
  return storedRacks ? JSON.parse(storedRacks) : MOCK_RACKS;
};

export const saveRack = (rack: Rack): void => {
  const racks = getRacks();
  const existingIndex = racks.findIndex(r => r.id === rack.id);
  if (existingIndex >= 0) {
    racks[existingIndex] = rack;
  } else {
    racks.push(rack);
  }
  localStorage.setItem('vf_racks', JSON.stringify(racks));
};

export const updateRack = (id: string, updates: Partial<Rack>): void => {
  const racks = getRacks();
  const index = racks.findIndex(r => r.id === id);
  if (index >= 0) {
    racks[index] = { ...racks[index], ...updates };
    localStorage.setItem('vf_racks', JSON.stringify(racks));
  }
};

export const reorderRack = (id: string, direction: 'left' | 'right'): void => {
    const racks = getRacks();
    const index = racks.findIndex(r => r.id === id);
    if (index === -1) return;

    if (direction === 'left' && index > 0) {
        [racks[index - 1], racks[index]] = [racks[index], racks[index - 1]];
    } else if (direction === 'right' && index < racks.length - 1) {
        [racks[index], racks[index + 1]] = [racks[index + 1], racks[index]];
    }
    localStorage.setItem('vf_racks', JSON.stringify(racks));
};

export const deleteRack = (id: string): void => {
  const racks = getRacks().filter(r => r.id !== id);
  localStorage.setItem('vf_racks', JSON.stringify(racks));
  
  const bottles: Bottle[] = JSON.parse(localStorage.getItem('vf_bottles') || JSON.stringify(MOCK_BOTTLES));
  const updatedBottles = bottles.map(b => {
      if (typeof b.location !== 'string' && b.location.rackId === id) {
          return { ...b, location: 'Non trié' };
      }
      return b;
  });
  localStorage.setItem('vf_bottles', JSON.stringify(updatedBottles));
};

// --- SPIRIT FUNCTIONS ---

export const getSpirits = (): Spirit[] => {
  const storedSpirits = localStorage.getItem('vf_spirits');
  return storedSpirits ? JSON.parse(storedSpirits) : MOCK_SPIRITS;
};

export const getSpiritById = (id: string): Spirit | undefined => {
  const spirits = getSpirits();
  return spirits.find(s => s.id === id);
};

export const saveSpirit = (spirit: Spirit): void => {
    const spirits = getSpirits();
    const existingIndex = spirits.findIndex(s => s.id === spirit.id);
    if(existingIndex >= 0) spirits[existingIndex] = spirit;
    else spirits.push(spirit);
    localStorage.setItem('vf_spirits', JSON.stringify(spirits));
};

export const deleteSpirit = (id: string): void => {
    const spirits = getSpirits().filter(s => s.id !== id);
    localStorage.setItem('vf_spirits', JSON.stringify(spirits));
};

export const toggleSpiritLuxury = (id: string): void => {
    const spirits = getSpirits();
    const spirit = spirits.find(s => s.id === id);
    if(spirit) {
        spirit.isLuxury = !spirit.isLuxury;
        saveSpirit(spirit);
    }
};

// --- COCKTAIL FUNCTIONS ---

export const getCocktails = (): CocktailRecipe[] => {
    const stored = localStorage.getItem('vf_cocktails');
    return stored ? JSON.parse(stored) : MOCK_COCKTAILS;
};

export const saveCocktail = (recipe: CocktailRecipe): void => {
    const cocktails = getCocktails();
    const existing = cocktails.findIndex(c => c.id === recipe.id);
    if(existing >= 0) cocktails[existing] = recipe;
    else cocktails.push(recipe);
    localStorage.setItem('vf_cocktails', JSON.stringify(cocktails));
};

// --- SHOPPING LIST FUNCTIONS ---

export const getShoppingList = (): ShoppingListItem[] => {
    const stored = localStorage.getItem('vf_shopping');
    return stored ? JSON.parse(stored) : MOCK_SHOPPING;
};

export const toggleShoppingItem = (id: string): void => {
    const list = getShoppingList();
    const item = list.find(i => i.id === id);
    if(item) {
        item.isChecked = !item.isChecked;
        localStorage.setItem('vf_shopping', JSON.stringify(list));
    }
};

export const addToShoppingList = (name: string, quantity: number, category: any = 'OTHER'): void => {
    const list = getShoppingList();
    list.push({
        id: crypto.randomUUID(),
        name,
        quantity,
        category,
        isChecked: false
    });
    localStorage.setItem('vf_shopping', JSON.stringify(list));
};

// --- USER TASTE PROFILE ---

export const getUserTasteProfile = (): UserTasteProfile => {
  const stored = localStorage.getItem('vf_taste_profile');
  return stored ? JSON.parse(stored) : MOCK_TASTE_PROFILE;
};

export const updateUserTasteProfile = (profile: UserTasteProfile): void => {
  localStorage.setItem('vf_taste_profile', JSON.stringify(profile));
};

// --- AI CONFIG ---

export const getAIConfig = (): AIConfig => {
    const stored = localStorage.getItem('vf_ai_config');
    if (!stored) {
        const legacyKey = localStorage.getItem('vf_api_key') || '';
        return {
            provider: 'GEMINI',
            keys: {
                gemini: legacyKey,
                openai: '',
                mistral: ''
            }
        };
    }
    return JSON.parse(stored);
};

export const saveAIConfig = (config: AIConfig): void => {
    localStorage.setItem('vf_ai_config', JSON.stringify(config));
};

// --- BACKUP & RESTORE ---

export const exportFullData = (): string => {
  const data: FullBackupData = {
    wines: JSON.parse(localStorage.getItem('vf_wines') || JSON.stringify(MOCK_WINES)),
    bottles: JSON.parse(localStorage.getItem('vf_bottles') || JSON.stringify(MOCK_BOTTLES)),
    racks: JSON.parse(localStorage.getItem('vf_racks') || JSON.stringify(MOCK_RACKS)),
    spirits: JSON.parse(localStorage.getItem('vf_spirits') || JSON.stringify(MOCK_SPIRITS)),
    cocktails: JSON.parse(localStorage.getItem('vf_cocktails') || JSON.stringify(MOCK_COCKTAILS)),
    shoppingList: JSON.parse(localStorage.getItem('vf_shopping') || JSON.stringify(MOCK_SHOPPING)),
    timestamp: new Date().toISOString()
  };
  return JSON.stringify(data, null, 2);
};

export const importFullData = (jsonString: string): boolean => {
  try {
    const data: FullBackupData = JSON.parse(jsonString);
    if (!data.wines || !data.bottles) throw new Error("Invalid Format");
    
    localStorage.setItem('vf_wines', JSON.stringify(data.wines));
    localStorage.setItem('vf_bottles', JSON.stringify(data.bottles));
    if(data.racks) localStorage.setItem('vf_racks', JSON.stringify(data.racks));
    if(data.spirits) localStorage.setItem('vf_spirits', JSON.stringify(data.spirits));
    if(data.cocktails) localStorage.setItem('vf_cocktails', JSON.stringify(data.cocktails));
    if(data.shoppingList) localStorage.setItem('vf_shopping', JSON.stringify(data.shoppingList));
    
    return true;
  } catch (e) {
    console.error("Import failed", e);
    return false;
  }
};