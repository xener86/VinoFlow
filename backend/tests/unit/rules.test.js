import { describe, it, expect } from 'vitest';
import { buildHardFilter } from '../../src/sommelier/rules.js';

const red = (sensory = {}) => ({ type: 'RED', sensoryProfile: sensory });
const white = (sensory = {}) => ({ type: 'WHITE', sensoryProfile: sensory });

describe('buildHardFilter', () => {
  it('rejette un vin sans type', () => {
    expect(buildHardFilter({})({ name: 'x' })).toBe(false);
    expect(buildHardFilter({})(null)).toBe(false);
  });

  it('restreint aux types demandés par le LLM', () => {
    const keep = buildHardFilter({ wine_profile: { types: ['WHITE'] } });
    expect(keep(white())).toBe(true);
    expect(keep(red())).toBe(false);
  });

  it('poisson cru : pas de rouge tannique', () => {
    const keep = buildHardFilter({ decomposition: { protein: 'Sushi saumon' } });
    expect(keep(red({ tannin: 80 }))).toBe(false);
    expect(keep(red({ tannin: 40 }))).toBe(true);
    expect(keep(white())).toBe(true);
  });

  it('dessert chocolat : pas de vin sec', () => {
    const keep = buildHardFilter({ decomposition: { protein: 'fondant au chocolat' } });
    expect(keep(white({ sweetness: 10 }))).toBe(false);
    expect(keep(red({ sweetness: 10 }))).toBe(false);
    expect(keep(red({ sweetness: 60 }))).toBe(true);
  });

  it('plat épicé : pas d’alcool très élevé', () => {
    const keep = buildHardFilter({ decomposition: { spices: 'curry fort' } });
    expect(keep(red({ alcohol: 90 }))).toBe(false);
    expect(keep(red({ alcohol: 60 }))).toBe(true);
  });

  it('plat léger de poisson : pas de rouge corsé et tannique', () => {
    const keep = buildHardFilter({ decomposition: { protein: 'poisson vapeur', intensity: 'light' } });
    expect(keep(red({ body: 80, tannin: 80 }))).toBe(false);
    expect(keep(red({ body: 40, tannin: 80 }))).toBe(true);
  });

  it('viande rouge riche : pas de blanc ou rosé légers', () => {
    const keep = buildHardFilter({ decomposition: { protein: 'Agneau', intensity: 'rich' } });
    expect(keep(white({ body: 30 }))).toBe(false);
    expect(keep({ type: 'ROSE', sensoryProfile: { body: 40 } })).toBe(false);
    expect(keep(white({ body: 70 }))).toBe(true);
  });

  it('liste « avoid » textuelle', () => {
    const keep = buildHardFilter({ wine_profile: { avoid: ['Boisé marqué', 'trop sucré'] } });
    expect(keep(white({ oak: 80 }))).toBe(false);
    expect(keep(white({ sweetness: 70 }))).toBe(false);
    expect(keep(white({ oak: 20, sweetness: 10 }))).toBe(true);
  });

  it('valeurs sensorielles manquantes : défauts neutres', () => {
    const keep = buildHardFilter({ decomposition: { protein: 'huître' } });
    expect(keep({ type: 'RED' })).toBe(true); // tanin par défaut 50 ≤ 60
  });
});
