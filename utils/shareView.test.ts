import { describe, it, expect } from 'vitest';
import { stars, formatLongDate, formatShortDate, typeLabel, typeDotClass, moveItem, filterShareCandidates, serverMessage, shareUrl } from './shareView';
import type { CellarWine } from '../types';

const w = (id: string, name: string, over: Partial<CellarWine> = {}) =>
  ({ id, name, producer: '', cuvee: '', appellation: '', vintage: 2020, inventoryCount: 1, type: 'RED', ...over }) as unknown as CellarWine;

describe('stars', () => {
  it('arrondit sur 5, vide sans note', () => {
    expect(stars(4)).toBe('★★★★☆');
    expect(stars(3.5)).toBe('★★★★☆');
    expect(stars(0)).toBe('☆☆☆☆☆');
    expect(stars(7)).toBe('★★★★★');
    expect(stars(null)).toBe('');
  });
});

describe('dates', () => {
  it('date en toutes lettres (fr), sans décalage de fuseau', () => {
    expect(formatLongDate('2026-10-11')).toBe('dimanche 11 octobre 2026');
    expect(formatLongDate('2026-01-01')).toBe('jeudi 1 janvier 2026');
    expect(formatLongDate(null)).toBe('');
    expect(formatLongDate('n’importe')).toBe('');
  });
  it('date courte pour une dégustation', () => {
    expect(formatShortDate('2026-10-11T12:00:00.000Z')).toBe('11/10/2026');
  });
});

describe('couleur', () => {
  it('libellé et pastille', () => {
    expect(typeLabel('RED')).toBe('Rouge');
    expect(typeLabel('SPARKLING')).toBe('Pétillant');
    expect(typeLabel(null)).toBe('');
    expect(typeDotClass('WHITE')).toContain('amber');
    expect(typeDotClass(null)).toContain('stone');
  });
});

describe('moveItem', () => {
  it('déplace sans muter ; hors bornes → même tableau', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(items, 2, 1)).toEqual(['a', 'c', 'b']);
    expect(items).toEqual(['a', 'b', 'c']);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 3)).toBe(items);
  });
});

describe('filterShareCandidates', () => {
  const wines = [
    w('1', 'Pommard', { producer: 'Lafarge', inventoryCount: 0, vintage: 2018 }),
    w('2', 'Sancerre', { producer: 'Vacheron', cuvee: 'Les Romains' }),
    w('3', 'Chablis', { appellation: 'Chablis 1er Cru Montée de Tonnerre' }),
    w('4', 'Côte-Rôtie', { producer: 'Jamet', inventoryCount: 0 }),
  ];
  it('sans requête : en stock d’abord, puis par nom, 8 au plus', () => {
    expect(filterShareCandidates(wines, '').map((x) => x.id)).toEqual(['3', '2', '4', '1']);
    expect(filterShareCandidates(Array.from({ length: 12 }, (_, i) => w(String(i), `Vin ${i}`)), '')).toHaveLength(8);
    expect(filterShareCandidates(wines, '', 2)).toHaveLength(2);
  });
  it('filtre sans accents sur nom, cuvée, producteur, appellation, millésime', () => {
    expect(filterShareCandidates(wines, 'cote rotie').map((x) => x.id)).toEqual(['4']);
    expect(filterShareCandidates(wines, 'romains').map((x) => x.id)).toEqual(['2']);
    expect(filterShareCandidates(wines, 'LAFARGE').map((x) => x.id)).toEqual(['1']);
    expect(filterShareCandidates(wines, 'montee').map((x) => x.id)).toEqual(['3']);
    expect(filterShareCandidates(wines, '2018').map((x) => x.id)).toEqual(['1']);
    expect(filterShareCandidates(wines, 'zzz')).toEqual([]);
  });
  it('exclut les vins déjà dans la carte', () => {
    expect(filterShareCandidates(wines, '', 8, ['2', '3']).map((x) => x.id)).toEqual(['4', '1']);
    expect(filterShareCandidates(wines, 'sancerre', 8, ['2'])).toEqual([]);
  });
});

describe('serverMessage', () => {
  it('extrait le message JSON du serveur, sinon le repli', () => {
    expect(serverMessage(new Error('API Error: 409 Conflict - {"error":"Ce lien a été révoqué ; crée une nouvelle carte."}'), 'x'))
      .toBe('Ce lien a été révoqué ; crée une nouvelle carte.');
    expect(serverMessage(new Error('API Error: 429 Too Many Requests - {"msg":"Trop de tentatives"}'), 'x')).toBe('Trop de tentatives');
    expect(serverMessage(new Error('Failed to fetch'), 'Hors ligne')).toBe('Hors ligne');
    expect(serverMessage('boom', 'Repli')).toBe('Repli');
  });
});

describe('shareUrl', () => {
  it('origine + /p/jeton', () => {
    expect(shareUrl('abc', 'https://vinoflow.example')).toBe('https://vinoflow.example/p/abc');
  });
});
