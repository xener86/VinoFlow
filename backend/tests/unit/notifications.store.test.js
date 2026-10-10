import { describe, it, expect } from 'vitest';
import { validateSettingsPatch, publicSettings, DEFAULT_SETTINGS } from '../../src/notifications/store.js';

describe('validateSettingsPatch', () => {
  it('garde les champs valides et ignore les inconnus', () => {
    const { patch, errors } = validateSettingsPatch({
      gotifyEnabled: true, gotifyUrl: 'https://push.example.com/', horizonMonths: 6,
      newsletterFrequency: 'weekly', newsletterWeekday: 7, newsletterHour: 0, userId: 'pirate',
    });
    expect(errors).toEqual([]);
    expect(patch).toEqual({
      gotifyEnabled: true, gotifyUrl: 'https://push.example.com', horizonMonths: 6,
      newsletterFrequency: 'weekly', newsletterWeekday: 7, newsletterHour: 0,
    });
  });
  it('refuse les valeurs hors bornes ou mal typées', () => {
    const { errors } = validateSettingsPatch({
      gotifyUrl: 'ftp://x', horizonMonths: 0, newsletterHour: 24, newsletterWeekday: 8,
      newsletterFrequency: 'daily', alertPast: 'oui',
    });
    expect(errors).toHaveLength(6);
  });
  it('jeton : vide = inchangé, null = effacé, chaîne = remplacé', () => {
    expect(validateSettingsPatch({ gotifyToken: '' }).patch).toEqual({});
    expect(validateSettingsPatch({ gotifyToken: null }).patch).toEqual({ gotifyToken: null });
    expect(validateSettingsPatch({ gotifyToken: ' abc ' }).patch).toEqual({ gotifyToken: 'abc' });
  });
  it('URL vide = effacée', () => {
    expect(validateSettingsPatch({ gotifyUrl: '' }).patch).toEqual({ gotifyUrl: null });
  });
});

describe('publicSettings', () => {
  it('ne renvoie jamais le jeton', () => {
    const out = publicSettings({ ...DEFAULT_SETTINGS, userId: 'u', gotifyToken: 'secret', alertsSeededAt: null });
    expect(out.gotifyToken).toBeUndefined();
    expect(out.userId).toBeUndefined();
    expect(out.gotifyTokenSet).toBe(true);
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});
