import { describe, it, expect } from 'vitest';
import { zonedParts, currentOccurrence, isNewsletterDue, periodStart } from '../../src/notifications/schedule.js';

const TZ = 'Europe/Paris';
const s = (extra = {}) => ({ newsletterFrequency: 'monthly', newsletterWeekday: 1, newsletterHour: 9, lastNewsletterAt: null, ...extra });

describe('zonedParts', () => {
  it('donne l’heure locale de Paris (UTC+2 en été)', () => {
    expect(zonedParts(new Date('2026-10-05T07:30:00Z'), TZ)).toEqual({ year: 2026, month: 10, day: 5, hour: 9, weekday: 1 });
  });
});

describe('currentOccurrence', () => {
  it('mensuel : le 1er du mois courant une fois l’heure passée', () => {
    expect(currentOccurrence(s(), new Date('2026-10-05T10:00:00Z'), TZ)).toBe('2026-10-01T09');
  });
  it('mensuel : le 1er avant l’heure → mois précédent (et janvier → décembre)', () => {
    expect(currentOccurrence(s(), new Date('2026-10-01T05:00:00Z'), TZ)).toBe('2026-09-01T09');
    expect(currentOccurrence(s(), new Date('2027-01-01T05:00:00Z'), TZ)).toBe('2026-12-01T09');
  });
  it('hebdo : dernier jour choisi passé', () => {
    // lundi 5 octobre 2026, 12 h à Paris ; jour choisi = vendredi (5)
    expect(currentOccurrence(s({ newsletterFrequency: 'weekly', newsletterWeekday: 5 }), new Date('2026-10-05T10:00:00Z'), TZ)).toBe('2026-10-02T09');
  });
  it('hebdo : le jour même avant l’heure → semaine précédente', () => {
    expect(currentOccurrence(s({ newsletterFrequency: 'weekly', newsletterWeekday: 1 }), new Date('2026-10-05T05:00:00Z'), TZ)).toBe('2026-09-28T09');
  });
});

describe('isNewsletterDue', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  it('désactivée → jamais', () => {
    expect(isNewsletterDue(s({ newsletterFrequency: 'off' }), now, TZ)).toBe(false);
  });
  it('jamais envoyée → due', () => {
    expect(isNewsletterDue(s(), now, TZ)).toBe(true);
  });
  it('envoyée avant l’échéance → due (rattrapage après coupure)', () => {
    expect(isNewsletterDue(s({ lastNewsletterAt: '2026-09-01T07:05:00Z' }), now, TZ)).toBe(true);
  });
  it('envoyée à l’échéance → plus due', () => {
    expect(isNewsletterDue(s({ lastNewsletterAt: '2026-10-01T07:05:00Z' }), now, TZ)).toBe(false);
  });
  it('changement d’heure (dimanche 25 octobre 2026) : due une seule fois', () => {
    const weekly = s({ newsletterFrequency: 'weekly', newsletterWeekday: 7 });
    const at = new Date('2026-10-25T08:30:00Z'); // 9 h 30 à Paris (UTC+1 après le changement)
    expect(isNewsletterDue(weekly, at, TZ)).toBe(true);
    expect(isNewsletterDue({ ...weekly, lastNewsletterAt: at.toISOString() }, new Date('2026-10-25T10:00:00Z'), TZ)).toBe(false);
  });
});

describe('periodStart', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  it('depuis la dernière newsletter si plus récente que la période', () => {
    expect(periodStart(s({ lastNewsletterAt: '2026-10-01T07:00:00Z' }), now).toISOString()).toBe('2026-10-01T07:00:00.000Z');
  });
  it('au plus 31 jours (mensuel) ou 7 jours (hebdo)', () => {
    expect(periodStart(s(), now).toISOString()).toBe('2026-09-04T10:00:00.000Z');
    expect(periodStart(s({ newsletterFrequency: 'weekly' }), now).toISOString()).toBe('2026-09-28T10:00:00.000Z');
  });
});
