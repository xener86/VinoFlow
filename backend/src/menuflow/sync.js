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

export const needsSuggestion = (row, inventoryById, today) => {
  if (row.dinnerDate < today) return false;
  if (!row.suggestedWineId || row.suggestedForTitle !== row.dishTitle) return true;
  return (inventoryById.get(row.suggestedWineId)?.inventoryCount ?? 0) <= 0;
};

const ref = (wine, extra = {}) => ({ wine: wine.wine, vintage: wine.vintage ?? null, reason: null, location: null, url: null, ...extra });

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
  return { dish_title: row.dishTitle, suggested, opened };
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
            suggested_wine_id, suggestion_reason, suggested_for_title, pushed_hash
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
  if (!pick) return null;
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
    const weeks = (await Promise.all(starts.map((s) => getWeek(s)))).filter(Boolean);
    const dinners = weeks.flatMap((w) => w.dinners || []).filter((d) => d.date >= from && d.date <= to);
    await upsertDinners(dinners);

    const inventory = await loadInventory();
    const ctx = await context(from, tz, inventory);
    const rows = await loadPairings(from, to);
    let suggested = 0;
    for (const row of rows) {
      if (suggested >= maxSuggestions) break;
      if (!needsSuggestion(row, ctx.inventoryById, today)) continue;
      if (await suggestFor(row, ctx)) suggested++;
    }
    let pushed = 0;
    for (const row of rows) if (await pushDay(row, ctx)) pushed++;
    Object.assign(state, { lastSyncAt: new Date().toISOString(), lastError: null });
    return { dinners: dinners.length, suggested, pushed };
  } catch (error) {
    state.lastError = error.message;
    console.error('[menuflow] synchronisation :', error.message);
    return { error: error.message };
  }
};

/** Dîner du jour : lu en base, sinon chez MenuFlow (puis mémorisé). */
export const loadTonight = async ({ now = new Date(), tz = notifyTz() } = {}) => {
  const today = localDay(now, tz);
  let [row] = await loadPairings(today, today);
  if (!row) {
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
