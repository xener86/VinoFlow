import { describe, it, expect } from 'vitest';
import { buildPlan } from '../../src/csvImport/plan.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const cellar = () => [
  {
    id: A, name: 'Grand Vin', cuvee: null, producer: 'Château Test', vintage: 2018, region: 'Bordeaux',
    appellation: 'Bordeaux', country: 'France', type: 'RED', grapeVarieties: ['Merlot'], format: '750ml',
    isFavorite: false, sensoryDescription: '', suggestedFoodPairings: null, peakStart: null, peakEnd: null,
    bottles: [{ purchasePrice: 20 }, { purchasePrice: null }, { purchasePrice: 0 }],
  },
  {
    id: B, name: 'Petit Vin', cuvee: 'Lune', producer: 'Domaine Y', vintage: 2020, region: 'Loire',
    appellation: 'Vouvray', country: 'France', type: 'WHITE', grapeVarieties: [], format: '750ml',
    isFavorite: true, sensoryDescription: null, suggestedFoodPairings: [], peakStart: 2022, peakEnd: 2027,
    bottles: [{ purchasePrice: 20 }, { purchasePrice: 30 }],
  },
];
const patch = (line, id, extra = {}) => ({ line, id, fields: {}, ...extra });

describe('buildPlan', () => {
  it('fichier identique à la cave : aucun changement (null = vide, listes égales)', () => {
    const plan = buildPlan([
      patch(2, A, { fields: { name: 'Grand Vin', vintage: 2018, grapeVarieties: ['Merlot'], isFavorite: false, suggestedFoodPairings: [] } }),
      patch(3, B, { fields: { cuvee: 'Lune', grapeVarieties: [] }, peak: { start: 2022, end: 2027 }, price: 25 }),
    ], cellar());
    expect(plan).toMatchObject({ updates: [], peaks: [], prices: [], creates: [], unchanged: 2, warnings: [], changeCount: 0 });
  });

  it('changements champ par champ, « - » compris', () => {
    const plan = buildPlan([patch(2, B, { fields: { appellation: 'Montlouis', cuvee: null } })], cellar());
    expect(plan.updates).toEqual([{
      line: 2, wineId: B, label: 'Petit Vin Lune 2020',
      changes: [{ field: 'cuvee', before: 'Lune', after: null }, { field: 'appellation', before: 'Vouvray', after: 'Montlouis' }],
    }]);
    expect(plan.changeCount).toBe(1);
  });

  it('prix : seulement les bouteilles sans prix ; prix déjà connus → avertissement si différent', () => {
    const plan = buildPlan([patch(2, A, { price: 15 }), patch(3, B, { price: 30 })], cellar());
    expect(plan.prices).toEqual([{ line: 2, wineId: A, label: 'Grand Vin 2018', price: 15, bottleCount: 2 }]);
    expect(plan.warnings).toEqual([{ line: 3, message: expect.stringMatching(/déjà connu/) }]);
  });

  it('apogée : saisie, partielle complétée, effacement, inchangée', () => {
    const set = buildPlan([patch(2, A, { peak: { start: 2025, end: 2035 } })], cellar());
    expect(set.peaks).toEqual([{ line: 2, wineId: A, label: 'Grand Vin 2018', before: null, after: { start: 2025, end: 2035 } }]);
    expect(buildPlan([patch(2, B, { peak: { start: 2024 } })], cellar()).peaks[0].after).toEqual({ start: 2024, end: 2027 });
    expect(buildPlan([patch(2, B, { peak: 'clear' })], cellar()).peaks[0].after).toBeNull();
    expect(buildPlan([patch(2, A, { peak: 'clear' })], cellar())).toMatchObject({ peaks: [], unchanged: 1 });
  });

  it('ligne à moitié invalide : toute la ligne est écartée', () => {
    const plan = buildPlan([patch(2, A, { fields: { appellation: 'Pauillac' }, peak: { start: 2025 } })], cellar());
    expect(plan.updates).toEqual([]);
    expect(plan.errors).toEqual([{ line: 2, message: expect.stringMatching(/Apogée début et Apogée fin/) }]);
    const inverted = buildPlan([patch(3, B, { peak: { start: 2030 } })], cellar());
    expect(inverted.errors[0].message).toMatch(/après/);
  });

  it('identifiant inconnu ou en double', () => {
    const unknown = '33333333-3333-4333-8333-333333333333';
    const plan = buildPlan([patch(2, unknown), patch(3, A, { fields: { region: 'X' } }), patch(4, A)], cellar());
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(plan.errors[0].message).toMatch(/inconnu/);
    expect(plan.errors[1].message).toMatch(/plusieurs fois/);
    expect(plan.updates).toEqual([]);
  });

  it('création : bouteilles par défaut, doublon probable signalé, apogée partielle refusée', () => {
    const plan = buildPlan([
      patch(2, null, { fields: { name: 'grand vin', producer: 'CHÂTEAU TEST', vintage: 2018 } }),
      patch(3, null, { fields: { name: 'Neuf', producer: 'Dom' }, price: 12.5, bottles: 3, peak: { start: 2026, end: 2030 } }),
      patch(4, null, { fields: { name: 'Bancal', producer: 'Dom' }, peak: { end: 2030 } }),
    ], cellar());
    expect(plan.creates).toEqual([
      { line: 2, label: 'grand vin 2018', fields: { name: 'grand vin', producer: 'CHÂTEAU TEST', vintage: 2018 }, peak: null, price: null, bottles: 1 },
      { line: 3, label: 'Neuf', fields: { name: 'Neuf', producer: 'Dom' }, peak: { start: 2026, end: 2030 }, price: 12.5, bottles: 3 },
    ]);
    expect(plan.warnings).toEqual([{ line: 2, message: expect.stringMatching(/existe peut-être déjà/) }]);
    expect(plan.errors.map((e) => e.line)).toEqual([4]);
  });

  it('erreurs de lecture reprises et triées ; empreinte stable', () => {
    const patches = [patch(3, A, { price: 15 })];
    const a = buildPlan(patches, cellar(), [{ line: 5, message: 'x' }, { line: 2, message: 'y' }]);
    expect(a.errors.map((e) => e.line)).toEqual([2, 5]);
    expect(buildPlan(patches, cellar()).planHash).toBe(a.planHash);
    expect(buildPlan([patch(3, A, { price: 16 })], cellar()).planHash).not.toBe(a.planHash);
    expect(a.planHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
