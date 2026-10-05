import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scoreWine, rankWines } from '../../src/sommelier/scoring.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const criteria = {
  wine_profile: {
    aromas: ['cassis', 'cèdre'],
    body: [60, 80], acidity: [40, 70], tannin: [50, 80], sweetness: [0, 20], alcohol: [50, 80],
    regions: ['bordeaux'], grapes: ['merlot'],
  },
};

const perfect = {
  type: 'RED', vintage: 2018, region: 'Bordeaux', grapeVarieties: ['Merlot'],
  aromaProfile: ['Cassis', 'Cèdre'], aromaSource: 'USER',
  sensoryProfile: { body: 70, acidity: 50, tannin: 60, sweetness: 5, alcohol: 60 },
};

describe('scoreWine', () => {
  it('vin idéal confirmé par l’utilisateur : score maximal hors bonus de personnalisation', () => {
    const { score, breakdown } = scoreWine(perfect, criteria);
    expect(breakdown).toEqual({ aroma: 1, sensory: 1, regionGrape: 1, maturity: 1, confidence: 1 });
    expect(score).toBeCloseTo(0.9, 5); // 0.35 + 0.25 + 0.10 + 0.20
  });

  it('applique le facteur de confiance des arômes IA', () => {
    const base = scoreWine(perfect, criteria).score;
    expect(scoreWine({ ...perfect, aromaSource: 'AI', aromaConfidence: 'HIGH' }, criteria).score).toBeCloseTo(base * 0.85, 5);
    expect(scoreWine({ ...perfect, aromaSource: 'AI', aromaConfidence: 'MEDIUM' }, criteria).score).toBeCloseTo(base * 0.65, 5);
    expect(scoreWine({ ...perfect, aromaSource: 'AI', aromaConfidence: 'LOW' }, criteria).score).toBeCloseTo(base * 0.40, 5);
    expect(scoreWine({ ...perfect, aromaSource: undefined }, criteria).score).toBeCloseTo(base * 0.5, 5);
  });

  it('similarité de Jaccard sur les arômes, insensible à la casse', () => {
    const { breakdown } = scoreWine({ ...perfect, aromaProfile: ['CASSIS', 'vanille'] }, criteria);
    expect(breakdown.aroma).toBeCloseTo(1 / 3, 5);
  });

  it('pénalise linéairement une dimension hors plage', () => {
    const { breakdown } = scoreWine({ ...perfect, sensoryProfile: { ...perfect.sensoryProfile, body: 95 } }, criteria);
    // body : 15 hors plage sur une marge de 30 → 0.5 ; moyenne des 5 dimensions
    expect(breakdown.sensory).toBeCloseTo((0.5 + 4) / 5, 5);
  });

  it('maturité selon la fenêtre naïve', () => {
    expect(scoreWine({ ...perfect, vintage: 2024 }, criteria).breakdown.maturity).toBe(0.55); // Garde
    expect(scoreWine({ ...perfect, vintage: 2015 }, criteria).breakdown.maturity).toBe(0.8); // Boire Vite
    expect(scoreWine({ ...perfect, vintage: null }, criteria).breakdown.maturity).toBe(0.5);
  });

  it('accepte les clés snake_case de la base', () => {
    const snake = {
      type: 'RED', vintage: 2018, region: 'Bordeaux', grape_varieties: ['Merlot'],
      aroma_profile: ['cassis', 'cèdre'], aroma_source: 'TASTING',
      sensory_profile: perfect.sensoryProfile,
    };
    expect(scoreWine(snake, criteria).score).toBeCloseTo(0.9, 5);
  });
});

describe('rankWines', () => {
  it('trie par score décroissant et limite à topN', () => {
    const wines = [
      { ...perfect, id: 'b', aromaProfile: [] },
      { ...perfect, id: 'a' },
      { ...perfect, id: 'c', aromaProfile: ['cassis'] },
    ];
    const ranked = rankWines(wines, criteria, 2);
    expect(ranked.map((r) => r.wine.id)).toEqual(['a', 'c']);
    expect(ranked[0]).toHaveProperty('breakdown');
  });
});
