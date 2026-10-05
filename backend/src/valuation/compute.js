// Calculs de la valeur de la cave (fonctions pures) : formats, prix cités,
// décision de recotation, séries investi / valeur et plus-values.

const round2 = (x) => Math.round(x * 100) / 100;
const DAY_MS = 86_400_000;

const NAMED_FORMATS = { bouteille: 750, magnum: 1500, 'demi-bouteille': 375, demi: 375, jeroboam: 3000, 'double-magnum': 3000, mathusalem: 6000 };

export const formatMl = (format) => {
  const s = String(format ?? '').toLowerCase().replace(/\s/g, '').replace(',', '.');
  let m = s.match(/^(\d+(?:\.\d+)?)ml$/);
  if (m) return Math.round(Number(m[1]));
  m = s.match(/^(\d+(?:\.\d+)?)cl$/);
  if (m) return Math.round(Number(m[1]) * 10);
  m = s.match(/^(\d+(?:\.\d+)?)l$/);
  if (m) return Math.round(Number(m[1]) * 1000);
  return NAMED_FORMATS[s] || 750;
};

export const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Montants présents dans un texte : « 1 250,00 € », « 29.90 », « 29€ ». */
const amountsIn = (text) => {
  const out = [];
  const re = /\d+(?:[ \u00a0\u202f.]\d{3}(?!\d))*(?:[.,]\d{1,2})?/g;
  for (const raw of String(text ?? '').match(re) || []) {
    let t = raw.replace(/[   ]/g, '');
    // « 1.250,00 » ou « 1.250 » : le point est un séparateur de milliers
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '');
    out.push(Number(t.replace(',', '.')));
  }
  return out.filter((n) => Number.isFinite(n));
};

export const quoteHasPrice = (quote, price) => amountsIn(quote).some((n) => Math.abs(n - price) < 0.01);

export const summarizePrices = (prices, targetMl) => {
  const scaled = prices
    .filter((p) => Number(p.price_eur) > 0)
    .map((p) => ({ ...p, scaled: (Number(p.price_eur) * targetMl) / (Number(p.format_ml) || 750) }));
  if (scaled.length === 0) return null;
  const m0 = median(scaled.map((p) => p.scaled));
  const kept = scaled.filter((p) => p.scaled <= 3 * m0);
  const values = kept.map((p) => p.scaled);
  return { price: round2(median(values)), low: round2(Math.min(...values)), high: round2(Math.max(...values)), kept };
};

export const addMonths = (date, n) => {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
};

export const shouldValue = (wine, { latest, now = new Date() }) => {
  if ((wine.inventoryCount ?? 0) <= 0) return false;
  if (latest?.basis === 'USER' && now.getTime() - new Date(latest.valuedAt).getTime() < 90 * DAY_MS) return false;
  return !wine.valuationNextCheckAt || new Date(wine.valuationNextCheckAt) <= now;
};

// ─── Séries ────────────────────────────────────────────────────────────────

const entryOf = (b) => new Date(b.purchaseDate || b.createdAt);
const inCellarAt = (b, at) => entryOf(b) <= at && (!b.isConsumed || (b.consumedDate != null && new Date(b.consumedDate) > at));
const hasPrice = (b) => Number(b.purchasePrice) > 0;

const monthPoints = (now, months) => {
  const points = [];
  for (let i = months - 1; i >= 0; i--) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() - i;
    const end = i === 0 ? now : new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    const label = new Date(Date.UTC(y, m, 1));
    points.push({ month: `${label.getUTCFullYear()}-${String(label.getUTCMonth() + 1).padStart(2, '0')}`, at: end });
  }
  return points;
};

export const cellarValue = ({ bottles, valuations, wines, months = 24, now = new Date() }) => {
  const byWine = new Map();
  for (const v of valuations) {
    if (!byWine.has(v.wineId)) byWine.set(v.wineId, []);
    byWine.get(v.wineId).push({ at: new Date(v.valuedAt), price: Number(v.priceEur) });
  }
  for (const list of byWine.values()) list.sort((a, b) => a.at - b.at);

  const coteAt = (wineId, at) => {
    const list = byWine.get(wineId) || [];
    let found = null;
    for (const v of list) if (v.at <= at) found = v.price;
    return found;
  };
  const estimateFor = (b) => {
    const list = byWine.get(b.wineId) || [];
    if (list.length === 0) return null;
    const entry = entryOf(b);
    const before = list.filter((v) => v.at <= entry);
    return before.length ? before.at(-1).price : list[0].price;
  };

  const pointAt = (at) => {
    let invested = 0;
    let estimatedPurchase = 0;
    let value = 0;
    for (const b of bottles) {
      if (!inCellarAt(b, at)) continue;
      if (hasPrice(b)) invested += Number(b.purchasePrice);
      else estimatedPurchase += estimateFor(b) ?? 0;
      value += coteAt(b.wineId, at) ?? 0;
    }
    return { invested: round2(invested), estimatedPurchase: round2(estimatedPurchase), value: round2(value) };
  };

  const series = monthPoints(now, months).map(({ month, at }) => ({ month, ...pointAt(at) }));

  const inStock = bottles.filter((b) => inCellarAt(b, now));
  let gain = 0;
  let costBase = 0;
  for (const b of inStock) {
    const cote = coteAt(b.wineId, now);
    if (cote == null) continue;
    const cost = hasPrice(b) ? Number(b.purchasePrice) : (estimateFor(b) ?? cote);
    gain += cote - cost;
    costBase += cost;
  }

  const wineById = new Map(wines.map((w) => [w.id, w]));
  const movers = [];
  for (const wineId of new Set(inStock.map((b) => b.wineId))) {
    const priced = inStock.filter((b) => b.wineId === wineId && hasPrice(b));
    const cote = coteAt(wineId, now);
    if (priced.length === 0 || cote == null) continue;
    const avgPurchase = priced.reduce((s, b) => s + Number(b.purchasePrice), 0) / priced.length;
    const w = wineById.get(wineId) || {};
    movers.push({
      wineId,
      name: [w.name, w.cuvee].filter(Boolean).join(' '),
      vintage: w.vintage ?? null,
      price: cote,
      avgPurchase: round2(avgPurchase),
      gainPerBottle: round2(cote - avgPurchase),
      gainTotal: round2((cote - avgPurchase) * priced.length),
    });
  }

  return {
    series,
    today: {
      ...pointAt(now),
      gain: round2(gain),
      gainPct: costBase > 0 ? gain / costBase : null,
    },
    coverage: {
      bottles: inStock.length,
      withPrice: inStock.filter(hasPrice).length,
      withValuation: inStock.filter((b) => coteAt(b.wineId, now) != null).length,
    },
    movers: {
      up: movers.filter((m) => m.gainTotal > 0).sort((a, b) => b.gainTotal - a.gainTotal).slice(0, 5),
      down: movers.filter((m) => m.gainTotal < 0).sort((a, b) => a.gainTotal - b.gainTotal).slice(0, 5),
    },
  };
};
