import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

const router = Router();

// ========== SPIRITS ENDPOINTS ==========

router.get('/spirits', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM spirits ORDER BY added_at DESC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching spirits:', error);
    res.status(500).json({ error: 'Failed to fetch spirits' });
  }
});

router.get('/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM spirits WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error fetching spirit:', error);
    res.status(500).json({ error: 'Failed to fetch spirit' });
  }
});

router.post('/spirits', async (req, res) => {
  try {
    const spirit = req.body;
    const result = await pool.query(`
      INSERT INTO spirits (
        name, category, distillery, region, country, age, cask_type, abv, format,
        description, producer_history, tasting_notes, aroma_profile,
        suggested_cocktails, culinary_pairings, enriched_by_ai, is_opened,
        inventory_level, is_luxury
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      spirit.name, spirit.category, spirit.distillery, spirit.region, spirit.country,
      spirit.age, spirit.caskType, spirit.abv, spirit.format, spirit.description,
      spirit.producerHistory, spirit.tastingNotes, spirit.aromaProfile,
      spirit.suggestedCocktails, spirit.culinaryPairings, spirit.enrichedByAi,
      spirit.isOpened, spirit.inventoryLevel, spirit.isLuxury
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating spirit:', error);
    res.status(500).json({ error: 'Failed to create spirit' });
  }
});

router.put('/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const spirit = req.body;
    const result = await pool.query(`
      UPDATE spirits SET
        name = $1, category = $2, distillery = $3, region = $4, country = $5,
        age = $6, cask_type = $7, abv = $8, format = $9, description = $10,
        producer_history = $11, tasting_notes = $12, aroma_profile = $13,
        suggested_cocktails = $14, culinary_pairings = $15, enriched_by_ai = $16,
        is_opened = $17, inventory_level = $18, is_luxury = $19
      WHERE id = $20
      RETURNING *
    `, [
      spirit.name, spirit.category, spirit.distillery, spirit.region, spirit.country,
      spirit.age, spirit.caskType, spirit.abv, spirit.format, spirit.description,
      spirit.producerHistory, spirit.tastingNotes, spirit.aromaProfile,
      spirit.suggestedCocktails, spirit.culinaryPairings, spirit.enrichedByAi,
      spirit.isOpened, spirit.inventoryLevel, spirit.isLuxury, id
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating spirit:', error);
    res.status(500).json({ error: 'Failed to update spirit' });
  }
});

router.delete('/spirits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM spirits WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spirit not found' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting spirit:', error);
    res.status(500).json({ error: 'Failed to delete spirit' });
  }
});

export default router;
