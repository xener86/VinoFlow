import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

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
    const wines = convertKeysToCamelCase(result.rows).map(w => ({
      ...w,
      bottles: (w.bottles || []).map(b => {
        // Normalize legacy {"label": "..."} locations to plain strings
        if (b.location && typeof b.location === 'object' && 'label' in b.location && !('rackId' in b.location)) {
          b.location = b.location.label;
        }
        return b;
      })
    }));
    res.json(wines);
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
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error fetching wine:', error);
    res.status(500).json({ error: 'Failed to fetch wine' });
  }
});

router.post('/wines', async (req, res) => {
  try {
    const wine = req.body;
    const result = await pool.query(`
      INSERT INTO wines (
        name, cuvee, parcel, producer, vintage, region, country, type,
        grape_varieties, format, personal_notes, sensory_description,
        aroma_profile, tasting_notes, suggested_food_pairings,
        producer_history, enriched_by_ai, ai_confidence, is_favorite, sensory_profile
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      wine.name, wine.cuvee, wine.parcel, wine.producer, wine.vintage,
      wine.region, wine.country, wine.type, wine.grapeVarieties, wine.format,
      wine.personalNotes, wine.sensoryDescription, wine.aromaProfile,
      wine.tastingNotes, wine.suggestedFoodPairings, wine.producerHistory,
      wine.enrichedByAi, wine.aiConfidence, wine.isFavorite, wine.sensoryProfile
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating wine:', error);
    res.status(500).json({ error: 'Failed to create wine' });
  }
});

router.put('/wines/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', async (req, res) => {
  try {
    const { id } = req.params;
    const wine = req.body;
    const result = await pool.query(`
      UPDATE wines SET
        name = $1, cuvee = $2, parcel = $3, producer = $4, vintage = $5,
        region = $6, country = $7, type = $8, grape_varieties = $9, format = $10,
        personal_notes = $11, sensory_description = $12, aroma_profile = $13,
        tasting_notes = $14, suggested_food_pairings = $15, producer_history = $16,
        enriched_by_ai = $17, ai_confidence = $18, is_favorite = $19,
        sensory_profile = $20, updated_at = NOW()
      WHERE id = $21
      RETURNING *
    `, [
      wine.name, wine.cuvee, wine.parcel, wine.producer, wine.vintage,
      wine.region, wine.country, wine.type, wine.grapeVarieties, wine.format,
      wine.personalNotes, wine.sensoryDescription, wine.aromaProfile,
      wine.tastingNotes, wine.suggestedFoodPairings, wine.producerHistory,
      wine.enrichedByAi, wine.aiConfidence, wine.isFavorite, wine.sensoryProfile, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Wine not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
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
