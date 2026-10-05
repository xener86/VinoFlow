# Notifications « à boire avant » et newsletter de la cave — design

Date : 2026-10-05 · Chantier « Évolutions » (5/5), piste 1 · Branche `claude/notifications-newsletter`

## 1. Objectif

Que la cave « parle » d'elle-même : chaque utilisateur reçoit, sur Gotify et/ou par email,

- une **alerte immédiate** quand un vin change d'état de garde (entrée en apogée, fenêtre qui se referme, apogée dépassée) ;
- une **newsletter** périodique (mensuelle par défaut, hebdomadaire possible) qui résume la cave, avec un « mot du sommelier » rédigé par l'IA quand elle est disponible.

### Critères de succès

- Un vin qui change d'état produit une notification Gotify au plus une heure plus tard, une seule fois.
- La newsletter part à l'heure choisie (fuseau `Europe/Paris`), ou au tick suivant si le serveur était arrêté.
- Aucun doublon après un redémarrage ou une seconde exécution du tick.
- Sans clé IA, la newsletter part quand même (sans le mot du sommelier) ; sans Sweego, l'email est signalé indisponible, jamais un faux succès.
- Réglages : chaque canal a un bouton « Tester », la newsletter a un « Aperçu » et un « Envoyer maintenant ».

### Hors périmètre

ntfy, webhook générique, mise à jour du serveur MCP, widget Dashboard, newsletter commune au foyer, cote de marché des vins.

## 2. Décisions de cadrage

| Sujet | Décision |
|---|---|
| Canaux | Gotify (URL + jeton d'application par utilisateur) et email Sweego (adresse du compte) |
| Portée | Réglages **par compte** ; la cave reste commune (modèle foyer) |
| Rythme | Alertes immédiates **et** newsletter périodique |
| Déclencheurs | Entrée en apogée, fenêtre qui se referme (horizon N mois, 12 par défaut), apogée dépassée — chacun activable |
| Newsletter | Socle déterministe + « mot du sommelier » IA optionnel, avec repli sans IA |
| Architecture | Planificateur intégré au backend (tick horaire, verrou consultatif Postgres), comme `enrichment/scheduler.js` |

Les apogées sont stockées en **années** : une transition survient au changement d'année, à la modification d'une apogée (utilisateur, enrichissement, IA) ou à un réassort. « Immédiat » signifie « au tick suivant ».

## 3. Données — migration `db/migrations/009_notifications.sql`

Idempotente, sans `BEGIN`/`COMMIT`.

```sql
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  gotify_enabled boolean NOT NULL DEFAULT false,
  gotify_url text,
  gotify_token text,
  alerts_enabled boolean NOT NULL DEFAULT true,
  alert_ready boolean NOT NULL DEFAULT true,
  alert_closing boolean NOT NULL DEFAULT true,
  alert_past boolean NOT NULL DEFAULT true,
  horizon_months smallint NOT NULL DEFAULT 12 CHECK (horizon_months BETWEEN 1 AND 60),
  newsletter_frequency text NOT NULL DEFAULT 'monthly' CHECK (newsletter_frequency IN ('off','weekly','monthly')),
  newsletter_weekday smallint NOT NULL DEFAULT 1 CHECK (newsletter_weekday BETWEEN 1 AND 7), -- ISO, 1 = lundi
  newsletter_hour smallint NOT NULL DEFAULT 9 CHECK (newsletter_hour BETWEEN 0 AND 23),
  newsletter_ai boolean NOT NULL DEFAULT true,
  last_newsletter_at timestamptz,
  alerts_seeded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wine_alert_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('GARDE','PRET','SE_REFERME','DEPASSEE')),
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, wine_id)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('alert','newsletter','test')),
  channel text NOT NULL CHECK (channel IN ('gotify','email')),
  ok boolean NOT NULL,
  error text,
  summary text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_log_user_sent_idx ON notification_log (user_id, sent_at DESC);
```

- Le mensuel part le **1er du mois** à `newsletter_hour` ; l'hebdo le jour `newsletter_weekday` à `newsletter_hour`.
- `alerts_seeded_at` marque le premier passage silencieux (voir §4.2).
- Le jeton Gotify est stocké en clair (jeton d'émission seulement) et **jamais renvoyé** par l'API.

## 4. Détection des transitions

### 4.1 Classification — `backend/src/notifications/classify.js` (pure)

`classifyWine(wine, { horizonMonths, now })` → `{ state, peakStart, peakEnd, estimated }` ou `null` (pas de millésime ni d'apogée).

- Fenêtre : `peak_start`/`peak_end` enregistrés ; sinon formule naïve de `sommelier/peakWindow.js` avec `estimated: true`.
- `monthsLeft` = mois entre `now` et le **31/12 de `peakEnd`** (fin de journée, fuseau `NOTIFY_TZ`).
- États, du moins au plus urgent (rang 0 → 3) :
  - `DEPASSEE` : `now` après le 31/12 de `peakEnd` ;
  - `SE_REFERME` : `monthsLeft ≤ horizonMonths` ;
  - `PRET` : `now` ≥ 1/1 de `peakStart` ;
  - `GARDE` : sinon.
- Seuls les vins avec un stock > 0 sont classés.

### 4.2 Transitions — `detectTransitions(storedStates, wines, settings, now)` (pure)

Renvoie `{ notify: [{ wine, from, to }], upserts: [{ wineId, state }], deletes: [wineId] }`.

- **Premier passage** (`alerts_seeded_at` nul) : tous les états courants vont dans `upserts`, `notify` est vide ; l'appelant renseigne `alerts_seeded_at`.
- Rang qui **monte** et déclencheur activé (`PRET` → `alert_ready`, `SE_REFERME` → `alert_closing`, `DEPASSEE` → `alert_past`) → `notify` + `upserts`.
- Rang qui monte mais déclencheur désactivé → `upserts` seulement.
- Rang qui **descend** (apogée repoussée) → `upserts` silencieux.
- Vin connu sans stock ou disparu → `deletes`. Vin nouveau en stock (après le premier passage) sans état stocké → traité comme venant de `GARDE`.
- `alerts_enabled = false` → rien n'est notifié, mais les états restent à jour (`upserts`/`deletes`) pour éviter une rafale à la réactivation.

### 4.3 Correctifs inclus

- `sommelier/proactive.js` : `anticipationForEvent` appelle `getPeakWindow(w)` ; `drinkBeforeAlerts` s'appuie sur `classifyWine` (filtre corrigé : `SE_REFERME` et `DEPASSEE`).
- `utils/exportCsv.ts` : `getPeakWindow(w)` reçoit le vin entier (la surcharge `WineLike` existe déjà dans `utils/peakWindow.ts`).

## 5. Moteur — `backend/src/notifications/`

| Fichier | Rôle |
|---|---|
| `classify.js` | §4 (pur) |
| `schedule.js` | `isNewsletterDue(settings, now, tz)` et `periodStart(settings, now, tz)` (purs) |
| `channels.js` | `sendGotify({ url, token, title, markdown, priority })`, `sendEmail({ to, subject, html, text })`, `availableChannels(settings, { mailConfigured })` |
| `newsletter.js` | `collectNewsletterData(db, period)`, `buildNewsletter(data, aiSection)` (pur), `renderNewsletterEmail`, `renderNewsletterGotify`, `renderAlert` |
| `sommelierNote.js` | appel IA `newsletter` + validation |
| `scheduler.js` | tick, verrou, orchestration par utilisateur, `notification_log` |
| `settings.js` | lecture/écriture/valeurs par défaut des réglages, masquage du jeton |

### 5.1 Planificateur

- `startNotificationScheduler()` appelé dans `server.js` à côté de `startScheduler()`, sauf si `NOTIFICATIONS_ENABLED=false`.
- Tick toutes les `NOTIFY_TICK_MINUTES` (60 par défaut) et une première fois 1 minute après le démarrage ; verrou `pg_try_advisory_lock` (clé distincte de l'enrichissement) ; un seul tick à la fois.
- Inventaire chargé une fois par tick (`services/inventory.js`), puis pour chaque ligne de `notification_settings` (try/catch par utilisateur) : alertes, puis newsletter si due.

### 5.2 Fiabilité

- Canaux disponibles = Gotify si activé avec URL et jeton ; email si activé **et** `isMailConfigured()`.
- **Alertes** : si `notify` est non vide, un seul message groupé par canal. Les `upserts`/`deletes` ne sont écrits que si au moins un canal a réussi (ou si `notify` est vide) ; sinon on réessaie au tick suivant.
- **Newsletter** : `last_newsletter_at = now` seulement si au moins un canal a réussi.
- Aucun canal disponible : états mis à jour en silence, newsletter non marquée comme envoyée.
- Chaque tentative → une ligne `notification_log` (kind, channel, ok, error, summary). Purge des lignes de plus de 180 jours à chaque tick.

### 5.3 Planning de la newsletter

- Échéance courante = dernière occurrence passée de « 1er du mois à H » (mensuel) ou « jour J à H » (hebdo), calculée dans `NOTIFY_TZ` (défaut `Europe/Paris`).
- Due si `frequency ≠ off` et (`last_newsletter_at` nul **ou** `last_newsletter_at < échéance`). Le rattrapage après coupure est implicite.
- Période couverte : de `max(last_newsletter_at, échéance − 1 mois|1 semaine)` à `now`.

### 5.4 Contenu de la newsletter

1. **À ouvrir en priorité** — `DEPASSEE` puis `SE_REFERME` (tri par `monthsLeft`), 10 au maximum : nom, millésime, stock, emplacement, « estimée » si formule naïve.
2. **Entrés en apogée** — vins `PRET` dont `peakStart` = année en cours.
3. **Bilan de la période** — journal : bouteilles `IN`, `OUT` + `GIFT` ; dépenses (`bottles.purchase_price` des achats datés dans la période) ; valeur d'achat de la cave (`computeBudget`).
4. **Dégustations** — `tasting_notes` de la période : vin, date, note.
5. **Le mot du sommelier** — si `newsletter_ai` et IA disponible.
6. Lien vers l'app (`APP_URL`), liens de fiches `APP_URL/wine/:id`.

- Email : HTML via `renderMailHtml` (étendu si besoin pour des listes), objet « VinoFlow — votre cave en octobre 2026 » (ou « semaine du … »).
- Gotify : markdown court — chiffres clés, 5 premiers vins à ouvrir, mot du sommelier tronqué à ~600 caractères, lien ; priorité 4.
- Alerte immédiate : titre « N vin(s) change(nt) d'état », corps groupé par transition (« Entrés en apogée », « Fenêtre qui se referme », « Apogée dépassée ») ; priorité Gotify 5 si au moins une `DEPASSEE`, sinon 4.

### 5.5 Mot du sommelier — tâche IA `newsletter`

- Nouvelle entrée dans les tâches de `services/aiService.js` : Claude Sonnet, `maxTokens` ≈ 1500, effort `low`, surchargée par variables d'environnement comme les autres.
- Schéma (dans `sommelier/schemas.js`, `additionalProperties: false`, tous champs requis, optionnel = nullable) :
  `{ intro: string, picks: [{ wineId: string, reason: string }], seasonalPairing: string|null, closing: string|null }`.
- Entrée : mois et saison, liste compacte des vins en stock (id, nom, millésime, type, région, état, apogée, stock), au plus 80 vins priorisés par urgence.
- Validation : `picks` limité à 3, `wineId` absents de la liste écartés.
- Sans clé, en erreur ou délai dépassé (30 s) : section absente, envoi maintenu. Coût journalisé dans `ai_calls` par le socle existant.

## 6. API — `backend/src/routes/notifications.js` (monté sur `/api`, authentifié)

| Route | Comportement |
|---|---|
| `GET /notifications/settings` | Réglages (ou défauts), `gotifyTokenSet`, `email` du compte, `mailConfigured`, `aiConfigured`, 5 derniers `notification_log` |
| `PUT /notifications/settings` | Mise à jour partielle validée (URL `http(s)`, heure 0-23, jour 1-7, horizon 1-60, fréquence) ; `gotifyToken` : chaîne vide = inchangé, `null` = effacé ; 400 sur valeur invalide |
| `POST /notifications/test` | `{ channel }` → envoie un message de test, renvoie `{ ok, error }` et journalise |
| `GET /notifications/newsletter/preview` | `{ html, markdown, subject }` de la période courante, sans envoi ; IA seulement avec `?ai=1` |
| `POST /notifications/newsletter/send-now` | Envoie immédiatement sur les canaux disponibles, sans modifier `last_newsletter_at` |

`test`, `preview?ai=1` et `send-now` passent par un limiteur dédié (10 requêtes / 15 min / utilisateur) dans `middleware/rateLimits.js`.

## 7. Front

- `services/storageService.ts` : `getNotificationSettings`, `saveNotificationSettings`, `sendTestNotification`, `previewNewsletter`, `sendNewsletterNow` ; types dans `types.ts`.
- `pages/Settings.tsx` : nouvelle carte **Notifications** (composant dédié `components/cockpit/NotificationSettings.tsx` pour ne pas alourdir la page), primitives Cockpit, textes en français, pas de classes `dark:`.
  - **Canaux** : Email (adresse du compte ; désactivé avec mention si `mailConfigured` est faux) ; Gotify (URL, jeton en champ mot de passe, « jeton enregistré » si présent) ; « Tester » par canal.
  - **Alertes immédiates** : interrupteur, trois cases, horizon (mois).
  - **Newsletter** : fréquence, jour (hebdo), heure, « Mot du sommelier (IA) » (note si IA non configurée), « Aperçu » (modale, `iframe srcdoc` avec `sandbox`), « Envoyer maintenant ».
  - **Derniers envois** : liste compacte avec statut.

## 8. Erreurs

- Gotify : délai 10 s (`AbortController`), messages lisibles (« jeton refusé (401) », « serveur injoignable »).
- Email : jamais de faux succès sans Sweego.
- Tick : erreurs isolées par utilisateur, jamais propagées hors du planificateur.
- `NOTIFICATIONS_ENABLED=false` coupe le planificateur (les routes restent disponibles).

## 9. Tests

- **Unitaires** `backend/tests/unit/notifications.test.js` : `classifyWine` (4 états, frontière du 31/12, naïve « estimée », stock 0) ; `detectTransitions` (premier passage, montée, descente, déclencheur off, `alerts_enabled` off, vin nouveau, suppression) ; `isNewsletterDue` / `periodStart` (hebdo, mensuel, rattrapage, fuseau) ; `buildNewsletter` et rendus ; filtrage des `picks` ; `sendGotify` avec `fetch` simulé.
- **Non-régression** : `proactive.test.js`, `peakWindow.test.js` — apogées enregistrées respectées.
- **API** `backend/tests/api/notifications.test.js` (si `TEST_DATABASE_URL`) : réglages (jeton masqué, validation, défauts) ; tick complet avec Gotify simulé — second tick sans doublon ; échec Gotify → état non écrit puis réessai ; migration idempotente.
- **Front** : `npm run typecheck`, `npm test`, `npm run build` ; vérification visuelle de la carte dans le navigateur intégré.

## 10. Configuration et déploiement

Nouvelles variables : `NOTIFY_TZ` (`Europe/Paris`), `NOTIFY_TICK_MINUTES` (60), `NOTIFICATIONS_ENABLED` (true), surcharges de la tâche IA `newsletter`.

En prod (NAS) : migration 009 appliquée au démarrage ; email opérationnel après ajout de `SWEEGO_API_KEY` et `MAIL_FROM` dans `backend/.env` ; mot du sommelier après `ANTHROPIC_API_KEY`. Fusion et déploiement uniquement avec accord explicite.
