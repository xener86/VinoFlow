// Prototype (partie C) : sommelier en un seul appel avec outils, derrière le
// flag VINOFLOW_SOMMELIER_AGENT=true. À comparer au pipeline
// extract → score → argue → critique (coordinator.js) avant toute bascule.
//
// Le scoring déterministe reste le pré-filtre : l'outil search_cellar applique
// rules.js + scoring.js aux critères que le modèle formule lui-même. Le modèle
// lit ensuite les fiches (get_wine_details, get_peak) et choisit 3 vins.
// Validation serveur : tout wine_id hors de la cave en stock est écarté.

import { getClaudeClient, resolveTask, logAiCall, readClaudeResponse, AiRefusalError } from '../services/aiService.js';
import { buildHardFilter } from './rules.js';
import { rankWines } from './scoring.js';
import { getPeakWindow } from './peakWindow.js';
import { PICKS_SCHEMA, WINE_TYPES, schemaHelpers } from './schemas.js';

const { obj, arr, str, num, enumOf, nullable } = schemaHelpers;
const MAX_TURNS = 6;

const SYSTEM_PROMPT = `Tu es un sommelier expert français qui conseille à partir de la cave personnelle de l'utilisateur. Tu ne proposes QUE des vins présents dans la cave, identifiés par leur id.

Démarche :
1. Analyse le plat (protéine, sauce, cuisson, épices, intensité) et formule le profil de vin idéal.
2. Appelle search_cellar avec ce profil : le serveur filtre et classe la cave (règles d'accord + score). Tu peux l'appeler plusieurs fois avec des profils différents (ex. pour l'option créative).
3. Si besoin, consulte get_wine_details ou get_peak pour départager.
4. Choisis 3 recommandations : SAFE (l'accord classique), PERSONAL (selon les goûts connus de l'utilisateur), CREATIVE (audacieux mais défendable). Pour chacune : id, 2-3 phrases sur le mécanisme de l'accord, température de service, décantage. Mets null si aucun vin ne convient pour une catégorie. Ajoute un conseil global court.`;

const range = arr(num);
const TOOLS = [
  {
    name: 'search_cellar',
    description: 'Filtre et classe les vins EN STOCK de la cave selon un profil de vin idéal (règles d\'accord + score déterministe). Renvoie les meilleurs candidats avec leur score.',
    strict: true,
    input_schema: obj({
      types: arr(enumOf(...WINE_TYPES)),
      body: range,
      acidity: range,
      tannin: range,
      sweetness: range,
      alcohol: range,
      regions: arr(str),
      grapes: arr(str),
      aromas: arr(str),
      avoid: arr(str),
      protein: str,
      sauce: str,
      spices: str,
      intensity: enumOf('light', 'medium', 'rich'),
      limit: nullable(num),
    }),
  },
  {
    name: 'get_wine_details',
    description: 'Fiche complète d\'un ou plusieurs vins de la cave (producteur, appellation, cépages, arômes, profil sensoriel, stock, notes).',
    strict: true,
    input_schema: obj({ wine_ids: arr(str) }),
  },
  {
    name: 'get_peak',
    description: 'Fenêtre d\'apogée et statut (Garde, À Boire, Boire Vite, Apogée passée) d\'un vin de la cave.',
    strict: true,
    input_schema: obj({ wine_id: str }),
  },
];

const shortWine = (w) => ({
  id: w.id,
  label: [w.producer, w.name, w.cuvee !== w.name ? w.cuvee : null, w.vintage].filter(Boolean).join(' '),
  type: w.type,
  region: [w.region, w.appellation].filter(Boolean).join(' / '),
  aromas: w.aromaProfile || [],
  stock: w.inventoryCount,
});

/** Exécute un outil local sur la cave en stock. */
export const runTool = (name, input, inStock) => {
  const byId = new Map(inStock.map((w) => [w.id, w]));
  if (name === 'search_cellar') {
    const criteria = {
      decomposition: { protein: input.protein, sauce: input.sauce, spices: input.spices, intensity: input.intensity },
      wine_profile: input,
    };
    const ranked = rankWines(inStock.filter(buildHardFilter(criteria)), criteria, Math.min(input.limit || 12, 20));
    return ranked.map((c) => ({ ...shortWine(c.wine), score: Number(c.score.toFixed(3)) }));
  }
  if (name === 'get_wine_details') {
    return (input.wine_ids || []).map((id) => {
      const w = byId.get(id);
      if (!w) return { id, error: 'Vin absent de la cave en stock' };
      return {
        ...shortWine(w),
        grapes: w.grapeVarieties || [],
        sensory: w.sensoryProfile || null,
        description: w.sensoryDescription || null,
        aroma_confidence: w.aromaConfidence || null,
        peak: getPeakWindow(w),
      };
    });
  }
  if (name === 'get_peak') {
    const w = byId.get(input.wine_id);
    return w ? { id: w.id, ...getPeakWindow(w) } : { error: 'Vin absent de la cave en stock' };
  }
  return { error: `Outil inconnu : ${name}` };
};

/** Écarte tout choix dont le wine_id n'est pas dans la cave en stock. */
export const validatePicks = (picks, inStock) => {
  const ids = new Set(inStock.map((w) => w.id));
  const ensure = (p) => (p && ids.has(p.wine_id) ? p : null);
  return { safe: ensure(picks.safe), personal: ensure(picks.personal), creative: ensure(picks.creative), global_advice: picks.global_advice || '' };
};

/**
 * @returns {Promise<{ picks, candidates, turns, usage, toolCalls }>}
 */
export const runAgentPairing = async ({ inventory, dish, tasteProfile = null, userFeedback = [], options = {} }) => {
  const cfg = resolveTask('argue', { effort: 'medium', ...options });
  const client = getClaudeClient(cfg.apiKey);
  const inStock = inventory.filter((w) => (w.inventoryCount ?? 0) > 0);
  const liked = userFeedback.filter((f) => f.rating === 'UP').slice(0, 5).map((f) => `- aimé : « ${f.dish} » avec ${f.wine_label || 'un vin'}`);
  const user = [
    `Plat : ${dish}`,
    `Cave : ${inStock.length} vins en stock.`,
    tasteProfile ? `Profil de goût de l'utilisateur : ${JSON.stringify(tasteProfile)}` : null,
    liked.length ? `Retours passés :\n${liked.join('\n')}` : null,
  ].filter(Boolean).join('\n');

  const messages = [{ role: 'user', content: user }];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const toolCalls = [];
  const candidates = new Map(); // wine_id → meilleur score vu dans search_cellar
  const started = Date.now();
  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
        output_config: { format: { type: 'json_schema', schema: PICKS_SCHEMA }, effort: cfg.effort },
      });
      usage.inputTokens += response.usage?.input_tokens || 0;
      usage.outputTokens += response.usage?.output_tokens || 0;
      usage.cacheReadTokens += response.usage?.cache_read_input_tokens || 0;
      usage.cacheWriteTokens += response.usage?.cache_creation_input_tokens || 0;
      if (response.stop_reason === 'refusal') throw new AiRefusalError(response.stop_details?.category);

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const { data } = readClaudeResponse(response, { schema: PICKS_SCHEMA });
        logAiCall({ task: 'sommelier-agent', provider: 'claude', model: cfg.model, ok: true, latencyMs: Date.now() - started, ...usage });
        return {
          picks: validatePicks(data, inStock),
          candidates: [...candidates].map(([wine_id, score]) => ({ wine_id, score })).sort((a, b) => b.score - a.score),
          turns: turn,
          usage,
          toolCalls,
        };
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: toolUses.map((t) => {
          toolCalls.push({ name: t.name, input: t.input });
          let result;
          try {
            result = runTool(t.name, t.input, inStock);
            if (t.name === 'search_cellar') {
              result.forEach((c) => candidates.set(c.id, Math.max(candidates.get(c.id) ?? 0, c.score)));
            }
          } catch (error) {
            return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: error.message };
          }
          return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(result) };
        }),
      });
    }
    throw new Error(`Pas de réponse finale après ${MAX_TURNS} tours`);
  } catch (error) {
    logAiCall({ task: 'sommelier-agent', provider: 'claude', model: cfg.model, ok: false, latencyMs: Date.now() - started, ...usage, error: error.message });
    throw error;
  }
};
