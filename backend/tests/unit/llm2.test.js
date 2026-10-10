import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/services/aiService.js', () => ({ generateJson: vi.fn() }));
const { generateJson } = await import('../../src/services/aiService.js');
const { argueAndPick } = await import('../../src/sommelier/llm2.js');
const { PICKS_SCHEMA } = await import('../../src/sommelier/schemas.js');

const cand = (id) => ({ wine: { id, name: id, type: 'RED', sensoryProfile: {}, aromaProfile: [] }, score: 0.5 });
const candidates = ['a', 'b', 'c', 'd', 'e'].map(cand);
const criteria = { wine_profile: {}, decomposition: {}, rationale: '' };

describe('argueAndPick — alternatives', () => {
  it('le schéma exige alternatives', () => {
    expect(PICKS_SCHEMA.required).toContain('alternatives');
  });
  it('garde les alternatives valides, écarte doublons et inconnus, plafonne à 5', async () => {
    generateJson.mockResolvedValue({
      safe: { wine_id: 'a', reason: 'r', service_temp_c: 16, decant_minutes: 0 },
      personal: null, creative: null, global_advice: 'g',
      alternatives: [
        { wine_id: 'b', reason: 'ok' }, { wine_id: 'a', reason: 'déjà choisi' },
        { wine_id: 'zz', reason: 'inconnu' }, { wine_id: 'b', reason: 'doublon' },
        { wine_id: 'c', reason: '' }, { wine_id: 'd', reason: 'd' }, { wine_id: 'e', reason: 'e' },
      ],
    });
    const r = await argueAndPick('plat', criteria, candidates);
    expect(r.alternatives).toEqual([{ wine_id: 'b', reason: 'ok' }, { wine_id: 'c', reason: '' }, { wine_id: 'd', reason: 'd' }, { wine_id: 'e', reason: 'e' }]);
  });
  it('plafonne à 5 alternatives', async () => {
    const many = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
    generateJson.mockResolvedValue({ safe: null, personal: null, creative: null, global_advice: '', alternatives: many.map((id) => ({ wine_id: id, reason: id })) });
    const r = await argueAndPick('plat', criteria, [...candidates, cand('f'), cand('g'), cand('h')]);
    expect(r.alternatives.map((a) => a.wine_id)).toEqual(['b', 'c', 'd', 'e', 'f']);
  });
  it('alternatives absentes → tableau vide', async () => {
    generateJson.mockResolvedValue({ safe: null, personal: null, creative: null, global_advice: '' });
    expect((await argueAndPick('plat', criteria, candidates)).alternatives).toEqual([]);
  });
  it('aucun candidat → alternatives vides', async () => {
    expect((await argueAndPick('plat', criteria, [])).alternatives).toEqual([]);
  });
});
