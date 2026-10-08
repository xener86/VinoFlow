# Notifications « à boire avant », newsletter de la cave et passerelle MenuFlow — design

Date : 2026-10-05 · Chantier « Évolutions » (5/5), piste 1 · Branche `claude/notifications-newsletter`

## 1. Objectif

Que la cave « parle » d'elle-même : chaque utilisateur reçoit, sur Gotify et/ou par email,

- une **alerte immédiate** quand un vin change d'état de garde (entrée en apogée, fenêtre qui se referme, apogée dépassée) ;
- une **newsletter** périodique (mensuelle par défaut, hebdomadaire possible) qui résume la cave, avec un « mot du sommelier » rédigé par l'IA quand elle est disponible ;
- grâce à la **passerelle MenuFlow** (§12-13), un vin de la cave conseillé pour chaque dîner planifié, visible dans MenuFlow (web et iPhone) et sur le tableau de bord VinoFlow, et dans la newsletter les rubriques « Vos accords du mois », « Vous auriez pu… » et « D'ailleurs… vous avez oublié de noter ».

### Critères de succès

- Un vin qui change d'état produit une notification Gotify au plus une heure plus tard, une seule fois.
- La newsletter part à l'heure choisie (fuseau `Europe/Paris`), ou au tick suivant si le serveur était arrêté.
- Aucun doublon après un redémarrage ou une seconde exécution du tick.
- Sans clé IA, la newsletter part quand même (sans le mot du sommelier) ; sans Sweego, l'email est signalé indisponible, jamais un faux succès.
- Réglages : chaque canal a un bouton « Tester », la newsletter a un « Aperçu » et un « Envoyer maintenant ».
- MenuFlow connecté : chaque dîner à venir affiche dans MenuFlow un vin **en stock** ; une bouteille ouverte le soir d'un dîner y apparaît après le tick suivant ; rien n'est renvoyé si rien n'a changé.
- MenuFlow non configuré : aucune erreur, aucune rubrique MenuFlow, carte « Ce soir » absente.

### Hors périmètre

ntfy, webhook générique, mise à jour du serveur MCP VinoFlow, newsletter commune au foyer, cote de marché des vins, alerte **programmée** de l'accord du soir (l'accord se consulte à la demande), lecture de VinoFlow par MenuFlow (seul VinoFlow appelle l'autre app).

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
| `store.js` | réglages (défauts, validation, lecture/écriture, masquage du jeton), états d'alerte, journal d'envois |
| `format.js` | libellés (vin, état, euros, période) |
| `render.js` | rendu des alertes, de la newsletter et du message de test |

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

0. **Chiffres clés** — 4 tuiles : bouteilles en cave, entrées (+ dépenses), sorties (dont offertes), valeur d'achat.
1. **À ouvrir en priorité** — `DEPASSEE` puis `SE_REFERME` (tri par `monthsLeft`), 10 au maximum : nom, millésime, stock, emplacement, « estimée » si formule naïve.
2. **Entrés en apogée** — vins `PRET` dont `peakStart` = année en cours.
3. **Bilan de la période** — journal : bouteilles `IN`, `OUT` + `GIFT` ; dépenses (`bottles.purchase_price` des achats datés dans la période) ; valeur d'achat de la cave (`computeBudget`).
4. **Dégustations** — `tasting_notes` de la période : vin, date, note.
4 bis. **Rubriques MenuFlow** (§12.5) — si la passerelle est configurée et qu'elles ont du contenu.
5. **Le mot du sommelier** — si `newsletter_ai` et IA disponible ; reçoit aussi les accords du mois pour pouvoir y faire allusion.
6. Lien vers l'app (`APP_URL`), liens de fiches `APP_URL/wine/:id`.

- Email : gabarit Cockpit dédié (§11), objet « VinoFlow — votre cave, octobre 2026 » (ou « semaine du … »).
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

## 11. Gabarit Cockpit de la newsletter

Référence visuelle validée : `docs/superpowers/specs/newsletter-exemple.html` (données de démonstration).

- HTML compatible email : tableaux, styles en ligne, largeur 600 px, `@media (max-width: 620px)` pour empiler les tuiles et masquer la colonne emplacement ; pré-en-tête caché.
- Identité Cockpit : fond crème `#fcfaf6`, cartes blanches bordées `#e7e5e4`, bordeaux `#7f1d1d`, crème `#f5f0e6`/`#ebe2cf` pour le mot du sommelier ; polices Playfair Display (titres, noms de vins en italique), Outfit (texte), JetBrains Mono (étiquettes en capitales « ◌ … »), avec repli Georgia / Helvetica / Courier (Gmail retire les polices web).
- En-tête *VinoFlow* + « CELLAR.OS » ; titre « Que boire *ce mois-ci* ? » (« *cette semaine* » en hebdo) ; badges de fenêtre : « PASSÉ » (bordeaux), « N MOIS » (ambre) si `monthsLeft ≤ 6`, « FIN AAAA » (gris) sinon ; « estimée » en italique ; mot du sommelier en carte crème avec la mention « rédigé par l'IA » ; bouton « Ouvrir la cave → » ; pied : citation de Pasteur et « Fréquence et canaux : Réglages › Notifications ».
- Implémentation : `render.js` expose `renderNewsletterEmail(nl)` (gabarit dédié) ; les emails d'alerte et de test réutilisent le même en-tête et le même pied (`cockpitShell({ preheader, body })`). Tout texte venu de la base est échappé.

## 12. Passerelle MenuFlow — côté VinoFlow

### 12.1 Décisions

| Sujet | Décision |
|---|---|
| Sens | **VinoFlow appelle MenuFlow**, jamais l'inverse : lecture des dîners, écriture du vin de chaque dîner |
| Secret | `MENUFLOW_URL` + `MENUFLOW_TOKEN` (jeton MenuFlow rôle `write`) dans `backend/.env`, au niveau du foyer |
| Rattachement bouteille ↔ dîner | Automatique par date (sortie `OUT` le jour d'un dîner) et confirmable : case « Pour le dîner : … » cochée par défaut à l'ouverture d'une bouteille |
| Accord du soir | À la demande : carte « Ce soir » (tableau de bord) et affichage dans MenuFlow ; pas de notification programmée |
| Affichage MenuFlow | Backend + web + iPhone (§13) |

### 12.2 Client — `backend/src/menuflow/client.js`

- `isMenuflowConfigured()`, `getWeeks(limit)`, `getWeek(startDate)`, `getDinnerByDate(day)` (avec verdicts), `putDinnerWine(day, payload)`, `deleteDinnerWine(day)`.
- Base `${MENUFLOW_URL}/api/v1`, `Authorization: Bearer ${MENUFLOW_TOKEN}`, délai 10 s, erreurs lisibles (« MenuFlow injoignable », « jeton MenuFlow refusé (401/403) »).

### 12.3 Données — migration `db/migrations/010_menuflow.sql`

```sql
CREATE TABLE IF NOT EXISTS dinner_pairings (
  dinner_date date PRIMARY KEY,
  menuflow_dinner_id integer,
  dish_title text NOT NULL,
  verdicts jsonb NOT NULL DEFAULT '[]',
  suggested_wine_id uuid REFERENCES wines(id) ON DELETE SET NULL,
  suggestion_reason text,
  suggested_for_title text,
  suggested_at timestamptz,
  pushed_hash text,
  pushed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE journal ADD COLUMN IF NOT EXISTS for_dinner boolean;
```

- `for_dinner` : `null` = automatique (rattachée au dîner du même jour), `true` = confirmé, `false` = décoché.
- Date d'une sortie : `journal.date` (horodatage local du serveur) ramené au jour dans `NOTIFY_TZ`.

### 12.4 Synchronisation (dans le tick des notifications, même verrou)

1. **Lecture** : dîners de J−35 à J+7 (semaines couvrant la plage), upsert dans `dinner_pairings` (titre, id MenuFlow, verdicts `[{ author, rating }]`).
2. **Conseil** : pour chaque dîner d'aujourd'hui ou à venir dont `suggested_wine_id` est nul, ou `suggested_for_title ≠ dish_title`, ou dont le vin conseillé n'a plus de stock → `pairForDish({ dish: dish_title })` ; on garde la première proposition **en stock**. Au plus 7 conseils par tick. Sans IA : aucun conseil, le reste continue.
3. **Envoi** : pour chaque date de la plage, contenu = `{ dishTitle, suggested: { wine, vintage, reason, location, url } | null, opened: [{ wine, vintage, url }] }` ; `opened` = sorties du journal ce jour-là avec `for_dinner IS NOT false`. Empreinte SHA-256 du contenu ; `PUT` seulement si elle diffère de `pushed_hash` (et contenu non vide) ; sinon rien.
4. Erreurs MenuFlow : consignées (`console.error` + état exposé par `/menuflow/status`), jamais propagées hors du tick ; on réessaie au tick suivant.

### 12.5 Rubriques de la newsletter (sur la période couverte, sans appel IA)

- **Vos accords du mois** — dîners avec au moins une sortie rattachée : `JJ/MM · Plat × Vin Millésime`, verdict MenuFlow (« top », « très bon », « bon », « moyen », « à ne pas refaire ») et note de dégustation du vin à cette date s'il y en a ; 8 au plus, du plus récent au plus ancien.
- **Vous auriez pu…** — dîners passés sans sortie rattachée mais avec un vin conseillé : « Le JJ/MM, avec *plat* : *vin* — raison » ; priorité aux vins encore en stock puis les plus urgents ; 3 au plus.
- **D'ailleurs…** — sorties rattachées à un dîner sans `tasting_notes` pour ce vin à partir de cette date : « vous n'avez pas noté le *vin* du JJ/MM (*plat*) », lien `APP_URL/tasting/:wineId` ; 3 au plus.
- Gotify : une ligne « N accords ce mois-ci · M dégustations à noter ».

### 12.6 Service d'accord — `backend/src/sommelier/pairForDish.js`

Extraction de la logique de `POST /sommelier/pair` (agent à outils si `VINOFLOW_SOMMELIER_AGENT` et Claude configuré, sinon pipeline) en `pairForDish({ dish, context, userId, skipCache, exclude = [] })` renvoyant la même réponse que la route ; la route devient un appel à ce service (comportement inchangé). `exclude` retire des vins de l'inventaire candidat (« Une autre idée »).

### 12.7 API — `backend/src/routes/menuflow.js`

| Route | Comportement |
|---|---|
| `GET /menuflow/status` | `{ configured, lastSyncAt, lastError }` |
| `GET /menuflow/tonight` | `{ configured, dinner: { date, title, verdicts } \| null, suggested: { wine, reason, location } \| null, opened: [...] }` |
| `POST /menuflow/tonight/resuggest` | Nouveau conseil excluant le précédent, enregistré puis poussé ; limiteur IA |

`POST /history` accepte `forDinner` (booléen) → `journal.for_dinner`.

### 12.8 Interface VinoFlow

- **Carte « Ce soir »** (`components/cockpit/TonightCard.tsx`, tableau de bord) si MenuFlow est configuré et qu'un dîner existe : plat en serif italique, vin conseillé + raison + emplacement, boutons « Ouvrir cette bouteille » et « Une autre idée » ; « Ouvert ce soir : … » le cas échéant.
- **« Pour le dîner »** : la confirmation d'ouverture (fiche vin, plan de cave, sommelier) affiche, si un dîner existe aujourd'hui, une case cochée par défaut « Pour le dîner : *plat* » ; décochée → `forDinner: false`. `consumeSpecificBottle` reçoit un paramètre `forDinner?: boolean`.
- **Réglages** : ligne d'état « MenuFlow : connecté / non configuré », dernier envoi, dernière erreur.

### 12.9 Tests

- Unitaires : rubriques §12.5 (automatique / décoché, limites, vin sorti du stock), empreinte, plat changé → nouveau conseil, `exclude`.
- API (MenuFlow simulé par `fetch` bouchonné) : synchro lit → conseille → pousse, second tick sans `PUT` ; vin conseillé épuisé → nouveau conseil ; `tonight`, `resuggest` ; `forDinner` dans `/history` ; non-régression de `/sommelier/pair`.

## 13. Passerelle MenuFlow — côté MenuFlow (dépôt `~/Claude/MenuFlow`, branche et PR dédiées)

- **Alembic `0008_dinner_wine`** : table `dinner_wine` (`date` clé primaire, `dish_title`, `suggested` JSON nullable, `opened` JSON liste, `updated_at`), **indépendante de `dinner.id`** (survit aux republications, cf. D4).
- **API** `/api/v1` : `PUT /dinners/by-date/{day}/wine` et `DELETE …/wine` (`require_writer`, 403 pour un jeton read) ; `DinnerOut` / `DinnerDetailOut` gagnent `wine: DinnerWineOut | None` (jointure par date) ; le conseil est masqué si `dish_title` diffère du plat servi ce jour-là (les bouteilles ouvertes restent).
- **Docs** : `docs/MCP.md` (champ `wine` dans `get_week`), `docs/DECISIONS.md` (nouvelle décision : vin du dîner stocké par date, poussé par VinoFlow), `CLAUDE.md`.
- **Web** : `npm run gen:api` ; carte « Le vin » dans `DinnerView` (conseil, raison, emplacement, lien « Voir dans VinoFlow » ; « Ouvert ce soir : … »), absente sans vin.
- **iPhone** : `wine` optionnel dans le modèle `Dinner` (compatibilité ascendante), même carte dans `DinnerDetailView` (donc Ce soir et fiche du dîner), style `Theme.swift` ; version 0.6.0 (build 6). Publication ad hoc et déploiement : décision de Xavier.
- **Tests** : pytest (droits, présence dans la semaine et Ce soir, survie à une republication, masquage si plat changé), test web de la carte, test iOS de décodage avec et sans `wine`.

## 14. Configuration et déploiement (compléments)

- VinoFlow : `MENUFLOW_URL`, `MENUFLOW_TOKEN` (compose + `.env.example`) ; migration 010 au démarrage.
- MenuFlow : migration Alembic au démarrage ; créer le jeton : `docker compose exec menuflow python -m menuflow.cli create-token --name vinoflow --role write` sur le NAS.
- Ordre de mise en prod : MenuFlow d'abord (la route doit exister), puis VinoFlow. Fusion et déploiement des deux uniquement avec accord explicite.
