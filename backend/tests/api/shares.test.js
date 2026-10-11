import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

const allKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
  return out;
};
const GONE = { error: 'Ce lien n’est plus actif.' };

describe.skipIf(!hasDb)('API partages', () => {
  let client;
  let a;
  let b;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Pauillac', grapeVarieties: ['Merlot'] })).body;
    b = (await client.post('/api/wines', { name: 'Petit Vin', producer: 'Domaine Y', vintage: 2020, type: 'WHITE' })).body;
    await client.post('/api/bottles', { wineId: a.id, purchasePrice: 25, location: { rackId: 'r1', x: 1, y: 1 } });
    await client.post('/api/tasting-notes', { wineId: a.id, overallRating: 4, generalNotes: 'Superbe', occasion: 'Anniversaire', companions: 'Paul et Marie' });
  });
  afterAll(() => pool.end());

  const publicGet = (token) => api().get(`/api/public/shares/${token}`);
  const tokenOf = (res) => res.body.url.replace('/p/', '');

  it('routes de gestion réservées aux comptes', async () => {
    expect((await api().get('/api/shares')).status).toBe(401);
    expect((await api().post('/api/shares').send({ kind: 'WINE', wineId: a.id })).status).toBe(401);
  });

  it('identifiant mal formé : 404 JSON sur lecture, modification et révocation', async () => {
    for (const res of [await client.get('/api/shares/abc'), await client.put('/api/shares/abc', { title: 'x', items: [{ wineId: a.id }] }), await client.post('/api/shares/abc/revoke', {})]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Lien introuvable' });
    }
  });

  it('index unique : une seconde ligne active pour la même fiche est refusée par la base', async () => {
    await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
    await expect(pool.query(`INSERT INTO shares (token, kind, wine_id) VALUES ('x', 'WINE', $1)`, [a.id])).rejects.toMatchObject({ code: '23505' });
  });

  it('fiche : créée, puis reprise ; un seul lien même en double clic', async () => {
    const [r1, r2] = await Promise.all([
      client.post('/api/shares', { kind: 'WINE', wineId: a.id }),
      client.post('/api/shares', { kind: 'WINE', wineId: a.id }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.token).toBe(r2.body.token);
    expect(r1.body.url).toBe(`/p/${r1.body.token}`);
    expect(r1.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await client.post('/api/shares', { kind: 'WINE', wineId: '33333333-3333-4333-8333-333333333333' })).status).toBe(404);
  });

  it('page publique sans compte : champs autorisés seulement, en-têtes, compteur', async () => {
    const token = tokenOf(await client.post('/api/shares', { kind: 'WINE', wineId: a.id }));
    const res = await publicGet(token);
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ kind: 'WINE', title: null, wines: [{ position: 1, name: 'Grand Vin', appellation: 'Pauillac', grapeVarieties: ['Merlot'], tastings: [{ rating: 4, comment: 'Superbe' }] }] });
    const keys = allKeys(res.body);
    for (const forbidden of ['id', 'wineId', 'wine_id', 'purchasePrice', 'purchase_price', 'bottles', 'location', 'occasion', 'companions', 'peakStart', 'peak_start', 'embedding']) {
      expect(keys.has(forbidden)).toBe(false);
    }
    await publicGet(token);
    const list = (await client.get('/api/shares')).body;
    expect(list).toEqual([expect.objectContaining({ kind: 'WINE', wineName: 'Grand Vin', wineVintage: 2018, viewCount: 2, revokedAt: null })]);
  });

  it('carte de dîner : création, lecture, modification avec le même lien', async () => {
    const created = await client.post('/api/shares', { kind: 'DINNER', title: 'Dîner chez nous', date: '2026-10-12', items: [{ wineId: b.id, dish: 'Huîtres' }, { wineId: a.id, dish: 'Agneau' }] });
    expect(created.status).toBe(201);
    const token = tokenOf(created);
    expect((await publicGet(token)).body).toMatchObject({ kind: 'DINNER', title: 'Dîner chez nous', date: '2026-10-12', wines: [{ position: 1, name: 'Petit Vin', dish: 'Huîtres' }, { position: 2, name: 'Grand Vin', dish: 'Agneau' }] });

    const updated = await client.put(`/api/shares/${created.body.id}`, { title: 'Dîner du samedi', items: [{ wineId: a.id }, { wineId: b.id, dish: 'Fromages' }] });
    expect(updated.status).toBe(200);
    expect(updated.body.token).toBe(token);
    expect((await publicGet(token)).body).toMatchObject({ title: 'Dîner du samedi', date: null, wines: [{ name: 'Grand Vin', dish: null }, { name: 'Petit Vin', dish: 'Fromages' }] });
    expect((await client.get(`/api/shares/${created.body.id}`)).body).toMatchObject({ title: 'Dîner du samedi', items: [{ wineId: a.id, name: 'Grand Vin' }, { wineId: b.id, dish: 'Fromages' }] });
  });

  it('validation de la carte', async () => {
    const post = (body) => client.post('/api/shares', { kind: 'DINNER', ...body });
    expect((await post({ title: 'X', items: [] })).status).toBe(400);
    expect((await post({ title: 'X', items: Array.from({ length: 21 }, () => ({ wineId: a.id })) })).status).toBe(400);
    expect((await post({ title: ' ', items: [{ wineId: a.id }] })).status).toBe(400);
    expect((await post({ title: 'X', date: '2026-13-40', items: [{ wineId: a.id }] })).status).toBe(400);
    const unknown = await post({ title: 'X', items: [{ wineId: '33333333-3333-4333-8333-333333333333' }] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/n’existe pas/);
    expect((await client.post('/api/shares', { kind: 'OTHER' })).status).toBe(400);
  });

  it('révocation : 404 identique à un lien inconnu, modification refusée, idempotente', async () => {
    const created = await client.post('/api/shares', { kind: 'DINNER', title: 'D', items: [{ wineId: a.id }] });
    const token = tokenOf(created);
    const revoked = await client.post(`/api/shares/${created.body.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.revokedAt).toBeTruthy();
    expect((await client.post(`/api/shares/${created.body.id}/revoke`)).status).toBe(200);

    const gone = await publicGet(token);
    const unknown = await publicGet('A'.repeat(43));
    const malformed = await publicGet('abc');
    expect([gone.status, unknown.status, malformed.status]).toEqual([404, 404, 404]);
    expect(gone.body).toEqual(GONE);
    expect(unknown.body).toEqual(GONE);
    expect(malformed.body).toEqual(GONE);
    expect((await client.put(`/api/shares/${created.body.id}`, { title: 'D2', items: [{ wineId: a.id }] })).status).toBe(409);

    // Après révocation, partager la fiche crée un nouveau lien.
    const wine1 = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
    await client.post(`/api/shares/${wine1.body.id}/revoke`);
    const wine2 = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
    expect(wine2.status).toBe(201);
    expect(wine2.body.token).not.toBe(wine1.body.token);
  });

  it('vin supprimé : lien de fiche inactif, vin retiré de la carte', async () => {
    const wineToken = tokenOf(await client.post('/api/shares', { kind: 'WINE', wineId: a.id }));
    const dinnerToken = tokenOf(await client.post('/api/shares', { kind: 'DINNER', title: 'D', items: [{ wineId: a.id }, { wineId: b.id }] }));
    await client.delete(`/api/wines/${a.id}`);
    expect((await publicGet(wineToken)).status).toBe(404);
    expect((await publicGet(dinnerToken)).body.wines.map((w) => w.name)).toEqual(['Petit Vin']);
  });
});
