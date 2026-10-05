import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

const router = Router();

// ========== WISHLIST ENDPOINTS ==========

router.get('/wishlist', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wishlist ORDER BY added_at DESC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ error: 'Failed to fetch wishlist' });
  }
});

router.post('/wishlist', async (req, res) => {
  try {
    const item = req.body;
    const result = await pool.query(`
      INSERT INTO wishlist (name, producer, region, appellation, type, vintage, notes, source, estimated_price, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      item.name, item.producer || null, item.region || null, item.appellation || null,
      item.type || null, item.vintage || null, item.notes || null, item.source || null,
      item.estimatedPrice ?? item.estimated_price ?? null, item.priority || 'MEDIUM'
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating wishlist item:', error);
    res.status(500).json({ error: 'Failed to create wishlist item' });
  }
});

router.delete('/wishlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM wishlist WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting wishlist item:', error);
    res.status(500).json({ error: 'Failed to delete wishlist item' });
  }
});

export default router;
