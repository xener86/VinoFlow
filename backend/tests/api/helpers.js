import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db.js';
import { resetRateLimits } from '../../src/middleware/rateLimits.js';

export const hasDb = Boolean(process.env.TEST_DATABASE_URL);
export const api = () => request(app);
export { pool };

export const PASSWORD = 'motdepasse-solide';

export const resetData = async () => {
  resetRateLimits();
  await pool.query(`TRUNCATE users, wines, bottles, racks, spirits,
  tasting_notes, journal, wishlist, pairing_feedback, pairing_cache, taste_profile,
  refresh_tokens, password_reset_tokens, cocktails, dinner_pairings, shares, share_items CASCADE`);
};

// Base vide → le premier signup est autorisé (bootstrap) et renvoie une session.
export const bootstrapUser = async (email = 'admin@test.fr') => {
  const res = await api().post('/api/auth/signup').send({ email, password: PASSWORD });
  if (res.status !== 201) throw new Error(`signup ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

export const authed = (token) => ({
  get: (url) => api().get(url).set('Authorization', `Bearer ${token}`),
  post: (url, body) => api().post(url).set('Authorization', `Bearer ${token}`).send(body),
  put: (url, body) => api().put(url).set('Authorization', `Bearer ${token}`).send(body),
  delete: (url) => api().delete(url).set('Authorization', `Bearer ${token}`),
});
