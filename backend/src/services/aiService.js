// Multi-provider AI service.
// Abstracts Gemini and Claude behind a single interface so the rest of the
// backend doesn't care which provider is used. Provider is selected per task
// from environment variables or per-call options.
//
// Tasks:
//   - extract-criteria (LLM1, fast, structured): defaults to Gemini Flash
//   - argue            (LLM2, nuanced text):    defaults to Claude Sonnet
//   - enrich           (deep wine analysis):    defaults to Claude Sonnet
//   - ocr              (vision):                defaults to Gemini

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { AsyncLocalStorage } from 'node:async_hooks';

// Per-request AI keys storage (filled by the middleware in server.js).
// Using AsyncLocalStorage so we don't have to thread keys through every
// sommelier function signature — they're resolved automatically from the
// current async context.
const requestKeysStore = new AsyncLocalStorage();

/**
 * Run a function with a per-request set of AI keys (called from middleware).
 */
export const runWithRequestKeys = (keys, fn) => requestKeysStore.run(keys || {}, fn);

/**
 * Get the per-request keys (or empty object if none set).
 */
const getRequestKeys = () => requestKeysStore.getStore() || {};

const TASK_DEFAULTS = {
  'extract-criteria': { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
  'argue':            { provider: 'claude', model: 'claude-sonnet-4-5' },
  'enrich':           { provider: 'claude', model: 'claude-sonnet-4-5' },
  'ocr':              { provider: 'gemini', model: 'gemini-2.0-flash-exp' },
  'embedding':        { provider: 'gemini', model: 'text-embedding-004' },
};

const lazy = {};

/**
 * Resolve the API key for a provider from (in order):
 *   1. explicit value passed in
 *   2. per-request key (from frontend Settings via headers)
 *   3. environment variable
 */
export const resolveProviderKey = (provider, explicitKey) => {
  if (explicitKey) return explicitKey;
  // Per-request key from frontend (Settings → localStorage → headers)
  const requestKeys = getRequestKeys();
  if (provider === 'claude' && requestKeys.claude) return requestKeys.claude;
  if (provider === 'gemini' && requestKeys.gemini) return requestKeys.gemini;
  // Fallback to environment variable
  if (provider === 'claude') return process.env.ANTHROPIC_API_KEY;
  if (provider === 'gemini') return process.env.GEMINI_API_KEY;
  return null;
};

const getClaudeClient = (apiKey) => {
  const key = resolveProviderKey('claude', apiKey);
  if (!key) throw new Error('No Anthropic API key found (set ANTHROPIC_API_KEY in backend .env or configure Claude key in Settings)');
  // Cache per-key to avoid recreating clients on every call
  if (!lazy.claude || lazy.claudeKey !== key) {
    lazy.claude = new Anthropic({ apiKey: key });
    lazy.claudeKey = key;
  }
  return lazy.claude;
};

const getGeminiClient = (apiKey) => {
  const key = resolveProviderKey('gemini', apiKey);
  if (!key) throw new Error('No Gemini API key found (set GEMINI_API_KEY in backend .env or configure Gemini key in Settings)');
  if (!lazy.gemini || lazy.geminiKey !== key) {
    lazy.gemini = new GoogleGenAI({ apiKey: key });
    lazy.geminiKey = key;
  }
  return lazy.gemini;
};

/**
 * Resolve the provider/model to use for a given task.
 * Priority: explicit options > env override (VINOFLOW_PROVIDER_<task>) > default.
 */
const resolveTask = (task, options = {}) => {
  const def = TASK_DEFAULTS[task];
  if (!def) throw new Error(`Unknown task: ${task}`);

  const envProvider = process.env[`VINOFLOW_PROVIDER_${task.toUpperCase().replace(/-/g, '_')}`];
  const envModel    = process.env[`VINOFLOW_MODEL_${task.toUpperCase().replace(/-/g, '_')}`];

  return {
    provider: options.provider || envProvider || def.provider,
    model:    options.model    || envModel    || def.model,
    apiKey:   options.apiKey,
  };
};

/**
 * Generate a JSON-structured response from the chosen provider.
 * Both Gemini and Claude support JSON mode; we ask for raw JSON and parse it.
 */
export const generateJson = async (task, { system, user, schema, options = {} }) => {
  const { provider, model, apiKey } = resolveTask(task, options);

  if (provider === 'claude') {
    const client = getClaudeClient(apiKey);
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: `${system}\n\nIMPORTANT: Respond with ONLY a valid JSON object matching the schema. No markdown, no commentary.`,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content[0]?.text || '';
    return parseJsonResponse(text);
  }

  if (provider === 'gemini') {
    const client = getGeminiClient(apiKey);
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
      config: {
        responseMimeType: 'application/json',
        ...(schema ? { responseSchema: schema } : {}),
      },
    });
    return parseJsonResponse(response.text);
  }

  throw new Error(`Unsupported provider: ${provider}`);
};

/**
 * Generate a free-form text response.
 */
export const generateText = async (task, { system, user, options = {} }) => {
  const { provider, model, apiKey } = resolveTask(task, options);

  if (provider === 'claude') {
    const client = getClaudeClient(apiKey);
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return response.content[0]?.text || '';
  }

  if (provider === 'gemini') {
    const client = getGeminiClient(apiKey);
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
    });
    return response.text;
  }

  throw new Error(`Unsupported provider: ${provider}`);
};

/**
 * Parse a JSON response, tolerating markdown code fences.
 */
const parseJsonResponse = (text) => {
  if (!text) throw new Error('Empty AI response');
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to extract a JSON object from somewhere in the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse JSON response: ${e.message}\nRaw: ${cleaned.slice(0, 300)}`);
  }
};

/**
 * Multi-source consensus (Phase 2.11).
 * Asks both Gemini and Claude (if configured) the same JSON question,
 * then returns:
 *   - both responses
 *   - intersection of arrays in known fields
 *   - a confidence flag based on whether the responses converge
 *
 * Use case: enriching a wine profile where hallucinations are costly.
 * If the two providers disagree wildly, set confidence LOW.
 */
export const consensusJson = async (task, { system, user, schema }) => {
  const haveGemini = isProviderConfigured('gemini');
  const haveClaude = isProviderConfigured('claude');

  if (!haveGemini && !haveClaude) {
    throw new Error('Neither Gemini nor Claude is configured');
  }

  if (!haveGemini || !haveClaude) {
    // Only one provider available, no consensus possible
    const result = await generateJson(task, { system, user, schema });
    return { result, sources: [resolveTask(task).provider], confidence: 'MEDIUM' };
  }

  const [gemResult, claResult] = await Promise.allSettled([
    generateJson(task, { system, user, schema, options: { provider: 'gemini' } }),
    generateJson(task, { system, user, schema, options: { provider: 'claude' } }),
  ]);

  const gem = gemResult.status === 'fulfilled' ? gemResult.value : null;
  const cla = claResult.status === 'fulfilled' ? claResult.value : null;

  if (gem && cla) {
    const merged = mergeResponses(gem, cla);
    return {
      result: merged.result,
      sources: ['gemini', 'claude'],
      confidence: merged.agreement > 0.6 ? 'HIGH' : merged.agreement > 0.3 ? 'MEDIUM' : 'LOW',
      agreement: merged.agreement,
      raw: { gemini: gem, claude: cla },
    };
  }

  // One provider failed
  const fallback = gem || cla;
  return { result: fallback, sources: gem ? ['gemini'] : ['claude'], confidence: 'MEDIUM' };
};

const mergeResponses = (a, b) => {
  // For arrays of strings, take the intersection (high confidence) plus the union (lower confidence)
  // For scalars, prefer when they agree.
  // Returns { result, agreement: 0..1 }
  const result = {};
  let agreementChecks = 0;
  let agreements = 0;

  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of allKeys) {
    const va = a?.[key];
    const vb = b?.[key];

    if (Array.isArray(va) && Array.isArray(vb)) {
      const setA = new Set(va.map(s => String(s).toLowerCase()));
      const setB = new Set(vb.map(s => String(s).toLowerCase()));
      const inter = [...setA].filter(x => setB.has(x));
      const union = [...new Set([...setA, ...setB])];
      result[key] = inter.length > 0 ? inter : union; // prefer intersection
      agreementChecks++;
      if (union.length > 0) agreements += inter.length / union.length;
    } else if (va !== undefined && vb !== undefined && typeof va === typeof vb && typeof va !== 'object') {
      result[key] = va === vb ? va : (va ?? vb);
      agreementChecks++;
      if (va === vb) agreements++;
    } else {
      result[key] = va ?? vb;
    }
  }

  return {
    result,
    agreement: agreementChecks > 0 ? agreements / agreementChecks : 0.5,
  };
};

export const isProviderConfigured = (provider) => {
  // Configured if either backend env or per-request key is available
  if (provider === 'claude') {
    return Boolean(process.env.ANTHROPIC_API_KEY) || Boolean(getRequestKeys().claude);
  }
  if (provider === 'gemini') {
    return Boolean(process.env.GEMINI_API_KEY) || Boolean(getRequestKeys().gemini);
  }
  return false;
};

export const getTaskDefaults = () => ({ ...TASK_DEFAULTS });
