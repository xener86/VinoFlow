// Persistent per-user taste profile (Phase 2.10).
//
// Updated automatically whenever a user gives feedback on a sommelier
// suggestion. Tracks preferences across regions, grapes, body, oak, sweetness,
// alcohol — derived from the wines they liked vs disliked.

const DEFAULT_PROFILE = () => ({
  regions: {},          // region → score (positive = liked)
  grapes: {},
  types: {},
  body_pref: 50,        // running average for liked wines (0..100)
  acidity_pref: 50,
  tannin_pref: 50,
  sweetness_pref: 30,
  alcohol_pref: 50,
  feedback_count: 0,
  last_updated: null,
});

const adjustMap = (map, key, delta) => {
  if (!key) return map;
  map[key] = (map[key] || 0) + delta;
  return map;
};

/**
 * Apply a feedback (UP/DOWN) to a profile and return a new profile.
 */
export const applyFeedback = (profile, wine, rating) => {
  const next = { ...DEFAULT_PROFILE(), ...(profile || {}) };
  const delta = rating === 'UP' ? 1 : -1;

  if (wine.region) adjustMap(next.regions = { ...next.regions }, wine.region, delta);
  if (wine.type) adjustMap(next.types = { ...next.types }, wine.type, delta);
  (wine.grapeVarieties || wine.grape_varieties || []).forEach(g => {
    next.grapes = { ...next.grapes };
    adjustMap(next.grapes, g, delta);
  });

  // Running average toward liked wines for sensory dimensions
  const sp = wine.sensoryProfile || wine.sensory_profile;
  if (sp && rating === 'UP') {
    const n = next.feedback_count + 1;
    ['body', 'acidity', 'tannin', 'sweetness', 'alcohol'].forEach(d => {
      const key = `${d}_pref`;
      const current = next[key] ?? 50;
      const value = sp[d] ?? 50;
      next[key] = (current * (n - 1) + value) / n;
    });
  }

  next.feedback_count += 1;
  next.last_updated = new Date().toISOString();
  return next;
};

export const getTasteProfile = async (pool, userId) => {
  if (!userId) return null;
  const result = await pool.query('SELECT profile_json FROM taste_profile WHERE user_id = $1', [userId]);
  return result.rows[0]?.profile_json || null;
};

export const upsertTasteProfile = async (pool, userId, profile) => {
  await pool.query(`
    INSERT INTO taste_profile (user_id, profile_json, feedback_count, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (user_id) DO UPDATE
      SET profile_json = EXCLUDED.profile_json,
          feedback_count = EXCLUDED.feedback_count,
          updated_at = now()
  `, [userId, profile, profile.feedback_count || 0]);
};
