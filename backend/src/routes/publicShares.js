import { Router } from 'express';
import { pool } from '../db.js';
import { isToken } from '../shares/validate.js';
import { toPublicShare } from '../shares/publicView.js';

const router = Router();

// ========== PARTAGE PUBLIC (sans compte) ==========
// Seule route ouverte sans authentification. Lien inconnu, mal formé ou
// révoqué : même réponse, pour ne rien révéler. Le jeton n'est jamais journalisé.
const GONE = { error: 'Ce lien n’est plus actif.' };
const WINE_COLUMNS = `w.id, w.name, w.cuvee, w.producer, w.vintage, w.type, w.appellation, w.region, w.country,
  w.grape_varieties, w.sensory_description, w.aroma_profile, w.suggested_food_pairings`;

router.get('/shares/:token', async (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  try {
    if (!isToken(req.params.token)) return res.status(404).json(GONE);
    const { rows: [share] } = await pool.query(
      `UPDATE shares SET view_count = view_count + 1, last_viewed_at = now()
        WHERE token = $1 AND revoked_at IS NULL
        RETURNING id, kind, title, to_char(dinner_date, 'YYYY-MM-DD') AS dinner_date, wine_id`,
      [req.params.token],
    );
    if (!share) return res.status(404).json(GONE);
    const { rows: wines } = share.kind === 'WINE'
      ? await pool.query(`SELECT NULL AS dish, ${WINE_COLUMNS} FROM wines w WHERE w.id = $1`, [share.wine_id])
      : await pool.query(
        `SELECT i.dish, ${WINE_COLUMNS} FROM share_items i JOIN wines w ON w.id = i.wine_id
          WHERE i.share_id = $1 ORDER BY i.position`,
        [share.id],
      );
    const ids = wines.map((w) => w.id);
    const { rows: tastings } = ids.length
      ? await pool.query('SELECT wine_id, date, overall_rating, general_notes FROM tasting_notes WHERE wine_id = ANY($1::uuid[])', [ids])
      : { rows: [] };
    return res.json(toPublicShare(share, wines.map((w) => ({ dish: w.dish, wine: w, tastings: tastings.filter((t) => t.wine_id === w.id) }))));
  } catch (error) {
    console.error('Public share error:', error.message);
    return res.status(500).json({ error: 'Impossible de charger la carte.' });
  }
});

export default router;
