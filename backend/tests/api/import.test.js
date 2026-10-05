import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

// Reproduit exportFullData (services/storageService.ts) : réponses brutes des GET.
const exportAll = async (client) => {
  const get = async (url) => (await client.get(url)).body;
  const [wines, bottles, racks, spirits, tastingNotes, history, wishlist, cocktails] = await Promise.all([
    get('/api/wines'), get('/api/bottles'), get('/api/racks'), get('/api/spirits'),
    get('/api/tasting-notes'), get('/api/history'), get('/api/wishlist'), get('/api/cocktails'),
  ]);
  // Le front ajoute rating/notes aux dégustations : champs inconnus, ignorés à l'import.
  const notes = tastingNotes.map((n) => ({ ...n, rating: n.overallRating, notes: 'phrase' }));
  // Les bouteilles agrégées dans /api/wines gardent les microsecondes de Postgres,
  // que le passage par une Date JavaScript tronque : comparaison à la milliseconde.
  for (const w of wines) for (const b of w.bottles) b.createdAt = new Date(b.createdAt).toISOString();
  return { wines, bottles, racks, spirits, tastingNotes: notes, history, wishlist, cocktails, timestamp: new Date().toISOString() };
};

const wipeCellar = () => pool.query(`TRUNCATE wines, bottles, racks, spirits, tasting_notes, journal, wishlist, cocktails CASCADE`);

const count = async (table) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

describe.skipIf(!hasDb)('API import (restauration)', () => {
  let client;
  let token;
  beforeEach(async () => {
    await resetData();
    token = (await bootstrapUser()).access_token;
    client = authed(token);
  });
  afterAll(() => pool.end());

  const seed = async () => {
    const rack = (await client.post('/api/racks', { name: 'Casier A', width: 4, height: 3, type: 'SHELF' })).body;
    const wine = (await client.post('/api/wines', {
      name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED',
      grapeVarieties: ['Merlot'], sensoryProfile: { body: 4 }, aromaProfile: ['cassis'],
    })).body;
    await client.post('/api/bottles', { wineId: wine.id, location: { rackId: rack.id, x: 1, y: 2 }, purchasePrice: 25, purchaseDate: '2026-03-01T10:00:00.000Z' });
    await client.post('/api/bottles', { wineId: wine.id, location: 'Non trié' });
    await client.post('/api/spirits', { name: 'Islay 10', category: 'WHISKY', abv: 46, suggestedCocktails: ['Penicillin'] });
    await client.post('/api/tasting-notes', { wineId: wine.id, date: '2026-03-01T20:00:00.000Z', overallRating: 4, noseNotes: { intensity: 3 } });
    await client.post('/api/history', { type: 'IN', wineId: wine.id, wineName: wine.name, quantity: 2, date: '2026-03-01T10:00:00.000Z' });
    await client.post('/api/wishlist', { name: 'Envie', estimatedPrice: 42.5 });
    await client.post('/api/cocktails', { id: 'api-11003', name: 'Negroni', ingredients: [{ name: 'Gin', amount: 3, unit: 'cl', optional: false }], tags: ['IBA'] });
    return { rack, wine };
  };

  it('authentification requise', async () => {
    expect((await api().post('/api/import').send({ wines: [] })).status).toBe(401);
  });

  it('aller-retour : export → base vidée → import restaure tout à l’identique', async () => {
    await seed();
    const backup = await exportAll(client);
    await wipeCellar();

    const res = await client.post('/api/import', backup);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      mode: 'merge',
      imported: {
        racks: { inserted: 1, updated: 0 }, wines: { inserted: 1, updated: 0 }, bottles: { inserted: 2, updated: 0 },
        spirits: { inserted: 1, updated: 0 }, tastingNotes: { inserted: 1, updated: 0 }, history: { inserted: 1, updated: 0 },
        wishlist: { inserted: 1, updated: 0 }, cocktails: { inserted: 1, updated: 0 },
      },
    });

    const restored = await exportAll(client);
    const { timestamp: _a, ...expected } = backup;
    const { timestamp: _b, ...actual } = restored;
    expect(actual).toEqual(expected);
  });

  it('réimporter le même fichier ne crée aucun doublon', async () => {
    await seed();
    const backup = await exportAll(client);
    const first = await client.post('/api/import', backup);
    expect(first.status).toBe(200);
    expect(first.body.imported.wines).toEqual({ inserted: 0, updated: 1 });
    expect((await client.post('/api/import', backup)).status).toBe(200);
    expect(await count('wines')).toBe(1);
    expect(await count('bottles')).toBe(2);
    expect(await count('journal')).toBe(1);
    expect(await count('cocktails')).toBe(1);
  });

  it('fusion : la sauvegarde remplace les lignes de même id, le reste est conservé', async () => {
    const { wine } = await seed();
    const backup = await exportAll(client);
    await client.put(`/api/wines/${wine.id}`, { name: 'Renommé après la sauvegarde' });
    const added = (await client.post('/api/wines', { name: 'Ajouté après', type: 'WHITE' })).body;

    expect((await client.post('/api/import', backup)).status).toBe(200);
    const wines = (await client.get('/api/wines')).body;
    expect(wines.map((w) => w.name).sort()).toEqual(['Ajouté après', 'Grand Vin']);
    expect(wines.find((w) => w.id === added.id)).toBeDefined();
  });

  it('bouteilles imbriquées dans les vins (sans tableau bottles) : restaurées', async () => {
    await seed();
    const { wines } = await exportAll(client);
    await wipeCellar();
    const res = await client.post('/api/import', { wines });
    expect(res.status).toBe(200);
    expect(res.body.imported.bottles).toEqual({ inserted: 2, updated: 0 });
  });

  it('les bouteilles peuvent référencer un vin déjà en base', async () => {
    const { wine } = await seed();
    const { bottles } = await exportAll(client);
    await pool.query('DELETE FROM bottles');
    expect((await client.post('/api/import', { bottles })).status).toBe(200);
    expect((await client.get(`/api/bottles?wineId=${wine.id}`)).body).toHaveLength(2);
  });

  it('accepte une sauvegarde de plus d’1 Mo', async () => {
    const wines = Array.from({ length: 600 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: `Vin ${i}`, type: 'RED', producerHistory: 'x'.repeat(2000),
    }));
    expect(JSON.stringify({ wines }).length).toBeGreaterThan(1_000_000);
    const res = await client.post('/api/import', { wines });
    expect(res.status).toBe(200);
    expect(await count('wines')).toBe(600);
  });

  describe('validation (rien n’est écrit en cas d’erreur)', () => {
    const wineId = '11111111-1111-4111-8111-111111111111';
    const okWine = { id: wineId, name: 'Vin', type: 'RED' };

    const expectRejected = async (body, message) => {
      const res = await client.post('/api/import', body);
      expect(res.status).toBe(400);
      if (message) expect(res.body.error).toMatch(message);
      expect(await count('wines')).toBe(0);
      expect(await count('racks')).toBe(0);
    };

    it('structure invalide', async () => {
      await expectRejected([], /objet/);
      await expectRejected({ foo: 1 }, /Aucune donnée/);
      await expectRejected({ wines: {} }, /tableau/);
      await expectRejected({ wines: ['x'] }, /objet attendu/);
    });

    it('identifiants manquants, invalides ou en double', async () => {
      await expectRejected({ wines: [{ name: 'Sans id' }] }, /identifiant/);
      await expectRejected({ wines: [{ id: 'pas-un-uuid', name: 'X' }] }, /identifiant/);
      await expectRejected({ wines: [okWine, { ...okWine, name: 'Doublon' }] }, /en double/);
    });

    it('champ obligatoire manquant', async () => {
      await expectRejected({ wines: [{ id: wineId, name: '  ' }] }, /name/);
    });

    it('bouteille pointant vers un vin inconnu', async () => {
      await expectRejected({
        racks: [{ id: '22222222-2222-4222-8222-222222222222', name: 'R', width: 1, height: 1 }],
        bottles: [{ id: '33333333-3333-4333-8333-333333333333', wineId }],
      }, /vin absent/);
    });

    it('contrainte SQL violée en cours d’import : transaction annulée', async () => {
      await expectRejected({
        racks: [{ id: '22222222-2222-4222-8222-222222222222', name: 'R', width: 1, height: 1, type: 'SHELF' }],
        wines: [okWine, { id: '44444444-4444-4444-8444-444444444444', name: 'Bleu', type: 'BLUE' }],
      }, /wines\[1\]/);
    });

    it('JSON invalide : 400', async () => {
      const res = await api().post('/api/import')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json').send('{ pas du json');
      expect(res.status).toBe(400);
    });
  });
});
