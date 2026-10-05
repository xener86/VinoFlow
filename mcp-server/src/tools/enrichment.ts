// Enrichissement sourcé (cascade de recherche web) et assistant IA.
import { z } from 'zod';
import { apiRequest } from '../vinoflow-client.js';
import { Server, json, safe, text } from './shared.js';

export const registerEnrichment = (server: Server) => {
    server.tool('enrich_wine', 'Queue a sourced web enrichment of one wine (aromas, drinking window, corrections); runs in the background', { wine_id: z.string() }, safe(async ({ wine_id }) => {
        const r = await apiRequest<{ position: number }>('POST', `/wines/${wine_id}/enrich`, {});
        return text(`Enrichment queued (position ${r.position}). Check get_wine_enrichment in a few minutes.`);
    }));

    server.tool('get_wine_enrichment', 'Show the enrichment of a wine: level reached, sources, next check, change history', { wine_id: z.string() }, safe(async ({ wine_id }) => (
        text(json(await apiRequest('GET', `/wines/${wine_id}/enrichment`)))
    )));

    server.tool('get_enrichment_status', 'Show the enrichment queue: engine, running job, queue, daily count', {}, safe(async () => (
        text(json(await apiRequest('GET', '/enrichment/status')))
    )));

    server.tool(
        'run_enrichment',
        'Queue the enrichment of several wines: never enriched (missing) or with a weak level (weak)',
        { scope: z.enum(['missing', 'weak']), limit: z.number().int().min(1).max(100).optional() },
        safe(async ({ scope, limit }) => text(json(await apiRequest('POST', '/enrichment/run', { scope, limit: limit ?? 20 })))),
    );

    server.tool(
        'identify_wine',
        'Identify a wine from a name typed or read on a label (producer, appellation, type, grapes…); nothing is saved',
        { name: z.string(), vintage: z.number().int().optional(), hint: z.string().optional().describe('Extra context, e.g. text of the back label') },
        safe(async ({ name, vintage, hint }) => text(json(await apiRequest('POST', '/ai/identify-wine', { name, vintage, hint })))),
    );

    server.tool('get_ai_usage', 'Show the AI calls made by the server: count and estimated cost per task and model', {}, safe(async () => (
        text(json(await apiRequest('GET', '/ai/usage')))
    )));
};
