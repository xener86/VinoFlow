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

  it('010 : dinner_pairings et journal.for_dinner', async () => {
    const t = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'dinner_pairings'");
    expect(t.rowCount).toBe(1);
    const c = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'journal' AND column_name = 'for_dinner'");
    expect(c.rows[0]?.data_type).toBe('boolean');
  });

  it('011 : wine_valuations et colonnes de suivi des cotes', async () => {
    const t = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'wine_valuations'");
    expect(t.rowCount).toBe(1);
    const { rows } = await pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'wines' AND column_name IN ('valuation_next_check_at', 'valuation_status') ORDER BY 1`);
    expect(rows.map((r) => r.column_name)).toEqual(['valuation_next_check_at', 'valuation_status']);
  });

  it('014 : shares et share_items, cascade depuis wines', async () => {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('shares', 'share_items') ORDER BY table_name`);
    expect(rows.map((r) => r.table_name)).toEqual(['share_items', 'shares']);
    const fk = await pool.query(`SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'shares'::regclass AND contype = 'f'`);
    expect(fk.rows.map((r) => r.confdeltype)).toEqual(['c']);
    const idx = await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'shares_active_wine_idx'");
    expect(idx.rows[0]?.indexdef).toMatch(/UNIQUE/);
  });

  it('relancé, il n’applique rien', async () => {
    const report = await runMigrations(pool, { log: () => {} });
    expect(report).toMatchObject({ baseline: false, detected: [], applied: [] });
  });
});
