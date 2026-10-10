// Discussion avec le sommelier après un accord. Sans état côté modèle : chaque
// tour reconstruit le prompt (cave en stock compacte + accord + historique).
// Moteur : Messages API (défaut) ou Claude Code sur l'abonnement
// (SOMMELIER_CHAT_ENGINE=claude-code), même prompt et même schéma.
import { generateStructured, isProviderConfigured } from '../services/aiService.js';
import { claudeCodeAvailable, runClaudeCode } from '../enrichment/engines.js';
import { getPeakWindow } from './peakWindow.js';
import { CHAT_REPLY_SCHEMA } from './schemas.js';

export const MAX_HISTORY = 12;
export const MAX_MESSAGE_CHARS = 2000;
// Claude Code : un tour doit tenir sous le délai du proxy (nginx : 60 s par défaut).
export const CLAUDE_CODE_CHAT_TIMEOUT_MS = 50_000;
const MAX_HISTORY_CHARS = 1500;

const SYSTEM = `Vous êtes un sommelier français, chaleureux et précis, qui conseille à partir de la cave personnelle de l'utilisateur. Vous le vouvoyez.
Règles :
- Ne citez QUE des vins de la liste « Cave en stock », et reportez leurs id dans "wine_ids" (ceux que vous recommandez ou commentez).
- Répondez court : 3 à 8 phrases, concrètes (température, carafe, ordre de service, pourquoi tel vin plutôt qu'un autre).
- Si la question modifie le plat (autre protéine, autre recette ; un changement de nombre de convives ne compte pas), reformulez le plat complet dans "revised_dish" ; sinon null.
- Ne refaites pas les 3 perspectives sauf si on vous le demande ; appuyez-vous dessus.
- Pas de listes à puces ni de markdown : du texte simple.`;

const wineLine = (w) => {
  const label = [w.producer, w.name, w.cuvee && w.cuvee !== w.name ? w.cuvee : null, w.vintage].filter(Boolean).join(' ');
  const region = [w.region, w.appellation].filter(Boolean).join(' / ') || '?';
  const aromas = (w.aromaProfile || []).slice(0, 5).join(', ') || '?';
  const peak = getPeakWindow(w);
  return `${w.id} | ${label} | ${w.type} | ${region} | ${w.inventoryCount} btl | ${aromas} | ${peak?.status || '?'}`;
};

const pickLine = (label, p) => (p ? `${label} : ${p.wine_id} — ${p.reason || ''}` : `${label} : aucun`);

export const buildChatPrompt = ({ dish, pairing, inventory, tasteProfile = null, messages = [], question }) => {
  const inStock = inventory.filter((w) => (w.inventoryCount ?? 0) > 0);
  const picks = pairing?.picks || {};
  const history = messages.slice(-MAX_HISTORY).map((m) =>
    `${m.role === 'assistant' ? 'Sommelier' : 'Utilisateur'} : ${String(m.content).slice(0, MAX_HISTORY_CHARS)}`);
  const user = [
    `Cave en stock (${inStock.length} vins) — id | vin | type | région / appellation | stock | arômes | apogée :`,
    ...inStock.map(wineLine),
    '',
    `Plat : ${dish}`,
    pairing?.rationale ? `Analyse du plat : ${pairing.rationale}` : null,
    'Accord proposé :',
    pickLine('Sûr', picks.safe),
    pickLine('Personnel', picks.personal),
    pickLine('Audacieux', picks.creative),
    ...(picks.alternatives || []).map((a) => `Autre : ${a.wine_id} — ${a.reason || ''}`),
    picks.global_advice ? `Conseil : ${picks.global_advice}` : null,
    tasteProfile ? `Profil de goût : ${JSON.stringify(tasteProfile)}` : null,
    history.length ? `\nDiscussion jusqu'ici :\n${history.join('\n')}` : null,
    '',
    `Utilisateur : ${question}`,
  ].filter((l) => l !== null).join('\n');
  return { system: SYSTEM, user };
};

export const validateReply = (raw, inStock, dish) => {
  const ids = new Set(inStock.map((w) => w.id));
  const wineIds = [...new Set((raw?.wine_ids || []).filter((id) => ids.has(id)))];
  const revised = String(raw?.revised_dish || '').trim();
  const revisedDish = revised && revised.toLowerCase() !== String(dish).trim().toLowerCase() ? revised : null;
  return { reply: String(raw?.reply || '').trim(), wineIds, revisedDish };
};

export const chatEngine = () => {
  const wanted = (process.env.SOMMELIER_CHAT_ENGINE || 'api').toLowerCase();
  if (wanted === 'claude-code') {
    if (claudeCodeAvailable()) return 'claude-code';
    console.warn('[sommelier-chat] SOMMELIER_CHAT_ENGINE=claude-code mais Claude Code indisponible (binaire ou CLAUDE_CODE_OAUTH_TOKEN) : repli API');
  }
  return 'api';
};

/**
 * Un tour de discussion.
 * @returns {Promise<{ reply: string, wineIds: string[], revisedDish: string|null, engine: string }>}
 */
export const answerQuestion = async (params) => {
  const { system, user } = buildChatPrompt(params);
  const inStock = params.inventory.filter((w) => (w.inventoryCount ?? 0) > 0);
  if (chatEngine() === 'claude-code') {
    try {
      const { data } = await runClaudeCode(user, { schema: CHAT_REPLY_SCHEMA, systemPrompt: system, task: 'sommelier-chat', timeoutMs: CLAUDE_CODE_CHAT_TIMEOUT_MS });
      return { ...validateReply(data, inStock, params.dish), engine: 'claude-code' };
    } catch (error) {
      if (!isProviderConfigured('claude') && !isProviderConfigured('gemini')) throw error;
      console.warn('[sommelier-chat] Claude Code en échec, repli API :', error.message);
    }
  }
  const { data, provider } = await generateStructured('sommelier-chat', { system, user, schema: CHAT_REPLY_SCHEMA });
  return { ...validateReply(data, inStock, params.dish), engine: provider };
};
