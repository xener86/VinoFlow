import { pool, withTransaction } from '../db.js';
import { newShareToken } from './token.js';
import { ShareError } from './validate.js';

// dinner_date est un DATE : on le lit en texte pour ne pas subir le fuseau du
// process Node (pg le convertirait en Date à minuit local).
const DATE_TEXT = "to_char(s.dinner_date, 'YYYY-MM-DD') AS dinner_date";

export const listShares = async () => {
  const { rows } = await pool.query(`
    SELECT s.id, s.token, s.kind, s.title, ${DATE_TEXT},
           w.name AS wine_name, w.vintage AS wine_vintage,
           (SELECT count(*)::int FROM share_items si WHERE si.share_id = s.id) AS item_count,
           s.created_at, s.revoked_at, s.view_count, s.last_viewed_at
    FROM shares s
    LEFT JOIN wines w ON w.id = s.wine_id
    ORDER BY s.created_at DESC, s.id DESC`);
  return rows;
};

export const getShareForEditor = async (id) => {
  const { rows } = await pool.query(`SELECT s.id, s.token, s.kind, s.title, ${DATE_TEXT}, s.revoked_at FROM shares s WHERE s.id = $1`, [id]);
  if (!rows[0]) return null;
  const items = (await pool.query(`
    SELECT si.wine_id, si.dish, w.name, w.producer, w.vintage
    FROM share_items si JOIN wines w ON w.id = si.wine_id
    WHERE si.share_id = $1 ORDER BY si.position`, [id])).rows;
  return { ...rows[0], items };
};

export const wineExists = async (wineId) => (await pool.query('SELECT 1 FROM wines WHERE id = $1', [wineId])).rowCount === 1;

const assertWinesExist = async (client, wineIds) => {
  const { rows } = await client.query('SELECT id FROM wines WHERE id = ANY($1::uuid[])', [wineIds]);
  const found = new Set(rows.map((r) => r.id));
  if (wineIds.some((id) => !found.has(id))) throw new ShareError(400, 'Un des vins n’existe plus dans la cave.');
};

export const findActiveWineShare = async (wineId) => {
  const { rows } = await pool.query(
    `SELECT id, token, kind FROM shares WHERE kind = 'WINE' AND wine_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [wineId]
  );
  return rows[0] ?? null;
};

export const createWineShare = async (wineId, userId) => {
  const { rows } = await pool.query(
    `INSERT INTO shares (token, kind, wine_id, created_by) VALUES ($1, 'WINE', $2, $3) RETURNING id, token, kind`,
    [newShareToken(), wineId, userId]
  );
  return rows[0];
};

const insertItems = async (client, shareId, items) => {
  for (const [i, item] of items.entries()) {
    await client.query('INSERT INTO share_items (share_id, position, wine_id, dish) VALUES ($1, $2, $3, $4)', [shareId, i + 1, item.wineId, item.dish]);
  }
};

export const createDinnerShare = (dinner, userId) =>
  withTransaction(async (client) => {
    await assertWinesExist(client, dinner.items.map((i) => i.wineId));
    const { rows } = await client.query(
      `INSERT INTO shares (token, kind, title, dinner_date, created_by) VALUES ($1, 'DINNER', $2, $3, $4) RETURNING id, token, kind`,
      [newShareToken(), dinner.title, dinner.date, userId]
    );
    await insertItems(client, rows[0].id, dinner.items);
    return rows[0];
  });

// Le jeton ne change pas : le lien déjà envoyé montre la carte corrigée.
export const updateDinnerShare = (id, dinner) =>
  withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id, token, kind, revoked_at FROM shares WHERE id = $1 FOR UPDATE', [id]);
    const share = rows[0];
    if (!share) throw new ShareError(404, 'Carte introuvable.');
    if (share.kind !== 'DINNER') throw new ShareError(400, 'Ce lien est une fiche vin, pas une carte.');
    if (share.revoked_at) throw new ShareError(409, 'Ce lien a été révoqué ; crée une nouvelle carte.');
    await assertWinesExist(client, dinner.items.map((i) => i.wineId));
    await client.query('UPDATE shares SET title = $2, dinner_date = $3 WHERE id = $1', [id, dinner.title, dinner.date]);
    await client.query('DELETE FROM share_items WHERE share_id = $1', [id]);
    await insertItems(client, id, dinner.items);
    return { id: share.id, token: share.token, kind: share.kind };
  });

// Définitif et idempotent : une seconde révocation garde la première date.
export const revokeShare = async (id) => {
  const { rows } = await pool.query('UPDATE shares SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING id, revoked_at', [id]);
  return rows[0] ?? null;
};

// Lecture publique : jeton actif → compteur +1 et données brutes (filtrées
// ensuite par toPublicShare) ; sinon null (inconnu ou révoqué, indistincts).
export const loadPublicShare = async (token) => {
  const { rows } = await pool.query(
    `UPDATE shares s SET view_count = view_count + 1, last_viewed_at = now()
     WHERE s.token = $1 AND s.revoked_at IS NULL
     RETURNING s.id, s.kind, s.title, ${DATE_TEXT}, s.wine_id`,
    [token]
  );
  const share = rows[0];
  if (!share) return null;
  const items = share.kind === 'WINE'
    ? [{ position: 1, wine_id: share.wine_id, dish: null }]
    : (await pool.query('SELECT position, wine_id, dish FROM share_items WHERE share_id = $1 ORDER BY position', [share.id])).rows;
  const wineIds = items.map((i) => i.wine_id);
  const wines = (await pool.query(
    `SELECT id, name, cuvee, producer, vintage, type, appellation, region, country,
            grape_varieties, sensory_description, aroma_profile, suggested_food_pairings
     FROM wines WHERE id = ANY($1::uuid[])`,
    [wineIds]
  )).rows;
  const tastings = (await pool.query(
    'SELECT wine_id, date, overall_rating, general_notes FROM tasting_notes WHERE wine_id = ANY($1::uuid[])',
    [wineIds]
  )).rows;
  return { share, items, wines, tastings };
};
