import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('API partage public', () => {
  let client;
  let a;
  let b;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Pauillac', grapeVarieties: ['Cabernet'] })).body;
    b = (await client.post('/api/wines', { name: 'Petit Blanc', producer: 'Dom. Essai', vintage: 2022, type: 'WHITE' })).body;
    await client.post('/api/bottles', { wineId: a.id, location: 'Non trié', purchasePrice: 42 });
  });
  afterAll(() => pool.end());

  const dinner = (over = {}) => ({ kind: 'DINNER', title: 'Dîner du 11', date: '2026-10-11', items: [{ wineId: a.id, dish: 'Gigot' }, { wineId: b.id }], ...over });

  describe('gestion (authentifiée)', () => {
    it('401 sans compte', async () => {
      expect((await api().get('/api/shares')).status).toBe(401);
      expect((await api().post('/api/shares').send({ kind: 'WINE', wineId: a.id })).status).toBe(401);
    });

    it('fiche vin : créée (201) puis reprise (200, même jeton) ; 404 vin inconnu ; 400 corps invalide', async () => {
      const first = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ kind: 'WINE', url: `/p/${first.body.token}` });
      expect(first.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const again = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
      expect(again.status).toBe(200);
      expect(again.body.token).toBe(first.body.token);
      expect((await client.post('/api/shares', { kind: 'WINE', wineId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
      expect((await client.post('/api/shares', { kind: 'WINE', wineId: 'x' })).status).toBe(400);
      expect((await client.post('/api/shares', { kind: 'AUTRE' })).status).toBe(400);
    });

    it('fiche révoquée puis repartagée : nouveau jeton', async () => {
      const first = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      expect((await client.post(`/api/shares/${first.id}/revoke`, {})).status).toBe(200);
      const second = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
      expect(second.status).toBe(201);
      expect(second.body.token).not.toBe(first.token);
    });

    it('carte : création, lecture pour le compositeur, modification (même jeton, nouvel ordre, plats)', async () => {
      const created = await client.post('/api/shares', dinner());
      expect(created.status).toBe(201);
      const { id, token } = created.body;

      const read = await client.get(`/api/shares/${id}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ id, token, kind: 'DINNER', title: 'Dîner du 11', dinnerDate: '2026-10-11', revokedAt: null });
      expect(read.body.items).toEqual([
        { wineId: a.id, dish: 'Gigot', name: 'Grand Vin', producer: 'Château Test', vintage: 2018 },
        { wineId: b.id, dish: null, name: 'Petit Blanc', producer: 'Dom. Essai', vintage: 2022 },
      ]);

      const updated = await client.put(`/api/shares/${id}`, { title: 'Dîner du 12', date: null, items: [{ wineId: b.id, dish: 'Huîtres' }, { wineId: a.id }] });
      expect(updated.status).toBe(200);
      expect(updated.body).toEqual({ id, token, kind: 'DINNER', url: `/p/${token}` });
      const after = (await client.get(`/api/shares/${id}`)).body;
      expect(after.title).toBe('Dîner du 12');
      expect(after.dinnerDate).toBeNull();
      expect(after.items.map((i) => [i.wineId, i.dish])).toEqual([[b.id, 'Huîtres'], [a.id, null]]);
    });

    it('carte : validation (0 vin, 21 vins, titre vide, vin inconnu, date impossible)', async () => {
      expect((await client.post('/api/shares', dinner({ items: [] }))).status).toBe(400);
      expect((await client.post('/api/shares', dinner({ items: Array.from({ length: 21 }, () => ({ wineId: a.id })) }))).status).toBe(400);
      expect((await client.post('/api/shares', dinner({ title: '  ' }))).status).toBe(400);
      const unknown = await client.post('/api/shares', dinner({ items: [{ wineId: '00000000-0000-4000-8000-000000000000' }] }));
      expect(unknown.status).toBe(400);
      expect(unknown.body.error).toMatch(/n’existe plus/);
      expect((await client.post('/api/shares', dinner({ date: '2026-02-30' }))).status).toBe(400);
      expect(Number((await pool.query('SELECT count(*) FROM shares')).rows[0].count)).toBe(0);
    });

    it('PUT : 404 inconnue, 400 sur une fiche, 409 sur une carte révoquée', async () => {
      expect((await client.put('/api/shares/00000000-0000-4000-8000-000000000000', dinner())).status).toBe(404);
      const wineShare = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      expect((await client.put(`/api/shares/${wineShare.id}`, dinner())).status).toBe(400);
      const card = (await client.post('/api/shares', dinner())).body;
      await client.post(`/api/shares/${card.id}/revoke`, {});
      expect((await client.put(`/api/shares/${card.id}`, dinner())).status).toBe(409);
    });

    it('liste : plus récents d’abord, résumé par lien ; révocation idempotente', async () => {
      const wineShare = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      const card = (await client.post('/api/shares', dinner())).body;
      const revoke = await client.post(`/api/shares/${wineShare.id}/revoke`, {});
      expect(revoke.status).toBe(200);
      expect(revoke.body.revokedAt).toBeTruthy();
      const revokeAgain = await client.post(`/api/shares/${wineShare.id}/revoke`, {});
      expect(revokeAgain.body.revokedAt).toBe(revoke.body.revokedAt);
      expect((await client.post('/api/shares/00000000-0000-4000-8000-000000000000/revoke', {})).status).toBe(404);

      const list = await client.get('/api/shares');
      expect(list.status).toBe(200);
      expect(list.body.map((s) => s.id)).toEqual([card.id, wineShare.id]);
      expect(list.body[0]).toMatchObject({ kind: 'DINNER', title: 'Dîner du 11', dinnerDate: '2026-10-11', wineName: null, itemCount: 2, revokedAt: null, viewCount: 0, lastViewedAt: null });
      expect(list.body[1]).toMatchObject({ kind: 'WINE', title: null, wineName: 'Grand Vin', wineVintage: 2018, itemCount: 0 });
      expect(list.body[1].revokedAt).toBeTruthy();
      expect(list.body[0]).toHaveProperty('token');
      expect(list.body[0]).toHaveProperty('createdAt');
    });

    it('GET /api/shares/:id : 404 inconnue', async () => {
      expect((await client.get('/api/shares/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    });
  });
});
