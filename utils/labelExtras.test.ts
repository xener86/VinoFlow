import { describe, it, expect, vi } from 'vitest';
import { labelExtras, ocrToAddText, withTimeout } from './labelImage';
import type { OcrResult } from '../types';

describe('labelExtras', () => {
  const r = { producer: 'Dom', appellation: 'Pauillac', name: 'Grand Vin', cuvee: 'Réserve', vintage: 2018, region: 'Bordeaux', country: 'France', format: '75cl', grape_varieties: ['Merlot'] } as OcrResult;
  it('champs de la photo tant que le texte vient de la photo', () => {
    expect(labelExtras(r, ocrToAddText(r))).toEqual({ appellation: 'Pauillac', region: 'Bordeaux', country: 'France', cuvee: 'Réserve', format: '75cl', grapeVarieties: ['Merlot'] });
  });
  it('rien si le texte a été modifié ou sans photo', () => {
    expect(labelExtras(r, 'Autre vin 2020')).toEqual({});
    expect(labelExtras(null, 'x')).toEqual({});
  });
});

describe('withTimeout', () => {
  it('valeur de repli si la promesse ne répond pas à temps', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<string>(() => {}), 1000, () => 'délai');
    vi.advanceTimersByTime(1000);
    expect(await p).toBe('délai');
    vi.useRealTimers();
    expect(await withTimeout(Promise.resolve('ok'), 1000, () => 'délai')).toBe('ok');
  });
});
