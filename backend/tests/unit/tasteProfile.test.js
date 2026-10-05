import { describe, it, expect } from 'vitest';
import { applyFeedback } from '../../src/sommelier/tasteProfile.js';

const wine = {
  region: 'Bordeaux', type: 'RED', grapeVarieties: ['Merlot', 'Cabernet Franc'],
  sensoryProfile: { body: 80, acidity: 60, tannin: 70, sweetness: 10, alcohol: 70 },
};

describe('applyFeedback', () => {
  it('part du profil par défaut et compte un avis positif', () => {
    const p = applyFeedback(null, wine, 'UP');
    expect(p.regions).toEqual({ Bordeaux: 1 });
    expect(p.types).toEqual({ RED: 1 });
    expect(p.grapes).toEqual({ Merlot: 1, 'Cabernet Franc': 1 });
    expect(p.feedback_count).toBe(1);
    expect(p.body_pref).toBe(80); // premier avis : moyenne = valeur du vin
    expect(typeof p.last_updated).toBe('string');
  });

  it('moyenne glissante des préférences sensorielles sur les vins aimés', () => {
    const p1 = applyFeedback(null, wine, 'UP');
    const p2 = applyFeedback(p1, { ...wine, sensoryProfile: { ...wine.sensoryProfile, body: 40 } }, 'UP');
    expect(p2.body_pref).toBe(60);
    expect(p2.feedback_count).toBe(2);
  });

  it('un avis négatif décrémente sans toucher aux préférences sensorielles', () => {
    const p = applyFeedback(null, wine, 'DOWN');
    expect(p.regions).toEqual({ Bordeaux: -1 });
    expect(p.body_pref).toBe(50);
    expect(p.feedback_count).toBe(1);
  });

  it('ne modifie pas le profil reçu', () => {
    const before = applyFeedback(null, wine, 'UP');
    const snapshot = JSON.parse(JSON.stringify(before));
    applyFeedback(before, wine, 'DOWN');
    expect(before).toEqual(snapshot);
  });

  it('accepte grape_varieties / sensory_profile (snake_case)', () => {
    const p = applyFeedback(null, { type: 'WHITE', grape_varieties: ['Chenin'], sensory_profile: { body: 30 } }, 'UP');
    expect(p.grapes).toEqual({ Chenin: 1 });
    expect(p.body_pref).toBe(30);
  });
});
