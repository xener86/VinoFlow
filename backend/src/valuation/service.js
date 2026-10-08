// Passe « cote » : recherche web, vérification des citations, enregistrement
// d'un point de cote (ou statut NONE / ERROR) et prochaine vérification.
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { availableEngine, runEngine } from '../enrichment/engines.js';
import { verifySources } from '../enrichment/verify.js';
import { VALUATION_SCHEMA } from './schema.js';
import { VALUATION_SYSTEM_PROMPT, buildValuationPrompt } from './prompt.js';
import { formatMl, summarizePrices, quoteHasPrice, addMonths, shouldValue } from './compute.js';

const setStatus = (wineId, status, nextCheckAt) => pool.query(
  'UPDATE wines SET valuation_status = $2, valuation_next_check_at = $3 WHERE id = $1',
  [wineId, status, nextCheckAt]
);

const insertValuation = async (wineId, v) => {
  const { rows } = await pool.query(
    `INSERT INTO wine_valuations (wine_id, valued_at, price_eur, low_eur, high_eur, basis, basis_vintage, sources, engine, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [wineId, v.valuedAt, v.priceEur, v.lowEur, v.highEur, v.basis, v.basisVintage ?? null, JSON.stringify(v.sources || []), v.engine ?? null, v.note ?? null]
  );
  return convertKeysToCamelCase(rows[0]);
};

export const getLatestValuation = async (wineId) => {
  const { rows } = await pool.query(
    'SELECT basis, valued_at FROM wine_valuations WHERE wine_id = $1 ORDER BY valued_at DESC, id DESC LIMIT 1',
    [wineId]
  );
  return rows[0] ? { basis: rows[0].basis, valuedAt: rows[0].valued_at } : null;
};

export const getValuations = async (wineId) => {
  const [history, wine] = await Promise.all([
    pool.query('SELECT * FROM wine_valuations WHERE wine_id = $1 ORDER BY valued_at DESC, id DESC LIMIT 40', [wineId]),
    pool.query('SELECT valuation_status, valuation_next_check_at FROM wines WHERE id = $1', [wineId]),
  ]);
  const list = convertKeysToCamelCase(history.rows);
  return {
    latest: list[0] || null,
    history: list,
    status: wine.rows[0]?.valuation_status ?? null,
    nextCheckAt: wine.rows[0]?.valuation_next_check_at ?? null,
  };
};

export const saveManualValuation = async (wineId, { priceEur, lowEur = null, highEur = null, note = null }, { now = new Date() } = {}) => {
  const v = await insertValuation(wineId, { valuedAt: now, priceEur, lowEur, highEur, basis: 'USER', sources: [], engine: null, note });
  await setStatus(wineId, 'OK', addMonths(now, 3));
  return v;
};

const isHttp = (url) => /^https?:\/\//i.test(String(url || ''));
const MAX_PRICE = 100_000;

export const valueWine = async (wineId, { engine = availableEngine(), runner, fetchPage, now = new Date() } = {}) => {
  const { rows } = await pool.query(
    `SELECT w.*, (SELECT count(*) FROM bottles b WHERE b.wine_id = w.id AND NOT b.is_consumed)::int AS inventory_count
     FROM wines w WHERE w.id = $1`,
    [wineId]
  );
  if (!rows[0]) return { ok: false, status: 'ERROR', error: 'Vin introuvable' };
  const wine = convertKeysToCamelCase(rows[0]);
  const latest = await getLatestValuation(wineId);
  if (latest?.basis === 'USER' && !shouldValue({ inventoryCount: wine.inventoryCount, valuationNextCheckAt: null }, { latest, now })) {
    return { ok: true, status: 'SKIPPED' };
  }
  if (!engine) return { ok: false, status: 'ERROR', error: 'Aucun moteur de recherche disponible' };

  let result;
  try {
    result = await runEngine(engine, buildValuationPrompt(wine, { currentYear: now.getUTCFullYear() }), {
      runner, schema: VALUATION_SCHEMA, systemPrompt: VALUATION_SYSTEM_PROMPT, task: 'valuation',
    });
  } catch (error) {
    await setStatus(wineId, 'ERROR', addMonths(now, 1));
    return { ok: false, status: 'ERROR', error: error.message };
  }

  const data = result.data || {};
  // Montant plausible : positif, borné comme la saisie manuelle, et jamais égal au
  // millésime (« Alpha 2019 » lu comme un prix de 2019 €).
  const plausible = (price) => price > 0 && price <= MAX_PRICE && price !== Number(wine.vintage);
  const candidates = data.status === 'FOUND'
    ? (data.prices || []).filter((p) => isHttp(p.url) && p.quote && plausible(Number(p.price_eur)))
    : [];
  // Vérification stricte : la citation doit figurer telle quelle (bornée aux mots) dans la page.
  const checked = await verifySources(
    candidates.map((p) => ({ ...p, excerpt: p.quote })),
    { strict: true, ...(fetchPage ? { fetchPage } : {}) },
  );
  const counted = checked.filter((c) => c.check === 'verified' && quoteHasPrice(c.quote, Number(c.price_eur)));
  const summary = summarizePrices(counted, formatMl(wine.format));
  if (!summary) {
    await setStatus(wineId, 'NONE', addMonths(now, 1));
    return { ok: true, status: 'NONE' };
  }
  const countedUrls = new Set(summary.kept.map((p) => p.url));
  await insertValuation(wineId, {
    valuedAt: now,
    priceEur: summary.price,
    lowEur: summary.low,
    highEur: summary.high,
    basis: data.basis === 'AUTRE_MILLESIME' ? 'AUTRE_MILLESIME' : 'EXACT',
    basisVintage: data.basis_vintage ?? null,
    sources: checked.map((c) => ({
      url: c.url, title: c.seller, quote: c.quote, price_eur: Number(c.price_eur), format_ml: c.format_ml,
      status: c.check, counted: countedUrls.has(c.url),
    })),
    engine: result.engine,
    note: data.note || null,
  });
  await setStatus(wineId, 'OK', addMonths(now, 3));
  return { ok: true, status: 'OK', price: summary.price };
};
