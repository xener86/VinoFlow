// AI provider abstraction — task-based routing between Claude and Gemini.
//
// Chaque tâche a un fournisseur/modèle par défaut, un max_tokens propre et un
// repli éventuel sur l'autre fournisseur. Tout est surchargeable par variables
// d'environnement (TASK en majuscules, tirets → underscores) :
//   VINOFLOW_PROVIDER_<TASK>   claude | gemini
//   VINOFLOW_MODEL_<TASK>      identifiant de modèle
//   VINOFLOW_MAX_TOKENS_<TASK> entier
//   VINOFLOW_EFFORT_<TASK>     low | medium | high (modèles Claude qui le supportent)
//
// Sorties structurées natives : output_config.format (JSON Schema) côté Claude,
// responseJsonSchema côté Gemini. Plus de nettoyage par regex.
// Chaque appel est journalisé (tâche, modèle, tokens, latence, succès) dans les
// logs et dans la table ai_calls, pour chiffrer le coût (GET /api/ai/usage).

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pool } from '../db.js';

// Per-request AI keys storage (filled by middleware/aiKeys.js).
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

// Identifiants vérifiés dans la documentation officielle (octobre 2026).
export const MODELS = {
  CLAUDE_SONNET: 'claude-sonnet-5-5',
  CLAUDE_HAIKU: 'claude-haiku-4-5',
  GEMINI_FLASH: 'gemini-3.8-flash',
  GEMINI_EMBEDDING: 'gemini-embedding-001',
};

export const EMBEDDING_DIMENSIONS = 768;

const TASK_DEFAULTS = {
  // Sommelier : décomposition du plat → critères (rapide, peu coûteux)
  'extract-criteria': {
    provider: 'claude', model: MODELS.CLAUDE_HAIKU, maxTokens: 2048,
    fallback: { provider: 'gemini', model: MODELS.GEMINI_FLASH },
  },
  // Sommelier : choix argumenté des 3 vins, accords inversés, explications
  argue: {
    provider: 'claude', model: MODELS.CLAUDE_SONNET, maxTokens: 8000, effort: 'low',
    fallback: { provider: 'gemini', model: MODELS.GEMINI_FLASH },
  },
  // Sommelier : relecture critique des propositions
  critique: {
    provider: 'claude', model: MODELS.CLAUDE_HAIKU, maxTokens: 2048,
    fallback: { provider: 'gemini', model: MODELS.GEMINI_FLASH },
  },
  // Enrichissement d'une fiche (profil aromatique + fenêtre d'apogée en une
  // seule passe de recherche web). Moteur principal : Claude Code sur
  // l'abonnement (enrichment/engines.js) ; cette tâche sert au repli par l'API.
  // Pas de repli Gemini : sans recherche, le modèle inventerait — la cascade
  // retombe alors sur les niveaux déterministes.
  'enrich-wine': { provider: 'claude', model: MODELS.CLAUDE_SONNET, maxTokens: 16000, effort: 'medium' },
  // Lecture d'étiquette (vision)
  ocr: {
    provider: 'gemini', model: MODELS.GEMINI_FLASH, maxTokens: 2048,
    fallback: { provider: 'claude', model: MODELS.CLAUDE_SONNET, effort: 'low' },
  },
  embedding: { provider: 'gemini', model: MODELS.GEMINI_EMBEDDING },
};

// Prix publics en $ par million de tokens (Claude API, octobre 2026), pour une
// estimation du coût. Recherche web : $10 / 1 000 recherches.
const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
const WEB_SEARCH_PRICE = 10 / 1000;
// Lot (Batch API) : moitié prix sur les tokens.
const BATCH_DISCOUNT = 0.5;

export const estimateCost = ({ model, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, webSearches = 0, batch = false }) => {
  const p = PRICES[model];
  if (!p) return null;
  const tokens = (inputTokens * p.input + outputTokens * p.output
    + cacheReadTokens * p.cacheRead + cacheWriteTokens * p.cacheWrite) / 1e6;
  return (batch ? tokens * BATCH_DISCOUNT : tokens) + webSearches * WEB_SEARCH_PRICE;
};

// Haiku 4.5 (et les modèles 4.5 plus anciens) refusent le paramètre effort.
const supportsEffort = (model) => !/-4-5/.test(model);
// Repli serveur sur refus (beta) : Sonnet 5.5 / Opus 5.x, Claude API uniquement.
const supportsServerFallback = (model) => /^claude-(sonnet-5-5|opus-5)/.test(model);
const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Resolve the API key for a provider from (in order):
 *   1. explicit value passed in
 *   2. environment variable (configuration du foyer, prioritaire)
 *   3. per-request key (from frontend Settings via headers) — fallback only,
 *      ignored when ALLOW_CLIENT_AI_KEYS=false (see middleware/aiKeys.js)
 */
export const resolveProviderKey = (provider, explicitKey) => {
  if (explicitKey) return explicitKey;
  if (provider === 'claude' && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // Per-request key from frontend (Settings → localStorage → headers)
  const requestKeys = getRequestKeys();
  if (provider === 'claude') return requestKeys.claude || null;
  if (provider === 'gemini') return requestKeys.gemini || null;
  return null;
};

export const isProviderConfigured = (provider) => Boolean(resolveProviderKey(provider));

const lazy = {};

export const getClaudeClient = (apiKey) => {
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

const envKey = (task) => task.toUpperCase().replace(/-/g, '_');

/**
 * Configuration effective d'une tâche (défauts + variables d'environnement +
 * options explicites). Le repli éventuel est renvoyé à part.
 */
export const resolveTask = (task, options = {}) => {
  const def = TASK_DEFAULTS[task];
  if (!def) throw new Error(`Unknown task: ${task}`);
  const k = envKey(task);
  const provider = options.provider || process.env[`VINOFLOW_PROVIDER_${k}`] || def.provider;
  // Si le fournisseur est surchargé sans modèle, on ne garde pas le modèle de l'autre fournisseur.
  const defaultModel = provider === def.provider ? def.model
    : (provider === 'gemini' ? MODELS.GEMINI_FLASH : MODELS.CLAUDE_SONNET);
  return {
    task,
    provider,
    model: options.model || process.env[`VINOFLOW_MODEL_${k}`] || defaultModel,
    maxTokens: Number(options.maxTokens || process.env[`VINOFLOW_MAX_TOKENS_${k}`] || def.maxTokens || 4096),
    effort: options.effort || process.env[`VINOFLOW_EFFORT_${k}`] || def.effort,
    apiKey: options.apiKey,
    fallback: options.provider ? null : def.fallback || null,
  };
};

// ─── Journal des appels ─────────────────────────────────────────────────────

let logTableWarned = false;

/** Journalise un appel IA (logs + table ai_calls, sans jamais bloquer ni échouer). */
export const logAiCall = (entry) => {
  // Claude Code tourne sur l'abonnement : pas de coût à l'usage.
  const cost = entry.provider === 'claude-code' ? 0 : estimateCost(entry);
  const line = { ...entry, costUsd: cost === null ? null : Number(cost.toFixed(6)) };
  if (process.env.NODE_ENV !== 'test') console.log(`[ai] ${JSON.stringify(line)}`);
  pool.query(
    `INSERT INTO ai_calls (task, provider, model, ok, latency_ms, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, web_searches, cost_usd, batch, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [entry.task, entry.provider, entry.model, entry.ok, entry.latencyMs ?? null,
      entry.inputTokens ?? 0, entry.outputTokens ?? 0, entry.cacheReadTokens ?? 0,
      entry.cacheWriteTokens ?? 0, entry.webSearches ?? 0, line.costUsd, entry.batch === true,
      entry.error ? String(entry.error).slice(0, 500) : null]
  ).catch((error) => {
    if (!logTableWarned && process.env.NODE_ENV !== 'test') {
      console.warn('ai_calls: journal en base indisponible :', error.message);
      logTableWarned = true;
    }
  });
};

// ─── Claude ────────────────────────────────────────────────────────────────

export class AiRefusalError extends Error {
  constructor(category) {
    super(`Le modèle a décliné la requête${category ? ` (${category})` : ''}`);
    this.name = 'AiRefusalError';
    this.category = category || null;
  }
}

const MAX_PAUSE_CONTINUATIONS = 5;

/** Corps de requête Messages API pour une tâche (aussi utilisé par la Batch API). */
export const buildClaudeParams = (cfg, { system, user, images = [], schema, tools }) => {
  const content = [
    ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.data } })),
    { type: 'text', text: user },
  ];
  const outputConfig = {
    ...(schema ? { format: { type: 'json_schema', schema } } : {}),
    ...(cfg.effort && supportsEffort(cfg.model) ? { effort: cfg.effort } : {}),
  };
  return {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    // Prompts système longs et stables : mis en cache (préfixe identique d'un
    // appel à l'autre). En dessous du minimum cacheable, l'API l'ignore.
    ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}),
    messages: [{ role: 'user', content }],
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
    ...(tools ? { tools } : {}),
  };
};

/**
 * Lit une réponse Messages API : texte final, sources web consultées, usage.
 * Les blocs sont lus par type (une réponse peut commencer par du thinking).
 */
export const readClaudeResponse = (response, { schema } = {}) => {
  if (response.stop_reason === 'refusal') {
    throw new AiRefusalError(response.stop_details?.category);
  }
  const blocks = response.content || [];
  // Texte final = blocs texte après le dernier bloc d'outil serveur.
  let lastToolIndex = -1;
  blocks.forEach((b, i) => {
    if (b.type === 'server_tool_use' || b.type === 'web_search_tool_result' || b.type === 'web_fetch_tool_result') lastToolIndex = i;
  });
  const text = blocks.slice(lastToolIndex + 1).filter((b) => b.type === 'text').map((b) => b.text).join('');

  const searches = blocks.filter((b) => b.type === 'server_tool_use' && b.name === 'web_search')
    .map((b) => b.input?.query).filter(Boolean);
  const sources = [];
  for (const b of blocks) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) {
        if (r.type === 'web_search_result') sources.push({ url: r.url, title: r.title || null, pageAge: r.page_age || null });
      }
    }
  }

  if (schema && response.stop_reason === 'max_tokens') {
    throw new Error('Réponse tronquée (max_tokens atteint) : augmenter VINOFLOW_MAX_TOKENS_<TASK>');
  }
  let data = null;
  if (schema) {
    if (!text) throw new Error('Réponse vide du modèle');
    data = JSON.parse(text); // sortie structurée : JSON garanti valide
  }
  const u = response.usage || {};
  return {
    data,
    text,
    searches,
    sources,
    usage: {
      inputTokens: u.input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      cacheReadTokens: u.cache_read_input_tokens || 0,
      cacheWriteTokens: u.cache_creation_input_tokens || 0,
      webSearches: u.server_tool_use?.web_search_requests || searches.length,
    },
  };
};

const callClaude = async (cfg, request) => {
  const client = getClaudeClient(cfg.apiKey);
  const params = buildClaudeParams(cfg, request);
  const useServerFallback = process.env.VINOFLOW_CLAUDE_SERVER_FALLBACK !== 'false' && supportsServerFallback(cfg.model);
  const send = (p) => (useServerFallback
    ? client.beta.messages.create({ ...p, betas: [SERVER_FALLBACK_BETA], fallbacks: 'default' })
    : client.messages.create(p));

  let response = await send(params);
  // Outils serveur (recherche web) : la boucle côté serveur peut s'interrompre
  // (pause_turn) ; on renvoie le tour tel quel pour qu'elle reprenne.
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web: 0 };
  const accumulate = (r) => {
    usage.input_tokens += r.usage?.input_tokens || 0;
    usage.output_tokens += r.usage?.output_tokens || 0;
    usage.cache_read_input_tokens += r.usage?.cache_read_input_tokens || 0;
    usage.cache_creation_input_tokens += r.usage?.cache_creation_input_tokens || 0;
    usage.web += r.usage?.server_tool_use?.web_search_requests || 0;
  };
  accumulate(response);
  const allContent = [...response.content];
  for (let i = 0; i < MAX_PAUSE_CONTINUATIONS && response.stop_reason === 'pause_turn'; i++) {
    response = await send({
      ...params,
      messages: [...params.messages, { role: 'assistant', content: response.content }],
    });
    accumulate(response);
    allContent.push(...response.content);
  }
  return readClaudeResponse({
    ...response,
    content: allContent,
    usage: { ...usage, server_tool_use: { web_search_requests: usage.web } },
  }, request);
};

// ─── Gemini ────────────────────────────────────────────────────────────────

const callGemini = async (cfg, { system, user, images = [], schema, tools }) => {
  if (tools) throw new Error('Les outils (recherche web) ne sont pas branchés côté Gemini');
  const client = getGeminiClient(cfg.apiKey);
  const response = await client.models.generateContent({
    model: cfg.model,
    contents: [{
      role: 'user',
      parts: [...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), { text: user }],
    }],
    config: {
      ...(system ? { systemInstruction: system } : {}),
      maxOutputTokens: cfg.maxTokens,
      ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}),
    },
  });
  const text = response.text || '';
  if (schema && !text) throw new Error('Réponse vide du modèle');
  const u = response.usageMetadata || {};
  return {
    data: schema ? JSON.parse(text) : null,
    text,
    searches: [],
    sources: [],
    usage: {
      inputTokens: u.promptTokenCount || 0,
      outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
      cacheReadTokens: u.cachedContentTokenCount || 0,
      cacheWriteTokens: 0,
      webSearches: 0,
    },
  };
};

// ─── Exécution d'une tâche avec repli ──────────────────────────────────────

const callProvider = (cfg, request) => (cfg.provider === 'claude' ? callClaude(cfg, request) : callGemini(cfg, request));

const runTask = async (task, request, options = {}) => {
  const primary = resolveTask(task, options);
  const attempts = [primary];
  if (primary.fallback) {
    attempts.push({
      ...primary,
      provider: primary.fallback.provider,
      model: primary.fallback.model,
      effort: primary.fallback.effort ?? (primary.fallback.provider === 'claude' ? primary.effort : undefined),
    });
  }
  const usable = attempts.filter((a) => isProviderConfigured(a.provider) || a.apiKey);
  if (usable.length === 0) {
    // Message explicite du fournisseur principal (clé manquante)
    if (primary.provider === 'claude') getClaudeClient(primary.apiKey);
    else getGeminiClient(primary.apiKey);
  }

  let lastError;
  for (const cfg of usable) {
    const started = Date.now();
    try {
      const result = await callProvider(cfg, request);
      logAiCall({ task, provider: cfg.provider, model: cfg.model, ok: true, latencyMs: Date.now() - started, ...result.usage });
      return { ...result, provider: cfg.provider, model: cfg.model };
    } catch (error) {
      lastError = error;
      logAiCall({ task, provider: cfg.provider, model: cfg.model, ok: false, latencyMs: Date.now() - started, error: error.message });
      if (cfg !== usable[usable.length - 1]) {
        console.warn(`[ai] ${task} : échec ${cfg.provider}/${cfg.model} (${error.message}), repli sur ${usable[usable.length - 1].provider}`);
      }
    }
  }
  throw lastError;
};

/**
 * Réponse JSON conforme à `schema` (JSON Schema, objets en additionalProperties: false).
 * @returns {Promise<{data, text, sources, searches, usage, provider, model}>}
 */
export const generateStructured = (task, { system, user, schema, images, tools, options = {} }) => {
  if (!schema) throw new Error(`generateStructured(${task}) : schema requis`);
  return runTask(task, { system, user, schema, images, tools }, options);
};

/** Raccourci : seulement l'objet JSON. */
export const generateJson = async (task, params) => (await generateStructured(task, params)).data;

/** Texte libre. */
export const generateText = async (task, { system, user, images, options = {} }) =>
  (await runTask(task, { system, user, images }, options)).text;

// ─── Embeddings ────────────────────────────────────────────────────────────

const normalize = (vec) => {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
};

/**
 * Vecteurs d'embedding (768 dimensions, normalisés) pour une liste de textes.
 * gemini-embedding-001 ne normalise pas les dimensions tronquées : on le fait.
 */
export const embedTexts = async (texts, { taskType = 'RETRIEVAL_DOCUMENT', options = {} } = {}) => {
  const cfg = resolveTask('embedding', options);
  const client = getGeminiClient(cfg.apiKey);
  const started = Date.now();
  try {
    const result = await client.models.embedContent({
      model: cfg.model,
      contents: texts,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
    });
    logAiCall({ task: 'embedding', provider: 'gemini', model: cfg.model, ok: true, latencyMs: Date.now() - started });
    return result.embeddings.map((e) => normalize(e.values));
  } catch (error) {
    logAiCall({ task: 'embedding', provider: 'gemini', model: cfg.model, ok: false, latencyMs: Date.now() - started, error: error.message });
    throw error;
  }
};

export const getEmbeddingModel = () => resolveTask('embedding').model;

export const getTaskDefaults = () => Object.fromEntries(
  Object.keys(TASK_DEFAULTS).map((task) => {
    const { provider, model, maxTokens, effort, fallback } = resolveTask(task);
    return [task, { provider, model, maxTokens, effort: effort || null, fallback }];
  })
);
