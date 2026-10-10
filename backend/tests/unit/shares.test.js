import { describe, it, expect } from 'vitest';
import { validateDinner, ShareError, newToken, isToken, MAX_ITEMS } from '../../src/shares/validate.js';
import { toPublicShare } from '../../src/shares/publicView.js';

const W = '11111111-1111-4111-8111-111111111111';
const errorOf = (body) => { try { validateDinner(body); return null; } catch (e) { expect(e).toBeInstanceOf(ShareError); return e; } };

// Toutes les clés d'un objet, récursivement.
export const allKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
  return out;
};

describe('validateDinner', () => {
  it('normalise titre, date, vins et plats', () => {
    expect(validateDinner({ title: ' Dîner chez nous ', date: '2026-10-12', items: [{ wineId: W.toUpperCase(), dish: ' Agneau ' }, { wineId: W }] }))
      .toEqual({ title: 'Dîner chez nous', date: '2026-10-12', items: [{ wineId: W, dish: 'Agneau' }, { wineId: W, dish: null }] });
    expect(validateDinner({ title: 'X', items: [{ wineId: W }] }).date).toBeNull();
  });

  it('refuse titre vide ou trop long, date invalide, 0 ou 21 vins, vin invalide, plat trop long', () => {
    expect(errorOf({ title: ' ', items: [{ wineId: W }] }).status).toBe(400);
    expect(errorOf({ title: 'x'.repeat(121), items: [{ wineId: W }] })).toBeTruthy();
    expect(errorOf({ title: 'X', date: '12/10/2026', items: [{ wineId: W }] }).message).toMatch(/Date/);
    expect(errorOf({ title: 'X', items: [] }).message).toMatch(/entre 1 et 20/);
    expect(errorOf({ title: 'X', items: Array.from({ length: MAX_ITEMS + 1 }, () => ({ wineId: W })) })).toBeTruthy();
    expect(errorOf({ title: 'X', items: [{ wineId: 'abc' }] }).message).toMatch(/Vin invalide/);
    expect(errorOf({ title: 'X', items: [{ wineId: W, dish: 'x'.repeat(201) }] }).message).toMatch(/200/);
  });
});

describe('jeton', () => {
  it('43 caractères base64url, jamais deux fois le même', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(isToken(a)).toBe(true);
    expect(isToken('abc')).toBe(false);
    expect(isToken(`${a}'`)).toBe(false);
  });
});

describe('toPublicShare', () => {
  const wine = {
    id: W, name: 'Grand Vin', cuvee: null, producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Pauillac',
    region: 'Bordeaux', country: 'France', grape_varieties: ['Merlot'], sensory_description: 'Ample', aroma_profile: ['cassis'],
    suggested_food_pairings: ['agneau'], purchase_price: 25, location: { rackId: 'r' }, peak_start: 2025, user_id: 'u',
  };
  const tastings = [
    { id: 't1', wine_id: W, date: '2026-01-01T19:00:00Z', overall_rating: 3, general_notes: 'Fermé', occasion: 'Noël', companions: 'Paul' },
    { id: 't2', wine_id: W, date: '2026-06-01T19:00:00Z', overall_rating: 5, general_notes: ' Superbe ', occasion: null, companions: 'Marie' },
    { id: 't3', wine_id: W, date: '2026-07-01T19:00:00Z', overall_rating: null, general_notes: '  ', occasion: null, companions: null },
  ];

  it('dîner : ordre de service, plats, dégustations récentes d’abord et vides ignorées', () => {
    const out = toPublicShare({ kind: 'DINNER', title: 'Dîner', dinner_date: '2026-10-12' }, [
      { dish: 'Agneau', wine, tastings },
      { dish: null, wine: { ...wine, name: 'Second' }, tastings: [] },
    ]);
    expect(out).toMatchObject({ kind: 'DINNER', title: 'Dîner', date: '2026-10-12' });
    expect(out.wines.map((w) => [w.position, w.name, w.dish])).toEqual([[1, 'Grand Vin', 'Agneau'], [2, 'Second', null]]);
    expect(out.wines[0].tastings).toEqual([
      { date: '2026-06-01', rating: 5, comment: 'Superbe' },
      { date: '2026-01-01', rating: 3, comment: 'Fermé' },
    ]);
    expect(out.wines[0]).toMatchObject({ grapeVarieties: ['Merlot'], aromaProfile: ['cassis'], suggestedFoodPairings: ['agneau'], sensoryDescription: 'Ample' });
  });

  it('fiche : ni titre ni date', () => {
    expect(toPublicShare({ kind: 'WINE', title: 'x', dinner_date: '2026-10-12' }, [{ dish: null, wine, tastings: [] }]))
      .toMatchObject({ kind: 'WINE', title: null, date: null });
  });

  it('liste blanche : aucun identifiant, prix, emplacement, apogée, occasion ni convive', () => {
    const keys = allKeys(toPublicShare({ kind: 'DINNER', title: 'D', dinner_date: null }, [{ dish: null, wine, tastings }]));
    for (const forbidden of ['id', 'wine_id', 'purchase_price', 'location', 'peak_start', 'user_id', 'occasion', 'companions']) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});
