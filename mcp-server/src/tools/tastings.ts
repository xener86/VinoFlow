// Dégustations et liste d'envies.
import { z } from 'zod';
import { apiRequest } from '../vinoflow-client.js';
import { Server, eur, safe, text } from './shared.js';

interface TastingNote { id: string; wineId: string; date: string; overallRating?: number | null; generalNotes?: string | null; occasion?: string | null }
interface WishItem { id: string; name: string; producer?: string; vintage?: number; estimatedPrice?: number | null; priority?: string }

export const registerTastings = (server: Server) => {
    server.tool(
        'list_tasting_notes',
        'List tasting notes, for one wine or for the whole cellar (most recent first)',
        { wine_id: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
        safe(async ({ wine_id, limit }) => {
            const notes = await apiRequest<TastingNote[]>('GET', `/tasting-notes${wine_id ? `?wineId=${wine_id}` : ''}`);
            if (notes.length === 0) return text('No tasting note.');
            return text(notes.slice(0, limit ?? 20).map((n) => `- ${n.date.slice(0, 10)} — ${n.overallRating != null ? `${n.overallRating}/20` : 'no rating'}${n.occasion ? ` (${n.occasion})` : ''} — ${n.generalNotes || ''}${wine_id ? '' : ` | wine ${n.wineId}`}`).join('\n'));
        }),
    );

    server.tool(
        'add_tasting_note',
        'Record a tasting note for a wine (rating out of 20)',
        {
            wine_id: z.string(),
            rating: z.number().min(0).max(20).optional().describe('Overall rating out of 20'),
            notes: z.string().optional().describe('Free-text impressions'),
            occasion: z.string().optional(),
            companions: z.string().optional(),
            date: z.string().optional().describe('ISO date, defaults to now'),
        },
        safe(async ({ wine_id, rating, notes, occasion, companions, date }) => {
            await apiRequest('POST', '/tasting-notes', {
                wineId: wine_id, overallRating: rating ?? null, generalNotes: notes ?? null, occasion: occasion ?? null, companions: companions ?? null, ...(date ? { date } : {}),
            });
            return text('Tasting note recorded.');
        }),
    );

    server.tool('list_wishlist', 'List the wines on the wishlist', {}, safe(async () => {
        const items = await apiRequest<WishItem[]>('GET', '/wishlist');
        if (items.length === 0) return text('The wishlist is empty.');
        return text(items.map((i) => `- **${i.name}**${i.producer ? ` — ${i.producer}` : ''}${i.vintage ? ` ${i.vintage}` : ''} | ${i.priority || 'MEDIUM'}${i.estimatedPrice ? ` | ~${eur(i.estimatedPrice)}` : ''}`).join('\n'));
    }));

    server.tool(
        'add_wishlist_item',
        'Add a wine to the wishlist',
        {
            name: z.string(),
            producer: z.string().optional(),
            region: z.string().optional(),
            appellation: z.string().optional(),
            type: z.enum(['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED']).optional(),
            vintage: z.number().int().optional(),
            estimated_price: z.number().optional(),
            priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
            notes: z.string().optional(),
        },
        safe(async ({ estimated_price, ...rest }) => {
            const item = await apiRequest<WishItem>('POST', '/wishlist', { ...rest, estimatedPrice: estimated_price, source: 'MCP' });
            return text(`Added **${item.name}** to the wishlist.`);
        }),
    );
};
