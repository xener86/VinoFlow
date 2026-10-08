// Bar : spiritueux, cocktails enregistrés, recettes du barman IA.
import { z } from 'zod';
import { apiRequest } from '../vinoflow-client.js';
import { Server, json, safe, text } from './shared.js';

interface Spirit { id: string; name: string; category?: string; distillery?: string; inventoryLevel?: number; isOpened?: boolean; abv?: number }
interface Cocktail { id: string; name: string; baseSpirit?: string; ingredients?: { name: string; amount?: number; unit?: string }[]; isFavorite?: boolean }

const SPIRIT_FIELDS = {
    name: z.string().optional().describe('Name'),
    category: z.enum(['WHISKY', 'GIN', 'VODKA', 'RUM', 'TEQUILA', 'COGNAC', 'VERMOUTH', 'LIQUEUR', 'BITTER', 'OTHER']).optional(),
    distillery: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    age: z.string().optional().describe('Age statement, e.g. "16 ans"'),
    abv: z.number().optional().describe('Alcohol by volume, %'),
    format: z.string().optional().describe('e.g. 70cl'),
    description: z.string().optional(),
    is_opened: z.boolean().optional(),
    inventory_level: z.number().min(0).max(100).optional().describe('Remaining level in the bottle, % (0-100)'),
};

// Paramètres de l'outil (snake_case) → champs de l'API (camelCase).
const toApi = (args: Record<string, unknown>) => {
    const map: Record<string, string> = { is_opened: 'isOpened', inventory_level: 'inventoryLevel' };
    return Object.fromEntries(
        Object.entries(args)
            .filter(([k, v]) => k in SPIRIT_FIELDS && v !== undefined)
            .map(([k, v]) => [map[k] || k, v]),
    );
};

export const registerBar = (server: Server) => {
    server.tool('list_spirits', 'List the spirits of the home bar with their remaining level', {}, safe(async () => {
        const spirits = await apiRequest<Spirit[]>('GET', '/spirits');
        if (spirits.length === 0) return text('The bar is empty.');
        return text(spirits.map((s) => `- **${s.name}** (${s.category || '?'}${s.distillery ? `, ${s.distillery}` : ''}) — ${s.isOpened ? `opened, ${s.inventoryLevel ?? '?'} % left` : 'sealed'} | ID: ${s.id}`).join('\n'));
    }));

    server.tool('get_spirit', 'Get the full record of a spirit', { spirit_id: z.string() }, safe(async ({ spirit_id }) => (
        text(json(await apiRequest('GET', `/spirits/${spirit_id}`)))
    )));

    server.tool('add_spirit', 'Add a spirit to the home bar', { ...SPIRIT_FIELDS, name: z.string().describe('Name') }, safe(async (args) => {
        const created = await apiRequest<Spirit>('POST', '/spirits', { isOpened: false, inventoryLevel: 100, ...toApi(args) });
        return text(`Added **${created.name}** to the bar (ID: ${created.id}).`);
    }));

    server.tool(
        'update_spirit',
        'Update a spirit (e.g. remaining level after a pour, opened). Only the given fields change.',
        { spirit_id: z.string(), ...SPIRIT_FIELDS },
        safe(async ({ spirit_id, ...rest }) => {
            // PUT /spirits/:id remplace tout l'objet : on part de la fiche actuelle.
            const current = await apiRequest<Spirit>('GET', `/spirits/${spirit_id}`);
            const updated = await apiRequest<Spirit>('PUT', `/spirits/${spirit_id}`, { ...current, ...toApi(rest) });
            return text(`Updated **${updated?.name ?? current.name}**.`);
        }),
    );

    server.tool('list_cocktails', 'List the saved cocktail recipes', {}, safe(async () => {
        const cocktails = await apiRequest<Cocktail[]>('GET', '/cocktails');
        if (cocktails.length === 0) return text('No saved cocktail.');
        return text(cocktails.map((c) => `- **${c.name}**${c.baseSpirit ? ` (${c.baseSpirit})` : ''}${c.isFavorite ? ' ★' : ''} — ${(c.ingredients || []).map((i) => i.name).join(', ')} | ID: ${c.id}`).join('\n'));
    }));

    server.tool(
        'save_cocktail',
        'Save a cocktail recipe (e.g. one returned by generate_cocktail)',
        {
            name: z.string(),
            base_spirit: z.string().optional(),
            ingredients: z.array(z.object({ name: z.string(), amount: z.number().optional(), unit: z.string().optional() })),
            instructions: z.array(z.string()),
            glass_type: z.string().optional(),
            is_favorite: z.boolean().optional(),
        },
        safe(async ({ name, base_spirit, ingredients, instructions, glass_type, is_favorite }) => {
            const saved = await apiRequest<Cocktail>('POST', '/cocktails', {
                name, baseSpirit: base_spirit, ingredients, instructions, glassType: glass_type, isFavorite: is_favorite, source: 'MCP',
            });
            return text(`Saved cocktail **${saved.name}** (ID: ${saved.id}).`);
        }),
    );

    server.tool(
        'generate_cocktail',
        'Ask the AI bartender for a cocktail recipe, optionally using given ingredients (nothing is saved)',
        { query: z.string().describe('What you want, e.g. "un cocktail fumé pour l’apéritif"'), ingredients: z.array(z.string()).optional() },
        safe(async ({ query, ingredients }) => text(json(await apiRequest('POST', '/ai/cocktail', { query, ingredients })))),
    );
};
