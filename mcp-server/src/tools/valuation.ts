// Valeur de la cave : cotes, investi, plus-value, rattrapage des prix d'achat.
import { z } from 'zod';
import { apiRequest } from '../vinoflow-client.js';
import { Server, eur, json, safe, text } from './shared.js';

interface Mover { name: string; vintage: number | null; price: number; avgPurchase: number; gainTotal: number }
interface CellarValue {
    today: { invested: number; estimatedPurchase: number; value: number; gain: number; gainPct: number | null };
    coverage: { bottles: number; withPrice: number; withValuation: number };
    movers: { up: Mover[]; down: Mover[] };
}
interface MissingRow { wineId: string; name: string; cuvee: string | null; vintage: number | null; missing: number; suggestedPrice: number | null }

const moverLine = (m: Mover) => `- ${m.name}${m.vintage ? ` ${m.vintage}` : ''}: ${eur(m.avgPurchase)} → ${eur(m.price)} (${m.gainTotal >= 0 ? '+' : ''}${eur(m.gainTotal)})`;

export const registerValuation = (server: Server) => {
    server.tool('get_cellar_value', 'Cellar value: market value (cote), money invested, unrealised gain, coverage, biggest winners and losers', {}, safe(async () => {
        const v = await apiRequest<CellarValue>('GET', '/cellar/value?months=12');
        const { today: t, coverage: c } = v;
        return text([
            `**Estimated value**: ${eur(t.value)} (${c.withValuation}/${c.bottles} bottles valued)`,
            `**Invested**: ${eur(t.invested)}${t.estimatedPurchase ? ` + ${eur(t.estimatedPurchase)} estimated purchase (missing prices)` : ''} (${c.withPrice}/${c.bottles} bottles with a price)`,
            `**Unrealised gain**: ${t.gain >= 0 ? '+' : ''}${eur(t.gain)}${t.gainPct != null ? ` (${(t.gainPct * 100).toFixed(1)} %)` : ''}`,
            v.movers.up.length ? `\nGained value:\n${v.movers.up.map(moverLine).join('\n')}` : '',
            v.movers.down.length ? `\nLost value:\n${v.movers.down.map(moverLine).join('\n')}` : '',
        ].filter(Boolean).join('\n'));
    }));

    server.tool('get_wine_valuation', 'Market value (cote) of a wine: latest value, range, sources, history', { wine_id: z.string() }, safe(async ({ wine_id }) => (
        text(json(await apiRequest('GET', `/wines/${wine_id}/valuations`)))
    )));

    server.tool(
        'set_wine_valuation',
        'Record a market value by hand (per bottle of the wine’s format, €); it takes priority over automatic search for 3 months',
        { wine_id: z.string(), price_eur: z.number().positive(), low_eur: z.number().positive().optional(), high_eur: z.number().positive().optional(), note: z.string().optional() },
        safe(async ({ wine_id, price_eur, low_eur, high_eur, note }) => {
            await apiRequest('POST', `/wines/${wine_id}/valuations`, { priceEur: price_eur, lowEur: low_eur ?? null, highEur: high_eur ?? null, note: note ?? null });
            return text(`Value recorded: ${eur(price_eur)}.`);
        }),
    );

    server.tool('refresh_wine_valuation', 'Queue a sourced web search for the current market value of a wine', { wine_id: z.string() }, safe(async ({ wine_id }) => {
        const r = await apiRequest<{ position: number }>('POST', `/wines/${wine_id}/valuations/refresh`, {});
        return text(`Valuation search queued (position ${r.position}). Check get_wine_valuation in a few minutes.`);
    }));

    server.tool('list_missing_prices', 'List wines in stock whose bottles have no purchase price, with the latest market value as a hint', {}, safe(async () => {
        const rows = await apiRequest<MissingRow[]>('GET', '/cellar/missing-prices');
        if (rows.length === 0) return text('Every bottle has a purchase price.');
        return text(rows.map((r) => `- ${[r.name, r.cuvee, r.vintage].filter(Boolean).join(' ')} — ${r.missing} bottle(s) without price${r.suggestedPrice != null ? ` (value: ${eur(r.suggestedPrice)})` : ''} | ID: ${r.wineId}`).join('\n'));
    }));

    server.tool(
        'set_missing_prices',
        'Fill purchase prices in bulk: each price applies only to the bottles of that wine that have none (never overwrites a price)',
        { prices: z.array(z.object({ wine_id: z.string(), price_eur: z.number().positive() })).min(1).max(500) },
        safe(async ({ prices }) => {
            const r = await apiRequest<{ updated: number }>('PUT', '/cellar/missing-prices', prices.map((p) => ({ wineId: p.wine_id, priceEur: p.price_eur })));
            return text(`${r.updated} bottle(s) updated.`);
        }),
    );
};
