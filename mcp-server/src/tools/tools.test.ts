import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest';
import { mockBackend, fakeServer } from '../test-helpers.js';

let registerAll: typeof import('./index.js').registerAll;

beforeAll(async () => {
    process.env.VINOFLOW_API_URL = 'http://vf.test/api';
    process.env.VINOFLOW_AUTH_TOKEN = 'jeton-test';
    ({ registerAll } = await import('./index.js'));
});
afterEach(() => vi.unstubAllGlobals());

const setup = () => {
    const s = fakeServer();
    registerAll(s.server as any);
    return s;
};

describe('enregistrement', () => {
    it('expose les nouveaux outils, sans aucune suppression ni restauration', () => {
        const { tools } = setup();
        const names = [...tools.keys()];
        expect(names).toEqual(expect.arrayContaining([
            'list_spirits', 'get_spirit', 'add_spirit', 'update_spirit', 'list_cocktails', 'save_cocktail', 'generate_cocktail',
            'list_tasting_notes', 'add_tasting_note', 'list_wishlist', 'add_wishlist_item',
            'move_bottle', 'gift_bottle', 'add_bottles', 'update_wine', 'set_wine_peak',
            'enrich_wine', 'get_wine_enrichment', 'get_enrichment_status', 'run_enrichment', 'identify_wine', 'get_ai_usage',
            'get_cellar_value', 'get_wine_valuation', 'set_wine_valuation', 'refresh_wine_valuation', 'list_missing_prices', 'set_missing_prices',
            'get_tonight_pairing', 'suggest_another_tonight', 'preview_newsletter', 'get_menuflow_status',
        ]));
        expect(names.filter((n) => /delete|remove|import|restore/.test(n))).toEqual([]);
    });
});

describe('bar', () => {
    it('update_spirit relit le spiritueux et renvoie l’objet complet (PUT remplace tout)', async () => {
        const { calls } = mockBackend((c) => (c.method === 'GET' && c.path === '/spirits/s1'
            ? { body: { id: 's1', name: 'Lagavulin 16', category: 'WHISKY', inventoryLevel: 80, isOpened: true } } : undefined));
        const { call } = setup();
        const r = await call('update_spirit', { spirit_id: 's1', inventory_level: 35 });
        expect(r.isError).toBe(false);
        expect(calls.find((c) => c.method === 'PUT')).toEqual({
            method: 'PUT', path: '/spirits/s1',
            body: { id: 's1', name: 'Lagavulin 16', category: 'WHISKY', inventoryLevel: 35, isOpened: true },
        });
    });

    it('generate_cocktail interroge le barman IA', async () => {
        const { calls } = mockBackend(() => ({ body: { name: 'Penicillin', ingredients: [{ name: 'Whisky', amount: 6, unit: 'cl' }], instructions: ['Secouer'] } }));
        const { call } = setup();
        const r = await call('generate_cocktail', { query: 'un cocktail fumé', ingredients: ['Lagavulin'] });
        expect(calls[0]).toEqual({ method: 'POST', path: '/ai/cocktail', body: { query: 'un cocktail fumé', ingredients: ['Lagavulin'] } });
        expect(r.text).toContain('Penicillin');
    });
});

describe('dégustations et envies', () => {
    it('add_tasting_note envoie la note sur 20 et les commentaires', async () => {
        const { calls } = mockBackend(() => ({ status: 201, body: { id: 't1' } }));
        const { call } = setup();
        await call('add_tasting_note', { wine_id: 'w1', rating: 16.5, notes: 'Fruit croquant', occasion: 'Dîner' });
        expect(calls[0]).toMatchObject({ method: 'POST', path: '/tasting-notes', body: { wineId: 'w1', overallRating: 16.5, generalNotes: 'Fruit croquant', occasion: 'Dîner' } });
    });

    it('list_tasting_notes filtre par vin', async () => {
        const { calls } = mockBackend(() => ({ body: [{ id: 't1', date: '2026-10-01T19:00:00Z', overallRating: 17, generalNotes: 'Superbe' }] }));
        const { call } = setup();
        const r = await call('list_tasting_notes', { wine_id: 'w1' });
        expect(calls[0].path).toBe('/tasting-notes?wineId=w1');
        expect(r.text).toContain('17/20');
    });
});

describe('écritures de cave', () => {
    it('update_wine n’envoie que les champs autorisés', async () => {
        const { calls } = mockBackend(() => ({ body: { id: 'w1', name: 'Alpha' } }));
        const { call } = setup();
        const r = await call('update_wine', { wine_id: 'w1', fields: { region: 'Loire', inventoryCount: 99, peak_start: 2020 } });
        expect(calls[0]).toEqual({ method: 'PUT', path: '/wines/w1', body: { region: 'Loire' } });
        expect(r.text).toMatch(/ignored.*inventoryCount.*peak_start/i);
    });

    it('update_wine sans champ autorisé : erreur, aucun appel', async () => {
        const { calls } = mockBackend();
        const { call } = setup();
        const r = await call('update_wine', { wine_id: 'w1', fields: { inventoryCount: 3 } });
        expect(r.isError).toBe(true);
        expect(calls).toEqual([]);
    });

    it('gift_bottle sort la bouteille et note le cadeau au journal', async () => {
        const { calls } = mockBackend((c) => {
            if (c.method === 'GET' && c.path === '/bottles?wineId=w1') return { body: [{ id: 'b1', wineId: 'w1', isConsumed: false }] };
            if (c.method === 'GET' && c.path === '/wines/w1') return { body: { id: 'w1', name: 'Alpha', vintage: 2019 } };
            return undefined;
        });
        const { call } = setup();
        await call('gift_bottle', { wine_id: 'w1', recipient: 'Laure', occasion: 'Anniversaire' });
        expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/bottles/b1', body: { isConsumed: true, giftedTo: 'Laure', giftOccasion: 'Anniversaire' } });
        expect(calls.find((c) => c.path === '/history')?.body).toMatchObject({ type: 'GIFT', wineId: 'w1', recipient: 'Laure' });
    });

    it('move_bottle déplace vers un emplacement libre et le note au journal', async () => {
        const { calls } = mockBackend((c) => (c.method === 'GET' && c.path === '/wines/w1' ? { body: { id: 'w1', name: 'Alpha', vintage: 2019 } } : undefined));
        const { call } = setup();
        await call('move_bottle', { wine_id: 'w1', bottle_id: 'b1', location: 'Cave du bas' });
        expect(calls.find((c) => c.method === 'PUT')).toEqual({ method: 'PUT', path: '/bottles/b1', body: { location: 'Cave du bas' } });
        expect(calls.find((c) => c.path === '/history')?.body).toMatchObject({ type: 'MOVE', toLocation: 'Cave du bas' });
    });

    it('add_bottles crée N bouteilles avec prix et date d’achat', async () => {
        const { calls } = mockBackend(() => ({ status: 201, body: { id: 'b' } }));
        const { call } = setup();
        await call('add_bottles', { wine_id: 'w1', quantity: 3, purchase_price: 24.5, purchase_date: '2026-10-05' });
        const posts = calls.filter((c) => c.path === '/bottles');
        expect(posts).toHaveLength(3);
        expect(posts[0].body).toMatchObject({ wineId: 'w1', purchasePrice: 24.5, purchaseDate: '2026-10-05' });
        expect(calls.find((c) => c.path === '/history')?.body).toMatchObject({ type: 'IN', quantity: 3 });
    });

    it('set_wine_peak refuse une fin avant le début', async () => {
        const { calls } = mockBackend();
        const { call } = setup();
        const r = await call('set_wine_peak', { wine_id: 'w1', peak_start: 2030, peak_end: 2025 });
        expect(r.isError).toBe(true);
        expect(calls).toEqual([]);
    });
});

describe('enrichissement et IA', () => {
    it('run_enrichment limite la portée et le nombre', async () => {
        const { calls } = mockBackend(() => ({ body: { queued: 12 } }));
        const { call } = setup();
        await call('run_enrichment', { scope: 'weak', limit: 12 });
        expect(calls[0]).toEqual({ method: 'POST', path: '/enrichment/run', body: { scope: 'weak', limit: 12 } });
    });

    it('identify_wine transmet nom, millésime et indice', async () => {
        const { calls } = mockBackend(() => ({ body: { producer: 'Domaine X', appellation: 'Saumur-Champigny' } }));
        const { call } = setup();
        const r = await call('identify_wine', { name: 'Saumur Champigny Roches', vintage: 2019 });
        expect(calls[0].body).toMatchObject({ name: 'Saumur Champigny Roches', vintage: 2019 });
        expect(r.text).toContain('Saumur-Champigny');
    });
});

describe('valeur de la cave', () => {
    it('set_missing_prices applique les prix en lot', async () => {
        const { calls } = mockBackend(() => ({ body: { updated: 5 } }));
        const { call } = setup();
        const r = await call('set_missing_prices', { prices: [{ wine_id: 'w1', price_eur: 22 }, { wine_id: 'w2', price_eur: 15.5 }] });
        expect(calls[0]).toEqual({ method: 'PUT', path: '/cellar/missing-prices', body: [{ wineId: 'w1', priceEur: 22 }, { wineId: 'w2', priceEur: 15.5 }] });
        expect(r.text).toContain('5');
    });

    it('get_cellar_value résume valeur, investi, plus-value et couverture', async () => {
        mockBackend(() => ({ body: {
            series: [], today: { invested: 210, estimatedPurchase: 28, value: 290, gain: 52, gainPct: 0.218 },
            coverage: { bottles: 7, withPrice: 5, withValuation: 7 }, movers: { up: [{ wineId: 'w4', name: 'Barolo', vintage: 2016, price: 150, avgPurchase: 120, gainPerBottle: 30, gainTotal: 30 }], down: [] },
        } }));
        const { call } = setup();
        const r = await call('get_cellar_value', {});
        expect(r.text).toMatch(/290/);
        expect(r.text).toMatch(/52/);
        expect(r.text).toContain('Barolo');
    });

    it('backend sans la route : message lisible, pas de plantage', async () => {
        mockBackend(() => ({ status: 404, text: 'Cannot GET /api/cellar/value' }));
        const { call } = setup();
        const r = await call('get_cellar_value', {});
        expect(r.isError).toBe(true);
        expect(r.text).toMatch(/pas disponible sur ce serveur VinoFlow/);
    });
});

describe('accord du soir et newsletter', () => {
    it('get_tonight_pairing affiche le plat et le vin conseillé', async () => {
        mockBackend(() => ({ body: { configured: true, dinner: { date: '2026-10-05', title: 'Poulet basquaise', verdicts: [] }, suggested: { wineId: 'w1', wine: 'Saumur-Champigny', vintage: 2019, reason: 'Fruit', location: 'Casier B' }, opened: [] } }));
        const { call } = setup();
        const r = await call('get_tonight_pairing', {});
        expect(r.text).toContain('Poulet basquaise');
        expect(r.text).toContain('Saumur-Champigny 2019');
        expect(r.text).toContain('Casier B');
    });

    it('MenuFlow non relié : réponse explicite', async () => {
        mockBackend(() => ({ body: { configured: false } }));
        const { call } = setup();
        expect((await call('get_tonight_pairing', {})).text).toMatch(/not connected/i);
    });

    it('preview_newsletter renvoie le markdown sans rien envoyer', async () => {
        const { calls } = mockBackend(() => ({ body: { subject: 'VinoFlow — votre cave, octobre 2026', markdown: '**Bilan** : 98 bouteilles', html: '<html>' } }));
        const { call } = setup();
        const r = await call('preview_newsletter', {});
        expect(calls).toEqual([{ method: 'GET', path: '/notifications/newsletter/preview', body: undefined }]);
        expect(r.text).toContain('**Bilan**');
    });
});
