import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { drinkBeforeAlerts, anticipationForEvent, purchaseSuggestions } from '../../src/sommelier/proactive.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const w = (id, vintage, type, extra = {}) => ({ id, vintage, type, inventoryCount: 1, ...extra });

describe('drinkBeforeAlerts', () => {
  it('vins dont la fenêtre se ferme dans l’horizon, plus les apogées passées, triés par urgence', () => {
    const inventory = [
      w('jeune', 2024, 'RED'),          // 2029-2034 : hors horizon
      w('bientot', 2017, 'RED'),        // 2022-2027 : 12 mois restants
      w('passe', 2010, 'RED'),          // 2015-2020 : apogée passée
      w('vide', 2017, 'RED', { inventoryCount: 0 }),
    ];
    const alerts = drinkBeforeAlerts(inventory, { horizonMonths: 12 });
    expect(alerts.map((a) => a.wine.id)).toEqual(['passe', 'bientot']);
    expect(alerts[1].monthsLeft).toBe(12);
  });

  it('utilise l’apogée stockée en priorité', () => {
    const alerts = drinkBeforeAlerts([w('ia', 2024, 'RED', { peakStart: 2020, peakEnd: 2026 })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].peak).toMatchObject({ peakStart: 2020, peakEnd: 2026 });
  });
});

describe('anticipationForEvent', () => {
  it('garde les vins à leur apogée à la date de l’événement, prestige en tête', () => {
    const inventory = [
      w('a', 2020, 'RED'),                          // 2025-2030 → score 3
      w('b', 2021, 'RED', { isFavorite: true }),   // 2026-2031 → 4 + 5
      w('c', 2000, 'RED'),                          // hors fenêtre
    ];
    const picks = anticipationForEvent(inventory, '2027-12-24');
    expect(picks.map((p) => p.wine.id)).toEqual(['b', 'a']);
    expect(picks[0]).toMatchObject({ score: 9, prestige: true });
  });

  it('respecte la limite', () => {
    const inventory = Array.from({ length: 8 }, (_, i) => w(`v${i}`, 2020, 'RED'));
    expect(anticipationForEvent(inventory, '2027-01-01', { limit: 3 })).toHaveLength(3);
  });
});

describe('purchaseSuggestions', () => {
  const inventory = [
    { id: 'r', type: 'RED', inventoryCount: 2 },
    { id: 'b', type: 'WHITE', inventoryCount: 20 },
  ];
  const out = (wineId, date, quantity = 1) => ({ type: 'OUT', wineId, date, quantity });

  it('suggère de racheter les types dont le stock couvre moins de 3 mois', () => {
    const journal = [out('r', '2026-05-01', 6), out('r', '2026-04-01', 6), out('b', '2026-05-01', 1)];
    const s = purchaseSuggestions(inventory, journal, { monthsBack: 6 });
    expect(s).toEqual([{
      type: 'RED', monthly_rate: 2, current_stock: 2, months_of_stock: 1,
      suggested_purchase: 10, priority: 'MEDIUM',
    }]);
  });

  it('ignore les sorties trop anciennes et les entrées', () => {
    const journal = [out('r', '2024-01-01', 50), { type: 'IN', wineId: 'r', date: '2026-05-01', quantity: 12 }];
    expect(purchaseSuggestions(inventory, journal)).toEqual([]);
  });
});
