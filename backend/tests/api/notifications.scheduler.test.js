import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';
vi.mock('../../src/notifications/sommelierNote.js', async (orig) => ({ ...(await orig()), generateSommelierNote: vi.fn(async () => null) }));
const { generateSommelierNote } = await import('../../src/notifications/sommelierNote.js');
const { runNotificationTick } = await import('../../src/notifications/scheduler.js');

describe.skipIf(!hasDb)('planificateur de notifications', () => {
  const NOW = new Date('2026-10-05T10:00:00Z');
  let client;
  let userId;
  let fetchMock;

  const gotifyCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('http://gotify.test'));
  const addWine = async (name, peakStart, peakEnd) => {
    const { rows } = await pool.query(
      `INSERT INTO wines (name, vintage, type, peak_start, peak_end) VALUES ($1, 2015, 'RED', $2, $3) RETURNING id`,
      [name, peakStart, peakEnd]
    );
    await pool.query('INSERT INTO bottles (wine_id) VALUES ($1)', [rows[0].id]);
    return rows[0].id;
  };
  const stateOf = async (wineId) =>
    (await pool.query('SELECT state FROM wine_alert_state WHERE user_id = $1 AND wine_id = $2', [userId, wineId])).rows[0]?.state;

  beforeEach(async () => {
    await resetData();
    const session = await bootstrapUser();
    client = authed(session.access_token);
    userId = session.user.id;
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await client.put('/api/notifications/settings', {
      gotifyEnabled: true, gotifyUrl: 'http://gotify.test', gotifyToken: 'tok', newsletterFrequency: 'off',
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => pool.end());

  it('premier passage silencieux, puis une seule alerte par transition', async () => {
    const id = await addWine('Alpha', 2020, 2030); // PRET
    await runNotificationTick({ now: NOW });
    expect(gotifyCalls()).toHaveLength(0);
    expect(await stateOf(id)).toBe('PRET');

    await pool.query('UPDATE wines SET peak_end = 2026 WHERE id = $1', [id]); // → SE_REFERME
    await runNotificationTick({ now: NOW });
    expect(gotifyCalls()).toHaveLength(1);
    expect(JSON.parse(gotifyCalls()[0][1].body).title).toBe('1 vin change d’état');
    expect(await stateOf(id)).toBe('SE_REFERME');

    await runNotificationTick({ now: NOW });
    expect(gotifyCalls()).toHaveLength(1); // aucun doublon
  });

  it('échec Gotify : état non écrit, nouvel essai au tick suivant', async () => {
    await runNotificationTick({ now: NOW }); // amorçage (cave vide)
    const id = await addWine('Bravo', 2010, 2015); // nouveau vin DEPASSEE
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await runNotificationTick({ now: NOW });
    expect(await stateOf(id)).toBeUndefined();
    const log = await client.get('/api/notifications/settings');
    expect(log.body.recent[0]).toMatchObject({ kind: 'alert', channel: 'gotify', ok: false, error: 'Gotify a répondu 500' });

    await runNotificationTick({ now: NOW });
    expect(await stateOf(id)).toBe('DEPASSEE');
    expect(gotifyCalls()).toHaveLength(2);
  });

  it('newsletter mensuelle : envoyée une fois à l’échéance', async () => {
    await client.put('/api/notifications/settings', { newsletterFrequency: 'monthly', newsletterAi: false });
    await pool.query("UPDATE notification_settings SET last_newsletter_at = '2026-09-01T07:00:00Z', alerts_seeded_at = now() WHERE user_id = $1", [userId]);
    await addWine('Charlie', 2010, 2020);

    await runNotificationTick({ now: NOW });
    const newsletters = () => gotifyCalls().filter(([, init]) => JSON.parse(init.body).title.startsWith('Votre cave'));
    expect(newsletters()).toHaveLength(1);
    expect(JSON.parse(newsletters()[0][1].body).title).toBe('Votre cave — octobre 2026');

    await runNotificationTick({ now: NOW });
    expect(newsletters()).toHaveLength(1);
  });

  it('newsletter en échec : pas de nouvel appel IA à chaque réessai', async () => {
    await client.put('/api/notifications/settings', { newsletterFrequency: 'monthly', newsletterAi: true });
    await pool.query("UPDATE notification_settings SET last_newsletter_at = '2026-09-01T07:00:00Z', alerts_seeded_at = now() WHERE user_id = $1", [userId]);
    fetchMock.mockImplementation(async () => new Response('', { status: 500 }));
    generateSommelierNote.mockClear();
    await runNotificationTick({ now: NOW });
    expect(generateSommelierNote).toHaveBeenCalledTimes(1);
    await runNotificationTick({ now: new Date(NOW.getTime() + 3_600_000) });
    expect(generateSommelierNote).toHaveBeenCalledTimes(1);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM notification_log WHERE kind = 'newsletter' AND ok = false");
    expect(rows[0].n).toBe(2); // le réessai a bien eu lieu, sans IA
  });
});
