// Two-level cache for the sommelier pipeline (Phase 4.1 + 4.2).
// Backed by the pairing_cache table.
//
// Level 1: dish → criteria        (TTL 30 days, shared across users)
// Level 2: dish + cave_hash → result (per-user, invalidated when cave changes)
//
// cave_hash is a stable hash of (sorted wine ids + version), recomputed on demand.

import crypto from 'crypto';

const TTL_LEVEL1_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TTL_LEVEL2_MS = 24 * 60 * 60 * 1000;      // 24 hours

const normalizeDish = (dish) => String(dish || '').toLowerCase().trim().replace(/\s+/g, ' ');

export const computeCaveHash = (wines) => {
  const ids = wines.map(w => w.id).sort().join('|');
  return crypto.createHash('sha1').update(ids).digest('hex').slice(0, 16);
};

export const getCriteriaCache = async (pool, dish) => {
  const result = await pool.query(`
    SELECT payload FROM pairing_cache
     WHERE dish_normalized = $1
       AND cave_hash IS NULL
       AND user_id IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1
  `, [normalizeDish(dish)]);
  return result.rows[0]?.payload || null;
};

export const setCriteriaCache = async (pool, dish, criteria) => {
  await pool.query(`
    INSERT INTO pairing_cache (dish_normalized, cave_hash, user_id, payload, expires_at)
    VALUES ($1, NULL, NULL, $2, now() + interval '30 days')
    ON CONFLICT DO NOTHING
  `, [normalizeDish(dish), criteria]);
};

export const getResultCache = async (pool, dish, caveHash, userId) => {
  const result = await pool.query(`
    SELECT payload FROM pairing_cache
     WHERE dish_normalized = $1
       AND cave_hash = $2
       AND user_id = $3
       AND (expires_at IS NULL OR expires_at > now())
     LIMIT 1
  `, [normalizeDish(dish), caveHash, userId]);
  return result.rows[0]?.payload || null;
};

export const setResultCache = async (pool, dish, caveHash, userId, payload) => {
  await pool.query(`
    INSERT INTO pairing_cache (dish_normalized, cave_hash, user_id, payload, expires_at)
    VALUES ($1, $2, $3, $4, now() + interval '24 hours')
    ON CONFLICT DO NOTHING
  `, [normalizeDish(dish), caveHash, userId, payload]);
};

export const purgeExpired = async (pool) => {
  await pool.query(`DELETE FROM pairing_cache WHERE expires_at IS NOT NULL AND expires_at < now()`);
};
