// Orchestration d'un enrichissement : contexte utilisateur → moteur (recherche
// web) → vérification des sources → niveau retenu → application à la fiche
// (protections USER/TASTING, corrections si EXACT) → historique réversible.
import { pool, withTransaction } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { aromasFromTastingNotes } from '../sommelier/enrich.js';
import { availableEngine, runEngine } from './engines.js';
import { buildUserPrompt } from './prompt.js';
import { verifySources, levelSupported } from './verify.js';
import { LEVELS, SOURCED_LEVELS, confidenceFor, nextCheckDate, levelRank } from './levels.js';
import { rulePeak } from './rules.js';
import { producerKey, cuveeKey } from './normalize.js';
import { WINE_TYPES } from './schema.js';

// Champs de la fiche que l'enrichissement peut modifier : clé → colonne.
const COLUMNS = {
  type: 'type',
  cuvee: 'cuvee',
  appellation: 'appellation',
  region: 'region',
  grapeVarieties: 'grape_varieties',
  aromaProfile: 'aroma_profile',
  aromaSource: 'aroma_source',
  aromaConfidence: 'aroma_confidence',
  aromaProvider: 'aroma_provider',
  sensoryProfile: 'sensory_profile',
  peakStart: 'peak_start',
  peakEnd: 'peak_end',
  peakSource: 'peak_source',
  peakConfidence: 'peak_confidence',
  peakReasoning: 'peak_reasoning',
  enrichedByAi: 'enriched_by_ai',
};

const CORRECTION_KEYS = { type: 'type', cuvee: 'cuvee', appellation: 'appellation', region: 'region', grape_varieties: 'grapeVarieties' };

const same = (a, b) => JSON.stringify(a ?? null).toLowerCase() === JSON.stringify(b ?? null).toLowerCase();

const loadContext = async (wineId) => {
  const { rows } = await pool.query('SELECT * FROM wines WHERE id = $1', [wineId]);
  if (rows.length === 0) return null;
  const wine = convertKeysToCamelCase(rows[0]);
  const notes = convertKeysToCamelCase((await pool.query(
    'SELECT nose_notes, palate_notes FROM tasting_notes WHERE wine_id = $1', [wineId]
  )).rows);
  const prices = (await pool.query(
    'SELECT purchase_price FROM bottles WHERE wine_id = $1 AND purchase_price IS NOT NULL', [wineId]
  )).rows.map((r) => Number(r.purchase_price)).filter((p) => p > 0);
  const knowledge = (await pool.query(
    'SELECT data, sources FROM wine_knowledge WHERE producer_key = $1 AND cuvee_key = $2',
    [producerKey(wine.producer), cuveeKey(wine.cuvee || wine.name)]
  )).rows[0] || null;
  return {
    wine,
    tastingAromas: aromasFromTastingNotes(notes),
    purchasePrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
    knowledge,
  };
};

/**
 * Niveau effectivement acquis : le niveau annoncé, rétrogradé tant qu'il
 * exige une source vérifiée qui manque.
 */
export const resolveLevel = (claimed, checkedSources) => {
  let i = Math.max(0, LEVELS.indexOf(claimed));
  while (i < LEVELS.length - 1 && SOURCED_LEVELS.has(LEVELS[i]) && !levelSupported(checkedSources, LEVELS[i])) i++;
  return LEVELS[i];
};

/**
 * Calcule les modifications à appliquer (sans toucher à la base).
 * @returns {{ updates: object, changes: object }} updates en camelCase ; changes = { champ: { from, to } }
 */
export const planChanges = (wine, data, level, checkedSources, { engine, now = new Date() } = {}) => {
  const updates = {};
  const profile = data.profile || {};
  const sourced = SOURCED_LEVELS.has(level);
  const confidence = confidenceFor(level);

  // Arômes : jamais par-dessus une saisie (USER) ni des notes de dégustation (TASTING).
  if (!['USER', 'TASTING'].includes(wine.aromaSource) && level !== 'REGLES' && profile.aromas?.length) {
    Object.assign(updates, {
      aromaProfile: profile.aromas.slice(0, 8),
      aromaSource: 'AI',
      aromaConfidence: confidence,
      aromaProvider: engine,
    });
  }

  // Profil sensoriel : seulement s'il manque.
  if (!wine.sensoryProfile && profile.sensory && sourced) {
    updates.sensoryProfile = { ...profile.sensory, flavors: profile.aromas?.slice(0, 5) || [] };
  }

  // Cépages : complétés s'ils manquent (les corriger relève des corrections).
  if (!(wine.grapeVarieties?.length) && profile.grape_varieties?.length && sourced) {
    updates.grapeVarieties = profile.grape_varieties;
  }

  // Fenêtre d'apogée : jamais par-dessus une saisie (USER).
  if (wine.peakSource !== 'USER') {
    const fromSources = level !== 'REGLES' && Number.isInteger(profile.peak_start_year) && Number.isInteger(profile.peak_end_year)
      && profile.peak_end_year >= profile.peak_start_year;
    const peak = fromSources
      ? { peakStart: profile.peak_start_year, peakEnd: profile.peak_end_year, reasoning: profile.peak_reasoning }
      : rulePeak(wine, now);
    if (peak) {
      Object.assign(updates, {
        peakStart: peak.peakStart,
        peakEnd: peak.peakEnd,
        peakSource: 'AI',
        peakConfidence: fromSources ? confidence : 'LOW',
        peakReasoning: peak.reasoning || '',
      });
    }
  }

  // Corrections automatiques : seulement au niveau EXACT, appuyées par une source vérifiée.
  if (level === 'EXACT') {
    for (const c of data.corrections || []) {
      const source = checkedSources[c.source_index];
      if (!source || source.check !== 'verified') continue;
      const key = CORRECTION_KEYS[c.field];
      let value = String(c.value || '').trim();
      if (!key || !value) continue;
      if (c.field === 'type') {
        value = value.toUpperCase();
        if (!WINE_TYPES.includes(value)) continue;
      }
      const parsed = c.field === 'grape_varieties' ? value.split(/[,;]/).map((g) => g.trim()).filter(Boolean) : value;
      if (!same(wine[key], parsed)) updates[key] = parsed;
    }
  }

  if (Object.keys(updates).length) updates.enrichedByAi = true;

  const changes = {};
  for (const [key, to] of Object.entries(updates)) {
    if (!same(wine[key], to)) changes[key] = { from: wine[key] ?? null, to };
  }
  return { updates, changes };
};

const toDbValue = (key, value) => (key === 'sensoryProfile' && value !== null ? JSON.stringify(value) : value);

const writeUpdates = async (client, wineId, updates, extra) => {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    values.push(toDbValue(key, value));
    sets.push(`${COLUMNS[key]} = $${values.length}`);
  }
  for (const [column, value] of Object.entries(extra)) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  values.push(wineId);
  await client.query(`UPDATE wines SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
};

const saveKnowledge = async (client, wine, data, level, checkedSources) => {
  const k = data.knowledge;
  if (!k || levelRank(level) > levelRank('PRODUCTEUR')) return;
  const producer = data.identification?.matched_producer || wine.producer;
  const cuvee = data.identification?.matched_cuvee || wine.cuvee || wine.name;
  if (!producer || !cuvee) return;
  const sources = checkedSources.filter((s) => s.check !== 'not_found' && s.level !== 'APPELLATION')
    .map(({ url, title, excerpt, level: l, vintage }) => ({ url, title, excerpt, level: l, vintage }));
  await client.query(
    `INSERT INTO wine_knowledge (producer_key, cuvee_key, producer, cuvee, data, sources, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (producer_key, cuvee_key) DO UPDATE SET data = EXCLUDED.data, sources = EXCLUDED.sources,
       producer = EXCLUDED.producer, cuvee = EXCLUDED.cuvee, updated_at = now()`,
    [producerKey(producer), cuveeKey(cuvee), producer, cuvee, JSON.stringify(k), JSON.stringify(sources)]
  );
};

/**
 * Enrichit un vin. Ne lève pas : l'échec est enregistré sur la fiche.
 * @returns {Promise<{ok, status, level?, changes?, error?}>}
 */
export const enrichWine = async (wineId, { trigger = 'manual', engine = availableEngine(), runner, fetchPage, now = new Date() } = {}) => {
  const ctx = await loadContext(wineId);
  if (!ctx) return { ok: false, status: 'not_found', error: 'Vin introuvable' };
  if (!engine) return { ok: false, status: 'error', error: 'Aucun moteur d\'enrichissement configuré (CLAUDE_CODE_OAUTH_TOKEN ou ANTHROPIC_API_KEY)' };
  const { wine } = ctx;

  let result;
  try {
    result = await runEngine(engine, buildUserPrompt(wine, { ...ctx, hint: wine.enrichmentHint, currentYear: now.getFullYear() }), { runner });
  } catch (error) {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE wines SET enrichment_status = 'error', enrichment_error = $1,
           enrichment_next_check_at = now() + interval '1 day' WHERE id = $2`,
        [String(error.message).slice(0, 500), wineId]
      );
      await client.query(
        'INSERT INTO enrichment_log (wine_id, engine, trigger, ok, error) VALUES ($1, $2, $3, false, $4)',
        [wineId, engine, trigger, String(error.message).slice(0, 500)]
      );
    });
    return { ok: false, status: 'error', error: error.message };
  }

  const data = result.data;
  const identification = data.identification || {};

  // Homonymes non départagés : on stocke les candidats, l'utilisateur tranche.
  if (identification.status === 'AMBIGUOUS' && !wine.enrichmentHint) {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE wines SET enrichment_status = 'needs_review', enrichment_candidates = $1,
           enrichment_error = NULL, enrichment_next_check_at = NULL, enriched_at = now() WHERE id = $2`,
        [JSON.stringify(identification.candidates || []), wineId]
      );
      await client.query(
        'INSERT INTO enrichment_log (wine_id, engine, trigger, ok, basis, changes) VALUES ($1, $2, $3, true, NULL, $4)',
        [wineId, engine, trigger, JSON.stringify({ needsReview: { candidates: identification.candidates || [] } })]
      );
    });
    return { ok: true, status: 'needs_review', candidates: identification.candidates || [] };
  }

  const checked = await verifySources(data.sources || [], fetchPage ? { fetchPage } : undefined);
  const level = resolveLevel(data.basis, checked);
  const { updates, changes } = planChanges(wine, data, level, checked, { engine, now });
  const storedSources = checked.map(({ url, title, excerpt, level: l, vintage, check, domain }) => ({ url, title, excerpt, level: l, vintage, check, domain }));

  await withTransaction(async (client) => {
    await writeUpdates(client, wineId, updates, {
      enrichment_basis: level,
      enrichment_sources: JSON.stringify(storedSources),
      enriched_at: now,
      enrichment_next_check_at: nextCheckDate(level, now),
      enrichment_status: 'ok',
      enrichment_candidates: null,
      enrichment_error: null,
    });
    await client.query(
      `INSERT INTO enrichment_log (wine_id, engine, trigger, ok, basis, changes, sources)
       VALUES ($1, $2, $3, true, $4, $5, $6)`,
      [wineId, engine, trigger, level, JSON.stringify({ ...changes, claimedBasis: data.basis, note: identification.note }), JSON.stringify(storedSources)]
    );
    await saveKnowledge(client, wine, data, level, checked);
  });

  return { ok: true, status: 'ok', level, claimedLevel: data.basis, changes, sources: storedSources };
};

/** Annule les modifications d'un enrichissement (valeurs précédentes). */
export const revertEnrichment = async (wineId, logId) => withTransaction(async (client) => {
  const { rows } = await client.query(
    'SELECT changes, reverted_at FROM enrichment_log WHERE id = $1 AND wine_id = $2 FOR UPDATE', [logId, wineId]
  );
  const entry = rows[0];
  if (!entry) return { ok: false, error: 'Entrée introuvable' };
  if (entry.reverted_at) return { ok: false, error: 'Déjà annulé' };
  const previous = {};
  for (const [key, change] of Object.entries(entry.changes || {})) {
    if (COLUMNS[key] && change && typeof change === 'object' && 'from' in change) previous[key] = change.from;
  }
  if (Object.keys(previous).length) await writeUpdates(client, wineId, previous, {});
  await client.query('UPDATE enrichment_log SET reverted_at = now() WHERE id = $1', [logId]);
  return { ok: true, restored: Object.keys(previous) };
});
