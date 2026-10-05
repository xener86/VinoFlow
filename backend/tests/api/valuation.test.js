import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { hasDb, pool, resetData } from './helpers.js';
import { valueWine, saveManualValuation, getValuations } from '../../src/valuation/service.js';

// Moteur et pages simulés : orchestration, vérification des citations, écriture en base.
const PAGES = {
  'https://caviste.example/alpha-2019': '<html><body><p>Domaine Alpha 2019, 75 cl. Prix : 32,50 € TTC. Livraison offerte.</p></body></html>',
  'https://encheres.example/lot-12': '<html><body><p>Lot 12 — Alpha 2019, adjugé 28 € frais compris.</p></body></html>',
  'https://blog.example/alpha': '<html><body><p>Un grand vin de garde, à boire jusqu’en 2030.</p></body></html>',
};
const fetchPage = async (url) => {
  if (!PAGES[url]) throw new Error('HTTP 404');
  return PAGES[url];
};
const runnerReturning = (data) => async () => ({ code: 0, stdout: JSON.stringify({ is_error: false, structured_output: data, usage: {} }) });
const found = (prices, extra = {}) => ({ status: 'FOUND', basis: 'EXACT', basis_vintage: null, prices, note: 'ok', ...extra });
const NOW = new Date('2026-10-05T10:00:00Z');

afterAll(() => pool.end()); // un seul pool pour les deux blocs du fichier (le second est ajouté en tâche 5)

describe.skipIf(!hasDb)('passe « cote »', () => {
  let wineId;
  beforeEach(async () => {
    await resetData();
    const { rows } = await pool.query(`INSERT INTO wines (name, producer, vintage, type, format) VALUES ('Alpha', 'Domaine Alpha', 2019, 'RED', '750ml') RETURNING id`);
    wineId = rows[0].id;
    await pool.query('INSERT INTO bottles (wine_id) VALUES ($1)', [wineId]);
  });

  it('enregistre la médiane des prix dont la citation (avec le prix) est retrouvée', async () => {
    const r = await valueWine(wineId, {
      engine: 'claude-code', fetchPage, now: NOW,
      runner: runnerReturning(found([
        { price_eur: 32.5, format_ml: 750, seller: 'Caviste', url: 'https://caviste.example/alpha-2019', quote: 'Prix : 32,50 € TTC' },
        { price_eur: 28, format_ml: 750, seller: 'Enchères', url: 'https://encheres.example/lot-12', quote: 'adjugé 28 € frais compris' },
        { price_eur: 90, format_ml: 750, seller: 'Blog', url: 'https://blog.example/alpha', quote: 'Un grand vin de garde, à boire jusqu’en 2030' }, // citation sans prix
        { price_eur: 45, format_ml: 750, seller: 'Fantôme', url: 'https://introuvable.example/x', quote: '45 €' }, // page inaccessible
      ])),
    });
    expect(r).toMatchObject({ ok: true, status: 'OK', price: 30.25 });
    const v = await getValuations(wineId);
    expect(v.latest).toMatchObject({ priceEur: 30.25, lowEur: 28, highEur: 32.5, basis: 'EXACT' });
    expect(v.latest.sources.map((s) => s.status)).toEqual(['verified', 'verified', 'verified', 'unreachable']);
    expect(v.latest.sources.filter((s) => s.counted).map((s) => s.url)).toEqual(['https://caviste.example/alpha-2019', 'https://encheres.example/lot-12']);
    expect(v.status).toBe('OK');
    expect(new Date(v.nextCheckAt).toISOString()).toBe('2027-01-05T10:00:00.000Z');
  });

  it('aucun prix vérifié : statut NONE, aucun point, nouvel essai dans un mois', async () => {
    const r = await valueWine(wineId, {
      engine: 'claude-code', fetchPage, now: NOW,
      runner: runnerReturning(found([{ price_eur: 90, format_ml: 750, seller: 'Blog', url: 'https://blog.example/alpha', quote: 'Un grand vin de garde, à boire jusqu’en 2030' }])),
    });
    expect(r).toMatchObject({ ok: true, status: 'NONE' });
    const v = await getValuations(wineId);
    expect(v.latest).toBeNull();
    expect(v.status).toBe('NONE');
    expect(new Date(v.nextCheckAt).toISOString()).toBe('2026-11-05T10:00:00.000Z');
  });

  it('moteur en échec : statut ERROR, rien d’enregistré, pas d’exception', async () => {
    const r = await valueWine(wineId, { engine: 'claude-code', fetchPage, now: NOW, runner: async () => ({ code: 1, stdout: 'crash' }) });
    expect(r).toMatchObject({ ok: false, status: 'ERROR' });
    expect((await getValuations(wineId)).latest).toBeNull();
  });

  it('cote saisie à la main : prioritaire, jamais écrasée par la recherche', async () => {
    await saveManualValuation(wineId, { priceEur: 55, note: 'Estimation du caviste' }, { now: NOW });
    const r = await valueWine(wineId, {
      engine: 'claude-code', fetchPage, now: new Date('2026-10-20T10:00:00Z'),
      runner: runnerReturning(found([{ price_eur: 32.5, format_ml: 750, seller: 'Caviste', url: 'https://caviste.example/alpha-2019', quote: 'Prix : 32,50 € TTC' }])),
    });
    expect(r).toMatchObject({ ok: true, status: 'SKIPPED' });
    const v = await getValuations(wineId);
    expect(v.latest).toMatchObject({ priceEur: 55, basis: 'USER' });
    expect(v.history).toHaveLength(1);
  });

  it('magnum : prix ramenés au format du vin', async () => {
    await pool.query("UPDATE wines SET format = '1.5L' WHERE id = $1", [wineId]);
    const r = await valueWine(wineId, {
      engine: 'claude-code', fetchPage, now: NOW,
      runner: runnerReturning(found([{ price_eur: 32.5, format_ml: 750, seller: 'Caviste', url: 'https://caviste.example/alpha-2019', quote: 'Prix : 32,50 € TTC' }])),
    });
    expect(r.price).toBe(65);
  });
});
