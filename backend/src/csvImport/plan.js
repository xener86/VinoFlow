import { createHash } from 'node:crypto';
import { WINE_FIELDS, LIST_FIELDS } from './columns.js';

// Compare les patches du fichier à la cave et décrit ce que l'import ferait.
// Pur : la même entrée donne le même plan et la même empreinte (planHash),
// ce qui permet de vérifier à l'application que la cave n'a pas bougé.

const normalize = (field, value) => {
  if (LIST_FIELDS.includes(field)) return (value || []).map((s) => String(s).trim()).filter(Boolean);
  if (field === 'isFavorite') return Boolean(value);
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identity = (w) => [w.name, w.producer, w.vintage].map((v) => String(v ?? '').trim().toLowerCase()).join('|');
const wineLabel = (w) => [w.name, w.cuvee, w.vintage].filter(Boolean).join(' ');
const MISSING_BOUND = 'Apogée : renseigne Apogée début et Apogée fin';

export const hashPlan = ({ updates, peaks, prices, creates }) =>
  createHash('sha256').update(JSON.stringify({ updates, peaks, prices, creates })).digest('hex');

const planUpdate = (plan, p, wine) => {
  const label = wineLabel(wine);
  const changes = WINE_FIELDS.filter((f) => f in p.fields)
    .map((field) => ({ field, before: normalize(field, wine[field]), after: normalize(field, p.fields[field]) }))
    .filter((c) => !same(c.before, c.after));

  let peak = null;
  if (p.peak) {
    const before = wine.peakStart != null && wine.peakEnd != null ? { start: wine.peakStart, end: wine.peakEnd } : null;
    let after = null;
    if (p.peak !== 'clear') {
      const start = p.peak.start ?? before?.start;
      const end = p.peak.end ?? before?.end;
      if (start == null || end == null) return plan.errors.push({ line: p.line, message: MISSING_BOUND });
      if (start > end) return plan.errors.push({ line: p.line, message: 'Apogée début après Apogée fin' });
      after = { start, end };
    }
    if (!same(before, after)) peak = { line: p.line, wineId: wine.id, label, before, after };
  }

  let price = null;
  if (p.price !== undefined && wine.bottles.length > 0) {
    const missing = wine.bottles.filter((b) => !b.purchasePrice || b.purchasePrice <= 0).length;
    if (missing > 0) {
      price = { line: p.line, wineId: wine.id, label, price: p.price, bottleCount: missing };
    } else {
      const avg = Math.round((wine.bottles.reduce((s, b) => s + b.purchasePrice, 0) / wine.bottles.length) * 100) / 100;
      if (avg !== p.price) plan.warnings.push({ line: p.line, message: 'Prix d’achat déjà connu pour toutes les bouteilles : ignoré' });
    }
  }

  if (changes.length) plan.updates.push({ line: p.line, wineId: wine.id, label, changes });
  if (peak) plan.peaks.push(peak);
  if (price) plan.prices.push(price);
  if (!changes.length && !peak && !price) plan.unchanged += 1;
};

const planCreate = (plan, p, identities) => {
  let peak = null;
  if (p.peak && p.peak !== 'clear') {
    if (p.peak.start == null || p.peak.end == null) return plan.errors.push({ line: p.line, message: MISSING_BOUND });
    peak = { start: p.peak.start, end: p.peak.end };
  }
  const label = wineLabel(p.fields);
  const key = identity(p.fields);
  if (identities.has(key)) plan.warnings.push({ line: p.line, message: `${label} existe peut-être déjà dans la cave` });
  identities.add(key);
  plan.creates.push({ line: p.line, label, fields: p.fields, peak, price: p.price ?? null, bottles: p.bottles ?? 1 });
};

export const buildPlan = (patches, cellar, errors = []) => {
  const plan = { updates: [], peaks: [], prices: [], creates: [], unchanged: 0, errors: [...errors], warnings: [] };
  const byId = new Map(cellar.map((w) => [w.id, w]));
  const identities = new Set(cellar.map(identity));
  const idCount = new Map();
  for (const p of patches) if (p.id) idCount.set(p.id, (idCount.get(p.id) || 0) + 1);

  for (const p of patches) {
    if (!p.id) { planCreate(plan, p, identities); continue; }
    if (idCount.get(p.id) > 1) { plan.errors.push({ line: p.line, message: 'Identifiant présent plusieurs fois dans le fichier' }); continue; }
    const wine = byId.get(p.id);
    if (!wine) { plan.errors.push({ line: p.line, message: 'Identifiant inconnu : ce vin n’existe pas (ou plus) dans la cave' }); continue; }
    planUpdate(plan, p, wine);
  }

  plan.errors.sort((a, b) => a.line - b.line);
  plan.warnings.sort((a, b) => a.line - b.line);
  plan.changeCount = plan.updates.length + plan.peaks.length + plan.prices.length + plan.creates.length;
  plan.planHash = hashPlan(plan);
  return plan;
};
