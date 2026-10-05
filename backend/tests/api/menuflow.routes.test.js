import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

vi.mock('../../src/sommelier/pairForDish.js', async (orig) => ({ ...(await orig()), pairForDish: vi.fn() }));
vi.mock('../../src/notifications/sommelierNote.js', async (orig) => ({ ...(await orig()), isNoteAvailable: vi.fn(() => true) }));
const { pairForDish } = await import('../../src/sommelier/pairForDish.js');
const { isNoteAvailable } = await import('../../src/notifications/sommelierNote.js');

describe.skipIf(!hasDb)('API passerelle MenuFlow', () => {
  let client;
  let wineA;
  let wineB;
  let puts;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    puts = [];
    vi.stubEnv('MENUFLOW_URL', 'http://menuflow.test');
    vi.stubEnv('MENUFLOW_TOKEN', 'mf_tok');
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === `/api/v1/dinners/by-date/${today}` && (init.method || 'GET') === 'GET') return Response.json({ id: 9, date: today, title: 'Poulet basquaise', verdicts: [] });
      if (init.method === 'PUT') { puts.push(JSON.parse(init.body)); return Response.json({}); }
      return new Response(null, { status: 204 });
    }));
    const add = async (name) => {
      const { rows } = await pool.query(`INSERT INTO wines (name, vintage, type) VALUES ($1, 2019, 'RED') RETURNING id`, [name]);
      await pool.query('INSERT INTO bottles (wine_id) VALUES ($1)', [rows[0].id]);
      return rows[0].id;
    };
    wineA = await add('Alpha');
    wineB = await add('Bravo');
    pairForDish.mockReset();
    isNoteAvailable.mockReturnValue(true);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(() => pool.end());

  it('non configuré : configured false', async () => {
    vi.stubEnv('MENUFLOW_URL', '');
    expect((await client.get('/api/menuflow/tonight')).body).toEqual({ configured: false });
    expect((await client.get('/api/menuflow/status')).body.configured).toBe(false);
  });

  it('tonight lit le dîner du jour ; resuggest exclut le vin précédent et pousse', async () => {
    const t = await client.get('/api/menuflow/tonight');
    expect(t.body).toMatchObject({ configured: true, dinner: { date: today, title: 'Poulet basquaise' }, suggested: null, opened: [] });

    pairForDish.mockResolvedValueOnce({ picks: { safe: { wine_id: wineA, reason: 'Fruit' }, personal: null, creative: null } });
    const first = await client.post('/api/menuflow/tonight/resuggest', {});
    expect(first.body.suggested).toMatchObject({ wineId: wineA, wine: 'Alpha', reason: 'Fruit' });

    pairForDish.mockResolvedValueOnce({ picks: { safe: { wine_id: wineB, reason: 'Autre' }, personal: null, creative: null } });
    const second = await client.post('/api/menuflow/tonight/resuggest', {});
    expect(pairForDish).toHaveBeenLastCalledWith(expect.objectContaining({ dish: 'Poulet basquaise', exclude: [wineA] }));
    expect(second.body.suggested.wine).toBe('Bravo');
    expect(puts.at(-1).suggested.wine).toBe('Bravo');
  });

  it('tonight?remote=0 ne contacte pas MenuFlow (confirmation d’ouverture instantanée)', async () => {
    const r = await client.get('/api/menuflow/tonight?remote=0');
    expect(r.body).toMatchObject({ configured: true, dinner: null });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('resuggest sans IA : 409', async () => {
    isNoteAvailable.mockReturnValue(false);
    expect((await client.post('/api/menuflow/tonight/resuggest', {})).status).toBe(409);
  });

  it('journal : forDinner enregistré', async () => {
    const r = await client.post('/api/history', { type: 'OUT', wineId: wineA, wineName: 'Alpha', quantity: 1, forDinner: false });
    expect(r.status).toBe(201);
    expect(r.body.forDinner).toBe(false);
  });

  it('authentification requise', async () => {
    expect((await api().get('/api/menuflow/tonight')).status).toBe(401);
  });
});
