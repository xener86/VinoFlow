import { describe, it, expect } from 'vitest';
import { parseFreeText, findExisting, autoMatch } from './findExisting';
import type { CellarWine } from '../types';

const w = (id: string, name: string, producer: string, vintage: number, inventoryCount = 1) =>
  ({ id, name, producer, vintage, inventoryCount, cuvee: '', appellation: '' }) as unknown as CellarWine;

describe('parseFreeText', () => {
  it('sépare le millésime final', () => {
    expect(parseFreeText('Pommard 1er Cru Rugiens 2018 ')).toEqual({ name: 'Pommard 1er Cru Rugiens', vintage: 2018 });
    expect(parseFreeText('Sancerre')).toEqual({ name: 'Sancerre', vintage: null });
  });
});

describe('findExisting', () => {
  const cave = [w('a', 'Sancerre Caillottes', 'Pinard', 2020, 0), w('b', 'Sancerre Caillottes', 'Pinard', 2020, 3), w('c', 'Chablis', 'Dauvissat', 2019)];
  it('mots sans accents, millésime respecté, vins en stock d’abord', () => {
    expect(findExisting(cave, 'sancerre caillottes 2020').map((x) => x.id)).toEqual(['b', 'a']);
    expect(findExisting(cave, 'Chablis 2018')).toEqual([]);
    expect(findExisting(cave, 'Châblis')).toHaveLength(1);
  });
});

describe('autoMatch', () => {
  const cave = [w('a', 'Grand Vin', 'Château Test', 2018), w('b', 'Grand Vin', 'Château Test', 2019), w('c', 'Petit Vin', 'Domaine Y', 2020), w('d', 'Petit Vin', 'Domaine Y', 2020)];
  it('un seul candidat au même millésime → présélection', () => {
    expect(autoMatch(cave, { name: 'Grand Vin', producer: 'Château Test', vintage: 2018 })?.id).toBe('a');
  });
  it('ambigu ou sans millésime → rien', () => {
    expect(autoMatch(cave, { name: 'Petit Vin', producer: 'Domaine Y', vintage: 2020 })).toBeNull();
    expect(autoMatch(cave, { name: 'Grand Vin', producer: 'Château Test', vintage: null })).toBeNull();
  });
});
