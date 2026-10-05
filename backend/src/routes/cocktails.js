import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

const router = Router();

// ========== COCKTAILS ENDPOINTS ==========

// Champs d'une recette : clé de l'API → [colonne, validateur].
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
const optString = (v) => v === null || typeof v === 'string';
const FIELDS = {
  name: ['name', (v) => typeof v === 'string' && v.trim() !== ''],
  category: ['category', optString],
  baseSpirit: ['base_spirit', optString],
  ingredients: ['ingredients', (v) => Array.isArray(v) && v.every((i) => i && typeof i === 'object' && !Array.isArray(i))],
  instructions: ['instructions', isStringArray],
  glassType: ['glass_type', optString],
  difficulty: ['difficulty', optString],
  prepTime: ['prep_time', (v) => v === null || (Number.isFinite(v) && v >= 0)],
  imageUrl: ['image_url', optString],
  source: ['source', optString],
  tags: ['tags', Array.isArray],
  isFavorite: ['is_favorite', (v) => typeof v === 'boolean'],
};

// Corps → { keys, values } des champs présents, ou { error }.
const readFields = (body) => {
  const keys = Object.keys(FIELDS).filter((k) => body[k] !== undefined);
  const invalid = keys.filter((k) => !FIELDS[k][1](body[k]));
  if (invalid.length) return { error: `Invalid field(s): ${invalid.join(', ')}` };
  const values = keys.map((k) => {
    // jsonb : sérialisé à la main, sinon pg enverrait un tableau Postgres.
    if (k === 'ingredients') return JSON.stringify(body[k]);
    if (k === 'prepTime') return body[k] === null ? null : Math.round(body[k]);
    // TheCocktailDB peut renvoyer une catégorie nulle (tags: [null]).
    if (k === 'tags') return body[k].filter((t) => typeof t === 'string' && t !== '');
    return body[k];
  });
  return { keys, values };
};

const serialize = (row) => convertKeysToCamelCase(row);

router.get('/cocktails', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cocktails ORDER BY lower(name), created_at');
    res.json(result.rows.map(serialize));
  } catch (error) {
    console.error('Error fetching cocktails:', error);
    res.status(500).json({ error: 'Failed to fetch cocktails' });
  }
});

// Création, ou mise à jour si l'id existe déjà : enregistrer deux fois la même
// recette (ex. reprise du localStorage, double clic) ne crée pas de doublon.
router.post('/cocktails', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.id !== undefined && (typeof body.id !== 'string' || body.id.trim() === '' || body.id.length > 200)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { keys, values, error } = readFields(body);
    if (error) return res.status(400).json({ error });
    if (!keys.includes('name')) return res.status(400).json({ error: 'name is required' });

    const cols = keys.map((k) => FIELDS[k][0]);
    const params = [...values];
    if (body.id !== undefined) { cols.unshift('id'); params.unshift(body.id); }
    const result = await pool.query(`
      INSERT INTO cocktails (${cols.join(', ')})
      VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (id) DO UPDATE SET
        ${keys.map((k) => `${FIELDS[k][0]} = EXCLUDED.${FIELDS[k][0]}`).join(', ')},
        updated_at = now()
      RETURNING *, (xmax = 0) AS inserted
    `, params);
    const { inserted, ...row } = result.rows[0];
    res.status(inserted ? 201 : 200).json(serialize(row));
  } catch (error) {
    console.error('Error saving cocktail:', error);
    res.status(500).json({ error: 'Failed to save cocktail' });
  }
});

// Mise à jour partielle : seuls les champs présents dans le corps sont modifiés.
router.put('/cocktails/:id', async (req, res) => {
  try {
    const { keys, values, error } = readFields(req.body || {});
    if (error) return res.status(400).json({ error });
    if (keys.length === 0) return res.status(400).json({ error: 'No updatable field provided' });
    const result = await pool.query(`
      UPDATE cocktails SET ${keys.map((k, i) => `${FIELDS[k][0]} = $${i + 2}`).join(', ')}, updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [req.params.id, ...values]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cocktail not found' });
    res.json(serialize(result.rows[0]));
  } catch (error) {
    console.error('Error updating cocktail:', error);
    res.status(500).json({ error: 'Failed to update cocktail' });
  }
});

router.delete('/cocktails/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM cocktails WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cocktail not found' });
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error('Error deleting cocktail:', error);
    res.status(500).json({ error: 'Failed to delete cocktail' });
  }
});

export default router;
