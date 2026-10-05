// Newsletter de la cave : collecte (base), assemblage (pur) et composition.
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { classifyWine } from './classify.js';
import { wineName, windowBadge, periodTitle, dayMonth } from './format.js';
import { periodStart, zonedParts, notifyTz } from './schedule.js';
import { generateSommelierNote } from './sommelierNote.js';

/** Emplacement lisible par vin en stock : nom du casier, ou libellé libre. */
export const loadLocations = async () => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (b.wine_id) b.wine_id,
       COALESCE(r.name, CASE WHEN jsonb_typeof(b.location) = 'string' THEN b.location #>> '{}' END) AS label
     FROM bottles b LEFT JOIN racks r ON r.id::text = b.location->>'rackId'
     WHERE b.is_consumed = false
     ORDER BY b.wine_id, r.name NULLS LAST`
  );
  return new Map(rows.filter((r) => r.label).map((r) => [r.wine_id, r.label]));
};

export const collectNewsletterData = async ({ since }) => {
  const [inventory, journal, spending, value, tastings, locations] = await Promise.all([
    loadInventory(),
    pool.query('SELECT type, COALESCE(quantity, 1)::int AS quantity FROM journal WHERE date >= $1', [since]),
    pool.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(purchase_price), 0)::float AS total FROM bottles WHERE purchase_date >= $1', [since]),
    pool.query('SELECT COALESCE(SUM(purchase_price), 0)::float AS total FROM bottles WHERE is_consumed = false'),
    pool.query(
      `SELECT t.wine_id, t.date, t.overall_rating, w.name, w.cuvee, w.vintage
       FROM tasting_notes t JOIN wines w ON w.id = t.wine_id
       WHERE t.date >= $1 ORDER BY t.date`,
      [since]
    ),
    loadLocations(),
  ]);
  return {
    inventory,
    journal: journal.rows,
    spending: spending.rows[0],
    cellarValue: value.rows[0].total,
    tastings: convertKeysToCamelCase(tastings.rows),
    locations,
  };
};

const sumJournal = (journal, types) =>
  journal.filter((j) => types.includes(j.type)).reduce((s, j) => s + Number(j.quantity || 1), 0);

export const buildNewsletter = (data, { settings, now, tz = notifyTz(), since, appUrl, note, menuflow = null }) => {
  const { year } = zonedParts(now, tz);
  const weekly = settings.newsletterFrequency === 'weekly';
  const classified = data.inventory
    .map((wine) => ({ wine, c: classifyWine(wine, { horizonMonths: settings.horizonMonths, now, tz }) }))
    .filter(({ c }) => c);
  const urgent = classified
    .filter(({ c }) => c.state === 'DEPASSEE' || c.state === 'SE_REFERME')
    .sort((a, b) => a.c.monthsLeft - b.c.monthsLeft)
    .slice(0, 10)
    .map(({ wine, c }) => ({
      label: wineName(wine),
      sub: [wine.region, wine.vintage, c.estimated ? 'estimée' : null].filter(Boolean).join(' · '),
      location: data.locations.get(wine.id) || null,
      qty: wine.inventoryCount,
      badge: windowBadge(c),
      url: `${appUrl}/wine/${wine.id}`,
    }));
  const ready = classified
    .filter(({ c }) => c.state === 'PRET' && c.peakStart === year)
    .map(({ wine, c }) => ({
      label: wineName(wine),
      sub: `${[wine.region, wine.vintage].filter(Boolean).join(' ')} · ${wine.inventoryCount} bt · apogée ${c.peakStart}–${c.peakEnd}`,
      url: `${appUrl}/wine/${wine.id}`,
    }));
  const tastings = data.tastings.map((t) => ({
    label: wineName(t),
    sub: [t.vintage, dayMonth(t.date, tz)].filter(Boolean).join(' · '),
    rating: t.overallRating != null ? `${Number(t.overallRating)}/20` : null,
    url: `${appUrl}/wine/${t.wineId}`,
  }));
  const period = periodTitle(settings, now, tz);
  const inStock = data.inventory.filter((w) => (w.inventoryCount || 0) > 0);
  return {
    subject: `VinoFlow — votre cave, ${period}`,
    title: `Votre cave — ${period}`,
    periodLabel: period,
    heading: { lead: 'Que boire', accent: weekly ? 'cette semaine' : 'ce mois-ci' },
    intro: `Votre cave depuis le ${dayMonth(since, tz)} : ce qui est entré, ce qui est parti, et les bouteilles qui n’attendront plus très longtemps.`,
    appUrl,
    stats: {
      bottlesInCellar: inStock.reduce((s, w) => s + w.inventoryCount, 0),
      winesInCellar: inStock.length,
      bottlesIn: sumJournal(data.journal, ['IN']),
      spent: Number(data.spending.total) || 0,
      bottlesOut: sumJournal(data.journal, ['OUT', 'GIFT']),
      gifts: sumJournal(data.journal, ['GIFT']),
      cellarValue: Number(data.cellarValue) || 0,
    },
    urgent,
    ready,
    tastings,
    menuflow,
    note,
  };
};

export const composeNewsletter = async (settings, { now = new Date(), tz = notifyTz(), withAi }) => {
  const since = periodStart(settings, now);
  const data = await collectNewsletterData({ since });
  const note = withAi ? await generateSommelierNote({ inventory: data.inventory, settings, now, tz }) : null;
  return buildNewsletter(data, { settings, now, tz, since, appUrl: APP_URL, note });
};
