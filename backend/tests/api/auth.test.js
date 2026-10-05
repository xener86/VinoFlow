import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { api, authed, bootstrapUser, hasDb, pool, resetData, PASSWORD } from './helpers.js';

describe.skipIf(!hasDb)('API auth', () => {
  beforeEach(resetData);
  afterAll(() => pool.end());

  it('config publique : bootstrap tant qu’aucun compte n’existe', async () => {
    let res = await api().get('/api/auth/config');
    expect(res.body).toEqual({ signupEnabled: true, bootstrap: true, passwordMinLength: 10 });
    await bootstrapUser();
    res = await api().get('/api/auth/config');
    expect(res.body).toMatchObject({ signupEnabled: false, bootstrap: false });
  });

  it('signup : premier compte accepté, suivants refusés (ALLOW_SIGNUP=false)', async () => {
    const session = await bootstrapUser();
    expect(session).toMatchObject({ user: { email: 'admin@test.fr' }, expires_in: 900 });
    expect(session.refresh_token).toEqual(expect.any(String));
    const res = await api().post('/api/auth/signup').send({ email: 'b@test.fr', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('signup : validation email et longueur du mot de passe', async () => {
    expect((await api().post('/api/auth/signup').send({ email: 'pas-un-email', password: PASSWORD })).status).toBe(400);
    const res = await api().post('/api/auth/signup').send({ email: 'a@test.fr', password: 'court' });
    expect(res.status).toBe(400);
    expect(res.body.msg).toMatch(/10 caractères/);
  });

  it('login : identifiants valides / invalides / email inconnu', async () => {
    await bootstrapUser();
    const ok = await api().post('/api/auth/login').send({ email: 'ADMIN@test.fr', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.access_token).toEqual(expect.any(String));
    expect((await api().post('/api/auth/login').send({ email: 'admin@test.fr', password: 'mauvais-mdp-xx' })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email: 'inconnu@test.fr', password: PASSWORD })).status).toBe(401);
  });

  it('routes protégées : 401 sans jeton, avec un jeton invalide ou un ancien JWT sans typ', async () => {
    const { user } = await bootstrapUser();
    expect((await api().get('/api/wines')).status).toBe(401);
    expect((await authed('n.importe.quoi').get('/api/wines')).status).toBe(401);
    const legacy = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    expect((await authed(legacy).get('/api/wines')).status).toBe(401);
  });

  it('refresh : rotation, ancien jeton refusé, réutilisation tardive → session révoquée', async () => {
    const s1 = await bootstrapUser();
    const r1 = await api().post('/api/auth/refresh').send({ refresh_token: s1.refresh_token });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(s1.refresh_token);
    expect((await authed(r1.body.access_token).get('/api/wines')).status).toBe(200);

    // Rejeu immédiat (fenêtre de grâce multi-onglets) : refusé, la session continue.
    expect((await api().post('/api/auth/refresh').send({ refresh_token: s1.refresh_token })).status).toBe(401);
    const r2 = await api().post('/api/auth/refresh').send({ refresh_token: r1.body.refresh_token });
    expect(r2.status).toBe(200);

    // Rejeu hors fenêtre de grâce : toute la famille est révoquée.
    await pool.query("UPDATE refresh_tokens SET revoked_at = now() - interval '5 minutes' WHERE revoked_at IS NOT NULL");
    expect((await api().post('/api/auth/refresh').send({ refresh_token: s1.refresh_token })).status).toBe(401);
    expect((await api().post('/api/auth/refresh').send({ refresh_token: r2.body.refresh_token })).status).toBe(401);
  });

  it('logout révoque la session', async () => {
    const s = await bootstrapUser();
    expect((await api().post('/api/auth/logout').send({ refresh_token: s.refresh_token })).status).toBe(200);
    expect((await api().post('/api/auth/refresh').send({ refresh_token: s.refresh_token })).status).toBe(401);
  });

  it('changement de mot de passe : vérifie l’actuel, révoque les autres sessions', async () => {
    const s = await bootstrapUser();
    const other = (await api().post('/api/auth/login').send({ email: 'admin@test.fr', password: PASSWORD })).body;
    const client = authed(s.access_token);
    expect((await client.post('/api/auth/password', { currentPassword: 'faux-faux-faux', newPassword: 'nouveau-mdp-123' })).status).toBe(400);
    const ok = await client.post('/api/auth/password', { currentPassword: PASSWORD, newPassword: 'nouveau-mdp-123' });
    expect(ok.status).toBe(200);
    expect((await api().post('/api/auth/refresh').send({ refresh_token: other.refresh_token })).status).toBe(401);
    expect((await api().post('/api/auth/refresh').send({ refresh_token: ok.body.refresh_token })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: 'admin@test.fr', password: 'nouveau-mdp-123' })).status).toBe(200);
  });

  it('mot de passe oublié → reset : réponse identique, jeton à usage unique, sessions révoquées', async () => {
    const s = await bootstrapUser();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const unknown = await api().post('/api/auth/forgot').send({ email: 'inconnu@test.fr' });
    const known = await api().post('/api/auth/forgot').send({ email: 'admin@test.fr' });
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    // Sans SWEEGO_API_KEY, le lien est écrit dans les logs (envoi après la réponse).
    const link = await vi.waitFor(() => {
      const line = log.mock.calls.flat().find((m) => String(m).includes('reset-password#token='));
      if (!line) throw new Error('lien pas encore loggé');
      return String(line);
    });
    log.mockRestore();
    const token = link.match(/token=([\w-]+)/)[1];

    expect((await api().post('/api/auth/reset').send({ token, password: 'court' })).status).toBe(400);
    expect((await api().post('/api/auth/reset').send({ token, password: 'apres-reset-123' })).status).toBe(200);
    expect((await api().post('/api/auth/reset').send({ token, password: 'encore-un-autre' })).status).toBe(400);
    expect((await api().post('/api/auth/refresh').send({ refresh_token: s.refresh_token })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email: 'admin@test.fr', password: 'apres-reset-123' })).status).toBe(200);
  });
});
