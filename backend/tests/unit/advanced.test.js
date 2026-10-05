import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildVerticalTasting, blindTasting, agingRecommendations, findDuplicates, cellarProjection,
} from '../../src/sommelier/advanced.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('buildVerticalTasting', () => {
  const inventory = [
    { id: '1', producer: 'Château X', name: 'Grand Vin', vintage: 2010, type: 'RED', inventoryCount: 1 },
    { id: '2', producer: 'château x', name: 'Grand Vin', vintage: 2018, type: 'RED', inventoryCount: 2 },
    { id: '3', producer: 'Château X', name: 'Grand Vin', vintage: 2015, type: 'RED', inventoryCount: 0 },
    { id: '4', producer: 'Autre', name: 'Y', vintage: 2012, type: 'RED', inventoryCount: 1 },
  ];

  it('ordonne du plus jeune au plus âgé, producteur insensible à la casse, stock > 0', () => {
    const v = buildVerticalTasting(inventory, 'CHÂTEAU X');
    expect(v.wines.map((x) => x.id)).toEqual(['2', '1']);
    expect(v.wines[0].peak).toMatchObject({ peakStart: 2023 });
  });

  it('message explicite sous 2 millésimes', () => {
    expect(buildVerticalTasting(inventory, 'Autre').wines).toEqual([]);
  });
});

describe('blindTasting', () => {
  it('cache l’identité et donne des indices', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = blindTasting([
      { id: 'a', inventoryCount: 1, type: 'WHITE', vintage: 2019 },
      { id: 'b', inventoryCount: 1, type: 'RED', vintage: 2016, country: 'France', producer: 'P', name: 'N' },
    ]);
    expect(r.blind_clues).toMatchObject({ type: 'RED', country: 'France', vintage_range: [2010, 2020] });
    expect(r.reveal).toMatchObject({ id: 'b', producer: 'P', name: 'N' });
    expect(r.blind_clues).not.toHaveProperty('producer');
  });

  it('null si la cave est vide', () => {
    expect(blindTasting([{ id: 'a', inventoryCount: 0 }])).toBeNull();
  });
});

describe('agingRecommendations', () => {
  it('phases AGING / PEAK / PAST avec message', () => {
    const recs = agingRecommendations([
      { id: 'a', vintage: 2024, type: 'RED', inventoryCount: 1 },             // 2029-2034
      { id: 'b', vintage: 2020, type: 'RED', inventoryCount: 1 },             // 2025-2030
      { id: 'c', vintage: 2018, type: 'RED', inventoryCount: 1, peakStart: 2019, peakEnd: 2024, peakSource: 'USER' },
    ]);
    expect(recs.map((r) => [r.wine.id, r.phase])).toEqual([['a', 'AGING'], ['b', 'PEAK'], ['c', 'PAST']]);
    expect(recs[0].message).toBe("À garder encore 3 ans avant l'ouverture optimale");
    expect(recs[1].message).toBe('À son apogée, encore 4 ans de fenêtre');
    expect(recs[2]).toMatchObject({ peakSource: 'USER', message: 'Au-delà de la fenêtre optimale (depuis 2 ans). Prioriser.' });
  });
});

describe('findDuplicates', () => {
  it('regroupe producteur + nom + cuvée + millésime (casse et espaces ignorés)', () => {
    const groups = findDuplicates([
      { id: '1', producer: 'Dom A', name: 'Cuvée', vintage: 2019 },
      { id: '2', producer: ' dom a ', name: 'CUVÉE ', vintage: 2019 },
      { id: '3', producer: 'Dom A', name: 'Cuvée', vintage: 2020 },
      { id: '4', name: null },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].wines.map((w) => w.id)).toEqual(['1', '2']);
    expect(groups[0].label).toBe('Dom A Cuvée  2019');
  });
});

describe('cellarProjection', () => {
  it('projette le stock avec le rythme de sortie des 12 derniers mois', () => {
    const inventory = [{ id: 'r', type: 'RED', inventoryCount: 30 }, { id: 'b', type: 'WHITE', inventoryCount: 6 }];
    const journal = [
      { type: 'OUT', wineId: 'r', date: '2026-03-01', quantity: 10 },
      { type: 'GIFT', wineId: 'b', date: '2026-01-01', quantity: 2 },
      { type: 'OUT', wineId: 'r', date: '2024-01-01', quantity: 50 }, // trop ancien
    ];
    const p = cellarProjection(inventory, journal, { yearsAhead: 3 });
    expect(p.monthly_consumption).toBe(1);
    expect(p.by_type).toEqual({ RED: 10, WHITE: 2 });
    expect(p.projection).toEqual([
      { year_offset: 1, projected_stock: 24 },
      { year_offset: 2, projected_stock: 12 },
      { year_offset: 3, projected_stock: 0 },
    ]);
  });
});
