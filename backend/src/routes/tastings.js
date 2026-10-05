import { Router } from 'express';
import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

const router = Router();

// ========== TASTING NOTES ENDPOINTS ==========

router.get('/tasting-notes', async (req, res) => {
  try {
    const { wineId } = req.query;
    const query = wineId
      ? 'SELECT * FROM tasting_notes WHERE wine_id = $1 ORDER BY date DESC'
      : 'SELECT * FROM tasting_notes ORDER BY date DESC';
    const params = wineId ? [wineId] : [];
    const result = await pool.query(query, params);
    res.json(convertKeysToCamelCase(result.rows));
  } catch (error) {
    console.error('Error fetching tasting notes:', error);
    res.status(500).json({ error: 'Failed to fetch tasting notes' });
  }
});

router.post('/tasting-notes', async (req, res) => {
  try {
    const note = req.body;
    const result = await pool.query(`
      INSERT INTO tasting_notes (
        wine_id, date, overall_rating, visual_notes, nose_notes, palate_notes,
        general_notes, occasion, companions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      note.wineId, note.date || new Date().toISOString(),
      note.overallRating ?? null,
      note.visualNotes ?? null,
      note.noseNotes ?? null,
      note.palateNotes ?? null,
      note.generalNotes ?? null,
      note.occasion ?? null,
      note.companions ?? null
    ]);
    res.status(201).json(convertKeysToCamelCase(result.rows[0]));
  } catch (error) {
    console.error('Error creating tasting note:', error);
    res.status(500).json({ error: 'Failed to create tasting note' });
  }
});

router.delete('/tasting-notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasting_notes WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tasting note not found' });
    }
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting tasting note:', error);
    res.status(500).json({ error: 'Failed to delete tasting note' });
  }
});

export default router;
