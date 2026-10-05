import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeBudget } from '../../src/sommelier/budget.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const inventory = [
  {
    type: 'RED', region: 'Bordeaux',
    bottles: [
      { purchaseDate: '2026-05-10', purchasePrice: 20 },
      { purchaseDate: '2026-05-20', purchasePrice: 30, isConsumed: true },
      { purchaseDate: '2024-01-01', purchasePrice: 100 }, // hors fenêtre de 12 mois
    ],
  },
  {
    type: 'WHITE', region: 'Loire',
    bottles: [
      { purchase_date: '2026-03-02', purchase_price: 12.5 },
      { purchaseDate: null, purchasePrice: 50 }, // sans date d'achat
    ],
  },
];

describe('computeBudget', () => {
  it('totaux sur la fenêtre glissante', () => {
    const r = computeBudget(inventory, [], { monthsBack: 12 });
    expect(r.period_months).toBe(12);
    expect(r.total_bottles).toBe(3);
    expect(r.total_spent).toBe(62.5);
    expect(r.avg_price).toBeCloseTo(20.83, 2);
    expect(r.monthly_avg).toBeCloseTo(5.21, 2);
  });

  it('ventilation par mois (triée) et par type', () => {
    const r = computeBudget(inventory, []);
    expect(r.by_month).toEqual([
      { month: '2026-03', count: 1, total: 12.5 },
      { month: '2026-05', count: 2, total: 50 },
    ]);
    expect(r.by_type).toEqual(expect.arrayContaining([
      { type: 'RED', count: 2, total: 50 },
      { type: 'WHITE', count: 1, total: 12.5 },
    ]));
  });

  it('valeur de cave = prix d’achat des bouteilles non bues, toutes dates', () => {
    expect(computeBudget(inventory, []).cellar_value_estimate).toBe(182.5); // 20 + 100 + 12.5 + 50
  });

  it('cave vide', () => {
    const r = computeBudget([], [], { monthsBack: 6 });
    expect(r).toMatchObject({ total_spent: 0, total_bottles: 0, avg_price: 0, monthly_avg: 0, by_month: [], by_type: [] });
  });
});
