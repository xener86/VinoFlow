import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor() { this.messages = { create }; } } }));
vi.mock('../../src/db.js', () => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));

const { runTool, validatePicks, runAgentPairing } = await import('../../src/sommelier/agent.js');

const cave = [
  { id: 'w1', name: 'Chablis', vintage: 2021, type: 'WHITE', region: 'Bourgogne', inventoryCount: 2, aromaProfile: ['citron', 'silex'], aromaSource: 'USER', sensoryProfile: { body: 40, acidity: 85, tannin: 0, sweetness: 0, alcohol: 50 } },
  { id: 'w2', name: 'Cahors', vintage: 2016, type: 'RED', region: 'Sud-Ouest', inventoryCount: 1, aromaProfile: ['mûre'], sensoryProfile: { body: 85, acidity: 50, tannin: 85, sweetness: 0, alcohol: 70 } },
  { id: 'w3', name: 'Épuisé', vintage: 2020, type: 'WHITE', inventoryCount: 0, aromaProfile: ['citron'] },
];
const profile = { types: [], body: [0, 100], acidity: [60, 100], tannin: [0, 30], sweetness: [0, 20], alcohol: [0, 100], regions: [], grapes: [], aromas: ['citron'], avoid: [], protein: 'huître', sauce: '', spices: '', intensity: 'light', limit: null };

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
  create.mockReset();
});

describe('outils du sommelier agent', () => {
  it('search_cellar applique règles + scoring sur la cave en stock', () => {
    const inStock = cave.filter((w) => w.inventoryCount > 0);
    const res = runTool('search_cellar', profile, inStock);
    expect(res.map((r) => r.id)).toEqual(['w1']); // rouge tannique exclu sur l'huître, épuisé absent
    expect(res[0]).toMatchObject({ type: 'WHITE', score: expect.any(Number) });
  });

  it('get_wine_details / get_peak refusent un vin hors stock', () => {
    const inStock = cave.filter((w) => w.inventoryCount > 0);
    expect(runTool('get_wine_details', { wine_ids: ['w1', 'w3'] }, inStock)[1]).toEqual({ id: 'w3', error: 'Vin absent de la cave en stock' });
    expect(runTool('get_peak', { wine_id: 'w2' }, inStock)).toMatchObject({ id: 'w2', peakStart: 2021, peakEnd: 2026 });
  });

  it('validatePicks écarte les wine_id hors cave', () => {
    const inStock = cave.filter((w) => w.inventoryCount > 0);
    expect(validatePicks({ safe: { wine_id: 'w1' }, personal: { wine_id: 'inventé' }, creative: null, global_advice: 'x' }, inStock))
      .toEqual({ safe: { wine_id: 'w1' }, personal: null, creative: null, global_advice: 'x' });
  });
});

describe('boucle de l’agent', () => {
  it('exécute les outils puis renvoie des choix validés et les candidats', async () => {
    create
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'search_cellar', input: profile }], usage: { input_tokens: 100, output_tokens: 20 } })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ safe: { wine_id: 'w1', reason: 'iodé', service_temp_c: 10, decant_minutes: 0 }, personal: { wine_id: 'w3', reason: 'épuisé', service_temp_c: null, decant_minutes: null }, creative: null, global_advice: 'Bien frais.' }) }], usage: { input_tokens: 200, output_tokens: 50 } });
    const r = await runAgentPairing({ inventory: cave, dish: 'huîtres' });
    expect(r.picks).toMatchObject({ safe: { wine_id: 'w1' }, personal: null, creative: null });
    expect(r.candidates).toEqual([{ wine_id: 'w1', score: expect.any(Number) }]);
    expect(r).toMatchObject({ turns: 2, usage: { inputTokens: 300, outputTokens: 70 } });
    const second = create.mock.calls[1][0];
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(second.output_config).toMatchObject({ format: { type: 'json_schema' }, effort: 'medium' });
  });
});
