import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/aiService.js', () => ({ generateStructured: vi.fn(), isProviderConfigured: vi.fn(() => true) }));
vi.mock('../../src/enrichment/engines.js', () => ({ claudeCodeAvailable: vi.fn(() => false), runClaudeCode: vi.fn() }));
const ai = await import('../../src/services/aiService.js');
const engines = await import('../../src/enrichment/engines.js');
const { buildChatPrompt, validateReply, chatEngine, answerQuestion, MAX_HISTORY } = await import('../../src/sommelier/chat.js');

const inventory = [
  { id: 'w1', producer: 'Raveneau', name: 'Chablis', cuvee: 'Chablis', vintage: 2021, type: 'WHITE', region: 'Bourgogne', appellation: 'Chablis', inventoryCount: 2, aromaProfile: ['citron', 'silex', 'a', 'b', 'c', 'd'] },
  { id: 'w2', producer: 'X', name: 'Cahors', vintage: 2016, type: 'RED', inventoryCount: 0 },
];
const pairing = { picks: { safe: { wine_id: 'w1', reason: 'classique' }, personal: null, creative: null, global_advice: 'g', alternatives: [{ wine_id: 'w1', reason: 'aussi' }] }, rationale: 'r', cave_size: 1 };

beforeEach(() => { ai.generateStructured.mockReset(); engines.runClaudeCode.mockReset(); engines.claudeCodeAvailable.mockReturnValue(false); });
afterEach(() => vi.unstubAllEnvs());

describe('buildChatPrompt', () => {
  it('cave en stock compacte (5 arômes max, vins épuisés exclus), accord, question', () => {
    const { system, user } = buildChatPrompt({ dish: 'huîtres', pairing, inventory, messages: [], question: 'Pourquoi ?' });
    expect(system).toMatch(/vouvoyez/);
    expect(user).toContain('w1 | Raveneau Chablis 2021 | WHITE | Bourgogne / Chablis | 2 btl | citron, silex, a, b, c |');
    expect(user).not.toContain('w2 |');
    expect(user).toContain('Sûr : w1 — classique');
    expect(user).toContain('Autre : w1 — aussi');
    expect(user).toContain('Analyse du plat : r');
    expect(user.trim().endsWith('Utilisateur : Pourquoi ?')).toBe(true);
  });
  it('ne garde que les 12 derniers messages, tronqués à 1 500 caractères', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i} ${'x'.repeat(2000)}` }));
    const { user } = buildChatPrompt({ dish: 'd', pairing, inventory, messages, question: 'q' });
    expect(user).not.toContain('m7 ');
    expect(user).toContain('Utilisateur : m8 ');
    expect(user).toContain('Sommelier : m9 ');
    expect(user).not.toContain('x'.repeat(1501));
    expect(MAX_HISTORY).toBe(12);
  });
  it('profil de goût inclus seulement s’il existe', () => {
    expect(buildChatPrompt({ dish: 'd', pairing, inventory, messages: [], question: 'q' }).user).not.toContain('Profil de goût');
    expect(buildChatPrompt({ dish: 'd', pairing, inventory, tasteProfile: { likes: 'x' }, messages: [], question: 'q' }).user).toContain('Profil de goût : {"likes":"x"}');
  });
});

describe('validateReply', () => {
  const inStock = inventory.filter((w) => w.inventoryCount > 0);
  it('filtre les vins hors stock, dédoublonne, neutralise revised_dish égal au plat', () => {
    const r = validateReply({ reply: ' ok ', wine_ids: ['w1', 'w2', 'w1', 'zz'], revised_dish: ' Huîtres ' }, inStock, 'huîtres');
    expect(r).toEqual({ reply: 'ok', wineIds: ['w1'], revisedDish: null });
  });
  it('garde un plat reformulé différent', () => {
    expect(validateReply({ reply: 'x', wine_ids: [], revised_dish: 'saumon' }, inStock, 'huîtres').revisedDish).toBe('saumon');
  });
  it('tolère une réponse incomplète', () => {
    expect(validateReply({}, inStock, 'huîtres')).toEqual({ reply: '', wineIds: [], revisedDish: null });
  });
});

describe('chatEngine', () => {
  it('api par défaut', () => { expect(chatEngine()).toBe('api'); });
  it('claude-code seulement si disponible, sinon repli api', () => {
    vi.stubEnv('SOMMELIER_CHAT_ENGINE', 'claude-code');
    expect(chatEngine()).toBe('api');
    engines.claudeCodeAvailable.mockReturnValue(true);
    expect(chatEngine()).toBe('claude-code');
  });
});

describe('answerQuestion', () => {
  it('api : generateStructured sur la tâche sommelier-chat, moteur = fournisseur', async () => {
    ai.generateStructured.mockResolvedValue({ data: { reply: 'Le Chablis.', wine_ids: ['w1'], revised_dish: null }, provider: 'claude' });
    const r = await answerQuestion({ dish: 'huîtres', pairing, inventory, messages: [], question: 'q' });
    expect(ai.generateStructured).toHaveBeenCalledWith('sommelier-chat', expect.objectContaining({ schema: expect.any(Object), system: expect.any(String), user: expect.stringContaining('Utilisateur : q') }));
    expect(r).toEqual({ reply: 'Le Chablis.', wineIds: ['w1'], revisedDish: null, engine: 'claude' });
  });
  it('claude-code : runClaudeCode avec le schéma et le prompt système', async () => {
    vi.stubEnv('SOMMELIER_CHAT_ENGINE', 'claude-code');
    engines.claudeCodeAvailable.mockReturnValue(true);
    engines.runClaudeCode.mockResolvedValue({ data: { reply: 'r', wine_ids: ['w1', 'w2'], revised_dish: null } });
    const r = await answerQuestion({ dish: 'd', pairing, inventory, messages: [], question: 'q' });
    expect(engines.runClaudeCode).toHaveBeenCalledWith(expect.stringContaining('Utilisateur : q'), expect.objectContaining({ task: 'sommelier-chat', schema: expect.any(Object), systemPrompt: expect.any(String), timeoutMs: 50_000 }));
    expect(r).toEqual({ reply: 'r', wineIds: ['w1'], revisedDish: null, engine: 'claude-code' });
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });
  it('claude-code en échec → repli api', async () => {
    vi.stubEnv('SOMMELIER_CHAT_ENGINE', 'claude-code');
    engines.claudeCodeAvailable.mockReturnValue(true);
    engines.runClaudeCode.mockRejectedValue(new Error('boom'));
    ai.generateStructured.mockResolvedValue({ data: { reply: 'r', wine_ids: [], revised_dish: null }, provider: 'gemini' });
    const r = await answerQuestion({ dish: 'd', pairing, inventory, messages: [], question: 'q' });
    expect(r.engine).toBe('gemini');
  });
  it('claude-code en échec sans aucune clé API → l’erreur remonte', async () => {
    vi.stubEnv('SOMMELIER_CHAT_ENGINE', 'claude-code');
    engines.claudeCodeAvailable.mockReturnValue(true);
    engines.runClaudeCode.mockRejectedValue(new Error('boom'));
    ai.isProviderConfigured.mockReturnValue(false);
    await expect(answerQuestion({ dish: 'd', pairing, inventory, messages: [], question: 'q' })).rejects.toThrow('boom');
    ai.isProviderConfigured.mockReturnValue(true);
  });
});
