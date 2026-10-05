import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('rate limiting', () => {
  beforeEach(resetData);
  afterAll(() => pool.end());

  it('/api/auth : 429 après 20 tentatives, même avec un X-Forwarded-For usurpé', async () => {
    await bootstrapUser(); // depuis 127.0.0.1 : compteur distinct
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      // Comme nginx ($proxy_add_x_forwarded_for) : la valeur envoyée par le client,
      // puis la vraie IP ajoutée par le proxy de confiance (TRUST_PROXY=1).
      const res = await api().post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`)
        .send({ email: 'admin@test.fr', password: 'mauvais-mdp-xx' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it('le refresh n’est pas soumis au limiteur strict', async () => {
    await bootstrapUser();
    for (let i = 0; i < 20; i++) await api().post('/api/auth/login').send({ email: 'x@test.fr', password: 'mauvais-mdp-xx' });
    expect((await api().post('/api/auth/refresh').send({ refresh_token: 'inconnu' })).status).toBe(401);
  });
});
