import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { hasDb, pool, resetData } from './helpers.js';

vi.mock('../../src/sommelier/pairForDish.js', async (orig) => ({ ...(await orig()), pairForDish: vi.fn() }));
vi.mock('../../src/notifications/sommelierNote.js', async (orig) => ({ ...(await orig()), isNoteAvailable: () => true }));

const { pairForDish } = await import('../../src/sommelier/pairForDish.js');
const { syncMenuflow } = await import('../../src/menuflow/sync.js');

describe.skipIf(!hasDb)('synchronisation MenuFlow', () => {
  const NOW = new Date('2026-10-05T10:00:00Z');
  let calls;
  let wineA;
  let wineB;

  const menuflow = () => vi.fn(async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push({ method, path: u.pathname, body: init.body ? JSON.parse(init.body) : null });
    if (u.pathname === '/api/v1/weeks') return Response.json([{ start_date: '2026-10-05' }]);
    if (u.pathname === '/api/v1/weeks/2026-10-05') {
      return Response.json({ dinners: [
        { id: 1, date: '2026-10-05', title: 'Poulet basquaise', verdicts: [{ author: 'laure', rating: 'top' }] },
        { id: 2, date: '2026-10-06', title: 'Gratin de courge', verdicts: [] },
      ] });
    }
    if (method === 'PUT') return Response.json({});
    return new Response(null, { status: 204 });
  });
  const puts = () => calls.filter((c) => c.method === 'PUT');
  const addWine = async (name, bottles = 1) => {
    const { rows } = await pool.query(`INSERT INTO wines (name, vintage, type) VALUES ($1, 2019, 'RED') RETURNING id`, [name]);
    for (let i = 0; i < bottles; i++) await pool.query('INSERT INTO bottles (wine_id) VALUES ($1)', [rows[0].id]);
    return rows[0].id;
  };

  beforeEach(async () => {
    await resetData();
    calls = [];
    vi.stubEnv('MENUFLOW_URL', 'http://menuflow.test');
    vi.stubEnv('MENUFLOW_TOKEN', 'mf_tok');
    vi.stubGlobal('fetch', menuflow());
    wineA = await addWine('Alpha', 2);
    wineB = await addWine('Bravo', 1);
    pairForDish.mockReset();
    pairForDish.mockResolvedValue({ picks: { safe: { wine_id: wineA, reason: 'Fruit' }, personal: null, creative: null } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(() => pool.end());

  it('lit, conseille, pousse ; second passage sans envoi ni appel IA', async () => {
    const r = await syncMenuflow({ now: NOW });
    expect(r).toMatchObject({ dinners: 2, suggested: 2, pushed: 2 });
    expect(puts().map((c) => c.path)).toEqual(['/api/v1/dinners/by-date/2026-10-05/wine', '/api/v1/dinners/by-date/2026-10-06/wine']);
    expect(puts()[0].body.suggested).toMatchObject({ wine: 'Alpha', vintage: 2019, reason: 'Fruit' });
    expect(calls[0].path).toBe('/api/v1/weeks');

    calls = [];
    await syncMenuflow({ now: NOW });
    expect(puts()).toEqual([]);
    expect(pairForDish).toHaveBeenCalledTimes(2);
  });

  it('bouteille ouverte le soir du dîner : envoyée ; décochée : ignorée', async () => {
    await syncMenuflow({ now: NOW });
    await pool.query(`INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity) VALUES ('2026-10-05 17:30', 'OUT', $1, 'Bravo', 2019, 1)`, [wineB]);
    await pool.query(`INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, for_dinner) VALUES ('2026-10-06 17:30', 'OUT', $1, 'Alpha', 2019, 1, false)`, [wineA]);
    calls = [];
    await syncMenuflow({ now: NOW });
    expect(puts().map((c) => c.path)).toEqual(['/api/v1/dinners/by-date/2026-10-05/wine']);
    expect(puts()[0].body.opened).toEqual([{ wine: 'Bravo', vintage: 2019, reason: null, location: null, url: expect.stringContaining(`/wine/${wineB}`) }]);
  });

  it('vin conseillé épuisé : nouveau conseil', async () => {
    await syncMenuflow({ now: NOW });
    await pool.query('UPDATE bottles SET is_consumed = true WHERE wine_id = $1', [wineA]);
    pairForDish.mockResolvedValue({ picks: { safe: { wine_id: wineB, reason: 'Autre' }, personal: null, creative: null } });
    calls = [];
    await syncMenuflow({ now: NOW });
    expect(puts().map((c) => c.body.suggested.wine)).toEqual(['Bravo', 'Bravo']);
  });

  it('erreur IA sur un dîner : les autres jours sont quand même poussés', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pairForDish.mockRejectedValueOnce(new Error('surcharge 529'));
    const r = await syncMenuflow({ now: NOW });
    expect(puts().map((c) => c.path)).toEqual(['/api/v1/dinners/by-date/2026-10-06/wine']);
    expect(r.errors).toBe(1);
  });

  it('dîner retiré de MenuFlow : ligne supprimée et vin effacé', async () => {
    await syncMenuflow({ now: NOW });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      if (new URL(url).pathname === '/api/v1/weeks/2026-10-05') {
        calls.push({ method: 'GET', path: '/api/v1/weeks/2026-10-05', body: null });
        return Response.json({ dinners: [{ id: 1, date: '2026-10-05', title: 'Poulet basquaise', verdicts: [] }] });
      }
      return original(url, init);
    }));
    calls = [];
    await syncMenuflow({ now: NOW });
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/api/v1/dinners/by-date/2026-10-06/wine']);
    const { rows } = await pool.query("SELECT to_char(dinner_date, 'YYYY-MM-DD') AS d FROM dinner_pairings ORDER BY 1");
    expect(rows.map((r) => r.d)).toEqual(['2026-10-05']);
  });

  it('aucun vin possible : pas de nouvel appel IA au tick suivant', async () => {
    pairForDish.mockResolvedValue({ picks: { safe: null, personal: null, creative: null } });
    await syncMenuflow({ now: NOW });
    expect(pairForDish).toHaveBeenCalledTimes(2);
    await syncMenuflow({ now: NOW });
    expect(pairForDish).toHaveBeenCalledTimes(2);
  });

  it('MenuFlow injoignable : erreur consignée, pas d’exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await syncMenuflow({ now: NOW })).error).toContain('MenuFlow injoignable');
  });
});
