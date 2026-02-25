/**
 * HTTP client for the VinoFlow backend API
 */

const API_URL = process.env.VINOFLOW_API_URL || 'http://localhost:3100/api';
const AUTH_TOKEN = process.env.VINOFLOW_AUTH_TOKEN || '';

const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {})
});

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { ...headers(), ...options?.headers }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API ${response.status}: ${text}`);
    }

    if (response.status === 204) return null as T;
    return response.json();
}

// --- Types (mirroring frontend types) ---

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
    type: string;
    grapeVarieties: string[];
    format: string;
    sensoryDescription: string;
    aromaProfile: string[];
    tastingNotes: string;
    suggestedFoodPairings: string[];
    producerHistory: string;
    enrichedByAI: boolean;
    isFavorite: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Bottle {
    id: string;
    wineId: string;
    location: { rackId: string; x: number; y: number } | string;
    isConsumed: boolean;
    consumedDate?: string;
    purchaseDate?: string;
}

export interface Rack {
    id: string;
    name: string;
    width: number;
    height: number;
    type: 'SHELF' | 'BOX';
}

export interface JournalEntry {
    id: string;
    date: string;
    type: string;
    wineName: string;
    wineVintage?: number;
    quantity?: number;
    description?: string;
}

export interface CellarWine extends Wine {
    inventoryCount: number;
    bottles: Bottle[];
}

// --- API Functions ---

export async function getWines(): Promise<Wine[]> {
    return fetchJSON<Wine[]>('/wines');
}

export async function getBottles(): Promise<Bottle[]> {
    return fetchJSON<Bottle[]>('/bottles');
}

export async function getInventory(): Promise<CellarWine[]> {
    const [wines, bottles] = await Promise.all([getWines(), getBottles()]);

    return wines.map(wine => {
        const wineBottles = bottles.filter(b => b.wineId === wine.id && !b.isConsumed);
        return {
            ...wine,
            inventoryCount: wineBottles.length,
            bottles: wineBottles
        };
    });
}

export async function getWineById(id: string): Promise<CellarWine | null> {
    try {
        const wine = await fetchJSON<Wine>(`/wines/${id}`);
        const bottles = await fetchJSON<Bottle[]>(`/bottles?wineId=${id}`);
        const active = bottles.filter(b => !b.isConsumed);
        return { ...wine, inventoryCount: active.length, bottles: active };
    } catch {
        return null;
    }
}

export async function getRacks(): Promise<Rack[]> {
    return fetchJSON<Rack[]>('/racks');
}

export async function searchWines(query: string): Promise<CellarWine[]> {
    const inventory = await getInventory();
    const q = query.toLowerCase();
    return inventory.filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.producer.toLowerCase().includes(q) ||
        w.region.toLowerCase().includes(q) ||
        (w.cuvee && w.cuvee.toLowerCase().includes(q)) ||
        (w.appellation && w.appellation.toLowerCase().includes(q)) ||
        w.grapeVarieties.some(g => g.toLowerCase().includes(q)) ||
        w.vintage.toString().includes(q)
    );
}

export async function addWine(wine: Partial<Wine>, quantity: number = 1): Promise<string> {
    const newWine: Wine = {
        id: crypto.randomUUID(),
        name: wine.name || 'Vin Inconnu',
        producer: wine.producer || '',
        vintage: wine.vintage || new Date().getFullYear(),
        region: wine.region || '',
        country: wine.country || 'France',
        type: wine.type || 'RED',
        grapeVarieties: wine.grapeVarieties || [],
        format: wine.format || '750ml',
        sensoryDescription: wine.sensoryDescription || '',
        aromaProfile: wine.aromaProfile || [],
        tastingNotes: wine.tastingNotes || '',
        suggestedFoodPairings: wine.suggestedFoodPairings || [],
        producerHistory: wine.producerHistory || '',
        enrichedByAI: wine.enrichedByAI || false,
        isFavorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        personalNotes: [],
        sensoryProfile: { body: 3, acidity: 3, tannin: 3, sweetness: 1, alcohol: 3, flavors: [] },
        ...wine
    } as Wine;

    await fetchJSON('/wines', { method: 'POST', body: JSON.stringify(newWine) });

    // Add bottles
    for (let i = 0; i < quantity; i++) {
        await fetchJSON('/bottles', {
            method: 'POST',
            body: JSON.stringify({
                id: crypto.randomUUID(),
                wineId: newWine.id,
                location: 'Non trié',
                purchaseDate: new Date().toISOString(),
                isConsumed: false,
                addedByUserId: 'mcp-server'
            })
        });
    }

    return newWine.id;
}

export async function consumeBottle(wineId: string, bottleId?: string): Promise<boolean> {
    if (!bottleId) {
        const bottles = await fetchJSON<Bottle[]>(`/bottles?wineId=${wineId}`);
        const available = bottles.find(b => !b.isConsumed);
        if (!available) return false;
        bottleId = available.id;
    }

    await fetchJSON(`/bottles/${bottleId}`, {
        method: 'PUT',
        body: JSON.stringify({ isConsumed: true, consumedDate: new Date().toISOString() })
    });
    return true;
}

export async function getCellarJournal(limit: number = 50): Promise<JournalEntry[]> {
    const entries = await fetchJSON<JournalEntry[]>('/history');
    return entries
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, limit);
}

export async function getCellarStats(): Promise<{
    totalWines: number;
    totalBottles: number;
    byType: Record<string, number>;
    byRegion: Record<string, number>;
    favorites: number;
    unsorted: number;
}> {
    const inventory = await getInventory();
    const allBottles = inventory.flatMap(w => w.bottles);

    const byType: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    let favorites = 0;
    let unsorted = 0;

    for (const wine of inventory) {
        const count = wine.inventoryCount;
        byType[wine.type] = (byType[wine.type] || 0) + count;
        byRegion[wine.region] = (byRegion[wine.region] || 0) + count;
        if (wine.isFavorite) favorites++;
        unsorted += wine.bottles.filter(b => {
            if (typeof b.location === 'string') return b.location === 'Non trié';
            if (typeof b.location === 'object' && b.location !== null) return (b.location as any).label === 'Non trié';
            return false;
        }).length;
    }

    return {
        totalWines: inventory.length,
        totalBottles: allBottles.length,
        byType,
        byRegion,
        favorites,
        unsorted
    };
}
