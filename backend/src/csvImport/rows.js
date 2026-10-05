import { CsvFormatError } from './parse.js';
import { COLUMNS, LIST_FIELDS, TEXT_FIELDS, TYPES, CLEAR, normalizeHeader } from './columns.js';

// Chaque ligne du tableur → patch typé (seuls les champs renseignés), ou une
// erreur rattachée à son numéro de ligne. Règles : cellule vide = ne pas
// toucher, « - » = effacer.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_ID = 'Ce fichier ne contient pas la colonne Identifiant. Réexporte ta cave depuis VinoFlow puis modifie ce nouveau fichier.';
const LABELS = { vintage: 'Millésime', peakStart: 'Apogée début', peakEnd: 'Apogée fin', bottles: 'Bouteilles' };

class LineError extends Error {}

// « 1 234,50 € » → 1234.5 (espaces, insécables compris, et symbole € ignorés).
const toNumber = (raw, label) => {
  const n = Number(raw.replace(/[\s€]/g, '').replace(',', '.'));
  if (raw.trim() === '' || !Number.isFinite(n)) throw new LineError(`${label} : « ${raw} » n’est pas un nombre`);
  return n;
};

const toInteger = (raw, field, min, max) => {
  const n = toNumber(raw, LABELS[field]);
  if (!Number.isInteger(n) || n < min || n > max) throw new LineError(`${LABELS[field]} invalide : « ${raw} » (entre ${min} et ${max})`);
  return n;
};

const toBoolean = (raw) => {
  const v = normalizeHeader(raw);
  if (['oui', 'o', 'yes', 'true', '1'].includes(v)) return true;
  if (['non', 'n', 'no', 'false', '0'].includes(v)) return false;
  throw new LineError(`Favori : « ${raw} » (Oui ou Non attendu)`);
};

const toPatch = (fields, cells, line, currentYear) => {
  const patch = { line, id: null, fields: {} };
  const peak = {};
  fields.forEach((field, i) => {
    const raw = (cells[i] ?? '').trim();
    if (!field || raw === '') return;
    const clear = raw === CLEAR;
    if (field === 'id') {
      if (!UUID.test(raw)) throw new LineError(`Identifiant invalide : « ${raw} »`);
      patch.id = raw.toLowerCase();
    } else if (field === 'name' || field === 'producer') {
      if (clear) throw new LineError(`Le ${field === 'name' ? 'nom' : 'producteur'} ne peut pas être effacé`);
      patch.fields[field] = raw;
    } else if (TEXT_FIELDS.includes(field)) {
      patch.fields[field] = clear ? null : raw;
    } else if (LIST_FIELDS.includes(field)) {
      patch.fields[field] = clear ? [] : raw.split(';').map((s) => s.trim()).filter(Boolean);
    } else if (field === 'vintage') {
      patch.fields.vintage = clear ? null : toInteger(raw, 'vintage', 1800, currentYear + 1);
    } else if (field === 'type') {
      const type = clear ? null : TYPES[normalizeHeader(raw)];
      if (type === undefined) throw new LineError(`Type inconnu : « ${raw} » (Rouge, Blanc, Rosé, Pétillant, Dessert, Fortifié)`);
      patch.fields.type = type;
    } else if (field === 'isFavorite') {
      patch.fields.isFavorite = clear ? false : toBoolean(raw);
    } else if (field === 'peakStart' || field === 'peakEnd') {
      peak[field] = clear ? null : toInteger(raw, field, 1800, 2200);
    } else if (field === 'price') {
      if (clear) throw new LineError('Un prix d’achat ne peut pas être effacé');
      const price = toNumber(raw, 'Prix d’achat');
      if (price < 0) throw new LineError(`Prix d’achat négatif : « ${raw} »`);
      patch.price = Math.round(price * 100) / 100;
    } else if (field === 'bottles' && !clear) {
      patch.bottles = toInteger(raw, 'bottles', 1, 99);
    }
  });

  if ('peakStart' in peak || 'peakEnd' in peak) {
    const { peakStart: start, peakEnd: end } = peak;
    if (start === null || end === null) {
      if (start !== null || end !== null) throw new LineError('Pour effacer l’apogée, mets « - » dans Apogée début et Apogée fin');
      patch.peak = 'clear';
    } else {
      if (start !== undefined && end !== undefined && start > end) throw new LineError('Apogée début après Apogée fin');
      patch.peak = { ...(start !== undefined && { start }), ...(end !== undefined && { end }) };
    }
  }
  if (!patch.id && (!patch.fields.name || !patch.fields.producer)) {
    throw new LineError('Nouveau vin : Nom et Producteur sont obligatoires');
  }
  return patch;
};

export const toPatches = ({ headers, rows }, { currentYear = new Date().getFullYear() } = {}) => {
  const fields = headers.map((h) => COLUMNS[normalizeHeader(h)] || null);
  if (!fields.includes('id')) throw new CsvFormatError(MISSING_ID);
  const patches = [];
  const errors = [];
  for (const { line, cells } of rows) {
    try {
      patches.push(toPatch(fields, cells, line, currentYear));
    } catch (error) {
      if (!(error instanceof LineError)) throw error;
      errors.push({ line, message: error.message });
    }
  }
  return { patches, errors };
};
