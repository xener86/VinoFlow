// Validation des cartes de dîner : messages en français, statut HTTP porté
// par l'erreur (400 corps invalide, 404 inconnu, 409 révoqué).
export class ShareError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

export const MAX_ITEMS = 20;
export const MAX_TITLE = 120;
export const MAX_DISH = 200;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// « 2026-02-30 » passe la regex mais pas le calendrier : on reconstruit la
// date en UTC et on vérifie qu'elle n'a pas glissé (sinon Postgres renverrait
// une erreur 500 peu lisible).
const isCalendarDate = (value) => {
  const m = typeof value === 'string' ? DATE_RE.exec(value) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
};

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

export const validateDinner = (body) => {
  const title = cleanText(body?.title);
  if (!title) throw new ShareError(400, 'Donne un titre à la carte.');
  if (title.length > MAX_TITLE) throw new ShareError(400, `Le titre ne doit pas dépasser ${MAX_TITLE} caractères.`);

  let date = null;
  if (body?.date !== undefined && body?.date !== null && body?.date !== '') {
    if (!isCalendarDate(body.date)) throw new ShareError(400, 'La date doit être au format AAAA-MM-JJ.');
    date = body.date;
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length < 1) throw new ShareError(400, 'Ajoute au moins un vin à la carte.');
  if (rawItems.length > MAX_ITEMS) throw new ShareError(400, `Une carte compte au plus ${MAX_ITEMS} vins.`);

  const items = rawItems.map((item, i) => {
    if (!isUuid(item?.wineId)) throw new ShareError(400, `Vin n°${i + 1} invalide.`);
    const dish = cleanText(item.dish);
    if (dish.length > MAX_DISH) throw new ShareError(400, `Le plat du vin n°${i + 1} ne doit pas dépasser ${MAX_DISH} caractères.`);
    return { wineId: item.wineId, dish: dish || null };
  });

  return { title, date, items };
};
