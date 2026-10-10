import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('../../src/services/inventory.js', () => ({ loadInventory: vi.fn() }));
vi.mock('../../src/services/aiService.js', () => ({ isProviderConfigured: vi.fn(() => false) }));
vi.mock('../../src/sommelier/agent.js', () => ({ runAgentPairing: vi.fn() }));
vi.mock('../../src/sommelier/coordinator.js', () => ({ runPairing: vi.fn(async ({ inventory }) => ({ picks: { safe: { wine_id: inventory[0]?.id, reason: 'r' }, personal: null, creative: null }, seen: inventory.map((w) => w.id) })) }));
vi.mock('../../src/sommelier/tasteProfile.js', () => ({ getTasteProfile: vi.fn(async () => null) }));

const { loadInventory } = await import('../../src/services/inventory.js');
const { isProviderConfigured } = await import('../../src/services/aiService.js');
const { runAgentPairing } = await import('../../src/sommelier/agent.js');
const { runPairing } = await import('../../src/sommelier/coordinator.js');
const { pairForDish, pickInStock } = await import('../../src/sommelier/pairForDish.js');

const inv = [{ id: 'a', inventoryCount: 1 }, { id: 'b', inventoryCount: 2 }, { id: 'c', inventoryCount: 0 }];

beforeEach(() => { loadInventory.mockResolvedValue(inv); vi.clearAllMocks(); loadInventory.mockResolvedValue(inv); });
afterEach(() => vi.unstubAllEnvs());

describe('pairForDish', () => {
  it('pipeline par défaut, sur tout l’inventaire', async () => {
    const r = await pairForDish({ dish: 'Poulet' });
    expect(runPairing).toHaveBeenCalledWith(expect.objectContaining({ dish: 'Poulet', skipCache: false }));
    expect(r.seen).toEqual(['a', 'b', 'c']);
  });
  it('exclude retire des vins et contourne le cache', async () => {
    const r = await pairForDish({ dish: 'Poulet', exclude: ['a'] });
    expect(r.seen).toEqual(['b', 'c']);
    expect(runPairing).toHaveBeenCalledWith(expect.objectContaining({ skipCache: true }));
  });
  it('agent si activé et Claude configuré, repli sur le pipeline en cas d’échec', async () => {
    vi.stubEnv('VINOFLOW_SOMMELIER_AGENT', 'true');
    isProviderConfigured.mockReturnValue(true);
    runAgentPairing.mockResolvedValue({ picks: { safe: { wine_id: 'b', reason: 'agent' } }, candidates: [], turns: 2 });
    expect((await pairForDish({ dish: 'Poulet' })).engine).toBe('agent');
    runAgentPairing.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await pairForDish({ dish: 'Poulet' });
    expect(runPairing).toHaveBeenCalled();
  });
});

describe('pickInStock', () => {
  const byId = new Map(inv.map((w) => [w.id, w]));
  it('premier choix dont le vin a du stock', () => {
    expect(pickInStock({ picks: { safe: { wine_id: 'c', reason: 'x' }, personal: { wine_id: 'b', reason: 'y' }, creative: null } }, byId))
      .toEqual({ wine_id: 'b', reason: 'y' });
    expect(pickInStock({ picks: { safe: null, personal: null, creative: null } }, byId)).toBeNull();
    expect(pickInStock(null, byId)).toBeNull();
  });
  it('retombe sur une alternative en stock', () => {
    const result = { picks: { safe: { wine_id: 'c', reason: 'x' }, personal: null, creative: null, alternatives: [{ wine_id: 'c', reason: 'épuisé' }, { wine_id: 'a', reason: 'alt' }] } };
    expect(pickInStock(result, byId)).toEqual({ wine_id: 'a', reason: 'alt' });
  });
  it('tolère un résultat sans alternatives (cache ancien)', () => {
    expect(pickInStock({ picks: { safe: null, personal: null, creative: null } }, byId)).toBeNull();
  });
});
