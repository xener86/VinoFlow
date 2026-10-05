import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest';
import { mockBackend } from './test-helpers.js';

let client: typeof import('./vinoflow-client.js');

beforeAll(async () => {
    process.env.VINOFLOW_API_URL = 'http://vf.test/api';
    process.env.VINOFLOW_AUTH_TOKEN = 'jeton-test';
    client = await import('./vinoflow-client.js');
});
afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
    it('envoie la méthode, le chemin, le corps JSON et le jeton', async () => {
        const { calls, fetchMock } = mockBackend(() => ({ body: { ok: true } }));
        expect(await client.apiRequest('POST', '/wishlist', { name: 'Barolo' })).toEqual({ ok: true });
        expect(calls).toEqual([{ method: 'POST', path: '/wishlist', body: { name: 'Barolo' } }]);
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-test');
    });

    it('route absente sur un backend ancien : message lisible', async () => {
        mockBackend(() => ({ status: 404, text: '<pre>Cannot POST /api/cellar/missing-prices</pre>' }));
        await expect(client.apiRequest('POST', '/cellar/missing-prices', [])).rejects.toThrow(/pas disponible sur ce serveur VinoFlow/);
    });

    it('404 métier (ressource absente) : message de l’API conservé', async () => {
        mockBackend(() => ({ status: 404, body: { error: 'Wine not found' } }));
        await expect(client.apiRequest('GET', '/wines/x')).rejects.toThrow(/API 404: .*Wine not found/);
    });
});

describe('addWine', () => {
    it('utilise l’identifiant renvoyé par le serveur pour les bouteilles et note l’entrée au journal', async () => {
        const { calls } = mockBackend((c) => (c.method === 'POST' && c.path === '/wines'
            ? { status: 201, body: { id: 'id-serveur', name: 'Alpha', vintage: 2019 } } : { status: 201, body: {} }));
        expect(await client.addWine({ name: 'Alpha', vintage: 2019 }, 2)).toBe('id-serveur');
        const bottles = calls.filter((c) => c.path === '/bottles');
        expect(bottles).toHaveLength(2);
        expect(bottles.every((c) => (c.body as { wineId: string }).wineId === 'id-serveur')).toBe(true);
        expect(calls.find((c) => c.path === '/history')?.body).toMatchObject({ type: 'IN', wineId: 'id-serveur', quantity: 2 });
    });
});

describe('consumeBottle', () => {
    it('retire la bouteille du stock ET écrit la sortie au journal', async () => {
        const { calls } = mockBackend((c) => {
            if (c.method === 'GET' && c.path === '/bottles?wineId=w1') return { body: [{ id: 'b1', wineId: 'w1', isConsumed: false }] };
            if (c.method === 'GET' && c.path === '/wines/w1') return { body: { id: 'w1', name: 'Alpha', vintage: 2019 } };
            return undefined;
        });
        expect(await client.consumeBottle('w1')).toBe(true);
        expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/bottles/b1', body: { isConsumed: true } });
        expect(calls.find((c) => c.method === 'POST' && c.path === '/history')?.body).toMatchObject({
            type: 'OUT', wineId: 'w1', wineName: 'Alpha', wineVintage: 2019, quantity: 1,
        });
    });
});
