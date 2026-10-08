import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('API valeur de la cave', () => {
  let client;
  let a;
  let b;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    const add = async (name) => (await pool.query(`INSERT INTO wines (name, vintage, type) VALUES ($1, 2019, 'RED') RETURNING id`, [name])).rows[0].id;
    a = await add('Alpha');
    b = await add('Bravo');
    await pool.query(`INSERT INTO bottles (wine_id, purchase_price, purchase_date) VALUES ($1, 20, '2025-01-10'), ($1, NULL, '2025-01-10'), ($1, 0, '2025-01-10')`, [a]);
    await pool.query(`INSERT INTO bottles (wine_id, purchase_price, purchase_date, is_consumed, consumed_date) VALUES ($1, NULL, '2025-02-01', true, '2025-06-01')`, [a]);
    await pool.query(`INSERT INTO bottles (wine_id, purchase_price) VALUES ($1, 12)`, [b]);
  });
  afterAll(() => pool.end());

  it('authentification requise', async () => {
    expect((await api().get('/api/cellar/value')).status).toBe(401);
  });

  it('saisie manuelle de cote, validation et historique', async () => {
    expect((await client.post(`/api/wines/${a}/valuations`, { priceEur: -3 })).status).toBe(400);
    expect((await client.post(`/api/wines/${a}/valuations`, { priceEur: 30, lowEur: 40, highEur: 35 })).status).toBe(400);
    const r = await client.post(`/api/wines/${a}/valuations`, { priceEur: 30, note: 'Caviste' });
    expect(r.status).toBe(201);
    const v = await client.get(`/api/wines/${a}/valuations`);
    expect(v.body.latest).toMatchObject({ priceEur: 30, basis: 'USER', note: 'Caviste' });
    expect(v.body.status).toBe('OK');
  });

  it('valeur de la cave : investi, cote, couverture', async () => {
    await client.post(`/api/wines/${a}/valuations`, { priceEur: 30 });
    const r = await client.get('/api/cellar/value?months=6');
    expect(r.status).toBe(200);
    expect(r.body.series).toHaveLength(6);
    expect(r.body.today).toMatchObject({ invested: 32, value: 90 });
    expect(r.body.coverage).toEqual({ bottles: 4, withPrice: 2, withValuation: 3 });
  });

  it('rattrapage : liste des vins sans prix et application sans écraser les prix existants', async () => {
    await client.post(`/api/wines/${a}/valuations`, { priceEur: 30 });
    const list = await client.get('/api/cellar/missing-prices');
    expect(list.body).toEqual([expect.objectContaining({ wineId: a, name: 'Alpha', missing: 3, suggestedPrice: 30 })]);
    const r = await client.put('/api/cellar/missing-prices', [{ wineId: a, priceEur: 22 }]);
    expect(r.body).toEqual({ updated: 3 });
    const { rows } = await pool.query('SELECT purchase_price FROM bottles WHERE wine_id = $1 ORDER BY purchase_price', [a]);
    expect(rows.map((x) => x.purchase_price)).toEqual([20, 22, 22, 22]);
    const j = await pool.query("SELECT count(*)::int AS n FROM journal WHERE type = 'NOTE' AND wine_id = $1", [a]);
    expect(j.rows[0].n).toBe(1);
    expect((await client.get('/api/cellar/missing-prices')).body).toEqual([]);
  });

  it('rattrapage : ligne invalide → 400 et rien n’est écrit', async () => {
    const r = await client.put('/api/cellar/missing-prices', [{ wineId: a, priceEur: 22 }, { wineId: b, priceEur: 'abc' }]);
    expect(r.status).toBe(400);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bottles WHERE purchase_price = 22');
    expect(rows[0].n).toBe(0);
  });

  it('rafraîchir sans moteur : 409', async () => {
    expect((await client.post(`/api/wines/${a}/valuations/refresh`, {})).status).toBe(409);
  });

  describe('avec un moteur disponible (repli API)', () => {
    beforeEach(() => vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-factice'));
    afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

    it('cote saisie il y a moins de 3 mois : 409 explicite, aucune recherche promise', async () => {
      await client.post(`/api/wines/${a}/valuations`, { priceEur: 30 });
      const r = await client.post(`/api/wines/${a}/valuations/refresh`, {});
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/moins de 3 mois/);
    });

    it('base indisponible : 500, pas de rejet non géré', async () => {
      vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connexion perdue'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const r = await client.post(`/api/wines/${a}/valuations/refresh`, {});
      expect(r.status).toBe(500);
    });
  });
});
