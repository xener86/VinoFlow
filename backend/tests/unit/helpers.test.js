import { describe, it, expect } from 'vitest';
import { aromasFromTastingNotes } from '../../src/sommelier/enrich.js';
import { computeCaveHash } from '../../src/sommelier/cache.js';
import { buildWineDocument } from '../../src/sommelier/embeddings.js';
import { toCamelCase, convertKeysToCamelCase } from '../../src/utils/case.js';

describe('aromasFromTastingNotes', () => {
  it('agrège tableaux, objets {aromas} et texte libre, triés par fréquence', () => {
    const aromas = aromasFromTastingNotes([
      { noseNotes: { aromas: ['Cassis', 'cèdre'] }, palateNotes: 'cassis; réglisse' },
      { nose_notes: ['CASSIS', 'Cèdre'] },
    ]);
    expect(aromas[0]).toBe('cassis');
    expect(aromas[1]).toBe('cèdre');
    expect(aromas).toContain('réglisse');
  });

  it('liste vide si aucune note', () => {
    expect(aromasFromTastingNotes([])).toEqual([]);
    expect(aromasFromTastingNotes(null)).toEqual([]);
  });
});

describe('computeCaveHash', () => {
  it('stable quel que soit l’ordre, sensible au contenu', () => {
    const a = computeCaveHash([{ id: '1' }, { id: '2' }]);
    expect(a).toBe(computeCaveHash([{ id: '2' }, { id: '1' }]));
    expect(a).not.toBe(computeCaveHash([{ id: '1' }]));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('buildWineDocument', () => {
  it('concatène les champs renseignés', () => {
    expect(buildWineDocument({
      name: 'Grand Vin', producer: 'Château X', type: 'RED', vintage: 2015,
      grapeVarieties: ['Merlot'], aromaProfile: ['cassis'],
    })).toBe('Grand Vin | Château X | RED | millésime 2015 | cépages: Merlot | arômes: cassis');
  });
});

describe('convertKeysToCamelCase', () => {
  it('convertit récursivement objets et tableaux', () => {
    expect(toCamelCase('peak_start')).toBe('peakStart');
    expect(convertKeysToCamelCase([{ wine_id: 1, nose_notes: { top_aroma: 'x' }, tags: ['a_b'] }]))
      .toEqual([{ wineId: 1, noseNotes: { topAroma: 'x' }, tags: ['a_b'] }]);
    expect(convertKeysToCamelCase(null)).toBeNull();
  });

  it('laisse les Date intactes (sérialisées en ISO par res.json)', () => {
    const created = new Date('2026-01-02T03:04:05Z');
    const out = convertKeysToCamelCase({ created_at: created, nested: [{ consumed_date: created }] });
    expect(out.createdAt).toBe(created);
    expect(JSON.parse(JSON.stringify(out))).toEqual({
      createdAt: '2026-01-02T03:04:05.000Z', nested: [{ consumedDate: '2026-01-02T03:04:05.000Z' }],
    });
  });
});
