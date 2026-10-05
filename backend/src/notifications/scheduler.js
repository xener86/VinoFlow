// Planificateur des notifications : toutes les NOTIFY_TICK_MINUTES (défaut 60),
// sous verrou consultatif Postgres (un seul backend à la fois), pour chaque
// compte ayant des réglages : alertes de changement d'état, puis newsletter
// si elle est due. Un état ou une newsletter n'est marqué envoyé qu'après au
// moins un envoi réussi : en cas de panne, on réessaie au tick suivant.
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { detectTransitions } from './classify.js';
import { isNewsletterDue, notifyTz } from './schedule.js';
import { availableChannels, deliver } from './channels.js';
import { renderAlert, renderNewsletter } from './render.js';
import { composeNewsletter } from './newsletter.js';
import {
  listAllSettings, loadAlertStates, applyAlertChanges, markNewsletterSent, logDeliveries, purgeOldLog,
} from './store.js';

const LOCK_KEY = 74_206_003;
let running = false;
let timer = null;

const processAlerts = async (settings, inventory, { now, tz }) => {
  const stored = await loadAlertStates(settings.userId);
  const { notify, upserts, deletes } = detectTransitions({ stored, wines: inventory, settings, now, tz });
  const seeded = !settings.alertsSeededAt;
  const channels = availableChannels(settings);
  if (notify.length > 0 && channels.length > 0) {
    const message = renderAlert(notify, { appUrl: APP_URL });
    const results = await deliver(channels, { settings, email: settings.email, message });
    await logDeliveries(settings.userId, 'alert', results, message.title);
    if (!results.some((r) => r.ok)) return; // on réessaiera au prochain tick
  }
  if (upserts.length > 0 || deletes.length > 0 || seeded) {
    await applyAlertChanges(settings.userId, { upserts, deletes, seeded });
  }
};

const processNewsletter = async (settings, { now, tz }) => {
  const channels = availableChannels(settings);
  if (channels.length === 0) return;
  const nl = await composeNewsletter(settings, { now, tz, withAi: settings.newsletterAi });
  const message = renderNewsletter(nl);
  const results = await deliver(channels, { settings, email: settings.email, message });
  await logDeliveries(settings.userId, 'newsletter', results, message.title);
  if (results.some((r) => r.ok)) await markNewsletterSent(settings.userId, now);
};

export const runNotificationTick = async ({ now = new Date(), tz = notifyTz() } = {}) => {
  if (running) return { skipped: true };
  running = true;
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!rows[0].ok) return { skipped: true };
    try {
      const all = await listAllSettings();
      if (all.length === 0) return { users: 0 };
      const inventory = await loadInventory();
      for (const settings of all) {
        try {
          await processAlerts(settings, inventory, { now, tz });
        } catch (error) {
          console.error(`[notifications] alertes de ${settings.email} :`, error.message);
        }
        try {
          if (isNewsletterDue(settings, now, tz)) await processNewsletter(settings, { now, tz });
        } catch (error) {
          console.error(`[notifications] newsletter de ${settings.email} :`, error.message);
        }
      }
      await purgeOldLog();
      return { users: all.length };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
    running = false;
  }
};

export const startNotificationScheduler = () => {
  if (process.env.NOTIFICATIONS_ENABLED === 'false' || timer) return;
  const minutes = Number(process.env.NOTIFY_TICK_MINUTES || 60);
  const tick = () => runNotificationTick().catch((error) => console.error('[notifications] tick :', error.message));
  setTimeout(tick, 60_000).unref?.();
  timer = setInterval(tick, minutes * 60_000);
  timer.unref?.();
  console.log(`🔔 Notifications : vérification toutes les ${minutes} min (fuseau ${notifyTz()})`);
};
