import { Router } from 'express';
import { pushToday } from '../menuflow/sync.js';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

const router = Router();

// ========== HISTORY/JOURNAL ENDPOINTS ==========

router.get('/history', async (req, res) => {
  try {
    const { wineId } = req.query;
    let query = 'SELECT * FROM journal';
    const params = [];
    if (wineId) {
      query += ' WHERE wine_id = $1';
      params.push(wineId);
    }
    query += ' ORDER BY date DESC';
    const result = await pool.query(query, params);
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.post('/history', async (req, res) => {
  try {
    const entry = req.body;
    // ID is always server-generated (gen_random_uuid default) to prevent
    // clients from spoofing or colliding IDs.
    const forDinner = typeof entry.forDinner === 'boolean' ? entry.forDinner : null;
    const result = await pool.query(`
      INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, from_location, to_location, recipient, occasion, note, user_id, for_dinner)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      entry.date || new Date().toISOString(),
      entry.type || 'NOTE',
      entry.wineId || entry.wine_id || null,
      entry.wineName || entry.wine_name || 'Vin inconnu',
      entry.wineVintage || entry.wine_vintage || null,
      entry.quantity || null,
      entry.description || null,
      entry.fromLocation || entry.from_location || null,
      entry.toLocation || entry.to_location || null,
      entry.recipient || null,
      entry.occasion || null,
      entry.note || null,
      entry.userId || entry.user_id || null,
      forDinner,
    ]);
    if (result.rows[0].type === 'OUT') pushToday().catch(() => {}); // MenuFlow à jour sans attendre le tick
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating history:', error);
    res.status(500).json({ error: 'Failed to create history entry' });
  }
});

export default router;
