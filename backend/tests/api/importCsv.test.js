import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

const HEADER = "Identifiant;Nom;Producteur;Millésime;Appellation;Apogée début;Apogée fin;Prix d'achat (€);Bouteilles";
const csv = (...rows) => '﻿' + [HEADER, ...rows].join('\r\n');

describe.skipIf(!hasDb)('API import CSV', () => {
  let client;
  let a;
  let b;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Bordeaux' })).body;
    b = (await client.post('/api/wines', { name: 'Petit Vin', producer: 'Domaine Y', vintage: 2020, type: 'WHITE' })).body;
    await client.post('/api/bottles', { wineId: a.id, purchasePrice: 25 });
    await client.post('/api/bottles', { wineId: a.id });
    await client.post('/api/bottles', { wineId: b.id, purchasePrice: 10 });
  });
  afterAll(() => pool.end());

  const wine = async (id) => (await pool.query('SELECT * FROM wines WHERE id = $1', [id])).rows[0];
  const count = async (table) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
  const edits = () => csv(
    `${a.id};;;;Pauillac;2025;2035;20;`,
    ';Nouveau;Domaine Z;2021;;;;12,5;3',
  );
  const preview = async (text) => client.post('/api/import/csv', { csv: text, dryRun: true });

  it('authentification requise', async () => {
    expect((await api().post('/api/import/csv').send({ csv: edits(), dryRun: true })).status).toBe(401);
  });

  it('l’aperçu décrit les changements sans rien écrire', async () => {
    const res = await preview(edits());
    expect(res.status).toBe(200);
    expect(res.body.plan).toMatchObject({ changeCount: 4, errors: [] });
    expect(res.body.plan.prices).toEqual([expect.objectContaining({ wineId: a.id, price: 20, bottleCount: 1 })]);
    expect((await wine(a.id)).appellation).toBe('Bordeaux');
    expect(await count('wines')).toBe(2);
    expect(await count('bottles')).toBe(3);
  });

  it('application : fiche, apogée USER, prix manquant seulement, nouveau vin + bouteilles + journal', async () => {
    const { plan } = (await preview(edits())).body;
    const res = await client.post('/api/import/csv', { csv: edits(), dryRun: false, planHash: plan.planHash });
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual({ updated: 1, peaks: 1, pricedBottles: 1, created: 1, createdBottles: 3 });

    expect(await wine(a.id)).toMatchObject({ appellation: 'Pauillac', peak_start: 2025, peak_end: 2035, peak_source: 'USER', peak_confidence: 'HIGH' });
    const prices = (await pool.query('SELECT purchase_price FROM bottles WHERE wine_id = $1 ORDER BY purchase_price', [a.id])).rows.map((r) => r.purchase_price);
    expect(prices).toEqual([20, 25]);

    const created = (await pool.query("SELECT * FROM wines WHERE name = 'Nouveau'")).rows[0];
    expect(created).toMatchObject({ producer: 'Domaine Z', vintage: 2021 });
    const newBottles = (await pool.query('SELECT purchase_price, location FROM bottles WHERE wine_id = $1', [created.id])).rows;
    expect(newBottles).toHaveLength(3);
    expect(newBottles.every((r) => r.purchase_price === 12.5 && r.location === 'Non trié')).toBe(true);
    const journal = (await pool.query('SELECT * FROM journal WHERE wine_id = $1', [created.id])).rows;
    expect(journal).toEqual([expect.objectContaining({ type: 'IN', quantity: 3, description: 'Import CSV', wine_name: 'Nouveau' })]);
  });

  it('réimporter un fichier déjà appliqué : zéro changement', async () => {
    // B : prix déjà connu et identique (10,00) → ni changement ni avertissement.
    const file = csv(`${a.id};Grand Vin;Château Test;2018;Pauillac;2025;2035;;`, `${b.id};Petit Vin;Domaine Y;2020;;;;10,00;`);
    const first = (await preview(file)).body.plan;
    await client.post('/api/import/csv', { csv: file, dryRun: false, planHash: first.planHash });
    const again = (await preview(file)).body.plan;
    expect(again).toMatchObject({ changeCount: 0, unchanged: 2, errors: [], warnings: [] });
  });

  it('cave modifiée entre l’aperçu et l’application : 409, rien n’est écrit', async () => {
    const { plan } = (await preview(edits())).body;
    await client.put(`/api/wines/${a.id}`, { appellation: 'Margaux' });
    const res = await client.post('/api/import/csv', { csv: edits(), dryRun: false, planHash: plan.planHash });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/relance/);
    expect((await wine(a.id)).appellation).toBe('Margaux');
    expect(await count('wines')).toBe(2);
  });

  it('erreur SQL en cours d’application : rien n’est écrit', async () => {
    // Le caractère NUL est refusé par Postgres : la création échoue après la mise à jour.
    const file = csv(`${a.id};;;;Pauillac;;;;`, ';Mauvais\u0000;Dom;;;;;;');
    const { plan } = (await preview(file)).body;
    const res = await client.post('/api/import/csv', { csv: file, dryRun: false, planHash: plan.planHash });
    expect(res.status).toBe(500);
    expect((await wine(a.id)).appellation).toBe('Bordeaux');
    expect(await count('wines')).toBe(2);
  });

  it('ancien export sans Identifiant : 400', async () => {
    const res = await preview('Nom,Producteur\nGrand Vin,Château Test');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Réexporte ta cave/);
  });

  it('fichier trop volumineux : 413', async () => {
    const res = await preview(`${HEADER}\r\n${'x'.repeat(2 * 1024 * 1024 + 10)}`);
    expect(res.status).toBe(413);
  });
});
