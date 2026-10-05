import { describe, it, expect } from 'vitest';
import {
  formatMl, median, quoteHasPrice, summarizePrices, shouldValue, addMonths, cellarValue,
} from '../../src/valuation/compute.js';

describe('formatMl', () => {
  it('convertit les formats courants, 750 ml par défaut', () => {
    expect(formatMl('750ml')).toBe(750);
    expect(formatMl('1.5L')).toBe(1500);
    expect(formatMl('1,5 L')).toBe(1500);
    expect(formatMl('37,5 cl')).toBe(375);
    expect(formatMl('Magnum')).toBe(1500);
    expect(formatMl(null)).toBe(750);
    expect(formatMl('n’importe quoi')).toBe(750);
  });
});

describe('quoteHasPrice', () => {
  it('reconnaît le montant cité, quel que soit le format', () => {
    expect(quoteHasPrice('Prix : 29,90 € TTC', 29.9)).toBe(true);
    expect(quoteHasPrice('Our price 29.90 EUR', 29.9)).toBe(true);
    expect(quoteHasPrice('Adjugé 1 250 € frais compris', 1250)).toBe(true);
    expect(quoteHasPrice('seulement 29€ la bouteille', 29)).toBe(true);
  });
  it('refuse une citation sans le montant ou avec un autre montant', () => {
    expect(quoteHasPrice('Un très beau vin de garde', 29.9)).toBe(false);
    expect(quoteHasPrice('Prix : 19,90 €', 29.9)).toBe(false);
    expect(quoteHasPrice('Millésime 2019, 75 cl', 2019)).toBe(true); // ambigu mais accepté : le montant figure
    expect(quoteHasPrice('Lot de 1250 bouteilles', 125)).toBe(false); // pas de découpage « 125 » + « 0 »
    expect(quoteHasPrice('Vendu 1.250,00 € aux enchères', 1250)).toBe(true);
  });
});

describe('summarizePrices', () => {
  it('médiane, fourchette, mise à l’échelle au format et rejet des aberrants', () => {
    const r = summarizePrices([
      { price_eur: 30, format_ml: 750 },
      { price_eur: 34, format_ml: 750 },
      { price_eur: 70, format_ml: 1500 },   // magnum → 35 en 75 cl
      { price_eur: 400, format_ml: 750 },   // > 3 × médiane → écarté
    ], 750);
    expect(r).toMatchObject({ price: 34, low: 30, high: 35 }); // médiane de 30, 34, 35
    expect(r.kept).toHaveLength(3);
  });
  it('null sans prix exploitable', () => {
    expect(summarizePrices([], 750)).toBeNull();
    expect(summarizePrices([{ price_eur: 0, format_ml: 750 }], 750)).toBeNull();
  });
  it('vers un magnum', () => {
    expect(summarizePrices([{ price_eur: 30, format_ml: 750 }], 1500).price).toBe(60);
  });
  it('médiane', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('shouldValue', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  it('jamais sans stock', () => {
    expect(shouldValue({ inventoryCount: 0, valuationNextCheckAt: null }, { latest: null, now })).toBe(false);
  });
  it('jamais vérifié ou échéance passée', () => {
    expect(shouldValue({ inventoryCount: 1, valuationNextCheckAt: null }, { latest: null, now })).toBe(true);
    expect(shouldValue({ inventoryCount: 1, valuationNextCheckAt: '2026-10-01T00:00:00Z' }, { latest: null, now })).toBe(true);
    expect(shouldValue({ inventoryCount: 1, valuationNextCheckAt: '2026-12-01T00:00:00Z' }, { latest: null, now })).toBe(false);
  });
  it('cote saisie à la main récente : pas de recherche', () => {
    expect(shouldValue({ inventoryCount: 1, valuationNextCheckAt: null }, { latest: { basis: 'USER', valuedAt: '2026-09-01T00:00:00Z' }, now })).toBe(false);
    expect(shouldValue({ inventoryCount: 1, valuationNextCheckAt: null }, { latest: { basis: 'USER', valuedAt: '2026-05-01T00:00:00Z' }, now })).toBe(true);
  });
  it('addMonths', () => {
    expect(addMonths(new Date('2026-10-05T10:00:00Z'), 3).toISOString()).toBe('2027-01-05T10:00:00.000Z');
  });
});

describe('cellarValue', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const wines = [
    { id: 'a', name: 'Alpha', cuvee: null, vintage: 2015 },
    { id: 'b', name: 'Bravo', cuvee: 'Réserve', vintage: 2018 },
    { id: 'c', name: 'Charlie', cuvee: null, vintage: 2020 },
  ];
  const bottles = [
    // a : 2 bouteilles achetées 20 € en 2025, une bue en août 2026
    { wineId: 'a', purchaseDate: '2025-03-10', createdAt: '2025-03-10', purchasePrice: 20, isConsumed: false, consumedDate: null },
    { wineId: 'a', purchaseDate: '2025-03-10', createdAt: '2025-03-10', purchasePrice: 20, isConsumed: true, consumedDate: '2026-08-20' },
    // b : sans prix, entrée par created_at, cote disponible → achat estimé
    { wineId: 'b', purchaseDate: null, createdAt: '2026-01-05', purchasePrice: 0, isConsumed: false, consumedDate: null },
    // c : prix connu, aucune cote ; une bouteille offerte sans date de sortie
    { wineId: 'c', purchaseDate: '2026-06-01', createdAt: '2026-06-01', purchasePrice: 15, isConsumed: false, consumedDate: null },
    { wineId: 'c', purchaseDate: '2026-06-01', createdAt: '2026-06-01', purchasePrice: 15, isConsumed: true, consumedDate: null },
  ];
  const valuations = [
    { wineId: 'a', valuedAt: '2026-02-01T00:00:00Z', priceEur: 30 },
    { wineId: 'a', valuedAt: '2026-09-01T00:00:00Z', priceEur: 36 },
    { wineId: 'b', valuedAt: '2026-04-01T00:00:00Z', priceEur: 50 },
  ];
  const r = cellarValue({ bottles, valuations, wines, months: 12, now });

  it('série mensuelle, dernier point = aujourd’hui', () => {
    expect(r.series).toHaveLength(12);
    expect(r.series.at(-1).month).toBe('2026-10');
    expect(r.series[0].month).toBe('2025-11');
  });

  it('avant toute cote connue : valeur inconnue (null), pas zéro', () => {
    expect(r.series.find((p) => p.month === '2025-11').value).toBeNull();
  });

  it('investi, achat estimé et valeur à une date passée', () => {
    const mar = r.series.find((p) => p.month === '2026-03');
    expect(mar).toEqual({ month: '2026-03', invested: 40, estimatedPurchase: 50, value: 60 });
    // a : 2 × 20 investis, 2 × 30 de cote ; b : sans prix, estimé 50 (première cote après l'entrée), pas encore coté en mars
  });

  it('aujourd’hui : sorties exclues, plus-value sur les bouteilles cotées', () => {
    expect(r.today).toMatchObject({ invested: 35, estimatedPurchase: 50, value: 86 });
    // en stock : a ×1 (20 €, cote 36), b ×1 (estimé 50, cote 50), c ×1 (15 €, pas de cote)
    expect(r.today.gain).toBe(16);           // (36 − 20) + (50 − 50)
    expect(r.today.gainPct).toBeCloseTo(16 / 70);
  });

  it('couverture', () => {
    expect(r.coverage).toEqual({ bottles: 3, withPrice: 2, withValuation: 2 });
  });

  it('meilleures plus-values (prix réel connu seulement)', () => {
    expect(r.movers.up).toEqual([{ wineId: 'a', name: 'Alpha', vintage: 2015, price: 36, avgPurchase: 20, gainPerBottle: 16, gainTotal: 16 }]);
    expect(r.movers.down).toEqual([]);
  });

  it('cave vide : tout à zéro, pas d’erreur', () => {
    const empty = cellarValue({ bottles: [], valuations: [], wines: [], months: 3, now });
    expect(empty.today).toEqual({ invested: 0, estimatedPurchase: 0, value: 0, gain: 0, gainPct: null });
    expect(empty.coverage).toEqual({ bottles: 0, withPrice: 0, withValuation: 0 });
  });
});
