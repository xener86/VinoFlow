import { Wine, Bottle, CellarWine, Rack, Spirit, CocktailRecipe, AIConfig, JournalEntry, BottleLocation, WishlistItem, TastingNote, NewTastingNote, WineEnrichment, NotificationSettingsResponse, NotificationSettingsPatch, NotificationChannel, NewsletterPreview, MenuflowStatus, TonightResponse } from '../types';
import { customAuth, clearSession } from './customAuth';
import { tastingPhrase } from '../utils/tastingNotes';
const API_URL = '/api'; // Grâce au proxy Nginx, pas besoin de mettre l'URL complète

const currentUserId = (): string | null => customAuth.getUser()?.id ?? null;

// --- HELPERS ---

const getHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
  // Pass user-configured AI keys (from Settings) to the backend so it can
  // use them when its env vars are not set. The backend gives priority to
  // env vars, falling back to these.
  try {
    const aiConfig = localStorage.getItem('vf_ai_config');
    if (aiConfig) {
      const cfg = JSON.parse(aiConfig);
      if (cfg.keys?.gemini) headers['X-Vinoflow-Gemini-Key'] = cfg.keys.gemini;
      if (cfg.keys?.claude) headers['X-Vinoflow-Claude-Key'] = cfg.keys.claude;
    }
  } catch {
    // ignore malformed config
  }
  return headers;
};

// fetch() vers l'API avec refresh transparent : sur 401, on tente une fois de
// renouveler la session (refresh token) puis on rejoue la requête. Si le
// refresh échoue, le 401 remonte et handleResponse déconnecte.
const apiFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const response = await fetch(url, init);
  if (response.status !== 401 || !localStorage.getItem('refresh_token')) return response;
  if (!(await customAuth.refreshSession())) return response;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${localStorage.getItem('auth_token')}`);
  return fetch(url, { ...init, headers });
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    // Token expired or invalid → purge session and bounce to /login.
    // The error is still thrown so callers see a clean failure, but the
    // redirect happens regardless.
    if (response.status === 401) {
      try {
        clearSession();
      } catch {}
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.replace('/login?expired=1');
      }
    }
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  // Gérer le cas où la réponse est vide (204 No Content)
  if (response.status === 204) return null;
  return response.json();
};

// --- WINE FUNCTIONS ---

export const getWines = async (): Promise<Wine[]> => {
  const response = await apiFetch(`${API_URL}/wines`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getBottles = async (): Promise<Bottle[]> => {
  const response = await apiFetch(`${API_URL}/bottles`, { headers: getHeaders() });
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
  const response = await apiFetch(`${API_URL}/wines/${id}`, { headers: getHeaders() });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch wine: ${response.status} ${response.statusText}`);
  }
  const wine = await response.json();

  const bottlesResponse = await apiFetch(`${API_URL}/bottles?wineId=${id}`, { headers: getHeaders() });
  if (!bottlesResponse.ok) {
    throw new Error(`Failed to fetch bottles: ${bottlesResponse.status} ${bottlesResponse.statusText}`);
  }
  const bottles = await bottlesResponse.json();

  return {
    ...wine,
    inventoryCount: bottles.filter((b: Bottle) => !b.isConsumed).length,
    bottles: bottles.filter((b: Bottle) => !b.isConsumed)
  };
};

export const saveWine = async (wine: Wine, quantity: number = 1, purchasePrice?: number, location?: BottleLocation): Promise<string> => {
  let savedWine = wine;

  // Only update if the GET explicitly returns 404 (existing === null after a
  // successful check). Any other error bubbles up so we never create a
  // duplicate wine when the server is unreachable or returns 500.
  const existing = await getWineById(wine.id);

  if (existing) {
    await updateWine(wine.id, wine);
  } else {
    const response = await apiFetch(`${API_URL}/wines`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(wine)
    });
    savedWine = await handleResponse(response);
  }

  if (quantity > 0) {
    await addBottles(savedWine.id, quantity, location || 'Non trié', savedWine.name, savedWine.vintage, purchasePrice);
  }

  return savedWine.id;
};

export const updateWine = async (id: string, updates: Partial<Wine>): Promise<void> => {
  const response = await apiFetch(`${API_URL}/wines/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates)
  });
  await handleResponse(response);
};

// Sommelier v2 API
export const sommelierPair = async (dish: string, context?: any, skipCache = false) => {
  const response = await apiFetch(`${API_URL}/sommelier/pair`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ dish, context, skipCache }),
  });
  return handleResponse(response);
};

export const sommelierFeedback = async (params: {
  wineId?: string;
  dish: string;
  rating: 'UP' | 'DOWN';
  category?: 'SAFE' | 'PERSONAL' | 'CREATIVE';
  criteria?: any;
  context?: any;
}) => {
  const response = await apiFetch(`${API_URL}/sommelier/feedback`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  await handleResponse(response);
};

export const getAvailableAIProviders = async () => {
  const response = await apiFetch(`${API_URL}/ai/providers`, { headers: getHeaders() });
  return handleResponse(response);
};

// Phase 3 - Enrichissement
export const enrichAromaProfilesBatch = async (params: { onlyMissing?: boolean; limit?: number } = {}) => {
  const response = await apiFetch(`${API_URL}/wines/enrich-aromas`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse(response);
};

// Enrichissement sourcé (cascade) : provenance, relance, homonymes, annulation
export const getWineEnrichment = async (wineId: string): Promise<WineEnrichment> => {
  const response = await apiFetch(`${API_URL}/wines/${wineId}/enrichment`, { headers: getHeaders() });
  return handleResponse(response);
};

export const requestWineEnrichment = async (wineId: string) => {
  const response = await apiFetch(`${API_URL}/wines/${wineId}/enrich`, { method: 'POST', headers: getHeaders(), body: '{}' });
  return handleResponse(response);
};

export const chooseEnrichmentCandidate = async (wineId: string, choice: { candidateIndex?: number; hint?: string }) => {
  const response = await apiFetch(`${API_URL}/wines/${wineId}/enrichment/choose`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(choice) });
  return handleResponse(response);
};

export const revertWineEnrichment = async (wineId: string, logId: number) => {
  const response = await apiFetch(`${API_URL}/wines/${wineId}/enrichment/revert/${logId}`, { method: 'POST', headers: getHeaders(), body: '{}' });
  return handleResponse(response);
};

export const auditWines = async () => {
  const response = await apiFetch(`${API_URL}/wines/audit`, { headers: getHeaders() });
  return handleResponse(response);
};

// Phase 6.1 - OCR
export const extractWineFromImage = async (base64: string, mimeType = 'image/jpeg') => {
  const response = await apiFetch(`${API_URL}/wines/extract-from-image`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ image: base64, mimeType }),
  });
  return handleResponse(response);
};

// --- Assistant de saisie (IA côté serveur) ---

// Identification d'un vin pendant la saisie. Lève une erreur si l'IA est
// indisponible : l'écran d'ajout passe alors en saisie manuelle.
export const identifyWine = async (name: string, vintage?: number, hint?: string): Promise<Partial<Wine>> => {
  const response = await apiFetch(`${API_URL}/ai/identify-wine`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, vintage, hint }),
  });
  return handleResponse(response);
};

// Fiche d'un spiritueux ; null si l'IA est indisponible (ajout manuel).
export const enrichSpirit = async (name: string, hint?: string): Promise<Partial<Spirit> | null> => {
  try {
    const response = await apiFetch(`${API_URL}/ai/enrich-spirit`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, hint }),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('enrichSpirit:', error);
    return null;
  }
};

// Cocktail sur mesure ; null si l'IA est indisponible.
export const createCocktail = async (ingredients: string[], query: string): Promise<Partial<CocktailRecipe> | null> => {
  try {
    const response = await apiFetch(`${API_URL}/ai/cocktail`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ingredients, query }),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('createCocktail:', error);
    return null;
  }
};

// Phase 7 - Modes de pairing avancés
export const sommelierReversePair = async (wineId: string) => {
  const response = await apiFetch(`${API_URL}/sommelier/reverse-pair`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ wineId }),
  });
  return handleResponse(response);
};

export const sommelierMenu = async (dishes: string[]) => {
  const response = await apiFetch(`${API_URL}/sommelier/menu`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ dishes }),
  });
  return handleResponse(response);
};

export const sommelierExplain = async (dish: string, wineId: string, criteria?: any) => {
  const response = await apiFetch(`${API_URL}/sommelier/explain`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ dish, wineId, criteria }),
  });
  return handleResponse(response);
};

// Phase 8 - Proactive
export const getDrinkBeforeAlerts = async (horizonMonths = 12) => {
  const response = await apiFetch(`${API_URL}/sommelier/alerts/drink-before?horizonMonths=${horizonMonths}`, {
    headers: getHeaders(),
  });
  return handleResponse(response);
};

export const getPurchaseSuggestions = async () => {
  const response = await apiFetch(`${API_URL}/sommelier/purchase-suggestions`, { headers: getHeaders() });
  return handleResponse(response);
};

// Phase 10 - Advanced
export const sommelierVertical = async (producer: string) => {
  const response = await apiFetch(`${API_URL}/sommelier/vertical`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ producer }),
  });
  return handleResponse(response);
};

export const sommelierCompare = async (dish: string, wineAId: string, wineBId: string) => {
  const response = await apiFetch(`${API_URL}/sommelier/compare`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ dish, wineAId, wineBId }),
  });
  return handleResponse(response);
};

export const sommelierBlind = async () => {
  const response = await apiFetch(`${API_URL}/sommelier/blind`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getCellarBudget = async (months = 12) => {
  const response = await apiFetch(`${API_URL}/cellar/budget?months=${months}`, { headers: getHeaders() });
  return handleResponse(response);
};

// --- MENUFLOW ---

export const getMenuflowStatus = async (): Promise<MenuflowStatus> => {
  const response = await apiFetch(`${API_URL}/menuflow/status`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getTonight = async (): Promise<TonightResponse> => {
  const response = await apiFetch(`${API_URL}/menuflow/tonight`, { headers: getHeaders() });
  return handleResponse(response);
};

export const resuggestTonight = async (): Promise<TonightResponse> => {
  const response = await apiFetch(`${API_URL}/menuflow/tonight/resuggest`, { method: 'POST', headers: getHeaders(), body: '{}' });
  return handleResponse(response);
};

// --- NOTIFICATIONS ---

export const getNotificationSettings = async (): Promise<NotificationSettingsResponse> => {
  const response = await apiFetch(`${API_URL}/notifications/settings`, { headers: getHeaders() });
  return handleResponse(response);
};

export const saveNotificationSettings = async (patch: NotificationSettingsPatch): Promise<NotificationSettingsResponse> => {
  const response = await apiFetch(`${API_URL}/notifications/settings`, {
    method: 'PUT', headers: getHeaders(), body: JSON.stringify(patch),
  });
  return handleResponse(response);
};

export const sendTestNotification = async (channel: NotificationChannel): Promise<{ channel: NotificationChannel; ok: boolean; error?: string }> => {
  const response = await apiFetch(`${API_URL}/notifications/test`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ channel }),
  });
  return handleResponse(response);
};

export const previewNewsletter = async (withAi = false): Promise<NewsletterPreview> => {
  const response = await apiFetch(`${API_URL}/notifications/newsletter/preview${withAi ? '?ai=1' : ''}`, { headers: getHeaders() });
  return handleResponse(response);
};

export const sendNewsletterNow = async (): Promise<{ results: { channel: NotificationChannel; ok: boolean; error?: string }[] }> => {
  const response = await apiFetch(`${API_URL}/notifications/newsletter/send-now`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({}),
  });
  return handleResponse(response);
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

export const addBottles = async (
  wineId: string,
  count: number,
  location: string | BottleLocation = 'Non trié',
  wineName: string = 'Vin inconnu',
  wineVintage?: number,
  purchasePrice?: number
): Promise<void> => {
  const promises = [];
  for (let i = 0; i < count; i++) {
    const bottle: any = {
      id: crypto.randomUUID(),
      wineId,
      location,
      purchaseDate: new Date().toISOString(),
      isConsumed: false,
      addedByUserId: currentUserId()
    };
    if (purchasePrice) bottle.purchasePrice = purchasePrice;
    promises.push(
      apiFetch(`${API_URL}/bottles`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(bottle)
      })
    );
  }
  await Promise.all(promises);

  const priceInfo = purchasePrice ? ` - ${purchasePrice}\u20AC/btl` : '';
  await addJournalEntry({
      type: 'IN',
      wineId,
      wineName,
      wineVintage,
      quantity: count,
      description: `Ajout de ${count} bouteille(s) - ${wineName}${priceInfo}`
  });
};

export const addBottleAtLocation = async (
  wineId: string,
  location: BottleLocation,
  wineName: string = 'Vin inconnu',
  wineVintage?: number,
  purchasePrice?: number
): Promise<void> => {
    await addBottles(wineId, 1, location, wineName, wineVintage, purchasePrice);
};

export const consumeSpecificBottle = async (
  wineId: string,
  bottleId: string,
  wineName: string = 'Vin inconnu',
  wineVintage?: number,
  forDinner: boolean | null = null
): Promise<void> => {
  const response = await apiFetch(`${API_URL}/bottles/${bottleId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
          isConsumed: true,
          consumedDate: new Date().toISOString()
      })
  });

  await handleResponse(response);
  await addJournalEntry({
      type: 'OUT',
      wineId,
      wineName,
      wineVintage,
      quantity: 1,
      description: `Consommation - ${wineName} ${wineVintage || ''}`,
      forDinner
  });
};

export const moveBottle = async (
  bottleId: string,
  newLocation: string | BottleLocation,
  wineName?: string,
  wineVintage?: number,
  wineId?: string
): Promise<void> => {
  await apiFetch(`${API_URL}/bottles/${bottleId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ location: newLocation })
  });

  if (wineId) {
    const toLabel = typeof newLocation === 'string' ? newLocation : `Rack [${String.fromCharCode(65 + newLocation.y)}${newLocation.x + 1}]`;
    await addJournalEntry({
        type: 'MOVE',
        wineId,
        wineName: wineName || 'Vin',
        wineVintage,
        quantity: 1,
        description: `Déplacement → ${toLabel}`,
        toLocation: toLabel
    });
  }
};

export const deleteBottle = async (bottleId: string, wineId: string, wineName: string): Promise<void> => {
    const response = await apiFetch(`${API_URL}/bottles/${bottleId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });

    if (response.ok || response.status === 204) {
        await addJournalEntry({
            type: 'OUT',
            wineId,
            wineName,
            quantity: 1,
            description: `Bouteille supprimée - ${wineName}`
        });
    }
};

export const giftBottle = async (
  wineId: string,
  bottleId: string,
  recipient: string,
  occasion: string,
  wineName: string = 'Vin inconnu',
  wineVintage?: number
): Promise<void> => {
    await apiFetch(`${API_URL}/bottles/${bottleId}`, {
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
        wineName,
        wineVintage,
        recipient,
        occasion,
        quantity: 1,
        description: `${wineName} offert à ${recipient}`
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
                    isConsumed: false,
                    addedByUserId: currentUserId()
                };
                promises.push(
                    apiFetch(`${API_URL}/bottles`, {
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

// --- RACK FUNCTIONS ---

export const getRacks = async (): Promise<Rack[]> => {
  const response = await apiFetch(`${API_URL}/racks`, { headers: getHeaders() });
  return handleResponse(response);
};

export const saveRack = async (rack: Rack): Promise<void> => {
  const response = await apiFetch(`${API_URL}/racks`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(rack)
  });
  return handleResponse(response);
};

export const updateRack = async (id: string, updates: Partial<Rack>): Promise<void> => {
  const response = await apiFetch(`${API_URL}/racks/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates)
  });
  await handleResponse(response);
};

export const deleteRack = async (id: string): Promise<void> => {
  const response = await apiFetch(`${API_URL}/racks/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
  });
  await handleResponse(response);
};

export const reorderRack = async (id: string, direction: 'left' | 'right'): Promise<void> => {
    const allRacks = await getRacks();
    const target = allRacks.find(r => r.id === id);
    if (!target) return;

    // Only swap with neighbours of the SAME type (shelves stay among shelves,
    // cases stay among cases) to keep the visual grouping coherent.
    const sameTypeIds = allRacks.filter(r => r.type === target.type).map(r => r.id);
    const idx = sameTypeIds.indexOf(id);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameTypeIds.length) return;

    const swappedSameType = [...sameTypeIds];
    [swappedSameType[idx], swappedSameType[swapIdx]] = [swappedSameType[swapIdx], swappedSameType[idx]];

    // Reinsert the swapped same-type ids at their original positions
    const swapMap = new Map<string, string>();
    sameTypeIds.forEach((origId, i) => swapMap.set(origId, swappedSameType[i]));
    const newOrder = allRacks.map(r => swapMap.has(r.id) ? swapMap.get(r.id)! : r.id);

    await apiFetch(`${API_URL}/racks/reorder`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ rackIds: newOrder })
    });
};

// --- SPIRIT FUNCTIONS ---

export const getSpirits = async (): Promise<Spirit[]> => {
  const response = await apiFetch(`${API_URL}/spirits`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getSpiritById = async (id: string): Promise<Spirit | undefined> => {
  const response = await apiFetch(`${API_URL}/spirits/${id}`, { headers: getHeaders() });
  if (!response.ok) return undefined;
  return response.json();
};

export const saveSpirit = async (spirit: Spirit): Promise<void> => {
  // Check existence
  const existing = await getSpiritById(spirit.id);
  const method = existing ? 'PUT' : 'POST';
  const url = existing ? `${API_URL}/spirits/${spirit.id}` : `${API_URL}/spirits`;

  const response = await apiFetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(spirit)
  });
  await handleResponse(response);
};

export const deleteSpirit = async (id: string): Promise<void> => {
  const response = await apiFetch(`${API_URL}/spirits/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
  });
  await handleResponse(response);
};

// --- COCKTAIL FUNCTIONS ---

// Recettes enregistrées hors ligne (ancien fallback quand /api/cocktails
// n'existait pas) : reprises dans l'API dès qu'elle répond, puis effacées.
const LOCAL_COCKTAILS_KEY = 'vf_cocktails';

const readLocalCocktails = (): CocktailRecipe[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_COCKTAILS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const postCocktail = async (recipe: CocktailRecipe): Promise<CocktailRecipe> => {
    const response = await apiFetch(`${API_URL}/cocktails`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(recipe)
    });
    return handleResponse(response);
};

// Le POST étant un upsert par id, une reprise interrompue peut être rejouée sans doublon.
const migrateLocalCocktails = async (): Promise<boolean> => {
    const pending = readLocalCocktails();
    if (pending.length === 0) return false;
    const remaining: CocktailRecipe[] = [];
    for (const recipe of pending) {
        try {
            await postCocktail(recipe);
        } catch (e) {
            console.warn('Reprise du cocktail local impossible', recipe?.name, e);
            // Rejetée par l'API (400) : inutile de la retenter à chaque chargement.
            if (!(e instanceof Error && e.message.startsWith('API Error: 400'))) remaining.push(recipe);
        }
    }
    if (remaining.length) localStorage.setItem(LOCAL_COCKTAILS_KEY, JSON.stringify(remaining));
    else localStorage.removeItem(LOCAL_COCKTAILS_KEY);
    return remaining.length < pending.length;
};

export const getCocktails = async (): Promise<CocktailRecipe[]> => {
    let response: Response;
    try {
        response = await apiFetch(`${API_URL}/cocktails`, { headers: getHeaders() });
    } catch {
        return readLocalCocktails(); // API injoignable : recettes locales seulement
    }
    if (response.status === 404) return readLocalCocktails(); // backend sans la route
    const cocktails: CocktailRecipe[] = (await handleResponse(response)) || [];
    if (await migrateLocalCocktails()) return getCocktails();
    return cocktails;
};

export const saveCocktail = async (recipe: CocktailRecipe): Promise<void> => {
    try {
        await postCocktail(recipe);
    } catch (e) {
        // Données refusées : on remonte l'erreur plutôt que de la masquer en local.
        if (e instanceof Error && /^API Error: (400|401)/.test(e.message)) throw e;
        console.warn('API cocktails indisponible, recette gardée localement', e);
        const cocktails = readLocalCocktails().filter(c => c.id !== recipe.id);
        cocktails.push(recipe);
        localStorage.setItem(LOCAL_COCKTAILS_KEY, JSON.stringify(cocktails));
    }
};

export const updateCocktail = async (id: string, updates: Partial<CocktailRecipe>): Promise<CocktailRecipe> => {
    const response = await apiFetch(`${API_URL}/cocktails/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(updates)
    });
    return handleResponse(response);
};

export const deleteCocktail = async (id: string): Promise<void> => {
    const response = await apiFetch(`${API_URL}/cocktails/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    await handleResponse(response);
};

// --- TASTING NOTES ---

export const getTastingNotes = async (): Promise<TastingNote[]> => {
    const response = await apiFetch(`${API_URL}/tasting-notes`, { headers: getHeaders() });
    const notes: Omit<TastingNote, 'rating' | 'notes'>[] = (await handleResponse(response)) || [];
    return notes.map(n => ({
        ...n,
        rating: typeof n.overallRating === 'number' ? n.overallRating : null,
        notes: tastingPhrase(n.generalNotes),
    }));
};

export const saveTastingNote = async (note: NewTastingNote): Promise<void> => {
    const response = await apiFetch(`${API_URL}/tasting-notes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(note)
    });
    await handleResponse(response);
};

// --- JOURNAL / HISTORY ---

export const getCellarJournal = async (): Promise<JournalEntry[]> => {
    const response = await apiFetch(`${API_URL}/history`, { headers: getHeaders() });
    return handleResponse(response) || [];
};

export const getWineHistory = async (wineId: string): Promise<JournalEntry[]> => {
    const response = await apiFetch(`${API_URL}/history?wineId=${wineId}`, { headers: getHeaders() });
    return handleResponse(response) || [];
};

export const addJournalEntry = async (entry: Partial<JournalEntry>): Promise<void> => {
    const fullEntry: JournalEntry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        type: entry.type || 'NOTE',
        wineName: entry.wineName || 'Vin inconnu',
        userId: 'current-user',
        ...entry
    } as JournalEntry;

    await apiFetch(`${API_URL}/history`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(fullEntry)
    });
};

// --- CLEANUP (Ghost bottles) ---

export const findOrphanedBottles = async (): Promise<Bottle[]> => {
    const [wines, bottles] = await Promise.all([getWines(), getBottles()]);
    const wineIds = new Set(wines.map(w => w.id));
    return bottles.filter(b => !wineIds.has(b.wineId));
};

export const deleteBottleById = async (bottleId: string): Promise<void> => {
    await apiFetch(`${API_URL}/bottles/${bottleId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
};

export const cleanupGhostBottles = async (): Promise<{ orphaned: number; cleaned: number }> => {
    const orphaned = await findOrphanedBottles();
    let cleaned = 0;

    for (const b of orphaned) {
        try {
            await deleteBottleById(b.id);
            cleaned++;
        } catch (e) {
            console.error('Failed to delete orphaned bottle', b.id, e);
        }
    }

    return { orphaned: orphaned.length, cleaned };
};

// --- USER & CONFIG (Local Storage for Config, API for Profile) ---

// AI Config reste local pour la sécurité des clés
export const getAIConfig = (): AIConfig => {
    const stored = localStorage.getItem('vf_ai_config');
    if (!stored) {
        return {
            keys: { gemini: '', claude: '' }
        };
    }
    // Anciennes configurations : fournisseur et clés OpenAI/Mistral ignorés.
    const { keys = {} } = JSON.parse(stored);
    return { keys: { gemini: keys.gemini || '', claude: keys.claude || '' } };
};

export const saveAIConfig = (config: AIConfig): void => {
    localStorage.setItem('vf_ai_config', JSON.stringify({ keys: config.keys }));
};

// --- BACKUP (Export/Import) ---

export const exportFullData = async (): Promise<string> => {
  // On récupère tout depuis l'API
  const [wines, bottles, racks, spirits, notes, history, wishlist, cocktails] = await Promise.all([
      getWines(),
      getBottles(),
      getRacks(),
      getSpirits(),
      getTastingNotes(),
      getCellarJournal(),
      getWishlist(),
      getCocktails()
  ]);

  const data = {
    wines,
    bottles,
    racks,
    spirits,
    tastingNotes: notes,
    history,
    wishlist,
    cocktails,
    timestamp: new Date().toISOString()
  };
  
  return JSON.stringify(data, null, 2);
};

// --- WISHLIST FUNCTIONS ---

export const getWishlist = async (): Promise<WishlistItem[]> => {
    const response = await apiFetch(`${API_URL}/wishlist`, { headers: getHeaders() });
    return handleResponse(response) || [];
};

export const addWishlistItem = async (item: Partial<WishlistItem>): Promise<WishlistItem> => {
    const response = await apiFetch(`${API_URL}/wishlist`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(item)
    });
    return handleResponse(response);
};

export const deleteWishlistItem = async (id: string): Promise<void> => {
    await apiFetch(`${API_URL}/wishlist/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
};

export interface ImportResult {
  ok: boolean;
  error?: string;
  imported?: Record<string, { inserted: number; updated: number }>;
}

// Restauration côté serveur (POST /api/import) : fusion par identifiant dans
// une transaction — les lignes de la sauvegarde sont créées ou remplacent
// celles de même id, rien n'est supprimé, réimporter ne crée pas de doublon.
export const importFullData = async (jsonString: string): Promise<ImportResult> => {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: "Le fichier n'est pas un JSON valide." };
  }
  try {
    const response = await apiFetch(`${API_URL}/import`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: body?.error || `Erreur ${response.status}` };
    }
    return { ok: true, imported: body?.imported };
  } catch (e) {
    console.error("Import failed", e);
    return { ok: false, error: "Serveur injoignable." };
  }
};
