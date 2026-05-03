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

// --- Tool: analyze_wine_fair ---
server.tool(
    'analyze_wine_fair',
    'Analyze a wine fair exhibitor list against the cellar inventory. Returns cellar context and exhibitor list for prioritized recommendations (INCONTOURNABLE / INTÉRESSANT / OPTIONNEL)',
    {
        exhibitors: z.string().describe('List of exhibitors/producers at the wine fair (one per line or comma-separated)'),
        priorities: z.string().optional().describe('User priorities or preferences for the fair (e.g., "looking for white wines", "budget < 30€")'),
    },
    async ({ exhibitors, priorities }) => {
        try {
            const [inventory, stats] = await Promise.all([
                client.getInventory(),
                client.getCellarStats()
            ]);

            const cellarContext = client.formatCellarContextForFair(inventory, stats);

            // Check which exhibitors are already known producers
            const exhibitorList = exhibitors
                .split(/[,\n]+/)
                .map(e => e.trim())
                .filter(Boolean);

            const knownProducers = inventory.map(w => w.producer.toLowerCase());
            const alreadyInCellar = exhibitorList.filter(e =>
                knownProducers.some(p => p.includes(e.toLowerCase()) || e.toLowerCase().includes(p))
            );

            const text = [
                `# Analyse Salon de Vignerons`,
                '',
                cellarContext,
                '',
                `## Exposants du Salon (${exhibitorList.length})`,
                exhibitorList.map(e => {
                    const inCellar = alreadyInCellar.some(a => a.toLowerCase() === e.toLowerCase());
                    return `- ${e}${inCellar ? ' ⭐ (déjà en cave)' : ''}`;
                }).join('\n'),
                '',
                alreadyInCellar.length > 0
                    ? `**${alreadyInCellar.length} exposant(s) déjà présent(s) en cave:** ${alreadyInCellar.join(', ')}`
                    : '**Aucun exposant déjà présent en cave.**',
                '',
                priorities ? `## Priorités Utilisateur\n${priorities}` : '',
                '',
                `## Instructions pour l'analyse`,
                `En te basant sur le profil de la cave ci-dessus et la liste des exposants, classe chaque exposant en:`,
                `- **INCONTOURNABLE** : exposant qui comble une faiblesse de la cave ou producteur déjà apprécié`,
                `- **INTÉRESSANT** : diversification pertinente ou découverte cohérente avec le profil`,
                `- **OPTIONNEL** : doublon avec ce qui existe déjà ou hors profil`,
                `Pour chaque exposant, donne une raison courte liée à la cave.`,
            ].filter(Boolean).join('\n');

            return { content: [{ type: 'text' as const, text }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// ──────────────────────────────────────────
// Sommelier v2 tools
// ──────────────────────────────────────────

server.tool(
    'sommelier_pair',
    'Get 3 categorized wine pairing recommendations for a dish (SAFE / PERSONAL / CREATIVE) using the Sommelier v2 pipeline (LLM decomposition + scoring + argumentation)',
    {
        dish: z.string().describe('The dish to pair with a wine (in French preferred)'),
        constraints: z.object({
            maxPrice: z.number().optional(),
            types: z.array(z.string()).optional(),
            regions: z.array(z.string()).optional(),
        }).optional().describe('Optional constraints (budget, types, regions)'),
    },
    async ({ dish, constraints }) => {
        try {
            const result = await client.sommelierPair(dish, { constraints });
            const formatPick = (label: string, p: any) => {
                if (!p) return `**${label}**: aucun`;
                return `**${label}**: ${p.wine_id}\n  ${p.reason}${p.service_temp_c ? ` · service ${p.service_temp_c}°C` : ''}${p.decant_minutes ? ` · décantage ${p.decant_minutes}min` : ''}`;
            };
            const text = [
                `# Accords pour: ${dish}`,
                `Cave: ${result.cave_size} vins → ${result.cave_after_filter} après pré-filtrage`,
                '',
                formatPick('🛡️ SAFE (classique)', result.picks.safe),
                formatPick('💖 PERSONAL (selon vos goûts)', result.picks.personal),
                formatPick('✨ CREATIVE (audacieux)', result.picks.creative),
                '',
                result.picks.global_advice ? `💡 ${result.picks.global_advice}` : '',
            ].filter(Boolean).join('\n');
            return { content: [{ type: 'text' as const, text }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'sommelier_reverse_pair',
    'Given a specific wine, suggest 5 dishes that would pair well with it. Useful when you want to open a specific bottle.',
    { wine_id: z.string().describe('The wine ID') },
    async ({ wine_id }) => {
        try {
            const result = await client.sommelierReversePair(wine_id);
            const lines = result.suggestions.map((s: any) =>
                `- **${s.dish}** (${s.type}) — ${s.reason}`
            ).join('\n');
            return { content: [{ type: 'text' as const, text: `# Plats suggérés\n\n${lines}\n\n💡 ${result.global_advice}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'sommelier_menu',
    'Pair a multi-course menu (entrée → plat → dessert), keeping wine progression coherent across courses',
    {
        dishes: z.array(z.string()).describe('Array of dishes in order (1-3 items)'),
    },
    async ({ dishes }) => {
        try {
            const result = await client.sommelierMenu(dishes);
            const lines = result.courses.map((c: any, i: number) => {
                const safePick = c.picks?.safe;
                return `## Service ${i + 1}: ${c.dish}\n${safePick ? `→ Vin: ${safePick.wine_id}\n  ${safePick.reason}` : 'Aucun accord trouvé'}`;
            }).join('\n\n');
            return { content: [{ type: 'text' as const, text: `# Menu accordé\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'sommelier_explain',
    'Get a detailed pedagogical explanation of why a specific wine pairs (or not) with a dish',
    {
        dish: z.string().describe('The dish'),
        wine_id: z.string().describe('The wine ID'),
    },
    async ({ dish, wine_id }) => {
        try {
            const result = await client.sommelierExplain(dish, wine_id);
            return { content: [{ type: 'text' as const, text: result.explanation }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'sommelier_compare',
    'Compare two wines for a specific dish and recommend the best one with reasoning',
    {
        dish: z.string(),
        wine_a_id: z.string(),
        wine_b_id: z.string(),
    },
    async ({ dish, wine_a_id, wine_b_id }) => {
        try {
            const result = await client.sommelierCompare(dish, wine_a_id, wine_b_id);
            const text = [
                `# Comparaison pour: ${dish}`,
                `**Gagnant**: ${result.winner === 'tie' ? 'Match nul' : `Vin ${result.winner}`}`,
                '',
                result.reasoning,
                '',
                `## Vin A`,
                `Forces: ${result.wine_a_strengths}`,
                `Faiblesses: ${result.wine_a_weaknesses}`,
                '',
                `## Vin B`,
                `Forces: ${result.wine_b_strengths}`,
                `Faiblesses: ${result.wine_b_weaknesses}`,
                '',
                result.advice ? `💡 ${result.advice}` : '',
            ].filter(Boolean).join('\n');
            return { content: [{ type: 'text' as const, text }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'sommelier_vertical',
    'Build a vertical tasting from multiple vintages of the same producer in the cellar',
    { producer: z.string().describe('Producer name') },
    async ({ producer }) => {
        try {
            const result = await client.sommelierVertical(producer);
            if (result.wines.length === 0) {
                return { content: [{ type: 'text' as const, text: result.note || 'Pas assez de millésimes' }] };
            }
            const lines = result.wines.map((w: any, i: number) =>
                `${i + 1}. **${w.cuvee || w.name} ${w.vintage}** — ${w.peak?.status || ''}`
            ).join('\n');
            return { content: [{ type: 'text' as const, text: `# Verticale ${producer}\n\n${lines}\n\n${result.note}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

// ──────────────────────────────────────────
// Proactive insights tools
// ──────────────────────────────────────────

server.tool(
    'get_drink_before_alerts',
    'List wines that are reaching the end of their drinking window. Use this to suggest what to drink soon.',
    { horizon_months: z.number().optional().describe('Look-ahead horizon in months (default 12)') },
    async ({ horizon_months }) => {
        try {
            const result = await client.getDrinkBeforeAlerts(horizon_months || 12);
            if (result.count === 0) {
                return { content: [{ type: 'text' as const, text: 'Aucun vin en fin de fenêtre.' }] };
            }
            const lines = result.alerts.slice(0, 20).map((a: any) =>
                `- **${a.wine.name} ${a.wine.vintage}** (${a.wine.producer}) — ${a.monthsLeft <= 0 ? 'Apogée passée' : `${a.monthsLeft} mois`}`
            ).join('\n');
            return { content: [{ type: 'text' as const, text: `# À boire avant (${result.count} vins)\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'get_purchase_suggestions',
    'Get predictive purchase suggestions based on consumption rate and current stock',
    {},
    async () => {
        try {
            const result = await client.getPurchaseSuggestions();
            if (result.count === 0) {
                return { content: [{ type: 'text' as const, text: 'Aucun manque détecté.' }] };
            }
            const lines = result.suggestions.map((s: any) =>
                `- **${s.type}** — Stock: ${s.current_stock} · Conso: ${s.monthly_rate}/mois · Reste ${s.months_of_stock || '∞'} mois → suggérer +${s.suggested_purchase} (priorité ${s.priority})`
            ).join('\n');
            return { content: [{ type: 'text' as const, text: `# Suggestions d'achat\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'get_aging_recommendations',
    'Get aging status for every wine in stock (AGING / PEAK / PAST) with messages',
    {},
    async () => {
        try {
            const result = await client.getAgingRecommendations();
            const groups: Record<string, any[]> = { AGING: [], PEAK: [], PAST: [] };
            for (const r of result.recommendations) groups[r.phase]?.push(r);
            const text = [
                `# Phase d'âge (${result.count} vins)`,
                `\n## 🟢 À leur apogée (${groups.PEAK.length})`,
                ...groups.PEAK.slice(0, 10).map((r: any) => `- ${r.wine.name} ${r.wine.vintage} — ${r.message}`),
                `\n## 🔴 Passés (${groups.PAST.length})`,
                ...groups.PAST.slice(0, 10).map((r: any) => `- ${r.wine.name} ${r.wine.vintage} — ${r.message}`),
                `\n## 🔵 Encore en garde (${groups.AGING.length})`,
                ...groups.AGING.slice(0, 5).map((r: any) => `- ${r.wine.name} ${r.wine.vintage} — ${r.message}`),
            ].join('\n');
            return { content: [{ type: 'text' as const, text }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'get_cellar_projection',
    'Project the cellar size N years ahead based on current consumption rate',
    { years_ahead: z.number().optional().describe('Years to project (default 5)') },
    async ({ years_ahead }) => {
        try {
            const result = await client.getCellarProjection(years_ahead || 5);
            const lines = result.projection.map((p: any) => `+${p.year_offset}an: ${p.projected_stock} btl`).join(' · ');
            return { content: [{ type: 'text' as const, text: `# Projection\n\nConso: ${result.monthly_consumption} btl/mois\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'get_cellar_budget',
    'Get cellar spending stats for a recent period (total, average, per type, cellar value estimate)',
    { months: z.number().optional().describe('Look-back period in months (default 12)') },
    async ({ months }) => {
        try {
            const result = await client.getCellarBudget(months || 12);
            const text = [
                `# Budget (${result.period_months} mois)`,
                `**Total dépensé**: ${result.total_spent} €`,
                `**Bouteilles achetées**: ${result.total_bottles}`,
                `**Prix moyen**: ${result.avg_price} €`,
                `**Moyenne mensuelle**: ${result.monthly_avg} €`,
                `**Valeur cave estimée**: ${result.cellar_value_estimate} €`,
            ].join('\n');
            return { content: [{ type: 'text' as const, text }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'find_duplicates',
    'Find potentially duplicate wines (same producer + name + vintage)',
    {},
    async () => {
        try {
            const result = await client.findDuplicates();
            if (result.count === 0) return { content: [{ type: 'text' as const, text: 'Aucun doublon.' }] };
            const lines = result.groups.map((g: any) => `- ${g.label} (${g.wines.length} entrées)`).join('\n');
            return { content: [{ type: 'text' as const, text: `# Doublons potentiels\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'audit_wines',
    'Audit the cellar for wines with weak/missing aroma profiles. Returns wines needing enrichment.',
    {},
    async () => {
        try {
            const result = await client.auditWines();
            if (result.count === 0) return { content: [{ type: 'text' as const, text: 'Tous les vins ont un profil aromatique correct.' }] };
            const lines = result.wines.slice(0, 20).map((w: any) =>
                `- **${w.name} ${w.vintage}** — ${w.aromaProfile?.length || 0} arômes · ${w.aromaConfidence || 'pas de confiance'}`
            ).join('\n');
            return { content: [{ type: 'text' as const, text: `# Vins à enrichir (${result.count})\n\n${lines}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'bulk_set_wine_peaks',
    'Set the drinking peak window for many wines at once, with values judged by YOU (Claude). This is the preferred way for Claude in the chat to apply its own wine knowledge: provide an array of {wine_id, peak_start, peak_end, reasoning, confidence}. Skips the backend LLM entirely.',
    {
        updates: z.array(z.object({
            wineId: z.string().describe('Wine ID'),
            peakStart: z.number().int().describe('Year peak window starts (e.g., 2025)'),
            peakEnd: z.number().int().describe('Year peak window ends (e.g., 2040)'),
            reasoning: z.string().optional().describe('Short justification (1 sentence)'),
            confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional().describe('Your confidence in this judgement'),
        })).describe('Array of peak updates to apply'),
    },
    async ({ updates }) => {
        try {
            const result = await client.bulkSetPeaks(updates as any);
            return { content: [{ type: 'text' as const, text: `Bulk peaks: ${result.success}/${result.processed} mis a jour. ${result.failed > 0 ? `${result.failed} echecs.` : ''}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'refresh_peaks',
    'Compute realistic drinking peak windows for wines via LLM, considering producer prestige, appellation level, vintage quality. Replaces the naive vintage+5 formula with per-wine intelligent windows (e.g., a Margaux Grand Cru 1983 has peak ~1995-2030+, not vintage+5..+10).',
    {
        force: z.boolean().optional().describe('Recompute even for wines that already have a peak'),
        limit: z.number().optional().describe('Max wines to process (default 50)'),
    },
    async ({ force, limit }) => {
        try {
            const result = await client.refreshPeaks(force || false, limit || 50);
            return { content: [{ type: 'text' as const, text: `Peak windows: ${result.updated}/${result.processed} vins mis a jour. ${result.failed > 0 ? `${result.failed} echecs.` : ''}` }] };
        } catch (e: any) {
            return { content: [{ type: 'text' as const, text: `Error: ${e.message}` }], isError: true };
        }
    }
);

server.tool(
    'enrich_wine_aromas',
    'Enrich wines without aroma profile in batch. Useful after import or for wines added manually.',
    {
        use_consensus: z.boolean().optional().describe('Cross-reference Gemini + Claude for higher confidence (slower, more expensive)'),
        limit: z.number().optional().describe('Max wines to process (default 50)'),
    },
    async ({ use_consensus, limit }) => {
        try {
            const result = await client.enrichAromas(use_consensus || false, limit || 50);
            return { content: [{ type: 'text' as const, text: `Enrichissement: ${result.enriched}/${result.processed} vins enrichis. ${result.failed > 0 ? `${result.failed} échecs.` : ''}` }] };
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
