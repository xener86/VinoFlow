import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendGotify, availableChannels, deliver } from '../../src/notifications/channels.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
const message = { title: 'T', markdown: '**m**', priority: 5, subject: 'S', text: 't', html: '<p>h</p>' };
const gotifySettings = { gotifyEnabled: true, gotifyUrl: 'https://h/gotify/', gotifyToken: 'tok', emailEnabled: false };

describe('sendGotify', () => {
  it('POST {url}/message avec le jeton et le markdown (sous-chemin et barre finale)', async () => {
    const fetch = ok();
    vi.stubGlobal('fetch', fetch);
    await sendGotify({ url: 'https://h/gotify/', token: 'tok', title: 'T', markdown: '**m**', priority: 5 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://h/gotify/message');
    expect(init.headers['X-Gotify-Key']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({
      title: 'T', message: '**m**', priority: 5,
      extras: { 'client::display': { contentType: 'text/markdown' } },
    });
  });
  it('jeton refusé → message lisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(sendGotify({ url: 'https://h', token: 'x', title: 'T', markdown: 'm' })).rejects.toThrow('jeton Gotify refusé (401)');
  });
  it('serveur injoignable → message lisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(sendGotify({ url: 'https://h', token: 'x', title: 'T', markdown: 'm' })).rejects.toThrow('serveur Gotify injoignable');
  });
});

describe('availableChannels', () => {
  it('Gotify seulement si URL et jeton ; email seulement si Sweego configuré', () => {
    expect(availableChannels(gotifySettings)).toEqual(['gotify']);
    expect(availableChannels({ ...gotifySettings, gotifyToken: null })).toEqual([]);
    expect(availableChannels({ emailEnabled: true })).toEqual([]);
    vi.stubEnv('SWEEGO_API_KEY', 'k');
    vi.stubEnv('MAIL_FROM', 'cave@example.com');
    expect(availableChannels({ emailEnabled: true })).toEqual(['email']);
  });
});

describe('deliver', () => {
  it('résultat par canal ; email sans Sweego = échec explicite, jamais un faux succès', async () => {
    vi.stubGlobal('fetch', ok());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const results = await deliver(['gotify', 'email'], { settings: gotifySettings, email: 'a@b.fr', message });
    expect(results).toEqual([
      { channel: 'gotify', ok: true },
      { channel: 'email', ok: false, error: "envoi d'email non configuré sur le serveur" },
    ]);
  });
});
