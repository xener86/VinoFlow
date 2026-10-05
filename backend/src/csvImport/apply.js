import { WINE_COLUMNS } from './columns.js';

// Cave telle que buildPlan l'attend : fiches + bouteilles EN STOCK (prix).
export const loadCellar = async (db) => {
  const { rows } = await db.query(`
    SELECT w.id, w.name, w.cuvee, w.producer, w.vintage, w.region, w.appellation, w.country, w.type,
           w.grape_varieties, w.format, w.is_favorite, w.sensory_description, w.suggested_food_pairings,
           w.peak_start, w.peak_end,
           COALESCE(json_agg(json_build_object('purchasePrice', b.purchase_price))
             FILTER (WHERE b.id IS NOT NULL), '[]') AS bottles
      FROM wines w
      LEFT JOIN bottles b ON b.wine_id = w.id AND NOT COALESCE(b.is_consumed, false)
     GROUP BY w.id`);
  return rows.map((r) => ({
    id: r.id, name: r.name, cuvee: r.cuvee, producer: r.producer, vintage: r.vintage, region: r.region,
    appellation: r.appellation, country: r.country, type: r.type, grapeVarieties: r.grape_varieties,
    format: r.format, isFavorite: r.is_favorite, sensoryDescription: r.sensory_description,
    suggestedFoodPairings: r.suggested_food_pairings, peakStart: r.peak_start, peakEnd: r.peak_end,
    bottles: r.bottles,
  }));
};

// Même effet que PUT /wines/:id/peak (saisie manuelle) ; null = retour à l'estimation.
const setPeak = (db, wineId, peak) => (peak
  ? db.query(`UPDATE wines SET peak_start = $1, peak_end = $2, peak_source = 'USER', peak_confidence = 'HIGH',
                peak_reasoning = 'Import CSV', peak_computed_at = now(), updated_at = now() WHERE id = $3`,
    [peak.start, peak.end, wineId])
  : db.query(`UPDATE wines SET peak_start = NULL, peak_end = NULL, peak_source = NULL, peak_confidence = NULL,
                peak_reasoning = NULL, peak_computed_at = NULL, updated_at = now() WHERE id = $1`, [wineId]));

/** Applique un plan (buildPlan) ; à appeler dans withTransaction. */
export const applyPlan = async (db, plan, userId) => {
  const applied = { updated: 0, peaks: 0, pricedBottles: 0, created: 0, createdBottles: 0 };

  for (const u of plan.updates) {
    const cols = u.changes.map((c) => WINE_COLUMNS[c.field]);
    await db.query(
      `UPDATE wines SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
      [...u.changes.map((c) => c.after), u.wineId],
    );
    applied.updated += 1;
  }

  for (const p of plan.peaks) {
    await setPeak(db, p.wineId, p.after);
    applied.peaks += 1;
  }

  // Jamais d'écrasement : seules les bouteilles en stock sans prix sont complétées.
  for (const p of plan.prices) {
    const { rowCount } = await db.query(
      `UPDATE bottles SET purchase_price = $1
        WHERE wine_id = $2 AND NOT COALESCE(is_consumed, false) AND (purchase_price IS NULL OR purchase_price = 0)`,
      [p.price, p.wineId],
    );
    applied.pricedBottles += rowCount;
  }

  for (const c of plan.creates) {
    const entries = Object.entries(c.fields);
    const { rows: [wine] } = await db.query(
      `INSERT INTO wines (${entries.map(([f]) => WINE_COLUMNS[f]).join(', ')})
       VALUES (${entries.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, name, vintage`,
      entries.map(([, v]) => v),
    );
    if (c.peak) await setPeak(db, wine.id, c.peak);
    await db.query(
      `INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_price)
       SELECT $1, $2::jsonb, $3, $4 FROM generate_series(1, $5::int)`,
      [wine.id, JSON.stringify('Non trié'), userId, c.price, c.bottles],
    );
    await db.query(
      `INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, user_id)
       VALUES ($1, 'IN', $2, $3, $4, $5, 'Import CSV', $6)`,
      [new Date().toISOString(), wine.id, wine.name, wine.vintage, c.bottles, userId],
    );
    applied.created += 1;
    applied.createdBottles += c.bottles;
  }
  return applied;
};
