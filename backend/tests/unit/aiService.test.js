import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// SDK simulés : on vérifie les requêtes envoyées, sans appel réseau.
const anthropic = { create: vi.fn(), betaCreate: vi.fn() };
const gemini = { generateContent: vi.fn(), embedContent: vi.fn() };
const dbQuery = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {
      this.messages = { create: anthropic.create };
      this.beta = { messages: { create: anthropic.betaCreate } };
    }
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: gemini.generateContent, embedContent: gemini.embedContent };
    }
  },
}));
vi.mock('../../src/db.js', () => ({ pool: { query: (...args) => dbQuery(...args) } }));

const ai = await import('../../src/services/aiService.js');

const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
const claudeReply = (text, extra = {}) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 },
  ...extra,
});

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
  vi.stubEnv('GEMINI_API_KEY', 'gm-test');
  for (const fn of [anthropic.create, anthropic.betaCreate, gemini.generateContent, gemini.embedContent, dbQuery]) fn.mockReset();
  dbQuery.mockResolvedValue({ rows: [] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('resolveTask', () => {
  it('modèles par défaut par tâche', () => {
    expect(ai.resolveTask('extract-criteria')).toMatchObject({ provider: 'claude', model: 'claude-haiku-4-5', maxTokens: 2048 });
    expect(ai.resolveTask('argue')).toMatchObject({ provider: 'claude', model: 'claude-sonnet-5-5', effort: 'low' });
    expect(ai.resolveTask('critique').model).toBe('claude-haiku-4-5');
    expect(ai.resolveTask('enrich-aromas')).toMatchObject({ model: 'claude-sonnet-5-5', fallback: null });
    expect(ai.resolveTask('ocr')).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash', fallback: { provider: 'claude', model: 'claude-sonnet-5-5' } });
    expect(ai.resolveTask('embedding').model).toBe('gemini-embedding-001');
    expect(() => ai.resolveTask('nope')).toThrow(/Unknown task/);
  });

  it('surcharges par variables d’environnement', () => {
    vi.stubEnv('VINOFLOW_MODEL_EXTRACT_CRITERIA', 'claude-sonnet-5-5');
    vi.stubEnv('VINOFLOW_MAX_TOKENS_EXTRACT_CRITERIA', '999');
    vi.stubEnv('VINOFLOW_EFFORT_ARGUE', 'medium');
    vi.stubEnv('VINOFLOW_PROVIDER_CRITIQUE', 'gemini');
    expect(ai.resolveTask('extract-criteria')).toMatchObject({ model: 'claude-sonnet-5-5', maxTokens: 999 });
    expect(ai.resolveTask('argue').effort).toBe('medium');
    expect(ai.resolveTask('critique')).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash' });
  });
});

describe('buildClaudeParams', () => {
  it('prompt système mis en cache, schéma et effort dans output_config', () => {
    const p = ai.buildClaudeParams(ai.resolveTask('argue'), { system: 'S', user: 'U', schema: SCHEMA });
    expect(p).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 8000,
      system: [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'U' }] }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'low' },
    });
  });

  it('pas de paramètre effort sur Haiku 4.5', () => {
    const p = ai.buildClaudeParams({ ...ai.resolveTask('critique'), effort: 'low' }, { user: 'U', schema: SCHEMA });
    expect(p.output_config).toEqual({ format: { type: 'json_schema', schema: SCHEMA } });
    expect(p).not.toHaveProperty('system');
  });

  it('images en base64 avant le texte', () => {
    const p = ai.buildClaudeParams(ai.resolveTask('argue'), { user: 'U', images: [{ mimeType: 'image/png', data: 'AAA' }] });
    expect(p.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } });
  });
});

describe('readClaudeResponse', () => {
  it('lit les blocs par type : texte final après les outils, sources web, usage', () => {
    const r = ai.readClaudeResponse({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'Je cherche…' },
        { type: 'server_tool_use', name: 'web_search', input: { query: 'Domaine X Cuvée Y 2019' } },
        { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://ex.fr/a', title: 'A', page_age: '2025' }] },
        { type: 'text', text: '{"ok":' },
        { type: 'text', text: 'true}' },
      ],
      usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1 } },
    }, { schema: SCHEMA });
    expect(r.data).toEqual({ ok: true });
    expect(r.searches).toEqual(['Domaine X Cuvée Y 2019']);
    expect(r.sources).toEqual([{ url: 'https://ex.fr/a', title: 'A', pageAge: '2025' }]);
    expect(r.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, webSearches: 1 });
  });

  it('refus → AiRefusalError ; troncature → erreur explicite', () => {
    expect(() => ai.readClaudeResponse({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] }))
      .toThrow(ai.AiRefusalError);
    expect(() => ai.readClaudeResponse({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"ok"' }] }, { schema: SCHEMA }))
      .toThrow(/max_tokens/);
  });
});

describe('generateStructured', () => {
  it('Sonnet 5.5 : endpoint beta avec repli serveur sur refus', async () => {
    anthropic.betaCreate.mockResolvedValue(claudeReply('{"ok":true}'));
    const r = await ai.generateStructured('argue', { system: 'S', user: 'U', schema: SCHEMA });
    expect(r).toMatchObject({ data: { ok: true }, provider: 'claude', model: 'claude-sonnet-5-5' });
    expect(anthropic.betaCreate.mock.calls[0][0]).toMatchObject({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('Haiku : endpoint standard ; journal ai_calls avec tokens et coût', async () => {
    anthropic.create.mockResolvedValue(claudeReply('{"ok":true}'));
    await ai.generateJson('critique', { user: 'U', schema: SCHEMA });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO ai_calls/);
    expect(params.slice(0, 4)).toEqual(['critique', 'claude', 'claude-haiku-4-5', true]);
    expect(params.slice(5, 9)).toEqual([100, 20, 50, 0]);
    expect(params[10]).toBeCloseTo((100 * 1 + 20 * 5 + 50 * 0.1) / 1e6, 9);
  });

  it('reprend après pause_turn (recherche web longue)', async () => {
    anthropic.betaCreate
      .mockResolvedValueOnce({ stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_search', input: { query: 'q' } }], usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce(claudeReply('{"ok":false}'));
    const r = await ai.generateStructured('enrich-aromas', { user: 'U', schema: SCHEMA, tools: [{ type: 'web_search_20260209', name: 'web_search' }] });
    expect(r.data).toEqual({ ok: false });
    expect(anthropic.betaCreate).toHaveBeenCalledTimes(2);
    expect(anthropic.betaCreate.mock.calls[1][0].messages.at(-1).role).toBe('assistant');
    expect(r.searches).toEqual(['q']);
  });

  it('repli sur Gemini si Claude échoue, avec le même schéma', async () => {
    anthropic.betaCreate.mockRejectedValue(new Error('overloaded'));
    gemini.generateContent.mockResolvedValue({ text: '{"ok":true}', usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } });
    const r = await ai.generateStructured('argue', { system: 'S', user: 'U', schema: SCHEMA });
    expect(r).toMatchObject({ data: { ok: true }, provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(gemini.generateContent.mock.calls[0][0].config).toMatchObject({
      systemInstruction: 'S', responseMimeType: 'application/json', responseJsonSchema: SCHEMA,
    });
  });

  it('repli direct si le fournisseur principal n’a pas de clé', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    gemini.generateContent.mockResolvedValue({ text: '{"ok":true}' });
    await ai.generateJson('extract-criteria', { user: 'U', schema: SCHEMA });
    expect(anthropic.create).not.toHaveBeenCalled();
  });

  it('pas de repli pour l’enrichissement ; sans clé, erreur explicite', async () => {
    anthropic.betaCreate.mockRejectedValue(new Error('boom'));
    await expect(ai.generateJson('enrich-peak', { user: 'U', schema: SCHEMA })).rejects.toThrow('boom');
    expect(gemini.generateContent).not.toHaveBeenCalled();
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(ai.generateJson('enrich-peak', { user: 'U', schema: SCHEMA })).rejects.toThrow(/No Anthropic API key/);
  });
});

describe('embedTexts', () => {
  it('gemini-embedding-001 en 768 dimensions, vecteurs normalisés', async () => {
    gemini.embedContent.mockResolvedValue({ embeddings: [{ values: [3, 4] }] });
    const [vec] = await ai.embedTexts(['doc']);
    expect(vec).toEqual([0.6, 0.8]);
    expect(gemini.embedContent.mock.calls[0][0]).toMatchObject({
      model: 'gemini-embedding-001', contents: ['doc'], config: { outputDimensionality: 768 },
    });
  });
});

describe('estimateCost', () => {
  it('tokens + recherches web, remise Batch', () => {
    expect(ai.estimateCost({ model: 'claude-sonnet-5-5', inputTokens: 1e6, outputTokens: 1e5, webSearches: 3 })).toBeCloseTo(2 + 1 + 0.03, 9);
    expect(ai.estimateCost({ model: 'claude-sonnet-5-5', inputTokens: 1e6, batch: true })).toBeCloseTo(1, 9);
    expect(ai.estimateCost({ model: 'gemini-3.8-flash', inputTokens: 1e6 })).toBeNull();
  });
});
