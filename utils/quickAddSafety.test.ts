import { describe, it, expect } from 'vitest';
import {
  newLine, markReading, withNewPhoto, toManual, applyReadResult, afterSave, editWine, rematch, makeRunner, type DraftLine,
} from './quickAddQueue';
import type { CellarWine, OcrResult } from '../types';

// Cas relevés en revue : lectures tardives, enregistrement partiel,
// rapprochement après correction ou chargement tardif de la cave.

const ocr = (o: Partial<OcrResult> = {}): OcrResult => ({
  producer: 'Château Test', name: 'Grand Vin', cuvee: null, vintage: 2018, region: null, appellation: null,
  country: null, type: 'RED', abv: null, format: null, grape_varieties: [], confidence: 'HIGH', notes: null, ...o,
} as OcrResult);
const T = 1_000_000;
const line = (o: Partial<DraftLine> = {}): DraftLine => ({ ...newLine('l1', 'b64', T), ...o });
const cellar = [
  { id: 'w18', name: 'Grand Vin', producer: 'Château Test', vintage: 2018, inventoryCount: 2, cuvee: '', appellation: '' },
  { id: 'w19', name: 'Grand Vin', producer: 'Château Test', vintage: 2019, inventoryCount: 1, cuvee: '', appellation: '' },
] as unknown as CellarWine[];

describe('applyReadResult', () => {
  it('ignore une lecture tardive si la photo a été reprise ou la ligne saisie à la main', () => {
    const reading = markReading(line());
    expect(applyReadResult(withNewPhoto(reading, 'nouvelle'), reading, { kind: 'ok', ocr: ocr() }, T)).toBeNull();
    expect(applyReadResult(toManual(reading), reading, { kind: 'ok', ocr: ocr() }, T)).toBeNull();
    expect(applyReadResult(reading, reading, { kind: 'ok', ocr: ocr() }, T)?.status).toBe('READY');
  });
});

describe('afterSave', () => {
  it('ne retire que les lignes enregistrées', () => {
    const now = [line({ id: 'a' }), line({ id: 'b' }), line({ id: 'c' })];
    expect(afterSave(now, { lines: [{ clientId: 'a' }, { clientId: 'b' }] }).map((l) => l.id)).toEqual(['c']);
  });
});

describe('editWine', () => {
  it('corriger le vin refait le rapprochement', () => {
    const matched = line({ status: 'READY', ocr: ocr(), matchWineId: 'w18' });
    expect(editWine(matched, { vintage: 2019 }, cellar).matchWineId).toBe('w19');
    expect(editWine(matched, { vintage: 2010 }, cellar).matchWineId).toBeNull();
    expect(editWine(matched, { cuvee: 'Réserve' }, cellar)).toMatchObject({ matchWineId: 'w18', edits: { cuvee: 'Réserve' } });
    expect(editWine({ ...matched, forceNew: true, matchWineId: null }, { vintage: 2019 }, cellar).matchWineId).toBeNull();
  });
});

describe('rematch', () => {
  it('rapproche les lignes lues avant le chargement de la cave', () => {
    const lines = [
      line({ id: 'a', status: 'READY', ocr: ocr() }),
      line({ id: 'b', status: 'READY', ocr: ocr(), forceNew: true }),
      line({ id: 'c', status: 'PENDING' }),
      line({ id: 'd', status: 'READY', ocr: ocr(), matchWineId: 'w19' }),
    ];
    expect(rematch(lines, cellar).map((l) => [l.id, l.matchWineId])).toEqual([['a', 'w18']]);
  });
});

describe('makeRunner', () => {
  it('une seule exécution à la fois, libérée même en cas d’erreur', async () => {
    const runner = makeRunner();
    let release: () => void = () => {};
    const first = runner.run(() => new Promise<void>((r) => { release = r; }));
    expect(await runner.run(async () => {})).toBe(false);
    release();
    expect(await first).toBe(true);
    await expect(runner.run(async () => { throw new Error('quota'); })).rejects.toThrow('quota');
    expect(runner.busy).toBe(false);
  });
});
