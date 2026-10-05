import { describe, it, expect } from 'vitest';
import { classifyWine, detectTransitions, rank } from '../../src/notifications/classify.js';

const TZ = 'Europe/Paris';
const NOW = new Date('2026-10-05T10:00:00Z'); // octobre 2026
const w = (id, extra = {}) => ({ id, name: `Vin ${id}`, vintage: 2018, type: 'RED', inventoryCount: 2, ...extra });
const settings = (extra = {}) => ({
  alertsEnabled: true, alertReady: true, alertClosing: true, alertPast: true,
  horizonMonths: 12, alertsSeededAt: '2026-01-01T00:00:00Z', ...extra,
});

describe('classifyWine', () => {
  const at = (wine, horizonMonths = 12, now = NOW) => classifyWine(wine, { horizonMonths, now, tz: TZ });

  it('GARDE avant le début d’apogée', () => {
    expect(at(w('a', { peakStart: 2028, peakEnd: 2035 }))).toMatchObject({ state: 'GARDE', estimated: false });
  });
  it('PRET une fois l’apogée commencée', () => {
    expect(at(w('a', { peakStart: 2024, peakEnd: 2030 }))).toMatchObject({ state: 'PRET', monthsLeft: 51 });
  });
  it('SE_REFERME dans l’horizon (mois courant inclus)', () => {
    expect(at(w('a', { peakStart: 2020, peakEnd: 2027 }), 15)).toMatchObject({ state: 'SE_REFERME', monthsLeft: 15 });
    expect(at(w('a', { peakStart: 2020, peakEnd: 2027 }), 14).state).toBe('PRET');
  });
  it('frontière du 31/12 : décembre = 1 mois, janvier suivant = DEPASSEE', () => {
    const wine = w('a', { peakStart: 2020, peakEnd: 2026 });
    expect(at(wine, 12, new Date('2026-12-31T20:00:00Z'))).toMatchObject({ state: 'SE_REFERME', monthsLeft: 1 });
    expect(at(wine, 12, new Date('2026-12-31T23:30:00Z'))).toMatchObject({ state: 'DEPASSEE', monthsLeft: 0 }); // 00 h 30 à Paris
  });
  it('formule naïve marquée « estimée » sans apogée enregistrée', () => {
    // RED 2018 → 2023-2028
    expect(at(w('a'))).toMatchObject({ state: 'PRET', peakStart: 2023, peakEnd: 2028, estimated: true });
  });
  it('null sans stock ou sans millésime ni apogée', () => {
    expect(at(w('a', { inventoryCount: 0 }))).toBeNull();
    expect(at(w('a', { vintage: null }))).toBeNull();
  });
});

describe('detectTransitions', () => {
  const run = (stored, wines, extra = {}) =>
    detectTransitions({ stored: new Map(Object.entries(stored)), wines, settings: settings(extra), now: NOW, tz: TZ });
  const pret = w('p', { peakStart: 2024, peakEnd: 2030 });
  const ferme = w('f', { peakStart: 2020, peakEnd: 2026 });
  const passe = w('d', { peakStart: 2015, peakEnd: 2020 });

  it('premier passage : enregistre sans notifier', () => {
    const r = run({}, [pret, ferme], { alertsSeededAt: null });
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'p', state: 'PRET' }, { wineId: 'f', state: 'SE_REFERME' }]);
  });
  it('montée d’état : notifie et enregistre', () => {
    const r = run({ p: 'GARDE', f: 'PRET' }, [pret, ferme]);
    expect(r.notify.map((n) => [n.wine.id, n.from, n.to])).toEqual([['p', 'GARDE', 'PRET'], ['f', 'PRET', 'SE_REFERME']]);
    expect(r.upserts).toHaveLength(2);
  });
  it('état inchangé : rien', () => {
    expect(run({ p: 'PRET' }, [pret])).toEqual({ notify: [], upserts: [], deletes: [] });
  });
  it('descente (apogée repoussée) : enregistrée en silence', () => {
    const r = run({ p: 'DEPASSEE' }, [pret]);
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'p', state: 'PRET' }]);
  });
  it('déclencheur désactivé : enregistrée en silence', () => {
    const r = run({ d: 'SE_REFERME' }, [passe], { alertPast: false });
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'd', state: 'DEPASSEE' }]);
  });
  it('alertes coupées : états suivis, aucune notification', () => {
    const r = run({ p: 'GARDE' }, [pret], { alertsEnabled: false });
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'p', state: 'PRET' }]);
  });
  it('vin nouveau après le premier passage : part de GARDE', () => {
    expect(run({}, [pret]).notify.map((n) => n.from)).toEqual(['GARDE']);
  });
  it('vin sans stock ou supprimé : état effacé', () => {
    const r = run({ p: 'PRET', x: 'PRET' }, [{ ...pret, inventoryCount: 0 }]);
    expect(r.deletes.sort()).toEqual(['p', 'x']);
  });
  it('rang croissant', () => {
    expect(['GARDE', 'PRET', 'SE_REFERME', 'DEPASSEE'].map(rank)).toEqual([0, 1, 2, 3]);
  });
});
