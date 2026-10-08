import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('API notifications', () => {
  let client;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => pool.end());

  it('authentification requise', async () => {
    expect((await api().get('/api/notifications/settings')).status).toBe(401);
  });

  it('valeurs par défaut sans ligne en base', async () => {
    const res = await client.get('/api/notifications/settings');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'admin@test.fr', emailEnabled: false, gotifyEnabled: false, gotifyTokenSet: false,
      newsletterFrequency: 'monthly', newsletterHour: 9, horizonMonths: 12,
      mailConfigured: false, aiConfigured: false, recent: [],
    });
  });

  it('enregistre, masque le jeton, le conserve si non retapé, l’efface avec null', async () => {
    const saved = await client.put('/api/notifications/settings', { gotifyEnabled: true, gotifyUrl: 'https://push.test/', gotifyToken: 'secret' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ gotifyEnabled: true, gotifyUrl: 'https://push.test', gotifyTokenSet: true });
    expect(JSON.stringify(saved.body)).not.toContain('secret');

    const kept = await client.put('/api/notifications/settings', { horizonMonths: 6, gotifyToken: '' });
    expect(kept.body).toMatchObject({ horizonMonths: 6, gotifyTokenSet: true });

    const cleared = await client.put('/api/notifications/settings', { gotifyToken: null });
    expect(cleared.body.gotifyTokenSet).toBe(false);
  });

  it('400 sur valeur invalide, rien n’est enregistré', async () => {
    const res = await client.put('/api/notifications/settings', { newsletterHour: 25, horizonMonths: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('newsletterHour');
    expect((await client.get('/api/notifications/settings')).body.horizonMonths).toBe(12);
  });

  it('test Gotify : envoi et journal', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await client.put('/api/notifications/settings', { gotifyUrl: 'http://gotify.test', gotifyToken: 'tok' });
    const res = await client.post('/api/notifications/test', { channel: 'gotify' });
    expect(res.body).toEqual({ channel: 'gotify', ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe('http://gotify.test/message');
    expect((await client.get('/api/notifications/settings')).body.recent[0]).toMatchObject({ kind: 'test', channel: 'gotify', ok: true });
  });

  it('test email sans Sweego : échec explicite', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await client.post('/api/notifications/test', { channel: 'email' });
    expect(res.body).toEqual({ channel: 'email', ok: false, error: "envoi d'email non configuré sur le serveur" });
  });

  it('test : 400 si canal inconnu ou Gotify incomplet', async () => {
    expect((await client.post('/api/notifications/test', { channel: 'sms' })).status).toBe(400);
    expect((await client.post('/api/notifications/test', { channel: 'gotify' })).status).toBe(400);
  });

  it('aperçu de la newsletter sans IA', async () => {
    const res = await client.get('/api/notifications/newsletter/preview');
    expect(res.status).toBe(200);
    expect(res.body.subject).toMatch(/^VinoFlow — votre cave, /);
    expect(res.body.html).toContain('<!doctype html>');
    expect(res.body.markdown).toContain('**Bilan**');
  });

  it('envoyer maintenant : 400 sans canal, sinon envoi sans toucher à la date', async () => {
    expect((await client.post('/api/notifications/newsletter/send-now', {})).status).toBe(400);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await client.put('/api/notifications/settings', { gotifyEnabled: true, gotifyUrl: 'http://gotify.test', gotifyToken: 'tok', newsletterAi: false });
    const before = (await pool.query('SELECT last_newsletter_at FROM notification_settings')).rows[0].last_newsletter_at;
    const res = await client.post('/api/notifications/newsletter/send-now', {});
    expect(res.body.results).toEqual([{ channel: 'gotify', ok: true }]);
    const after = (await pool.query('SELECT last_newsletter_at FROM notification_settings')).rows[0].last_newsletter_at;
    expect(after).toEqual(before);
  });

  it('limiteur : 11e test refusé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await client.put('/api/notifications/settings', { gotifyUrl: 'http://gotify.test', gotifyToken: 'tok' });
    for (let i = 0; i < 10; i++) await client.post('/api/notifications/test', { channel: 'gotify' });
    expect((await client.post('/api/notifications/test', { channel: 'gotify' })).status).toBe(429);
  });
});
