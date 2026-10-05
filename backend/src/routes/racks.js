import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

const router = Router();

// ========== RACKS ENDPOINTS ==========

router.get('/racks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM racks ORDER BY sort_order ASC, created_at ASC');
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching racks:', error);
    res.status(500).json({ error: 'Failed to fetch racks' });
  }
});

router.post('/racks', async (req, res) => {
  try {
    const rack = req.body;
    const result = await pool.query(`
      INSERT INTO racks (name, width, height, type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [rack.name, rack.width, rack.height, rack.type]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating rack:', error);
    res.status(500).json({ error: 'Failed to create rack' });
  }
});

router.put('/racks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const fields = [];
    const values = [id];
    let i = 2;
    const add = (col, val) => { fields.push(`${col} = $${i++}`); values.push(val); };
    if ('name' in updates) add('name', updates.name);
    if ('width' in updates) add('width', updates.width);
    if ('height' in updates) add('height', updates.height);
    if ('type' in updates) add('type', updates.type);
    if ('sortOrder' in updates) add('sort_order', updates.sortOrder);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const result = await pool.query(
      `UPDATE racks SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rack not found' });
    }
    res.json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error updating rack:', error);
    res.status(500).json({ error: 'Failed to update rack' });
  }
});

router.post('/racks/reorder', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rackIds } = req.body;
    if (!Array.isArray(rackIds)) {
      return res.status(400).json({ error: 'rackIds must be an array' });
    }
    await client.query('BEGIN');
    for (let i = 0; i < rackIds.length; i++) {
      await client.query('UPDATE racks SET sort_order = $1 WHERE id = $2', [i, rackIds[i]]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reordering racks:', error);
    res.status(500).json({ error: 'Failed to reorder racks' });
  } finally {
    client.release();
  }
});

router.delete('/racks/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    // Migrate bottles from this rack to "Non trié" before deleting
    await client.query(
      `UPDATE bottles SET location = '"Non trié"'::jsonb WHERE location->>'rackId' = $1 AND is_consumed = false`,
      [id]
    );
    const result = await client.query('DELETE FROM racks WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rack not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting rack:', error);
    res.status(500).json({ error: 'Failed to delete rack' });
  } finally {
    client.release();
  }
});

export default router;
