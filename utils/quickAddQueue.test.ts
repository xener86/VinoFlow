import { describe, it, expect } from 'vitest';
import {
  newLine, wineOf, markReading, nextState, pickNext, nextWakeUp, withNewPhoto, toManual, confirmLine,
  lineProblem, summarize, buildPayload, type DraftLine,
} from './quickAddQueue';
import type { OcrResult } from '../types';

const ocr = (o: Partial<OcrResult> = {}): OcrResult => ({
  producer: 'Château Test', name: 'Grand Vin', cuvee: null, vintage: 2018, region: 'Bordeaux', appellation: 'Pauillac',
  country: 'France', type: 'RED', abv: 13, format: '75cl', grape_varieties: ['Merlot'], confidence: 'HIGH', notes: null, ...o,
} as OcrResult);
const T = 1_000_000;
const line = (o: Partial<DraftLine> = {}): DraftLine => ({ ...newLine('l1', 'b64', T), ...o });

describe('nextState', () => {
  it('lecture sûre → prêt ; incertaine ou vide → à vérifier', () => {
    expect(nextState(markReading(line()), { kind: 'ok', ocr: ocr() }, T).status).toBe('READY');
    expect(nextState(line(), { kind: 'ok', ocr: ocr({ confidence: 'LOW' }) }, T).status).toBe('REVIEW');
    expect(nextState(line(), { kind: 'ok', ocr: ocr({ name: null, producer: null }) }, T).status).toBe('REVIEW');
  });

  it('pas de réseau : en attente, délai doublé et plafonné à 5 min', () => {
    const a = nextState(line(), { kind: 'network' }, T);
    expect(a).toMatchObject({ status: 'PENDING', attempts: 1, retryAt: T + 30_000 });
    expect(nextState(line({ attempts: 3 }), { kind: 'network' }, T).retryAt).toBe(T + 240_000);
    expect(nextState(line({ attempts: 9 }), { kind: 'network' }, T).retryAt).toBe(T + 300_000);
  });

  it('429 : attente du délai indiqué (60 s par défaut), sans compter d’échec', () => {
    expect(nextState(line(), { kind: 'http', status: 429, retryAfter: 120 }, T)).toMatchObject({ status: 'PENDING', retryAt: T + 120_000, serverErrors: 0 });
    expect(nextState(line(), { kind: 'http', status: 429 }, T).retryAt).toBe(T + 60_000);
  });

  it('5xx : réessai, puis échec à la 5e erreur de suite', () => {
    expect(nextState(line({ serverErrors: 3 }), { kind: 'http', status: 500 }, T)).toMatchObject({ status: 'PENDING', serverErrors: 4 });
    expect(nextState(line({ serverErrors: 4 }), { kind: 'http', status: 502 }, T)).toMatchObject({ status: 'FAILED', retryAt: null });
  });

  it('4xx : échec immédiat avec message', () => {
    expect(nextState(line(), { kind: 'http', status: 413, message: 'Trop gros' }, T)).toMatchObject({ status: 'FAILED', error: 'Trop gros' });
  });

  it('une lecture tardive n’écrase pas les saisies', () => {
    const edited = { ...markReading(line()), edits: { name: 'Mon nom', vintage: 2017 } };
    const done = nextState(edited, { kind: 'ok', ocr: ocr() }, T);
    expect(wineOf(done)).toMatchObject({ name: 'Mon nom', vintage: 2017, producer: 'Château Test', appellation: 'Pauillac' });
  });
});

describe('file', () => {
  it('la plus ancienne ligne en attente dont l’échéance est passée', () => {
    const lines = [line({ id: 'b', createdAt: T + 2 }), line({ id: 'a', createdAt: T + 1, retryAt: T + 10 }), line({ id: 'c', createdAt: T + 3, status: 'READY' })];
    expect(pickNext(lines, T)?.id).toBe('b');
    expect(pickNext(lines, T + 10)?.id).toBe('a');
    expect(nextWakeUp(lines, T)).toBe(T + 10);
    expect(pickNext([line({ photo: null })], T)).toBeNull();
  });

  it('nouvelle photo, saisie manuelle, validation', () => {
    expect(withNewPhoto(line({ status: 'FAILED', serverErrors: 5, ocr: ocr() }), 'new')).toMatchObject({ photo: 'new', status: 'PENDING', serverErrors: 0, attempts: 0, ocr: null, retryAt: null });
    expect(toManual(line({ status: 'FAILED' }))).toMatchObject({ photo: null, status: 'REVIEW' });
    expect(confirmLine(line({ status: 'REVIEW' })).status).toBe('READY');
    expect(newLine('x', null, T).status).toBe('REVIEW');
  });
});

describe('lineProblem et summarize', () => {
  const ready = (o: Partial<DraftLine> = {}) => line({ status: 'READY', ocr: ocr(), ...o });
  it('bloque tant que la ligne n’est pas prête et complète', () => {
    expect(lineProblem(line())).toMatch(/attente/);
    expect(lineProblem(line({ status: 'REVIEW', ocr: ocr() }))).toMatch(/vérifier/);
    expect(lineProblem(line({ status: 'FAILED' }))).toMatch(/impossible/);
    expect(lineProblem(ready({ edits: { name: ' ' } }))).toMatch(/Nom/);
    expect(lineProblem(ready({ quantity: 0 }))).toMatch(/Quantité/);
    expect(lineProblem(ready({ destination: 'TASTING' }))).toMatch(/Note/);
    expect(lineProblem(ready({ destination: 'TASTING', rating: 4 }))).toBeNull();
  });
  it('récapitulatif de la barre du bas', () => {
    expect(summarize([ready({ quantity: 6 }), ready({ quantity: 2 }), ready({ destination: 'WISHLIST' }), ready({ destination: 'TASTING', rating: 3 }), line()]))
      .toEqual({ lines: 5, cellar: 3, bottles: 9, wishlist: 1, tastings: 1, blocking: 1 });
  });
});

describe('buildPayload', () => {
  it('vin = lecture + saisies ; champs selon la destination', () => {
    const lines = [
      line({ id: 'a', status: 'READY', ocr: ocr(), edits: { cuvee: 'Réserve' }, quantity: 3, price: 12.5, matchWineId: 'w1' }),
      line({ id: 'b', status: 'READY', ocr: ocr(), destination: 'WISHLIST', estimatedPrice: 40, matchWineId: 'w1' }),
      line({ id: 'c', status: 'READY', ocr: ocr(), destination: 'TASTING', rating: 4, comment: '  Superbe ', forceNew: true, matchWineId: 'w1' }),
    ];
    const body = buildPayload({ batchId: 'B', occasion: ' Salon ' }, lines);
    expect(body).toEqual({
      batchId: 'B', occasion: 'Salon',
      lines: [
        { clientId: 'a', destination: 'CELLAR', wine: expect.objectContaining({ name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', cuvee: 'Réserve', appellation: 'Pauillac', grapeVarieties: ['Merlot'], format: '75cl' }), matchWineId: 'w1', quantity: 3, price: 12.5 },
        { clientId: 'b', destination: 'WISHLIST', wine: expect.any(Object), estimatedPrice: 40 },
        { clientId: 'c', destination: 'TASTING', wine: expect.any(Object), forceNew: true, rating: 4, comment: 'Superbe' },
      ],
    });
    expect(JSON.parse(JSON.stringify(body)).lines[1]).not.toHaveProperty('matchWineId');
  });
});
