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

  // Bugs connus, documentés et non corrigés dans le refactoring (it.fails passera
  // au rouge quand ils seront corrigés — retirer alors le .fails) :
  //  1. convertKeysToCamelCase transforme les Date en {} → purchaseDate invalide,
  //     aucune bouteille dans la fenêtre : le budget vaut toujours 0 ;
  //  2. purchase_price (numeric) arrive en chaîne → somme par concaténation.
  it.fails('budget : additionne les prix d’achat récents (bugs connus)', async () => {
    const wineId = (await client.post('/api/wines', newWine)).body.id;
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO bottles (wine_id, purchase_date, purchase_price) VALUES ($1, $2, 20), ($1, $2, 15.5)`,
      [wineId, now]
    );
    const res = await client.get('/api/cellar/budget?months=12');
    expect(res.body.total_spent).toBe(35.5);
  });
});
