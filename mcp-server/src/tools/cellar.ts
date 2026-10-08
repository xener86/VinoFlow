// Écritures de cave : déplacer, offrir, ajouter des bouteilles ; modifier un vin, saisir une apogée.
// Aucune suppression : elles se font dans l'app.
import { z } from 'zod';
import { apiRequest } from '../vinoflow-client.js';
import { Server, fail, getWine, journal, pickBottle, safe, text } from './shared.js';

// Champs modifiables d'un vin (sous-ensemble de WRITABLE_FIELDS côté backend).
const WINE_FIELDS = new Set([
    'name', 'cuvee', 'parcel', 'producer', 'vintage', 'region', 'appellation', 'country', 'type',
    'grapeVarieties', 'format', 'personalNotes', 'sensoryDescription', 'aromaProfile', 'tastingNotes',
    'suggestedFoodPairings', 'producerHistory', 'isFavorite',
]);

export const registerCellarWrites = (server: Server) => {
    server.tool(
        'move_bottle',
        'Move a bottle to another place: a free label (e.g. "Cave du bas") or a rack slot (rack_id + x + y, 0-based)',
        {
            wine_id: z.string(),
            bottle_id: z.string(),
            location: z.string().optional().describe('Free label'),
            rack_id: z.string().optional(),
            x: z.number().int().min(0).optional(),
            y: z.number().int().min(0).optional(),
        },
        safe(async ({ wine_id, bottle_id, location, rack_id, x, y }) => {
            const target = rack_id != null && x != null && y != null ? { rackId: rack_id, x, y } : location;
            if (!target) return fail('Give either a location label or rack_id + x + y');
            await apiRequest('PUT', `/bottles/${bottle_id}`, { location: target });
            const wine = await getWine(wine_id).catch(() => null);
            const to = typeof target === 'string' ? target : `Rack [${String.fromCharCode(65 + target.y)}${target.x + 1}]`;
            await journal({ type: 'MOVE', wineId: wine_id, wineName: wine?.name || 'Vin', wineVintage: wine?.vintage, quantity: 1, description: `Déplacement → ${to}`, toLocation: to });
            return text(`Bottle moved to ${to}.`);
        }),
    );

    server.tool(
        'gift_bottle',
        'Give a bottle away: it leaves the cellar and the gift is recorded in the journal',
        { wine_id: z.string(), bottle_id: z.string().optional(), recipient: z.string(), occasion: z.string().optional() },
        safe(async ({ wine_id, bottle_id, recipient, occasion }) => {
            const id = await pickBottle(wine_id, bottle_id);
            await apiRequest('PUT', `/bottles/${id}`, { isConsumed: true, consumedDate: new Date().toISOString(), giftedTo: recipient, giftOccasion: occasion ?? '' });
            const wine = await getWine(wine_id).catch(() => null);
            await journal({ type: 'GIFT', wineId: wine_id, wineName: wine?.name || 'Vin inconnu', wineVintage: wine?.vintage, recipient, occasion: occasion ?? '', quantity: 1, description: `Cadeau à ${recipient}` });
            return text(`Bottle given to ${recipient}.`);
        }),
    );

    server.tool(
        'add_bottles',
        'Add bottles of an existing wine (purchase), with optional price and date',
        {
            wine_id: z.string(),
            quantity: z.number().int().min(1).max(24),
            purchase_price: z.number().positive().optional().describe('Price per bottle, €'),
            purchase_date: z.string().optional().describe('ISO date, defaults to today'),
            location: z.string().optional().describe('Free label, defaults to the waiting zone'),
        },
        safe(async ({ wine_id, quantity, purchase_price, purchase_date, location }) => {
            for (let i = 0; i < quantity; i++) {
                await apiRequest('POST', '/bottles', {
                    wineId: wine_id, purchasePrice: purchase_price ?? null, purchaseDate: purchase_date ?? new Date().toISOString().slice(0, 10), location: location ?? 'Non trié',
                });
            }
            const wine = await getWine(wine_id).catch(() => null);
            await journal({ type: 'IN', wineId: wine_id, wineName: wine?.name || 'Vin', wineVintage: wine?.vintage, quantity, description: `Achat de ${quantity} bouteille(s)` });
            return text(`Added ${quantity} bottle(s).`);
        }),
    );

    server.tool(
        'update_wine',
        `Update fields of a wine record. Allowed fields: ${[...WINE_FIELDS].join(', ')}. Use set_wine_peak for the drinking window.`,
        { wine_id: z.string(), fields: z.record(z.string(), z.unknown()).describe('Fields to change, camelCase') },
        safe(async ({ wine_id, fields }) => {
            const allowed = Object.fromEntries(Object.entries(fields).filter(([k]) => WINE_FIELDS.has(k)));
            const ignored = Object.keys(fields).filter((k) => !WINE_FIELDS.has(k));
            if (Object.keys(allowed).length === 0) return fail(`No updatable field (ignored: ${ignored.join(', ')})`);
            await apiRequest('PUT', `/wines/${wine_id}`, allowed);
            return text(`Updated ${Object.keys(allowed).join(', ')}.${ignored.length ? ` Ignored fields: ${ignored.join(', ')}.` : ''}`);
        }),
    );

    server.tool(
        'set_wine_peak',
        'Set the drinking window of a wine by hand (years); marked as USER and never overwritten by enrichment',
        { wine_id: z.string(), peak_start: z.number().int(), peak_end: z.number().int(), reasoning: z.string().optional() },
        safe(async ({ wine_id, peak_start, peak_end, reasoning }) => {
            if (peak_end < peak_start) return fail('peak_end must be >= peak_start');
            await apiRequest('PUT', `/wines/${wine_id}/peak`, { peakStart: peak_start, peakEnd: peak_end, reasoning });
            return text(`Drinking window set to ${peak_start}–${peak_end}.`);
        }),
    );
};
