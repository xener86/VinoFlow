// File d'attente et surveillance planifiée de l'enrichissement.
//
// - Une seule exécution à la fois (Claude Code et les quotas de l'abonnement
//   ne gagnent rien au parallélisme) ; les demandes manuelles passent devant.
// - Toutes les ENRICH_TICK_MINUTES (défaut 60), les vins en stock dont la
//   vérification est échue (enrichment_next_check_at) ou jamais enrichis sont
//   ajoutés à la file, dans la limite de ENRICH_DAILY_LIMIT (défaut 30) par jour.
// - Un verrou consultatif Postgres évite que deux backends planifient en double.
import { pool } from '../db.js';
import { availableEngine } from './engines.js';
import { enrichWine } from './service.js';

const LOCK_KEY = 74_206_002;
const tickMinutes = () => Number(process.env.ENRICH_TICK_MINUTES || 60);
export const dailyLimit = () => Number(process.env.ENRICH_DAILY_LIMIT || 30);

const state = {
  queue: [], // [{ wineId, trigger }]
  running: null,
  timer: null,
  day: null,
  processedToday: 0,
  lastResults: [],
};

const today = () => new Date().toISOString().slice(0, 10);
const resetDayIfNeeded = () => {
  if (state.day !== today()) {
    state.day = today();
    state.processedToday = 0;
  }
};

/** Ajoute un vin à la file (sans doublon). Les demandes manuelles passent devant. */
export const requestEnrichment = (wineId, trigger = 'manual') => {
  if (state.running?.wineId === wineId) return { queued: true, position: 0 };
  const existing = state.queue.findIndex((j) => j.wineId === wineId);
  if (existing !== -1) {
    if (trigger === 'manual' && state.queue[existing].trigger !== 'manual') {
      const [job] = state.queue.splice(existing, 1);
      job.trigger = 'manual';
      state.queue.splice(state.queue.filter((j) => j.trigger === 'manual').length, 0, job);
    }
  } else if (trigger === 'manual') {
    state.queue.splice(state.queue.filter((j) => j.trigger === 'manual').length, 0, { wineId, trigger });
  } else {
    state.queue.push({ wineId, trigger });
  }
  setImmediate(work);
  return { queued: true, position: state.queue.findIndex((j) => j.wineId === wineId) + 1 };
};

const work = async () => {
  if (state.running || state.queue.length === 0) return;
  resetDayIfNeeded();
  const next = state.queue[0];
  // Le plafond quotidien ne s'applique qu'à la surveillance automatique.
  if (next.trigger !== 'manual' && state.processedToday >= dailyLimit()) return;
  state.queue.shift();
  state.running = { ...next, startedAt: new Date() };
  try {
    const result = await enrichWine(next.wineId, { trigger: next.trigger });
    state.lastResults.unshift({ wineId: next.wineId, trigger: next.trigger, at: new Date(), ...pickSummary(result) });
    state.lastResults = state.lastResults.slice(0, 20);
  } catch (error) {
    console.error('[enrichment] erreur inattendue :', error);
  } finally {
    state.processedToday++;
    state.running = null;
    setImmediate(work);
  }
};

const pickSummary = (r) => ({ ok: r.ok, status: r.status, level: r.level || null, error: r.error || null });

/** Sélectionne les vins dont la vérification est due et les met en file. */
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
          WHERE (w.enrichment_next_check_at IS NULL OR w.enrichment_next_check_at <= now())
            AND w.enrichment_status IS DISTINCT FROM 'needs_review'
            AND EXISTS (SELECT 1 FROM bottles b WHERE b.wine_id = w.id AND NOT b.is_consumed)
          ORDER BY w.enriched_at NULLS FIRST, w.enrichment_next_check_at NULLS FIRST
          LIMIT $1`,
        [room]
      );
      rows.forEach((r) => requestEnrichment(r.id, 'scheduled'));
      return rows.length;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
};

export const startScheduler = () => {
  if (state.timer || process.env.ENRICH_SCHEDULER === 'false') return false;
  const engine = availableEngine();
  if (!engine) {
    console.log('🍇 Enrichissement planifié désactivé (aucun moteur : CLAUDE_CODE_OAUTH_TOKEN ou ANTHROPIC_API_KEY)');
    return false;
  }
  const tick = () => scheduleDue().catch((e) => console.warn('[enrichment] planification :', e.message));
  state.timer = setInterval(tick, tickMinutes() * 60 * 1000);
  state.timer.unref?.();
  setTimeout(tick, 60 * 1000).unref?.();
  console.log(`🍇 Enrichissement planifié : moteur ${engine}, toutes les ${tickMinutes()} min, ${dailyLimit()} vins/jour max`);
  return true;
};

export const getSchedulerStatus = () => {
  resetDayIfNeeded();
  return {
    engine: availableEngine(),
    running: state.running,
    queue: state.queue.map((j) => ({ wineId: j.wineId, trigger: j.trigger })),
    processedToday: state.processedToday,
    dailyLimit: dailyLimit(),
    lastResults: state.lastResults,
  };
};

// Pour les tests.
export const _resetSchedulerState = () => {
  state.queue = [];
  state.running = null;
  state.processedToday = 0;
  state.lastResults = [];
};
