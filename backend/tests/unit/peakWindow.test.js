import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPeakWindow } from '../../src/sommelier/peakWindow.js';
import { peakStatus } from '../../src/sommelier/peakCalculator.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('getPeakWindow (formule naïve)', () => {
  it('rouge : apogée de millésime+5 à millésime+10', () => {
    expect(getPeakWindow(2018, 'RED')).toEqual({ status: 'À Boire', peakStart: 2023, peakEnd: 2028 });
  });

  it('blanc : millésime+2, autres types : millésime+1', () => {
    expect(getPeakWindow(2022, 'WHITE')).toMatchObject({ peakStart: 2024, peakEnd: 2029 });
    expect(getPeakWindow(2022, 'SPARKLING')).toMatchObject({ peakStart: 2023, peakEnd: 2028 });
  });

  it('statuts selon l’année courante (2026)', () => {
    expect(getPeakWindow(2024, 'RED').status).toBe('Garde'); // 2029-2034
    expect(getPeakWindow(2015, 'RED').status).toBe('Boire Vite'); // 2020-2025, fini depuis 1 an
    expect(getPeakWindow(2010, 'RED').status).toBe('Apogée passée'); // 2015-2020
  });

  it('bornes exactes : début de fenêtre, fin, fin + 2 ans', () => {
    expect(getPeakWindow(2021, 'RED').status).toBe('À Boire'); // 2026-2031 : première année
    expect(getPeakWindow(2016, 'RED').status).toBe('À Boire'); // 2021-2026 : dernière année
    expect(getPeakWindow(2014, 'RED').status).toBe('Boire Vite'); // 2019-2024 : fin + 2
    expect(getPeakWindow(2013, 'RED').status).toBe('Apogée passée'); // 2018-2023 : fin + 3
  });

  it('renvoie null sans millésime ou sans type', () => {
    expect(getPeakWindow(null, 'RED')).toBeNull();
    expect(getPeakWindow(2018, undefined)).toBeNull();
    expect(getPeakWindow({ type: 'RED' })).toBeNull();
  });
});

describe('getPeakWindow (vin avec apogée stockée)', () => {
  it('priorité à peakStart/peakEnd (camelCase ou snake_case)', () => {
    expect(getPeakWindow({ vintage: 2018, type: 'RED', peakStart: 2030, peakEnd: 2040 }))
      .toEqual({ status: 'Garde', peakStart: 2030, peakEnd: 2040 });
    expect(getPeakWindow({ vintage: 2018, type: 'RED', peak_start: 2020, peak_end: 2026 }).status)
      .toBe('À Boire');
  });

  it('retombe sur la formule naïve si l’apogée est incomplète', () => {
    expect(getPeakWindow({ vintage: 2018, type: 'RED', peakStart: 2030 }))
      .toMatchObject({ peakStart: 2023, peakEnd: 2028 });
  });
});

describe('peakStatus (peakCalculator)', () => {
  it('Garde / À Boire / Boire Vite / Apogée passée', () => {
    expect(peakStatus(2028, 2035)).toBe('Garde');
    expect(peakStatus(2020, 2030)).toBe('À Boire');
    expect(peakStatus(2020, 2027)).toBe('Boire Vite'); // dernière année de fenêtre
    expect(peakStatus(2015, 2025)).toBe('Apogée passée');
  });
});
