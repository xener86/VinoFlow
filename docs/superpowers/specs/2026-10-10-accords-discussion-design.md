# Accords élargis et discussion avec le sommelier

## Objectif

1. **Plus de 3 accords quand la cave le permet.** Aujourd'hui l'accord renvoie exactement trois vins (Sûr, Personnel, Audacieux) choisis parmi huit candidats scorés. Si d'autres vins de la cave fonctionnent vraiment, ils sont proposés à la suite, les trois perspectives restant en tête.
2. **Poursuivre la discussion avec le sommelier** après un accord : « pourquoi pas le Chablis ? », « plutôt un blanc ? », « finalement c'est du saumon ». La discussion est enregistrée et peut être reprise plus tard.

**Critère de succès** : pour « gigot d'agneau aux herbes », l'écran montre les 3 perspectives puis 2 à 5 autres vins argumentés ; l'utilisateur demande « et pour des invités qui n'aiment pas les tanins ? », obtient une réponse en moins de 10 s qui cite des vins de la cave (cliquables, ouvrables), et retrouve cette discussion le lendemain depuis la page Sommelier.

## Décisions

1. Les accords supplémentaires sont **argumentés par le même appel LLM** (0 à 5 vins, une raison courte chacun), pas une simple liste de candidats scorés.
2. La discussion est **enregistrée en base** (par compte, comme `pairing_feedback`), reprise possible depuis la page Sommelier.
3. Moteur de la discussion : **Messages API par défaut** (rapide, sorties structurées, repli Gemini) ; **Claude Code en option** (`SOMMELIER_CHAT_ENGINE=claude-code`, sur l'abonnement, via le moteur d'enrichissement existant).
4. La discussion **suit toujours un accord** : pas de conversation libre sans plat. Si le plat change en cours de discussion, l'app propose de relancer l'accord (nouvelle discussion).
5. **Sans état côté LLM** : chaque tour reconstruit le prompt (cave en stock compacte + accord + historique). Aucune session de modèle à gérer, même prompt pour les deux moteurs.

## Hors périmètre

Discussion sans accord préalable ; outils d'appel de la cave pendant la discussion (la cave est injectée en entier, 175 vins ≈ 8 k tokens) ; streaming des réponses ; dictée vocale dans la discussion ; outil MCP de discussion (Claude Desktop est déjà une conversation) ; partage des discussions entre comptes.

## 1. Autres accords

### Schéma et prompts

- `PICKS_SCHEMA` (`sommelier/schemas.js`) gagne `alternatives: arr(obj({ wine_id, reason }))`.
- `llm2.js` et `agent.js` demandent, après les trois recommandations, **« les autres candidats qui fonctionneraient vraiment, par ordre de préférence, 0 à 5, avec une raison courte (1 phrase) »**. Un vin déjà retenu dans les trois perspectives n'y figure pas.
- Validation serveur (`validateLlm2Response`, `validatePicks`) : ids présents parmi les candidats (pipeline) ou la cave en stock (agent), dédoublonnage avec les trois choix et entre alternatives, 5 au plus. Toujours un tableau (vide si rien).
- `selfCritic.js` reste sur les trois perspectives.
- `pickInStock` (`pairForDish.js`, passerelle MenuFlow) parcourt les alternatives après les trois choix.
- Les résultats en cache (`pairing_cache` niveau 2) antérieurs n'ont pas `alternatives` : les consommateurs traitent l'absence comme une liste vide.

### Écran Accord (`components/SommelierV2.tsx`)

- Les trois cartes restent en tête, inchangées.
- Dessous, section **« ◌ Autres accords possibles »** (masquée si vide) : une ligne compacte par vin — nom · cuvée, producteur · millésime, raison, stock, actions **Ouvrir** (même confirmation que les cartes) et lien fiche. Pouces haut/bas avec la catégorie `ALTERNATIVE` (colonne `category` texte, sans contrainte).
- Texte de progression « 3 propositions argumentées » → « Propositions argumentées ».

### Ailleurs

- MCP `sommelier_pair` : bloc « Autres accords possibles » après les trois perspectives.
- Outil Menu (`pages/SommelierTools.tsx`) : inchangé (trois perspectives par service).

## 2. Discussion

### Données — migration `013_sommelier_conversations.sql`

```sql
CREATE TABLE IF NOT EXISTS sommelier_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    dish text NOT NULL,
    pairing jsonb NOT NULL,                 -- accord d'origine : picks (dont alternatives), rationale, cave_size
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sommelier_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES sommelier_conversations(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant')),
    content text NOT NULL,
    wine_ids jsonb NOT NULL DEFAULT '[]',   -- vins cités (assistant)
    revised_dish text,                      -- plat reformulé si la discussion l'a changé (assistant)
    engine text,                            -- api | claude-code | gemini (assistant)
    created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sommelier_messages_conv ON sommelier_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sommelier_conversations_user ON sommelier_conversations (user_id, updated_at DESC);
```

Les discussions sont **propres au compte** (`user_id`), comme les retours et le profil de goût ; la cave reste partagée.

### Routes (`routes/sommelier.js`, limitées par `aiLimiter` comme tout `/api/sommelier`)

- `POST /sommelier/chat` `{ conversationId?, dish?, pairing?, message }`
  - Sans `conversationId` : crée la conversation (`dish` et `pairing` requis). `pairing` est ce que le navigateur a reçu de `/sommelier/pair`, réduit côté serveur à `{ picks, rationale, cave_size }`.
  - Avec `conversationId` : vérifie qu'elle appartient au compte (404 sinon).
  - `message` : texte, 1 à 2 000 caractères.
  - Enregistre le message utilisateur, appelle le moteur, enregistre la réponse, met à jour `updated_at`. Réponse `{ conversationId, message: { id, role: 'assistant', content, wineIds, revisedDish, engine, createdAt } }`.
  - En échec du moteur : le message utilisateur n'est pas conservé (transaction), 502 avec message lisible.
- `GET /sommelier/conversations?limit=20` → `{ conversations: [{ id, dish, updatedAt, messageCount, lastMessage }] }` (du compte, les plus récentes d'abord).
- `GET /sommelier/conversations/:id` → `{ id, dish, pairing, messages: [...] }`.
- `DELETE /sommelier/conversations/:id` → 204.

### Moteur — `sommelier/chat.js`

- `buildChatPrompt({ dish, pairing, inventory, tasteProfile, messages, question })` → `{ system, user }`, fonction pure.
  - **Système** : sommelier français chaleureux, vouvoiement (comme le reste de l'interface) ; ne cite **que** des vins de la liste, par leur id dans `wine_ids` ; réponses courtes (3 à 8 phrases), concrètes (température, carafe, ordre de service) ; s'il déduit que le plat a changé, le reformule dans `revised_dish`, sinon `null` ; ne réinvente pas les trois perspectives sauf si on le lui demande.
  - **Utilisateur** : cave en stock, une ligne par vin (`id | producteur nom cuvée millésime | type | région / appellation | N btl | 5 arômes max | statut d'apogée`) ; plat ; accord d'origine (trois perspectives et alternatives avec raisons) ; profil de goût s'il existe ; historique (12 derniers messages, chacun tronqué à 1 500 caractères) ; question.
- `CHAT_REPLY_SCHEMA = obj({ reply: str, wine_ids: arr(str), revised_dish: nullable(str) })`.
- `validateReply(raw, inStock, dish)` : `wine_ids` filtrés sur la cave en stock et dédoublonnés ; `revised_dish` ramené à `null` s'il est vide ou égal au plat (insensible à la casse).
- `chatEngine()` : `SOMMELIER_CHAT_ENGINE` = `api` (défaut) | `claude-code`. `claude-code` n'est retenu que si Claude Code est disponible (même test que l'enrichissement : binaire + `CLAUDE_CODE_OAUTH_TOKEN`), sinon repli `api` avec un avertissement.
- `answer({ engine, system, user })` :
  - `api` : `generateStructured('sommelier-chat', { system, user, schema })`. Nouvelle tâche dans `aiService.TASK_DEFAULTS` : Claude Sonnet, `maxTokens` 3000, `effort` low, repli Gemini Flash. Surchargeable par les variables `VINOFLOW_*_SOMMELIER_CHAT` existantes.
  - `claude-code` : `runClaudeCode(user, { schema, systemPrompt: system, task: 'sommelier-chat' })` du moteur d'enrichissement (WebSearch autorisé par construction). En erreur : repli `api` si une clé est configurée.
- Journal `ai_calls` : tâche `sommelier-chat`, comme les autres.

### Écran

- `components/SommelierChat.tsx` (nouveau) : fil de discussion sous les résultats, dans la carte principale, dans l'esprit de la variante C du prototype (`design-protos/wf-sommelier.jsx`).
  - Amorce du sommelier (locale, sans appel) : « Une question sur ces accords ? Un détail, une humeur, vos invités… » + 3 questions suggérées en puces : « Plutôt un blanc ? », « Pour des invités qui n'aiment pas les tanins ? », « Lequel ouvrir ce soir, lequel garder ? ».
  - Bulles utilisateur à droite, sommelier à gauche avec la pastille « S » ; sous une réponse, les vins cités en puces (nom · millésime, stock) avec lien fiche et **Ouvrir** (même `handleOpenBottle` que les cartes).
  - Si `revisedDish` : bouton « Relancer l'accord pour « … » » → nouvel accord sur ce plat (nouvelle discussion).
  - Saisie : champ texte + Envoyer (Entrée envoie, Maj+Entrée saut de ligne), désactivée pendant la réponse ; état d'attente `AiLoading` ; erreur affichée dans le fil avec « Réessayer ».
  - La conversation est créée au **premier message** (pas de conversation vide).
- `SommelierV2` : rend `SommelierChat` sous les résultats, remonté à chaque nouvel accord (`key`). Prop `initialConversationId` : charge la conversation, restitue le plat, l'accord d'origine (`picks`, dont les alternatives, rendus avec les mêmes cartes) et le fil.
- `pages/CockpitSommelier.tsx` : carte latérale **« ◌ Discussions récentes »** (5 dernières : plat, date relative, suppression discrète avec confirmation) → `/sommelier?discussion=<id>`. Masquée si aucune.
- `services/storageService.ts` : `sommelierChat`, `listSommelierConversations`, `getSommelierConversation`, `deleteSommelierConversation`.

## 3. Configuration et documentation

- `.env.example` et `docker-compose.yml` : `SOMMELIER_CHAT_ENGINE=api` (commenté : `claude-code` pour l'abonnement).
- `CLAUDE.md` : une phrase sur les alternatives et la discussion dans la ligne `backend/src/sommelier/`.

## 4. Tests

- Unitaires backend : `chat.test.js` (prompt : cave compacte, troncature de l'historique, 12 messages max ; `validateReply` ; choix du moteur selon l'environnement et la disponibilité de Claude Code, repli) ; `agent.test.js` et nouveau `llm2.test.js` (alternatives validées, dédoublonnées, plafonnées) ; `pairForDish.test.js` (`pickInStock` tombe sur une alternative).
- API (avec `TEST_DATABASE_URL`) : `sommelier.chat.test.js` avec `chat.js` mocké : création à la volée, ajout à une conversation existante, 404 sur la conversation d'un autre compte, échec moteur = rien d'enregistré, liste, lecture, suppression. `helpers.resetData` tronque les deux nouvelles tables.
- MCP : `sommelier_pair` est un outil historique de `src/index.ts` sans test dédié ; vérification par `npm run build` et le test existant du client.
- Frontend : `npm run typecheck` et `npm run build` ; vérification manuelle dans l'app (accord, discussion, reprise, relance après changement de plat).
