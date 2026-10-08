import { describe, it, expect } from 'vitest';
import { buildMenuflowSections } from '../../src/menuflow/newsletterSections.js';

const APP = 'https://cave.example.com';
const TZ = 'Europe/Paris';
const NOW = new Date('2026-11-01T08:00:00Z');
const wines = [
  { id: 'a', name: 'Saumur-Champigny', vintage: 2019, inventoryCount: 2, peakStart: 2022, peakEnd: 2026 },
  { id: 'b', name: 'Chenin', vintage: 2020, inventoryCount: 1, peakStart: 2023, peakEnd: 2030 },
  { id: 'c', name: 'Épuisé', vintage: 2015, inventoryCount: 0 },
];
const p = (d, dish, extra = {}) => ({ dinnerDate: d, dishTitle: dish, verdicts: [], suggestedWineId: null, suggestionReason: null, suggestedForTitle: null, ...extra });
const base = (extra = {}) => ({
  pairings: [], openedByDay: new Map(), tastings: [], inventoryById: new Map(wines.map((w) => [w.id, w])),
  appUrl: APP, today: '2026-11-01', tz: TZ, now: NOW, horizonMonths: 12, ...extra,
});

describe('buildMenuflowSections', () => {
  it('rien à dire : null', () => {
    expect(buildMenuflowSections(base())).toBeNull();
  });

  it('vos accords : plat × vin, verdicts et note de dégustation', () => {
    const s = buildMenuflowSections(base({
      pairings: [p('2026-10-12', 'Poulet basquaise', { verdicts: [{ author: 'laure', rating: 'top' }, { author: 'xavier', rating: 'tres_bon' }] })],
      openedByDay: new Map([['2026-10-12', [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]]]),
      tastings: [{ wineId: 'a', date: '2026-10-12T20:00:00Z', overallRating: 16 }],
    }));
    expect(s.accords).toEqual([{ date: '12/10', dish: 'Poulet basquaise', wine: 'Saumur-Champigny 2019', verdict: 'Laure : top · Xavier : très bon', rating: '16/20', url: `${APP}/wine/a` }]);
    expect(s.forgotten).toEqual([]);
  });

  it('vous auriez pu : dîners passés sans bouteille, vins en stock d’abord, 3 au plus', () => {
    const s = buildMenuflowSections(base({
      pairings: [
        p('2026-10-14', 'Gratin de courge', { suggestedWineId: 'b', suggestionReason: 'Fraîcheur', suggestedForTitle: 'Gratin de courge' }),
        p('2026-10-15', 'Daube', { suggestedWineId: 'c', suggestionReason: 'x', suggestedForTitle: 'Daube' }),
        p('2026-10-16', 'Risotto', { suggestedWineId: 'a', suggestionReason: 'y', suggestedForTitle: 'Risotto' }),
        p('2026-10-17', 'Pizza', { suggestedWineId: 'a', suggestionReason: 'z', suggestedForTitle: 'Autre plat' }),
        p('2026-11-03', 'Futur', { suggestedWineId: 'a', suggestionReason: 'w', suggestedForTitle: 'Futur' }),
      ],
    }));
    expect(s.couldHave.map((c) => c.date)).toEqual(['16/10', '14/10', '15/10']); // a (SE_REFERME) puis b (en stock) puis c (épuisé)
    expect(s.couldHave[1]).toEqual({ date: '14/10', dish: 'Gratin de courge', wine: 'Chenin 2020', reason: 'Fraîcheur', url: `${APP}/wine/b` });
  });

  it('d’ailleurs : bouteille ouverte un soir de dîner sans dégustation depuis', () => {
    const s = buildMenuflowSections(base({
      pairings: [p('2026-10-12', 'Poulet basquaise'), p('2026-10-20', 'Soupe')],
      openedByDay: new Map([
        ['2026-10-12', [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]],
        ['2026-10-20', [{ wineId: 'b', wineName: 'Chenin', wineVintage: 2020 }]],
      ]),
      tastings: [{ wineId: 'b', date: '2026-10-21T10:00:00Z', overallRating: 15 }],
    }));
    expect(s.forgotten).toEqual([{ date: '12/10', dish: 'Poulet basquaise', wine: 'Saumur-Champigny 2019', url: `${APP}/tasting/a` }]);
  });

  it('limites : 8 accords, 3 oublis', () => {
    const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(10 + i).padStart(2, '0')}`);
    const s = buildMenuflowSections(base({
      pairings: days.map((d) => p(d, `Plat ${d}`)),
      openedByDay: new Map(days.map((d) => [d, [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]])),
    }));
    expect(s.accords).toHaveLength(8);
    expect(s.accords[0].date).toBe('19/10'); // plus récent d'abord
    expect(s.forgotten).toHaveLength(3);
  });
});
