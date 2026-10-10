import { randomBytes } from 'node:crypto';

// Partages : validation d'une carte de dîner, jetons d'accès public.

export class ShareError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ITEMS = 20;

/** Jeton d'accès public : 256 bits aléatoires, en base64url (43 caractères). */
export const newToken = () => randomBytes(32).toString('base64url');
export const isToken = (value) => /^[A-Za-z0-9_-]{43}$/.test(String(value ?? ''));
export const isUuid = (value) => UUID.test(String(value ?? ''));

export const validateDinner = (body) => {
  const b = body || {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > 120) throw new ShareError(400, 'Titre obligatoire (120 caractères au plus)');
  let date = null;
  if (b.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(Date.parse(`${b.date}T00:00:00Z`))) {
      throw new ShareError(400, 'Date invalide (AAAA-MM-JJ)');
    }
    date = b.date;
  }
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) {
    throw new ShareError(400, `Une carte contient entre 1 et ${MAX_ITEMS} vins`);
  }
  const items = b.items.map((item) => {
    if (!isUuid(item?.wineId)) throw new ShareError(400, 'Vin invalide');
    const dish = typeof item.dish === 'string' ? item.dish.trim() : '';
    if (dish.length > 200) throw new ShareError(400, '« Servi avec » : 200 caractères au plus');
    return { wineId: String(item.wineId).toLowerCase(), dish: dish || null };
  });
  return { title, date, items };
};
