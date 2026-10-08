// File et surveillance trimestrielle des cotes : une cote à la fois, demandes
// manuelles en tête (hors plafond), au plus VALUATION_DAILY_LIMIT vins planifiés
// par jour, verrou consultatif Postgres contre les doubles planifications.
import { pool } from '../db.js';
import { availableEngine } from '../enrichment/engines.js';
import { valueWine } from './service.js';

const LOCK_KEY = 74_206_004;
const tickMinutes = () => Number(process.env.VALUATION_TICK_MINUTES || 60);
const dailyLimit = () => Number(process.env.VALUATION_DAILY_LIMIT ?? 15);

let valuer = (wineId) => valueWine(wineId);
const state = { queue: [], running: null, timer: null, day: null, processedToday: 0 };

const today = () => new Date().toISOString().slice(0, 10);
const resetDayIfNeeded = () => {
  if (state.day !== today()) {
    state.day = today();
    state.processedToday = 0;
  }
};

export const requestValuation = (wineId, trigger = 'manual') => {
  if (state.running?.wineId !== wineId && !state.queue.some((j) => j.wineId === wineId)) {
    const job = { wineId, trigger };
    if (trigger === 'manual') state.queue.splice(state.queue.filter((j) => j.trigger === 'manual').length, 0, job);
    else state.queue.push(job);
  }
  setImmediate(work);
  return { queued: true, position: state.queue.findIndex((j) => j.wineId === wineId) + 1 };
};

const work = async () => {
  if (state.running || state.queue.length === 0) return;
  resetDayIfNeeded();
  const next = state.queue[0];
  if (next.trigger !== 'manual' && state.processedToday >= dailyLimit()) return;
  state.queue.shift();
  state.running = next;
  try {
    await valuer(next.wineId);
  } catch (error) {
    console.error('[cote] erreur inattendue :', error.message);
  } finally {
    if (next.trigger !== 'manual') state.processedToday++;
    state.running = null;
    setImmediate(work);
  }
};

export const scheduleDue = async () => {
  resetDayIfNeeded();
  const room = dailyLimit() - state.processedToday - state.queue.filter((j) => j.trigger !== 'manual').length;
  if (room <= 0) return 0;
  const client = await pool.connect();
  try {
    const { rows: [{ locked }] } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
    if (!locked) return 0;
    try {
      const { rows } = await client.query(
        `SELECT w.id FROM wines w
          WHERE (w.valuation_next_check_at IS NULL OR w.valuation_next_check_at <= now())
            AND EXISTS (SELECT 1 FROM bottles b WHERE b.wine_id = w.id AND NOT b.is_consumed)
            AND NOT EXISTS (SELECT 1 FROM wine_valuations v WHERE v.wine_id = w.id AND v.basis = 'USER' AND v.valued_at > now() - interval '3 months')
          ORDER BY w.valuation_next_check_at NULLS FIRST, w.created_at
          LIMIT $1`,
        [room]
      );
      rows.forEach((r) => requestValuation(r.id, 'scheduled'));
      return rows.length;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
};

export const startValuationScheduler = () => {
  if (state.timer || process.env.VALUATION_ENABLED === 'false') return false;
  const engine = availableEngine();
  if (!engine) {
    console.log('💶 Cotes automatiques désactivées (aucun moteur : CLAUDE_CODE_OAUTH_TOKEN ou ANTHROPIC_API_KEY)');
    return false;
  }
  const tick = () => scheduleDue().catch((e) => console.warn('[cote] planification :', e.message));
  state.timer = setInterval(tick, tickMinutes() * 60 * 1000);
  state.timer.unref?.();
  setTimeout(tick, 90 * 1000).unref?.();
  console.log(`💶 Cotes automatiques : moteur ${engine}, toutes les ${tickMinutes()} min, ${dailyLimit()} vins/jour max`);
  return true;
};

export const getValuationQueueStatus = () => {
  resetDayIfNeeded();
  return {
    engine: availableEngine(),
    running: state.running,
    queue: state.queue.map((j) => ({ wineId: j.wineId, trigger: j.trigger })),
    processedToday: state.processedToday,
    dailyLimit: dailyLimit(),
  };
};

// Pour les tests.
export const _resetValuationState = () => {
  state.queue = [];
  state.running = null;
  state.processedToday = 0;
  state.day = today();
};
export const _setValuer = (fn) => { valuer = fn; };
