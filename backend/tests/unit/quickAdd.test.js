import { describe, it, expect } from 'vitest';
import { validateBatch, BatchError, MAX_LINES } from '../../src/quickAdd/validate.js';
import { identityKey } from '../../src/quickAdd/identity.js';

const BATCH = '5a0c1b52-6d4e-4f7a-9b1c-2d3e4f5a6b7c';
const W1 = '11111111-1111-4111-8111-111111111111';
const wine = { name: ' Grand Vin ', producer: 'Château Test', vintage: 2018, type: 'RED' };
const body = (lines, extra = {}) => ({ batchId: BATCH, lines, ...extra });
const errorsOf = (b) => { try { validateBatch(b); return null; } catch (e) { expect(e).toBeInstanceOf(BatchError); return e; } };

describe('identityKey', () => {
  it('ignore casse, accents et espaces', () => {
    expect(identityKey({ name: 'Grand  Vin', producer: 'CHÂTEAU test', vintage: 2018 }))
      .toBe(identityKey({ name: 'grand vin ', producer: 'Chateau Test', vintage: 2018 }));
    expect(identityKey({ name: 'Grand Vin', producer: null, vintage: null })).toBe('grand vin||');
  });
});

describe('validateBatch', () => {
  it('rafale mixte normalisée, défauts appliqués', () => {
    const b = validateBatch(body([
      { clientId: 'a', destination: 'CELLAR', wine, matchWineId: W1 },
      { clientId: 'b', destination: 'WISHLIST', wine, estimatedPrice: 40 },
      { clientId: 'c', destination: 'TASTING', wine, rating: 4, comment: ' Top ', matchWineId: W1, forceNew: true },
    ], { occasion: ' Salon ' }));
    expect(b.occasion).toBe('Salon');
    expect(b.lines[0]).toMatchObject({ quantity: 1, price: null, matchWineId: W1, forceNew: false, wine: { name: 'Grand Vin', format: '750ml', grapeVarieties: [], cuvee: null } });
    expect(b.lines[1]).toMatchObject({ estimatedPrice: 40 });
    expect(b.lines[2]).toMatchObject({ rating: 4, comment: 'Top', matchWineId: null, forceNew: true });
  });

  it('batchId et nombre de lignes contrôlés', () => {
    expect(errorsOf({ batchId: 'x', lines: [] }).message).toMatch(/batchId/);
    expect(errorsOf(body([])).message).toMatch(/lignes/);
    expect(errorsOf(body(Array.from({ length: MAX_LINES + 1 }, (_, i) => ({ clientId: `${i}`, destination: 'WISHLIST', wine }))))).toBeTruthy();
  });

  it('erreurs collectées ligne par ligne', () => {
    const e = errorsOf(body([
      { clientId: 'a', destination: 'CELLAR', wine: { name: ' ' } },
      { clientId: 'b', destination: 'CELLAR', wine, quantity: 100 },
      { clientId: 'c', destination: 'CELLAR', wine, price: -1 },
      { clientId: 'd', destination: 'TASTING', wine },
      { clientId: 'e', destination: 'OTHER', wine },
      { clientId: 'f', destination: 'CELLAR', wine: { ...wine, type: 'ORANGE' } },
      { clientId: 'g', destination: 'CELLAR', wine: { ...wine, vintage: 1700 } },
      { clientId: 'h', destination: 'CELLAR', wine, matchWineId: 'pas-un-uuid' },
      { clientId: 'i', destination: 'CELLAR', wine },
    ]));
    expect(e.lines.map((l) => l.clientId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(e.lines[0].message).toMatch(/Nom/);
    expect(e.lines[3].message).toMatch(/étoiles/);
  });
});
