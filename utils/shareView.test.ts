import { describe, it, expect } from 'vitest';
import { stars, frenchDate, typeLabel, moveItem, searchWines } from './shareView';
import type { CellarWine } from '../types';

describe('shareView', () => {
  it('étoiles, date en français, couleur', () => {
    expect(stars(4)).toBe('★★★★☆');
    expect(stars(0)).toBe('☆☆☆☆☆');
    expect(stars(null)).toBe('');
    expect(frenchDate('2026-10-12')).toBe('lundi 12 octobre 2026');
    expect(frenchDate('2026-03-01')).toBe('dimanche 1er mars 2026');
    expect(frenchDate(null)).toBe('');
    expect(typeLabel('SPARKLING')).toBe('Effervescent');
    expect(typeLabel(null)).toBe('');
  });

  it('déplace un vin dans la liste sans sortir des bornes', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('recherche sans accents, en stock d’abord, 8 résultats au plus', () => {
    const w = (id: string, name: string, inventoryCount: number, extra = {}) =>
      ({ id, name, producer: 'Dom', cuvee: '', appellation: '', vintage: 2018, inventoryCount, ...extra }) as unknown as CellarWine;
    const wines = [w('a', 'Côte-Rôtie', 0), w('b', 'Cote Rotie La Landonne', 2), w('c', 'Chablis', 1, { vintage: 2020 })];
    expect(searchWines(wines, 'cote rotie').map((x) => x.id)).toEqual(['b', 'a']);
    expect(searchWines(wines, '2020').map((x) => x.id)).toEqual(['c']);
    expect(searchWines(wines, '')).toEqual([]);
    expect(searchWines(Array.from({ length: 12 }, (_, i) => w(`${i}`, 'Vin', 1)), 'vin')).toHaveLength(8);
  });

  it('exclut les vins déjà dans la carte', () => {
    const w = (id: string, name: string) => ({ id, name, producer: '', cuvee: '', appellation: '', vintage: 2018, inventoryCount: 1 }) as unknown as CellarWine;
    const wines = [w('a', 'Chablis'), w('b', 'Chablis Montmains')];
    expect(searchWines(wines, 'chablis', 8, ['a']).map((x) => x.id)).toEqual(['b']);
    expect(searchWines(wines, 'chablis', 8, ['a', 'b'])).toEqual([]);
  });
});
