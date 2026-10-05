import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';
import { enrichWine } from '../../src/enrichment/service.js';
import { _resetSchedulerState, scheduleDue, getSchedulerStatus } from '../../src/enrichment/scheduler.js';

// Moteur et pages web simulés : on teste l'orchestration, la vérification des
// sources et l'écriture en base, sans appel réseau.
const PAGE = 'Fiche Charmen 2023. Nez de miel d’acacia et de pain grillé, bouche sur l’ananas. À boire 2026-2030.';
const fetchPage = async (url) => {
  if (url.includes('introuvable')) throw new Error('HTTP 404');
  return `<html><body><p>${PAGE}</p></body></html>`;
};
const engineOutput = (overrides = {}) => ({
  identification: { status: 'IDENTIFIED', matched_producer: 'Domaine Richard', matched_cuvee: 'Charmen', note: 'Hervé Richard, Chavanay', candidates: [] },
  basis: 'EXACT',
  basis_vintage: null,
  corrections: [{ field: 'appellation', value: 'Saint-Joseph', source_index: 0 }],
  profile: {
    grape_varieties: ['Marsanne', 'Roussanne'],
    aromas: ["miel d'acacia", 'pain grillé', 'ananas'],
    families: ['fruity'],
    sensory: null,
    peak_start_year: 2026,
    peak_end_year: 2030,
    peak_reasoning: 'Guide Hachette 2026',
    style_note: 'Saint-Joseph blanc ample',
    aroma_source_indexes: [0],
    peak_source_indexes: [0],
  },
  knowledge: { producer_style: 'Chavanay', cuvee_style: 'ample', grape_varieties: ['Marsanne', 'Roussanne'], peak_years_after_vintage: [3, 7] },
  sources: [{ url: 'https://www.hachette-vins.com/charmen-2023', title: 'Hachette', excerpt: 'Nez de miel d’acacia et de pain grillé, bouche sur l’ananas', level: 'EXACT', vintage: 2023 }],
  searches: ['Domaine Richard Charmen 2023'],
  ...overrides,
});
const runnerReturning = (data) => async () => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: data, usage: {} }) });

describe.skipIf(!hasDb)('enrichissement (cascade)', () => {
  let client;
  let wineId;
  beforeEach(async () => {
    await resetData();
    await pool.query('TRUNCATE wine_knowledge, enrichment_log');
    _resetSchedulerState();
    client = authed((await bootstrapUser()).access_token);
    wineId = (await client.post('/api/wines', { name: 'Charmen', cuvee: 'Charmen', producer: 'Domaine Richard', vintage: 2023, type: 'WHITE', region: 'Vallée du Rhône' })).body.id;
  });
  afterAll(() => pool.end());

  it('niveau EXACT vérifié : profil, apogée, correction, historique, connaissances partagées', async () => {
    const r = await enrichWine(wineId, { engine: 'claude-code', runner: runnerReturning(engineOutput()), fetchPage });
    expect(r).toMatchObject({ ok: true, level: 'EXACT' });

    const wine = (await client.get(`/api/wines/${wineId}`)).body;
    expect(wine).toMatchObject({
      appellation: 'Saint-Joseph',
      grapeVarieties: ['Marsanne', 'Roussanne'],
      aromaProfile: ["miel d'acacia", 'pain grillé', 'ananas'],
      aromaSource: 'AI', aromaConfidence: 'HIGH',
      peakStart: 2026, peakEnd: 2030, peakConfidence: 'HIGH',
      enrichmentBasis: 'EXACT', enrichmentStatus: 'ok',
    });
    expect(wine.enrichmentSources[0]).toMatchObject({ check: 'verified', domain: 'hachette-vins.com' });

    const detail = (await client.get(`/api/wines/${wineId}/enrichment`)).body;
    expect(detail).toMatchObject({ basis: 'EXACT', basisLabel: 'Cette cuvée, ce millésime', status: 'ok' });
    expect(new Date(detail.nextCheckAt).getFullYear()).toBe(new Date().getFullYear() + 1);
    expect(detail.log[0].changes.appellation).toEqual({ from: null, to: 'Saint-Joseph' });

    const k = (await pool.query('SELECT producer_key, cuvee_key FROM wine_knowledge')).rows;
    expect(k).toEqual([{ producer_key: 'richard', cuvee_key: 'charmen' }]);
  });

  it('citation introuvable dans la page : niveau rétrogradé, pas de correction', async () => {
    const data = engineOutput();
    data.sources = [{ ...data.sources[0], excerpt: 'arômes de cassis, réglisse et poivre noir en finale' }];
    const r = await enrichWine(wineId, { engine: 'claude-code', runner: runnerReturning(data), fetchPage });
    expect(r.level).toBe('APPELLATION');
    const wine = (await client.get(`/api/wines/${wineId}`)).body;
    expect(wine.appellation).toBeNull();
    expect(wine).toMatchObject({ aromaConfidence: 'LOW', enrichmentBasis: 'APPELLATION' });
  });

  it('homonymes : candidats stockés, choix de l’utilisateur, puis nouvel enrichissement', async () => {
    const ambiguous = engineOutput({
      identification: {
        status: 'AMBIGUOUS', matched_producer: null, matched_cuvee: null, note: 'Plusieurs Domaine Richard',
        candidates: [
          { producer: 'Domaine Richard', cuvee: 'Charmen', location: 'Chavanay', evidence: 'liste des cuvées', url: null },
          { producer: 'Château Richard', cuvee: null, location: 'Bergerac', evidence: 'homonyme', url: null },
        ],
      },
    });
    expect(await enrichWine(wineId, { engine: 'claude-code', runner: runnerReturning(ambiguous), fetchPage }))
      .toMatchObject({ ok: true, status: 'needs_review' });
    let detail = (await client.get(`/api/wines/${wineId}/enrichment`)).body;
    expect(detail.status).toBe('needs_review');
    expect(detail.candidates).toHaveLength(2);

    // Sans moteur configuré dans les tests : le choix est enregistré, pas mis en file.
    const choose = await client.post(`/api/wines/${wineId}/enrichment/choose`, { candidateIndex: 0 });
    expect(choose.status).toBe(202);
    expect(choose.body.hint).toMatch(/Domaine Richard — Charmen — Chavanay/);

    const r = await enrichWine(wineId, { engine: 'claude-code', runner: runnerReturning(ambiguous), fetchPage });
    expect(r.status).toBe('ok'); // avec l'indice, l'ambiguïté n'arrête plus la cascade
    detail = (await client.get(`/api/wines/${wineId}/enrichment`)).body;
    expect(detail).toMatchObject({ status: 'ok', hint: expect.stringMatching(/Chavanay/) });
  });

  it('saisies USER protégées', async () => {
    await pool.query("UPDATE wines SET aroma_profile = '{cassis}', aroma_source = 'USER', peak_start = 2030, peak_end = 2035, peak_source = 'USER' WHERE id = $1", [wineId]);
    await enrichWine(wineId, { engine: 'claude-code', runner: runnerReturning(engineOutput()), fetchPage });
    const wine = (await client.get(`/api/wines/${wineId}`)).body;
    expect(wine).toMatchObject({ aromaProfile: ['cassis'], aromaSource: 'USER', peakStart: 2030, peakSource: 'USER', enrichmentBasis: 'EXACT' });
  });

  it('annulation d’un enrichissement : valeurs précédentes restaurées', async () => {
    await enrichWine(wineId, { engine: 'claude-code', runner: runnerReturning(engineOutput()), fetchPage });
    const { log } = (await client.get(`/api/wines/${wineId}/enrichment`)).body;
    const revert = await client.post(`/api/wines/${wineId}/enrichment/revert/${log[0].id}`, {});
    expect(revert.status).toBe(200);
    expect(revert.body.restored).toEqual(expect.arrayContaining(['appellation', 'aromaProfile', 'peakStart']));
    const wine = (await client.get(`/api/wines/${wineId}`)).body;
    expect(wine).toMatchObject({ appellation: null, aromaProfile: null, peakStart: null });
    expect((await client.post(`/api/wines/${wineId}/enrichment/revert/${log[0].id}`, {})).status).toBe(400);
  });

  it('échec du moteur : erreur enregistrée, nouvel essai prévu le lendemain', async () => {
    const r = await enrichWine(wineId, { engine: 'claude-code', runner: async () => ({ code: 1, stdout: 'crash' }), fetchPage });
    expect(r).toMatchObject({ ok: false, status: 'error' });
    const detail = (await client.get(`/api/wines/${wineId}/enrichment`)).body;
    expect(detail).toMatchObject({ status: 'error', error: expect.stringMatching(/code 1/) });
    expect(detail.log[0]).toMatchObject({ ok: false });
  });

  it('planification : vins en stock jamais enrichis ou échus, pas ceux à départager ni à jour', async () => {
    const add = async (name, extra = '') => {
      const id = (await client.post('/api/wines', { name, vintage: 2020, type: 'RED' })).body.id;
      await client.post('/api/bottles', { wineId: id, location: 'Non trié' });
      if (extra) await pool.query(`UPDATE wines SET ${extra} WHERE id = $1`, [id]);
      return id;
    };
    const fresh = await add('Jamais enrichi');
    const due = await add('Échu', "enriched_at = now() - interval '2 months', enrichment_next_check_at = now() - interval '1 day'");
    await add('À jour', "enriched_at = now(), enrichment_next_check_at = now() + interval '1 month'");
    await add('À départager', "enrichment_status = 'needs_review'");
    // wineId (créé dans beforeEach) n'a pas de bouteille : pas surveillé.
    const queued = await scheduleDue();
    expect(queued).toBe(2);
    await new Promise((r) => setTimeout(r, 300));
    const handled = getSchedulerStatus().lastResults.map((r) => r.wineId);
    expect(handled.sort()).toEqual([fresh, due].sort());
    // Sans moteur dans les tests : échec explicite, rien d'écrit sur la fiche.
    expect(getSchedulerStatus().lastResults[0].error).toMatch(/Aucun moteur/);
  });

  it('routes : statut, et 503 sans moteur configuré', async () => {
    const status = await client.get('/api/enrichment/status');
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ engine: null, counts: { never: 1 } });
    expect((await client.post(`/api/wines/${wineId}/enrich`, {})).status).toBe(503);
    expect((await client.post('/api/enrichment/run', { scope: 'missing' })).status).toBe(503);
    expect((await client.post('/api/wines/refresh-peaks', {})).status).toBe(503);
  });
});
