// Synchronisation VinoFlow → MenuFlow, dans le tick des notifications :
// 1. lecture des dîners de J−35 à J+7 (table dinner_pairings, une ligne par date) ;
// 2. conseil d'un vin en stock pour chaque dîner à venir qui n'en a pas (ou dont le
//    plat a changé, ou dont le vin est épuisé) — 7 au plus par passage, IA requise ;
// 3. envoi à MenuFlow du conseil et des bouteilles ouvertes ce soir-là, seulement
//    si le contenu a changé (empreinte).
import { createHash } from 'node:crypto';
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { pairForDish, pickInStock } from '../sommelier/pairForDish.js';
import { isNoteAvailable } from '../notifications/sommelierNote.js';
import { loadLocations } from '../notifications/newsletter.js';
import { zonedParts, notifyTz } from '../notifications/schedule.js';
import { isMenuflowConfigured, getWeeks, getWeek, getDinnerByDate, putDinnerWine, deleteDinnerWine } from './client.js';

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (date, tz = notifyTz()) => {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const state = { lastSyncAt: null, lastError: null };
export const menuflowStatus = () => ({ configured: isMenuflowConfigured(), ...state });

const RETRY_MS = 24 * 3_600_000;

/**
 * Faut-il (re)demander un conseil pour ce dîner ? Jamais pour un dîner passé, ni
 * quand une bouteille a déjà été ouverte, ni sans vin en stock ; après un échec
 * (aucun vin trouvé pour ce plat), pas de nouvel essai avant 24 h.
 */
export const needsSuggestion = (row, inventoryById, today, { opened = [], now = new Date() } = {}) => {
  if (row.dinnerDate < today || opened.length > 0) return false;
  if (![...inventoryById.values()].some((w) => (w.inventoryCount ?? 0) > 0)) return false;
  if (row.suggestedForTitle !== row.dishTitle) return true;
  if (!row.suggestedWineId) {
    return !row.suggestedAt || now.getTime() - new Date(row.suggestedAt).getTime() >= RETRY_MS;
  }
  return (inventoryById.get(row.suggestedWineId)?.inventoryCount ?? 0) <= 0;
};

// Limites du schéma MenuFlow (DinnerWineIn / WineRef) : au-delà, MenuFlow répond 422.
const cut = (value, max) => (value == null ? value : String(value).slice(0, max));

const ref = (wine, extra = {}) => {
  const r = { wine: wine.wine, vintage: wine.vintage ?? null, reason: null, location: null, url: null, ...extra };
  return { ...r, wine: cut(r.wine, 200), reason: cut(r.reason, 1000), location: cut(r.location, 200), url: cut(r.url, 500) };
};

export const buildWinePayload = (row, { inventoryById, openedByDay, locations, appUrl }) => {
  const w = row.suggestedWineId ? inventoryById.get(row.suggestedWineId) : null;
  const suggested = w && row.suggestedForTitle === row.dishTitle
    ? ref({ wine: [w.name, w.cuvee].filter(Boolean).join(' '), vintage: w.vintage }, {
      reason: row.suggestionReason || null,
      location: locations.get(w.id) || null,
      url: `${appUrl}/wine/${w.id}`,
    })
    : null;
  const opened = (openedByDay.get(row.dinnerDate) || []).map((o) =>
    ref({ wine: o.wineName, vintage: o.wineVintage }, { url: o.wineId ? `${appUrl}/wine/${o.wineId}` : null }));
  return { dish_title: cut(row.dishTitle, 300), suggested, opened };
};

export const payloadHash = (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

export const upsertDinners = async (dinners) => {
  for (const d of dinners) {
    const verdicts = (d.verdicts || []).map((v) => ({ author: v.author, rating: v.rating }));
    await pool.query(
      `INSERT INTO dinner_pairings (dinner_date, menuflow_dinner_id, dish_title, verdicts)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dinner_date) DO UPDATE SET menuflow_dinner_id = EXCLUDED.menuflow_dinner_id,
         dish_title = EXCLUDED.dish_title, verdicts = EXCLUDED.verdicts, updated_at = now()`,
      [d.date, d.id, d.title, JSON.stringify(verdicts)]
    );
  }
};

export const loadPairings = async (from, to) => {
  const { rows } = await pool.query(
    `SELECT to_char(dinner_date, 'YYYY-MM-DD') AS dinner_date, menuflow_dinner_id, dish_title, verdicts,
            suggested_wine_id, suggestion_reason, suggested_for_title, suggested_at, pushed_hash
     FROM dinner_pairings WHERE dinner_date BETWEEN $1::date AND $2::date ORDER BY dinner_date`,
    [from, to]
  );
  return convertKeysToCamelCase(rows);
};

/** Sorties du journal rattachées (automatiquement ou confirmées) à un dîner, par jour local. */
export const openedByDay = async (from, tz = notifyTz()) => {
  const { rows } = await pool.query(
    `SELECT id, wine_id, wine_name, wine_vintage, date FROM journal
     WHERE type = 'OUT' AND for_dinner IS NOT FALSE AND date >= ($1::date - interval '1 day') ORDER BY date`,
    [from]
  );
  const map = new Map();
  for (const r of rows) {
    const day = localDay(new Date(r.date), tz);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push({ journalId: r.id, wineId: r.wine_id, wineName: r.wine_name, wineVintage: r.wine_vintage });
  }
  return map;
};

export const suggestFor = async (row, { inventoryById, exclude = [] }) => {
  if (!isNoteAvailable()) return null;
  const pick = pickInStock(await pairForDish({ dish: row.dishTitle, exclude }), inventoryById);
  if (!pick) {
    // Aucun vin pour ce plat : on le mémorise pour ne pas repayer un appel IA à chaque tick.
    if (!row.suggestedWineId) {
      await pool.query(
        'UPDATE dinner_pairings SET suggested_for_title = $2, suggested_at = now() WHERE dinner_date = $1::date',
        [row.dinnerDate, row.dishTitle]
      );
      Object.assign(row, { suggestedForTitle: row.dishTitle, suggestedAt: new Date().toISOString() });
    }
    return null;
  }
  await pool.query(
    `UPDATE dinner_pairings SET suggested_wine_id = $2, suggestion_reason = $3, suggested_for_title = $4, suggested_at = now()
     WHERE dinner_date = $1::date`,
    [row.dinnerDate, pick.wine_id, pick.reason, row.dishTitle]
  );
  Object.assign(row, { suggestedWineId: pick.wine_id, suggestionReason: pick.reason, suggestedForTitle: row.dishTitle });
  return pick;
};

export const pushDay = async (row, ctx) => {
  const payload = buildWinePayload(row, ctx);
  const empty = !payload.suggested && payload.opened.length === 0;
  const hash = empty ? null : payloadHash(payload);
  if (hash === (row.pushedHash ?? null)) return false;
  if (empty) await deleteDinnerWine(row.dinnerDate);
  else await putDinnerWine(row.dinnerDate, payload);
  await pool.query('UPDATE dinner_pairings SET pushed_hash = $2, pushed_at = now() WHERE dinner_date = $1::date', [row.dinnerDate, hash]);
  row.pushedHash = hash;
  return true;
};

/**
 * Dîners retirés d'une semaine republiée : on oublie la ligne (et on efface le vin
 * déjà poussé chez MenuFlow). Seules les semaines effectivement relues sont concernées.
 */
export const removeGhostDinners = async (weeks, dinners, { from, to }) => {
  const kept = new Set(dinners.map((d) => d.date));
  for (const week of weeks) {
    const start = week.start_date > from ? week.start_date : from;
    const endOfWeek = addDays(week.start_date, 6);
    const end = endOfWeek < to ? endOfWeek : to;
    if (start > end) continue;
    const { rows } = await pool.query(
      `SELECT to_char(dinner_date, 'YYYY-MM-DD') AS d, pushed_hash FROM dinner_pairings
       WHERE dinner_date BETWEEN $1::date AND $2::date`,
      [start, end]
    );
    for (const r of rows.filter((x) => !kept.has(x.d))) {
      if (r.pushed_hash) await deleteDinnerWine(r.d);
      await pool.query('DELETE FROM dinner_pairings WHERE dinner_date = $1::date', [r.d]);
    }
  }
};

const context = async (from, tz, inventory) => ({
  inventoryById: new Map(inventory.map((w) => [w.id, w])),
  openedByDay: await openedByDay(from, tz),
  locations: await loadLocations(),
  appUrl: APP_URL,
});

export const syncMenuflow = async ({ now = new Date(), tz = notifyTz(), maxSuggestions = 7 } = {}) => {
  if (!isMenuflowConfigured()) return { skipped: true };
  const today = localDay(now, tz);
  const from = addDays(today, -35);
  const to = addDays(today, 7);
  try {
    const summaries = (await getWeeks(8)) || [];
    const starts = summaries.map((w) => w.start_date).filter((s) => s <= to && addDays(s, 6) >= from);
    const weeks = (await Promise.all(starts.map(async (start) => {
      const week = await getWeek(start);
      return week ? { ...week, start_date: start } : null;
    }))).filter(Boolean);
    const dinners = weeks.flatMap((w) => w.dinners || []).filter((d) => d.date >= from && d.date <= to);
    await upsertDinners(dinners);
    await removeGhostDinners(weeks, dinners, { from, to });

    const inventory = await loadInventory();
    const ctx = await context(from, tz, inventory);
    const rows = await loadPairings(from, to);
    // Une erreur sur un dîner (IA en panne, refus de MenuFlow) n'empêche pas les autres.
    const failures = [];
    const attempt = async (row, fn) => {
      try {
        return await fn();
      } catch (error) {
        failures.push(`${row.dinnerDate} : ${error.message}`);
        console.error(`[menuflow] dîner du ${row.dinnerDate} :`, error.message);
        return null;
      }
    };
    let suggested = 0;
    let attempts = 0;
    for (const row of rows) {
      if (attempts >= maxSuggestions) break;
      if (!needsSuggestion(row, ctx.inventoryById, today, { opened: ctx.openedByDay.get(row.dinnerDate) || [], now })) continue;
      attempts++;
      if (await attempt(row, () => suggestFor(row, ctx))) suggested++;
    }
    let pushed = 0;
    for (const row of rows) if (await attempt(row, () => pushDay(row, ctx))) pushed++;
    Object.assign(state, { lastSyncAt: new Date().toISOString(), lastError: failures.length ? failures.join(' ; ') : null });
    return { dinners: dinners.length, suggested, pushed, errors: failures.length };
  } catch (error) {
    state.lastError = error.message;
    console.error('[menuflow] synchronisation :', error.message);
    return { error: error.message };
  }
};

/** Dîner du jour : lu en base, sinon chez MenuFlow (puis mémorisé). */
export const loadTonight = async ({ now = new Date(), tz = notifyTz(), remote = true } = {}) => {
  const today = localDay(now, tz);
  let [row] = await loadPairings(today, today);
  if (!row && remote) {
    const dinner = await getDinnerByDate(today);
    if (!dinner) return null;
    await upsertDinners([dinner]);
    [row] = await loadPairings(today, today);
  }
  return row || null;
};

/** Envoi immédiat du dîner du jour (après une sortie du journal) ; ne lève jamais. */
export const pushToday = async ({ now = new Date(), tz = notifyTz() } = {}) => {
  if (!isMenuflowConfigured()) return false;
  try {
    const row = await loadTonight({ now, tz });
    if (!row) return false;
    const today = localDay(now, tz);
    return await pushDay(row, await context(today, tz, await loadInventory()));
  } catch (error) {
    state.lastError = error.message;
    console.error('[menuflow] envoi du dîner du jour :', error.message);
    return false;
  }
};
