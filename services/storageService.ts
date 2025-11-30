import { Wine, Bottle, CellarWine, Rack, Spirit, CocktailRecipe, ShoppingListItem, UserTasteProfile, AIConfig, TimelineEvent, BottleLocation } from '../types';
import { getAuthToken } from './supabase'; // Ou ./customAuth si vous avez migré le getter

const API_URL = '/api'; // Grâce au proxy Nginx, pas besoin de mettre l'URL complète

// --- HELPERS ---

const getHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  // Gérer le cas où la réponse est vide (204 No Content)
  if (response.status === 204) return null;
  return response.json();
};

// --- WINE FUNCTIONS ---

export const getWines = async (): Promise<Wine[]> => {
  const response = await fetch(`${API_URL}/wines`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getBottles = async (): Promise<Bottle[]> => {
  const response = await fetch(`${API_URL}/bottles`, { headers: getHeaders() });
  return handleResponse(response);
};

// Cette fonction agrège les vins et les bouteilles pour le frontend
export const getInventory = async (): Promise<CellarWine[]> => {
  try {
    const [wines, bottles] = await Promise.all([
      getWines(),
      getBottles()
    ]);

    if (!Array.isArray(wines)) return [];

    return wines.map(wine => {
      const wineBottles = Array.isArray(bottles) 
        ? bottles.filter(b => b.wineId === wine.id && !b.isConsumed)
        : [];
      
      return {
        ...wine,
        inventoryCount: wineBottles.length,
        bottles: wineBottles
      };
    });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return [];
  }
};

export const getWineById = async (id: string): Promise<CellarWine | null> => {
  try {
    const response = await fetch(`${API_URL}/wines/${id}`, { headers: getHeaders() });
    if (!response.ok) return null;
    const wine = await response.json();
    
    // On récupère aussi les bouteilles pour ce vin spécifique
    // Idéalement le backend devrait renvoyer l'objet complet, sinon on fetch les bouteilles
    const bottlesResponse = await fetch(`${API_URL}/bottles?wineId=${id}`, { headers: getHeaders() });
    const bottles = bottlesResponse.ok ? await bottlesResponse.json() : [];
    
    return {
      ...wine,
      inventoryCount: bottles.filter((b: Bottle) => !b.isConsumed).length,
      bottles: bottles.filter((b: Bottle) => !b.isConsumed)
    };
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const saveWine = async (wine: Wine, quantity: number = 1): Promise<string> => {
  // 1. Sauvegarder le vin
  let savedWine = wine;
  
  // Vérifier si c'est une création ou une mise à jour
  const existing = await getWineById(wine.id);
  
  if (existing) {
      await updateWine(wine.id, wine);
  } else {
      const response = await fetch(`${API_URL}/wines`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(wine)
      });
      savedWine = await handleResponse(response);
  }

  // 2. Ajouter les bouteilles si quantité > 0
  if (quantity > 0) {
    await addBottles(savedWine.id, quantity);
  }
  
  return savedWine.id;
};

export const updateWine = async (id: string, updates: Partial<Wine>): Promise<void> => {
  await fetch(`${API_URL}/wines/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
};

export const deleteWine = async (id: string): Promise<void> => {
  await fetch(`${API_URL}/wines/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
};

export const toggleFavorite = async (id: string): Promise<void> => {
  // On récupère d'abord l'état actuel
  // Note: Idéalement, le backend devrait avoir un endpoint PATCH spécifique pour ça
  const wine = await getWineById(id);
  if (wine) {
    await updateWine(id, { isFavorite: !wine.isFavorite });
  }
};

// --- BOTTLE FUNCTIONS ---

export const addBottles = async (wineId: string, count: number, location: string | BottleLocation = 'Non trié'): Promise<void> => {
  const promises = [];
  for (let i = 0; i < count; i++) {
    const bottle = {
      id: crypto.randomUUID(),
      wineId,
      location,
      purchaseDate: new Date().toISOString(),
      isConsumed: false,
      addedByUserId: 'current-user' // Le backend devrait gérer ça avec le token
    };
    promises.push(
      fetch(`${API_URL}/bottles`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(bottle)
      })
    );
  }
  await Promise.all(promises);
  
  // Log Journal (Backend peut le faire, mais on le garde ici pour l'instant)
  await addJournalEntry({
      type: 'IN',
      wineId,
      wineName: 'Vin', // Le backend devrait résoudre le nom
      quantity: count,
      description: `Ajout de ${count} bouteille(s)`
  });
};

export const addBottleAtLocation = async (wineId: string, location: BottleLocation): Promise<void> => {
    await addBottles(wineId, 1, location);
};

export const consumeSpecificBottle = async (wineId: string, bottleId: string): Promise<void> => {
  const response = await fetch(`${API_URL}/bottles/${bottleId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
          isConsumed: true,
          consumedDate: new Date().toISOString()
      })
  });
  
  if (response.ok) {
      await addJournalEntry({
          type: 'OUT',
          wineId,
          wineName: 'Vin',
          quantity: 1,
          description: "Consommation d'une bouteille"
      });
  }
};

export const moveBottle = async (bottleId: string, newLocation: string | BottleLocation): Promise<void> => {
  await fetch(`${API_URL}/bottles/${bottleId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ location: newLocation })
  });
};

export const giftBottle = async (wineId: string, bottleId: string, recipient: string, occasion: string): Promise<void> => {
    await fetch(`${API_URL}/bottles/${bottleId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
            isConsumed: true,
            consumedDate: new Date().toISOString(),
            giftedTo: recipient,
            giftOccasion: occasion
        })
    });

    await addJournalEntry({
        type: 'GIFT',
        wineId,
        wineName: 'Vin',
        recipient,
        occasion,
        description: `Offert à ${recipient}`
    });
};

export const fillRackWithWine = async (rackId: string, wineId: string): Promise<void> => {
    // Cette logique est complexe (calcul des slots libres).
    // Pour l'instant, on la garde côté client en récupérant tout, 
    // mais idéalement elle devrait être côté serveur.
    
    const racks = await getRacks();
    const rack = racks.find(r => r.id === rackId);
    if (!rack) return;

    const bottles = await getBottles();
    const promises = [];

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
                const bottle = {
                    id: crypto.randomUUID(),
                    wineId,
                    location: { rackId, x, y },
                    purchaseDate: new Date().toISOString(),
                    isConsumed: false
                };
                promises.push(
                    fetch(`${API_URL}/bottles`, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: JSON.stringify(bottle)
                    })
                );
            }
        }
    }
    
    await Promise.all(promises);
};

export const findNextAvailableSlot = async (): Promise<{ location: BottleLocation; rackName: string } | null> => {
    // Cette fonction ne peut pas être facilement asynchrone sans tout charger.
    // On va charger racks et bottles ici.
    // Attention aux performances si la cave est énorme.
    const [racks, bottles] = await Promise.all([getRacks(), getBottles()]);

    for (const rack of racks) {
        // Skip BOXes if needed? Assuming racks are shelves first
        if (rack.type === 'BOX') continue;

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

export const getRacks = async (): Promise<Rack[]> => {
  const response = await fetch(`${API_URL}/racks`, { headers: getHeaders() });
  return handleResponse(response);
};

export const saveRack = async (rack: Rack): Promise<void> => {
  const response = await fetch(`${API_URL}/racks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(rack)
  });
  return handleResponse(response);
};

export const updateRack = async (id: string, updates: Partial<Rack>): Promise<void> => {
  await fetch(`${API_URL}/racks/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates)
  });
};

export const deleteRack = async (id: string): Promise<void> => {
  await fetch(`${API_URL}/racks/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
  });
};

export const reorderRack = async (id: string, direction: 'left' | 'right'): Promise<void> => {
    // Nécessite de connaitre l'ordre actuel. 
    // Le backend devrait gérer ça via un endpoint /reorder ou on le fait ici.
    // Simplification: On ne fait rien pour l'instant ou on implémente une logique complète
    console.warn("Reorder rack not fully implemented in API mode yet");
};

// --- SPIRIT FUNCTIONS ---

export const getSpirits = async (): Promise<Spirit[]> => {
  const response = await fetch(`${API_URL}/spirits`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getSpiritById = async (id: string): Promise<Spirit | undefined> => {
  const response = await fetch(`${API_URL}/spirits/${id}`, { headers: getHeaders() });
  if (!response.ok) return undefined;
  return response.json();
};

export const saveSpirit = async (spirit: Spirit): Promise<void> => {
  // Check existence
  const existing = await getSpiritById(spirit.id);
  const method = existing ? 'PUT' : 'POST';
  const url = existing ? `${API_URL}/spirits/${spirit.id}` : `${API_URL}/spirits`;

  await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(spirit)
  });
};

export const deleteSpirit = async (id: string): Promise<void> => {
  await fetch(`${API_URL}/spirits/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
  });
};

// --- COCKTAIL FUNCTIONS ---

export const getCocktails = async (): Promise<CocktailRecipe[]> => {
    const response = await fetch(`${API_URL}/cocktails`, { headers: getHeaders() });
    if (!response.ok && response.status === 404) return []; // Endpoint might not exist yet
    return handleResponse(response) || [];
};

export const saveCocktail = async (recipe: CocktailRecipe): Promise<void> => {
    // Si l'endpoint n'existe pas encore, on peut fallback sur localStorage ou ne rien faire
    // Supposons qu'il existe :
    try {
        await fetch(`${API_URL}/cocktails`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(recipe)
        });
    } catch (e) {
        console.warn("Cocktail API not ready, saving locally fallback?");
        // Fallback LocalStorage si API pas prête
        const cocktails = JSON.parse(localStorage.getItem('vf_cocktails') || '[]');
        cocktails.push(recipe);
        localStorage.setItem('vf_cocktails', JSON.stringify(cocktails));
    }
};

// --- TASTING NOTES ---

export const getTastingNotes = async (): Promise<any[]> => {
    const response = await fetch(`${API_URL}/tasting-notes`, { headers: getHeaders() });
    return handleResponse(response) || [];
};

export const saveTastingNote = async (note: any): Promise<void> => {
    await fetch(`${API_URL}/tasting-notes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(note)
    });
};

export const deleteTastingNote = async (id: string): Promise<void> => {
    await fetch(`${API_URL}/tasting-notes/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
};

// --- JOURNAL / HISTORY ---

export const getCellarJournal = async (): Promise<TimelineEvent[]> => {
    const response = await fetch(`${API_URL}/history`, { headers: getHeaders() });
    return handleResponse(response) || [];
};

export const getWineHistory = async (wineId: string): Promise<TimelineEvent[]> => {
    const response = await fetch(`${API_URL}/history?wineId=${wineId}`, { headers: getHeaders() });
    return handleResponse(response) || [];
};

export const addJournalEntry = async (entry: any): Promise<void> => {
    await fetch(`${API_URL}/history`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(entry)
    });
};

// --- USER & CONFIG (Local Storage for Config, API for Profile) ---

export const getUserTasteProfile = (): UserTasteProfile | null => {
  // Le profil utilisateur est souvent stocké en base, mais pour simplifier la migration
  // on peut le garder en local ou le fetcher.
  const stored = localStorage.getItem('vf_taste_profile');
  return stored ? JSON.parse(stored) : null;
};

// AI Config reste local pour la sécurité des clés
export const getAIConfig = (): AIConfig => {
    const stored = localStorage.getItem('vf_ai_config');
    if (!stored) {
        return {
            provider: 'GEMINI',
            keys: { gemini: '', openai: '', mistral: '' }
        };
    }
    return JSON.parse(stored);
};

export const saveAIConfig = (config: AIConfig): void => {
    localStorage.setItem('vf_ai_config', JSON.stringify(config));
};

// --- BACKUP (Export/Import) ---

export const exportFullData = async (): Promise<string> => {
  // On récupère tout depuis l'API
  const [wines, bottles, racks, spirits, notes, history] = await Promise.all([
      getWines(),
      getBottles(),
      getRacks(),
      getSpirits(),
      getTastingNotes(),
      getCellarJournal()
  ]);

  const data = {
    wines,
    bottles,
    racks,
    spirits,
    tastingNotes: notes,
    history,
    timestamp: new Date().toISOString()
  };
  
  return JSON.stringify(data, null, 2);
};

export const importFullData = async (jsonString: string): Promise<boolean> => {
  try {
    const data = JSON.parse(jsonString);
    
    // Ceci est une opération lourde qui devrait être gérée par un endpoint /import côté serveur
    // pour éviter de faire 1000 fetch calls.
    // Si l'endpoint existe :
    const response = await fetch(`${API_URL}/import`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    
    return response.ok;
  } catch (e) {
    console.error("Import failed", e);
    return false;
  }
};