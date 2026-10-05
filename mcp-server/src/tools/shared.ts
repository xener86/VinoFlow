// Aides communes aux modules d'outils MCP.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiRequest } from '../vinoflow-client.js';

export type Server = McpServer;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

export const text = (t: string): Result => ({ content: [{ type: 'text' as const, text: t }] });

export const fail = (e: unknown): Result => ({
    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
    isError: true,
});

/** Enveloppe un gestionnaire : toute exception devient une réponse d'erreur lisible. */
export const safe = <A>(fn: (args: A) => Promise<Result>) => async (args: A): Promise<Result> => {
    try {
        return await fn(args);
    } catch (e) {
        return fail(e);
    }
};

export const json = (data: unknown) => '```json\n' + JSON.stringify(data, null, 2) + '\n```';

export const eur = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(2)} €`);

export const label = (w: { name?: string; wine?: string; cuvee?: string | null; vintage?: number | null }) =>
    [w.name ?? w.wine, w.cuvee, w.vintage].filter((v) => v !== null && v !== undefined && v !== '').join(' ');

interface WineLite { id: string; name: string; vintage?: number }
interface BottleLite { id: string; wineId: string; isConsumed: boolean }

export const getWine = (wineId: string) => apiRequest<WineLite>('GET', `/wines/${wineId}`);

/** Bouteille précisée, ou la première encore en cave pour ce vin. */
export const pickBottle = async (wineId: string, bottleId?: string): Promise<string> => {
    if (bottleId) return bottleId;
    const bottles = await apiRequest<BottleLite[]>('GET', `/bottles?wineId=${wineId}`);
    const available = bottles.find((b) => !b.isConsumed);
    if (!available) throw new Error('No bottle left in the cellar for this wine');
    return available.id;
};

/** Ligne de journal, comme l'app (historique, bilans, newsletter). */
export const journal = async (entry: Record<string, unknown>) => {
    await apiRequest('POST', '/history', entry);
};
