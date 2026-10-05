import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPeakWindow, getPeakBadgeStyles } from './peakWindow';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('getPeakWindow (front)', () => {
  it('formule naïve selon le type', () => {
    expect(getPeakWindow(2018, 'RED')).toEqual({ status: 'À Boire', peakStart: 2023, peakEnd: 2028, source: 'NAIVE' });
    expect(getPeakWindow(2022, 'WHITE')).toMatchObject({ peakStart: 2024, peakEnd: 2029 });
    expect(getPeakWindow(2022, 'ROSE')).toMatchObject({ peakStart: 2023, peakEnd: 2028 });
  });

  it('bornes : fin de fenêtre, fin + 2, fin + 3', () => {
    expect(getPeakWindow(2016, 'RED').status).toBe('À Boire'); // 2021-2026
    expect(getPeakWindow(2014, 'RED').status).toBe('Boire Vite'); // 2019-2024
    expect(getPeakWindow(2013, 'RED').status).toBe('Apogée passée'); // 2018-2023
    expect(getPeakWindow(2024, 'RED').status).toBe('Garde');
  });

  it('apogée stockée prioritaire, avec source et confiance', () => {
    expect(getPeakWindow({ vintage: 2018, type: 'RED', peakStart: 2030, peakEnd: 2040, peakSource: 'USER' }))
      .toEqual({ status: 'Garde', peakStart: 2030, peakEnd: 2040, source: 'USER', confidence: 'MEDIUM' });
    expect(getPeakWindow({ peakStart: 2020, peakEnd: 2030 }).source).toBe('AI');
  });

  it('vin sans millésime ni apogée : Garde par défaut', () => {
    expect(getPeakWindow({ type: 'RED' })).toEqual({ status: 'Garde', peakStart: 0, peakEnd: 0, source: 'NAIVE' });
  });
});

describe('getPeakBadgeStyles', () => {
  it('une couleur par statut, bleu par défaut', () => {
    expect(getPeakBadgeStyles('À Boire').bg).toBe('bg-green-100');
    expect(getPeakBadgeStyles('Boire Vite').bg).toBe('bg-orange-100');
    expect(getPeakBadgeStyles('Apogée passée').bg).toBe('bg-red-100');
    expect(getPeakBadgeStyles('Garde').bg).toBe('bg-blue-100');
    expect(getPeakBadgeStyles('inconnu').bg).toBe('bg-blue-100');
  });
});
