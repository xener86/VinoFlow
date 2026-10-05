import { describe, it, expect } from 'vitest';
import { localDay, addDays, needsSuggestion, buildWinePayload, payloadHash } from '../../src/menuflow/sync.js';

const APP = 'https://cave.example.com';
const byId = new Map([
  ['a', { id: 'a', name: 'Saumur-Champigny', cuvee: null, vintage: 2019, inventoryCount: 2 }],
  ['z', { id: 'z', name: 'Épuisé', vintage: 2010, inventoryCount: 0 }],
]);
const row = (extra = {}) => ({ dinnerDate: '2026-10-06', dishTitle: 'Poulet basquaise', suggestedWineId: 'a', suggestedForTitle: 'Poulet basquaise', suggestionReason: 'Fruit', pushedHash: null, ...extra });

describe('dates', () => {
  it('jour local et décalage', () => {
    expect(localDay(new Date('2026-10-05T22:30:00Z'), 'Europe/Paris')).toBe('2026-10-06');
    expect(addDays('2026-10-05', -35)).toBe('2026-08-31');
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06');
  });
});

describe('needsSuggestion', () => {
  it('dîner à venir sans conseil, plat changé ou vin épuisé', () => {
    expect(needsSuggestion(row({ suggestedWineId: null }), byId, '2026-10-05')).toBe(true);
    expect(needsSuggestion(row({ suggestedForTitle: 'Gratin' }), byId, '2026-10-05')).toBe(true);
    expect(needsSuggestion(row({ suggestedWineId: 'z' }), byId, '2026-10-05')).toBe(true);
    expect(needsSuggestion(row(), byId, '2026-10-05')).toBe(false);
  });
  it('jamais pour un dîner passé', () => {
    expect(needsSuggestion(row({ suggestedWineId: null, dinnerDate: '2026-10-01' }), byId, '2026-10-05')).toBe(false);
  });
});

describe('buildWinePayload', () => {
  const ctx = { inventoryById: byId, openedByDay: new Map([['2026-10-06', [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]]]), locations: new Map([['a', 'Casier B']]), appUrl: APP };
  it('conseil + bouteilles ouvertes, en snake_case pour MenuFlow', () => {
    expect(buildWinePayload(row(), ctx)).toEqual({
      dish_title: 'Poulet basquaise',
      suggested: { wine: 'Saumur-Champigny', vintage: 2019, reason: 'Fruit', location: 'Casier B', url: `${APP}/wine/a` },
      opened: [{ wine: 'Saumur-Champigny', vintage: 2019, reason: null, location: null, url: `${APP}/wine/a` }],
    });
  });
  it('conseil fait pour un autre plat : non envoyé', () => {
    expect(buildWinePayload(row({ suggestedForTitle: 'Gratin' }), ctx).suggested).toBeNull();
  });
  it('empreinte stable et sensible au contenu', () => {
    const p = buildWinePayload(row(), ctx);
    expect(payloadHash(p)).toBe(payloadHash(JSON.parse(JSON.stringify(p))));
    expect(payloadHash(p)).not.toBe(payloadHash({ ...p, opened: [] }));
  });
});
