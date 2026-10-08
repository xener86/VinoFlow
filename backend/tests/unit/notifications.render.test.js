import { describe, it, expect } from 'vitest';
import { renderAlert, renderNewsletter, renderNewsletterEmail, testMessage } from '../../src/notifications/render.js';
import { wineLabel, stateLabel, windowBadge, periodTitle } from '../../src/notifications/format.js';

const APP = 'https://cave.example.com';
const wine = (id, name, extra = {}) => ({ id, name, vintage: 2015, inventoryCount: 2, ...extra });
const t = (w, to, extra = {}) => ({ wine: w, from: 'PRET', to, peakStart: 2018, peakEnd: 2026, monthsLeft: 3, estimated: false, ...extra });

const nl = (extra = {}) => ({
  subject: 'VinoFlow — votre cave, novembre 2026',
  title: 'Votre cave — novembre 2026',
  periodLabel: 'novembre 2026',
  heading: { lead: 'Que boire', accent: 'ce mois-ci' },
  intro: 'Votre cave depuis le 01/10.',
  appUrl: APP,
  stats: { bottlesInCellar: 98, winesInCellar: 30, bottlesIn: 9, spent: 212, bottlesOut: 4, gifts: 1, cellarValue: 4320 },
  urgent: Array.from({ length: 7 }, (_, i) => ({
    label: `Vin ${i}`, sub: 'Alsace · 2021', location: 'Casier A', qty: 2,
    badge: i === 0 ? { text: 'PASSÉ', tone: 'passe' } : { text: '2 MOIS', tone: 'bientot' }, url: `${APP}/wine/${i}`,
  })),
  ready: [{ label: 'Les Galets Roulés', sub: 'Vallée du Rhône 2019 · 5 bt · apogée 2026–2032', url: `${APP}/wine/g` }],
  tastings: [{ label: 'Maury Grenat', sub: '2018 · 12/10', rating: '17/20', url: `${APP}/wine/m` }],
  menuflow: null,
  note: { intro: 'x'.repeat(900), picks: [{ wine: wine('a', 'Alpha'), reason: 'parfait en automne' }], seasonalPairing: 'Gibier', closing: null },
  ...extra,
});

describe('format', () => {
  it('libellés', () => {
    expect(wineLabel({ name: 'Château X', cuvee: 'Réserve', vintage: 2015 })).toBe('Château X Réserve 2015');
    expect(stateLabel({ state: 'SE_REFERME', peakStart: 2018, peakEnd: 2026, estimated: true })).toBe('à boire avant fin 2026 (estimée)');
    expect(stateLabel({ state: 'DEPASSEE', peakStart: 2010, peakEnd: 2020, estimated: false })).toBe('apogée dépassée (fin 2020)');
    expect(stateLabel({ state: 'PRET', peakStart: 2024, peakEnd: 2030, estimated: false })).toBe('en apogée 2024–2030');
  });
  it('badges de fenêtre', () => {
    expect(windowBadge({ state: 'DEPASSEE', monthsLeft: -3, peakEnd: 2020 })).toEqual({ text: 'PASSÉ', tone: 'passe' });
    expect(windowBadge({ state: 'SE_REFERME', monthsLeft: 2, peakEnd: 2026 })).toEqual({ text: '2 MOIS', tone: 'bientot' });
    expect(windowBadge({ state: 'SE_REFERME', monthsLeft: 14, peakEnd: 2027 })).toEqual({ text: 'FIN 2027', tone: 'neutre' });
  });
  it('titre de période', () => {
    const now = new Date('2026-11-01T08:00:00Z');
    expect(periodTitle({ newsletterFrequency: 'monthly' }, now, 'Europe/Paris')).toBe('novembre 2026');
    expect(periodTitle({ newsletterFrequency: 'weekly' }, now, 'Europe/Paris')).toBe('semaine du 1 novembre 2026');
  });
});

describe('renderNewsletterEmail (gabarit Cockpit)', () => {
  it('reprend l’identité Cockpit', () => {
    const html = renderNewsletterEmail(nl());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('CELLAR.OS');
    expect(html).toContain('Que boire <em');
    expect(html).toContain('ce mois-ci</em>');
    expect(html).toContain('#7f1d1d');
    expect(html).toContain('@media (max-width: 620px)');
    expect(html).toContain('>PASSÉ<');
    expect(html).toContain('Avant qu’ils ne passent leur pic');
    expect(html).toContain('Enfin prêts');
    expect(html).toContain('17/20');
    expect(html).toContain('RÉDIGÉ PAR L’IA');
    expect(html).toContain(`href="${APP}/wine/0"`);
    expect(html).toContain('Ouvrir la cave');
  });
  it('sans mot du sommelier ni dégustations : blocs absents', () => {
    const html = renderNewsletterEmail(nl({ note: null, tastings: [] }));
    expect(html).not.toContain('RÉDIGÉ PAR L’IA');
    expect(html).not.toContain('DÉGUSTATIONS DU MOIS');
  });
  it('échappe tout texte venu de la base', () => {
    const html = renderNewsletterEmail(nl({ urgent: [{ label: '<b>Pirate</b>', sub: '', location: null, qty: 1, badge: { text: 'PASSÉ', tone: 'passe' }, url: `${APP}/wine/x` }] }));
    expect(html).not.toContain('<b>Pirate</b>');
    expect(html).toContain('&lt;b&gt;Pirate&lt;/b&gt;');
  });
});

describe('renderNewsletter', () => {
  it('Gotify court (5 vins, mot tronqué), texte complet', () => {
    const m = renderNewsletter(nl());
    expect(m.subject).toBe('VinoFlow — votre cave, novembre 2026');
    expect(m.title).toBe('Votre cave — novembre 2026');
    expect(m.markdown).toContain('Vin 4');
    expect(m.markdown).not.toContain('Vin 5');
    expect(m.markdown).toContain(`[Ouvrir la cave](${APP})`);
    expect(m.markdown.length).toBeLessThan(2000);
    expect(m.text).toContain('Vin 6');
    expect(m.priority).toBe(4);
  });
});

describe('renderAlert', () => {
  it('regroupe par transition, liens vers les fiches, priorité 5 si apogée dépassée', () => {
    const m = renderAlert([
      t(wine('a', 'Alpha'), 'PRET'),
      t(wine('b', 'Bravo'), 'DEPASSEE', { peakEnd: 2020 }),
      t(wine('c', 'Charlie'), 'PRET'),
    ], { appUrl: APP });
    expect(m.title).toBe('3 vins changent d’état');
    expect(m.priority).toBe(5);
    expect(m.markdown).toContain('**Entrés en apogée**');
    expect(m.markdown).toContain(`[Alpha 2015](${APP}/wine/a)`);
    expect(m.markdown.indexOf('Apogée dépassée')).toBeLessThan(m.markdown.indexOf('Entrés en apogée'));
    expect(m.html).toContain('CELLAR.OS');
    expect(m.html).toContain(`${APP}/wine/b`);
    expect(m.subject).toBe('VinoFlow — 3 vins changent d’état');
  });
  it('un seul vin, priorité 4 sans apogée dépassée', () => {
    const m = renderAlert([t(wine('a', 'Alpha'), 'SE_REFERME')], { appUrl: APP });
    expect(m.title).toBe('1 vin change d’état');
    expect(m.priority).toBe(4);
  });
  it('échappe le HTML et neutralise le markdown des noms de vin', () => {
    const m = renderAlert([t(wine('a', '<b>Pirate</b> [x](http://evil)'), 'PRET')], { appUrl: APP });
    expect(m.html).not.toContain('<b>Pirate</b>');
    expect(m.markdown).not.toContain('](http://evil)');
  });
});

describe('testMessage', () => {
  it('message de test lisible, gabarit Cockpit', () => {
    const m = testMessage({ appUrl: APP });
    expect(m.title).toBe('VinoFlow — test de notification');
    expect(m.html).toContain('CELLAR.OS');
  });
});
