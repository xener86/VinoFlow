import { describe, it, expect } from 'vitest';
import { matchesWineSearch } from './wineSearch';
import type { CellarWine } from '../types';

const wine = {
  id: '1', name: 'Grand Vin', cuvee: 'Réserve', producer: 'Château Léoville', region: 'Bordeaux',
  appellation: 'Saint-Julien', country: 'France', vintage: 2015, type: 'RED',
  grapeVarieties: ['Cabernet Sauvignon', 'Merlot'], bottles: [], inventoryCount: 1,
} as unknown as CellarWine;

describe('matchesWineSearch', () => {
  it('cherche dans les champs texte, insensible à la casse et aux accents', () => {
    expect(matchesWineSearch(wine, 'leoville')).toBe(true);
    expect(matchesWineSearch(wine, 'SAINT-julien')).toBe(true);
    expect(matchesWineSearch(wine, 'reserve')).toBe(true);
    expect(matchesWineSearch(wine, 'merlot')).toBe(true);
    expect(matchesWineSearch(wine, '2015')).toBe(true);
  });

  it('libellés de type en français', () => {
    expect(matchesWineSearch(wine, 'rouge')).toBe(true);
    expect(matchesWineSearch(wine, 'red')).toBe(true);
    expect(matchesWineSearch(wine, 'blanc')).toBe(false);
  });

  it('requête vide ou sans correspondance', () => {
    expect(matchesWineSearch(wine, '')).toBe(false);
    expect(matchesWineSearch(wine, '   ')).toBe(false);
    expect(matchesWineSearch(wine, 'bourgogne')).toBe(false);
  });
});
