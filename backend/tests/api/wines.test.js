import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('API vins et bouteilles', () => {
  let client;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
  });
  afterAll(() => pool.end());

  const newWine = { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', region: 'Bordeaux', grapeVarieties: ['Merlot'] };

  it('CRUD vin', async () => {
    const created = await client.post('/api/wines', newWine);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...newWine, id: expect.any(String) });
    const id = created.body.id;

    const list = await client.get('/api/wines');
    expect(list.status).toBe(200);
    expect(list.body.map((w) => w.id)).toEqual([id]);

    expect((await client.get(`/api/wines/${id}`)).body).toMatchObject({ id, name: 'Grand Vin' });

    const updated = await client.put(`/api/wines/${id}`, { ...newWine, name: 'Grand Vin 2', isFavorite: true });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Grand Vin 2', isFavorite: true });

    expect((await client.delete(`/api/wines/${id}`)).status).toBe(200);
    expect((await client.get(`/api/wines/${id}`)).status).toBe(404);
  });

  it('vin inexistant : 404', async () => {
    expect((await client.get('/api/wines/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('bouteilles : ajout, filtre par vin, consommation, suppression, cascade', async () => {
    const wineId = (await client.post('/api/wines', newWine)).body.id;
    const otherId = (await client.post('/api/wines', { ...newWine, name: 'Autre' })).body.id;

    const b1 = await client.post('/api/bottles', { wineId, location: { rackId: 'r1', x: 0, y: 1 }, purchasePrice: 25 });
    expect(b1.status).toBe(201);
    expect(b1.body).toMatchObject({ wineId, isConsumed: false, location: { rackId: 'r1', x: 0, y: 1 } });
    const b2 = (await client.post('/api/bottles', { wineId, location: 'Non trié' })).body;
    await client.post('/api/bottles', { wineId: otherId, location: 'Non trié' });

    expect((await client.get('/api/bottles')).body).toHaveLength(3);
    const ofWine = (await client.get(`/api/bottles?wineId=${wineId}`)).body;
    expect(ofWine.map((b) => b.id).sort()).toEqual([b1.body.id, b2.id].sort());

    const consumed = await client.put(`/api/bottles/${b1.body.id}`, { isConsumed: true, consumedDate: '2026-01-01T00:00:00Z' });
    expect(consumed.status).toBe(200);
    expect(consumed.body.isConsumed).toBe(true);

    expect((await client.delete(`/api/bottles/${b2.id}`)).status).toBe(200);
    expect((await client.get(`/api/bottles?wineId=${wineId}`)).body).toHaveLength(1);

    // Supprimer le vin supprime ses bouteilles (ON DELETE CASCADE)
    await client.delete(`/api/wines/${wineId}`);
    expect((await client.get('/api/bottles')).body.map((b) => b.wineId)).toEqual([otherId]);
  });

  it('GET /api/wines agrège les bouteilles du vin', async () => {
    const wineId = (await client.post('/api/wines', newWine)).body.id;
    await client.post('/api/bottles', { wineId, location: 'Non trié' });
    const [wine] = (await client.get('/api/wines')).body;
    expect(wine.bottles).toHaveLength(1);
  });

  it('budget : additionne les prix d’achat récents', async () => {
    const wineId = (await client.post('/api/wines', newWine)).body.id;
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO bottles (wine_id, purchase_date, purchase_price) VALUES ($1, $2, 20), ($1, $2, 15.5)`,
      [wineId, now]
    );
    const res = await client.get('/api/cellar/budget?months=12');
    expect(res.body).toMatchObject({ total_spent: 35.5, total_bottles: 2, cellar_value_estimate: 35.5 });
  });

  it('dates en ISO 8601 et colonnes numeric en nombres', async () => {
    const wine = (await client.post('/api/wines', newWine)).body;
    expect(wine.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const bottle = (await client.post('/api/bottles', {
      wineId: wine.id, location: 'Non trié', purchasePrice: 19.9, purchaseDate: '2026-03-01T10:00:00.000Z',
    })).body;
    expect(bottle.purchasePrice).toBe(19.9);
    expect(bottle.purchaseDate).toBe('2026-03-01T10:00:00.000Z');
    const [listed] = (await client.get('/api/bottles')).body;
    expect(listed).toMatchObject({ purchasePrice: 19.9, purchaseDate: '2026-03-01T10:00:00.000Z' });
    expect(typeof listed.createdAt).toBe('string');

    await client.post('/api/history', { type: 'IN', wineId: wine.id, wineName: wine.name, quantity: 1, date: '2026-03-01T10:00:00.000Z' });
    const [entry] = (await client.get('/api/history')).body;
    expect(entry.date).toBe('2026-03-01T10:00:00.000Z');

    const item = (await client.post('/api/wishlist', { name: 'Envie', estimatedPrice: 42.5 })).body;
    expect(item.estimatedPrice).toBe(42.5);
    expect(typeof item.addedAt).toBe('string');
  });
});
