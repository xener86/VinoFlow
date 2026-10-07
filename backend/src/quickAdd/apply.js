import { identityKey } from './identity.js';
import { BatchError } from './validate.js';

// Applique une rafale validée (validateBatch) ; à appeler dans withTransaction.

const WINE_COLUMNS = {
  name: 'name', producer: 'producer', vintage: 'vintage', type: 'type', cuvee: 'cuvee', appellation: 'appellation',
  region: 'region', country: 'country', grapeVarieties: 'grape_varieties', format: 'format',
};

const insertWine = async (db, wine) => {
  const keys = Object.keys(WINE_COLUMNS);
  const { rows: [row] } = await db.query(
    `INSERT INTO wines (${keys.map((k) => WINE_COLUMNS[k]).join(', ')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    keys.map((k) => wine[k]),
  );
  return row.id;
};

// 1. vin choisi sur le téléphone ; 2. même identité en cave (sauf forceNew) ;
// 3. fiche déjà créée dans cette rafale ; 4. nouvelle fiche.
const findWine = async (db, line, createdByKey) => {
  if (line.matchWineId) {
    const { rows } = await db.query('SELECT id FROM wines WHERE id = $1', [line.matchWineId]);
    if (!rows.length) throw new BatchError('Rafale invalide', [{ clientId: line.clientId, message: 'Ce vin n’existe plus dans la cave' }]);
    return { wineId: rows[0].id, created: false };
  }
  const key = identityKey(line.wine);
  if (!line.forceNew) {
    const { rows } = await db.query('SELECT id, name, producer, vintage FROM wines WHERE vintage IS NOT DISTINCT FROM $1::int', [line.wine.vintage]);
    const hit = rows.find((r) => identityKey(r) === key);
    if (hit) return { wineId: hit.id, created: false };
  }
  if (createdByKey.has(key)) return { wineId: createdByKey.get(key), created: false };
  const wineId = await insertWine(db, line.wine);
  createdByKey.set(key, wineId);
  return { wineId, created: true };
};

const dayMonth = (date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

export const applyBatch = async (db, batch, userId) => {
  // Deux envois simultanés du même batchId : le second attend puis rejoue.
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [batch.batchId]);
  const { rows: done } = await db.query('SELECT result FROM quick_add_batches WHERE id = $1', [batch.batchId]);
  if (done.length) return { result: done[0].result, enrich: [], replay: true };

  const now = new Date();
  const journalLabel = batch.occasion ? `Rafale · ${batch.occasion}` : 'Rafale';
  const createdByKey = new Map();
  const newWines = new Map(); // wineId → a reçu des bouteilles
  const summary = { winesCreated: 0, bottlesAdded: 0, wishlistAdded: 0, tastingsAdded: 0 };
  const lines = [];

  for (const line of batch.lines) {
    const w = line.wine;
    if (line.destination === 'WISHLIST') {
      await db.query(
        `INSERT INTO wishlist (name, producer, region, appellation, type, vintage, source, estimated_price, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MEDIUM')`,
        [w.name, w.producer, w.region, w.appellation, w.type, w.vintage, batch.occasion || `Rafale du ${dayMonth(now)}`, line.estimatedPrice],
      );
      summary.wishlistAdded += 1;
      lines.push({ clientId: line.clientId, wineId: null, created: false });
      continue;
    }

    const { wineId, created } = await findWine(db, line, createdByKey);
    if (created) { summary.winesCreated += 1; newWines.set(wineId, false); }

    if (line.destination === 'CELLAR') {
      await db.query(
        `INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_date, purchase_price)
         SELECT $1, $2::jsonb, $3, $4, $5 FROM generate_series(1, $6::int)`,
        [wineId, JSON.stringify('Non trié'), userId, now.toISOString(), line.price, line.quantity],
      );
      const { rows: [info] } = await db.query('SELECT name, vintage FROM wines WHERE id = $1', [wineId]);
      await db.query(
        `INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, user_id)
         VALUES ($1, 'IN', $2, $3, $4, $5, $6, $7)`,
        [now.toISOString(), wineId, info.name, info.vintage, line.quantity, journalLabel, userId],
      );
      summary.bottlesAdded += line.quantity;
      if (newWines.has(wineId)) newWines.set(wineId, true);
    } else {
      await db.query(
        `INSERT INTO tasting_notes (wine_id, date, overall_rating, general_notes, occasion) VALUES ($1, $2, $3, $4, $5)`,
        [wineId, now.toISOString(), line.rating, line.comment, batch.occasion],
      );
      summary.tastingsAdded += 1;
    }
    lines.push({ clientId: line.clientId, wineId, created });
  }

  const result = { batchId: batch.batchId, summary, lines };
  await db.query('INSERT INTO quick_add_batches (id, user_id, result) VALUES ($1, $2, $3)', [batch.batchId, userId, result]);
  return { result, enrich: [...newWines].filter(([, hasBottles]) => hasBottles).map(([id]) => id), replay: false };
};
