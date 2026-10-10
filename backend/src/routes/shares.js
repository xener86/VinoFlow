import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { validateDinner, ShareError, newToken, isUuid } from '../shares/validate.js';

const router = Router();

// ========== PARTAGES (gestion, comptes du foyer) ==========
const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const link = (row) => ({ id: row.id, token: row.token, kind: row.kind, url: `/p/${row.token}` });

const fail = (res, error, label) => {
  if (error instanceof ShareError) return res.status(error.status).json({ error: error.message });
  console.error(label, error);
  return res.status(500).json({ error: 'Le partage a échoué.' });
};

const checkWines = async (db, ids) => {
  const { rows } = await db.query('SELECT id FROM wines WHERE id = ANY($1::uuid[])', [ids]);
  const found = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !found.has(id))) throw new ShareError(400, 'Un des vins n’existe pas (ou plus) dans la cave');
};

const writeItems = async (db, shareId, items) => {
  await db.query('DELETE FROM share_items WHERE share_id = $1', [shareId]);
  for (const [index, item] of items.entries()) {
    await db.query('INSERT INTO share_items (share_id, position, wine_id, dish) VALUES ($1, $2, $3, $4)', [shareId, index + 1, item.wineId, item.dish]);
  }
};

router.get('/shares', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.token, s.kind, s.title, to_char(s.dinner_date, 'YYYY-MM-DD') AS dinner_date, s.created_at, s.revoked_at,
             s.view_count, s.last_viewed_at, w.name AS wine_name, w.vintage AS wine_vintage,
             (SELECT count(*)::int FROM share_items i WHERE i.share_id = s.id) AS item_count
        FROM shares s LEFT JOIN wines w ON w.id = s.wine_id
       ORDER BY s.created_at DESC`);
    return res.json(rows.map((r) => ({
      id: r.id, token: r.token, kind: r.kind, title: r.title, dinnerDate: r.dinner_date, wineName: r.wine_name,
      wineVintage: r.wine_vintage, itemCount: r.item_count, createdAt: r.created_at, revokedAt: r.revoked_at,
      viewCount: r.view_count, lastViewedAt: r.last_viewed_at,
    })));
  } catch (error) {
    return fail(res, error, 'List shares error:');
  }
});

router.get(`/shares/:id(${ID})`, async (req, res) => {
  try {
    const { rows: [s] } = await pool.query(
      `SELECT id, token, kind, title, to_char(dinner_date, 'YYYY-MM-DD') AS dinner_date, revoked_at FROM shares WHERE id = $1`,
      [req.params.id],
    );
    if (!s || s.kind !== 'DINNER') return res.status(404).json({ error: 'Carte introuvable' });
    const { rows: items } = await pool.query(
      `SELECT i.wine_id, i.dish, w.name, w.producer, w.vintage FROM share_items i JOIN wines w ON w.id = i.wine_id
        WHERE i.share_id = $1 ORDER BY i.position`,
      [s.id],
    );
    return res.json({
      id: s.id, token: s.token, title: s.title, dinnerDate: s.dinner_date, revokedAt: s.revoked_at,
      items: items.map((i) => ({ wineId: i.wine_id, dish: i.dish, name: i.name, producer: i.producer, vintage: i.vintage })),
    });
  } catch (error) {
    return fail(res, error, 'Get share error:');
  }
});

router.post('/shares', async (req, res) => {
  try {
    const body = req.body || {};
    const userId = req.user?.userId ?? null;
    if (body.kind === 'WINE') {
      if (!isUuid(body.wineId)) throw new ShareError(400, 'Vin invalide');
      const wineId = String(body.wineId).toLowerCase();
      // Verrou sur le vin : deux clics simultanés donnent un seul lien.
      const { row, created } = await withTransaction(async (db) => {
        const { rows: [wine] } = await db.query('SELECT id FROM wines WHERE id = $1 FOR UPDATE', [wineId]);
        if (!wine) throw new ShareError(404, 'Vin introuvable');
        const { rows: [existing] } = await db.query(
          `SELECT id, token, kind FROM shares WHERE kind = 'WINE' AND wine_id = $1 AND revoked_at IS NULL`, [wineId],
        );
        if (existing) return { row: existing, created: false };
        const { rows: [inserted] } = await db.query(
          `INSERT INTO shares (token, kind, wine_id, created_by) VALUES ($1, 'WINE', $2, $3) RETURNING id, token, kind`,
          [newToken(), wineId, userId],
        );
        return { row: inserted, created: true };
      });
      return res.status(created ? 201 : 200).json(link(row));
    }
    if (body.kind === 'DINNER') {
      const dinner = validateDinner(body);
      const row = await withTransaction(async (db) => {
        await checkWines(db, dinner.items.map((i) => i.wineId));
        const { rows: [share] } = await db.query(
          `INSERT INTO shares (token, kind, title, dinner_date, created_by) VALUES ($1, 'DINNER', $2, $3, $4) RETURNING id, token, kind`,
          [newToken(), dinner.title, dinner.date, userId],
        );
        await writeItems(db, share.id, dinner.items);
        return share;
      });
      return res.status(201).json(link(row));
    }
    throw new ShareError(400, 'Type de partage inconnu');
  } catch (error) {
    return fail(res, error, 'Create share error:');
  }
});

router.put(`/shares/:id(${ID})`, async (req, res) => {
  try {
    const dinner = validateDinner(req.body);
    const row = await withTransaction(async (db) => {
      const { rows: [share] } = await db.query('SELECT id, token, kind, revoked_at FROM shares WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!share) throw new ShareError(404, 'Carte introuvable');
      if (share.kind !== 'DINNER') throw new ShareError(400, 'Seule une carte de dîner se modifie');
      if (share.revoked_at) throw new ShareError(409, 'Ce lien a été révoqué : crée une nouvelle carte.');
      await checkWines(db, dinner.items.map((i) => i.wineId));
      await db.query('UPDATE shares SET title = $1, dinner_date = $2 WHERE id = $3', [dinner.title, dinner.date, share.id]);
      await writeItems(db, share.id, dinner.items);
      return share;
    });
    return res.json(link(row));
  } catch (error) {
    return fail(res, error, 'Update share error:');
  }
});

router.post(`/shares/:id(${ID})/revoke`, async (req, res) => {
  try {
    const { rows: [share] } = await pool.query(
      'UPDATE shares SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING id, token, kind, revoked_at',
      [req.params.id],
    );
    if (!share) return res.status(404).json({ error: 'Lien introuvable' });
    return res.json({ ...link(share), revokedAt: share.revoked_at });
  } catch (error) {
    return fail(res, error, 'Revoke share error:');
  }
});

export default router;
