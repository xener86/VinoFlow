#!/usr/bin/env node

/**
 * VinoFlow MCP Server
 *
 * Exposes the VinoFlow wine cellar as tools for Claude.
 *
 * Environment variables:
 *   VINOFLOW_API_URL   - Backend API URL (default: http://localhost:3100/api)
 *   VINOFLOW_AUTH_TOKEN - Auth token for the backend API
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as client from './vinoflow-client.js';

const server = new McpServer({
    name: 'vinoflow',
    version: '1.0.0',
});

// --- Tool: search_wines ---
server.tool(
    'search_wines',
    'Search wines in the cellar by name, producer, region, grape variety, vintage, or appellation',
    { query: z.string().describe('Search query') },
    async ({ query }) => {
        try {
            const results = await client.searchWines(query);
            if (results.length === 0) {
                return { content: [{ type: 'text' as const, text: `No wines found matching "${query}".` }] };
            }
            const summary = results.map(w =>
                `- **${w.name}** ${w.cuvee ? `(${w.cuvee})` : ''} ${w.vintage} — ${w.producer}, ${w.region}${w.appellation ? ` (${w.appellation})` : ''} | ${w.type} | ${w.inventoryCount} btl | ID: ${w.id}`
            ).join('\n');
            return { content: [{ type: 'text' as const, text: `Found ${results.length} wine(s):\n\n${summary}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Tool: get_wine_details ---
server.tool(
    'get_wine_details',
    'Get complete details of a specific wine including bottles, locations, tasting notes, and food pairings',
    { wine_id: z.string().describe('The wine ID to look up') },
    async ({ wine_id }) => {
        try {
            const wine = await client.getWineById(wine_id);
            if (!wine) {
                return { content: [{ type: 'text' as const, text: `Wine not found: ${wine_id}` }], isError: true };
            }

            const racks = await client.getRacks();
            const bottleLines = wine.bottles.map(b => {
                if (typeof b.location === 'string') return `  - ${b.id}: ${b.location}`;
                const loc = b.location as { rackId: string; x: number; y: number };
                const rack = racks.find(r => r.id === loc.rackId);
                return `  - ${b.id}: ${rack?.name || '?'} [${String.fromCharCode(65 + loc.y)}${loc.x + 1}]`;
            });

            const text = [
                `# ${wine.name} ${wine.cuvee ? `— ${wine.cuvee}` : ''}`,
                `**Vintage:** ${wine.vintage}`,
                `**Producer:** ${wine.producer}`,
                `**Region:** ${wine.region}${wine.appellation ? ` (${wine.appellation})` : ''}`,
                `**Country:** ${wine.country}`,
                `**Type:** ${wine.type}`,
                `**Grapes:** ${wine.grapeVarieties.join(', ')}`,
                `**Format:** ${wine.format}`,
                `**Favorite:** ${wine.isFavorite ? 'Yes' : 'No'}`,
                '',
                `## Sensory Description`,
                wine.sensoryDescription || 'N/A',
                '',
                `## Tasting Notes`,
                wine.tastingNotes || 'N/A',
                '',
                `## Food Pairings`,
                wine.suggestedFoodPairings.length > 0 ? wine.suggestedFoodPairings.map(p => `- ${p}`).join('\n') : 'N/A',
                '',
                `## Bottles in Cellar (${wine.inventoryCount})`,
                bottleLines.length > 0 ? bottleLines.join('\n') : 'No bottles in stock.',
            ].join('\n');

            return { content: [{ type: 'text' as const, text }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Tool: add_wine ---
server.tool(
    'add_wine',
    'Add a new wine to the cellar with specified details and bottle count',
    {
        name: z.string().describe('Wine name / domaine'),
        vintage: z.number().describe('Vintage year'),
        producer: z.string().optional().describe('Producer name'),
        region: z.string().optional().describe('Wine region'),
        appellation: z.string().optional().describe('Wine appellation'),
        type: z.enum(['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED']).optional().describe('Wine type/color'),
        grape_varieties: z.array(z.string()).optional().describe('List of grape varieties'),
        quantity: z.number().optional().describe('Number of bottles (default: 1)'),
        cuvee: z.string().optional().describe('Cuvée name'),
        country: z.string().optional().describe('Country (default: France)'),
    },
    async (args) => {
        try {
            const id = await client.addWine({
                name: args.name,
                producer: args.producer || '',
                vintage: args.vintage,
                region: args.region || '',
                appellation: args.appellation,
                country: args.country || 'France',
                type: args.type || 'RED',
                grapeVarieties: args.grape_varieties || [],
                cuvee: args.cuvee,
            }, args.quantity || 1);

            return { content: [{ type: 'text' as const, text: `Wine added!\n- Name: ${args.name}\n- Vintage: ${args.vintage}\n- Bottles: ${args.quantity || 1}\n- ID: ${id}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Tool: consume_bottle ---
server.tool(
    'consume_bottle',
    'Mark a bottle as consumed. If no bottle_id provided, consumes the first available bottle',
    {
        wine_id: z.string().describe('The wine ID'),
        bottle_id: z.string().optional().describe('Specific bottle ID (optional)'),
    },
    async ({ wine_id, bottle_id }) => {
        try {
            const success = await client.consumeBottle(wine_id, bottle_id);
            if (!success) {
                return { content: [{ type: 'text' as const, text: 'No available bottle found for this wine.' }], isError: true };
            }
            return { content: [{ type: 'text' as const, text: `Bottle consumed for wine ${wine_id}.` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Tool: get_cellar_stats ---
server.tool(
    'get_cellar_stats',
    'Get cellar statistics: total wines, bottles, breakdown by type/region, favorites, unsorted count',
    {},
    async () => {
        try {
            const stats = await client.getCellarStats();
            const typeLines = Object.entries(stats.byType).map(([t, c]) => `  - ${t}: ${c}`).join('\n');
            const regionLines = Object.entries(stats.byRegion)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([r, c]) => `  - ${r}: ${c}`)
                .join('\n');

            const text = [
                `# Cellar Statistics`,
                `**Total wines:** ${stats.totalWines}`,
                `**Total bottles:** ${stats.totalBottles}`,
                `**Favorites:** ${stats.favorites}`,
                `**Unsorted:** ${stats.unsorted}`,
                '',
                `## By Type`,
                typeLines || 'N/A',
                '',
                `## By Region (Top 10)`,
                regionLines || 'N/A',
            ].join('\n');

            return { content: [{ type: 'text' as const, text }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Tool: get_cellar_journal ---
server.tool(
    'get_cellar_journal',
    'Get cellar activity journal (additions, consumptions, moves, gifts)',
    { limit: z.number().optional().describe('Max entries (default: 20)') },
    async ({ limit }) => {
        try {
            const entries = await client.getCellarJournal(limit || 20);
            if (entries.length === 0) {
                return { content: [{ type: 'text' as const, text: 'No journal entries found.' }] };
            }
            const lines = entries.map(e =>
                `- [${e.date.slice(0, 10)}] **${e.type}** — ${e.wineName}${e.wineVintage ? ` (${e.wineVintage})` : ''}${e.description ? `: ${e.description}` : ''}`
            ).join('\n');

            return { content: [{ type: 'text' as const, text: `# Journal (${entries.length} entries)\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Tool: list_racks ---
server.tool(
    'list_racks',
    'List all storage racks and boxes in the cellar',
    {},
    async () => {
        try {
            const racks = await client.getRacks();
            if (racks.length === 0) {
                return { content: [{ type: 'text' as const, text: 'No racks configured.' }] };
            }
            const lines = racks.map(r =>
                `- **${r.name}** — ${r.type} (${r.width}×${r.height} = ${r.width * r.height} slots) | ID: ${r.id}`
            ).join('\n');

            return { content: [{ type: 'text' as const, text: `# Racks (${racks.length})\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Tool: get_inventory ---
server.tool(
    'get_inventory',
    'Get full cellar inventory with all wines and bottle counts',
    {},
    async () => {
        try {
            const inventory = await client.getInventory();
            if (inventory.length === 0) {
                return { content: [{ type: 'text' as const, text: 'Cellar is empty.' }] };
            }
            const lines = inventory
                .sort((a, b) => b.inventoryCount - a.inventoryCount)
                .map(w =>
                    `- **${w.name}** ${w.cuvee ? `(${w.cuvee})` : ''} ${w.vintage} — ${w.producer}, ${w.region} | ${w.type} | ${w.inventoryCount} btl | ID: ${w.id}`
                ).join('\n');

            const total = inventory.reduce((s, w) => s + w.inventoryCount, 0);
            return { content: [{ type: 'text' as const, text: `# Inventory — ${inventory.length} wines, ${total} bottles\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// --- Start Server ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('VinoFlow MCP Server running on stdio');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
