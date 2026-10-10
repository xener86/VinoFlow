# Accords élargis et discussion avec le sommelier — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'accord mets-vin propose, après les 3 perspectives, jusqu'à 5 autres vins argumentés, et l'utilisateur peut poursuivre la discussion avec le sommelier (enregistrée, reprise possible).

**Architecture:** Le schéma `PICKS_SCHEMA` gagne `alternatives` produit par le même appel LLM (pipeline et agent), validé serveur. La discussion est un nouveau module `sommelier/chat.js` sans état côté modèle (prompt reconstruit à chaque tour : cave compacte + accord + historique), persistée dans deux tables, exposée par `POST /sommelier/chat` + routes de lecture, et rendue par un composant `SommelierChat` sous les résultats.

**Tech Stack:** Node 20 + Express + pg (backend, Vitest), React 19 + Vite + Tailwind (frontend), Claude Messages API via `aiService` (sorties structurées), Claude Code `claude -p` via `enrichment/engines.js` en option.

**Spec:** `docs/superpowers/specs/2026-10-10-accords-discussion-design.md`

## Global Constraints

- Copie UI, commits et commentaires en français ; vouvoiement dans l'interface et le prompt de discussion.
- Pas de classes `dark:` (mode sombre retiré).
- Schémas JSON : chaque objet `additionalProperties: false`, tous les champs requis, facultatif = nullable (`schemaHelpers`).
- Nouvelle migration = fichier numéroté idempotent, **sans** `BEGIN`/`COMMIT` : `db/migrations/013_sommelier_conversations.sql`.
- Les discussions sont propres au compte (`user_id`) ; la cave reste partagée (pas de filtre par compte sur les tables de cave).
- Toute route `POST /api/sommelier/*` est déjà sous `aiLimiter` (`app.js`).
- Résultats en cache antérieurs sans `alternatives` : traiter l'absence comme `[]`.
- Charger le skill `claude-api` avant de toucher aux appels Anthropic (ici : seulement `TASK_DEFAULTS`, pas de nouvel appel brut).

## Review Focus

1. Un `wine_id` d'alternative inventé ou déjà dans les 3 choix → écarté (test Tâche 1 et 2).
2. Un résultat de cache niveau 2 sans `alternatives` → l'écran et `pickInStock` ne plantent pas (test Tâche 3, rendu Tâche 5 avec `?? []`).
3. Un message de discussion vide, trop long (> 2 000) ou une conversation d'un autre compte → 400 / 404 sans appel IA (tests Tâche 8).
4. Le moteur échoue → rien d'enregistré, 502 lisible, le navigateur propose « Réessayer » (test Tâche 8, UI Tâche 9).
5. `SOMMELIER_CHAT_ENGINE=claude-code` sans jeton ni binaire → repli `api` avec avertissement, jamais d'erreur (test Tâche 7).

---

### Task 1: Alternatives dans le schéma et le pipeline (LLM2)

**Files:**
- Modify: `backend/src/sommelier/schemas.js` (PICKS_SCHEMA)
- Modify: `backend/src/sommelier/llm2.js` (prompt + validation)
- Create: `backend/tests/unit/llm2.test.js`

**Interfaces:**
- Produces: `PICKS_SCHEMA.alternatives: [{ wine_id, reason }]` ; `argueAndPick()` renvoie toujours `alternatives: Array` (≤ 5, ids valides, sans doublon avec safe/personal/creative).

- [ ] **Step 1: Test en échec**

```js
// backend/tests/unit/llm2.test.js
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
  it('alternatives absentes → tableau vide', async () => {
    generateJson.mockResolvedValue({ safe: null, personal: null, creative: null, global_advice: '' });
    expect((await argueAndPick('plat', criteria, candidates)).alternatives).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `cd backend && npx vitest run tests/unit/llm2.test.js` → FAIL (`alternatives` absent du schéma, `undefined` renvoyé).

- [ ] **Step 3: Implémentation**

`schemas.js` :
```js
export const PICKS_SCHEMA = obj({
  safe: pick,
  personal: pick,
  creative: pick,
  global_advice: str,
  // Autres accords qui fonctionnent vraiment, par ordre de préférence (0 à 5).
  alternatives: arr(obj({ wine_id: str, reason: str })),
});
```

`llm2.js`, prompt système : après le point 3, ajouter
```
4. ALTERNATIVES: parmi les candidats restants, ceux qui fonctionneraient vraiment avec le plat (0 à 5, par ordre de préférence), chacun avec une raison en 1 phrase. Ne reprends pas un vin déjà retenu en SAFE/PERSONAL/CREATIVE. Tableau vide si aucun autre candidat ne convient.
```
et dans la structure JSON d'exemple : `"alternatives": [ { "wine_id": "...", "reason": "..." } ]`. Dernière ligne du prompt utilisateur : `Choisis les 3 recommandations (SAFE / PERSONAL / CREATIVE) puis les alternatives parmi ces candidats.`

Export d'un validateur partagé (utilisé aussi par l'agent) :
```js
/** Alternatives : ids valides, hors des 3 choix, sans doublon, 5 au plus. */
export const validateAlternatives = (raw, validIds, picks) => {
  const taken = new Set([picks.safe, picks.personal, picks.creative].filter(Boolean).map((p) => p.wine_id));
  const out = [];
  for (const alt of Array.isArray(raw) ? raw : []) {
    const id = alt?.wine_id;
    if (!id || !validIds.has(id) || taken.has(id)) continue;
    taken.add(id);
    out.push({ wine_id: id, reason: String(alt.reason || '') });
    if (out.length === 5) break;
  }
  return out;
};
```
Dans `validateLlm2Response`, construire `picks` puis `return { ...picks, global_advice, alternatives: validateAlternatives(raw.alternatives, validIds, picks) }`. Le repli « aucun candidat » de `argueAndPick` renvoie aussi `alternatives: []`.

- [ ] **Step 4: Tests verts** — `cd backend && npx vitest run tests/unit/llm2.test.js tests/unit/aiService.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Sommelier : accords alternatifs argumentés dans le pipeline"`

### Task 2: Alternatives dans l'agent

**Files:**
- Modify: `backend/src/sommelier/agent.js` (SYSTEM_PROMPT, `validatePicks`)
- Modify: `backend/tests/unit/agent.test.js`

- [ ] **Step 1: Test en échec** — dans `describe('outils du sommelier agent')` :
```js
  it('validatePicks garde les alternatives en stock hors des 3 choix', () => {
    const inStock = cave.filter((w) => w.inventoryCount > 0);
    const r = validatePicks({ safe: { wine_id: 'w1' }, personal: null, creative: null, global_advice: 'x',
      alternatives: [{ wine_id: 'w2', reason: 'b' }, { wine_id: 'w1', reason: 'déjà' }, { wine_id: 'w3', reason: 'épuisé' }] }, inStock);
    expect(r.alternatives).toEqual([{ wine_id: 'w2', reason: 'b' }]);
  });
```
Et mettre à jour le test existant `validatePicks écarte…` : attendre `alternatives: []` dans l'objet.

- [ ] **Step 2: Échec** — `npx vitest run tests/unit/agent.test.js` → FAIL.
- [ ] **Step 3: Implémentation** — importer `validateAlternatives` depuis `./llm2.js` ; `validatePicks` :
```js
export const validatePicks = (picks, inStock) => {
  const ids = new Set(inStock.map((w) => w.id));
  const ensure = (p) => (p && ids.has(p.wine_id) ? p : null);
  const base = { safe: ensure(picks.safe), personal: ensure(picks.personal), creative: ensure(picks.creative) };
  return { ...base, global_advice: picks.global_advice || '', alternatives: validateAlternatives(picks.alternatives, ids, base) };
};
```
SYSTEM_PROMPT, point 4 → ajouter : `Ajoute ensuite en "alternatives" les autres vins de la cave qui fonctionneraient vraiment (0 à 5, par ordre de préférence, une raison en 1 phrase), sans reprendre les 3 choix.`
- [ ] **Step 4: Vert** — `npx vitest run tests/unit/agent.test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Sommelier : alternatives dans l'agent à outils"`

### Task 3: `pickInStock` parcourt les alternatives

**Files:**
- Modify: `backend/src/sommelier/pairForDish.js`
- Modify: `backend/tests/unit/pairForDish.test.js`

- [ ] **Step 1: Test** (dans le `describe` de `pickInStock`, ou nouveau) :
```js
  it('pickInStock retombe sur une alternative en stock', () => {
    const byId = new Map([['a', { inventoryCount: 0 }], ['b', { inventoryCount: 1 }]]);
    const result = { picks: { safe: { wine_id: 'a', reason: 'x' }, personal: null, creative: null, alternatives: [{ wine_id: 'b', reason: 'alt' }] } };
    expect(pickInStock(result, byId)).toEqual({ wine_id: 'b', reason: 'alt' });
  });
  it('pickInStock tolère un résultat sans alternatives', () => {
    expect(pickInStock({ picks: { safe: null, personal: null, creative: null } }, new Map())).toBeNull();
  });
```
- [ ] **Step 2: Échec**, **Step 3:** `for (const pick of [p.safe, p.personal, p.creative, ...(p.alternatives || [])])`, **Step 4: Vert**, **Step 5: Commit** `"Sommelier : MenuFlow retombe sur un accord alternatif"`.

### Task 4: MCP `sommelier_pair` affiche les alternatives

**Files:**
- Modify: `mcp-server/src/vinoflow-client.ts:355-367` (`alternatives?: { wine_id: string; reason: string }[]` dans `picks`)
- Modify: `mcp-server/src/index.ts:326-358`

- [ ] **Step 1:** Après `formatPick('✨ CREATIVE…')`, ajouter :
```ts
                ...((result.picks.alternatives ?? []).length
                    ? ['', '**Autres accords possibles**', ...(result.picks.alternatives ?? []).map((a) => `- ${a.wine_id} — ${a.reason}`)]
                    : []),
```
Description de l'outil : `… (SAFE / PERSONAL / CREATIVE) plus up to 5 argued alternatives …`.
- [ ] **Step 2:** `cd mcp-server && npm test && npm run build` → PASS.
- [ ] **Step 3: Commit** `"MCP : accords alternatifs dans sommelier_pair"`.

### Task 5: Section « Autres accords possibles » dans l'écran Accord

**Files:**
- Modify: `components/SommelierV2.tsx`

- [ ] **Step 1:** Types : `interface Alternative { wine_id: string; reason: string }` ; `picks.alternatives?: Alternative[]` ; `handleFeedback` accepte la catégorie `'ALTERNATIVE'` (clé de `feedbackGiven` = `ALT:<wine_id>`).
- [ ] **Step 2:** Sous `global_advice`, rendu :
```tsx
          {(result.picks.alternatives ?? []).filter(a => wineById(a.wine_id)).length > 0 && (
            <div className="pt-2">
              <MonoLabel>◌ Autres accords possibles</MonoLabel>
              <ul className="mt-2 divide-y divide-stone-100 border border-stone-200 rounded-md bg-white">
                {(result.picks.alternatives ?? []).map(a => {
                  const wine = wineById(a.wine_id);
                  if (!wine) return null;
                  const stock = Math.max(0, inStockBottles(wine).length - (openedCount[wine.id] || 0));
                  const fb = feedbackGiven[`ALT:${wine.id}`];
                  return (
                    <li key={a.wine_id} className="p-3 flex flex-col sm:flex-row sm:items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <WineLink id={wine.id} className="serif text-[15px] text-stone-900">{wine.name}{wine.cuvee && wine.cuvee !== wine.name ? ` · ${wine.cuvee}` : ''}</WineLink>
                        <div className="text-xs text-stone-500">{[wine.producer, wine.vintage || null].filter(Boolean).join(' · ')} · {stock} btl</div>
                        <p className="text-xs text-stone-700 mt-1 leading-relaxed">{a.reason}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleOpenBottle(wine)} disabled={stock === 0} className="h-9 px-3 rounded-md bg-wine-700 hover:bg-wine-800 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40"><GlassWater size={14} /> Ouvrir</button>
                        <button onClick={() => handleFeedback('ALTERNATIVE', wine.id, 'UP')} disabled={fb !== undefined} aria-label="J'aime cet accord" className={`h-9 w-9 inline-flex items-center justify-center rounded ${fb === 'UP' ? 'bg-emerald-600 text-white' : 'hover:bg-emerald-50 text-stone-600'}`}><ThumbsUp size={14} /></button>
                        <button onClick={() => handleFeedback('ALTERNATIVE', wine.id, 'DOWN')} disabled={fb !== undefined} aria-label="Je n'aime pas cet accord" className={`h-9 w-9 inline-flex items-center justify-center rounded ${fb === 'DOWN' ? 'bg-wine-700 text-white' : 'hover:bg-wine-50 text-stone-600'}`}><ThumbsDown size={14} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
```
Importer `MonoLabel`, `WineLink` depuis `./cockpit/primitives`. Texte de progression → « Propositions argumentées ».
- [ ] **Step 3:** `npm run typecheck && npm run build` → OK.
- [ ] **Step 4: Commit** `"Accord : autres accords possibles sous les 3 perspectives"`.

### Task 6: Migration des discussions

**Files:**
- Create: `db/migrations/013_sommelier_conversations.sql` (DDL de la spec §2, tel quel)
- Modify: `backend/tests/api/helpers.js` (`resetData` : ajouter `sommelier_conversations, sommelier_messages` au TRUNCATE)

- [ ] **Step 1:** Écrire le fichier ; **Step 2:** `cd backend && npx vitest run tests/api/migrations.test.js` (saute sans `TEST_DATABASE_URL`) ; **Step 3: Commit** `"Base : tables des discussions avec le sommelier"`.

### Task 7: Moteur de discussion `sommelier/chat.js`

**Files:**
- Create: `backend/src/sommelier/chat.js`
- Modify: `backend/src/sommelier/schemas.js` (CHAT_REPLY_SCHEMA)
- Modify: `backend/src/services/aiService.js` (`TASK_DEFAULTS['sommelier-chat']`)
- Modify: `backend/src/enrichment/engines.js` (exporter `claudeCodeAvailable()`)
- Create: `backend/tests/unit/chat.test.js`

**Interfaces (Produces):**
- `buildChatPrompt({ dish, pairing, inventory, tasteProfile, messages, question }) → { system, user }`
- `validateReply(raw, inStock, dish) → { reply, wineIds, revisedDish }`
- `chatEngine() → 'api' | 'claude-code'`
- `answerQuestion({ dish, pairing, inventory, tasteProfile, messages, question }) → { reply, wineIds, revisedDish, engine }`
- `MAX_HISTORY = 12`, `MAX_MESSAGE_CHARS = 2000`

- [ ] **Step 1: Tests**
```js
// backend/tests/unit/chat.test.js
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
const pairing = { picks: { safe: { wine_id: 'w1', reason: 'classique' }, personal: null, creative: null, global_advice: 'g', alternatives: [] }, rationale: 'r', cave_size: 1 };

beforeEach(() => { ai.generateStructured.mockReset(); engines.runClaudeCode.mockReset(); engines.claudeCodeAvailable.mockReturnValue(false); });
afterEach(() => vi.unstubAllEnvs());

describe('buildChatPrompt', () => {
  it('cave en stock compacte (5 arômes max, vins épuisés exclus), accord, question', () => {
    const { system, user } = buildChatPrompt({ dish: 'huîtres', pairing, inventory, messages: [], question: 'Pourquoi ?' });
    expect(system).toMatch(/vouvoie|vous/i);
    expect(user).toContain('w1 | Raveneau Chablis 2021 | WHITE | Bourgogne / Chablis | 2 btl | citron, silex, a, b, c');
    expect(user).not.toContain('w2 |');
    expect(user).toContain('Sûr : w1');
    expect(user.trim().endsWith('Pourquoi ?')).toBe(true);
  });
  it('ne garde que les 12 derniers messages, tronqués', () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i} ${'x'.repeat(2000)}` }));
    const { user } = buildChatPrompt({ dish: 'd', pairing, inventory, messages, question: 'q' });
    expect(user).not.toContain('m7 ');
    expect(user).toContain('m8 ');
    expect(user).not.toContain('x'.repeat(1501));
    expect(MAX_HISTORY).toBe(12);
  });
});

describe('validateReply', () => {
  it('filtre les vins hors stock, dédoublonne, neutralise revised_dish égal au plat', () => {
    const r = validateReply({ reply: ' ok ', wine_ids: ['w1', 'w2', 'w1', 'zz'], revised_dish: ' Huîtres ' }, inventory.filter((w) => w.inventoryCount > 0), 'huîtres');
    expect(r).toEqual({ reply: 'ok', wineIds: ['w1'], revisedDish: null });
    expect(validateReply({ reply: 'x', wine_ids: [], revised_dish: 'saumon' }, [], 'huîtres').revisedDish).toBe('saumon');
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
  it('api : generateStructured sur la tâche sommelier-chat', async () => {
    ai.generateStructured.mockResolvedValue({ data: { reply: 'Le Chablis.', wine_ids: ['w1'], revised_dish: null }, provider: 'claude' });
    const r = await answerQuestion({ dish: 'huîtres', pairing, inventory, messages: [], question: 'q' });
    expect(ai.generateStructured).toHaveBeenCalledWith('sommelier-chat', expect.objectContaining({ schema: expect.any(Object) }));
    expect(r).toEqual({ reply: 'Le Chablis.', wineIds: ['w1'], revisedDish: null, engine: 'claude' });
  });
  it('claude-code en échec → repli api', async () => {
    vi.stubEnv('SOMMELIER_CHAT_ENGINE', 'claude-code');
    engines.claudeCodeAvailable.mockReturnValue(true);
    engines.runClaudeCode.mockRejectedValue(new Error('boom'));
    ai.generateStructured.mockResolvedValue({ data: { reply: 'r', wine_ids: [], revised_dish: null }, provider: 'gemini' });
    const r = await answerQuestion({ dish: 'd', pairing, inventory, messages: [], question: 'q' });
    expect(r.engine).toBe('gemini');
  });
});
```
- [ ] **Step 2: Échec** — `npx vitest run tests/unit/chat.test.js`.
- [ ] **Step 3: Implémentation**

`engines.js` : `export const claudeCodeAvailable = () => claudeCodeInstalled() && Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);`

`schemas.js` : `export const CHAT_REPLY_SCHEMA = obj({ reply: str, wine_ids: arr(str), revised_dish: nullable(str) });`

`aiService.js` `TASK_DEFAULTS` :
```js
  // Discussion avec le sommelier après un accord (sommelier/chat.js) ; moteur
  // Claude Code en option (SOMMELIER_CHAT_ENGINE).
  'sommelier-chat': {
    provider: 'claude', model: MODELS.CLAUDE_SONNET, maxTokens: 3000, effort: 'low',
    fallback: { provider: 'gemini', model: MODELS.GEMINI_FLASH },
  },
```

`chat.js` :
```js
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
const MAX_HISTORY_CHARS = 1500;

const SYSTEM = `Vous êtes un sommelier français, chaleureux et précis, qui conseille à partir de la cave personnelle de l'utilisateur. Vous le vouvoyez.
Règles :
- Ne citez QUE des vins de la liste « Cave en stock », et reportez leurs id dans "wine_ids" (ceux que vous recommandez ou commentez).
- Répondez court : 3 à 8 phrases, concrètes (température, carafe, ordre de service, pourquoi tel vin plutôt qu'un autre).
- Si la question modifie le plat (autre protéine, autre recette, autre nombre de convives ne compte pas), reformulez le plat complet dans "revised_dish" ; sinon null.
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
    pickLine('Sûr', picks.safe), pickLine('Personnel', picks.personal), pickLine('Audacieux', picks.creative),
    ...((picks.alternatives || []).map((a) => `Autre : ${a.wine_id} — ${a.reason || ''}`)),
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

export const answerQuestion = async (params) => {
  const { system, user } = buildChatPrompt(params);
  const inStock = params.inventory.filter((w) => (w.inventoryCount ?? 0) > 0);
  let engine = chatEngine();
  if (engine === 'claude-code') {
    try {
      const { data } = await runClaudeCode(user, { schema: CHAT_REPLY_SCHEMA, systemPrompt: system, task: 'sommelier-chat' });
      return { ...validateReply(data, inStock, params.dish), engine: 'claude-code' };
    } catch (error) {
      if (!isProviderConfigured('claude') && !isProviderConfigured('gemini')) throw error;
      console.warn('[sommelier-chat] Claude Code en échec, repli API :', error.message);
      engine = 'api';
    }
  }
  const { data, provider } = await generateStructured('sommelier-chat', { system, user, schema: CHAT_REPLY_SCHEMA });
  return { ...validateReply(data, inStock, params.dish), engine: provider };
};
```
- [ ] **Step 4: Vert** — `npx vitest run tests/unit/chat.test.js tests/unit/aiService.test.js tests/unit/enrichment.test.js`.
- [ ] **Step 5: Commit** `"Sommelier : moteur de discussion (API, Claude Code en option)"`.

### Task 8: Routes `chat` et `conversations`

**Files:**
- Create: `backend/src/sommelier/conversations.js` (accès base)
- Modify: `backend/src/routes/sommelier.js`
- Create: `backend/tests/api/sommelier.chat.test.js`

**Interfaces (Produces):**
- `POST /api/sommelier/chat` → `{ conversationId, message }` ; `GET /api/sommelier/conversations` → `{ conversations }` ; `GET /api/sommelier/conversations/:id` → `{ id, dish, pairing, createdAt, updatedAt, messages }` ; `DELETE …/:id` → 204.
- Message : `{ id, role, content, wineIds, revisedDish, engine, createdAt }`.

- [ ] **Step 1: Tests API** (sautés sans `TEST_DATABASE_URL`, comme les autres)
```js
// backend/tests/api/sommelier.chat.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../src/sommelier/chat.js', async (orig) => ({ ...(await orig()), answerQuestion: vi.fn() }));
const { answerQuestion } = await import('../../src/sommelier/chat.js');
const { hasDb, resetData, bootstrapUser, authed, api } = await import('./helpers.js');

const pairing = { picks: { safe: null, personal: null, creative: null, global_advice: '', alternatives: [] }, criteria: { rationale: 'r' }, cave_size: 0, candidates: [] };

describe.skipIf(!hasDb)('discussion avec le sommelier', () => {
  let me;
  beforeEach(async () => {
    await resetData();
    me = authed((await bootstrapUser()).accessToken);
    answerQuestion.mockReset().mockResolvedValue({ reply: 'Bonne idée.', wineIds: [], revisedDish: null, engine: 'claude' });
  });

  it('crée la conversation au premier message puis l’allonge', async () => {
    const r1 = await me.post('/api/sommelier/chat', { dish: 'Huîtres', pairing, message: 'Pourquoi ?' });
    expect(r1.status).toBe(200);
    expect(r1.body.message).toMatchObject({ role: 'assistant', content: 'Bonne idée.', wineIds: [], revisedDish: null, engine: 'claude' });
    const id = r1.body.conversationId;
    const r2 = await me.post('/api/sommelier/chat', { conversationId: id, message: 'Et un blanc ?' });
    expect(r2.status).toBe(200);
    expect(answerQuestion).toHaveBeenLastCalledWith(expect.objectContaining({ dish: 'Huîtres', question: 'Et un blanc ?', messages: [expect.objectContaining({ role: 'user' }), expect.objectContaining({ role: 'assistant' })] }));
    const get = await me.get(`/api/sommelier/conversations/${id}`);
    expect(get.body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(get.body.pairing.rationale).toBe('r');
    const list = await me.get('/api/sommelier/conversations');
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.conversations[0]).toMatchObject({ id, dish: 'Huîtres', messageCount: 4, lastMessage: 'Bonne idée.' });
  });

  it('refuse un message vide, trop long, ou sans plat', async () => {
    expect((await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: '  ' })).status).toBe(400);
    expect((await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: 'a'.repeat(2001) })).status).toBe(400);
    expect((await me.post('/api/sommelier/chat', { message: 'bonjour' })).status).toBe(400);
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it('échec du moteur : rien d’enregistré, 502', async () => {
    answerQuestion.mockRejectedValue(new Error('boom'));
    const r = await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: 'q' });
    expect(r.status).toBe(502);
    expect((await me.get('/api/sommelier/conversations')).body.conversations).toEqual([]);
  });

  it('la conversation d’un autre compte est introuvable ; suppression', async () => {
    const id = (await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: 'q' })).body.conversationId;
    const other = authed((await api().post('/api/auth/signup').send({ email: 'b@test.fr', password: 'motdepasse-solide' })).body.accessToken);
    expect((await other.get(`/api/sommelier/conversations/${id}`)).status).toBe(404);
    expect((await other.post('/api/sommelier/chat', { conversationId: id, message: 'q' })).status).toBe(404);
    expect((await me.delete(`/api/sommelier/conversations/${id}`)).status).toBe(204);
    expect((await me.get(`/api/sommelier/conversations/${id}`)).status).toBe(404);
  });
});
```
Note : le second signup exige `ALLOW_SIGNUP=true` dans l'environnement de test (vérifier `auth.test.js` pour la manière dont il est stubé ; sinon `vi.stubEnv('ALLOW_SIGNUP', 'true')` dans le test).

- [ ] **Step 2: Échec** (404 sur les routes).
- [ ] **Step 3: Implémentation**

`conversations.js` :
```js
// Discussions avec le sommelier : persistance (propres au compte).
import { pool, withTransaction } from '../db.js';

const rowMessage = (r) => ({ id: r.id, role: r.role, content: r.content, wineIds: r.wine_ids || [], revisedDish: r.revised_dish, engine: r.engine, createdAt: r.created_at });

/** Résumé de l'accord conservé avec la conversation. */
export const compactPairing = (p) => ({
  picks: p?.picks || { safe: null, personal: null, creative: null, global_advice: '', alternatives: [] },
  rationale: p?.criteria?.rationale || p?.rationale || null,
  cave_size: p?.cave_size ?? null,
});

export const listConversations = async (userId, limit = 20) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.dish, c.updated_at,
           (SELECT count(*)::int FROM sommelier_messages m WHERE m.conversation_id = c.id) AS message_count,
           (SELECT m.content FROM sommelier_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
      FROM sommelier_conversations c WHERE c.user_id = $1 ORDER BY c.updated_at DESC LIMIT $2`, [userId, limit]);
  return rows.map((r) => ({ id: r.id, dish: r.dish, updatedAt: r.updated_at, messageCount: r.message_count, lastMessage: r.last_message ? String(r.last_message).slice(0, 160) : null }));
};

export const getConversation = async (userId, id, db = pool) => {
  const c = await db.query('SELECT * FROM sommelier_conversations WHERE id = $1 AND user_id = $2', [id, userId]);
  if (c.rows.length === 0) return null;
  const m = await db.query('SELECT * FROM sommelier_messages WHERE conversation_id = $1 ORDER BY created_at, id', [id]);
  const row = c.rows[0];
  return { id: row.id, dish: row.dish, pairing: row.pairing, createdAt: row.created_at, updatedAt: row.updated_at, messages: m.rows.map(rowMessage) };
};

export const deleteConversation = async (userId, id) =>
  (await pool.query('DELETE FROM sommelier_conversations WHERE id = $1 AND user_id = $2', [id, userId])).rowCount > 0;

/**
 * Un tour : crée la conversation si besoin, enregistre question + réponse en
 * une transaction (rien n'est conservé si `answer` échoue).
 */
export const runTurn = async ({ userId, conversationId, dish, pairing, message, answer }) => withTransaction(async (db) => {
  let conv;
  if (conversationId) {
    conv = await getConversation(userId, conversationId, db);
    if (!conv) return null;
  } else {
    const ins = await db.query('INSERT INTO sommelier_conversations (user_id, dish, pairing) VALUES ($1, $2, $3) RETURNING *',
      [userId, dish, JSON.stringify(compactPairing(pairing))]);
    conv = { ...ins.rows[0], messages: [] };
  }
  const reply = await answer({ dish: conv.dish, pairing: conv.pairing, messages: conv.messages, question: message });
  await db.query('INSERT INTO sommelier_messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conv.id, 'user', message]);
  const saved = await db.query(
    'INSERT INTO sommelier_messages (conversation_id, role, content, wine_ids, revised_dish, engine) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [conv.id, 'assistant', reply.reply, JSON.stringify(reply.wineIds), reply.revisedDish, reply.engine]);
  await db.query('UPDATE sommelier_conversations SET updated_at = now() WHERE id = $1', [conv.id]);
  return { conversationId: conv.id, message: rowMessage(saved.rows[0]) };
});
```
(`db.query` avec `uuid` invalide lève une erreur pg → attraper dans la route et renvoyer 404 : valider le format uuid avant, regex `^[0-9a-f-]{36}$`.)

`routes/sommelier.js` :
```js
import { answerQuestion, MAX_MESSAGE_CHARS } from '../sommelier/chat.js';
import { runTurn, listConversations, getConversation, deleteConversation } from '../sommelier/conversations.js';

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

router.post('/sommelier/chat', async (req, res) => {
  const userId = req.user?.userId;
  const { conversationId, dish, pairing } = req.body || {};
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: `Message requis (${MAX_MESSAGE_CHARS} caractères au plus)` });
  if (conversationId && !isUuid(conversationId)) return res.status(404).json({ error: 'Discussion introuvable' });
  if (!conversationId && (!dish || typeof dish !== 'string' || !pairing)) return res.status(400).json({ error: 'dish et pairing requis pour une nouvelle discussion' });
  try {
    const inventory = await loadInventory();
    const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;
    const result = await runTurn({
      userId, conversationId, dish: String(dish || '').trim().slice(0, 500), pairing, message,
      answer: (ctx) => answerQuestion({ ...ctx, inventory, tasteProfile }),
    });
    if (!result) return res.status(404).json({ error: 'Discussion introuvable' });
    res.json(result);
  } catch (error) {
    console.error('Sommelier chat error:', error);
    res.status(502).json({ error: 'Le sommelier n’a pas pu répondre ; réessayez dans un instant.' });
  }
});

router.get('/sommelier/conversations', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    res.json({ conversations: await listConversations(req.user?.userId, limit) });
  } catch (error) { console.error('List conversations error:', error); res.status(500).json({ error: 'Failed to list conversations' }); }
});

router.get('/sommelier/conversations/:id', async (req, res) => {
  try {
    const conv = isUuid(req.params.id) ? await getConversation(req.user?.userId, req.params.id) : null;
    if (!conv) return res.status(404).json({ error: 'Discussion introuvable' });
    res.json(conv);
  } catch (error) { console.error('Get conversation error:', error); res.status(500).json({ error: 'Failed to load conversation' }); }
});

router.delete('/sommelier/conversations/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !(await deleteConversation(req.user?.userId, req.params.id))) return res.status(404).json({ error: 'Discussion introuvable' });
    res.status(204).end();
  } catch (error) { console.error('Delete conversation error:', error); res.status(500).json({ error: 'Failed to delete conversation' }); }
});
```
- [ ] **Step 4:** `cd backend && npm test` (unitaires verts ; API si `TEST_DATABASE_URL`). Si une base de test locale est disponible via Docker (`docker compose up -d db`), lancer `TEST_DATABASE_URL=... npm test` pour exécuter les tests API.
- [ ] **Step 5: Commit** `"Sommelier : routes de discussion et de reprise"`.

### Task 9: Composant `SommelierChat` et intégration dans l'écran Accord

**Files:**
- Modify: `services/storageService.ts` (4 fonctions)
- Create: `components/SommelierChat.tsx`
- Modify: `components/SommelierV2.tsx` (rendu sous les résultats, prop `initialConversationId`, relance sur `revisedDish`)

- [ ] **Step 1: storageService**
```ts
// Discussion avec le sommelier
export interface SommelierChatMessage { id: string; role: 'user' | 'assistant'; content: string; wineIds: string[]; revisedDish: string | null; engine?: string | null; createdAt: string }
export const sommelierChat = async (params: { conversationId?: string; dish?: string; pairing?: any; message: string }): Promise<{ conversationId: string; message: SommelierChatMessage }> => {
  const response = await apiFetch(`${API_URL}/sommelier/chat`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(params) });
  return handleResponse(response);
};
export const listSommelierConversations = async (limit = 5): Promise<{ conversations: { id: string; dish: string; updatedAt: string; messageCount: number; lastMessage: string | null }[] }> => {
  const response = await apiFetch(`${API_URL}/sommelier/conversations?limit=${limit}`, { headers: getHeaders() });
  return handleResponse(response);
};
export const getSommelierConversation = async (id: string): Promise<{ id: string; dish: string; pairing: any; messages: SommelierChatMessage[] }> => {
  const response = await apiFetch(`${API_URL}/sommelier/conversations/${id}`, { headers: getHeaders() });
  return handleResponse(response);
};
export const deleteSommelierConversation = async (id: string): Promise<void> => {
  const response = await apiFetch(`${API_URL}/sommelier/conversations/${id}`, { method: 'DELETE', headers: getHeaders() });
  if (!response.ok) await handleResponse(response);
};
```
- [ ] **Step 2: `SommelierChat.tsx`** — props `{ dish, pairing, inventory, conversationId?, initialMessages?, onOpenBottle(wine), onRevise(dish), onConversationCreated?(id) }`. État : `messages`, `conversationId`, `pending` (texte en attente), `error`. Envoi : ajoute localement le message utilisateur (optimiste), appelle `sommelierChat`, pousse la réponse ; en erreur, retire le message optimiste, le remet dans le champ et affiche l'erreur avec « Réessayer ». Rendu : amorce locale + 3 puces suggérées (`SUGGESTIONS = ['Plutôt un blanc ?', "Pour des invités qui n'aiment pas les tanins ?", 'Lequel ouvrir ce soir, lequel garder ?']`) tant qu'aucun message ; bulles ; sous une réponse, puces des vins cités (`WineLink` + bouton Ouvrir, stock via `inventory`) ; si `revisedDish` → bouton `Relancer l'accord pour « … »` → `onRevise`. Saisie : `<textarea rows=1>` auto, Entrée envoie, Maj+Entrée saut de ligne ; `AiLoading label="Le sommelier réfléchit…"` pendant l'appel ; fil scrollé en bas à chaque message (`ref.scrollIntoView`).
- [ ] **Step 3: `SommelierV2`** — nouvelle prop `initialConversationId?: string` : au montage, `getSommelierConversation(id)` → `setDish(c.dish)`, `setResult({ criteria: { rationale: c.pairing.rationale }, candidates: [], picks: c.pairing.picks, fromCache: null, cave_size: c.pairing.cave_size ?? 0, cave_after_filter: 0 })`, `setChat({ conversationId: c.id, messages: c.messages })`. La ligne « Cave : N vins → … » n'est affichée que si `result.candidates.length > 0`. Sous les résultats : `<SommelierChat key={chatKey} dish={dish} pairing={result} inventory={inventory} conversationId={chat?.conversationId} initialMessages={chat?.messages} onOpenBottle={handleOpenBottle} onRevise={(d) => { setDish(d); setChat(null); handlePairWith(d); }} />` où `handlePairWith(d)` est `handlePair` paramétrée par le plat (refactor : `handlePair(skipCache, dishOverride?)`). `chatKey` change à chaque nouveau résultat (compteur incrémenté dans `handlePair`).
- [ ] **Step 4:** `npm run typecheck && npm run build`.
- [ ] **Step 5: Commit** `"Accord : discussion avec le sommelier sous les résultats"`.

### Task 10: Reprise des discussions depuis la page Sommelier

**Files:**
- Modify: `pages/CockpitSommelier.tsx`

- [ ] **Step 1:** Lire `searchParams.get('discussion')` → passé à `SommelierV2` en `initialConversationId` (et dans la `key` pour forcer le remontage : `key={initialDish + '|' + (discussionId || '')}`).
- [ ] **Step 2:** Carte latérale « ◌ Discussions récentes » : `listSommelierConversations(5)` au montage et après suppression ; chaque ligne = `Link to={/sommelier?discussion=${id}}` (plat en `text-[12.5px]`, date relative en mono : `relativeDay(updatedAt)` — « aujourd'hui », « hier », « il y a N j », sinon date courte `toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })`) + bouton × (`aria-label="Supprimer la discussion"`) avec `useConfirm` puis `deleteSommelierConversation`. Carte masquée si la liste est vide.
- [ ] **Step 3:** `npm run typecheck && npm run build`. Vérification manuelle (backend Docker) : accord → question → réponse avec vins cités → recharger → reprise depuis la carte → suppression.
- [ ] **Step 4: Commit** `"Sommelier : reprise des discussions récentes"`.

### Task 11: Configuration, documentation, vérification finale

**Files:**
- Modify: `.env.example` (après le bloc `VINOFLOW_SOMMELIER_AGENT`), `docker-compose.yml` (env backend), `CLAUDE.md` (ligne `backend/src/sommelier/`)

- [ ] **Step 1:** `.env.example` :
```
# Discussion avec le sommelier après un accord : api (défaut, Messages API) ou
# claude-code (abonnement, via le Claude Code embarqué ; repli api si indisponible).
# SOMMELIER_CHAT_ENGINE=api
```
`docker-compose.yml` : `- SOMMELIER_CHAT_ENGINE=${SOMMELIER_CHAT_ENGINE:-api}`.
`CLAUDE.md` : ajouter à la ligne `backend/src/sommelier/` : « `chat.js` + `conversations.js` — discussion après un accord (prompt sans état : cave compacte + accord + historique, `POST /sommelier/chat`, tables `sommelier_conversations`/`sommelier_messages`, moteur `SOMMELIER_CHAT_ENGINE`). `PICKS_SCHEMA.alternatives` = autres accords argumentés (0-5). »
- [ ] **Step 2:** `npm run typecheck && npm test && npm run build && (cd backend && npm test) && (cd mcp-server && npm test && npm run build)`.
- [ ] **Step 3: Commit** `"Configuration et documentation de la discussion sommelier"`.
