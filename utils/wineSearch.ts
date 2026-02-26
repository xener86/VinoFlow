import { CellarWine } from '../types';

/**
 * Normalize text for accent-insensitive search
 */
const normalize = (text: string): string =>
    text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Type label mapping for search (e.g. user types "rouge" → matches RED)
 */
const TYPE_LABELS: Record<string, string[]> = {
    RED: ['rouge', 'red'],
    WHITE: ['blanc', 'white'],
    ROSE: ['rosé', 'rose'],
    SPARKLING: ['bulles', 'sparkling', 'petillant', 'champagne', 'cremant'],
    DESSERT: ['dessert', 'moelleux', 'liquoreux', 'vendanges tardives'],
    FORTIFIED: ['muté', 'fortifié', 'porto', 'banyuls', 'maury'],
};

/**
 * Check if a wine matches a search query.
 * Searches across: name, cuvée, parcel, producer, region, appellation,
 * country, grape varieties, vintage, and type (with French labels).
 */
export const matchesWineSearch = (wine: CellarWine, query: string): boolean => {
    if (!query) return false;
    const q = normalize(query.trim());
    if (!q) return false;

    // Direct field matching
    const fields: string[] = [
        wine.name || '',
        wine.cuvee || '',
        wine.parcel || '',
        wine.producer || '',
        wine.region || '',
        wine.appellation || '',
        wine.country || '',
        wine.vintage?.toString() || '',
        ...(wine.grapeVarieties || []),
    ];

    // Check all fields
    for (const field of fields) {
        if (field && normalize(field).includes(q)) return true;
    }

    // Type matching with French labels
    const typeLabels = TYPE_LABELS[wine.type] || [];
    for (const label of typeLabels) {
        if (normalize(label).includes(q) || q.includes(normalize(label))) return true;
    }
    // Also match raw type (RED, WHITE, etc.)
    if (wine.type && normalize(wine.type).includes(q)) return true;

    return false;
};
