// Rubriques MenuFlow de la newsletter (sans appel IA) : vos accords du mois,
// vous auriez pu…, d'ailleurs… vous avez oublié de noter.
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { classifyWine, rank } from '../notifications/classify.js';
import { wineLabel, dayMonth } from '../notifications/format.js';
import { isMenuflowConfigured } from './client.js';
import { loadPairings, openedByDay, localDay } from './sync.js';

const VERDICTS = { top: 'top', tres_bon: 'très bon', bon: 'bon', moyen: 'moyen', a_ne_pas_refaire: 'à ne pas refaire' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const label = (o) => [o.wineName, o.wineVintage].filter(Boolean).join(' ');
const asDate = (day) => new Date(`${day}T12:00:00Z`);

export const buildMenuflowSections = ({ pairings, openedByDay: opened, tastings, inventoryById, appUrl, today, tz, now, horizonMonths }) => {
  const tastedSince = (wineId, day) => tastings.some((t) => t.wineId === wineId && localDay(new Date(t.date), tz) >= day);
  const ratingOn = (wineId, day) => {
    const t = tastings.find((x) => x.wineId === wineId && localDay(new Date(x.date), tz) >= day && x.overallRating != null);
    return t ? `${Number(t.overallRating)}/20` : null;
  };
  const recentFirst = [...pairings].sort((a, b) => b.dinnerDate.localeCompare(a.dinnerDate));

  const accords = recentFirst
    .flatMap((p) => (opened.get(p.dinnerDate) || []).map((o) => ({
      date: dayMonth(asDate(p.dinnerDate), tz),
      dish: p.dishTitle,
      wine: label(o),
      verdict: (p.verdicts || []).map((v) => `${cap(v.author)} : ${VERDICTS[v.rating] || v.rating}`).join(' · ') || null,
      rating: o.wineId ? ratingOn(o.wineId, p.dinnerDate) : null,
      url: o.wineId ? `${appUrl}/wine/${o.wineId}` : appUrl,
    })))
    .slice(0, 8);

  const urgency = (w) => {
    if (!w || (w.inventoryCount ?? 0) <= 0) return -1;
    const c = classifyWine(w, { horizonMonths, now, tz });
    return c ? rank(c.state) : 0;
  };
  const couldHave = pairings
    .filter((p) => p.dinnerDate < today && !(opened.get(p.dinnerDate) || []).length)
    .filter((p) => p.suggestedWineId && p.suggestedForTitle === p.dishTitle && inventoryById.has(p.suggestedWineId))
    .map((p) => ({ p, w: inventoryById.get(p.suggestedWineId) }))
    .sort((a, b) => urgency(b.w) - urgency(a.w) || b.p.dinnerDate.localeCompare(a.p.dinnerDate))
    .slice(0, 3)
    .map(({ p, w }) => ({
      date: dayMonth(asDate(p.dinnerDate), tz),
      dish: p.dishTitle,
      wine: wineLabel(w),
      reason: p.suggestionReason || null,
      url: `${appUrl}/wine/${w.id}`,
    }));

  const forgotten = recentFirst
    .flatMap((p) => (opened.get(p.dinnerDate) || [])
      .filter((o) => o.wineId && !tastedSince(o.wineId, p.dinnerDate))
      .map((o) => ({ date: dayMonth(asDate(p.dinnerDate), tz), dish: p.dishTitle, wine: label(o), url: `${appUrl}/tasting/${o.wineId}` })))
    .slice(0, 3);

  return accords.length || couldHave.length || forgotten.length ? { accords, couldHave, forgotten } : null;
};

export const collectMenuflowSections = async ({ since, now, tz, settings }) => {
  if (!isMenuflowConfigured()) return null;
  const from = localDay(since, tz);
  const today = localDay(now, tz);
  const [pairings, opened, inventory, tastings] = await Promise.all([
    loadPairings(from, today),
    openedByDay(from, tz),
    loadInventory(),
    pool.query('SELECT wine_id, date, overall_rating FROM tasting_notes WHERE date >= $1', [since]),
  ]);
  return buildMenuflowSections({
    pairings: pairings.filter((p) => p.dinnerDate < today || p.dinnerDate === today),
    openedByDay: opened,
    tastings: convertKeysToCamelCase(tastings.rows),
    inventoryById: new Map(inventory.map((w) => [w.id, w])),
    appUrl: APP_URL,
    today,
    tz,
    now,
    horizonMonths: settings.horizonMonths,
  });
};
