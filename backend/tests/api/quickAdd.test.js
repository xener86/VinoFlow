import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// L'enrichissement réel appellerait les moteurs IA : on vérifie seulement la demande.
vi.mock('../../src/enrichment/scheduler.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestEnrichment: vi.fn(() => ({ queued: true, position: 1 })),
}));
const { requestEnrichment } = await import('../../src/enrichment/scheduler.js');
const { api, authed, bootstrapUser, hasDb, pool, resetData } = await import('./helpers.js');

const uuid = () => crypto.randomUUID();
const count = async (table, where = '', params = []) => Number((await pool.query(`SELECT count(*) FROM ${table} ${where}`, params)).rows[0].count);

describe.skipIf(!hasDb)('API ajout rapide', () => {
  let client;
  let a;
  beforeEach(async () => {
    await resetData();
    await pool.query('TRUNCATE quick_add_batches');
    vi.mocked(requestEnrichment).mockClear();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED' })).body;
  });
  afterAll(() => pool.end());

  const send = (lines, extra = {}) => client.post('/api/quick-add', { batchId: uuid(), lines, ...extra });

  it('authentification requise', async () => {
    expect((await api().post('/api/quick-add').send({ batchId: uuid(), lines: [] })).status).toBe(401);
  });

  it('rafale mixte : cave, envie, dégustation', async () => {
    const res = await send([
      { clientId: 'c1', destination: 'CELLAR', wine: { name: 'Sancerre', producer: 'Pinard', vintage: 2020, type: 'WHITE' }, quantity: 3, price: 18 },
      { clientId: 'w1', destination: 'WISHLIST', wine: { name: 'Barolo', producer: 'Conterno', vintage: 2016, type: 'RED' }, estimatedPrice: 60 },
      { clientId: 't1', destination: 'TASTING', wine: { name: 'Chinon', producer: 'Baudry', vintage: 2019, type: 'RED' }, rating: 4, comment: 'Croquant' },
    ], { occasion: 'Salon de Loire' });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ winesCreated: 2, bottlesAdded: 3, wishlistAdded: 1, tastingsAdded: 1 });
    const sancerre = res.body.lines.find((l) => l.clientId === 'c1');
    expect(sancerre.created).toBe(true);

    const bottles = (await pool.query('SELECT purchase_price, location, purchase_date FROM bottles WHERE wine_id = $1', [sancerre.wineId])).rows;
    expect(bottles).toHaveLength(3);
    expect(bottles.every((b) => b.purchase_price === 18 && b.location === 'Non trié' && b.purchase_date)).toBe(true);
    expect((await pool.query('SELECT * FROM journal WHERE wine_id = $1', [sancerre.wineId])).rows)
      .toEqual([expect.objectContaining({ type: 'IN', quantity: 3, description: 'Rafale · Salon de Loire', wine_name: 'Sancerre' })]);
    expect((await pool.query('SELECT * FROM wishlist')).rows).toEqual([expect.objectContaining({ name: 'Barolo', estimated_price: 60, source: 'Salon de Loire' })]);

    const chinon = res.body.lines.find((l) => l.clientId === 't1');
    expect((await pool.query('SELECT overall_rating, general_notes, occasion FROM tasting_notes WHERE wine_id = $1', [chinon.wineId])).rows)
      .toEqual([{ overall_rating: 4, general_notes: 'Croquant', occasion: 'Salon de Loire' }]);
    expect(await count('bottles', 'WHERE wine_id = $1', [chinon.wineId])).toBe(0);
    expect((await pool.query('SELECT format FROM wines WHERE id = $1', [chinon.wineId])).rows[0].format).toBe('750ml');

    // Enrichissement : seulement la nouvelle fiche qui a des bouteilles.
    expect(vi.mocked(requestEnrichment).mock.calls).toEqual([[sancerre.wineId, 'manual']]);
  });

  it('vin déjà en cave : par identifiant ou par identité, sans doublon ; forceNew crée une fiche', async () => {
    const res = await send([
      { clientId: '1', destination: 'CELLAR', wine: { name: 'Autre nom', vintage: 2018 }, matchWineId: a.id, quantity: 2 },
      { clientId: '2', destination: 'CELLAR', wine: { name: 'grand vin', producer: 'CHATEAU TEST', vintage: 2018 } },
      { clientId: '3', destination: 'CELLAR', wine: { name: 'Grand Vin', producer: 'Château Test', vintage: 2018 }, forceNew: true },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.lines.map((l) => [l.wineId === a.id, l.created])).toEqual([[true, false], [true, false], [false, true]]);
    expect(await count('bottles', 'WHERE wine_id = $1', [a.id])).toBe(3);
    expect(await count('wines')).toBe(2);
  });

  it('même vin photographié deux fois : une seule fiche', async () => {
    const wine = { name: 'Chablis', producer: 'Dauvissat', vintage: 2019, type: 'WHITE' };
    const res = await send([
      { clientId: '1', destination: 'CELLAR', wine },
      { clientId: '2', destination: 'TASTING', wine, rating: 5 },
    ]);
    expect(res.body.lines[0].wineId).toBe(res.body.lines[1].wineId);
    expect(res.body.summary.winesCreated).toBe(1);
  });

  it('ligne invalide ou vin disparu : 400, rien n’est écrit', async () => {
    const before = await count('wines');
    const bad = await send([
      { clientId: 'ok', destination: 'CELLAR', wine: { name: 'Bon' } },
      { clientId: 'ko', destination: 'TASTING', wine: { name: 'Sans note' } },
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body.lines).toEqual([{ clientId: 'ko', message: expect.stringMatching(/étoiles/) }]);

    const gone = await send([
      { clientId: 'ok', destination: 'CELLAR', wine: { name: 'Bon' } },
      { clientId: 'gone', destination: 'CELLAR', wine: { name: 'X' }, matchWineId: uuid() },
    ]);
    expect(gone.status).toBe(400);
    expect(gone.body.lines).toEqual([{ clientId: 'gone', message: expect.stringMatching(/n’existe plus/) }]);
    expect(await count('wines')).toBe(before);
    expect(await count('bottles')).toBe(0);
  });

  it('renvoi du même batchId : même compte-rendu, rien de recréé', async () => {
    const batch = { batchId: uuid(), lines: [{ clientId: '1', destination: 'CELLAR', wine: { name: 'Sancerre', vintage: 2020 }, quantity: 2 }] };
    const first = await client.post('/api/quick-add', batch);
    const again = await client.post('/api/quick-add', batch);
    expect(again.status).toBe(200);
    // Le renvoi le signale : le téléphone sait que les modifications faites depuis n'ont pas été prises.
    expect(first.body.replay).toBe(false);
    expect(again.body).toEqual({ ...first.body, replay: true });
    expect(await count('bottles')).toBe(2);
    expect(vi.mocked(requestEnrichment)).toHaveBeenCalledTimes(1);
  });
});
