import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/aiService.js', () => ({
  generateJson: vi.fn(),
  isProviderConfigured: vi.fn(() => true),
}));

const { generateJson, isProviderConfigured } = await import('../../src/services/aiService.js');
const { buildNewsletter } = await import('../../src/notifications/newsletter.js');
const { sanitizeNote, buildNoteInput, generateSommelierNote } = await import('../../src/notifications/sommelierNote.js');

const TZ = 'Europe/Paris';
const NOW = new Date('2026-11-01T08:00:00Z');
const SINCE = new Date('2026-10-01T07:00:00Z');
const APP = 'https://cave.example.com';
const settings = { horizonMonths: 12, newsletterFrequency: 'monthly' };
const w = (id, extra = {}) => ({ id, name: `Vin ${id}`, vintage: 2015, type: 'RED', region: 'Bordeaux', inventoryCount: 2, ...extra });

const data = (inventory, extra = {}) => ({
  inventory,
  journal: [{ type: 'IN', quantity: 6 }, { type: 'OUT', quantity: 1 }, { type: 'GIFT', quantity: 1 }, { type: 'MOVE', quantity: 3 }],
  spending: { count: 6, total: 90 },
  cellarValue: 1234.5,
  tastings: [{ wineId: 'p', name: 'Vin p', vintage: 2015, date: '2026-10-20T18:00:00Z', overallRating: 17 }],
  locations: new Map([['d', 'Cave du bas']]),
  ...extra,
});
const build = (d, extra = {}) => buildNewsletter(d, { settings, now: NOW, tz: TZ, since: SINCE, appUrl: APP, note: null, ...extra });

describe('buildNewsletter', () => {
  const inventory = [
    w('d', { peakStart: 2010, peakEnd: 2020 }),            // DEPASSEE
    w('f', { peakStart: 2020, peakEnd: 2026 }),            // SE_REFERME, 2 mois
    w('n', { peakStart: 2026, peakEnd: 2032 }),            // PRET, entré cette année
    w('p', { peakStart: 2022, peakEnd: 2032 }),            // PRET depuis longtemps
    w('g', { peakStart: 2030, peakEnd: 2040 }),            // GARDE
    w('z', { inventoryCount: 0, peakStart: 2010, peakEnd: 2020 }), // épuisé
  ];

  it('en-tête, chiffres clés et blocs', () => {
    const nl = build(data(inventory));
    expect(nl.subject).toBe('VinoFlow — votre cave, novembre 2026');
    expect(nl.title).toBe('Votre cave — novembre 2026');
    expect(nl.periodLabel).toBe('novembre 2026');
    expect(nl.heading).toEqual({ lead: 'Que boire', accent: 'ce mois-ci' });
    expect(nl.intro).toContain('01/10');
    expect(nl.stats).toEqual({ bottlesInCellar: 10, winesInCellar: 5, bottlesIn: 6, spent: 90, bottlesOut: 2, gifts: 1, cellarValue: 1234.5 });
    expect(nl.urgent.map((r) => r.url)).toEqual([`${APP}/wine/d`, `${APP}/wine/f`]);
    expect(nl.urgent[0]).toMatchObject({ label: 'Vin d', sub: 'Bordeaux · 2015', location: 'Cave du bas', qty: 2, badge: { text: 'PASSÉ', tone: 'passe' } });
    expect(nl.urgent[1].badge).toEqual({ text: '2 MOIS', tone: 'bientot' });
    expect(nl.ready).toEqual([{ label: 'Vin n', sub: 'Bordeaux 2015 · 2 bt · apogée 2026–2032', url: `${APP}/wine/n` }]);
    expect(nl.tastings).toEqual([{ label: 'Vin p', sub: '2015 · 20/10', rating: '17/20', url: `${APP}/wine/p` }]);
    expect(nl.menuflow).toBeNull();
  });

  it('hebdo : « cette semaine »', () => {
    expect(build(data(inventory), { settings: { ...settings, newsletterFrequency: 'weekly' } }).heading.accent).toBe('cette semaine');
  });

  it('estimée signalée dans le sous-titre', () => {
    const nl = build(data([w('e', { vintage: 2008 })])); // naïf RED 2008 → 2013-2018 : DEPASSEE estimée
    expect(nl.urgent[0].sub).toBe('Bordeaux · 2008 · estimée');
  });

  it('au plus 10 vins à ouvrir', () => {
    const many = Array.from({ length: 15 }, (_, i) => w(`x${i}`, { peakStart: 2010, peakEnd: 2020 }));
    expect(build(data(many)).urgent).toHaveLength(10);
  });

  it('cave vide : bilan à zéro, aucun bloc, pas d’erreur', () => {
    const nl = build({ inventory: [], journal: [], spending: { count: 0, total: 0 }, cellarValue: 0, tastings: [], locations: new Map() });
    expect(nl.urgent).toEqual([]);
    expect(nl.ready).toEqual([]);
    expect(nl.tastings).toEqual([]);
    expect(nl.stats).toEqual({ bottlesInCellar: 0, winesInCellar: 0, bottlesIn: 0, spent: 0, bottlesOut: 0, gifts: 0, cellarValue: 0 });
  });
});

describe('mot du sommelier', () => {
  const inventory = [w('a', { peakStart: 2010, peakEnd: 2020 }), w('b', { peakStart: 2024, peakEnd: 2030 })];
  const byId = new Map(inventory.map((x) => [x.id, x]));

  beforeEach(() => { generateJson.mockReset(); isProviderConfigured.mockReturnValue(true); });

  it('sanitizeNote écarte les vins inventés et limite à 3', () => {
    const note = sanitizeNote({
      intro: ' Bonjour ',
      picks: [{ wineId: 'a', reason: 'r1' }, { wineId: 'zzz', reason: 'inventé' }, { wineId: 'b', reason: 'r2' }, { wineId: 'a', reason: 'r3' }, { wineId: 'b', reason: 'r4' }],
      seasonalPairing: null, closing: 'Santé',
    }, byId);
    expect(note.intro).toBe('Bonjour');
    expect(note.picks.map((p) => [p.wine.id, p.reason])).toEqual([['a', 'r1'], ['b', 'r2'], ['a', 'r3']]);
    expect(note.closing).toBe('Santé');
    expect(sanitizeNote({ picks: [] }, byId)).toBeNull();
  });

  it('buildNoteInput : vins classés, plus urgents d’abord, accords du mois', () => {
    const input = buildNoteInput(inventory, { settings, now: NOW, tz: TZ, accords: [{ dish: 'Poulet', wine: 'Vin a 2015' }] });
    expect(input.mois).toBe('novembre 2026');
    expect(input.vins.map((v) => v.id)).toEqual(['a', 'b']);
    expect(input.vins[0]).toMatchObject({ etat: 'DEPASSEE', apogee: '2010-2020', stock: 2 });
    expect(input.accordsDuMois).toEqual(['Poulet × Vin a 2015']);
  });

  it('generateSommelierNote : sortie validée', async () => {
    generateJson.mockResolvedValue({ intro: 'Ouvrez Vin a', picks: [{ wineId: 'a', reason: 'avant qu’il ne décline' }], seasonalPairing: 'Gibier', closing: null });
    const note = await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ });
    expect(generateJson).toHaveBeenCalledWith('newsletter', expect.objectContaining({ schema: expect.any(Object) }));
    expect(note.picks[0].wine.id).toBe('a');
  });

  it('sans IA, en erreur ou trop lente : null, sans lever', async () => {
    isProviderConfigured.mockReturnValue(false);
    expect(await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ })).toBeNull();
    isProviderConfigured.mockReturnValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    generateJson.mockRejectedValue(new Error('boom'));
    expect(await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ })).toBeNull();
    generateJson.mockImplementation(() => new Promise(() => {}));
    expect(await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ, timeoutMs: 20 })).toBeNull();
  });
});
