import { pool } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

// Helper: load full inventory for a user
export const loadInventory = async () => {
  const result = await pool.query(`
    SELECT
      w.*,
      COALESCE(
        (SELECT count(*) FROM bottles b WHERE b.wine_id = w.id AND b.is_consumed = false),
        0
      )::int AS inventory_count
    FROM wines w
    ORDER BY w.created_at DESC
  `);
  return convertKeysToCamelCase(result.rows);
};
