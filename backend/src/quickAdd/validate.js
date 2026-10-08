// Validation complète d'une rafale avant toute écriture : une ligne invalide
// fait refuser l'ensemble (400) avec un message par ligne.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESTINATIONS = ['CELLAR', 'WISHLIST', 'TASTING'];
const TYPES = ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED'];
export const MAX_LINES = 50;

export class BatchError extends Error {
  constructor(message, lines = []) {
    super(message);
    this.lines = lines;
  }
}

const text = (value, max = 255) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const num = (value) => (value === undefined || value === null || value === '' ? null : Number(value));
const isPrice = (n) => n === null || (Number.isFinite(n) && n >= 0);

const toLine = (raw, index, currentYear) => {
  const clientId = String(raw?.clientId ?? index);
  const fail = (message) => ({ error: { clientId, message } });
  const w = raw?.wine || {};
  const destination = raw?.destination;
  if (!DESTINATIONS.includes(destination)) return fail('Destination inconnue');
  const name = text(w.name);
  if (!name) return fail('Nom manquant');
  const vintage = num(w.vintage);
  if (vintage !== null && !(Number.isInteger(vintage) && vintage >= 1800 && vintage <= currentYear + 1)) return fail('Millésime invalide');
  const type = w.type ?? null;
  if (type !== null && !TYPES.includes(type)) return fail('Couleur inconnue');
  const matchWineId = raw.matchWineId ?? null;
  if (matchWineId !== null && !UUID.test(String(matchWineId))) return fail('Vin de la cave invalide');

  const line = {
    clientId, destination,
    wine: {
      name, producer: text(w.producer), vintage, type, cuvee: text(w.cuvee), appellation: text(w.appellation),
      region: text(w.region), country: text(w.country),
      grapeVarieties: Array.isArray(w.grapeVarieties) ? w.grapeVarieties.map((g) => text(g)).filter(Boolean).slice(0, 20) : [],
      format: text(w.format, 20) || '750ml',
    },
    forceNew: Boolean(raw.forceNew),
    matchWineId: raw.forceNew ? null : matchWineId,
  };
  if (destination === 'CELLAR') {
    const quantity = num(raw.quantity) ?? 1;
    if (!(Number.isInteger(quantity) && quantity >= 1 && quantity <= 99)) return fail('Quantité entre 1 et 99');
    const price = num(raw.price);
    if (!isPrice(price)) return fail('Prix invalide');
    return { line: { ...line, quantity, price } };
  }
  if (destination === 'WISHLIST') {
    const estimatedPrice = num(raw.estimatedPrice);
    if (!isPrice(estimatedPrice)) return fail('Prix estimé invalide');
    return { line: { ...line, estimatedPrice } };
  }
  const rating = num(raw.rating);
  if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return fail('Note entre 1 et 5 étoiles');
  return { line: { ...line, rating, comment: text(raw.comment, 2000) } };
};

export const validateBatch = (body, { currentYear = new Date().getFullYear() } = {}) => {
  const b = body || {};
  if (!UUID.test(String(b.batchId || ''))) throw new BatchError('batchId invalide');
  if (!Array.isArray(b.lines) || b.lines.length === 0 || b.lines.length > MAX_LINES) {
    throw new BatchError(`Une rafale contient entre 1 et ${MAX_LINES} lignes`);
  }
  const lines = [];
  const errors = [];
  b.lines.forEach((raw, i) => {
    const { line, error } = toLine(raw, i, currentYear);
    if (error) errors.push(error);
    else lines.push(line);
  });
  if (errors.length) throw new BatchError('Rafale invalide', errors);
  return { batchId: String(b.batchId).toLowerCase(), occasion: text(b.occasion, 120), lines };
};
