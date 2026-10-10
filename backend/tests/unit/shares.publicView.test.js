import { describe, it, expect } from 'vitest';
import { tastingComment, publicTastings, toPublicShare } from '../../src/shares/publicView.js';

const wine = (id, over = {}) => ({
  id, name: `Vin ${id}`, cuvee: null, producer: 'Domaine', vintage: 2018, type: 'RED', appellation: 'Pommard',
  region: 'Bourgogne', country: 'France', grape_varieties: ['Pinot noir'], sensory_description: 'Soyeux',
  aroma_profile: ['cerise'], suggested_food_pairings: ['gigot'],
  // Colonnes qui ne doivent JAMAIS sortir :
  peak_start: 2024, peak_end: 2032, purchase_price: 40, embedding: [0.1], user_id: 'u', valuation_status: 'ok',
  ...over,
});
const ALLOWED = new Set(['position', 'dish', 'name', 'cuvee', 'producer', 'vintage', 'type', 'appellation', 'region', 'country',
  'grapeVarieties', 'sensoryDescription', 'aromaProfile', 'suggestedFoodPairings', 'tastings', 'date', 'rating', 'comment']);
const keysDeep = (value, acc = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, acc));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { acc.add(k); keysDeep(v, acc); });
  return acc;
};

describe('tastingComment', () => {
  it('texte brut, JSON de la dégustation express, vide', () => {
    expect(tastingComment('Superbe')).toBe('Superbe');
    expect(tastingComment(JSON.stringify({ phrase: 'Une claque', occasion: 'Noël', dish: 'Chapon' }))).toBe('Une claque');
    expect(tastingComment(JSON.stringify({ phrase: '', occasion: 'Noël' }))).toBeNull();
    expect(tastingComment('   ')).toBeNull();
    expect(tastingComment(null)).toBeNull();
  });
});

describe('publicTastings', () => {
  it('trie par date décroissante, ignore les dégustations vides, ne garde que date/rating/comment', () => {
    const rows = [
      { wine_id: 'a', date: new Date('2025-01-01T12:00:00Z'), overall_rating: 3, general_notes: 'Bien', occasion: 'Repas', companions: 'Marc' },
      { wine_id: 'a', date: new Date('2026-01-01T12:00:00Z'), overall_rating: 5, general_notes: null },
      { wine_id: 'a', date: new Date('2024-01-01T12:00:00Z'), overall_rating: null, general_notes: '' },
    ];
    expect(publicTastings(rows)).toEqual([
      { date: '2026-01-01T12:00:00.000Z', rating: 5, comment: null },
      { date: '2025-01-01T12:00:00.000Z', rating: 3, comment: 'Bien' },
    ]);
  });
});

describe('toPublicShare', () => {
  it('fiche vin : un seul vin, titre et date nuls, aucune clé hors liste blanche', () => {
    const out = toPublicShare({ kind: 'WINE', title: null, dinner_date: null }, [{ position: 1, wine_id: 'a', dish: null }], [wine('a')], []);
    expect(out).toEqual({
      kind: 'WINE', title: null, date: null,
      wines: [{
        position: 1, dish: null, name: 'Vin a', cuvee: null, producer: 'Domaine', vintage: 2018, type: 'RED', appellation: 'Pommard',
        region: 'Bourgogne', country: 'France', grapeVarieties: ['Pinot noir'], sensoryDescription: 'Soyeux', aromaProfile: ['cerise'],
        suggestedFoodPairings: ['gigot'], tastings: [],
      }],
    });
    for (const key of keysDeep(out.wines)) expect(ALLOWED.has(key), `clé interdite : ${key}`).toBe(true);
  });

  it('carte : ordre des positions, plats, dégustations par vin, vin supprimé retiré et numéros resserrés', () => {
    const share = { kind: 'DINNER', title: 'Dîner', dinner_date: '2026-10-11' };
    const items = [
      { position: 3, wine_id: 'c', dish: 'Fromages' },
      { position: 1, wine_id: 'a', dish: 'Huîtres' },
      { position: 2, wine_id: 'zz-supprimé', dish: null },
    ];
    const tastings = [{ wine_id: 'c', date: new Date('2026-01-01T12:00:00Z'), overall_rating: 4, general_notes: 'Top' }];
    const out = toPublicShare(share, items, [wine('a'), wine('c')], tastings);
    expect(out.title).toBe('Dîner');
    expect(out.date).toBe('2026-10-11');
    expect(out.wines.map((w) => [w.position, w.name, w.dish])).toEqual([[1, 'Vin a', 'Huîtres'], [2, 'Vin c', 'Fromages']]);
    expect(out.wines[0].tastings).toEqual([]);
    expect(out.wines[1].tastings).toEqual([{ date: '2026-01-01T12:00:00.000Z', rating: 4, comment: 'Top' }]);
    for (const key of keysDeep(out)) expect(new Set([...ALLOWED, 'kind', 'title', 'wines']).has(key), `clé interdite : ${key}`).toBe(true);
  });

  it('tableaux absents → tableaux vides', () => {
    const out = toPublicShare({ kind: 'WINE' }, [{ position: 1, wine_id: 'a', dish: null }],
      [wine('a', { grape_varieties: null, aroma_profile: null, suggested_food_pairings: null, cuvee: undefined })], []);
    expect(out.wines[0]).toMatchObject({ grapeVarieties: [], aromaProfile: [], suggestedFoodPairings: [], cuvee: null });
  });
});
