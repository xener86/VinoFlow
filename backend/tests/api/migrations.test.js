import { describe, it, expect, afterAll } from 'vitest';
import { hasDb, pool } from './helpers.js';
import { runMigrations } from '../../src/migrations.js';

describe.skipIf(!hasDb)('runner de migrations', () => {
  afterAll(() => pool.end());

  it('la base de test a été construite par le runner (globalSetup)', async () => {
    const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(rows.map((r) => r.filename)).toEqual(expect.arrayContaining(['001_sommelier_v2.sql', '003_peak_window.sql', '004_auth_tokens.sql']));
  });

  it('relancé, il n’applique rien', async () => {
    const report = await runMigrations(pool, { log: () => {} });
    expect(report).toMatchObject({ baseline: false, detected: [], applied: [] });
  });
});
