import { Router } from 'express';
import { pool } from '../db.js';
import { serializeWine } from '../utils/wine.js';

const router = Router();

// ========== WINES ENDPOINTS ==========

router.get('/wines', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        w.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'wine_id', b.wine_id,
              'location', b.location,
              'added_by_user_id', b.added_by_user_id,
              'purchase_date', b.purchase_date,
              'is_consumed', b.is_consumed,
              'consumed_date', b.consumed_date,
              'gifted_to', b.gifted_to,
              'gift_occasion', b.gift_occasion,
              'purchase_price', b.purchase_price,
              'created_at', b.created_at
            ) ORDER BY b.created_at
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as bottles
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);
    res.json(result.rows.map(serializeWine));
  } catch (error) {
    console.error('Error fetching wines:', error);
    res.status(500).json({ error: 'Failed to fetch wines' });
  }
});

router.get('/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        w.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'wine_id', b.wine_id,
              'location', b.location,
              'added_by_user_id', b.added_by_user_id,
              'purchase_date', b.purchase_date,
              'is_consumed', b.is_consumed,
              'consumed_date', b.consumed_date,
              'gifted_to', b.gifted_to,
              'gift_occasion', b.gift_occasion,
              'purchase_price', b.purchase_price,
              'created_at', b.created_at
            ) ORDER BY b.created_at
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) as bottles
      FROM wines w
      LEFT JOIN bottles b ON w.id = b.wine_id
      WHERE w.id = $1
      GROUP BY w.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json(serializeWine(result.rows[0]));
  } catch (error) {
    console.error('Error fetching wine:', error);
    res.status(500).json({ error: 'Failed to fetch wine' });
  }
});

// Champs modifiables d'un vin : clé de l'API → colonne.
const WRITABLE_FIELDS = {
  name: 'name', cuvee: 'cuvee', parcel: 'parcel', producer: 'producer', vintage: 'vintage',
  region: 'region', appellation: 'appellation', country: 'country', type: 'type',
  grapeVarieties: 'grape_varieties', format: 'format', personalNotes: 'personal_notes',
  sensoryDescription: 'sensory_description', aromaProfile: 'aroma_profile',
  tastingNotes: 'tasting_notes', suggestedFoodPairings: 'suggested_food_pairings',
  producerHistory: 'producer_history', enrichedByAi: 'enriched_by_ai',
  aiConfidence: 'ai_confidence', isFavorite: 'is_favorite', sensoryProfile: 'sensory_profile',
};

// « null » / « undefined » en texte (IA, formulaires) → vraie valeur NULL.
const clean = (value) => (typeof value === 'string' && ['null', 'undefined', 'nan'].includes(value.trim().toLowerCase()) ? null : value);

router.post('/wines', async (req, res) => {
  try {
    const wine = req.body;
    const keys = Object.keys(WRITABLE_FIELDS);
    const result = await pool.query(`
      INSERT INTO wines (${keys.map((k) => WRITABLE_FIELDS[k]).join(', ')})
      VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
      RETURNING *
    `, keys.map((k) => clean(wine[k])));
    res.status(201).json(serializeWine(result.rows[0]));
  } catch (error) {
    console.error('Error creating wine:', error);
    res.status(500).json({ error: 'Failed to create wine' });
  }
});

// Mise à jour partielle : seuls les champs présents dans le corps sont modifiés
// (toggleFavorite n'envoie que { isFavorite }).
router.put('/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', async (req, res) => {
  try {
    const { id } = req.params;
    const wine = req.body || {};
    const keys = Object.keys(WRITABLE_FIELDS).filter((k) => Object.prototype.hasOwnProperty.call(wine, k));
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No updatable field provided' });
    }
    const result = await pool.query(`
      UPDATE wines SET
        ${keys.map((k, i) => `${WRITABLE_FIELDS[k]} = $${i + 1}`).join(', ')}, updated_at = NOW()
      WHERE id = $${keys.length + 1}
      RETURNING *
    `, [...keys.map((k) => clean(wine[k])), id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }

    res.json(serializeWine(result.rows[0]));
  } catch (error) {
    console.error('Error updating wine:', error);
    res.status(500).json({ error: 'Failed to update wine' });
  }
});

router.delete('/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM wines WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting wine:', error);
    res.status(500).json({ error: 'Failed to delete wine' });
  }
});

export default router;
