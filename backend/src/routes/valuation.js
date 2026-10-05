// Valeur de la cave : séries investi / valeur, cotes par vin, rattrapage des prix d'achat.
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { availableEngine } from '../enrichment/engines.js';
import { cellarValue } from '../valuation/compute.js';
import { getLatestValuation, getValuations, saveManualValuation } from '../valuation/service.js';
import { requestValuation } from '../valuation/scheduler.js';

const router = Router();
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const MAX_PRICE = 100_000;
const validPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_PRICE;
const optionalPrice = (v) => v === undefined || v === null || validPrice(v);

const wineExists = async (id) => (await pool.query('SELECT 1 FROM wines WHERE id = $1', [id])).rowCount > 0;

router.get('/cellar/value', async (req, res) => {
  try {
    const months = Math.min(60, Math.max(3, parseInt(req.query.months, 10) || 24));
    const [bottles, valuations, wines] = await Promise.all([
      pool.query('SELECT wine_id, purchase_date, created_at, purchase_price, is_consumed, consumed_date FROM bottles'),
      pool.query('SELECT wine_id, valued_at, price_eur FROM wine_valuations'),
      pool.query('SELECT id, name, cuvee, vintage FROM wines'),
    ]);
    res.json(cellarValue({
      bottles: convertKeysToCamelCase(bottles.rows),
      valuations: convertKeysToCamelCase(valuations.rows),
      wines: wines.rows,
      months,
      now: new Date(),
    }));
  } catch (error) {
    console.error('cellar value error:', error);
    res.status(500).json({ error: 'Calcul de la valeur impossible' });
  }
});

router.get(`/wines/:id(${UUID})/valuations`, async (req, res) => {
  try {
    if (!(await wineExists(req.params.id))) return res.status(404).json({ error: 'Vin introuvable' });
    res.json(await getValuations(req.params.id));
  } catch (error) {
    console.error('valuations error:', error);
    res.status(500).json({ error: 'Lecture des cotes impossible' });
  }
});

router.post(`/wines/:id(${UUID})/valuations`, async (req, res) => {
  const { priceEur, lowEur, highEur, note } = req.body || {};
  if (!validPrice(priceEur) || !optionalPrice(lowEur) || !optionalPrice(highEur)) {
    return res.status(400).json({ error: `Prix attendu entre 0 et ${MAX_PRICE} €` });
  }
  if (lowEur != null && highEur != null && lowEur > highEur) return res.status(400).json({ error: 'Fourchette invalide' });
  try {
    if (!(await wineExists(req.params.id))) return res.status(404).json({ error: 'Vin introuvable' });
    const v = await saveManualValuation(req.params.id, {
      priceEur, lowEur: lowEur ?? null, highEur: highEur ?? null, note: typeof note === 'string' ? note.slice(0, 500) : null,
    });
    res.status(201).json(v);
  } catch (error) {
    console.error('manual valuation error:', error);
    res.status(500).json({ error: 'Enregistrement de la cote impossible' });
  }
});

router.post(`/wines/:id(${UUID})/valuations/refresh`, async (req, res) => {
  if (!availableEngine()) return res.status(409).json({ error: 'Aucun moteur de recherche configuré sur le serveur' });
  try {
    if (!(await wineExists(req.params.id))) return res.status(404).json({ error: 'Vin introuvable' });
    // Une cote saisie récente est prioritaire : la recherche serait ignorée (SKIPPED),
    // on le dit plutôt que de promettre un résultat qui ne viendra pas.
    const latest = await getLatestValuation(req.params.id);
    if (latest?.basis === 'USER' && Date.now() - new Date(latest.valuedAt).getTime() < 90 * 86_400_000) {
      return res.status(409).json({ error: 'Cote saisie il y a moins de 3 mois : elle reste prioritaire sur la recherche automatique' });
    }
    res.status(202).json(requestValuation(req.params.id, 'manual'));
  } catch (error) {
    console.error('valuation refresh error:', error);
    res.status(500).json({ error: 'Demande de cote impossible' });
  }
});

router.get('/cellar/missing-prices', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.id AS wine_id, w.name, w.cuvee, w.vintage, w.format,
              count(*) FILTER (WHERE b.purchase_price IS NULL OR b.purchase_price = 0)::int AS missing,
              (SELECT v.price_eur FROM wine_valuations v WHERE v.wine_id = w.id ORDER BY v.valued_at DESC, v.id DESC LIMIT 1) AS suggested_price
         FROM wines w JOIN bottles b ON b.wine_id = w.id
        WHERE EXISTS (SELECT 1 FROM bottles s WHERE s.wine_id = w.id AND NOT s.is_consumed)
        GROUP BY w.id
       HAVING count(*) FILTER (WHERE b.purchase_price IS NULL OR b.purchase_price = 0) > 0
        ORDER BY w.name, w.vintage`
    );
    res.json(convertKeysToCamelCase(rows));
  } catch (error) {
    console.error('missing prices error:', error);
    res.status(500).json({ error: 'Lecture des prix manquants impossible' });
  }
});

router.put('/cellar/missing-prices', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : null;
  const uuid = new RegExp(`^${UUID}$`);
  if (!items || items.length === 0 || items.length > 500 || items.some((i) => !uuid.test(String(i?.wineId)) || !validPrice(i?.priceEur))) {
    return res.status(400).json({ error: `Liste attendue de { wineId, priceEur } avec un prix entre 0 et ${MAX_PRICE} €` });
  }
  try {
    const updated = await withTransaction(async (db) => {
      let total = 0;
      for (const { wineId, priceEur } of items) {
        const { rows } = await db.query(
          `UPDATE bottles SET purchase_price = $2
            WHERE wine_id = $1 AND (purchase_price IS NULL OR purchase_price = 0)
            RETURNING id`,
          [wineId, priceEur]
        );
        if (rows.length === 0) continue;
        total += rows.length;
        const w = (await db.query('SELECT name, vintage FROM wines WHERE id = $1', [wineId])).rows[0];
        await db.query(
          `INSERT INTO journal (type, wine_id, wine_name, wine_vintage, quantity, description, user_id)
           VALUES ('NOTE', $1, $2, $3, $4, $5, $6)`,
          [wineId, w?.name || 'Vin inconnu', w?.vintage ?? null, rows.length,
            `Prix d'achat renseigné : ${priceEur} € × ${rows.length} bouteille(s)`, req.user?.userId ?? null]
        );
      }
      return total;
    });
    res.json({ updated });
  } catch (error) {
    console.error('missing prices update error:', error);
    res.status(500).json({ error: 'Enregistrement des prix impossible' });
  }
});

export default router;
