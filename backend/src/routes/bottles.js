import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

const router = Router();

// ========== BOTTLES ENDPOINTS ==========

router.get('/bottles', async (req, res) => {
  try {
    const { wineId } = req.query;
    const query = wineId
      ? 'SELECT * FROM bottles WHERE wine_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM bottles ORDER BY created_at DESC';
    const params = wineId ? [wineId] : [];
    const result = await pool.query(query, params);
    const bottles = convertKeysToCamelCase(result.rows).map(b => {
      // Normalize legacy {"label": "..."} locations to plain strings
      if (b.location && typeof b.location === 'object' && 'label' in b.location && !('rackId' in b.location)) {
        b.location = b.location.label;
      }
      return b;
    });
    res.json(bottles);
  } catch (error) {
    console.error('Error fetching bottles:', error);
    res.status(500).json({ error: 'Failed to fetch bottles' });
  }
});

router.post('/bottles', async (req, res) => {
  try {
    const bottle = req.body;
    
    // Store string locations as JSON strings (not objects like {"label": "..."})
    let locationValue = bottle.location;
    if (!locationValue) locationValue = 'Non trié';
    const locationJson = typeof locationValue === 'string'
      ? JSON.stringify(locationValue)   // e.g. '"Non trié"' — valid jsonb string
      : JSON.stringify(locationValue);  // e.g. '{"rackId":"...","x":0,"y":0}'

    const result = await pool.query(`
      INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_date, is_consumed, purchase_price)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      bottle.wineId ?? bottle.wine_id,
      locationJson,
      bottle.addedByUserId ?? bottle.added_by_user_id,
      bottle.purchaseDate ?? bottle.purchase_date,
      bottle.isConsumed ?? bottle.is_consumed ?? false,
      bottle.purchasePrice ?? bottle.purchase_price ?? null
    ]);
    
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating bottle:', error);
    res.status(500).json({ error: 'Failed to create bottle' });
  }
});

router.put('/bottles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build a dynamic partial UPDATE based on which fields the client sent.
    // This lets clients explicitly set fields to null (clearing them) while
    // leaving untouched fields alone.
    const fields = [];
    const values = [id];
    let i = 2;
    const add = (col, val) => { fields.push(`${col} = $${i++}`); values.push(val); };

    if ('location' in updates) {
      const locValue = updates.location ?? 'Non trié';
      add('location', JSON.stringify(locValue));
    }
    if ('isConsumed' in updates) add('is_consumed', updates.isConsumed);
    if ('consumedDate' in updates) add('consumed_date', updates.consumedDate);
    if ('giftedTo' in updates) add('gifted_to', updates.giftedTo);
    if ('giftOccasion' in updates) add('gift_occasion', updates.giftOccasion);
    if ('purchasePrice' in updates) add('purchase_price', updates.purchasePrice);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const result = await pool.query(
      `UPDATE bottles SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating bottle:', error);
    res.status(500).json({ error: 'Failed to update bottle' });
  }
});

router.delete('/bottles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM bottles WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bottle not found' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting bottle:', error);
    res.status(500).json({ error: 'Failed to delete bottle' });
  }
});

export default router;
