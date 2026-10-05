import { describe, it, expect, afterAll } from 'vitest';
import { hasDb, pool } from './helpers.js';
import { runMigrations } from '../../src/migrations.js';

describe.skipIf(!hasDb)('runner de migrations', () => {
  afterAll(() => pool.end());

  it('la base de test a été construite par le runner (globalSetup)', async () => {
    const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(rows.map((r) => r.filename)).toEqual(expect.arrayContaining(['001_sommelier_v2.sql', '003_peak_window.sql', '004_auth_tokens.sql']));
  });

  it('009 : tables de notifications créées', async () => {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('notification_settings','wine_alert_state','notification_log')
      ORDER BY table_name`);
    expect(rows.map((r) => r.table_name)).toEqual(['notification_log', 'notification_settings', 'wine_alert_state']);
  });

  it('relancé, il n’applique rien', async () => {
    const report = await runMigrations(pool, { log: () => {} });
    expect(report).toMatchObject({ baseline: false, detected: [], applied: [] });
  });
});
