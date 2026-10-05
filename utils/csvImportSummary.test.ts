import { describe, it, expect } from 'vitest';
import { summaryTiles, groupChanges } from './csvImportSummary';
import type { CsvImportPlan } from '../types';

const plan: CsvImportPlan = {
  updates: [{ line: 4, wineId: 'a', label: 'Grand Vin 2018', changes: [
    { field: 'appellation', before: 'Bordeaux', after: 'Pauillac' },
    { field: 'grapeVarieties', before: ['Merlot'], after: [] },
    { field: 'isFavorite', before: false, after: true },
    { field: 'type', before: 'RED', after: 'WHITE' },
  ] }],
  peaks: [{ line: 4, wineId: 'a', label: 'Grand Vin 2018', before: null, after: { start: 2025, end: 2035 } }],
  prices: [{ line: 4, wineId: 'a', label: 'Grand Vin 2018', price: 14.5, bottleCount: 2 }],
  creates: [{ line: 2, label: 'Nouveau 2021', peak: null, price: 12.5, bottles: 3 }],
  unchanged: 5, errors: [{ line: 9, message: 'x' }], warnings: [], changeCount: 4, planHash: 'h',
};

describe('summaryTiles', () => {
  it('compte vins modifiés, apogées, bouteilles à prix, nouveaux vins, erreurs', () => {
    expect(summaryTiles(plan).map((t) => t.value)).toEqual([1, 1, 2, 1, 1]);
    expect(summaryTiles(plan).map((t) => t.label)).toEqual(['Vins modifiés', 'Apogées', 'Prix remplis', 'Nouveaux vins', 'Erreurs']);
  });
});

describe('groupChanges', () => {
  it('regroupe par vin, dans l’ordre des lignes, avec des libellés FR', () => {
    const groups = groupChanges(plan);
    expect(groups.map((g) => g.label)).toEqual(['Nouveau 2021', 'Grand Vin 2018']);
    expect(groups[0]).toMatchObject({ isNew: true, line: 2, lines: ['Nouveau vin · 3 bouteille(s) à 12,50 €'] });
    expect(groups[1].lines).toEqual([
      'Appellation : Bordeaux → Pauillac',
      'Cépages : Merlot → —',
      'Favori : Non → Oui',
      'Type : Rouge → Blanc',
      'Apogée : aucune → 2025–2035',
      'Prix d’achat : 14,50 € sur 2 bouteille(s) sans prix',
    ]);
  });
});
