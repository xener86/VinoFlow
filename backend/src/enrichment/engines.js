// Moteurs de la cascade d'enrichissement.
//
// - claude-code : Claude Code en mode non interactif (`claude -p`), sur
//   l'abonnement de l'utilisateur (CLAUDE_CODE_OAUTH_TOKEN), avec les outils
//   WebSearch/WebFetch et une sortie JSON structurée. Même principe que
//   SuperQuickie. Lancé dans un dossier vide pour ne rien lire d'autre.
// - api : Messages API (tâche 'enrich-wine' d'aiService) avec l'outil serveur
//   web_search ; facturé à l'usage, utilisé en repli.
//
// ENRICH_ENGINE = auto (défaut) | claude-code | api | off
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateStructured, isProviderConfigured, logAiCall, MODELS } from '../services/aiService.js';
import { ENRICHMENT_SCHEMA } from './schema.js';
import { SYSTEM_PROMPT, BLOCKED_DOMAINS } from './prompt.js';

const CLAUDE_BIN = process.env.CLAUDE_CODE_BIN || 'claude';
const CLAUDE_CODE_TIMEOUT_MS = Number(process.env.ENRICH_TIMEOUT_MS || 8 * 60 * 1000);
export const enrichModel = () => process.env.VINOFLOW_MODEL_ENRICH_WINE || MODELS.CLAUDE_SONNET;

let claudeAvailable;
const claudeCodeInstalled = () => {
  if (claudeAvailable === undefined) {
    const r = spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf8', timeout: 15000 });
    claudeAvailable = r.status === 0;
  }
  return claudeAvailable;
};

/** Claude Code prêt (binaire présent et jeton d'abonnement fourni). */
export const claudeCodeAvailable = () => claudeCodeInstalled() && Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);

/** Moteur utilisable, ou null si l'enrichissement est indisponible. */
export const availableEngine = () => {
  const wanted = (process.env.ENRICH_ENGINE || 'auto').toLowerCase();
  if (wanted === 'off') return null;
  // En auto, Claude Code n'est retenu que si le jeton d'abonnement est fourni
  // (dans le conteneur, il n'y a pas d'autre moyen de se connecter).
  const claudeCodeReady = () => claudeCodeInstalled()
    && (Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN) || wanted === 'claude-code');
  if (wanted === 'claude-code') return claudeCodeReady() ? 'claude-code' : null;
  if (wanted === 'api') return isProviderConfigured('claude') ? 'api' : null;
  if (claudeCodeReady()) return 'claude-code';
  if (isProviderConfigured('claude')) return 'api';
  return null;
};

export class EnrichmentEngineError extends Error {}

/**
 * Exécute `claude -p` et renvoie { data, searches, usage }.
 * @param {(args: string[], input: string, cwd: string, opts: {timeoutMs: number}) => Promise<{stdout, code}>} [runner] - injectable pour les tests
 * @param {number} [timeoutMs] - délai maximal (défaut : ENRICH_TIMEOUT_MS ; la discussion passe un budget court)
 */
export const runClaudeCode = async (userPrompt, {
  runner = defaultRunner, schema = ENRICHMENT_SCHEMA, systemPrompt = SYSTEM_PROMPT, task = 'enrich-wine', timeoutMs = CLAUDE_CODE_TIMEOUT_MS,
} = {}) => {
  const model = enrichModel();
  const args = [
    '-p',
    '--model', model,
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--append-system-prompt', systemPrompt,
    '--tools', 'WebSearch,WebFetch',
    '--allowedTools', 'WebSearch WebFetch',
    '--no-session-persistence',
    '--strict-mcp-config',
  ];
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vinoflow-enrich-'));
  const started = Date.now();
  try {
    const { stdout, code } = await runner(args, userPrompt, workDir, { timeoutMs });
    let out;
    try {
      out = JSON.parse(stdout);
    } catch {
      throw new EnrichmentEngineError(`Claude Code a échoué (code ${code}) : ${String(stdout).slice(0, 200)}`);
    }
    if (out.is_error || !out.structured_output) {
      throw new EnrichmentEngineError(`Claude Code a échoué (${out.subtype || 'erreur'}) : ${String(out.result || '').slice(0, 200)}`);
    }
    const u = out.usage || {};
    const usage = {
      inputTokens: u.input_tokens || 0,
      outputTokens: u.output_tokens || 0,
      cacheReadTokens: u.cache_read_input_tokens || 0,
      cacheWriteTokens: u.cache_creation_input_tokens || 0,
      // La CLI compte les recherches par modèle (modelUsage), pas dans usage.
      webSearches: u.server_tool_use?.web_search_requests
        || Object.values(out.modelUsage || {}).reduce((n, m) => n + (m.webSearchRequests || 0), 0),
    };
    logAiCall({ task, provider: 'claude-code', model, ok: true, latencyMs: Date.now() - started, ...usage });
    return { data: out.structured_output, usage, engine: 'claude-code', model, equivalentCostUsd: out.total_cost_usd ?? null };
  } catch (error) {
    logAiCall({ task, provider: 'claude-code', model, ok: false, latencyMs: Date.now() - started, error: error.message });
    throw error;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

const defaultRunner = (args, input, cwd, { timeoutMs = CLAUDE_CODE_TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
  const child = spawn(CLAUDE_BIN, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    const human = timeoutMs >= 60000 ? `${Math.round(timeoutMs / 60000)} min` : `${Math.round(timeoutMs / 1000)} s`;
    reject(new EnrichmentEngineError(`Claude Code n'a pas répondu en ${human}`));
  }, timeoutMs);
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('error', (err) => { clearTimeout(timer); reject(new EnrichmentEngineError(`Claude Code introuvable : ${err.message}`)); });
  child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ stdout: stdout || stderr, code });
  });
  child.stdin.end(input);
});

/** Repli : Messages API avec l'outil serveur de recherche web. */
export const runApi = async (userPrompt, { schema = ENRICHMENT_SCHEMA, systemPrompt = SYSTEM_PROMPT, task = 'enrich-wine' } = {}) => {
  const result = await generateStructured(task, {
    system: systemPrompt,
    user: userPrompt,
    schema,
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8, blocked_domains: BLOCKED_DOMAINS },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6, blocked_domains: BLOCKED_DOMAINS },
    ],
  });
  return { data: result.data, usage: result.usage, engine: 'api', model: result.model, searchedSources: result.sources };
};

export const runEngine = (engine, userPrompt, options = {}) => (engine === 'claude-code'
  ? runClaudeCode(userPrompt, options)
  : runApi(userPrompt, options));
