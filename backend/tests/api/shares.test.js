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

  describe('lecture publique (sans compte)', () => {
    const GONE = { error: 'Ce lien n’est plus actif.' };

    it('fiche : champs autorisés seulement, en-têtes noindex/no-store, compteur incrémenté', async () => {
      await client.post('/api/tasting-notes', { wineId: a.id, overallRating: 4, generalNotes: JSON.stringify({ phrase: 'Une claque', occasion: 'Noël', dish: 'Chapon' }), occasion: 'Noël', companions: 'Marc et Léa' });
      await client.post('/api/tasting-notes', { wineId: a.id, overallRating: null, generalNotes: null });
      const { token, id } = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;

      const res = await api().get(`/api/public/shares/${token}`);
      expect(res.status).toBe(200);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ kind: 'WINE', title: null, date: null });
      expect(res.body.wines).toHaveLength(1);
      expect(Object.keys(res.body.wines[0]).sort()).toEqual([
        'appellation', 'aromaProfile', 'country', 'cuvee', 'dish', 'grapeVarieties', 'name', 'position', 'producer', 'region',
        'sensoryDescription', 'suggestedFoodPairings', 'tastings', 'type', 'vintage',
      ]);
      expect(res.body.wines[0]).toMatchObject({ position: 1, name: 'Grand Vin', producer: 'Château Test', vintage: 2018, appellation: 'Pauillac', grapeVarieties: ['Cabernet'] });
      expect(res.body.wines[0].tastings).toEqual([{ date: expect.any(String), rating: 4, comment: 'Une claque' }]);
      const text = JSON.stringify(res.body);
      for (const forbidden of ['price', 'purchase', 'bottle', 'location', 'companion', 'occasion', 'peak', 'valuation', '"id"', 'wineId', 'Marc', 'Noël', '42', a.id]) {
        expect(text, `contenu interdit : ${forbidden}`).not.toContain(forbidden);
      }

      await api().get(`/api/public/shares/${token}`);
      const { rows } = await pool.query('SELECT view_count, last_viewed_at FROM shares WHERE id = $1', [id]);
      expect(rows[0].view_count).toBe(2);
      expect(rows[0].last_viewed_at).toBeTruthy();
      const list = (await client.get('/api/shares')).body;
      expect(list[0].viewCount).toBe(2);
    });

    it('carte : titre, date, vins dans l’ordre avec plats ; dégustation ajoutée après coup visible', async () => {
      const { token } = (await client.post('/api/shares', dinner())).body;
      const before = await api().get(`/api/public/shares/${token}`);
      expect(before.body).toMatchObject({ kind: 'DINNER', title: 'Dîner du 11', date: '2026-10-11' });
      expect(before.body.wines.map((w) => [w.position, w.name, w.dish])).toEqual([[1, 'Grand Vin', 'Gigot'], [2, 'Petit Blanc', null]]);
      expect(before.body.wines[1].tastings).toEqual([]);

      await client.post('/api/tasting-notes', { wineId: b.id, overallRating: 5, generalNotes: 'Vif et salin' });
      const after = await api().get(`/api/public/shares/${token}`);
      expect(after.body.wines[1].tastings).toEqual([{ date: expect.any(String), rating: 5, comment: 'Vif et salin' }]);
    });

    it('404 identique : inconnu, mal formé, révoqué ; le compteur ne bouge pas', async () => {
      const { id, token } = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      const unknown = await api().get(`/api/public/shares/${'A'.repeat(43)}`);
      const short = await api().get(`/api/public/shares/${token.slice(0, 42)}`);
      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual(GONE);
      expect(short.status).toBe(404);
      expect(short.body).toEqual(GONE);
      await client.post(`/api/shares/${id}/revoke`, {});
      const revoked = await api().get(`/api/public/shares/${token}`);
      expect(revoked.status).toBe(404);
      expect(revoked.body).toEqual(GONE);
      expect(revoked.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect((await pool.query('SELECT view_count FROM shares WHERE id = $1', [id])).rows[0].view_count).toBe(0);
    });

    it('vin supprimé : lien de fiche inactif, retiré de la carte (numéros resserrés)', async () => {
      const wineShare = (await client.post('/api/shares', { kind: 'WINE', wineId: b.id })).body;
      const card = (await client.post('/api/shares', dinner())).body;
      expect((await client.delete(`/api/wines/${b.id}`)).status).toBe(200);
      expect((await api().get(`/api/public/shares/${wineShare.token}`)).status).toBe(404);
      const res = await api().get(`/api/public/shares/${card.token}`);
      expect(res.status).toBe(200);
      expect(res.body.wines.map((w) => [w.position, w.name])).toEqual([[1, 'Grand Vin']]);
      expect((await client.get('/api/shares')).body.map((s) => s.id)).toEqual([card.id]);
    });

    it('limiteur dédié : 429 après 120 lectures depuis la même IP, en JSON français', async () => {
      const { token } = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      let last;
      for (let i = 0; i < 121; i++) last = await api().get(`/api/public/shares/${token}`).set('X-Forwarded-For', '203.0.113.9');
      expect(last.status).toBe(429);
      expect(last.body.error).toMatch(/Trop de requêtes/);
      // Autre IP : toujours servie ; la gestion n'est pas touchée par ce limiteur.
      expect((await api().get(`/api/public/shares/${token}`).set('X-Forwarded-For', '203.0.113.10')).status).toBe(200);
      expect((await client.get('/api/shares')).status).toBe(200);
    });
  });
});
