// Accès base des notifications : réglages par compte, état des alertes, journal d'envois.
import { pool, withTransaction } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

export const DEFAULT_SETTINGS = {
  emailEnabled: false,
  gotifyEnabled: false,
  gotifyUrl: null,
  gotifyToken: null,
  alertsEnabled: true,
  alertReady: true,
  alertClosing: true,
  alertPast: true,
  horizonMonths: 12,
  newsletterFrequency: 'monthly',
  newsletterWeekday: 1,
  newsletterHour: 9,
  newsletterAi: true,
  lastNewsletterAt: null,
  alertsSeededAt: null,
};

const COLUMNS = {
  emailEnabled: 'email_enabled',
  gotifyEnabled: 'gotify_enabled',
  gotifyUrl: 'gotify_url',
  gotifyToken: 'gotify_token',
  alertsEnabled: 'alerts_enabled',
  alertReady: 'alert_ready',
  alertClosing: 'alert_closing',
  alertPast: 'alert_past',
  horizonMonths: 'horizon_months',
  newsletterFrequency: 'newsletter_frequency',
  newsletterWeekday: 'newsletter_weekday',
  newsletterHour: 'newsletter_hour',
  newsletterAi: 'newsletter_ai',
};

const BOOLEANS = ['emailEnabled', 'gotifyEnabled', 'alertsEnabled', 'alertReady', 'alertClosing', 'alertPast', 'newsletterAi'];
const INTEGERS = { horizonMonths: [1, 60], newsletterWeekday: [1, 7], newsletterHour: [0, 23] };
const FREQUENCIES = ['off', 'weekly', 'monthly'];

export const validateSettingsPatch = (body = {}) => {
  const patch = {};
  const errors = [];
  for (const k of BOOLEANS) {
    if (!(k in body)) continue;
    if (typeof body[k] === 'boolean') patch[k] = body[k];
    else errors.push(`${k} doit être un booléen`);
  }
  for (const [k, [min, max]] of Object.entries(INTEGERS)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (Number.isInteger(v) && v >= min && v <= max) patch[k] = v;
    else errors.push(`${k} doit être un entier entre ${min} et ${max}`);
  }
  if ('newsletterFrequency' in body) {
    if (FREQUENCIES.includes(body.newsletterFrequency)) patch.newsletterFrequency = body.newsletterFrequency;
    else errors.push('newsletterFrequency doit valoir off, weekly ou monthly');
  }
  if ('gotifyUrl' in body) {
    const v = body.gotifyUrl;
    if (v === null || v === '') patch.gotifyUrl = null;
    else {
      let valid = false;
      try { valid = typeof v === 'string' && ['http:', 'https:'].includes(new URL(v.trim()).protocol); } catch { valid = false; }
      if (valid) patch.gotifyUrl = v.trim().replace(/\/+$/, '');
      else errors.push('gotifyUrl doit être une URL http(s)');
    }
  }
  if ('gotifyToken' in body) {
    const v = body.gotifyToken;
    if (v === null) patch.gotifyToken = null;
    else if (typeof v !== 'string') errors.push('gotifyToken doit être une chaîne');
    else if (v.trim() !== '') patch.gotifyToken = v.trim();
  }
  return { patch, errors };
};

export const publicSettings = (settings) => {
  const { gotifyToken, userId, alertsSeededAt, updatedAt, email, ...rest } = settings;
  return { ...rest, gotifyTokenSet: Boolean(gotifyToken) };
};

export const getSettings = async (userId) => {
  const { rows } = await pool.query('SELECT * FROM notification_settings WHERE user_id = $1', [userId]);
  return rows[0] ? convertKeysToCamelCase(rows[0]) : { userId, ...DEFAULT_SETTINGS };
};

export const saveSettings = async (userId, patch) => {
  const keys = Object.keys(patch).filter((k) => COLUMNS[k]);
  const cols = keys.map((k) => COLUMNS[k]);
  const params = [userId, ...keys.map((k) => patch[k])];
  const colList = ['user_id', 'last_newsletter_at', ...cols].join(', ');
  const valList = ['$1', 'now()', ...cols.map((_, i) => `$${i + 2}`)].join(', ');
  const updates = [...cols.map((c, i) => `${c} = $${i + 2}`), 'updated_at = now()'].join(', ');
  await pool.query(
    `INSERT INTO notification_settings (${colList}) VALUES (${valList})
     ON CONFLICT (user_id) DO UPDATE SET ${updates}`,
    params
  );
  return getSettings(userId);
};

export const listAllSettings = async () => {
  const { rows } = await pool.query(
    'SELECT s.*, u.email FROM notification_settings s JOIN users u ON u.id = s.user_id'
  );
  return convertKeysToCamelCase(rows);
};

export const loadAlertStates = async (userId) => {
  const { rows } = await pool.query('SELECT wine_id, state FROM wine_alert_state WHERE user_id = $1', [userId]);
  return new Map(rows.map((r) => [r.wine_id, r.state]));
};

export const applyAlertChanges = (userId, { upserts, deletes, seeded }) =>
  withTransaction(async (db) => {
    for (const { wineId, state } of upserts) {
      await db.query(
        `INSERT INTO wine_alert_state (user_id, wine_id, state) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, wine_id) DO UPDATE SET state = EXCLUDED.state, notified_at = now()`,
        [userId, wineId, state]
      );
    }
    if (deletes.length > 0) {
      await db.query('DELETE FROM wine_alert_state WHERE user_id = $1 AND wine_id = ANY($2::uuid[])', [userId, deletes]);
    }
    if (seeded) await db.query('UPDATE notification_settings SET alerts_seeded_at = now() WHERE user_id = $1', [userId]);
  });

export const markNewsletterSent = (userId, at) =>
  pool.query('UPDATE notification_settings SET last_newsletter_at = $2 WHERE user_id = $1', [userId, at]);

export const logDeliveries = async (userId, kind, results, summary) => {
  for (const r of results) {
    await pool.query(
      'INSERT INTO notification_log (user_id, kind, channel, ok, error, summary) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, kind, r.channel, r.ok, r.error || null, summary ? String(summary).slice(0, 200) : null]
    );
  }
};

export const recentLog = async (userId, limit = 5) => {
  const { rows } = await pool.query(
    `SELECT kind, channel, ok, error, summary, sent_at FROM notification_log
     WHERE user_id = $1 ORDER BY sent_at DESC, id DESC LIMIT $2`,
    [userId, limit]
  );
  return convertKeysToCamelCase(rows);
};

export const purgeOldLog = () => pool.query("DELETE FROM notification_log WHERE sent_at < now() - interval '180 days'");

/** Un envoi de newsletter a-t-il échoué récemment ? (réessai sans régénérer le mot du sommelier) */
export const hasRecentFailedNewsletter = async (userId, hours = 23) => {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM notification_log WHERE user_id = $1 AND kind = 'newsletter' AND ok = false
     AND sent_at > now() - make_interval(hours => $2) LIMIT 1`,
    [userId, hours]
  );
  return rowCount > 0;
};
