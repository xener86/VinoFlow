# Notifications « à boire avant », newsletter et passerelle MenuFlow — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque utilisateur reçoit sur Gotify et/ou par email des alertes quand un vin change d'état de garde et une newsletter périodique au style Cockpit (avec un « mot du sommelier » IA optionnel) ; VinoFlow conseille un vin de la cave pour chaque dîner MenuFlow, l'affiche dans MenuFlow (web, iPhone) et sur son tableau de bord, et en tire les rubriques « Vos accords », « Vous auriez pu… » et « D'ailleurs… » de la newsletter.

**Architecture:** Nouveau dossier `backend/src/notifications/` : fonctions pures (classification, planning, rendu) + accès base (`store.js`) + planificateur horaire intégré au backend sous verrou consultatif Postgres. Nouveau routeur `/api/notifications/*`, nouvelle carte Réglages côté front. Migration `009_notifications.sql`. Partie B : côté MenuFlow (autre dépôt) — table `dinner_wine` par date, route d'écriture, carte « Le vin » web + iPhone. Partie C : côté VinoFlow — `backend/src/menuflow/` (client, synchronisation dans le tick, rubriques de newsletter), `pairForDish`, routes `/api/menuflow/*`, carte « Ce soir ». Migration `010_menuflow.sql`.

**Tech Stack:** VinoFlow : Node 22 ESM + Express 4 + pg, Vitest 5 (+ supertest), React 19 + Vite + Tailwind, Gotify REST (`POST /message`), Sweego via `mailService.js`, Claude via `aiService.js`. MenuFlow : Python (uv) + FastAPI + SQLModel + Alembic (SQLite), pytest, web Vite/React/TypeScript (vitest), iOS SwiftUI (xcodegen, XCTest).

**Spec:** `docs/superpowers/specs/2026-10-05-notifications-newsletter-design.md`

## Global Constraints

- Commits, messages d'erreur, textes UI et notifications en **français** ; chaque commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pas de classes Tailwind `dark:`.
- Migration nouvelle = fichier numéroté idempotent **sans** `BEGIN`/`COMMIT`.
- Cave commune au foyer : **aucun** filtrage par utilisateur sur les tables de cave ; seules les tables de notifications sont par `user_id`.
- Fuseau : `NOTIFY_TZ` (défaut `Europe/Paris`) ; tick : `NOTIFY_TICK_MINUTES` (défaut 60) ; interrupteur : `NOTIFICATIONS_ENABLED` (défaut vrai, `false` coupe le planificateur).
- Schémas de sortie IA : chaque objet `additionalProperties: false`, tous les champs requis, optionnel = nullable.
- Le jeton Gotify n'est **jamais** renvoyé par l'API.
- Gotify : délai 10 s ; IA : délai 30 s ; purge de `notification_log` au-delà de 180 jours ; limiteur dédié 10 requêtes / 15 min / utilisateur.
- Branches : VinoFlow `claude/notifications-newsletter` (ce worktree), MenuFlow `claude/vin-du-diner` (dans `~/Claude/MenuFlow`) ; ni fusion ni déploiement NAS (ni publication iOS) sans accord explicite. Mise en prod : MenuFlow avant VinoFlow.
- Passerelle : seul VinoFlow appelle MenuFlow ; `MENUFLOW_URL` + `MENUFLOW_TOKEN` (jeton `write`) ; absente = aucune erreur, aucune rubrique, pas de carte « Ce soir ». Accord du soir **à la demande** uniquement (pas de notification programmée).
- MenuFlow : conventions de son `CLAUDE.md`/`AGENTS.md` (français à l'écran, identifiants en anglais, `ruff`), décision D44 dans `docs/DECISIONS.md`.
- Email : gabarit Cockpit fidèle à `docs/superpowers/specs/newsletter-exemple.html` (spec §11).
- Commandes : `cd backend && npx vitest run <fichier>` (unitaires) ; tests d'API seulement avec `TEST_DATABASE_URL` (base **vidée**) ; front : `npm run typecheck`, `npm test`, `npm run build`.

## Review Focus

1. **Nom de vin contenant du HTML/markdown** (`<b>`, `[x](y)`) : l'email doit l'échapper, jamais l'interpréter. → test dans la tâche 5.
6. **Republication MenuFlow qui change le plat d'un jour** : le vin conseillé pour l'ancien plat ne doit jamais s'afficher à côté du nouveau, et VinoFlow doit en proposer un autre. → tests dans les tâches 10 et 14.
7. **MenuFlow injoignable ou jeton révoqué** : aucune exception hors du tick, erreur visible dans Réglages. → tests dans les tâches 14 et 16.
2. **Cave vide ou sans aucun vin daté** : la newsletter part quand même avec un bilan à zéro, sans planter. → test dans la tâche 6.
3. **Changement d'heure (dimanche 25 octobre 2026)** : la newsletter hebdo du dimanche à 9 h reste due une seule fois. → test dans la tâche 2.
4. **URL Gotify avec sous-chemin et barre finale** (`https://h/gotify/`) : l'appel vise `https://h/gotify/message`. → test dans la tâche 3.
5. **Sauvegarde des réglages sans retaper le jeton** : le jeton existant est conservé, `null` l'efface. → test dans la tâche 7.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `db/migrations/009_notifications.sql` (créé) | Tables `notification_settings`, `wine_alert_state`, `notification_log` |
| `backend/src/notifications/schedule.js` (créé) | Pur : `notifyTz`, `zonedParts`, `currentOccurrence`, `isNewsletterDue`, `periodStart` |
| `backend/src/notifications/classify.js` (créé) | Pur : `STATES`, `rank`, `classifyWine`, `detectTransitions` |
| `backend/src/notifications/format.js` (créé) | Pur : `wineLabel`, `stateLabel`, `euros`, `periodTitle` |
| `backend/src/notifications/channels.js` (créé) | `sendGotify`, `availableChannels`, `deliver` |
| `backend/src/notifications/store.js` (créé) | Réglages (défauts, validation, lecture/écriture, vue publique), états d'alerte, journal |
| `backend/src/notifications/render.js` (créé) | Pur : gabarit Cockpit (`cockpitShell`, `renderNewsletterEmail`, `menuflowBlocks`), `renderAlert`, `renderNewsletter`, `testMessage` |
| `backend/src/notifications/sommelierNote.js` (créé) | `isNoteAvailable`, `buildNoteInput`, `sanitizeNote`, `generateSommelierNote` |
| `backend/src/notifications/newsletter.js` (créé) | `collectNewsletterData` (base), `buildNewsletter` (pur), `composeNewsletter` |
| `backend/src/notifications/scheduler.js` (créé) | `runNotificationTick`, `startNotificationScheduler` |
| `backend/src/routes/notifications.js` (créé) | Routes `/notifications/*` |
| `backend/src/services/aiService.js` (modifié) | Tâche `newsletter` |
| `backend/src/sommelier/schemas.js` (modifié) | `NEWSLETTER_NOTE_SCHEMA` |
| `backend/src/sommelier/proactive.js` (modifié) | `drinkBeforeAlerts` via `classifyWine`, `anticipationForEvent` via `getPeakWindow(w)` |
| `backend/src/middleware/rateLimits.js`, `backend/src/app.js`, `backend/src/server.js` (modifiés) | Limiteur, montage du routeur, démarrage du planificateur |
| `utils/exportCsv.ts` (modifié) | `getPeakWindow(w)` |
| `types.ts`, `services/storageService.ts` (modifiés) | Types et appels API |
| `components/cockpit/NotificationSettings.tsx` (créé), `pages/Settings.tsx` (modifié) | Carte Réglages |
| `.env.example`, `docker-compose.yml`, `CLAUDE.md` (modifiés) | Variables et doc |
| `db/migrations/010_menuflow.sql` (créé) | `dinner_pairings`, `journal.for_dinner` |
| `backend/src/sommelier/pairForDish.js` (créé), `backend/src/routes/sommelier.js` (modifié) | Accord partagé (route, passerelle, « Une autre idée ») |
| `backend/src/menuflow/client.js`, `sync.js`, `newsletterSections.js` (créés) | Client MenuFlow, synchronisation, rubriques de newsletter |
| `backend/src/routes/menuflow.js` (créé), `backend/src/routes/history.js` (modifié) | `/api/menuflow/*`, `forDinner` |
| `components/cockpit/TonightCard.tsx`, `components/cockpit/openBottle.tsx` (créés) ; `pages/CockpitDashboard.tsx`, `pages/CockpitWineDetails.tsx`, `pages/CockpitPlan.tsx` (modifiés) | Carte « Ce soir », case « Pour le dîner » |
| MenuFlow : `backend/menuflow/{models,schemas}.py`, `services/{dinner_wine,serializers}.py`, `api/weeks.py`, `alembic/versions/0008_dinner_wine.py`, `web/src/components/{WineCard,DinnerView}.tsx`, `ios/MenuFlow/{Models/Models.swift,Components/DinnerWineCard.swift,Screens/DinnerDetailView.swift,Components/Components.swift}`, `ios/project.yml`, `docs/{DECISIONS,MCP}.md` | Vin du dîner |
| Tests : `backend/tests/unit/notifications.*.test.js`, `proactive.test.js`, `pairForDish.test.js`, `menuflow.*.test.js`, `backend/tests/api/notifications*.test.js`, `menuflow.*.test.js` ; MenuFlow : `tests/test_dinner_wine.py`, `WineCard.test.tsx`, `DecodingTests.swift` | |

Note : le spec nommait `settings.js` le module d'accès aux réglages ; il devient `store.js` car il porte aussi les états d'alerte et le journal (§5 du spec mis à jour dans la tâche 1).

---

### Task 1: Migration 009

**Files:**
- Create: `db/migrations/009_notifications.sql`
- Modify: `backend/tests/api/migrations.test.js`, `docs/superpowers/specs/2026-10-05-notifications-newsletter-design.md` (§5 : `settings.js` → `store.js`)

**Interfaces:**
- Produces: tables `notification_settings`, `wine_alert_state`, `notification_log` (colonnes du spec §3).

- [ ] **Step 1: Write the failing test** — ajouter dans `backend/tests/api/migrations.test.js`, dans le `describe` existant :

```js
  it('009 : tables de notifications créées', async () => {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('notification_settings','wine_alert_state','notification_log')
      ORDER BY table_name`);
    expect(rows.map((r) => r.table_name)).toEqual(['notification_log', 'notification_settings', 'wine_alert_state']);
  });
```

(vérifier que `pool` est bien importé en tête de fichier depuis `./helpers.js` ; l'ajouter sinon.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && TEST_DATABASE_URL=postgresql://… npx vitest run tests/api/migrations.test.js`
Expected: FAIL (tableau vide). Sans base de test, le fichier est ignoré : passer à l'étape 3 et vérifier en CI.

- [ ] **Step 3: Write the migration** — `db/migrations/009_notifications.sql` :

```sql
-- Notifications : alertes « à boire avant » et newsletter, réglées par compte.
-- La cave reste commune ; seules les préférences et l'état des alertes sont par utilisateur.

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
  newsletter_frequency text NOT NULL DEFAULT 'monthly' CHECK (newsletter_frequency IN ('off', 'weekly', 'monthly')),
  newsletter_weekday smallint NOT NULL DEFAULT 1 CHECK (newsletter_weekday BETWEEN 1 AND 7),
  newsletter_hour smallint NOT NULL DEFAULT 9 CHECK (newsletter_hour BETWEEN 0 AND 23),
  newsletter_ai boolean NOT NULL DEFAULT true,
  last_newsletter_at timestamptz,
  alerts_seeded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wine_alert_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('GARDE', 'PRET', 'SE_REFERME', 'DEPASSEE')),
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, wine_id)
);

CREATE TABLE IF NOT EXISTS notification_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('alert', 'newsletter', 'test')),
  channel text NOT NULL CHECK (channel IN ('gotify', 'email')),
  ok boolean NOT NULL,
  error text,
  summary text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_user_sent_idx ON notification_log (user_id, sent_at DESC);
```

- [ ] **Step 4: Update the spec** — dans §5 du spec, remplacer la ligne `| \`settings.js\` | lecture/écriture/valeurs par défaut des réglages, masquage du jeton |` par `| \`store.js\` | réglages (défauts, validation, lecture/écriture, masquage du jeton), états d'alerte, journal d'envois |`, et ajouter `| \`format.js\` | libellés (vin, état, euros, période) |` et `| \`render.js\` | rendu des alertes, de la newsletter et du message de test |`.

- [ ] **Step 5: Run test to verify it passes** (avec base de test) — Expected: PASS, et le test « relancé, il n'applique rien » reste vert.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/009_notifications.sql backend/tests/api/migrations.test.js docs/superpowers/specs/2026-10-05-notifications-newsletter-design.md
git commit -m "Notifications (1) : migration 009 (réglages, état des alertes, journal d'envois)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Classification, transitions et planning (pur) + correctifs des apogées

**Files:**
- Create: `backend/src/notifications/schedule.js`, `backend/src/notifications/classify.js`
- Modify: `backend/src/sommelier/proactive.js`, `utils/exportCsv.ts:29`
- Test: `backend/tests/unit/notifications.classify.test.js`, `backend/tests/unit/notifications.schedule.test.js`, `backend/tests/unit/proactive.test.js`

**Interfaces:**
- Consumes: `getPeakWindow(wine)` de `backend/src/sommelier/peakWindow.js` (renvoie `{ status, peakStart, peakEnd }` ou `null`).
- Produces:
  - `notifyTz(): string`
  - `zonedParts(date: Date, tz?: string): { year, month, day, hour, weekday }` (weekday ISO 1-7)
  - `currentOccurrence(settings, now: Date, tz?): string` (clé `YYYY-MM-DDTHH` en heure locale)
  - `isNewsletterDue(settings, now: Date, tz?): boolean`
  - `periodStart(settings, now: Date): Date`
  - `STATES = ['GARDE','PRET','SE_REFERME','DEPASSEE']`, `rank(state): number`
  - `classifyWine(wine, { horizonMonths = 12, now = new Date(), tz } = {}): { state, peakStart, peakEnd, monthsLeft, estimated } | null`
  - `detectTransitions({ stored: Map<wineId,state>, wines, settings, now, tz }): { notify: [{ wine, from, to, state, peakStart, peakEnd, monthsLeft, estimated }], upserts: [{ wineId, state }], deletes: [wineId] }`
  - `settings` est l'objet camelCase de `store.js` : `alertsEnabled, alertReady, alertClosing, alertPast, horizonMonths, newsletterFrequency, newsletterWeekday, newsletterHour, lastNewsletterAt, alertsSeededAt`.
  - `monthsLeft` = mois restants **mois courant inclus** jusqu'au 31/12 de `peakEnd` (décembre de `peakEnd` → 1 ; janvier suivant → 0).

- [ ] **Step 1: Write the failing tests** — `backend/tests/unit/notifications.schedule.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { zonedParts, currentOccurrence, isNewsletterDue, periodStart } from '../../src/notifications/schedule.js';

const TZ = 'Europe/Paris';
const s = (extra = {}) => ({ newsletterFrequency: 'monthly', newsletterWeekday: 1, newsletterHour: 9, lastNewsletterAt: null, ...extra });

describe('zonedParts', () => {
  it('donne l’heure locale de Paris (UTC+2 en été)', () => {
    expect(zonedParts(new Date('2026-10-05T07:30:00Z'), TZ)).toEqual({ year: 2026, month: 10, day: 5, hour: 9, weekday: 1 });
  });
});

describe('currentOccurrence', () => {
  it('mensuel : le 1er du mois courant une fois l’heure passée', () => {
    expect(currentOccurrence(s(), new Date('2026-10-05T10:00:00Z'), TZ)).toBe('2026-10-01T09');
  });
  it('mensuel : le 1er avant l’heure → mois précédent (et janvier → décembre)', () => {
    expect(currentOccurrence(s(), new Date('2026-10-01T05:00:00Z'), TZ)).toBe('2026-09-01T09');
    expect(currentOccurrence(s(), new Date('2027-01-01T05:00:00Z'), TZ)).toBe('2026-12-01T09');
  });
  it('hebdo : dernier jour choisi passé', () => {
    // lundi 5 octobre 2026, 12 h à Paris ; jour choisi = vendredi (5)
    expect(currentOccurrence(s({ newsletterFrequency: 'weekly', newsletterWeekday: 5 }), new Date('2026-10-05T10:00:00Z'), TZ)).toBe('2026-10-02T09');
  });
  it('hebdo : le jour même avant l’heure → semaine précédente', () => {
    expect(currentOccurrence(s({ newsletterFrequency: 'weekly', newsletterWeekday: 1 }), new Date('2026-10-05T05:00:00Z'), TZ)).toBe('2026-09-28T09');
  });
});

describe('isNewsletterDue', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  it('désactivée → jamais', () => {
    expect(isNewsletterDue(s({ newsletterFrequency: 'off' }), now, TZ)).toBe(false);
  });
  it('jamais envoyée → due', () => {
    expect(isNewsletterDue(s(), now, TZ)).toBe(true);
  });
  it('envoyée avant l’échéance → due (rattrapage après coupure)', () => {
    expect(isNewsletterDue(s({ lastNewsletterAt: '2026-09-01T07:05:00Z' }), now, TZ)).toBe(true);
  });
  it('envoyée à l’échéance → plus due', () => {
    expect(isNewsletterDue(s({ lastNewsletterAt: '2026-10-01T07:05:00Z' }), now, TZ)).toBe(false);
  });
  it('changement d’heure (dimanche 25 octobre 2026) : due une seule fois', () => {
    const weekly = s({ newsletterFrequency: 'weekly', newsletterWeekday: 7 });
    const at = new Date('2026-10-25T08:30:00Z'); // 9 h 30 à Paris (UTC+1 après le changement)
    expect(isNewsletterDue(weekly, at, TZ)).toBe(true);
    expect(isNewsletterDue({ ...weekly, lastNewsletterAt: at.toISOString() }, new Date('2026-10-25T10:00:00Z'), TZ)).toBe(false);
  });
});

describe('periodStart', () => {
  const now = new Date('2026-10-05T10:00:00Z');
  it('depuis la dernière newsletter si plus récente que la période', () => {
    expect(periodStart(s({ lastNewsletterAt: '2026-10-01T07:00:00Z' }), now).toISOString()).toBe('2026-10-01T07:00:00.000Z');
  });
  it('au plus 31 jours (mensuel) ou 7 jours (hebdo)', () => {
    expect(periodStart(s(), now).toISOString()).toBe('2026-09-04T10:00:00.000Z');
    expect(periodStart(s({ newsletterFrequency: 'weekly' }), now).toISOString()).toBe('2026-09-28T10:00:00.000Z');
  });
});
```

`backend/tests/unit/notifications.classify.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { classifyWine, detectTransitions, rank } from '../../src/notifications/classify.js';

const TZ = 'Europe/Paris';
const NOW = new Date('2026-10-05T10:00:00Z'); // octobre 2026
const w = (id, extra = {}) => ({ id, name: `Vin ${id}`, vintage: 2018, type: 'RED', inventoryCount: 2, ...extra });
const settings = (extra = {}) => ({
  alertsEnabled: true, alertReady: true, alertClosing: true, alertPast: true,
  horizonMonths: 12, alertsSeededAt: '2026-01-01T00:00:00Z', ...extra,
});

describe('classifyWine', () => {
  const at = (wine, horizonMonths = 12, now = NOW) => classifyWine(wine, { horizonMonths, now, tz: TZ });

  it('GARDE avant le début d’apogée', () => {
    expect(at(w('a', { peakStart: 2028, peakEnd: 2035 }))).toMatchObject({ state: 'GARDE', estimated: false });
  });
  it('PRET une fois l’apogée commencée', () => {
    expect(at(w('a', { peakStart: 2024, peakEnd: 2030 }))).toMatchObject({ state: 'PRET', monthsLeft: 51 });
  });
  it('SE_REFERME dans l’horizon (mois courant inclus)', () => {
    expect(at(w('a', { peakStart: 2020, peakEnd: 2027 }), 15)).toMatchObject({ state: 'SE_REFERME', monthsLeft: 15 });
    expect(at(w('a', { peakStart: 2020, peakEnd: 2027 }), 14).state).toBe('PRET');
  });
  it('frontière du 31/12 : décembre = 1 mois, janvier suivant = DEPASSEE', () => {
    const wine = w('a', { peakStart: 2020, peakEnd: 2026 });
    expect(at(wine, 12, new Date('2026-12-31T20:00:00Z'))).toMatchObject({ state: 'SE_REFERME', monthsLeft: 1 });
    expect(at(wine, 12, new Date('2026-12-31T23:30:00Z'))).toMatchObject({ state: 'DEPASSEE', monthsLeft: 0 }); // 00 h 30 à Paris
  });
  it('formule naïve marquée « estimée » sans apogée enregistrée', () => {
    // RED 2018 → 2023-2028
    expect(at(w('a'))).toMatchObject({ state: 'PRET', peakStart: 2023, peakEnd: 2028, estimated: true });
  });
  it('null sans stock ou sans millésime ni apogée', () => {
    expect(at(w('a', { inventoryCount: 0 }))).toBeNull();
    expect(at(w('a', { vintage: null }))).toBeNull();
  });
});

describe('detectTransitions', () => {
  const run = (stored, wines, extra = {}) =>
    detectTransitions({ stored: new Map(Object.entries(stored)), wines, settings: settings(extra), now: NOW, tz: TZ });
  const pret = w('p', { peakStart: 2024, peakEnd: 2030 });
  const ferme = w('f', { peakStart: 2020, peakEnd: 2026 });
  const passe = w('d', { peakStart: 2015, peakEnd: 2020 });

  it('premier passage : enregistre sans notifier', () => {
    const r = run({}, [pret, ferme], { alertsSeededAt: null });
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'p', state: 'PRET' }, { wineId: 'f', state: 'SE_REFERME' }]);
  });
  it('montée d’état : notifie et enregistre', () => {
    const r = run({ p: 'GARDE', f: 'PRET' }, [pret, ferme]);
    expect(r.notify.map((n) => [n.wine.id, n.from, n.to])).toEqual([['p', 'GARDE', 'PRET'], ['f', 'PRET', 'SE_REFERME']]);
    expect(r.upserts).toHaveLength(2);
  });
  it('état inchangé : rien', () => {
    expect(run({ p: 'PRET' }, [pret])).toEqual({ notify: [], upserts: [], deletes: [] });
  });
  it('descente (apogée repoussée) : enregistrée en silence', () => {
    const r = run({ p: 'DEPASSEE' }, [pret]);
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'p', state: 'PRET' }]);
  });
  it('déclencheur désactivé : enregistrée en silence', () => {
    const r = run({ d: 'SE_REFERME' }, [passe], { alertPast: false });
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'd', state: 'DEPASSEE' }]);
  });
  it('alertes coupées : états suivis, aucune notification', () => {
    const r = run({ p: 'GARDE' }, [pret], { alertsEnabled: false });
    expect(r.notify).toEqual([]);
    expect(r.upserts).toEqual([{ wineId: 'p', state: 'PRET' }]);
  });
  it('vin nouveau après le premier passage : part de GARDE', () => {
    expect(run({}, [pret]).notify.map((n) => n.from)).toEqual(['GARDE']);
  });
  it('vin sans stock ou supprimé : état effacé', () => {
    const r = run({ p: 'PRET', x: 'PRET' }, [{ ...pret, inventoryCount: 0 }]);
    expect(r.deletes.sort()).toEqual(['p', 'x']);
  });
  it('rang croissant', () => {
    expect(['GARDE', 'PRET', 'SE_REFERME', 'DEPASSEE'].map(rank)).toEqual([0, 1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/unit/notifications.schedule.test.js tests/unit/notifications.classify.test.js`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Implement `backend/src/notifications/schedule.js`**

```js
// Planning des newsletters, en heure locale (NOTIFY_TZ, Europe/Paris par défaut).
// Les comparaisons se font sur des clés « YYYY-MM-DDTHH » en heure locale : pas
// de conversion vers UTC, donc pas de piège au changement d'heure.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d, h) => `${y}-${pad(m)}-${pad(d)}T${pad(h)}`;

export const notifyTz = () => process.env.NOTIFY_TZ || 'Europe/Paris';

/** Date → composantes en heure locale du fuseau (weekday ISO : 1 = lundi). */
export const zonedParts = (date, tz = notifyTz()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, weekday: WEEKDAYS[parts.weekday] };
};

const partsKey = (p) => key(p.year, p.month, p.day, p.hour);

/** Dernière échéance passée (clé locale) : le 1er du mois ou le jour choisi, à l'heure choisie. */
export const currentOccurrence = (settings, now, tz = notifyTz()) => {
  const p = zonedParts(now, tz);
  const hour = settings.newsletterHour;
  if (settings.newsletterFrequency === 'monthly') {
    let { year, month } = p;
    if (partsKey(p) < key(year, month, 1, hour)) {
      month -= 1;
      if (month === 0) { month = 12; year -= 1; }
    }
    return key(year, month, 1, hour);
  }
  let back = (p.weekday - settings.newsletterWeekday + 7) % 7;
  if (back === 0 && p.hour < hour) back = 7;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day) - back * DAY_MS);
  return key(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour);
};

export const isNewsletterDue = (settings, now, tz = notifyTz()) => {
  if (settings.newsletterFrequency === 'off') return false;
  if (!settings.lastNewsletterAt) return true;
  return partsKey(zonedParts(new Date(settings.lastNewsletterAt), tz)) < currentOccurrence(settings, now, tz);
};

/** Début de la période couverte : la dernière newsletter, au plus 31 jours (7 en hebdo) en arrière. */
export const periodStart = (settings, now) => {
  const floor = new Date(now.getTime() - (settings.newsletterFrequency === 'weekly' ? 7 : 31) * DAY_MS);
  const last = settings.lastNewsletterAt ? new Date(settings.lastNewsletterAt) : null;
  return last && last > floor ? last : floor;
};
```

- [ ] **Step 4: Implement `backend/src/notifications/classify.js`**

```js
// Classification des vins par état de garde et détection des transitions à
// signaler (fonctions pures). Les apogées sont des années : la fenêtre se
// termine le 31/12 de peakEnd, en heure locale.
import { getPeakWindow } from '../sommelier/peakWindow.js';
import { zonedParts } from './schedule.js';

export const STATES = ['GARDE', 'PRET', 'SE_REFERME', 'DEPASSEE'];
export const rank = (state) => STATES.indexOf(state);

const TRIGGERS = { PRET: 'alertReady', SE_REFERME: 'alertClosing', DEPASSEE: 'alertPast' };

export const classifyWine = (wine, { horizonMonths = 12, now = new Date(), tz } = {}) => {
  if ((wine.inventoryCount ?? 0) <= 0) return null;
  const peak = getPeakWindow(wine);
  if (!peak) return null;
  const estimated = !((wine.peakStart ?? wine.peak_start) && (wine.peakEnd ?? wine.peak_end));
  const { year, month } = zonedParts(now, tz);
  // Mois restants, mois courant inclus, jusqu'au 31/12 de peakEnd.
  const monthsLeft = (peak.peakEnd - year) * 12 + (12 - month) + 1;
  let state = 'GARDE';
  if (year > peak.peakEnd) state = 'DEPASSEE';
  else if (monthsLeft <= horizonMonths) state = 'SE_REFERME';
  else if (year >= peak.peakStart) state = 'PRET';
  return { state, peakStart: peak.peakStart, peakEnd: peak.peakEnd, monthsLeft, estimated };
};

/**
 * Compare l'état courant de chaque vin à l'état déjà connu de l'utilisateur.
 * Premier passage (alertsSeededAt nul) : on enregistre sans notifier.
 */
export const detectTransitions = ({ stored, wines, settings, now, tz }) => {
  const notify = [];
  const upserts = [];
  const deletes = [];
  const seen = new Set();
  const seeding = !settings.alertsSeededAt;
  for (const wine of wines) {
    const c = classifyWine(wine, { horizonMonths: settings.horizonMonths, now, tz });
    if (!c) continue;
    seen.add(wine.id);
    const previous = stored.get(wine.id);
    if (previous === c.state) continue;
    upserts.push({ wineId: wine.id, state: c.state });
    if (seeding || !settings.alertsEnabled) continue;
    const from = previous ?? 'GARDE';
    if (rank(c.state) > rank(from) && settings[TRIGGERS[c.state]]) {
      notify.push({ wine, from, to: c.state, ...c });
    }
  }
  for (const wineId of stored.keys()) if (!seen.has(wineId)) deletes.push(wineId);
  return { notify, upserts, deletes };
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/unit/notifications.schedule.test.js tests/unit/notifications.classify.test.js`
Expected: PASS.

- [ ] **Step 6: Update `proactive.test.js` (failing first)** — remplacer le premier `describe('drinkBeforeAlerts', …)` et ajouter un test à `anticipationForEvent` :

```js
describe('drinkBeforeAlerts', () => {
  it('vins dont la fenêtre se ferme dans l’horizon, plus les apogées passées, triés par urgence', () => {
    const inventory = [
      w('jeune', 2024, 'RED'),          // 2029-2034 : hors horizon
      w('bientot', 2016, 'RED'),        // 2021-2026 : 7 mois restants (juin inclus)
      w('pasencore', 2017, 'RED'),      // 2022-2027 : 19 mois, hors horizon de 12
      w('passe', 2010, 'RED'),          // 2015-2020 : apogée passée
      w('vide', 2016, 'RED', { inventoryCount: 0 }),
    ];
    const alerts = drinkBeforeAlerts(inventory, { horizonMonths: 12 });
    expect(alerts.map((a) => a.wine.id)).toEqual(['passe', 'bientot']);
    expect(alerts[1]).toMatchObject({ monthsLeft: 7, state: 'SE_REFERME', estimated: true });
    expect(alerts[0].state).toBe('DEPASSEE');
  });

  it('utilise l’apogée stockée en priorité', () => {
    const alerts = drinkBeforeAlerts([w('ia', 2024, 'RED', { peakStart: 2020, peakEnd: 2026 })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].peak).toMatchObject({ peakStart: 2020, peakEnd: 2026 });
    expect(alerts[0].estimated).toBe(false);
  });
});
```

Dans `describe('anticipationForEvent', …)` :

```js
  it('respecte l’apogée enregistrée plutôt que la formule naïve', () => {
    // Naïf : 2025-2030 (retenu en 2027) ; enregistré : 2030-2040 (exclu en 2027)
    const picks = anticipationForEvent([w('a', 2020, 'RED', { peakStart: 2030, peakEnd: 2040 })], '2027-12-24');
    expect(picks).toEqual([]);
  });
```

Run: `cd backend && npx vitest run tests/unit/proactive.test.js` — Expected: FAIL (monthsLeft, state, apogée enregistrée ignorée).

- [ ] **Step 7: Fix `backend/src/sommelier/proactive.js`** — remplacer `drinkBeforeAlerts` et la ligne `getPeakWindow(w.vintage, w.type)` d'`anticipationForEvent` :

```js
import { getPeakWindow } from './peakWindow.js';
import { classifyWine } from '../notifications/classify.js';

/**
 * Phase 8.1 — "À boire avant"
 * Vins dont la fenêtre se referme dans l'horizon ou dont l'apogée est passée,
 * du plus urgent au moins urgent (même classification que les notifications).
 */
export const drinkBeforeAlerts = (inventory, options = {}) => {
  const horizonMonths = options.horizonMonths ?? 12;
  const now = options.now ?? new Date();
  return inventory
    .map((wine) => ({ wine, c: classifyWine(wine, { horizonMonths, now }) }))
    .filter(({ c }) => c && (c.state === 'SE_REFERME' || c.state === 'DEPASSEE'))
    .map(({ wine, c }) => ({ wine, peak: getPeakWindow(wine), monthsLeft: c.monthsLeft, state: c.state, estimated: c.estimated }))
    .sort((a, b) => a.monthsLeft - b.monthsLeft);
};
```

et dans `anticipationForEvent` : `const peak = getPeakWindow(w);`

- [ ] **Step 8: Fix `utils/exportCsv.ts:29`** — `const peak = getPeakWindow(w);` (la surcharge `WineLike` existe dans `utils/peakWindow.ts`).

- [ ] **Step 9: Run tests**

Run: `cd backend && npx vitest run tests/unit` puis, à la racine, `npm run typecheck && npm test`
Expected: PASS partout.

- [ ] **Step 10: Commit**

```bash
git add backend/src/notifications/schedule.js backend/src/notifications/classify.js backend/src/sommelier/proactive.js utils/exportCsv.ts backend/tests/unit/notifications.schedule.test.js backend/tests/unit/notifications.classify.test.js backend/tests/unit/proactive.test.js
git commit -m "Notifications (2) : classification des vins, transitions et planning ; apogées enregistrées respectées partout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Canaux d'envoi (Gotify, email)

**Files:**
- Create: `backend/src/notifications/channels.js`
- Test: `backend/tests/unit/notifications.channels.test.js`

**Interfaces:**
- Consumes: `sendMail`, `isMailConfigured` de `backend/src/services/mailService.js`.
- Produces:
  - `sendGotify({ url, token, title, markdown, priority = 4 }): Promise<void>` (lève une `Error` au message lisible)
  - `availableChannels(settings): ('gotify'|'email')[]`
  - `deliver(channels, { settings, email, message }): Promise<{ channel, ok, error? }[]>` où `message = { title, markdown, priority, subject, text, html }`

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/notifications.channels.test.js` :

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendGotify, availableChannels, deliver } from '../../src/notifications/channels.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
const message = { title: 'T', markdown: '**m**', priority: 5, subject: 'S', text: 't', html: '<p>h</p>' };
const gotifySettings = { gotifyEnabled: true, gotifyUrl: 'https://h/gotify/', gotifyToken: 'tok', emailEnabled: false };

describe('sendGotify', () => {
  it('POST {url}/message avec le jeton et le markdown (sous-chemin et barre finale)', async () => {
    const fetch = ok();
    vi.stubGlobal('fetch', fetch);
    await sendGotify({ url: 'https://h/gotify/', token: 'tok', title: 'T', markdown: '**m**', priority: 5 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://h/gotify/message');
    expect(init.headers['X-Gotify-Key']).toBe('tok');
    expect(JSON.parse(init.body)).toEqual({
      title: 'T', message: '**m**', priority: 5,
      extras: { 'client::display': { contentType: 'text/markdown' } },
    });
  });
  it('jeton refusé → message lisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(sendGotify({ url: 'https://h', token: 'x', title: 'T', markdown: 'm' })).rejects.toThrow('jeton Gotify refusé (401)');
  });
  it('serveur injoignable → message lisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(sendGotify({ url: 'https://h', token: 'x', title: 'T', markdown: 'm' })).rejects.toThrow('serveur Gotify injoignable');
  });
});

describe('availableChannels', () => {
  it('Gotify seulement si URL et jeton ; email seulement si Sweego configuré', () => {
    expect(availableChannels(gotifySettings)).toEqual(['gotify']);
    expect(availableChannels({ ...gotifySettings, gotifyToken: null })).toEqual([]);
    expect(availableChannels({ emailEnabled: true })).toEqual([]);
    vi.stubEnv('SWEEGO_API_KEY', 'k');
    vi.stubEnv('MAIL_FROM', 'cave@example.com');
    expect(availableChannels({ emailEnabled: true })).toEqual(['email']);
  });
});

describe('deliver', () => {
  it('résultat par canal ; email sans Sweego = échec explicite, jamais un faux succès', async () => {
    vi.stubGlobal('fetch', ok());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const results = await deliver(['gotify', 'email'], { settings: gotifySettings, email: 'a@b.fr', message });
    expect(results).toEqual([
      { channel: 'gotify', ok: true },
      { channel: 'email', ok: false, error: "envoi d'email non configuré sur le serveur" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/notifications.channels.test.js` — Expected: FAIL (module introuvable).

- [ ] **Step 3: Implement `backend/src/notifications/channels.js`**

```js
// Canaux d'envoi des notifications : Gotify (POST {url}/message) et email (Sweego).
import { sendMail, isMailConfigured } from '../services/mailService.js';

export const sendGotify = async ({ url, token, title, markdown, priority = 4 }) => {
  const endpoint = `${String(url).replace(/\/+$/, '')}/message`;
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': token },
      body: JSON.stringify({
        title,
        message: markdown,
        priority,
        extras: { 'client::display': { contentType: 'text/markdown' } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`serveur Gotify injoignable (${error.message})`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`jeton Gotify refusé (${res.status})`);
  if (!res.ok) throw new Error(`Gotify a répondu ${res.status}`);
};

export const availableChannels = (settings) => [
  ...(settings.gotifyEnabled && settings.gotifyUrl && settings.gotifyToken ? ['gotify'] : []),
  ...(settings.emailEnabled && isMailConfigured() ? ['email'] : []),
];

/** Envoie le message sur chaque canal ; ne lève jamais, renvoie un résultat par canal. */
export const deliver = async (channels, { settings, email, message }) => {
  const results = [];
  for (const channel of channels) {
    try {
      if (channel === 'gotify') {
        if (!settings.gotifyUrl || !settings.gotifyToken) throw new Error('URL ou jeton Gotify manquant');
        await sendGotify({
          url: settings.gotifyUrl, token: settings.gotifyToken,
          title: message.title, markdown: message.markdown, priority: message.priority,
        });
      } else {
        const { sent } = await sendMail({ to: email, subject: message.subject, text: message.text, html: message.html });
        if (!sent) throw new Error("envoi d'email non configuré sur le serveur");
      }
      results.push({ channel, ok: true });
    } catch (error) {
      results.push({ channel, ok: false, error: error.message });
    }
  }
  return results;
};
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/channels.js backend/tests/unit/notifications.channels.test.js
git commit -m "Notifications (3) : canaux Gotify et email

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Réglages, états d'alerte et journal (`store.js`)

**Files:**
- Create: `backend/src/notifications/store.js`
- Test: `backend/tests/unit/notifications.store.test.js` (validation, vue publique ; l'accès base est couvert par les tâches 7 et 8)

**Interfaces:**
- Consumes: `pool`, `withTransaction` de `backend/src/db.js` ; `convertKeysToCamelCase` de `backend/src/utils/case.js`.
- Produces:
  - `DEFAULT_SETTINGS` (camelCase, cf. ci-dessous)
  - `validateSettingsPatch(body): { patch, errors: string[] }`
  - `publicSettings(settings): object` (sans `gotifyToken`, `userId`, `alertsSeededAt`, `updatedAt` ; avec `gotifyTokenSet: boolean`)
  - `getSettings(userId): Promise<settings>` (défauts si aucune ligne)
  - `saveSettings(userId, patch): Promise<settings>` (création : `last_newsletter_at = now()` pour que la première newsletter attende la prochaine échéance)
  - `listAllSettings(): Promise<(settings & { email })[]>`
  - `loadAlertStates(userId): Promise<Map<wineId, state>>`
  - `applyAlertChanges(userId, { upserts, deletes, seeded }): Promise<void>`
  - `markNewsletterSent(userId, at: Date): Promise<void>`
  - `logDeliveries(userId, kind, results, summary): Promise<void>`
  - `recentLog(userId, limit = 5): Promise<{ kind, channel, ok, error, summary, sentAt }[]>`
  - `purgeOldLog(): Promise<void>`

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/notifications.store.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { validateSettingsPatch, publicSettings, DEFAULT_SETTINGS } from '../../src/notifications/store.js';

describe('validateSettingsPatch', () => {
  it('garde les champs valides et ignore les inconnus', () => {
    const { patch, errors } = validateSettingsPatch({
      gotifyEnabled: true, gotifyUrl: 'https://push.example.com/', horizonMonths: 6,
      newsletterFrequency: 'weekly', newsletterWeekday: 7, newsletterHour: 0, userId: 'pirate',
    });
    expect(errors).toEqual([]);
    expect(patch).toEqual({
      gotifyEnabled: true, gotifyUrl: 'https://push.example.com', horizonMonths: 6,
      newsletterFrequency: 'weekly', newsletterWeekday: 7, newsletterHour: 0,
    });
  });
  it('refuse les valeurs hors bornes ou mal typées', () => {
    const { errors } = validateSettingsPatch({
      gotifyUrl: 'ftp://x', horizonMonths: 0, newsletterHour: 24, newsletterWeekday: 8,
      newsletterFrequency: 'daily', alertPast: 'oui',
    });
    expect(errors).toHaveLength(6);
  });
  it('jeton : vide = inchangé, null = effacé, chaîne = remplacé', () => {
    expect(validateSettingsPatch({ gotifyToken: '' }).patch).toEqual({});
    expect(validateSettingsPatch({ gotifyToken: null }).patch).toEqual({ gotifyToken: null });
    expect(validateSettingsPatch({ gotifyToken: ' abc ' }).patch).toEqual({ gotifyToken: 'abc' });
  });
  it('URL vide = effacée', () => {
    expect(validateSettingsPatch({ gotifyUrl: '' }).patch).toEqual({ gotifyUrl: null });
  });
});

describe('publicSettings', () => {
  it('ne renvoie jamais le jeton', () => {
    const out = publicSettings({ ...DEFAULT_SETTINGS, userId: 'u', gotifyToken: 'secret', alertsSeededAt: null });
    expect(out.gotifyToken).toBeUndefined();
    expect(out.userId).toBeUndefined();
    expect(out.gotifyTokenSet).toBe(true);
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd backend && npx vitest run tests/unit/notifications.store.test.js` → FAIL.

- [ ] **Step 3: Implement `backend/src/notifications/store.js`**

```js
// Accès base des notifications : réglages par compte, état des alertes, journal d'envois.
import { pool, withTransaction } from '../db.js';
import { convertKeysToCamelCase } from '../utils/case.js';

export const DEFAULT_SETTINGS = {
  emailEnabled: false,
  gotifyEnabled: false,
  gotifyUrl: null,
  gotifyToken: null,
  alertsEnabled: true,
  alertReady: true,
  alertClosing: true,
  alertPast: true,
  horizonMonths: 12,
  newsletterFrequency: 'monthly',
  newsletterWeekday: 1,
  newsletterHour: 9,
  newsletterAi: true,
  lastNewsletterAt: null,
  alertsSeededAt: null,
};

const COLUMNS = {
  emailEnabled: 'email_enabled',
  gotifyEnabled: 'gotify_enabled',
  gotifyUrl: 'gotify_url',
  gotifyToken: 'gotify_token',
  alertsEnabled: 'alerts_enabled',
  alertReady: 'alert_ready',
  alertClosing: 'alert_closing',
  alertPast: 'alert_past',
  horizonMonths: 'horizon_months',
  newsletterFrequency: 'newsletter_frequency',
  newsletterWeekday: 'newsletter_weekday',
  newsletterHour: 'newsletter_hour',
  newsletterAi: 'newsletter_ai',
};

const BOOLEANS = ['emailEnabled', 'gotifyEnabled', 'alertsEnabled', 'alertReady', 'alertClosing', 'alertPast', 'newsletterAi'];
const INTEGERS = { horizonMonths: [1, 60], newsletterWeekday: [1, 7], newsletterHour: [0, 23] };
const FREQUENCIES = ['off', 'weekly', 'monthly'];

export const validateSettingsPatch = (body = {}) => {
  const patch = {};
  const errors = [];
  for (const k of BOOLEANS) {
    if (!(k in body)) continue;
    if (typeof body[k] === 'boolean') patch[k] = body[k];
    else errors.push(`${k} doit être un booléen`);
  }
  for (const [k, [min, max]] of Object.entries(INTEGERS)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (Number.isInteger(v) && v >= min && v <= max) patch[k] = v;
    else errors.push(`${k} doit être un entier entre ${min} et ${max}`);
  }
  if ('newsletterFrequency' in body) {
    if (FREQUENCIES.includes(body.newsletterFrequency)) patch.newsletterFrequency = body.newsletterFrequency;
    else errors.push('newsletterFrequency doit valoir off, weekly ou monthly');
  }
  if ('gotifyUrl' in body) {
    const v = body.gotifyUrl;
    if (v === null || v === '') patch.gotifyUrl = null;
    else {
      let valid = false;
      try { valid = typeof v === 'string' && ['http:', 'https:'].includes(new URL(v.trim()).protocol); } catch { valid = false; }
      if (valid) patch.gotifyUrl = v.trim().replace(/\/+$/, '');
      else errors.push('gotifyUrl doit être une URL http(s)');
    }
  }
  if ('gotifyToken' in body) {
    const v = body.gotifyToken;
    if (v === null) patch.gotifyToken = null;
    else if (typeof v !== 'string') errors.push('gotifyToken doit être une chaîne');
    else if (v.trim() !== '') patch.gotifyToken = v.trim();
  }
  return { patch, errors };
};

export const publicSettings = (settings) => {
  const { gotifyToken, userId, alertsSeededAt, updatedAt, email, ...rest } = settings;
  return { ...rest, gotifyTokenSet: Boolean(gotifyToken) };
};

export const getSettings = async (userId) => {
  const { rows } = await pool.query('SELECT * FROM notification_settings WHERE user_id = $1', [userId]);
  return rows[0] ? convertKeysToCamelCase(rows[0]) : { userId, ...DEFAULT_SETTINGS };
};

export const saveSettings = async (userId, patch) => {
  const keys = Object.keys(patch).filter((k) => COLUMNS[k]);
  const cols = keys.map((k) => COLUMNS[k]);
  const params = [userId, ...keys.map((k) => patch[k])];
  const colList = ['user_id', 'last_newsletter_at', ...cols].join(', ');
  const valList = ['$1', 'now()', ...cols.map((_, i) => `$${i + 2}`)].join(', ');
  const updates = [...cols.map((c, i) => `${c} = $${i + 2}`), 'updated_at = now()'].join(', ');
  await pool.query(
    `INSERT INTO notification_settings (${colList}) VALUES (${valList})
     ON CONFLICT (user_id) DO UPDATE SET ${updates}`,
    params
  );
  return getSettings(userId);
};

export const listAllSettings = async () => {
  const { rows } = await pool.query(
    'SELECT s.*, u.email FROM notification_settings s JOIN users u ON u.id = s.user_id'
  );
  return convertKeysToCamelCase(rows);
};

export const loadAlertStates = async (userId) => {
  const { rows } = await pool.query('SELECT wine_id, state FROM wine_alert_state WHERE user_id = $1', [userId]);
  return new Map(rows.map((r) => [r.wine_id, r.state]));
};

export const applyAlertChanges = (userId, { upserts, deletes, seeded }) =>
  withTransaction(async (db) => {
    for (const { wineId, state } of upserts) {
      await db.query(
        `INSERT INTO wine_alert_state (user_id, wine_id, state) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, wine_id) DO UPDATE SET state = EXCLUDED.state, notified_at = now()`,
        [userId, wineId, state]
      );
    }
    if (deletes.length > 0) {
      await db.query('DELETE FROM wine_alert_state WHERE user_id = $1 AND wine_id = ANY($2::uuid[])', [userId, deletes]);
    }
    if (seeded) await db.query('UPDATE notification_settings SET alerts_seeded_at = now() WHERE user_id = $1', [userId]);
  });

export const markNewsletterSent = (userId, at) =>
  pool.query('UPDATE notification_settings SET last_newsletter_at = $2 WHERE user_id = $1', [userId, at]);

export const logDeliveries = async (userId, kind, results, summary) => {
  for (const r of results) {
    await pool.query(
      'INSERT INTO notification_log (user_id, kind, channel, ok, error, summary) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, kind, r.channel, r.ok, r.error || null, summary ? String(summary).slice(0, 200) : null]
    );
  }
};

export const recentLog = async (userId, limit = 5) => {
  const { rows } = await pool.query(
    `SELECT kind, channel, ok, error, summary, sent_at FROM notification_log
     WHERE user_id = $1 ORDER BY sent_at DESC, id DESC LIMIT $2`,
    [userId, limit]
  );
  return convertKeysToCamelCase(rows);
};

export const purgeOldLog = () => pool.query("DELETE FROM notification_log WHERE sent_at < now() - interval '180 days'");
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS (seul le module pur est exercé ; `db.js` crée un pool paresseux sans se connecter).

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/store.js backend/tests/unit/notifications.store.test.js
git commit -m "Notifications (4) : réglages par compte, état des alertes et journal d'envois

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rendu des messages — gabarit Cockpit (newsletter, alerte, test)

**Files:**
- Create: `backend/src/notifications/format.js`, `backend/src/notifications/render.js`
- Test: `backend/tests/unit/notifications.render.test.js`
- Référence visuelle : `docs/superpowers/specs/newsletter-exemple.html` (spec §11) — le gabarit doit le reproduire.

**Interfaces:**
- Consumes: transitions de `detectTransitions` (tâche 2) ; `notifyTz`, `zonedParts` (tâche 2).
- Produces:
  - `format.js` : `wineLabel(wine): string` (nom + cuvée + millésime), `wineName(wine): string` (nom + cuvée), `stateLabel({ state, peakStart, peakEnd, estimated }): string`, `windowBadge({ state, monthsLeft, peakEnd }): { text, tone: 'passe'|'bientot'|'neutre' }`, `euros(n): string`, `periodTitle(settings, now, tz): string`, `dayMonth(date, tz): string` (« JJ/MM »)
  - `render.js` : `cockpitShell({ title, preheader, label, body, appUrl }): string`, `renderNewsletterEmail(nl): string`, `renderNewsletter(nl): Message`, `renderAlert(transitions, { appUrl }): Message`, `testMessage({ appUrl }): Message`, avec `Message = { title, markdown, priority, subject, text, html }`
  - **Forme `nl`** (produite par `buildNewsletter`, tâche 6 ; `menuflow` rempli en tâche 15) :

```js
{
  subject, title, periodLabel,                 // 'VinoFlow — votre cave, novembre 2026', 'Votre cave — novembre 2026', 'novembre 2026'
  heading: { lead: 'Que boire', accent: 'ce mois-ci' },   // 'cette semaine' en hebdo
  intro, appUrl,
  stats: { bottlesInCellar, winesInCellar, bottlesIn, spent, bottlesOut, gifts, cellarValue },
  urgent: [{ label, sub, location, qty, badge: { text, tone }, url }],
  ready: [{ label, sub, url }],
  tastings: [{ label, sub, rating, url }],      // rating : '17/20' ou null
  menuflow: null | {
    accords: [{ date, dish, wine, verdict, rating, url }],
    couldHave: [{ date, dish, wine, reason, url }],
    forgotten: [{ date, dish, wine, url }],
  },
  note: null | { intro, picks: [{ wine, reason }], seasonalPairing, closing },
}
```

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/notifications.render.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { renderAlert, renderNewsletter, renderNewsletterEmail, testMessage } from '../../src/notifications/render.js';
import { wineLabel, stateLabel, windowBadge, periodTitle } from '../../src/notifications/format.js';

const APP = 'https://cave.example.com';
const wine = (id, name, extra = {}) => ({ id, name, vintage: 2015, inventoryCount: 2, ...extra });
const t = (w, to, extra = {}) => ({ wine: w, from: 'PRET', to, peakStart: 2018, peakEnd: 2026, monthsLeft: 3, estimated: false, ...extra });

const nl = (extra = {}) => ({
  subject: 'VinoFlow — votre cave, novembre 2026',
  title: 'Votre cave — novembre 2026',
  periodLabel: 'novembre 2026',
  heading: { lead: 'Que boire', accent: 'ce mois-ci' },
  intro: 'Votre cave depuis le 01/10.',
  appUrl: APP,
  stats: { bottlesInCellar: 98, winesInCellar: 30, bottlesIn: 9, spent: 212, bottlesOut: 4, gifts: 1, cellarValue: 4320 },
  urgent: Array.from({ length: 7 }, (_, i) => ({
    label: `Vin ${i}`, sub: 'Alsace · 2021', location: 'Casier A', qty: 2,
    badge: i === 0 ? { text: 'PASSÉ', tone: 'passe' } : { text: '2 MOIS', tone: 'bientot' }, url: `${APP}/wine/${i}`,
  })),
  ready: [{ label: 'Les Galets Roulés', sub: 'Vallée du Rhône 2019 · 5 bt · apogée 2026–2032', url: `${APP}/wine/g` }],
  tastings: [{ label: 'Maury Grenat', sub: '2018 · 12/10', rating: '17/20', url: `${APP}/wine/m` }],
  menuflow: null,
  note: { intro: 'x'.repeat(900), picks: [{ wine: wine('a', 'Alpha'), reason: 'parfait en automne' }], seasonalPairing: 'Gibier', closing: null },
  ...extra,
});

describe('format', () => {
  it('libellés', () => {
    expect(wineLabel({ name: 'Château X', cuvee: 'Réserve', vintage: 2015 })).toBe('Château X Réserve 2015');
    expect(stateLabel({ state: 'SE_REFERME', peakStart: 2018, peakEnd: 2026, estimated: true })).toBe('à boire avant fin 2026 (estimée)');
    expect(stateLabel({ state: 'DEPASSEE', peakStart: 2010, peakEnd: 2020, estimated: false })).toBe('apogée dépassée (fin 2020)');
    expect(stateLabel({ state: 'PRET', peakStart: 2024, peakEnd: 2030, estimated: false })).toBe('en apogée 2024–2030');
  });
  it('badges de fenêtre', () => {
    expect(windowBadge({ state: 'DEPASSEE', monthsLeft: -3, peakEnd: 2020 })).toEqual({ text: 'PASSÉ', tone: 'passe' });
    expect(windowBadge({ state: 'SE_REFERME', monthsLeft: 2, peakEnd: 2026 })).toEqual({ text: '2 MOIS', tone: 'bientot' });
    expect(windowBadge({ state: 'SE_REFERME', monthsLeft: 14, peakEnd: 2027 })).toEqual({ text: 'FIN 2027', tone: 'neutre' });
  });
  it('titre de période', () => {
    const now = new Date('2026-11-01T08:00:00Z');
    expect(periodTitle({ newsletterFrequency: 'monthly' }, now, 'Europe/Paris')).toBe('novembre 2026');
    expect(periodTitle({ newsletterFrequency: 'weekly' }, now, 'Europe/Paris')).toBe('semaine du 1 novembre 2026');
  });
});

describe('renderNewsletterEmail (gabarit Cockpit)', () => {
  it('reprend l’identité Cockpit', () => {
    const html = renderNewsletterEmail(nl());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('CELLAR.OS');
    expect(html).toContain('Que boire <em');
    expect(html).toContain('ce mois-ci</em>');
    expect(html).toContain('#7f1d1d');
    expect(html).toContain('@media (max-width: 620px)');
    expect(html).toContain('>PASSÉ<');
    expect(html).toContain('Avant qu’ils ne passent leur pic');
    expect(html).toContain('Enfin prêts');
    expect(html).toContain('17/20');
    expect(html).toContain('RÉDIGÉ PAR L’IA');
    expect(html).toContain(`href="${APP}/wine/0"`);
    expect(html).toContain('Ouvrir la cave');
  });
  it('sans mot du sommelier ni dégustations : blocs absents', () => {
    const html = renderNewsletterEmail(nl({ note: null, tastings: [] }));
    expect(html).not.toContain('RÉDIGÉ PAR L’IA');
    expect(html).not.toContain('DÉGUSTATIONS DU MOIS');
  });
  it('échappe tout texte venu de la base', () => {
    const html = renderNewsletterEmail(nl({ urgent: [{ label: '<b>Pirate</b>', sub: '', location: null, qty: 1, badge: { text: 'PASSÉ', tone: 'passe' }, url: `${APP}/wine/x` }] }));
    expect(html).not.toContain('<b>Pirate</b>');
    expect(html).toContain('&lt;b&gt;Pirate&lt;/b&gt;');
  });
});

describe('renderNewsletter', () => {
  it('Gotify court (5 vins, mot tronqué), texte complet', () => {
    const m = renderNewsletter(nl());
    expect(m.subject).toBe('VinoFlow — votre cave, novembre 2026');
    expect(m.title).toBe('Votre cave — novembre 2026');
    expect(m.markdown).toContain('Vin 4');
    expect(m.markdown).not.toContain('Vin 5');
    expect(m.markdown).toContain(`[Ouvrir la cave](${APP})`);
    expect(m.markdown.length).toBeLessThan(2000);
    expect(m.text).toContain('Vin 6');
    expect(m.priority).toBe(4);
  });
});

describe('renderAlert', () => {
  it('regroupe par transition, liens vers les fiches, priorité 5 si apogée dépassée', () => {
    const m = renderAlert([
      t(wine('a', 'Alpha'), 'PRET'),
      t(wine('b', 'Bravo'), 'DEPASSEE', { peakEnd: 2020 }),
      t(wine('c', 'Charlie'), 'PRET'),
    ], { appUrl: APP });
    expect(m.title).toBe('3 vins changent d’état');
    expect(m.priority).toBe(5);
    expect(m.markdown).toContain('**Entrés en apogée**');
    expect(m.markdown).toContain(`[Alpha 2015](${APP}/wine/a)`);
    expect(m.markdown.indexOf('Apogée dépassée')).toBeLessThan(m.markdown.indexOf('Entrés en apogée'));
    expect(m.html).toContain('CELLAR.OS');
    expect(m.html).toContain(`${APP}/wine/b`);
    expect(m.subject).toBe('VinoFlow — 3 vins changent d’état');
  });
  it('un seul vin, priorité 4 sans apogée dépassée', () => {
    const m = renderAlert([t(wine('a', 'Alpha'), 'SE_REFERME')], { appUrl: APP });
    expect(m.title).toBe('1 vin change d’état');
    expect(m.priority).toBe(4);
  });
  it('échappe le HTML et neutralise le markdown des noms de vin', () => {
    const m = renderAlert([t(wine('a', '<b>Pirate</b> [x](http://evil)'), 'PRET')], { appUrl: APP });
    expect(m.html).not.toContain('<b>Pirate</b>');
    expect(m.markdown).not.toContain('](http://evil)');
  });
});

describe('testMessage', () => {
  it('message de test lisible, gabarit Cockpit', () => {
    const m = testMessage({ appUrl: APP });
    expect(m.title).toBe('VinoFlow — test de notification');
    expect(m.html).toContain('CELLAR.OS');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd backend && npx vitest run tests/unit/notifications.render.test.js` → FAIL (modules introuvables).

- [ ] **Step 3: Implement `backend/src/notifications/format.js`**

```js
// Libellés partagés par les alertes, la newsletter, le mot du sommelier et la passerelle MenuFlow.
import { notifyTz } from './schedule.js';

const present = (v) => v !== null && v !== undefined && v !== '';

export const wineName = (wine) => [wine.name, wine.cuvee].filter(present).join(' ');
export const wineLabel = (wine) => [wine.name, wine.cuvee, wine.vintage].filter(present).join(' ');

export const stateLabel = ({ state, peakStart, peakEnd, estimated }) => {
  const base = {
    GARDE: `en garde jusqu’en ${peakStart}`,
    PRET: `en apogée ${peakStart}–${peakEnd}`,
    SE_REFERME: `à boire avant fin ${peakEnd}`,
    DEPASSEE: `apogée dépassée (fin ${peakEnd})`,
  }[state];
  return estimated ? `${base} (estimée)` : base;
};

export const windowBadge = ({ state, monthsLeft, peakEnd }) => {
  if (state === 'DEPASSEE') return { text: 'PASSÉ', tone: 'passe' };
  if (monthsLeft <= 6) return { text: `${monthsLeft} MOIS`, tone: 'bientot' };
  return { text: `FIN ${peakEnd}`, tone: 'neutre' };
};

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const euros = (n) => EUR.format(Number(n) || 0);

export const periodTitle = (settings, now, tz = notifyTz()) => {
  if (settings.newsletterFrequency === 'weekly') {
    return `semaine du ${new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(now)}`;
  }
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, month: 'long', year: 'numeric' }).format(now);
};

export const dayMonth = (date, tz = notifyTz()) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(new Date(date));
```

- [ ] **Step 4: Implement `backend/src/notifications/render.js`** — gabarit Cockpit fidèle à `newsletter-exemple.html` :

```js
// Mise en forme des messages. Email : gabarit Cockpit (tableaux, styles en ligne,
// identité de l'app — voir docs/superpowers/specs/newsletter-exemple.html).
// Gotify : markdown court. Tout texte venu de la base est échappé.
import { wineLabel, stateLabel, euros } from './format.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Neutralise la syntaxe markdown (noms de vins).
const md = (s) => String(s ?? '').replace(/([\\`*_[\]()#<>!|])/g, '\\$1');
const truncate = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

const F = {
  serif: "'Playfair Display',Georgia,serif",
  sans: 'Outfit,Helvetica,Arial,sans-serif',
  mono: "'JetBrains Mono',Courier,monospace",
};
const C = {
  cream: '#fcfaf6', line: '#e7e5e4', rule: '#f5f5f4', wine: '#7f1d1d', ink: '#1c1917', body: '#44403c',
  soft: '#57534e', muted: '#78716c', faint: '#a8a29e', creamCard: '#f5f0e6', creamLine: '#ebe2cf', green: '#15803d',
};
const BADGE = {
  passe: 'background:#7f1d1d;color:#ffffff',
  bientot: 'background:#fef3c7;color:#92400e',
  neutre: 'background:#f5f5f4;color:#57534e',
};

const mono = (text, color = C.muted, size = 10) =>
  `<div style="font-family:${F.mono};font-size:${size}px;letter-spacing:1.5px;color:${color};">${esc(text)}</div>`;
const wineLink = (label, url, size = 15) =>
  `<a href="${esc(url)}" style="font-family:${F.serif};font-style:italic;font-size:${size}px;color:${C.ink};text-decoration:none;">${esc(label)}</a>`;
const badge = ({ text, tone }) =>
  `<span style="font-family:${F.mono};font-size:10px;${BADGE[tone] || BADGE.neutre};padding:2px 6px;border-radius:3px;">${esc(text)}</span>`;
const card = (inner, { cream = false } = {}) => `<tr><td class="pad" style="padding:12px 28px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${cream ? C.creamCard : '#ffffff'};border:1px solid ${cream ? C.creamLine : C.line};border-radius:6px;">
<tr><td style="padding:14px 16px;">${inner}</td></tr></table></td></tr>`;
const cardTitle = (text) =>
  `<div style="font-family:${F.serif};font-style:italic;font-size:19px;color:${C.ink};margin-top:6px;">${esc(text)}</div>`;

export const cockpitShell = ({ title, preheader = '', label, body, appUrl }) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500&family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>@media (max-width: 620px) { .kpi { display:block !important; width:100% !important; box-sizing:border-box; margin-bottom:8px; } .pad { padding-left:20px !important; padding-right:20px !important; } .hide-sm { display:none !important; } }</style>
</head><body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;color:${C.cream};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td class="pad" style="padding:0 28px 18px;border-bottom:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${F.serif};font-style:italic;font-size:26px;color:${C.ink};line-height:1;">VinoFlow
<div style="font-family:${F.mono};font-style:normal;font-size:9px;letter-spacing:2px;color:${C.faint};margin-top:4px;">CELLAR.OS</div></td>
<td align="right" style="font-family:${F.mono};font-size:10px;letter-spacing:1.5px;color:${C.muted};"><span style="color:${C.wine};">●</span> ${esc(label)}</td>
</tr></table></td></tr>
${body}
<tr><td class="pad" align="center" style="padding:24px 28px 8px;"><a href="${esc(appUrl)}" style="display:inline-block;background:${C.wine};color:#ffffff;text-decoration:none;font-family:${F.sans};font-size:14px;font-weight:500;padding:12px 22px;border-radius:6px;">Ouvrir la cave&nbsp;→</a></td></tr>
<tr><td class="pad" style="padding:22px 28px 0;">
<p style="margin:0;font-family:${F.serif};font-style:italic;font-size:13px;line-height:1.5;color:${C.muted};">« Le vin est la plus saine et la plus hygiénique des boissons. » — Louis Pasteur</p>
<p style="margin:14px 0 0;font-family:${F.mono};font-size:10px;letter-spacing:1px;color:${C.faint};line-height:1.6;">FRÉQUENCE ET CANAUX : RÉGLAGES › NOTIFICATIONS<br>VINOFLOW · CAVE DU FOYER</p>
</td></tr></table></td></tr></table></body></html>`;

const kpi = (labelText, value, sub, { serif = false, color = C.ink } = {}) => `<td class="kpi" width="25%" style="padding:0 4px;">
<div style="background:#ffffff;border:1px solid ${C.line};border-radius:6px;padding:12px 14px;">
${mono(labelText, C.muted, 9)}
<div style="font-family:${serif ? F.serif : F.sans};font-size:26px;font-weight:${serif ? 400 : 500};color:${color};margin-top:6px;line-height:1;">${esc(value)}</div>
<div style="font-family:${F.sans};font-size:11px;color:${C.muted};margin-top:4px;">${esc(sub)}</div></div></td>`;

const statsBlock = (s) => `<tr><td class="pad" style="padding:20px 28px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${kpi('BOUTEILLES', String(s.bottlesInCellar), 'en cave')}
${kpi('ENTRÉES', `+${s.bottlesIn}`, `${euros(s.spent)} dépensés`, { serif: true, color: C.green })}
${kpi('SORTIES', `−${s.bottlesOut}`, s.gifts ? `dont ${s.gifts} offerte(s)` : 'bues', { serif: true, color: C.wine })}
${kpi('VALEUR D’ACHAT', euros(s.cellarValue), `${s.winesInCellar} vins`)}
</tr></table></td></tr>`;

const urgentBlock = (rows) => {
  const cell = 'padding:9px 0;border-bottom:1px solid #f5f5f4;';
  const lines = rows.map((r) => `<tr>
<td style="${cell}">${wineLink(r.label, r.url)}<br><span style="font-size:11px;color:${C.muted};">${esc(r.sub)}</span></td>
<td class="hide-sm" style="${cell}font-size:12px;color:${C.muted};">${esc(r.location || '')}</td>
<td align="center" style="${cell}">${esc(r.qty)}</td>
<td align="right" style="${cell}">${badge(r.badge)}</td></tr>`).join('\n');
  const head = 'padding:6px 0;border-bottom:1px solid #f5f5f4;';
  return card(`${mono(`● ${rows.length} URGENT${rows.length > 1 ? 'S' : ''} · EN FIN DE FENÊTRE`, C.wine)}
${cardTitle('Avant qu’ils ne passent leur pic')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-family:${F.sans};font-size:13px;color:${C.body};">
<tr style="font-family:${F.mono};font-size:9px;letter-spacing:1.5px;color:${C.faint};"><td style="${head}">VIN</td><td class="hide-sm" style="${head}">EMPLACEMENT</td><td align="center" style="${head}">QTÉ</td><td align="right" style="${head}">FENÊTRE</td></tr>
${lines}</table>`);
};

const readyBlock = (rows, year) => card(`${mono(`● ENTRÉS EN APOGÉE · ${year}`, C.green)}
${cardTitle('Enfin prêts')}
<div style="margin-top:6px;font-family:${F.sans};font-size:13px;color:${C.body};line-height:1.7;">
${rows.map((r) => `${wineLink(r.label, r.url)} <span style="color:${C.muted};font-size:12px;">· ${esc(r.sub)}</span>`).join('<br>\n')}</div>`);

const noteBlock = (note, appUrl) => card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td>${mono('◌ SOMMELIER · LE MOT DU MOIS', C.wine)}</td><td align="right">${mono('RÉDIGÉ PAR L’IA', C.faint, 9)}</td></tr></table>
<p style="margin:12px 0 0;font-family:${F.serif};font-style:italic;font-size:17px;line-height:1.55;color:${C.ink};">« ${esc(note.intro)} »</p>
${note.picks.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;font-family:${F.sans};font-size:13px;color:${C.body};line-height:1.55;">
${note.picks.map((p, i) => `<tr><td width="22" valign="top" style="font-family:${F.mono};font-size:11px;color:${C.wine};padding:4px 0;">${String(i + 1).padStart(2, '0')}</td>
<td style="padding:4px 0;">${wineLink(wineLabel(p.wine), `${appUrl}/wine/${p.wine.id}`)} — ${esc(p.reason)}</td></tr>`).join('\n')}</table>` : ''}
${note.seasonalPairing ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid ${C.creamLine};font-family:${F.sans};font-size:13px;color:${C.soft};line-height:1.55;">${mono('ACCORD DE SAISON', C.muted, 9)}${esc(note.seasonalPairing)}</div>` : ''}
${note.closing ? `<p style="margin:12px 0 0;font-family:${F.sans};font-size:13px;color:${C.soft};">${esc(note.closing)}</p>` : ''}`, { cream: true });

const tastingsBlock = (rows) => card(`${mono('◌ JOURNAL · DÉGUSTATIONS DU MOIS')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;font-family:${F.sans};font-size:13px;color:${C.body};">
${rows.map((r) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f5f5f4;">${wineLink(r.label, r.url)} <span style="color:${C.muted};font-size:12px;">${esc(r.sub)}</span></td>
<td align="right" style="padding:6px 0;border-bottom:1px solid #f5f5f4;font-family:${F.mono};font-size:12px;color:${C.ink};">${esc(r.rating || '')}</td></tr>`).join('\n')}</table>`);

// Rubriques MenuFlow (tâche 15) : no-op tant que nl.menuflow est nul.
export const menuflowBlocks = (mf) => {
  if (!mf) return '';
  const out = [];
  if (mf.accords.length) {
    out.push(card(`${mono('◌ MENUFLOW · VOS ACCORDS DU MOIS', C.wine)}
${cardTitle('Ce qui a accompagné vos dîners')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font-family:${F.sans};font-size:13px;color:${C.body};">
${mf.accords.map((a) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f5f5f4;"><span style="font-family:${F.mono};font-size:11px;color:${C.muted};">${esc(a.date)}</span> ${esc(a.dish)} × ${wineLink(a.wine, a.url)}
${a.verdict || a.rating ? `<br><span style="font-size:11px;color:${C.muted};">${esc([a.verdict, a.rating].filter(Boolean).join(' · '))}</span>` : ''}</td></tr>`).join('\n')}</table>`));
  }
  if (mf.couldHave.length) {
    out.push(card(`${mono('◌ MENUFLOW · VOUS AURIEZ PU…', C.wine)}
${mf.couldHave.map((c) => `<p style="margin:10px 0 0;font-family:${F.serif};font-style:italic;font-size:15px;line-height:1.5;color:${C.ink};">Le ${esc(c.date)}, avec ${esc(c.dish)} : ${wineLink(c.wine, c.url)}</p>
${c.reason ? `<p style="margin:2px 0 0;font-family:${F.sans};font-size:12px;color:${C.soft};">${esc(c.reason)}</p>` : ''}`).join('\n')}`, { cream: true }));
  }
  if (mf.forgotten.length) {
    out.push(`<tr><td class="pad" style="padding:12px 28px 4px;">${mono('◌ D’AILLEURS…', C.muted, 9)}
${mf.forgotten.map((f) => `<p style="margin:6px 0 0;font-family:${F.sans};font-size:13px;color:${C.soft};">Vous n’avez pas noté le ${wineLink(f.wine, f.url, 13)} du ${esc(f.date)} (${esc(f.dish)}).</p>`).join('\n')}</td></tr>`);
  }
  return out.join('\n');
};

export const renderNewsletterEmail = (nl) => {
  const year = nl.periodLabel.match(/\d{4}/)?.[0] ?? '';
  const body = [
    `<tr><td class="pad" style="padding:28px 28px 8px;">
${mono(`◌ VINOFLOW · ${nl.periodLabel.toUpperCase()}`)}
<h1 style="margin:10px 0 6px;font-family:${F.serif};font-weight:400;font-size:34px;line-height:1.15;color:${C.ink};">${esc(nl.heading.lead)} <em style="color:${C.wine};">${esc(nl.heading.accent)}</em>&nbsp;?</h1>
<p style="margin:0;font-family:${F.sans};font-size:14px;line-height:1.6;color:${C.soft};">${esc(nl.intro)}</p></td></tr>`,
    statsBlock(nl.stats),
    nl.urgent.length ? urgentBlock(nl.urgent) : '',
    nl.ready.length ? readyBlock(nl.ready, year) : '',
    menuflowBlocks(nl.menuflow),
    nl.note ? noteBlock(nl.note, nl.appUrl) : '',
    nl.tastings.length ? tastingsBlock(nl.tastings) : '',
  ].join('\n');
  const preheader = [
    nl.urgent.length ? `${nl.urgent.length} vin(s) à ouvrir en priorité` : null,
    nl.ready.length ? `${nl.ready.length} entré(s) en apogée` : null,
    nl.note ? 'le mot du sommelier' : null,
  ].filter(Boolean).join(', ');
  return cockpitShell({ title: nl.subject, preheader, label: 'NEWSLETTER', body, appUrl: nl.appUrl });
};

const statsLine = (s) =>
  `${s.bottlesInCellar} bouteilles · +${s.bottlesIn} entrées · −${s.bottlesOut} sorties · ${euros(s.cellarValue)} (valeur d’achat)`;

export const renderNewsletter = (nl) => {
  const mf = nl.menuflow;
  const text = [
    nl.title, '', nl.intro, '', statsLine(nl.stats), '',
    ...(nl.urgent.length ? ['À ouvrir en priorité', ...nl.urgent.map((r) => `- ${r.label} (${r.sub}) — ${r.badge.text} : ${r.url}`), ''] : []),
    ...(nl.ready.length ? ['Enfin prêts', ...nl.ready.map((r) => `- ${r.label} — ${r.sub} : ${r.url}`), ''] : []),
    ...(mf?.accords.length ? ['Vos accords du mois', ...mf.accords.map((a) => `- ${a.date} · ${a.dish} × ${a.wine}`), ''] : []),
    ...(mf?.couldHave.length ? ['Vous auriez pu…', ...mf.couldHave.map((c) => `- Le ${c.date}, avec ${c.dish} : ${c.wine}`), ''] : []),
    ...(mf?.forgotten.length ? ['D’ailleurs…', ...mf.forgotten.map((f) => `- Vous n’avez pas noté le ${f.wine} du ${f.date} (${f.dish}) : ${f.url}`), ''] : []),
    ...(nl.note ? ['Le mot du sommelier', nl.note.intro, ...nl.note.picks.map((p) => `- ${wineLabel(p.wine)} — ${p.reason}`), ''] : []),
    ...(nl.tastings.length ? ['Dégustations', ...nl.tastings.map((r) => `- ${r.label} ${r.sub}${r.rating ? ` — ${r.rating}` : ''}`), ''] : []),
    nl.appUrl,
  ].join('\n');
  const markdown = [
    `**Bilan** : ${md(statsLine(nl.stats))}`,
    nl.urgent.length ? `**À ouvrir en priorité**\n${nl.urgent.slice(0, 5).map((r) => `- [${md(r.label)}](${r.url}) — ${md(r.badge.text)}`).join('\n')}` : null,
    mf ? `**MenuFlow** : ${mf.accords.length} accord(s) · ${mf.forgotten.length} dégustation(s) à noter` : null,
    nl.note ? `**Le mot du sommelier**\n${md(truncate(nl.note.intro, 600))}` : null,
    `[Ouvrir la cave](${nl.appUrl})`,
  ].filter(Boolean).join('\n\n');
  return { title: nl.title, markdown, priority: 4, subject: nl.subject, text, html: renderNewsletterEmail(nl) };
};

const GROUPS = [
  { state: 'DEPASSEE', title: 'Apogée dépassée', color: C.wine },
  { state: 'SE_REFERME', title: 'Fenêtre qui se referme', color: '#92400e' },
  { state: 'PRET', title: 'Entrés en apogée', color: C.green },
];

export const renderAlert = (transitions, { appUrl }) => {
  const n = transitions.length;
  const title = n === 1 ? '1 vin change d’état' : `${n} vins changent d’état`;
  const groups = GROUPS
    .map((g) => ({ ...g, items: transitions.filter((t) => t.to === g.state) }))
    .filter((g) => g.items.length > 0);
  const lineOf = (t) => ({ label: wineLabel(t.wine), detail: `${stateLabel(t)} · ${t.wine.inventoryCount} bt`, url: `${appUrl}/wine/${t.wine.id}` });
  const markdown = groups
    .map((g) => `**${g.title}**\n${g.items.map(lineOf).map((l) => `- [${md(l.label)}](${l.url}) — ${md(l.detail)}`).join('\n')}`)
    .join('\n\n');
  const text = groups
    .map((g) => `${g.title}\n${g.items.map(lineOf).map((l) => `- ${l.label} — ${l.detail} : ${l.url}`).join('\n')}`)
    .join('\n\n');
  const body = `<tr><td class="pad" style="padding:28px 28px 8px;">${mono('◌ VINOFLOW · ALERTE')}
<h1 style="margin:10px 0 0;font-family:${F.serif};font-weight:400;font-size:28px;line-height:1.2;color:${C.ink};">${esc(title)}</h1></td></tr>
${groups.map((g) => card(`${mono(`● ${g.title.toUpperCase()}`, g.color)}
<div style="margin-top:8px;font-family:${F.sans};font-size:13px;color:${C.body};line-height:1.8;">
${g.items.map(lineOf).map((l) => `${wineLink(l.label, l.url)} <span style="color:${C.muted};font-size:12px;">· ${esc(l.detail)}</span>`).join('<br>\n')}</div>`)).join('\n')}`;
  return {
    title,
    markdown,
    priority: transitions.some((t) => t.to === 'DEPASSEE') ? 5 : 4,
    subject: `VinoFlow — ${title}`,
    text,
    html: cockpitShell({ title: `VinoFlow — ${title}`, preheader: title, label: 'ALERTE', body, appUrl }),
  };
};

export const testMessage = ({ appUrl }) => {
  const title = 'VinoFlow — test de notification';
  const message = 'Si vous lisez ceci, les notifications VinoFlow arrivent bien sur ce canal.';
  const body = `<tr><td class="pad" style="padding:28px 28px 8px;">${mono('◌ VINOFLOW · TEST')}
<p style="margin:10px 0 0;font-family:${F.sans};font-size:14px;line-height:1.6;color:${C.soft};">${esc(message)}</p></td></tr>`;
  return {
    title, markdown: message, priority: 4, subject: title, text: message,
    html: cockpitShell({ title, preheader: message, label: 'TEST', body, appUrl }),
  };
};
```

Note : `renderMailHtml` (`mailService.js`) reste inchangé (emails d'authentification).

- [ ] **Step 5: Run tests** — `cd backend && npx vitest run tests/unit/notifications.render.test.js` → PASS. Puis comparer visuellement : écrire un script jetable dans le scratchpad qui appelle `renderNewsletterEmail` avec les données de l'exemple, ouvrir le fichier produit dans le navigateur intégré à côté de `newsletter-exemple.html` (bureau et 375 px) ; corriger les écarts.

- [ ] **Step 6: Commit**

```bash
git add backend/src/notifications/format.js backend/src/notifications/render.js backend/tests/unit/notifications.render.test.js
git commit -m "Notifications (5) : gabarit Cockpit pour la newsletter, les alertes et le message de test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Newsletter (données, composition) et mot du sommelier IA

**Files:**
- Create: `backend/src/notifications/sommelierNote.js`, `backend/src/notifications/newsletter.js`
- Modify: `backend/src/services/aiService.js` (`TASK_DEFAULTS`), `backend/src/sommelier/schemas.js`, `.env.example`
- Test: `backend/tests/unit/notifications.newsletter.test.js`

**Interfaces:**
- Consumes: `classifyWine`, `rank` (tâche 2) ; `wineLabel`, `wineName`, `stateLabel`, `windowBadge`, `periodTitle`, `dayMonth` (tâche 5) ; `periodStart`, `zonedParts`, `notifyTz` (tâche 2) ; `loadInventory` ; `generateJson`, `isProviderConfigured` ; `APP_URL`.
- Produces:
  - `NEWSLETTER_NOTE_SCHEMA`
  - `isNoteAvailable(): boolean` (aussi utilisé par la passerelle MenuFlow pour savoir si l'IA est disponible)
  - `buildNoteInput(inventory, { settings, now, tz, accords = [] })`, `sanitizeNote(raw, winesById)`, `generateSommelierNote({ inventory, settings, now, tz, accords = [], timeoutMs = 30000 })`
  - `loadLocations(): Promise<Map<wineId, string>>` (réutilisé par la passerelle, tâche 14)
  - `collectNewsletterData({ since }): Promise<{ inventory, journal, spending, cellarValue, tastings, locations }>`
  - `buildNewsletter(data, { settings, now, tz, since, appUrl, note, menuflow = null }): nl` (forme décrite en tâche 5)
  - `composeNewsletter(settings, { now, tz, withAi }): Promise<nl>` — la tâche 15 y ajoute les rubriques MenuFlow.

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/notifications.newsletter.test.js` :

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/aiService.js', () => ({
  generateJson: vi.fn(),
  isProviderConfigured: vi.fn(() => true),
}));

const { generateJson, isProviderConfigured } = await import('../../src/services/aiService.js');
const { buildNewsletter } = await import('../../src/notifications/newsletter.js');
const { sanitizeNote, buildNoteInput, generateSommelierNote } = await import('../../src/notifications/sommelierNote.js');

const TZ = 'Europe/Paris';
const NOW = new Date('2026-11-01T08:00:00Z');
const SINCE = new Date('2026-10-01T07:00:00Z');
const APP = 'https://cave.example.com';
const settings = { horizonMonths: 12, newsletterFrequency: 'monthly' };
const w = (id, extra = {}) => ({ id, name: `Vin ${id}`, vintage: 2015, type: 'RED', region: 'Bordeaux', inventoryCount: 2, ...extra });

const data = (inventory, extra = {}) => ({
  inventory,
  journal: [{ type: 'IN', quantity: 6 }, { type: 'OUT', quantity: 1 }, { type: 'GIFT', quantity: 1 }, { type: 'MOVE', quantity: 3 }],
  spending: { count: 6, total: 90 },
  cellarValue: 1234.5,
  tastings: [{ wineId: 'p', name: 'Vin p', vintage: 2015, date: '2026-10-20T18:00:00Z', overallRating: 17 }],
  locations: new Map([['d', 'Cave du bas']]),
  ...extra,
});
const build = (d, extra = {}) => buildNewsletter(d, { settings, now: NOW, tz: TZ, since: SINCE, appUrl: APP, note: null, ...extra });

describe('buildNewsletter', () => {
  const inventory = [
    w('d', { peakStart: 2010, peakEnd: 2020 }),            // DEPASSEE
    w('f', { peakStart: 2020, peakEnd: 2026 }),            // SE_REFERME, 2 mois
    w('n', { peakStart: 2026, peakEnd: 2032 }),            // PRET, entré cette année
    w('p', { peakStart: 2022, peakEnd: 2032 }),            // PRET depuis longtemps
    w('g', { peakStart: 2030, peakEnd: 2040 }),            // GARDE
    w('z', { inventoryCount: 0, peakStart: 2010, peakEnd: 2020 }), // épuisé
  ];

  it('en-tête, chiffres clés et blocs', () => {
    const nl = build(data(inventory));
    expect(nl.subject).toBe('VinoFlow — votre cave, novembre 2026');
    expect(nl.title).toBe('Votre cave — novembre 2026');
    expect(nl.periodLabel).toBe('novembre 2026');
    expect(nl.heading).toEqual({ lead: 'Que boire', accent: 'ce mois-ci' });
    expect(nl.intro).toContain('01/10');
    expect(nl.stats).toEqual({ bottlesInCellar: 10, winesInCellar: 5, bottlesIn: 6, spent: 90, bottlesOut: 2, gifts: 1, cellarValue: 1234.5 });
    expect(nl.urgent.map((r) => r.url)).toEqual([`${APP}/wine/d`, `${APP}/wine/f`]);
    expect(nl.urgent[0]).toMatchObject({ label: 'Vin d', sub: 'Bordeaux · 2015', location: 'Cave du bas', qty: 2, badge: { text: 'PASSÉ', tone: 'passe' } });
    expect(nl.urgent[1].badge).toEqual({ text: '2 MOIS', tone: 'bientot' });
    expect(nl.ready).toEqual([{ label: 'Vin n', sub: 'Bordeaux 2015 · 2 bt · apogée 2026–2032', url: `${APP}/wine/n` }]);
    expect(nl.tastings).toEqual([{ label: 'Vin p', sub: '2015 · 20/10', rating: '17/20', url: `${APP}/wine/p` }]);
    expect(nl.menuflow).toBeNull();
  });

  it('hebdo : « cette semaine »', () => {
    expect(build(data(inventory), { settings: { ...settings, newsletterFrequency: 'weekly' } }).heading.accent).toBe('cette semaine');
  });

  it('estimée signalée dans le sous-titre', () => {
    const nl = build(data([w('e', { vintage: 2008 })])); // naïf RED 2008 → 2013-2018 : DEPASSEE estimée
    expect(nl.urgent[0].sub).toBe('Bordeaux · 2008 · estimée');
  });

  it('au plus 10 vins à ouvrir', () => {
    const many = Array.from({ length: 15 }, (_, i) => w(`x${i}`, { peakStart: 2010, peakEnd: 2020 }));
    expect(build(data(many)).urgent).toHaveLength(10);
  });

  it('cave vide : bilan à zéro, aucun bloc, pas d’erreur', () => {
    const nl = build({ inventory: [], journal: [], spending: { count: 0, total: 0 }, cellarValue: 0, tastings: [], locations: new Map() });
    expect(nl.urgent).toEqual([]);
    expect(nl.ready).toEqual([]);
    expect(nl.tastings).toEqual([]);
    expect(nl.stats).toEqual({ bottlesInCellar: 0, winesInCellar: 0, bottlesIn: 0, spent: 0, bottlesOut: 0, gifts: 0, cellarValue: 0 });
  });
});

describe('mot du sommelier', () => {
  const inventory = [w('a', { peakStart: 2010, peakEnd: 2020 }), w('b', { peakStart: 2024, peakEnd: 2030 })];
  const byId = new Map(inventory.map((x) => [x.id, x]));

  beforeEach(() => { generateJson.mockReset(); isProviderConfigured.mockReturnValue(true); });

  it('sanitizeNote écarte les vins inventés et limite à 3', () => {
    const note = sanitizeNote({
      intro: ' Bonjour ',
      picks: [{ wineId: 'a', reason: 'r1' }, { wineId: 'zzz', reason: 'inventé' }, { wineId: 'b', reason: 'r2' }, { wineId: 'a', reason: 'r3' }, { wineId: 'b', reason: 'r4' }],
      seasonalPairing: null, closing: 'Santé',
    }, byId);
    expect(note.intro).toBe('Bonjour');
    expect(note.picks.map((p) => [p.wine.id, p.reason])).toEqual([['a', 'r1'], ['b', 'r2'], ['a', 'r3']]);
    expect(note.closing).toBe('Santé');
    expect(sanitizeNote({ picks: [] }, byId)).toBeNull();
  });

  it('buildNoteInput : vins classés, plus urgents d’abord, accords du mois', () => {
    const input = buildNoteInput(inventory, { settings, now: NOW, tz: TZ, accords: [{ dish: 'Poulet', wine: 'Vin a 2015' }] });
    expect(input.mois).toBe('novembre 2026');
    expect(input.vins.map((v) => v.id)).toEqual(['a', 'b']);
    expect(input.vins[0]).toMatchObject({ etat: 'DEPASSEE', apogee: '2010-2020', stock: 2 });
    expect(input.accordsDuMois).toEqual(['Poulet × Vin a 2015']);
  });

  it('generateSommelierNote : sortie validée', async () => {
    generateJson.mockResolvedValue({ intro: 'Ouvrez Vin a', picks: [{ wineId: 'a', reason: 'avant qu’il ne décline' }], seasonalPairing: 'Gibier', closing: null });
    const note = await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ });
    expect(generateJson).toHaveBeenCalledWith('newsletter', expect.objectContaining({ schema: expect.any(Object) }));
    expect(note.picks[0].wine.id).toBe('a');
  });

  it('sans IA, en erreur ou trop lente : null, sans lever', async () => {
    isProviderConfigured.mockReturnValue(false);
    expect(await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ })).toBeNull();
    isProviderConfigured.mockReturnValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    generateJson.mockRejectedValue(new Error('boom'));
    expect(await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ })).toBeNull();
    generateJson.mockImplementation(() => new Promise(() => {}));
    expect(await generateSommelierNote({ inventory, settings, now: NOW, tz: TZ, timeoutMs: 20 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd backend && npx vitest run tests/unit/notifications.newsletter.test.js` → FAIL.

- [ ] **Step 3: Add the schema** — à la fin de `backend/src/sommelier/schemas.js` :

```js
// Newsletter : « mot du sommelier » (vins choisis parmi la liste fournie).
export const NEWSLETTER_NOTE_SCHEMA = obj({
  intro: str,
  picks: arr(obj({ wineId: str, reason: str })),
  seasonalPairing: nullable(str),
  closing: nullable(str),
});
```

- [ ] **Step 4: Add the AI task** — dans `TASK_DEFAULTS` de `backend/src/services/aiService.js`, avant `embedding` :

```js
  // Newsletter : « mot du sommelier » à partir des vins en cave (1 appel par envoi).
  newsletter: {
    provider: 'claude', model: MODELS.CLAUDE_SONNET, maxTokens: 1500, effort: 'low',
    fallback: { provider: 'gemini', model: MODELS.GEMINI_FLASH },
  },
```

et dans `.env.example`, à côté des autres surcharges `VINOFLOW_*` (vérifier que `envKey('newsletter')` donne `NEWSLETTER`) :

```
# VINOFLOW_MODEL_NEWSLETTER=claude-sonnet-5-5
# VINOFLOW_MAX_TOKENS_NEWSLETTER=1500
```

- [ ] **Step 5: Implement `backend/src/notifications/sommelierNote.js`**

```js
// « Le mot du sommelier » de la newsletter : court éditorial rédigé par l'IA à
// partir des seuls vins de la cave. Facultatif : sans clé, en erreur ou trop
// lent, la newsletter part sans.
import { generateJson, isProviderConfigured } from '../services/aiService.js';
import { NEWSLETTER_NOTE_SCHEMA } from '../sommelier/schemas.js';
import { classifyWine, rank } from './classify.js';
import { wineLabel, periodTitle } from './format.js';

const SYSTEM = `Tu es le sommelier d'une cave particulière. Tu rédiges en français un court
éditorial pour la newsletter de la cave : quoi ouvrir ce mois-ci et pourquoi, un accord de saison
avec ce qui est en cave. Ton chaleureux et précis, 80 mots au plus pour l'intro, sans guillemets.
Règles : ne cite QUE des vins de la liste fournie, par leur id dans "picks" (3 au plus) ;
privilégie les vins dont l'état est DEPASSEE ou SE_REFERME ; si "accordsDuMois" n'est pas vide,
tu peux y faire une brève allusion ; n'invente ni vin, ni note, ni prix.`;

export const isNoteAvailable = () => isProviderConfigured('claude') || isProviderConfigured('gemini');

export const buildNoteInput = (inventory, { settings, now, tz, accords = [] }) => {
  const rows = inventory
    .map((wine) => ({ wine, c: classifyWine(wine, { horizonMonths: settings.horizonMonths, now, tz }) }))
    .filter(({ c }) => c)
    .sort((a, b) => rank(b.c.state) - rank(a.c.state) || a.c.monthsLeft - b.c.monthsLeft)
    .slice(0, 80);
  return {
    mois: periodTitle({ newsletterFrequency: 'monthly' }, now, tz),
    vins: rows.map(({ wine, c }) => ({
      id: wine.id,
      nom: wineLabel(wine),
      type: wine.type || null,
      region: wine.region || null,
      etat: c.state,
      apogee: `${c.peakStart}-${c.peakEnd}`,
      stock: wine.inventoryCount,
    })),
    accordsDuMois: accords.map((a) => `${a.dish} × ${a.wine}`),
  };
};

export const sanitizeNote = (raw, winesById) => {
  if (!raw || typeof raw.intro !== 'string' || !raw.intro.trim()) return null;
  const picks = (Array.isArray(raw.picks) ? raw.picks : [])
    .filter((p) => p && winesById.has(p.wineId))
    .slice(0, 3)
    .map((p) => ({ wine: winesById.get(p.wineId), reason: String(p.reason || '').trim() }));
  return {
    intro: raw.intro.trim(),
    picks,
    seasonalPairing: raw.seasonalPairing ? String(raw.seasonalPairing).trim() : null,
    closing: raw.closing ? String(raw.closing).trim() : null,
  };
};

export const generateSommelierNote = async ({ inventory, settings, now, tz, accords = [], timeoutMs = 30_000 }) => {
  if (!isNoteAvailable()) return null;
  const input = buildNoteInput(inventory, { settings, now, tz, accords });
  if (input.vins.length === 0) return null;
  let timer;
  try {
    const raw = await Promise.race([
      generateJson('newsletter', { system: SYSTEM, user: JSON.stringify(input), schema: NEWSLETTER_NOTE_SCHEMA }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('délai dépassé')), timeoutMs); }),
    ]);
    return sanitizeNote(raw, new Map(inventory.map((w) => [w.id, w])));
  } catch (error) {
    console.warn('[notifications] mot du sommelier indisponible :', error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
};
```

- [ ] **Step 6: Implement `backend/src/notifications/newsletter.js`**

```js
// Newsletter de la cave : collecte (base), assemblage (pur) et composition.
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { classifyWine } from './classify.js';
import { wineName, windowBadge, periodTitle, dayMonth } from './format.js';
import { periodStart, zonedParts, notifyTz } from './schedule.js';
import { generateSommelierNote } from './sommelierNote.js';

/** Emplacement lisible par vin en stock : nom du casier, ou libellé libre. */
export const loadLocations = async () => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (b.wine_id) b.wine_id,
       COALESCE(r.name, CASE WHEN jsonb_typeof(b.location) = 'string' THEN b.location #>> '{}' END) AS label
     FROM bottles b LEFT JOIN racks r ON r.id::text = b.location->>'rackId'
     WHERE b.is_consumed = false
     ORDER BY b.wine_id, r.name NULLS LAST`
  );
  return new Map(rows.filter((r) => r.label).map((r) => [r.wine_id, r.label]));
};

export const collectNewsletterData = async ({ since }) => {
  const [inventory, journal, spending, value, tastings, locations] = await Promise.all([
    loadInventory(),
    pool.query('SELECT type, COALESCE(quantity, 1)::int AS quantity FROM journal WHERE date >= $1', [since]),
    pool.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(purchase_price), 0)::float AS total FROM bottles WHERE purchase_date >= $1', [since]),
    pool.query('SELECT COALESCE(SUM(purchase_price), 0)::float AS total FROM bottles WHERE is_consumed = false'),
    pool.query(
      `SELECT t.wine_id, t.date, t.overall_rating, w.name, w.cuvee, w.vintage
       FROM tasting_notes t JOIN wines w ON w.id = t.wine_id
       WHERE t.date >= $1 ORDER BY t.date`,
      [since]
    ),
    loadLocations(),
  ]);
  return {
    inventory,
    journal: journal.rows,
    spending: spending.rows[0],
    cellarValue: value.rows[0].total,
    tastings: convertKeysToCamelCase(tastings.rows),
    locations,
  };
};

const sumJournal = (journal, types) =>
  journal.filter((j) => types.includes(j.type)).reduce((s, j) => s + Number(j.quantity || 1), 0);

export const buildNewsletter = (data, { settings, now, tz = notifyTz(), since, appUrl, note, menuflow = null }) => {
  const { year } = zonedParts(now, tz);
  const weekly = settings.newsletterFrequency === 'weekly';
  const classified = data.inventory
    .map((wine) => ({ wine, c: classifyWine(wine, { horizonMonths: settings.horizonMonths, now, tz }) }))
    .filter(({ c }) => c);
  const urgent = classified
    .filter(({ c }) => c.state === 'DEPASSEE' || c.state === 'SE_REFERME')
    .sort((a, b) => a.c.monthsLeft - b.c.monthsLeft)
    .slice(0, 10)
    .map(({ wine, c }) => ({
      label: wineName(wine),
      sub: [wine.region, wine.vintage, c.estimated ? 'estimée' : null].filter(Boolean).join(' · '),
      location: data.locations.get(wine.id) || null,
      qty: wine.inventoryCount,
      badge: windowBadge(c),
      url: `${appUrl}/wine/${wine.id}`,
    }));
  const ready = classified
    .filter(({ c }) => c.state === 'PRET' && c.peakStart === year)
    .map(({ wine, c }) => ({
      label: wineName(wine),
      sub: `${[wine.region, wine.vintage].filter(Boolean).join(' ')} · ${wine.inventoryCount} bt · apogée ${c.peakStart}–${c.peakEnd}`,
      url: `${appUrl}/wine/${wine.id}`,
    }));
  const tastings = data.tastings.map((t) => ({
    label: wineName(t),
    sub: [t.vintage, dayMonth(t.date, tz)].filter(Boolean).join(' · '),
    rating: t.overallRating != null ? `${Number(t.overallRating)}/20` : null,
    url: `${appUrl}/wine/${t.wineId}`,
  }));
  const period = periodTitle(settings, now, tz);
  const inStock = data.inventory.filter((w) => (w.inventoryCount || 0) > 0);
  return {
    subject: `VinoFlow — votre cave, ${period}`,
    title: `Votre cave — ${period}`,
    periodLabel: period,
    heading: { lead: 'Que boire', accent: weekly ? 'cette semaine' : 'ce mois-ci' },
    intro: `Votre cave depuis le ${dayMonth(since, tz)} : ce qui est entré, ce qui est parti, et les bouteilles qui n’attendront plus très longtemps.`,
    appUrl,
    stats: {
      bottlesInCellar: inStock.reduce((s, w) => s + w.inventoryCount, 0),
      winesInCellar: inStock.length,
      bottlesIn: sumJournal(data.journal, ['IN']),
      spent: Number(data.spending.total) || 0,
      bottlesOut: sumJournal(data.journal, ['OUT', 'GIFT']),
      gifts: sumJournal(data.journal, ['GIFT']),
      cellarValue: Number(data.cellarValue) || 0,
    },
    urgent,
    ready,
    tastings,
    menuflow,
    note,
  };
};

export const composeNewsletter = async (settings, { now = new Date(), tz = notifyTz(), withAi }) => {
  const since = periodStart(settings, now);
  const data = await collectNewsletterData({ since });
  const note = withAi ? await generateSommelierNote({ inventory: data.inventory, settings, now, tz }) : null;
  return buildNewsletter(data, { settings, now, tz, since, appUrl: APP_URL, note });
};
```

- [ ] **Step 7: Run tests** — `cd backend && npx vitest run tests/unit` → PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/notifications/sommelierNote.js backend/src/notifications/newsletter.js backend/src/services/aiService.js backend/src/sommelier/schemas.js .env.example backend/tests/unit/notifications.newsletter.test.js
git commit -m "Notifications (6) : newsletter de la cave et mot du sommelier (IA facultative)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Routes `/api/notifications/*` et limiteur

**Files:**
- Create: `backend/src/routes/notifications.js`
- Modify: `backend/src/middleware/rateLimits.js`, `backend/src/app.js`
- Test: `backend/tests/api/notifications.test.js`

**Interfaces:**
- Consumes: `store.js`, `channels.js` (`availableChannels`, `deliver`), `render.js` (`testMessage`, `renderNewsletter`), `newsletter.js` (`composeNewsletter`), `sommelierNote.js` (`isNoteAvailable`), `isMailConfigured`.
- Produces (JSON) :
  - `GET /api/notifications/settings` → `{ ...publicSettings, email, mailConfigured, aiConfigured, recent }`
  - `PUT /api/notifications/settings` → même forme ; 400 `{ error }`
  - `POST /api/notifications/test` `{ channel }` → `{ channel, ok, error? }` ; 400 si canal inconnu ou Gotify incomplet
  - `GET /api/notifications/newsletter/preview[?ai=1]` → `{ subject, html, markdown }`
  - `POST /api/notifications/newsletter/send-now` → `{ results }` ; 400 si aucun canal
  - `notifyLimiter` (10 / 15 min / utilisateur) sur `test`, `preview?ai=1`, `send-now`

- [ ] **Step 1: Write the failing test** — `backend/tests/api/notifications.test.js` :

```js
import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('API notifications', () => {
  let client;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => pool.end());

  it('authentification requise', async () => {
    expect((await api().get('/api/notifications/settings')).status).toBe(401);
  });

  it('valeurs par défaut sans ligne en base', async () => {
    const res = await client.get('/api/notifications/settings');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'admin@test.fr', emailEnabled: false, gotifyEnabled: false, gotifyTokenSet: false,
      newsletterFrequency: 'monthly', newsletterHour: 9, horizonMonths: 12,
      mailConfigured: false, aiConfigured: false, recent: [],
    });
  });

  it('enregistre, masque le jeton, le conserve si non retapé, l’efface avec null', async () => {
    const saved = await client.put('/api/notifications/settings', { gotifyEnabled: true, gotifyUrl: 'https://push.test/', gotifyToken: 'secret' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ gotifyEnabled: true, gotifyUrl: 'https://push.test', gotifyTokenSet: true });
    expect(JSON.stringify(saved.body)).not.toContain('secret');

    const kept = await client.put('/api/notifications/settings', { horizonMonths: 6, gotifyToken: '' });
    expect(kept.body).toMatchObject({ horizonMonths: 6, gotifyTokenSet: true });

    const cleared = await client.put('/api/notifications/settings', { gotifyToken: null });
    expect(cleared.body.gotifyTokenSet).toBe(false);
  });

  it('400 sur valeur invalide, rien n’est enregistré', async () => {
    const res = await client.put('/api/notifications/settings', { newsletterHour: 25, horizonMonths: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('newsletterHour');
    expect((await client.get('/api/notifications/settings')).body.horizonMonths).toBe(12);
  });

  it('test Gotify : envoi et journal', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await client.put('/api/notifications/settings', { gotifyUrl: 'http://gotify.test', gotifyToken: 'tok' });
    const res = await client.post('/api/notifications/test', { channel: 'gotify' });
    expect(res.body).toEqual({ channel: 'gotify', ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe('http://gotify.test/message');
    expect((await client.get('/api/notifications/settings')).body.recent[0]).toMatchObject({ kind: 'test', channel: 'gotify', ok: true });
  });

  it('test email sans Sweego : échec explicite', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await client.post('/api/notifications/test', { channel: 'email' });
    expect(res.body).toEqual({ channel: 'email', ok: false, error: "envoi d'email non configuré sur le serveur" });
  });

  it('test : 400 si canal inconnu ou Gotify incomplet', async () => {
    expect((await client.post('/api/notifications/test', { channel: 'sms' })).status).toBe(400);
    expect((await client.post('/api/notifications/test', { channel: 'gotify' })).status).toBe(400);
  });

  it('aperçu de la newsletter sans IA', async () => {
    const res = await client.get('/api/notifications/newsletter/preview');
    expect(res.status).toBe(200);
    expect(res.body.subject).toMatch(/^VinoFlow — votre cave, /);
    expect(res.body.html).toContain('<!doctype html>');
    expect(res.body.markdown).toContain('**Bilan**');
  });

  it('envoyer maintenant : 400 sans canal, sinon envoi sans toucher à la date', async () => {
    expect((await client.post('/api/notifications/newsletter/send-now', {})).status).toBe(400);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await client.put('/api/notifications/settings', { gotifyEnabled: true, gotifyUrl: 'http://gotify.test', gotifyToken: 'tok', newsletterAi: false });
    const before = (await pool.query('SELECT last_newsletter_at FROM notification_settings')).rows[0].last_newsletter_at;
    const res = await client.post('/api/notifications/newsletter/send-now', {});
    expect(res.body.results).toEqual([{ channel: 'gotify', ok: true }]);
    const after = (await pool.query('SELECT last_newsletter_at FROM notification_settings')).rows[0].last_newsletter_at;
    expect(after).toEqual(before);
  });

  it('limiteur : 11e test refusé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await client.put('/api/notifications/settings', { gotifyUrl: 'http://gotify.test', gotifyToken: 'tok' });
    for (let i = 0; i < 10; i++) await client.post('/api/notifications/test', { channel: 'gotify' });
    expect((await client.post('/api/notifications/test', { channel: 'gotify' })).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd backend && TEST_DATABASE_URL=… npx vitest run tests/api/notifications.test.js` → FAIL (404).

- [ ] **Step 3: Add the limiter** — `backend/src/middleware/rateLimits.js` : ajouter `notify: new MemoryStore()` à `stores`, puis :

```js
// Notifications (test, aperçu IA, envoi immédiat) : par utilisateur, pour éviter
// de spammer Gotify ou la boîte mail.
export const notifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: stores.notify,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req.ip),
  handler: rateLimitHandler,
});
```

- [ ] **Step 4: Implement `backend/src/routes/notifications.js`**

```js
// Réglages des notifications du compte connecté, test d'un canal, aperçu et
// envoi immédiat de la newsletter.
import { Router } from 'express';
import { isMailConfigured } from '../services/mailService.js';
import { notifyLimiter } from '../middleware/rateLimits.js';
import { getSettings, saveSettings, validateSettingsPatch, publicSettings, recentLog, logDeliveries } from '../notifications/store.js';
import { availableChannels, deliver } from '../notifications/channels.js';
import { renderNewsletter, testMessage } from '../notifications/render.js';
import { composeNewsletter } from '../notifications/newsletter.js';
import { isNoteAvailable } from '../notifications/sommelierNote.js';
import { APP_URL } from '../config.js';

const router = Router();

const settingsResponse = async (req, settings) => ({
  ...publicSettings(settings),
  email: req.user.email,
  mailConfigured: isMailConfigured(),
  aiConfigured: isNoteAvailable(),
  recent: await recentLog(req.user.userId),
});

router.get('/notifications/settings', async (req, res) => {
  try {
    res.json(await settingsResponse(req, await getSettings(req.user.userId)));
  } catch (error) {
    console.error('notifications settings error:', error);
    res.status(500).json({ error: 'Lecture des réglages impossible' });
  }
});

router.put('/notifications/settings', async (req, res) => {
  const { patch, errors } = validateSettingsPatch(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join(' ; ') });
  try {
    res.json(await settingsResponse(req, await saveSettings(req.user.userId, patch)));
  } catch (error) {
    console.error('notifications save error:', error);
    res.status(500).json({ error: 'Enregistrement des réglages impossible' });
  }
});

router.post('/notifications/test', notifyLimiter, async (req, res) => {
  const { channel } = req.body || {};
  if (!['gotify', 'email'].includes(channel)) return res.status(400).json({ error: 'channel doit valoir gotify ou email' });
  try {
    const settings = await getSettings(req.user.userId);
    if (channel === 'gotify' && (!settings.gotifyUrl || !settings.gotifyToken)) {
      return res.status(400).json({ error: 'Renseignez et enregistrez l’URL et le jeton Gotify' });
    }
    const message = testMessage({ appUrl: APP_URL });
    const results = await deliver([channel], { settings, email: req.user.email, message });
    await logDeliveries(req.user.userId, 'test', results, message.title);
    res.json(results[0]);
  } catch (error) {
    console.error('notifications test error:', error);
    res.status(500).json({ error: 'Test impossible' });
  }
});

const limitWhenAi = (req, res, next) => (req.query.ai === '1' ? notifyLimiter(req, res, next) : next());

router.get('/notifications/newsletter/preview', limitWhenAi, async (req, res) => {
  try {
    const settings = await getSettings(req.user.userId);
    const message = renderNewsletter(await composeNewsletter(settings, { withAi: req.query.ai === '1' }));
    res.json({ subject: message.subject, html: message.html, markdown: message.markdown });
  } catch (error) {
    console.error('newsletter preview error:', error);
    res.status(500).json({ error: 'Aperçu impossible' });
  }
});

router.post('/notifications/newsletter/send-now', notifyLimiter, async (req, res) => {
  try {
    const settings = await getSettings(req.user.userId);
    const channels = availableChannels(settings);
    if (channels.length === 0) return res.status(400).json({ error: 'Aucun canal activé et configuré' });
    const message = renderNewsletter(await composeNewsletter(settings, { withAi: settings.newsletterAi }));
    const results = await deliver(channels, { settings, email: req.user.email, message });
    await logDeliveries(req.user.userId, 'newsletter', results, message.title);
    res.json({ results });
  } catch (error) {
    console.error('newsletter send error:', error);
    res.status(500).json({ error: 'Envoi impossible' });
  }
});

export default router;
```

- [ ] **Step 5: Mount the router** — `backend/src/app.js` : `import notificationsRouter from './routes/notifications.js';` et, après `app.use('/api', importRouter);` : `app.use('/api', notificationsRouter);`

- [ ] **Step 6: Run tests** — `cd backend && TEST_DATABASE_URL=… npx vitest run tests/api` → PASS ; sans base : `npx vitest run` et `node --check src/app.js`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/notifications.js backend/src/middleware/rateLimits.js backend/src/app.js backend/tests/api/notifications.test.js
git commit -m "Notifications (7) : API des réglages, test de canal, aperçu et envoi de la newsletter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Planificateur

**Files:**
- Create: `backend/src/notifications/scheduler.js`
- Modify: `backend/src/server.js`, `docker-compose.yml`, `.env.example`
- Test: `backend/tests/api/notifications.scheduler.test.js` (base de test)

**Interfaces:**
- Consumes: routes de réglages (tâche 7) pour les tests ; tâches 2 à 6 (`detectTransitions`, `isNewsletterDue`, `notifyTz`, `availableChannels`, `deliver`, `renderAlert`, `renderNewsletter`, `composeNewsletter`, toutes les fonctions de `store.js`), `loadInventory`, `APP_URL`.
- Produces:
  - `runNotificationTick({ now = new Date(), tz = notifyTz() } = {}): Promise<{ skipped?: true, users?: number }>`
  - `startNotificationScheduler(): void`

- [ ] **Step 1: Write the failing test** — `backend/tests/api/notifications.scheduler.test.js` :

```js
import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';
import { runNotificationTick } from '../../src/notifications/scheduler.js';

describe.skipIf(!hasDb)('planificateur de notifications', () => {
  const NOW = new Date('2026-10-05T10:00:00Z');
  let client;
  let userId;
  let fetchMock;

  const gotifyCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('http://gotify.test'));
  const addWine = async (name, peakStart, peakEnd) => {
    const { rows } = await pool.query(
      `INSERT INTO wines (name, vintage, type, peak_start, peak_end) VALUES ($1, 2015, 'RED', $2, $3) RETURNING id`,
      [name, peakStart, peakEnd]
    );
    await pool.query('INSERT INTO bottles (wine_id) VALUES ($1)', [rows[0].id]);
    return rows[0].id;
  };
  const stateOf = async (wineId) =>
    (await pool.query('SELECT state FROM wine_alert_state WHERE user_id = $1 AND wine_id = $2', [userId, wineId])).rows[0]?.state;

  beforeEach(async () => {
    await resetData();
    const session = await bootstrapUser();
    client = authed(session.access_token);
    userId = session.user.id;
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await client.put('/api/notifications/settings', {
      gotifyEnabled: true, gotifyUrl: 'http://gotify.test', gotifyToken: 'tok', newsletterFrequency: 'off',
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => pool.end());

  it('premier passage silencieux, puis une seule alerte par transition', async () => {
    const id = await addWine('Alpha', 2020, 2030); // PRET
    await runNotificationTick({ now: NOW });
    expect(gotifyCalls()).toHaveLength(0);
    expect(await stateOf(id)).toBe('PRET');

    await pool.query('UPDATE wines SET peak_end = 2026 WHERE id = $1', [id]); // → SE_REFERME
    await runNotificationTick({ now: NOW });
    expect(gotifyCalls()).toHaveLength(1);
    expect(JSON.parse(gotifyCalls()[0][1].body).title).toBe('1 vin change d’état');
    expect(await stateOf(id)).toBe('SE_REFERME');

    await runNotificationTick({ now: NOW });
    expect(gotifyCalls()).toHaveLength(1); // aucun doublon
  });

  it('échec Gotify : état non écrit, nouvel essai au tick suivant', async () => {
    await runNotificationTick({ now: NOW }); // amorçage (cave vide)
    const id = await addWine('Bravo', 2010, 2015); // nouveau vin DEPASSEE
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await runNotificationTick({ now: NOW });
    expect(await stateOf(id)).toBeUndefined();
    const log = await client.get('/api/notifications/settings');
    expect(log.body.recent[0]).toMatchObject({ kind: 'alert', channel: 'gotify', ok: false, error: 'Gotify a répondu 500' });

    await runNotificationTick({ now: NOW });
    expect(await stateOf(id)).toBe('DEPASSEE');
    expect(gotifyCalls()).toHaveLength(2);
  });

  it('newsletter mensuelle : envoyée une fois à l’échéance', async () => {
    await client.put('/api/notifications/settings', { newsletterFrequency: 'monthly', newsletterAi: false });
    await pool.query("UPDATE notification_settings SET last_newsletter_at = '2026-09-01T07:00:00Z', alerts_seeded_at = now() WHERE user_id = $1", [userId]);
    await addWine('Charlie', 2010, 2020);

    await runNotificationTick({ now: NOW });
    const newsletters = () => gotifyCalls().filter(([, init]) => JSON.parse(init.body).title.startsWith('Votre cave'));
    expect(newsletters()).toHaveLength(1);
    expect(JSON.parse(newsletters()[0][1].body).title).toBe('Votre cave — octobre 2026');

    await runNotificationTick({ now: NOW });
    expect(newsletters()).toHaveLength(1);
  });
});
```

(`bootstrapUser()` renvoie la session du signup : vérifier dans `routes/auth.js` que `user.id` y figure ; sinon lire l'id par `SELECT id FROM users WHERE email = 'admin@test.fr'`.)

- [ ] **Step 2: Run test to verify it fails** — avec base de test : `cd backend && TEST_DATABASE_URL=… npx vitest run tests/api/notifications.scheduler.test.js` → FAIL (module `scheduler.js` introuvable). Les routes de réglages (tâche 7) servent à préparer les données.

- [ ] **Step 3: Implement `backend/src/notifications/scheduler.js`**

```js
// Planificateur des notifications : toutes les NOTIFY_TICK_MINUTES (défaut 60),
// sous verrou consultatif Postgres (un seul backend à la fois), pour chaque
// compte ayant des réglages : alertes de changement d'état, puis newsletter
// si elle est due. Un état ou une newsletter n'est marqué envoyé qu'après au
// moins un envoi réussi : en cas de panne, on réessaie au tick suivant.
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { detectTransitions } from './classify.js';
import { isNewsletterDue, notifyTz } from './schedule.js';
import { availableChannels, deliver } from './channels.js';
import { renderAlert, renderNewsletter } from './render.js';
import { composeNewsletter } from './newsletter.js';
import {
  listAllSettings, loadAlertStates, applyAlertChanges, markNewsletterSent, logDeliveries, purgeOldLog,
} from './store.js';

const LOCK_KEY = 74_206_003;
let running = false;
let timer = null;

const processAlerts = async (settings, inventory, { now, tz }) => {
  const stored = await loadAlertStates(settings.userId);
  const { notify, upserts, deletes } = detectTransitions({ stored, wines: inventory, settings, now, tz });
  const seeded = !settings.alertsSeededAt;
  const channels = availableChannels(settings);
  if (notify.length > 0 && channels.length > 0) {
    const message = renderAlert(notify, { appUrl: APP_URL });
    const results = await deliver(channels, { settings, email: settings.email, message });
    await logDeliveries(settings.userId, 'alert', results, message.title);
    if (!results.some((r) => r.ok)) return; // on réessaiera au prochain tick
  }
  if (upserts.length > 0 || deletes.length > 0 || seeded) {
    await applyAlertChanges(settings.userId, { upserts, deletes, seeded });
  }
};

const processNewsletter = async (settings, { now, tz }) => {
  const channels = availableChannels(settings);
  if (channels.length === 0) return;
  const nl = await composeNewsletter(settings, { now, tz, withAi: settings.newsletterAi });
  const message = renderNewsletter(nl);
  const results = await deliver(channels, { settings, email: settings.email, message });
  await logDeliveries(settings.userId, 'newsletter', results, message.title);
  if (results.some((r) => r.ok)) await markNewsletterSent(settings.userId, now);
};

export const runNotificationTick = async ({ now = new Date(), tz = notifyTz() } = {}) => {
  if (running) return { skipped: true };
  running = true;
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!rows[0].ok) return { skipped: true };
    try {
      const all = await listAllSettings();
      if (all.length === 0) return { users: 0 };
      const inventory = await loadInventory();
      for (const settings of all) {
        try {
          await processAlerts(settings, inventory, { now, tz });
        } catch (error) {
          console.error(`[notifications] alertes de ${settings.email} :`, error.message);
        }
        try {
          if (isNewsletterDue(settings, now, tz)) await processNewsletter(settings, { now, tz });
        } catch (error) {
          console.error(`[notifications] newsletter de ${settings.email} :`, error.message);
        }
      }
      await purgeOldLog();
      return { users: all.length };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
    running = false;
  }
};

export const startNotificationScheduler = () => {
  if (process.env.NOTIFICATIONS_ENABLED === 'false' || timer) return;
  const minutes = Number(process.env.NOTIFY_TICK_MINUTES || 60);
  const tick = () => runNotificationTick().catch((error) => console.error('[notifications] tick :', error.message));
  setTimeout(tick, 60_000).unref?.();
  timer = setInterval(tick, minutes * 60_000);
  timer.unref?.();
  console.log(`🔔 Notifications : vérification toutes les ${minutes} min (fuseau ${notifyTz()})`);
};
```

- [ ] **Step 4: Wire `backend/src/server.js`** — importer `import { startNotificationScheduler } from './notifications/scheduler.js';` et, dans le callback de `app.listen`, après `startScheduler();` :

```js
  // Alertes « à boire avant » et newsletter (Gotify / email), réglées par compte.
  startNotificationScheduler();
```

- [ ] **Step 5: Document the variables** — `docker-compose.yml`, service backend, après `MAIL_FROM` :

```yaml
      # Notifications « à boire avant » et newsletter
      - NOTIFICATIONS_ENABLED=${NOTIFICATIONS_ENABLED:-true}
      - NOTIFY_TZ=${NOTIFY_TZ:-Europe/Paris}
      - NOTIFY_TICK_MINUTES=${NOTIFY_TICK_MINUTES:-60}
```

et `.env.example`, après le bloc Sweego :

```
# Notifications (alertes « à boire avant » + newsletter, réglées par compte dans Réglages)
# NOTIFICATIONS_ENABLED=true
# NOTIFY_TZ=Europe/Paris
# NOTIFY_TICK_MINUTES=60
```

Ajouter aussi `NOTIFICATIONS_ENABLED: 'false'` dans `env` de `backend/vitest.config.js` (le planificateur n'est pas démarré par `app.js`, mais cela documente l'intention).

- [ ] **Step 6: Run tests** — `cd backend && npx vitest run` (unitaires) et, avec base, `TEST_DATABASE_URL=… npx vitest run tests/api` → PASS ; `node --check src/server.js`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/notifications/scheduler.js backend/src/server.js docker-compose.yml .env.example backend/vitest.config.js backend/tests/api/notifications.scheduler.test.js
git commit -m "Notifications (8) : planificateur horaire sous verrou, sans doublon ni perte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Carte « Notifications » dans Réglages

**Files:**
- Create: `components/cockpit/NotificationSettings.tsx`
- Modify: `types.ts`, `services/storageService.ts`, `pages/Settings.tsx`

**Interfaces:**
- Consumes: API de la tâche 8 ; primitives `Button`, `Badge`, `Input`, `Select`, `Modal`, `MonoLabel`, `Skeleton` ; `useToast()` (`toast.success(msg)`, `toast.error(msg)`).
- Produces: `<NotificationSettings />` (sans props), monté dans une `Section` de `Settings.tsx`.

- [ ] **Step 1: Add the types** — à la fin de `types.ts` :

```ts
// ─── Notifications (alertes « à boire avant » + newsletter) ───
export type NotificationChannel = 'gotify' | 'email';
export type NewsletterFrequency = 'off' | 'weekly' | 'monthly';

export interface NotificationSettings {
  emailEnabled: boolean;
  gotifyEnabled: boolean;
  gotifyUrl: string | null;
  gotifyTokenSet: boolean;
  alertsEnabled: boolean;
  alertReady: boolean;
  alertClosing: boolean;
  alertPast: boolean;
  horizonMonths: number;
  newsletterFrequency: NewsletterFrequency;
  newsletterWeekday: number;
  newsletterHour: number;
  newsletterAi: boolean;
  lastNewsletterAt: string | null;
}

export interface NotificationLogEntry {
  kind: 'alert' | 'newsletter' | 'test';
  channel: NotificationChannel;
  ok: boolean;
  error: string | null;
  summary: string | null;
  sentAt: string;
}

export interface NotificationSettingsResponse extends NotificationSettings {
  email: string;
  mailConfigured: boolean;
  aiConfigured: boolean;
  recent: NotificationLogEntry[];
}

export type NotificationSettingsPatch = Partial<Omit<NotificationSettings, 'gotifyTokenSet' | 'lastNewsletterAt'>> & {
  gotifyToken?: string | null;
};

export interface NewsletterPreview { subject: string; html: string; markdown: string; }
```

- [ ] **Step 2: Add the API calls** — `services/storageService.ts` : compléter l'import de types (`NotificationSettingsResponse, NotificationSettingsPatch, NotificationChannel, NewsletterPreview`) puis, après `getCellarBudget` :

```ts
// --- NOTIFICATIONS ---

export const getNotificationSettings = async (): Promise<NotificationSettingsResponse> => {
  const response = await apiFetch(`${API_URL}/notifications/settings`, { headers: getHeaders() });
  return handleResponse(response);
};

export const saveNotificationSettings = async (patch: NotificationSettingsPatch): Promise<NotificationSettingsResponse> => {
  const response = await apiFetch(`${API_URL}/notifications/settings`, {
    method: 'PUT', headers: getHeaders(), body: JSON.stringify(patch),
  });
  return handleResponse(response);
};

export const sendTestNotification = async (channel: NotificationChannel): Promise<{ channel: NotificationChannel; ok: boolean; error?: string }> => {
  const response = await apiFetch(`${API_URL}/notifications/test`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ channel }),
  });
  return handleResponse(response);
};

export const previewNewsletter = async (withAi = false): Promise<NewsletterPreview> => {
  const response = await apiFetch(`${API_URL}/notifications/newsletter/preview${withAi ? '?ai=1' : ''}`, { headers: getHeaders() });
  return handleResponse(response);
};

export const sendNewsletterNow = async (): Promise<{ results: { channel: NotificationChannel; ok: boolean; error?: string }[] }> => {
  const response = await apiFetch(`${API_URL}/notifications/newsletter/send-now`, {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({}),
  });
  return handleResponse(response);
};
```

- [ ] **Step 3: Create `components/cockpit/NotificationSettings.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Bell, Eye, Loader2, Send } from 'lucide-react';
import { Badge, Button, Input, Modal, MonoLabel, Select, Skeleton } from './primitives';
import { useToast } from './feedback';
import {
  getNotificationSettings, saveNotificationSettings, sendTestNotification, previewNewsletter, sendNewsletterNow,
} from '../../services/storageService';
import { NotificationChannel, NotificationSettingsPatch, NotificationSettingsResponse, NewsletterPreview } from '../../types';

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const KIND_LABELS = { alert: 'Alerte', newsletter: 'Newsletter', test: 'Test' } as const;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erreur inconnue');

const Check: React.FC<{ label: React.ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }> = ({ label, checked, disabled, onChange }) => (
  <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-stone-400' : 'text-stone-800'}`}>
    <input type="checkbox" className="h-4 w-4 accent-wine-700" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

export const NotificationSettings: React.FC = () => {
  const toast = useToast();
  const [server, setServer] = useState<NotificationSettingsResponse | null>(null);
  const [draft, setDraft] = useState<NotificationSettingsPatch>({});
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<NotificationChannel | null>(null);
  const [preview, setPreview] = useState<NewsletterPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getNotificationSettings().then(setServer).catch((e) => toast.error('Réglages de notification indisponibles : ' + errMsg(e)));
  }, []);

  if (!server) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>;
  }

  const v = { ...server, ...draft };
  const set = (patch: NotificationSettingsPatch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = Object.keys(draft).length > 0 || token.trim() !== '';

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveNotificationSettings({ ...draft, ...(token.trim() ? { gotifyToken: token.trim() } : {}) });
      setServer(saved);
      setDraft({});
      setToken('');
      toast.success('Réglages de notification enregistrés');
    } catch (e) {
      toast.error("L'enregistrement a échoué : " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const test = async (channel: NotificationChannel) => {
    setTesting(channel);
    try {
      const r = await sendTestNotification(channel);
      if (r.ok) toast.success(channel === 'gotify' ? 'Message de test envoyé sur Gotify' : 'Email de test envoyé');
      else toast.error(`Échec du test : ${r.error}`);
      setServer(await getNotificationSettings());
    } catch (e) {
      toast.error('Test impossible : ' + errMsg(e));
    } finally {
      setTesting(null);
    }
  };

  const showPreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await previewNewsletter(v.newsletterAi && server.aiConfigured));
    } catch (e) {
      toast.error('Aperçu impossible : ' + errMsg(e));
    } finally {
      setPreviewing(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const { results } = await sendNewsletterNow();
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) toast.success('Newsletter envoyée');
      else toast.error(failed.map((r) => `${r.channel} : ${r.error}`).join(' · '));
      setServer(await getNotificationSettings());
    } catch (e) {
      toast.error("L'envoi a échoué : " + errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Canaux */}
      <div className="space-y-3">
        <MonoLabel>Canaux</MonoLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Check
            label={<>Email à <strong className="break-all">{server.email}</strong></>}
            checked={v.emailEnabled ?? false}
            disabled={!server.mailConfigured}
            onChange={(emailEnabled) => set({ emailEnabled })}
          />
          {!server.mailConfigured && <Badge tone="neutral">Envoi d'email non configuré sur le serveur</Badge>}
          <Button variant="ghost" size="sm" onClick={() => test('email')} disabled={!server.mailConfigured || testing !== null}>
            {testing === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Tester
          </Button>
        </div>
        <Check label="Gotify" checked={v.gotifyEnabled ?? false} onChange={(gotifyEnabled) => set({ gotifyEnabled })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="URL du serveur Gotify"
            placeholder="https://gotify.example.com"
            value={v.gotifyUrl ?? ''}
            onChange={(e) => set({ gotifyUrl: e.target.value })}
          />
          <Input
            label="Jeton d'application"
            type="password"
            autoComplete="off"
            placeholder={server.gotifyTokenSet ? '••• enregistré' : 'Jeton de l’application Gotify'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => test('gotify')} disabled={!server.gotifyUrl || !server.gotifyTokenSet || testing !== null}>
          {testing === 'gotify' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Tester Gotify
        </Button>
      </div>

      {/* Alertes */}
      <div className="space-y-3">
        <MonoLabel>Alertes immédiates</MonoLabel>
        <Check label="Prévenir quand un vin change d'état" checked={v.alertsEnabled ?? true} onChange={(alertsEnabled) => set({ alertsEnabled })} />
        <div className="pl-6 space-y-2">
          <Check label="Entrée en apogée" checked={v.alertReady ?? true} disabled={!v.alertsEnabled} onChange={(alertReady) => set({ alertReady })} />
          <Check label="Fenêtre qui se referme" checked={v.alertClosing ?? true} disabled={!v.alertsEnabled} onChange={(alertClosing) => set({ alertClosing })} />
          <Check label="Apogée dépassée" checked={v.alertPast ?? true} disabled={!v.alertsEnabled} onChange={(alertPast) => set({ alertPast })} />
        </div>
        <Input
          label="« À boire avant » : horizon en mois"
          type="number" min={1} max={60} wrapperClassName="max-w-[220px]"
          value={v.horizonMonths ?? 12}
          onChange={(e) => set({ horizonMonths: Number(e.target.value) })}
        />
      </div>

      {/* Newsletter */}
      <div className="space-y-3">
        <MonoLabel>Newsletter</MonoLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Fréquence" value={v.newsletterFrequency} onChange={(e) => set({ newsletterFrequency: e.target.value as NotificationSettingsPatch['newsletterFrequency'] })}>
            <option value="off">Désactivée</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle (le 1er)</option>
          </Select>
          {v.newsletterFrequency === 'weekly' && (
            <Select label="Jour" value={v.newsletterWeekday} onChange={(e) => set({ newsletterWeekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </Select>
          )}
          <Select label="Heure" value={v.newsletterHour} onChange={(e) => set({ newsletterHour: Number(e.target.value) })} disabled={v.newsletterFrequency === 'off'}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')} h</option>)}
          </Select>
        </div>
        <Check label="Mot du sommelier (IA)" checked={v.newsletterAi ?? true} onChange={(newsletterAi) => set({ newsletterAi })} />
        {!server.aiConfigured && <p className="text-xs text-stone-500">IA non configurée sur le serveur : la newsletter partira sans le mot du sommelier.</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={showPreview} disabled={previewing}>
            {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Aperçu
          </Button>
          <Button variant="outline" size="sm" onClick={sendNow} disabled={sending || dirty}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Envoyer maintenant
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer
        </Button>
        {dirty && <span className="text-xs text-stone-500">Modifications non enregistrées</span>}
      </div>

      {/* Journal */}
      {server.recent.length > 0 && (
        <div>
          <MonoLabel>Derniers envois</MonoLabel>
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {server.recent.map((r, i) => (
              <li key={i} className="py-1.5 flex flex-wrap items-center gap-2">
                <Badge tone={r.ok ? 'success' : 'urgent'}>{r.ok ? 'OK' : 'Échec'}</Badge>
                <span className="text-stone-800">{KIND_LABELS[r.kind]} · {r.channel === 'gotify' ? 'Gotify' : 'Email'}</span>
                <span className="text-stone-500 text-xs">{new Date(r.sentAt).toLocaleString('fr-FR')}</span>
                {r.error && <span className="text-wine-700 text-xs w-full">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={preview !== null} onClose={() => setPreview(null)} title="Aperçu de la newsletter" subtitle={preview?.subject} size="lg">
        {preview && <iframe title="Aperçu de la newsletter" sandbox="" srcDoc={preview.html} className="w-full h-[70vh] rounded-md border border-stone-200 bg-white" />}
      </Modal>
    </div>
  );
};
```

(« Envoyer maintenant » est désactivé tant que des modifications ne sont pas enregistrées : l'envoi utilise les réglages enregistrés. Vérifier que `Badge` accepte `tone="urgent"` et `"success"` — oui d'après `BadgeTone`.)

- [ ] **Step 4: Mount the card** — `pages/Settings.tsx` : `import { NotificationSettings } from '../components/cockpit/NotificationSettings';` et, juste après la `Section` « Compte » :

```tsx
        {/* ───── Notifications ───── */}
        <Section
          label="Notifications"
          title="Alertes et newsletter"
          hint="Propres à votre compte : chaque membre du foyer choisit ses canaux. Les alertes signalent un vin qui entre en apogée, dont la fenêtre se referme ou dont l'apogée est dépassée."
        >
          <NotificationSettings />
        </Section>
```

et mettre à jour le sous-titre de page : `Compte, notifications, intelligence artificielle, enrichissement et données`.

- [ ] **Step 5: Typecheck, tests, build** — à la racine : `npm run typecheck && npm test && npm run build` → aucune erreur.

- [ ] **Step 6: Visual check** — `docker compose up -d --build` (avec un `.env` local de dev : `DATABASE_URL`, `JWT_SECRET`), ouvrir `http://localhost:5001/settings` dans le navigateur intégré, se connecter avec un compte de test créé pour l'occasion, vérifier : la carte s'affiche (bureau et 375 px de large), Email grisé avec la mention Sweego, enregistrement d'une URL/jeton Gotify (jeton affiché « ••• enregistré » ensuite), « Aperçu » ouvre la modale avec le rendu HTML, « Derniers envois » après un test (échec attendu sans vrai serveur Gotify, message lisible). Arrêter ensuite : `docker compose down`.

- [ ] **Step 7: Commit**

```bash
git add types.ts services/storageService.ts components/cockpit/NotificationSettings.tsx pages/Settings.tsx
git commit -m "Notifications (9) : carte Réglages (canaux, alertes, newsletter, aperçu, derniers envois)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Partie B — Passerelle MenuFlow, côté MenuFlow (dépôt `~/Claude/MenuFlow`)

Avant la tâche 10 : `cd ~/Claude/MenuFlow && git status` (doit être propre ; sinon s'arrêter et demander), `git checkout main && git pull`, puis `git checkout -b claude/vin-du-diner`. Conventions MenuFlow (`CLAUDE.md`, `AGENTS.md`) : interface et messages en français, identifiants en anglais, `uv run ruff check . && uv run ruff format .` avant chaque commit, commits en français avec la ligne `Co-Authored-By`.

### Task 10: MenuFlow — table `dinner_wine`, route d'écriture, champ `wine` sur les dîners

**Files (dépôt MenuFlow):**
- Modify: `backend/menuflow/models.py`, `backend/menuflow/schemas.py`, `backend/menuflow/services/serializers.py`, `backend/menuflow/api/weeks.py`, `docs/MCP.md`, `docs/DECISIONS.md`, `CLAUDE.md`
- Create: `backend/alembic/versions/0008_dinner_wine.py`, `backend/menuflow/services/dinner_wine.py`
- Test: `backend/tests/test_dinner_wine.py`

**Interfaces:**
- Produces (consommé par VinoFlow, tâche 14) :
  - `PUT /api/v1/dinners/by-date/{day}/wine` (jeton `write` ou `mcp`), corps `DinnerWineIn` = `{ dish_title: str, suggested: WineRef | null, opened: WineRef[] }`, `WineRef` = `{ wine: str, vintage: int|null, reason: str|null, location: str|null, url: str|null }` ; réponse 200 `DinnerWineOut` = `{ dish_title, suggested, opened, updated_at }` ; champ inconnu → 422.
  - `DELETE /api/v1/dinners/by-date/{day}/wine` → 204.
  - `DinnerOut.wine: DinnerWineOut | None` (présent dans `/weeks/*`, `/dinners/*`, outil MCP `get_week`) ; `suggested` masqué si `dish_title` ≠ titre du dîner servi ce jour-là ; `wine` nul s'il ne reste rien.
  - Écriture **non** soumise au limiteur `WriterLimited` (VinoFlow peut pousser une quarantaine de dates à la première synchro) : dépendance `Writer`.

- [ ] **Step 1: Write the failing test** — `backend/tests/test_dinner_wine.py` :

```python
"""Vin du dîner poussé par VinoFlow : écriture réservée, lecture partout, survie aux republications."""

from __future__ import annotations

from datetime import date

from tests.conftest import auth

FRITTATA = "Frittata courgettes, pommes de terre, feta & menthe"
URL = "/api/v1/dinners/by-date/2026-08-31/wine"


def _payload(dish: str = FRITTATA, **extra) -> dict:
    body = {
        "dish_title": dish,
        "suggested": {
            "wine": "Saumur-Champigny",
            "vintage": 2019,
            "reason": "Fruit croquant, tanins fondus",
            "location": "Casier B",
            "url": "https://vinoflow.example.com/wine/1",
        },
        "opened": [],
    }
    body.update(extra)
    return body


def _publish(payload: dict):
    from menuflow.db import session_scope
    from menuflow.schemas import WeekPublish
    from menuflow.services import weeks

    with session_scope() as session:
        return weeks.publish_week(session, WeekPublish.model_validate(payload))


async def test_write_requires_writer(client, tokens, week_payload):
    _publish(week_payload)
    r = await client.put(URL, json=_payload(), headers=auth(tokens["nounou"]))
    assert r.status_code == 403
    r = await client.put(URL, json=_payload(), headers=auth(tokens["xavier"]))
    assert r.status_code == 200
    assert r.json()["suggested"]["wine"] == "Saumur-Champigny"


async def test_validation_rejects_unknown_fields(client, tokens):
    r = await client.put(URL, json=_payload(extra_field=1), headers=auth(tokens["xavier"]))
    assert r.status_code == 422


async def test_wine_visible_in_week_and_today(client, tokens, week_payload, freeze):
    _publish(week_payload)
    await client.put(URL, json=_payload(), headers=auth(tokens["xavier"]))
    r = await client.get("/api/v1/weeks/2026-08-31", headers=auth(tokens["nounou"]))
    dinners = r.json()["dinners"]
    assert dinners[0]["wine"]["suggested"]["location"] == "Casier B"
    assert dinners[1]["wine"] is None
    freeze(date(2026, 8, 31))
    r = await client.get("/api/v1/dinners/today", headers=auth(tokens["nounou"]))
    assert r.json()["wine"]["suggested"]["vintage"] == 2019


async def test_survives_republish_and_hides_suggestion_when_dish_changes(client, tokens, week_payload):
    _publish(week_payload)
    opened = [{"wine": "Crémant d'Exemple", "vintage": 2021, "reason": None, "location": None, "url": None}]
    await client.put(URL, json=_payload(opened=opened), headers=auth(tokens["xavier"]))
    _publish(week_payload)  # republication identique
    r = await client.get("/api/v1/dinners/by-date/2026-08-31", headers=auth(tokens["xavier"]))
    assert r.json()["wine"]["suggested"]["wine"] == "Saumur-Champigny"

    changed = week_payload | {"dinners": [dict(week_payload["dinners"][0], title="Poulet basquaise",
                                               recipe=dict(week_payload["dinners"][0]["recipe"], title="Poulet basquaise"))]
                                          + week_payload["dinners"][1:]}
    _publish(changed)
    wine = (await client.get("/api/v1/dinners/by-date/2026-08-31", headers=auth(tokens["xavier"]))).json()["wine"]
    assert wine["suggested"] is None  # conseil fait pour un autre plat
    assert wine["opened"][0]["wine"] == "Crémant d'Exemple"


async def test_delete(client, tokens, week_payload):
    _publish(week_payload)
    await client.put(URL, json=_payload(), headers=auth(tokens["xavier"]))
    r = await client.delete(URL, headers=auth(tokens["xavier"]))
    assert r.status_code == 204
    r = await client.get("/api/v1/dinners/by-date/2026-08-31", headers=auth(tokens["xavier"]))
    assert r.json()["wine"] is None
```

(Si `publish_week` refuse une recette de même titre réutilisée ou un dîner modifié de cette façon, adapter le jeu `changed` en s'inspirant de `tests/test_api.py` — l'intention est : même date, autre plat.)

- [ ] **Step 2: Run test to verify it fails** — `cd backend && uv run pytest tests/test_dinner_wine.py -q` → FAIL (404 / clé `wine` absente).

- [ ] **Step 3: Model** — à la fin de `backend/menuflow/models.py` :

```python
class DinnerWine(SQLModel, table=True):
    """Vin d'un dîner, poussé par VinoFlow. Indexé par date (comme les verdicts, D4) pour
    survivre aux republications ; le conseil porte le plat pour lequel il a été fait."""

    __tablename__ = "dinner_wine"

    date: dt.date = Field(primary_key=True)
    dish_title: str
    suggested: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    opened: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    updated_at: dt.datetime = Field(default_factory=utcnow)
```

- [ ] **Step 4: Migration** — `backend/alembic/versions/0008_dinner_wine.py` (vérifier que la tête actuelle est bien `8b2d4f6a1e20` avec `uv run alembic heads`) :

```python
"""vin du dîner poussé par VinoFlow

Révision : 8b2d4f6a1e30
Précédente : 8b2d4f6a1e20
Date : 2026-10-05
"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision = "8b2d4f6a1e30"
down_revision = "8b2d4f6a1e20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    text = sqlmodel.sql.sqltypes.AutoString()
    op.create_table(
        "dinner_wine",
        sa.Column("date", sa.Date(), primary_key=True),
        sa.Column("dish_title", text, nullable=False),
        sa.Column("suggested", sa.JSON(), nullable=True),
        sa.Column("opened", sa.JSON(), nullable=True, server_default="[]"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("dinner_wine")
```

- [ ] **Step 5: Schemas** — dans `backend/menuflow/schemas.py`, avant `class DinnerOut` :

```python
class WineRef(BaseModel):
    """Bouteille de la cave VinoFlow (conseillée ou ouverte)."""

    model_config = ConfigDict(extra="forbid")

    wine: str = Field(min_length=1, max_length=200)
    vintage: int | None = None
    reason: str | None = Field(default=None, max_length=1000)
    location: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=500)


class DinnerWineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dish_title: str = Field(min_length=1, max_length=300)
    suggested: WineRef | None = None
    opened: list[WineRef] = Field(default_factory=list, max_length=20)


class DinnerWineOut(BaseModel):
    dish_title: str
    suggested: WineRef | None
    opened: list[WineRef]
    updated_at: datetime
```

et dans `class DinnerOut(Out)`, dernier champ : `wine: DinnerWineOut | None = None`.

- [ ] **Step 6: Service** — `backend/menuflow/services/dinner_wine.py` :

```python
"""Vin du dîner : écrit par VinoFlow (jeton write), lu avec chaque dîner."""

from __future__ import annotations

from datetime import date

from sqlmodel import Session

from ..models import Dinner, DinnerWine, utcnow
from ..schemas import DinnerWineIn, DinnerWineOut


def _out(row: DinnerWine) -> DinnerWineOut:
    return DinnerWineOut(
        dish_title=row.dish_title,
        suggested=row.suggested,
        opened=row.opened or [],
        updated_at=row.updated_at,
    )


def put_dinner_wine(session: Session, day: date, payload: DinnerWineIn) -> DinnerWineOut:
    data = payload.model_dump()
    row = session.get(DinnerWine, day)
    if row is None:
        row = DinnerWine(date=day, **data)
    else:
        row.dish_title = data["dish_title"]
        row.suggested = data["suggested"]
        row.opened = data["opened"]
        row.updated_at = utcnow()
    session.add(row)
    session.flush()
    return _out(row)


def delete_dinner_wine(session: Session, day: date) -> None:
    row = session.get(DinnerWine, day)
    if row is not None:
        session.delete(row)
        session.flush()


def wine_for_dinner(session: Session | None, dinner: Dinner) -> DinnerWineOut | None:
    """Vin à afficher avec ce dîner : le conseil n'est montré que pour le plat qu'il visait."""
    if session is None:
        return None
    row = session.get(DinnerWine, dinner.date)
    if row is None:
        return None
    suggested = row.suggested if row.dish_title == dinner.title else None
    if suggested is None and not row.opened:
        return None
    return DinnerWineOut(dish_title=row.dish_title, suggested=suggested, opened=row.opened or [], updated_at=row.updated_at)
```

- [ ] **Step 7: Serializer** — dans `backend/menuflow/services/serializers.py`, ajouter `from sqlalchemy.orm import object_session` et `from .dinner_wine import wine_for_dinner`, puis :

```python
def dinner_detail(dinner: Dinner) -> DinnerDetailOut:
    data = DinnerOut.model_validate(dinner).model_dump()
    data["wine"] = wine_for_dinner(object_session(dinner), dinner)
    return DinnerDetailOut(
        **data,
        recipe=RecipeOut.model_validate(dinner.recipe),
        verdicts=[VerdictOut.model_validate(v) for v in dinner.verdicts],
        week_start_date=dinner.week.start_date,
    )
```

(Vérifier l'absence d'import circulaire `serializers` ↔ `dinner_wine` ; sinon déplacer l'import dans la fonction.)

- [ ] **Step 8: Routes** — dans `backend/menuflow/api/weeks.py`, importer `Writer` (`from ..auth.tokens import Reader, Writer`), `DinnerWineIn, DinnerWineOut` et `from ..services import dinner_wine as wine_svc`, puis :

```python
@router.put("/dinners/by-date/{day}/wine", response_model=DinnerWineOut)
def put_dinner_wine(day: date, payload: DinnerWineIn, _: Writer, session: DB) -> DinnerWineOut:
    """Vin conseillé et bouteilles ouvertes pour le dîner de ce jour (écrit par VinoFlow)."""
    return wine_svc.put_dinner_wine(session, day, payload)


@router.delete("/dinners/by-date/{day}/wine", status_code=204)
def delete_dinner_wine(day: date, _: Writer, session: DB) -> None:
    wine_svc.delete_dinner_wine(session, day)
```

- [ ] **Step 9: Run tests** — `cd backend && uv run pytest -q` → tout PASS (dont `test_openapi_export`, `test_mcp`) ; `uv run alembic upgrade head` sur une base temporaire (`MENUFLOW_DATA_DIR=$(mktemp -d)`) ; `uv run ruff check . && uv run ruff format .`.

- [ ] **Step 10: Docs** — `docs/DECISIONS.md`, nouvelle entrée :

```markdown
## D44 — Vin du dîner poussé par VinoFlow, stocké par date

Contexte : VinoFlow (cave du foyer) conseille un vin pour chaque dîner et sait quelles bouteilles ont été ouvertes.

- Option A : MenuFlow lit VinoFlow (jeton longue durée à créer côté VinoFlow).
- Option B : VinoFlow pousse vers MenuFlow avec un jeton `write`.

Retenu : **B**. Table `dinner_wine` indexée par date (indépendante de `dinner.id`, comme les verdicts en D4) ; le conseil mémorise le plat visé et n'est pas affiché si le dîner du jour a changé. Écriture hors limiteur d'écriture (synchro en lot).
```

`docs/MCP.md` : signaler le champ `wine` dans le retour de `get_week` (dîners). `CLAUDE.md` : ajouter la spec VinoFlow aux documents de référence (« Vin du dîner : `dinner_wine`, poussé par VinoFlow — voir D44 »).

- [ ] **Step 11: Commit**

```bash
git add backend docs CLAUDE.md
git commit -m "Vin du dîner : table dinner_wine par date, route d'écriture pour VinoFlow, champ wine sur les dîners

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: MenuFlow web — carte « Le vin »

**Files (dépôt MenuFlow):**
- Modify: `web/src/api/schema.d.ts` (généré), `web/src/components/DinnerView.tsx`
- Create: `web/src/components/WineCard.tsx`, `web/src/components/WineCard.test.tsx`

**Interfaces:**
- Consumes: `Dinner["wine"]` (type généré depuis `DinnerDetailOut`).
- Produces: `<WineCard wine={…} />`.

- [ ] **Step 1: Regenerate the API types** — `cd web && npm run gen:api` (lance le backend sur une base temporaire) ; vérifier que `schema.d.ts` contient `DinnerWineOut` et `WineRef`.

- [ ] **Step 2: Write the failing test** — `web/src/components/WineCard.test.tsx` (s'aligner sur les imports de `Layout.test.tsx`) :

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WineCard } from "./WineCard";

const suggested = {
  wine: "Saumur-Champigny", vintage: 2019, reason: "Fruit croquant", location: "Casier B",
  url: "https://vinoflow.example.com/wine/1",
};

describe("WineCard", () => {
  it("affiche le conseil, l'emplacement et le lien VinoFlow", () => {
    render(<WineCard wine={{ dish_title: "Frittata", suggested, opened: [], updated_at: "2026-10-05T10:00:00Z" }} />);
    expect(screen.getByText("Saumur-Champigny 2019")).toBeTruthy();
    expect(screen.getByText(/Casier B/)).toBeTruthy();
    expect(screen.getByText("Fruit croquant")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voir dans VinoFlow" }).getAttribute("href")).toBe(suggested.url);
  });

  it("sans conseil : seulement les bouteilles ouvertes", () => {
    render(<WineCard wine={{ dish_title: "Frittata", suggested: null, opened: [{ ...suggested, wine: "Crémant", vintage: null }], updated_at: "2026-10-05T10:00:00Z" }} />);
    expect(screen.getByText("Ouvert ce soir : Crémant")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
```

Run: `cd web && npm test -- WineCard` → FAIL.

- [ ] **Step 3: Implement `web/src/components/WineCard.tsx`**

```tsx
import type { Dinner } from "../api/types";

type DinnerWine = NonNullable<Dinner["wine"]>;
type Ref = { wine: string; vintage?: number | null };

const label = (w: Ref) => (w.vintage ? `${w.wine} ${w.vintage}` : w.wine);

/** Vin du dîner, poussé par VinoFlow (cave du foyer). */
export function WineCard({ wine }: { wine: DinnerWine }) {
  const s = wine.suggested;
  return (
    <section className="card" aria-labelledby="le-vin">
      <h2 id="le-vin" className="aisle-title">
        Le vin
      </h2>
      {s && (
        <>
          <p>
            <strong>{label(s)}</strong>
            {s.location && <span className="muted"> · {s.location}</span>}
          </p>
          {s.reason && <p className="muted">{s.reason}</p>}
          {s.url && (
            <p>
              <a href={s.url} target="_blank" rel="noreferrer">
                Voir dans VinoFlow
              </a>
            </p>
          )}
        </>
      )}
      {wine.opened.length > 0 && <p>Ouvert ce soir : {wine.opened.map(label).join(", ")}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Wire `DinnerView`** — dans `web/src/components/DinnerView.tsx`, importer `WineCard` et, dans la colonne de droite, après la section « Ce soir » :

```tsx
        {"wine" in dinner && dinner.wine && <WineCard wine={dinner.wine} />}
```

- [ ] **Step 5: Run checks** — `cd web && npm test && npm run check && npm run build` → PASS. Vérifier visuellement avec `uv run python scripts/dev_fake_server.py` + `npm run dev` si le faux serveur permet de poser un vin ; sinon s'en tenir aux tests.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "Web : carte « Le vin » sur la fiche du dîner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: MenuFlow iPhone — carte « Le vin »

**Files (dépôt MenuFlow):**
- Modify: `ios/MenuFlow/Models/Models.swift`, `ios/MenuFlow/Screens/DinnerDetailView.swift`, `ios/MenuFlow/Components/Components.swift` (`HeroDinnerCard`), `ios/project.yml`
- Create: `ios/MenuFlow/Components/DinnerWineCard.swift`
- Test: `ios/MenuFlowTests/DecodingTests.swift`

**Interfaces:**
- Produces: `struct WineRef`, `struct DinnerWine`, `DinnerDetail.wine: DinnerWine?`, `DinnerWineCard(wine:)`.

- [ ] **Step 1: Write the failing test** — ajouter à `DecodingTests` :

```swift
    func testDinnerWineDecodes() throws {
        XCTAssertNil(try APIClient.decoder.decode(DinnerDetail.self, from: fixture("dinner")).wine)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("dinner")) as? [String: Any])
        json["wine"] = [
            "dish_title": "Frittata",
            "suggested": ["wine": "Saumur-Champigny", "vintage": 2019, "reason": "Fruit croquant",
                          "location": "Casier B", "url": "https://vinoflow.example.com/wine/1"],
            "opened": [["wine": "Crémant", "vintage": NSNull(), "reason": NSNull(), "location": NSNull(), "url": NSNull()]],
            "updated_at": "2026-10-05T10:00:00Z",
        ]
        let dinner = try APIClient.decoder.decode(DinnerDetail.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertEqual(dinner.wine?.suggested?.label, "Saumur-Champigny 2019")
        XCTAssertEqual(dinner.wine?.suggested?.location, "Casier B")
        XCTAssertEqual(dinner.wine?.opened.first?.label, "Crémant")
    }
```

- [ ] **Step 2: Models** — dans `Models.swift`, avant `struct DinnerDetail` :

```swift
/// Bouteille de la cave VinoFlow, conseillée ou ouverte pour un dîner.
struct WineRef: Codable, Hashable {
    var wine: String
    var vintage: Int?
    var reason: String?
    var location: String?
    var url: String?

    var label: String { vintage.map { "\(wine) \($0)" } ?? wine }
}

/// Vin du dîner poussé par VinoFlow (absent si VinoFlow n'est pas relié).
struct DinnerWine: Codable, Hashable {
    var dishTitle: String
    var suggested: WineRef?
    var opened: [WineRef]
}
```

et dans `DinnerDetail`, après `weekStartDate` : `var wine: DinnerWine? = nil` (valeur par défaut : les constructions existantes de `DinnerDetail` restent valides).

- [ ] **Step 3: Card** — `ios/MenuFlow/Components/DinnerWineCard.swift` :

```swift
import SwiftUI

/// Vin du dîner (VinoFlow) : conseil, emplacement, lien vers la fiche, bouteilles ouvertes.
struct DinnerWineCard: View {
    var wine: DinnerWine

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Eyebrow(text: "Le vin")
            if let s = wine.suggested {
                Text(s.label).font(.system(.title3, design: .serif)).italic().foregroundStyle(Theme.ink)
                if let location = s.location {
                    Label(location, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(Theme.muted)
                }
                if let reason = s.reason, !reason.isEmpty {
                    Text(reason).font(.subheadline).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
                if let raw = s.url, let url = URL(string: raw) {
                    Link("Voir dans VinoFlow", destination: url).font(.subheadline.weight(.semibold)).tint(Theme.brand)
                }
            }
            if !wine.opened.isEmpty {
                Label("Ouvert ce soir : " + wine.opened.map(\.label).joined(separator: ", "), systemImage: "wineglass")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            }
        }
        .cardStyle()
    }
}
```

- [ ] **Step 4: Wire the screens** — `DinnerDetailView` : juste avant `RecipeContentView(recipe: recipe, leftovers: dinner.leftovers)`, ajouter `if let wine = dinner.wine { DinnerWineCard(wine: wine) }`. `HeroDinnerCard` (dîner du jour sur la semaine) : sous le titre, ajouter

```swift
            if let s = dinner.wine?.suggested {
                Label(s.label, systemImage: "wineglass").font(.subheadline).foregroundStyle(Theme.muted)
            }
```

(placer la ligne à l'endroit cohérent avec la mise en page existante de `HeroDinnerCard`).

- [ ] **Step 5: Version** — `ios/project.yml` : `MARKETING_VERSION: "0.6.0"`, `CURRENT_PROJECT_VERSION: 6`.

- [ ] **Step 6: Build and test** — `cd ios && xcodegen generate && xcodebuild -project MenuFlow.xcodeproj -scheme MenuFlow -destination 'platform=iOS Simulator,name=iPhone 17' test` → PASS. Vérification visuelle : ouvrir le panneau simulateur (`attach`), lancer l'app contre le faux serveur local (`uv run python scripts/dev_fake_server.py`, connexion par `xcrun simctl openurl booted "menuflow://connect?server=…&token=…&name=…"`), poser un vin par `curl -X PUT …/api/v1/dinners/by-date/<jour>/wine` avec un jeton write du faux serveur, vérifier la carte sur la fiche du dîner et la ligne sur la carte du jour ; capture d'écran pour la PR.

- [ ] **Step 7: Commit**

```bash
git add ios
git commit -m "iOS : carte « Le vin » sur le dîner et le dîner du jour ; version 0.6.0 (build 6)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Partie C — Passerelle MenuFlow, côté VinoFlow (retour dans le worktree VinoFlow)

### Task 13: Migration 010 et service d'accord `pairForDish`

**Files:**
- Create: `db/migrations/010_menuflow.sql`, `backend/src/sommelier/pairForDish.js`
- Modify: `backend/src/routes/sommelier.js` (route `/sommelier/pair`), `backend/tests/api/migrations.test.js`
- Test: `backend/tests/unit/pairForDish.test.js`

**Interfaces:**
- Produces:
  - tables/colonnes : `dinner_pairings` (spec §12.3), `journal.for_dinner boolean`
  - `pairForDish({ dish, context = {}, userId = null, skipCache = false, exclude = [], inventory }): Promise<pairingResult>` — même réponse que `POST /sommelier/pair` (`{ picks: { safe, personal, creative, global_advice }, … }`, chaque pick `{ wine_id, reason, … } | null`)
  - `pickInStock(result, inventoryById): { wine_id, reason } | null` — premier pick (safe, personal, creative) dont le vin a du stock

- [ ] **Step 1: Migration test (failing)** — dans `backend/tests/api/migrations.test.js` :

```js
  it('010 : dinner_pairings et journal.for_dinner', async () => {
    const t = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'dinner_pairings'");
    expect(t.rowCount).toBe(1);
    const c = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'journal' AND column_name = 'for_dinner'");
    expect(c.rows[0]?.data_type).toBe('boolean');
  });
```

- [ ] **Step 2: Write `db/migrations/010_menuflow.sql`**

```sql
-- Passerelle MenuFlow : un dîner par date (lu dans MenuFlow), le vin conseillé par VinoFlow
-- et l'empreinte de ce qui a été poussé ; rattachement des sorties du journal aux dîners.

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

-- null = rattachement automatique au dîner du jour ; true = confirmé ; false = décoché.
ALTER TABLE journal ADD COLUMN IF NOT EXISTS for_dinner boolean;
```

Ajouter `dinner_pairings` à la liste `TRUNCATE` de `resetData()` dans `backend/tests/api/helpers.js`.

- [ ] **Step 3: Write the failing unit test** — `backend/tests/unit/pairForDish.test.js` :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('../../src/services/inventory.js', () => ({ loadInventory: vi.fn() }));
vi.mock('../../src/services/aiService.js', () => ({ isProviderConfigured: vi.fn(() => false) }));
vi.mock('../../src/sommelier/agent.js', () => ({ runAgentPairing: vi.fn() }));
vi.mock('../../src/sommelier/coordinator.js', () => ({ runPairing: vi.fn(async ({ inventory }) => ({ picks: { safe: { wine_id: inventory[0]?.id, reason: 'r' }, personal: null, creative: null }, seen: inventory.map((w) => w.id) })) }));
vi.mock('../../src/sommelier/tasteProfile.js', () => ({ getTasteProfile: vi.fn(async () => null) }));

const { loadInventory } = await import('../../src/services/inventory.js');
const { isProviderConfigured } = await import('../../src/services/aiService.js');
const { runAgentPairing } = await import('../../src/sommelier/agent.js');
const { runPairing } = await import('../../src/sommelier/coordinator.js');
const { pairForDish, pickInStock } = await import('../../src/sommelier/pairForDish.js');

const inv = [{ id: 'a', inventoryCount: 1 }, { id: 'b', inventoryCount: 2 }, { id: 'c', inventoryCount: 0 }];

beforeEach(() => { loadInventory.mockResolvedValue(inv); vi.clearAllMocks(); loadInventory.mockResolvedValue(inv); });
afterEach(() => vi.unstubAllEnvs());

describe('pairForDish', () => {
  it('pipeline par défaut, sur tout l’inventaire', async () => {
    const r = await pairForDish({ dish: 'Poulet' });
    expect(runPairing).toHaveBeenCalledWith(expect.objectContaining({ dish: 'Poulet', skipCache: false }));
    expect(r.seen).toEqual(['a', 'b', 'c']);
  });
  it('exclude retire des vins et contourne le cache', async () => {
    const r = await pairForDish({ dish: 'Poulet', exclude: ['a'] });
    expect(r.seen).toEqual(['b', 'c']);
    expect(runPairing).toHaveBeenCalledWith(expect.objectContaining({ skipCache: true }));
  });
  it('agent si activé et Claude configuré, repli sur le pipeline en cas d’échec', async () => {
    vi.stubEnv('VINOFLOW_SOMMELIER_AGENT', 'true');
    isProviderConfigured.mockReturnValue(true);
    runAgentPairing.mockResolvedValue({ picks: { safe: { wine_id: 'b', reason: 'agent' } }, candidates: [], turns: 2 });
    expect((await pairForDish({ dish: 'Poulet' })).engine).toBe('agent');
    runAgentPairing.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await pairForDish({ dish: 'Poulet' });
    expect(runPairing).toHaveBeenCalled();
  });
});

describe('pickInStock', () => {
  const byId = new Map(inv.map((w) => [w.id, w]));
  it('premier choix dont le vin a du stock', () => {
    expect(pickInStock({ picks: { safe: { wine_id: 'c', reason: 'x' }, personal: { wine_id: 'b', reason: 'y' }, creative: null } }, byId))
      .toEqual({ wine_id: 'b', reason: 'y' });
    expect(pickInStock({ picks: { safe: null, personal: null, creative: null } }, byId)).toBeNull();
    expect(pickInStock(null, byId)).toBeNull();
  });
});
```

Run: `cd backend && npx vitest run tests/unit/pairForDish.test.js` → FAIL.

- [ ] **Step 4: Implement `backend/src/sommelier/pairForDish.js`** (logique déplacée telle quelle depuis la route) :

```js
// Accord mets-vin sur la cave : agent à outils (flag VINOFLOW_SOMMELIER_AGENT +
// Claude configuré) avec repli sur le pipeline. Partagé par POST /sommelier/pair,
// la passerelle MenuFlow (conseil par dîner) et « Une autre idée ».
import { pool } from '../db.js';
import { loadInventory } from '../services/inventory.js';
import { isProviderConfigured } from '../services/aiService.js';
import { runAgentPairing } from './agent.js';
import { runPairing } from './coordinator.js';
import { getTasteProfile } from './tasteProfile.js';

const loadUserFeedback = async (userId) => {
  const fb = await pool.query(`
    SELECT pf.dish, pf.rating, pf.category, w.name || ' ' || COALESCE(w.vintage::text, '') AS wine_label
      FROM pairing_feedback pf
      LEFT JOIN wines w ON w.id = pf.wine_id
     WHERE pf.user_id = $1
     ORDER BY pf.created_at DESC
     LIMIT 30
  `, [userId]);
  return fb.rows;
};

export const pairForDish = async ({ dish, context = {}, userId = null, skipCache = false, exclude = [], inventory: provided } = {}) => {
  const excluded = new Set(exclude);
  const inventory = (provided ?? await loadInventory()).filter((w) => !excluded.has(w.id));
  const userFeedback = userId ? await loadUserFeedback(userId) : [];
  const tasteProfile = userId ? await getTasteProfile(pool, userId) : null;

  // Sommelier en un appel avec outils (flag) — voir sommelier/agent.js.
  // En cas d'échec (pas de clé Claude, erreur API), on retombe sur le pipeline.
  if (process.env.VINOFLOW_SOMMELIER_AGENT === 'true' && isProviderConfigured('claude')) {
    try {
      const inStock = inventory.filter((w) => (w.inventoryCount ?? 0) > 0);
      const agent = await runAgentPairing({ inventory, dish, tasteProfile, userFeedback });
      return {
        criteria: null,
        candidates: agent.candidates,
        picks: agent.picks,
        critique: null,
        fromCache: null,
        cave_size: inStock.length,
        cave_after_filter: null,
        engine: 'agent',
        turns: agent.turns,
      };
    } catch (error) {
      console.warn('Sommelier agent en échec, repli sur le pipeline :', error.message);
    }
  }

  return runPairing({
    pool,
    inventory,
    dish,
    context: context || {},
    userId,
    userFeedback,
    tasteProfile,
    skipCache: Boolean(skipCache) || excluded.size > 0,
  });
};

export const pickInStock = (result, inventoryById) => {
  const p = result?.picks;
  if (!p) return null;
  for (const pick of [p.safe, p.personal, p.creative]) {
    if (pick?.wine_id && (inventoryById.get(pick.wine_id)?.inventoryCount ?? 0) > 0) {
      return { wine_id: pick.wine_id, reason: pick.reason || null };
    }
  }
  return null;
};
```

- [ ] **Step 5: Simplify the route** — dans `backend/src/routes/sommelier.js`, remplacer le corps de `router.post('/sommelier/pair', …)` par :

```js
router.post('/sommelier/pair', async (req, res) => {
  try {
    const { dish, context, skipCache } = req.body;
    if (!dish) return res.status(400).json({ error: 'dish is required' });
    res.json(await pairForDish({ dish, context, userId: req.user?.userId, skipCache }));
  } catch (error) {
    console.error('Sommelier pair error:', error);
    res.status(500).json({ error: 'Failed to compute pairing', details: error.message });
  }
});
```

avec `import { pairForDish } from '../sommelier/pairForDish.js';` ; retirer les imports devenus inutiles (`runAgentPairing`, et `runPairing` / `isProviderConfigured` s'ils ne servent plus ailleurs dans le fichier — vérifier avec une recherche).

- [ ] **Step 6: Run tests** — `cd backend && npx vitest run && node --check src/routes/sommelier.js` → PASS (dont `agent.test.js`) ; avec base : `TEST_DATABASE_URL=… npx vitest run tests/api` → PASS.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/010_menuflow.sql backend/src/sommelier/pairForDish.js backend/src/routes/sommelier.js backend/tests/unit/pairForDish.test.js backend/tests/api/migrations.test.js backend/tests/api/helpers.js
git commit -m "Passerelle MenuFlow (1) : migration 010 et service d'accord partagé (pairForDish)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Client MenuFlow et synchronisation

**Files:**
- Create: `backend/src/menuflow/client.js`, `backend/src/menuflow/sync.js`
- Modify: `backend/src/notifications/scheduler.js`, `docker-compose.yml`, `.env.example`
- Test: `backend/tests/unit/menuflow.sync.test.js`, `backend/tests/api/menuflow.sync.test.js`

**Interfaces:**
- Consumes: `pairForDish`, `pickInStock` (tâche 13) ; `isNoteAvailable` (tâche 6) ; `loadLocations` (tâche 6) ; `loadInventory` ; `zonedParts`, `notifyTz` (tâche 2) ; `APP_URL` ; route MenuFlow de la tâche 10.
- Produces:
  - `client.js` : `isMenuflowConfigured()`, `getWeeks(limit)`, `getWeek(startDate)`, `getDinnerByDate(day)`, `putDinnerWine(day, payload)`, `deleteDinnerWine(day)`
  - `sync.js` :
    - purs : `localDay(date, tz): 'YYYY-MM-DD'`, `addDays(day, n): 'YYYY-MM-DD'`, `needsSuggestion(row, inventoryById, today): boolean`, `buildWinePayload(row, { inventoryById, openedByDay, locations, appUrl })`, `payloadHash(payload): string`
    - base : `upsertDinners(dinners)`, `loadPairings(from, to)` (lignes camelCase, `dinnerDate` en chaîne `YYYY-MM-DD`), `openedByDay(from, tz): Map<day, [{ journalId, wineId, wineName, wineVintage }]>`
    - `suggestFor(row, { inventoryById, exclude = [] }): Promise<pick | null>`
    - `pushDay(row, ctx): Promise<boolean>` (vrai si un envoi a eu lieu)
    - `syncMenuflow({ now, tz, maxSuggestions = 7 }): Promise<{ skipped?: true, dinners?: number, suggested?: number, pushed?: number }>`
    - `pushToday({ now, tz })` (envoi immédiat après une sortie du journal)
    - `menuflowStatus(): { configured, lastSyncAt, lastError }`

- [ ] **Step 1: Write the failing unit test** — `backend/tests/unit/menuflow.sync.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { localDay, addDays, needsSuggestion, buildWinePayload, payloadHash } from '../../src/menuflow/sync.js';

const APP = 'https://cave.example.com';
const byId = new Map([
  ['a', { id: 'a', name: 'Saumur-Champigny', cuvee: null, vintage: 2019, inventoryCount: 2 }],
  ['z', { id: 'z', name: 'Épuisé', vintage: 2010, inventoryCount: 0 }],
]);
const row = (extra = {}) => ({ dinnerDate: '2026-10-06', dishTitle: 'Poulet basquaise', suggestedWineId: 'a', suggestedForTitle: 'Poulet basquaise', suggestionReason: 'Fruit', pushedHash: null, ...extra });

describe('dates', () => {
  it('jour local et décalage', () => {
    expect(localDay(new Date('2026-10-05T22:30:00Z'), 'Europe/Paris')).toBe('2026-10-06');
    expect(addDays('2026-10-05', -35)).toBe('2026-08-31');
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06');
  });
});

describe('needsSuggestion', () => {
  it('dîner à venir sans conseil, plat changé ou vin épuisé', () => {
    expect(needsSuggestion(row({ suggestedWineId: null }), byId, '2026-10-05')).toBe(true);
    expect(needsSuggestion(row({ suggestedForTitle: 'Gratin' }), byId, '2026-10-05')).toBe(true);
    expect(needsSuggestion(row({ suggestedWineId: 'z' }), byId, '2026-10-05')).toBe(true);
    expect(needsSuggestion(row(), byId, '2026-10-05')).toBe(false);
  });
  it('jamais pour un dîner passé', () => {
    expect(needsSuggestion(row({ suggestedWineId: null, dinnerDate: '2026-10-01' }), byId, '2026-10-05')).toBe(false);
  });
});

describe('buildWinePayload', () => {
  const ctx = { inventoryById: byId, openedByDay: new Map([['2026-10-06', [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]]]), locations: new Map([['a', 'Casier B']]), appUrl: APP };
  it('conseil + bouteilles ouvertes, en snake_case pour MenuFlow', () => {
    expect(buildWinePayload(row(), ctx)).toEqual({
      dish_title: 'Poulet basquaise',
      suggested: { wine: 'Saumur-Champigny', vintage: 2019, reason: 'Fruit', location: 'Casier B', url: `${APP}/wine/a` },
      opened: [{ wine: 'Saumur-Champigny', vintage: 2019, reason: null, location: null, url: `${APP}/wine/a` }],
    });
  });
  it('conseil fait pour un autre plat : non envoyé', () => {
    expect(buildWinePayload(row({ suggestedForTitle: 'Gratin' }), ctx).suggested).toBeNull();
  });
  it('empreinte stable et sensible au contenu', () => {
    const p = buildWinePayload(row(), ctx);
    expect(payloadHash(p)).toBe(payloadHash(JSON.parse(JSON.stringify(p))));
    expect(payloadHash(p)).not.toBe(payloadHash({ ...p, opened: [] }));
  });
});
```

Run: `cd backend && npx vitest run tests/unit/menuflow.sync.test.js` → FAIL.

- [ ] **Step 2: Implement `backend/src/menuflow/client.js`**

```js
// Client de l'API MenuFlow (planning des dîners du foyer). Seul VinoFlow appelle
// MenuFlow : lecture des dîners, écriture du vin de chaque dîner (jeton « write »).
const base = () => `${(process.env.MENUFLOW_URL || '').replace(/\/+$/, '')}/api/v1`;

export const isMenuflowConfigured = () => Boolean(process.env.MENUFLOW_URL && process.env.MENUFLOW_TOKEN);

const call = async (method, path, body) => {
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.MENUFLOW_TOKEN}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`MenuFlow injoignable (${error.message})`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`jeton MenuFlow refusé (${res.status})`);
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) throw new Error(`MenuFlow a répondu ${res.status}`);
  return res.status === 204 ? null : res.json();
};

export const getWeeks = (limit = 8) => call('GET', `/weeks?limit=${limit}`);
export const getWeek = (startDate) => call('GET', `/weeks/${startDate}`);
export const getDinnerByDate = (day) => call('GET', `/dinners/by-date/${day}`);
export const putDinnerWine = (day, payload) => call('PUT', `/dinners/by-date/${day}/wine`, payload);
export const deleteDinnerWine = (day) => call('DELETE', `/dinners/by-date/${day}/wine`);
```

- [ ] **Step 3: Implement `backend/src/menuflow/sync.js`**

```js
// Synchronisation VinoFlow → MenuFlow, dans le tick des notifications :
// 1. lecture des dîners de J−35 à J+7 (table dinner_pairings, une ligne par date) ;
// 2. conseil d'un vin en stock pour chaque dîner à venir qui n'en a pas (ou dont le
//    plat a changé, ou dont le vin est épuisé) — 7 au plus par passage, IA requise ;
// 3. envoi à MenuFlow du conseil et des bouteilles ouvertes ce soir-là, seulement
//    si le contenu a changé (empreinte).
import { createHash } from 'node:crypto';
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { pairForDish, pickInStock } from '../sommelier/pairForDish.js';
import { isNoteAvailable } from '../notifications/sommelierNote.js';
import { loadLocations } from '../notifications/newsletter.js';
import { zonedParts, notifyTz } from '../notifications/schedule.js';
import { isMenuflowConfigured, getWeeks, getWeek, getDinnerByDate, putDinnerWine, deleteDinnerWine } from './client.js';

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (date, tz = notifyTz()) => {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const state = { lastSyncAt: null, lastError: null };
export const menuflowStatus = () => ({ configured: isMenuflowConfigured(), ...state });

export const needsSuggestion = (row, inventoryById, today) => {
  if (row.dinnerDate < today) return false;
  if (!row.suggestedWineId || row.suggestedForTitle !== row.dishTitle) return true;
  return (inventoryById.get(row.suggestedWineId)?.inventoryCount ?? 0) <= 0;
};

const ref = (wine, extra = {}) => ({ wine: wine.wine, vintage: wine.vintage ?? null, reason: null, location: null, url: null, ...extra });

export const buildWinePayload = (row, { inventoryById, openedByDay, locations, appUrl }) => {
  const w = row.suggestedWineId ? inventoryById.get(row.suggestedWineId) : null;
  const suggested = w && row.suggestedForTitle === row.dishTitle
    ? ref({ wine: [w.name, w.cuvee].filter(Boolean).join(' '), vintage: w.vintage }, {
      reason: row.suggestionReason || null,
      location: locations.get(w.id) || null,
      url: `${appUrl}/wine/${w.id}`,
    })
    : null;
  const opened = (openedByDay.get(row.dinnerDate) || []).map((o) =>
    ref({ wine: o.wineName, vintage: o.wineVintage }, { url: o.wineId ? `${appUrl}/wine/${o.wineId}` : null }));
  return { dish_title: row.dishTitle, suggested, opened };
};

export const payloadHash = (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

export const upsertDinners = async (dinners) => {
  for (const d of dinners) {
    const verdicts = (d.verdicts || []).map((v) => ({ author: v.author, rating: v.rating }));
    await pool.query(
      `INSERT INTO dinner_pairings (dinner_date, menuflow_dinner_id, dish_title, verdicts)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dinner_date) DO UPDATE SET menuflow_dinner_id = EXCLUDED.menuflow_dinner_id,
         dish_title = EXCLUDED.dish_title, verdicts = EXCLUDED.verdicts, updated_at = now()`,
      [d.date, d.id, d.title, JSON.stringify(verdicts)]
    );
  }
};

export const loadPairings = async (from, to) => {
  const { rows } = await pool.query(
    `SELECT to_char(dinner_date, 'YYYY-MM-DD') AS dinner_date, menuflow_dinner_id, dish_title, verdicts,
            suggested_wine_id, suggestion_reason, suggested_for_title, pushed_hash
     FROM dinner_pairings WHERE dinner_date BETWEEN $1::date AND $2::date ORDER BY dinner_date`,
    [from, to]
  );
  return convertKeysToCamelCase(rows);
};

/** Sorties du journal rattachées (automatiquement ou confirmées) à un dîner, par jour local. */
export const openedByDay = async (from, tz = notifyTz()) => {
  const { rows } = await pool.query(
    `SELECT id, wine_id, wine_name, wine_vintage, date FROM journal
     WHERE type = 'OUT' AND for_dinner IS NOT FALSE AND date >= ($1::date - interval '1 day') ORDER BY date`,
    [from]
  );
  const map = new Map();
  for (const r of rows) {
    const day = localDay(new Date(r.date), tz);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push({ journalId: r.id, wineId: r.wine_id, wineName: r.wine_name, wineVintage: r.wine_vintage });
  }
  return map;
};

export const suggestFor = async (row, { inventoryById, exclude = [] }) => {
  if (!isNoteAvailable()) return null;
  const pick = pickInStock(await pairForDish({ dish: row.dishTitle, exclude }), inventoryById);
  if (!pick) return null;
  await pool.query(
    `UPDATE dinner_pairings SET suggested_wine_id = $2, suggestion_reason = $3, suggested_for_title = $4, suggested_at = now()
     WHERE dinner_date = $1::date`,
    [row.dinnerDate, pick.wine_id, pick.reason, row.dishTitle]
  );
  Object.assign(row, { suggestedWineId: pick.wine_id, suggestionReason: pick.reason, suggestedForTitle: row.dishTitle });
  return pick;
};

export const pushDay = async (row, ctx) => {
  const payload = buildWinePayload(row, ctx);
  const empty = !payload.suggested && payload.opened.length === 0;
  const hash = empty ? null : payloadHash(payload);
  if (hash === (row.pushedHash ?? null)) return false;
  if (empty) await deleteDinnerWine(row.dinnerDate);
  else await putDinnerWine(row.dinnerDate, payload);
  await pool.query('UPDATE dinner_pairings SET pushed_hash = $2, pushed_at = now() WHERE dinner_date = $1::date', [row.dinnerDate, hash]);
  row.pushedHash = hash;
  return true;
};

const context = async (from, tz, inventory) => ({
  inventoryById: new Map(inventory.map((w) => [w.id, w])),
  openedByDay: await openedByDay(from, tz),
  locations: await loadLocations(),
  appUrl: APP_URL,
});

export const syncMenuflow = async ({ now = new Date(), tz = notifyTz(), maxSuggestions = 7 } = {}) => {
  if (!isMenuflowConfigured()) return { skipped: true };
  const today = localDay(now, tz);
  const from = addDays(today, -35);
  const to = addDays(today, 7);
  try {
    const summaries = (await getWeeks(8)) || [];
    const starts = summaries.map((w) => w.start_date).filter((s) => s <= to && addDays(s, 6) >= from);
    const weeks = (await Promise.all(starts.map((s) => getWeek(s)))).filter(Boolean);
    const dinners = weeks.flatMap((w) => w.dinners || []).filter((d) => d.date >= from && d.date <= to);
    await upsertDinners(dinners);

    const inventory = await loadInventory();
    const ctx = await context(from, tz, inventory);
    const rows = await loadPairings(from, to);
    let suggested = 0;
    for (const row of rows) {
      if (suggested >= maxSuggestions) break;
      if (!needsSuggestion(row, ctx.inventoryById, today)) continue;
      if (await suggestFor(row, ctx)) suggested++;
    }
    let pushed = 0;
    for (const row of rows) if (await pushDay(row, ctx)) pushed++;
    Object.assign(state, { lastSyncAt: new Date().toISOString(), lastError: null });
    return { dinners: dinners.length, suggested, pushed };
  } catch (error) {
    state.lastError = error.message;
    console.error('[menuflow] synchronisation :', error.message);
    return { error: error.message };
  }
};

/** Dîner du jour : lu en base, sinon chez MenuFlow (puis mémorisé). */
export const loadTonight = async ({ now = new Date(), tz = notifyTz() } = {}) => {
  const today = localDay(now, tz);
  let [row] = await loadPairings(today, today);
  if (!row) {
    const dinner = await getDinnerByDate(today);
    if (!dinner) return null;
    await upsertDinners([dinner]);
    [row] = await loadPairings(today, today);
  }
  return row || null;
};

/** Envoi immédiat du dîner du jour (après une sortie du journal) ; ne lève jamais. */
export const pushToday = async ({ now = new Date(), tz = notifyTz() } = {}) => {
  if (!isMenuflowConfigured()) return false;
  try {
    const row = await loadTonight({ now, tz });
    if (!row) return false;
    const today = localDay(now, tz);
    return await pushDay(row, await context(today, tz, await loadInventory()));
  } catch (error) {
    state.lastError = error.message;
    console.error('[menuflow] envoi du dîner du jour :', error.message);
    return false;
  }
};
```

Note sur les dates du journal : `journal.date` est un `timestamp without time zone` ; node-postgres le lit comme heure locale du processus (UTC dans le conteneur, comme `now()` côté base). `localDay` le ramène au jour de `NOTIFY_TZ`.

- [ ] **Step 4: Run unit test** — `cd backend && npx vitest run tests/unit/menuflow.sync.test.js` → PASS.

- [ ] **Step 5: Wire the tick** — dans `backend/src/notifications/scheduler.js`, importer `import { syncMenuflow } from '../menuflow/sync.js';` et, dans `runNotificationTick`, juste après l'acquisition du verrou et **avant** `const all = await listAllSettings();` :

```js
      // Passerelle MenuFlow d'abord : la newsletter s'appuie sur les dîners synchronisés.
      await syncMenuflow({ now, tz });
```

- [ ] **Step 6: Write the failing API test** — `backend/tests/api/menuflow.sync.test.js` :

```js
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { hasDb, pool, resetData } from './helpers.js';

vi.mock('../../src/sommelier/pairForDish.js', async (orig) => ({ ...(await orig()), pairForDish: vi.fn() }));
vi.mock('../../src/notifications/sommelierNote.js', async (orig) => ({ ...(await orig()), isNoteAvailable: () => true }));

const { pairForDish } = await import('../../src/sommelier/pairForDish.js');
const { syncMenuflow } = await import('../../src/menuflow/sync.js');

describe.skipIf(!hasDb)('synchronisation MenuFlow', () => {
  const NOW = new Date('2026-10-05T10:00:00Z');
  let calls;
  let wineA;
  let wineB;

  const menuflow = () => vi.fn(async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push({ method, path: u.pathname, body: init.body ? JSON.parse(init.body) : null });
    if (u.pathname === '/api/v1/weeks') return Response.json([{ start_date: '2026-10-05' }]);
    if (u.pathname === '/api/v1/weeks/2026-10-05') {
      return Response.json({ dinners: [
        { id: 1, date: '2026-10-05', title: 'Poulet basquaise', verdicts: [{ author: 'laure', rating: 'top' }] },
        { id: 2, date: '2026-10-06', title: 'Gratin de courge', verdicts: [] },
      ] });
    }
    if (method === 'PUT') return Response.json({});
    return new Response(null, { status: 204 });
  });
  const puts = () => calls.filter((c) => c.method === 'PUT');
  const addWine = async (name, bottles = 1) => {
    const { rows } = await pool.query(`INSERT INTO wines (name, vintage, type) VALUES ($1, 2019, 'RED') RETURNING id`, [name]);
    for (let i = 0; i < bottles; i++) await pool.query('INSERT INTO bottles (wine_id) VALUES ($1)', [rows[0].id]);
    return rows[0].id;
  };

  beforeEach(async () => {
    await resetData();
    calls = [];
    vi.stubEnv('MENUFLOW_URL', 'http://menuflow.test');
    vi.stubEnv('MENUFLOW_TOKEN', 'mf_tok');
    vi.stubGlobal('fetch', menuflow());
    wineA = await addWine('Alpha', 2);
    wineB = await addWine('Bravo', 1);
    pairForDish.mockReset();
    pairForDish.mockResolvedValue({ picks: { safe: { wine_id: wineA, reason: 'Fruit' }, personal: null, creative: null } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(() => pool.end());

  it('lit, conseille, pousse ; second passage sans envoi ni appel IA', async () => {
    const r = await syncMenuflow({ now: NOW });
    expect(r).toMatchObject({ dinners: 2, suggested: 2, pushed: 2 });
    expect(puts().map((c) => c.path)).toEqual(['/api/v1/dinners/by-date/2026-10-05/wine', '/api/v1/dinners/by-date/2026-10-06/wine']);
    expect(puts()[0].body.suggested).toMatchObject({ wine: 'Alpha', vintage: 2019, reason: 'Fruit' });
    expect(calls[0].path).toBe('/api/v1/weeks');

    calls = [];
    await syncMenuflow({ now: NOW });
    expect(puts()).toEqual([]);
    expect(pairForDish).toHaveBeenCalledTimes(2);
  });

  it('bouteille ouverte le soir du dîner : envoyée ; décochée : ignorée', async () => {
    await syncMenuflow({ now: NOW });
    await pool.query(`INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity) VALUES ('2026-10-05 17:30', 'OUT', $1, 'Bravo', 2019, 1)`, [wineB]);
    await pool.query(`INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, for_dinner) VALUES ('2026-10-06 17:30', 'OUT', $1, 'Alpha', 2019, 1, false)`, [wineA]);
    calls = [];
    await syncMenuflow({ now: NOW });
    expect(puts().map((c) => c.path)).toEqual(['/api/v1/dinners/by-date/2026-10-05/wine']);
    expect(puts()[0].body.opened).toEqual([{ wine: 'Bravo', vintage: 2019, reason: null, location: null, url: expect.stringContaining(`/wine/${wineB}`) }]);
  });

  it('vin conseillé épuisé : nouveau conseil', async () => {
    await syncMenuflow({ now: NOW });
    await pool.query('UPDATE bottles SET is_consumed = true WHERE wine_id = $1', [wineA]);
    pairForDish.mockResolvedValue({ picks: { safe: { wine_id: wineB, reason: 'Autre' }, personal: null, creative: null } });
    calls = [];
    await syncMenuflow({ now: NOW });
    expect(puts().map((c) => c.body.suggested.wine)).toEqual(['Bravo', 'Bravo']);
  });

  it('MenuFlow injoignable : erreur consignée, pas d’exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await syncMenuflow({ now: NOW })).error).toContain('MenuFlow injoignable');
  });
});
```

- [ ] **Step 7: Run tests** — avec base : `cd backend && TEST_DATABASE_URL=… npx vitest run tests/api` → PASS (dont le planificateur de la tâche 8, MenuFlow n'étant pas configuré dans ses tests).

- [ ] **Step 8: Config** — `docker-compose.yml` (service backend, après les variables de notifications) :

```yaml
      # Passerelle MenuFlow (planning des dîners) : jeton MenuFlow « write »
      - MENUFLOW_URL=${MENUFLOW_URL:-}
      - MENUFLOW_TOKEN=${MENUFLOW_TOKEN:-}
```

`.env.example` :

```
# Passerelle MenuFlow : vin conseillé pour chaque dîner planifié, affiché dans MenuFlow.
# Jeton à créer côté MenuFlow : python -m menuflow.cli create-token --name vinoflow --role write
# MENUFLOW_URL=https://menuflow.example.com
# MENUFLOW_TOKEN=mf_…
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/menuflow backend/src/notifications/scheduler.js backend/tests/unit/menuflow.sync.test.js backend/tests/api/menuflow.sync.test.js docker-compose.yml .env.example
git commit -m "Passerelle MenuFlow (2) : lecture des dîners, vin conseillé par dîner, envoi à MenuFlow sans doublon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Rubriques MenuFlow de la newsletter

**Files:**
- Create: `backend/src/menuflow/newsletterSections.js`
- Modify: `backend/src/notifications/newsletter.js` (`composeNewsletter`)
- Test: `backend/tests/unit/menuflow.sections.test.js`

**Interfaces:**
- Consumes: `classifyWine`, `rank` ; `wineLabel`, `dayMonth` ; `loadPairings`, `openedByDay`, `localDay`, `isMenuflowConfigured` (tâche 14) ; `menuflowBlocks` déjà rendu par la tâche 5.
- Produces:
  - `buildMenuflowSections({ pairings, openedByDay, tastings, inventoryById, appUrl, today, tz, now, horizonMonths }): { accords, couldHave, forgotten } | null` (forme `nl.menuflow`, tâche 5)
  - `collectMenuflowSections({ since, now, tz, settings }): Promise<… | null>`

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/menuflow.sections.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { buildMenuflowSections } from '../../src/menuflow/newsletterSections.js';

const APP = 'https://cave.example.com';
const TZ = 'Europe/Paris';
const NOW = new Date('2026-11-01T08:00:00Z');
const wines = [
  { id: 'a', name: 'Saumur-Champigny', vintage: 2019, inventoryCount: 2, peakStart: 2022, peakEnd: 2026 },
  { id: 'b', name: 'Chenin', vintage: 2020, inventoryCount: 1, peakStart: 2023, peakEnd: 2030 },
  { id: 'c', name: 'Épuisé', vintage: 2015, inventoryCount: 0 },
];
const p = (d, dish, extra = {}) => ({ dinnerDate: d, dishTitle: dish, verdicts: [], suggestedWineId: null, suggestionReason: null, suggestedForTitle: null, ...extra });
const base = (extra = {}) => ({
  pairings: [], openedByDay: new Map(), tastings: [], inventoryById: new Map(wines.map((w) => [w.id, w])),
  appUrl: APP, today: '2026-11-01', tz: TZ, now: NOW, horizonMonths: 12, ...extra,
});

describe('buildMenuflowSections', () => {
  it('rien à dire : null', () => {
    expect(buildMenuflowSections(base())).toBeNull();
  });

  it('vos accords : plat × vin, verdicts et note de dégustation', () => {
    const s = buildMenuflowSections(base({
      pairings: [p('2026-10-12', 'Poulet basquaise', { verdicts: [{ author: 'laure', rating: 'top' }, { author: 'xavier', rating: 'tres_bon' }] })],
      openedByDay: new Map([['2026-10-12', [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]]]),
      tastings: [{ wineId: 'a', date: '2026-10-12T20:00:00Z', overallRating: 16 }],
    }));
    expect(s.accords).toEqual([{ date: '12/10', dish: 'Poulet basquaise', wine: 'Saumur-Champigny 2019', verdict: 'Laure : top · Xavier : très bon', rating: '16/20', url: `${APP}/wine/a` }]);
    expect(s.forgotten).toEqual([]);
  });

  it('vous auriez pu : dîners passés sans bouteille, vins en stock d’abord, 3 au plus', () => {
    const s = buildMenuflowSections(base({
      pairings: [
        p('2026-10-14', 'Gratin de courge', { suggestedWineId: 'b', suggestionReason: 'Fraîcheur', suggestedForTitle: 'Gratin de courge' }),
        p('2026-10-15', 'Daube', { suggestedWineId: 'c', suggestionReason: 'x', suggestedForTitle: 'Daube' }),
        p('2026-10-16', 'Risotto', { suggestedWineId: 'a', suggestionReason: 'y', suggestedForTitle: 'Risotto' }),
        p('2026-10-17', 'Pizza', { suggestedWineId: 'a', suggestionReason: 'z', suggestedForTitle: 'Autre plat' }),
        p('2026-11-03', 'Futur', { suggestedWineId: 'a', suggestionReason: 'w', suggestedForTitle: 'Futur' }),
      ],
    }));
    expect(s.couldHave.map((c) => c.date)).toEqual(['16/10', '14/10', '15/10']); // a (SE_REFERME) puis b (en stock) puis c (épuisé)
    expect(s.couldHave[1]).toEqual({ date: '14/10', dish: 'Gratin de courge', wine: 'Chenin 2020', reason: 'Fraîcheur', url: `${APP}/wine/b` });
  });

  it('d’ailleurs : bouteille ouverte un soir de dîner sans dégustation depuis', () => {
    const s = buildMenuflowSections(base({
      pairings: [p('2026-10-12', 'Poulet basquaise'), p('2026-10-20', 'Soupe')],
      openedByDay: new Map([
        ['2026-10-12', [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]],
        ['2026-10-20', [{ wineId: 'b', wineName: 'Chenin', wineVintage: 2020 }]],
      ]),
      tastings: [{ wineId: 'b', date: '2026-10-21T10:00:00Z', overallRating: 15 }],
    }));
    expect(s.forgotten).toEqual([{ date: '12/10', dish: 'Poulet basquaise', wine: 'Saumur-Champigny 2019', url: `${APP}/tasting/a` }]);
  });

  it('limites : 8 accords, 3 oublis', () => {
    const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(10 + i).padStart(2, '0')}`);
    const s = buildMenuflowSections(base({
      pairings: days.map((d) => p(d, `Plat ${d}`)),
      openedByDay: new Map(days.map((d) => [d, [{ wineId: 'a', wineName: 'Saumur-Champigny', wineVintage: 2019 }]])),
    }));
    expect(s.accords).toHaveLength(8);
    expect(s.accords[0].date).toBe('19/10'); // plus récent d'abord
    expect(s.forgotten).toHaveLength(3);
  });
});
```

Run: `cd backend && npx vitest run tests/unit/menuflow.sections.test.js` → FAIL.

- [ ] **Step 2: Implement `backend/src/menuflow/newsletterSections.js`**

```js
// Rubriques MenuFlow de la newsletter (sans appel IA) : vos accords du mois,
// vous auriez pu…, d'ailleurs… vous avez oublié de noter.
import { pool } from '../db.js';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { convertKeysToCamelCase } from '../utils/case.js';
import { classifyWine, rank } from '../notifications/classify.js';
import { wineLabel, dayMonth } from '../notifications/format.js';
import { isMenuflowConfigured } from './client.js';
import { loadPairings, openedByDay, localDay } from './sync.js';

const VERDICTS = { top: 'top', tres_bon: 'très bon', bon: 'bon', moyen: 'moyen', a_ne_pas_refaire: 'à ne pas refaire' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const label = (o) => [o.wineName, o.wineVintage].filter(Boolean).join(' ');
const asDate = (day) => new Date(`${day}T12:00:00Z`);

export const buildMenuflowSections = ({ pairings, openedByDay: opened, tastings, inventoryById, appUrl, today, tz, now, horizonMonths }) => {
  const tastedSince = (wineId, day) => tastings.some((t) => t.wineId === wineId && localDay(new Date(t.date), tz) >= day);
  const ratingOn = (wineId, day) => {
    const t = tastings.find((x) => x.wineId === wineId && localDay(new Date(x.date), tz) >= day && x.overallRating != null);
    return t ? `${Number(t.overallRating)}/20` : null;
  };
  const recentFirst = [...pairings].sort((a, b) => b.dinnerDate.localeCompare(a.dinnerDate));

  const accords = recentFirst
    .flatMap((p) => (opened.get(p.dinnerDate) || []).map((o) => ({
      date: dayMonth(asDate(p.dinnerDate), tz),
      dish: p.dishTitle,
      wine: label(o),
      verdict: (p.verdicts || []).map((v) => `${cap(v.author)} : ${VERDICTS[v.rating] || v.rating}`).join(' · ') || null,
      rating: o.wineId ? ratingOn(o.wineId, p.dinnerDate) : null,
      url: o.wineId ? `${appUrl}/wine/${o.wineId}` : appUrl,
    })))
    .slice(0, 8);

  const urgency = (w) => {
    if (!w || (w.inventoryCount ?? 0) <= 0) return -1;
    const c = classifyWine(w, { horizonMonths, now, tz });
    return c ? rank(c.state) : 0;
  };
  const couldHave = pairings
    .filter((p) => p.dinnerDate < today && !(opened.get(p.dinnerDate) || []).length)
    .filter((p) => p.suggestedWineId && p.suggestedForTitle === p.dishTitle && inventoryById.has(p.suggestedWineId))
    .map((p) => ({ p, w: inventoryById.get(p.suggestedWineId) }))
    .sort((a, b) => urgency(b.w) - urgency(a.w) || b.p.dinnerDate.localeCompare(a.p.dinnerDate))
    .slice(0, 3)
    .map(({ p, w }) => ({
      date: dayMonth(asDate(p.dinnerDate), tz),
      dish: p.dishTitle,
      wine: wineLabel(w),
      reason: p.suggestionReason || null,
      url: `${appUrl}/wine/${w.id}`,
    }));

  const forgotten = recentFirst
    .flatMap((p) => (opened.get(p.dinnerDate) || [])
      .filter((o) => o.wineId && !tastedSince(o.wineId, p.dinnerDate))
      .map((o) => ({ date: dayMonth(asDate(p.dinnerDate), tz), dish: p.dishTitle, wine: label(o), url: `${appUrl}/tasting/${o.wineId}` })))
    .slice(0, 3);

  return accords.length || couldHave.length || forgotten.length ? { accords, couldHave, forgotten } : null;
};

export const collectMenuflowSections = async ({ since, now, tz, settings }) => {
  if (!isMenuflowConfigured()) return null;
  const from = localDay(since, tz);
  const today = localDay(now, tz);
  const [pairings, opened, inventory, tastings] = await Promise.all([
    loadPairings(from, today),
    openedByDay(from, tz),
    loadInventory(),
    pool.query('SELECT wine_id, date, overall_rating FROM tasting_notes WHERE date >= $1', [since]),
  ]);
  return buildMenuflowSections({
    pairings: pairings.filter((p) => p.dinnerDate < today || p.dinnerDate === today),
    openedByDay: opened,
    tastings: convertKeysToCamelCase(tastings.rows),
    inventoryById: new Map(inventory.map((w) => [w.id, w])),
    appUrl: APP_URL,
    today,
    tz,
    now,
    horizonMonths: settings.horizonMonths,
  });
};
```

Vérifier, pour le test « vous auriez pu », l'ordre attendu : `a` (2022-2026, en novembre 2026 → SE_REFERME, rang 2), `b` (2023-2030 → PRET, rang 1), `c` (épuisé, -1) ; `Pizza` est écarté (conseil fait pour un autre plat) et `Futur` (à venir). Ajuster le test si `classifyWine` donne un autre rang, en gardant l'intention : en stock et urgent d'abord.

- [ ] **Step 3: Wire `composeNewsletter`** — dans `backend/src/notifications/newsletter.js`, importer `collectMenuflowSections` et remplacer `composeNewsletter` par :

```js
export const composeNewsletter = async (settings, { now = new Date(), tz = notifyTz(), withAi }) => {
  const since = periodStart(settings, now);
  const [data, menuflow] = await Promise.all([
    collectNewsletterData({ since }),
    collectMenuflowSections({ since, now, tz, settings }).catch((error) => {
      console.error('[newsletter] rubriques MenuFlow :', error.message);
      return null;
    }),
  ]);
  const note = withAi
    ? await generateSommelierNote({ inventory: data.inventory, settings, now, tz, accords: menuflow?.accords ?? [] })
    : null;
  return buildNewsletter(data, { settings, now, tz, since, appUrl: APP_URL, note, menuflow });
};
```

(Attention à l'import circulaire `newsletter.js` → `menuflow/newsletterSections.js` → `menuflow/sync.js` → `notifications/newsletter.js` (`loadLocations`). Si Node signale une valeur `undefined` à l'import, déplacer `loadLocations` dans un petit module `backend/src/services/locations.js` importé par les deux.)

- [ ] **Step 4: Run tests** — `cd backend && npx vitest run` → PASS ; contrôle visuel : régénérer l'aperçu HTML de la tâche 5 avec des rubriques MenuFlow factices et le comparer au style de l'exemple.

- [ ] **Step 5: Commit**

```bash
git add backend/src/menuflow/newsletterSections.js backend/src/notifications/newsletter.js backend/tests/unit/menuflow.sections.test.js
git commit -m "Passerelle MenuFlow (3) : vos accords du mois, vous auriez pu…, dégustations oubliées dans la newsletter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Routes `/api/menuflow/*` et `forDinner` dans le journal

**Files:**
- Create: `backend/src/routes/menuflow.js`
- Modify: `backend/src/routes/history.js`, `backend/src/app.js`
- Test: `backend/tests/api/menuflow.routes.test.js`

**Interfaces:**
- Consumes: `menuflowStatus`, `loadTonight`, `suggestFor`, `pushDay`, `pushToday`, `openedByDay`, `localDay`, `isMenuflowConfigured` (tâche 14) ; `loadLocations` ; `isNoteAvailable`.
- Produces (JSON) :
  - `GET /api/menuflow/status` → `{ configured, lastSyncAt, lastError }`
  - `GET /api/menuflow/tonight` → `{ configured: false }` ou `{ configured: true, dinner: { date, title, verdicts } | null, suggested: { wineId, wine, vintage, reason, location } | null, opened: [{ wineId, wine, vintage }] }`
  - `POST /api/menuflow/tonight/resuggest` → même forme que `tonight` ; 404 sans dîner ; 409 `{ error: 'IA non configurée sur le serveur' }` ; limiteur IA
  - `POST /api/history` accepte `forDinner` (booléen ou nul) → `journal.for_dinner` ; après une sortie `OUT`, `pushToday()` en arrière-plan

- [ ] **Step 1: Write the failing test** — `backend/tests/api/menuflow.routes.test.js` :

```js
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

vi.mock('../../src/sommelier/pairForDish.js', async (orig) => ({ ...(await orig()), pairForDish: vi.fn() }));
vi.mock('../../src/notifications/sommelierNote.js', async (orig) => ({ ...(await orig()), isNoteAvailable: vi.fn(() => true) }));
const { pairForDish } = await import('../../src/sommelier/pairForDish.js');
const { isNoteAvailable } = await import('../../src/notifications/sommelierNote.js');

describe.skipIf(!hasDb)('API passerelle MenuFlow', () => {
  let client;
  let wineA;
  let wineB;
  let puts;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    puts = [];
    vi.stubEnv('MENUFLOW_URL', 'http://menuflow.test');
    vi.stubEnv('MENUFLOW_TOKEN', 'mf_tok');
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === `/api/v1/dinners/by-date/${today}` && (init.method || 'GET') === 'GET') return Response.json({ id: 9, date: today, title: 'Poulet basquaise', verdicts: [] });
      if (init.method === 'PUT') { puts.push(JSON.parse(init.body)); return Response.json({}); }
      return new Response(null, { status: 204 });
    }));
    const add = async (name) => {
      const { rows } = await pool.query(`INSERT INTO wines (name, vintage, type) VALUES ($1, 2019, 'RED') RETURNING id`, [name]);
      await pool.query('INSERT INTO bottles (wine_id) VALUES ($1)', [rows[0].id]);
      return rows[0].id;
    };
    wineA = await add('Alpha');
    wineB = await add('Bravo');
    pairForDish.mockReset();
    isNoteAvailable.mockReturnValue(true);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(() => pool.end());

  it('non configuré : configured false', async () => {
    vi.stubEnv('MENUFLOW_URL', '');
    expect((await client.get('/api/menuflow/tonight')).body).toEqual({ configured: false });
    expect((await client.get('/api/menuflow/status')).body.configured).toBe(false);
  });

  it('tonight lit le dîner du jour ; resuggest exclut le vin précédent et pousse', async () => {
    const t = await client.get('/api/menuflow/tonight');
    expect(t.body).toMatchObject({ configured: true, dinner: { date: today, title: 'Poulet basquaise' }, suggested: null, opened: [] });

    pairForDish.mockResolvedValueOnce({ picks: { safe: { wine_id: wineA, reason: 'Fruit' }, personal: null, creative: null } });
    const first = await client.post('/api/menuflow/tonight/resuggest', {});
    expect(first.body.suggested).toMatchObject({ wineId: wineA, wine: 'Alpha', reason: 'Fruit' });

    pairForDish.mockResolvedValueOnce({ picks: { safe: { wine_id: wineB, reason: 'Autre' }, personal: null, creative: null } });
    const second = await client.post('/api/menuflow/tonight/resuggest', {});
    expect(pairForDish).toHaveBeenLastCalledWith(expect.objectContaining({ dish: 'Poulet basquaise', exclude: [wineA] }));
    expect(second.body.suggested.wine).toBe('Bravo');
    expect(puts.at(-1).suggested.wine).toBe('Bravo');
  });

  it('resuggest sans IA : 409', async () => {
    isNoteAvailable.mockReturnValue(false);
    expect((await client.post('/api/menuflow/tonight/resuggest', {})).status).toBe(409);
  });

  it('journal : forDinner enregistré', async () => {
    const r = await client.post('/api/history', { type: 'OUT', wineId: wineA, wineName: 'Alpha', quantity: 1, forDinner: false });
    expect(r.status).toBe(201);
    expect(r.body.forDinner).toBe(false);
  });

  it('authentification requise', async () => {
    expect((await api().get('/api/menuflow/tonight')).status).toBe(401);
  });
});
```

Run (avec base) → FAIL.

- [ ] **Step 2: Implement `backend/src/routes/menuflow.js`**

```js
// Passerelle MenuFlow à la demande : état de la liaison, accord du soir, autre idée.
import { Router } from 'express';
import { APP_URL } from '../config.js';
import { loadInventory } from '../services/inventory.js';
import { isNoteAvailable } from '../notifications/sommelierNote.js';
import { loadLocations } from '../notifications/newsletter.js';
import { notifyTz } from '../notifications/schedule.js';
import { isMenuflowConfigured } from '../menuflow/client.js';
import { menuflowStatus, loadTonight, suggestFor, pushDay, openedByDay } from '../menuflow/sync.js';

const router = Router();

const tonightResponse = async (row, { inventory, tz }) => {
  if (!row) return { configured: true, dinner: null, suggested: null, opened: [] };
  const byId = new Map(inventory.map((w) => [w.id, w]));
  const locations = await loadLocations();
  const w = row.suggestedWineId && row.suggestedForTitle === row.dishTitle ? byId.get(row.suggestedWineId) : null;
  const opened = (await openedByDay(row.dinnerDate, tz)).get(row.dinnerDate) || [];
  return {
    configured: true,
    dinner: { date: row.dinnerDate, title: row.dishTitle, verdicts: row.verdicts || [] },
    suggested: w ? {
      wineId: w.id,
      wine: [w.name, w.cuvee].filter(Boolean).join(' '),
      vintage: w.vintage ?? null,
      reason: row.suggestionReason || null,
      location: locations.get(w.id) || null,
    } : null,
    opened: opened.map((o) => ({ wineId: o.wineId, wine: o.wineName, vintage: o.wineVintage ?? null })),
  };
};

router.get('/menuflow/status', (req, res) => res.json(menuflowStatus()));

router.get('/menuflow/tonight', async (req, res) => {
  if (!isMenuflowConfigured()) return res.json({ configured: false });
  try {
    const tz = notifyTz();
    res.json(await tonightResponse(await loadTonight({ tz }), { inventory: await loadInventory(), tz }));
  } catch (error) {
    console.error('menuflow tonight error:', error);
    res.status(502).json({ error: `MenuFlow indisponible : ${error.message}` });
  }
});

router.post('/menuflow/tonight/resuggest', async (req, res) => {
  if (!isMenuflowConfigured()) return res.status(404).json({ error: 'MenuFlow n’est pas relié' });
  if (!isNoteAvailable()) return res.status(409).json({ error: 'IA non configurée sur le serveur' });
  try {
    const tz = notifyTz();
    const row = await loadTonight({ tz });
    if (!row) return res.status(404).json({ error: 'Pas de dîner planifié ce soir' });
    const inventory = await loadInventory();
    const inventoryById = new Map(inventory.map((w) => [w.id, w]));
    const exclude = row.suggestedWineId ? [row.suggestedWineId] : [];
    await suggestFor(row, { inventoryById, exclude });
    await pushDay(row, {
      inventoryById,
      openedByDay: await openedByDay(row.dinnerDate, tz),
      locations: await loadLocations(),
      appUrl: APP_URL,
    }).catch((error) => console.error('[menuflow] envoi après « autre idée » :', error.message));
    res.json(await tonightResponse(row, { inventory, tz }));
  } catch (error) {
    console.error('menuflow resuggest error:', error);
    res.status(500).json({ error: 'Nouvelle suggestion impossible' });
  }
});

export default router;
```


- [ ] **Step 3: Mount + limiter** — `backend/src/app.js` : ajouter `'/api/menuflow/tonight/resuggest'` à la liste passée à `aiLimiter` ; `import menuflowRouter from './routes/menuflow.js';` et `app.use('/api', menuflowRouter);` après le routeur des notifications.

- [ ] **Step 4: Journal** — dans `backend/src/routes/history.js`, `POST /history` : ajouter la colonne `for_dinner` (14ᵉ paramètre) :

```js
    const forDinner = typeof entry.forDinner === 'boolean' ? entry.forDinner : null;
    const result = await pool.query(`
      INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, from_location, to_location, recipient, occasion, note, user_id, for_dinner)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      entry.date || new Date().toISOString(),
      entry.type || 'NOTE',
      entry.wineId || entry.wine_id || null,
      entry.wineName || entry.wine_name || 'Vin inconnu',
      entry.wineVintage || entry.wine_vintage || null,
      entry.quantity || null,
      entry.description || null,
      entry.fromLocation || entry.from_location || null,
      entry.toLocation || entry.to_location || null,
      entry.recipient || null,
      entry.occasion || null,
      entry.note || null,
      entry.userId || entry.user_id || null,
      forDinner,
    ]);
    if (result.rows[0].type === 'OUT') pushToday().catch(() => {}); // MenuFlow à jour sans attendre le tick
```

avec `import { pushToday } from '../menuflow/sync.js';`.

- [ ] **Step 5: Run tests** — avec base : `cd backend && TEST_DATABASE_URL=… npx vitest run tests/api` → PASS ; `node --check src/app.js`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/menuflow.js backend/src/routes/history.js backend/src/app.js backend/tests/api/menuflow.routes.test.js
git commit -m "Passerelle MenuFlow (4) : accord du soir à la demande, autre idée, bouteille rattachée au dîner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Interface VinoFlow — carte « Ce soir », case « Pour le dîner », état MenuFlow

**Files:**
- Create: `components/cockpit/TonightCard.tsx`, `components/cockpit/openBottle.tsx`
- Modify: `types.ts`, `services/storageService.ts`, `pages/CockpitDashboard.tsx`, `pages/CockpitWineDetails.tsx`, `pages/CockpitPlan.tsx`, `components/cockpit/NotificationSettings.tsx`

**Interfaces:**
- Consumes: API de la tâche 16.
- Produces: `<TonightCard />` ; `useOpenBottleConfirm(): (wineName: string) => Promise<{ forDinner: boolean | null } | null>` (null = annulé) ; `consumeSpecificBottle(wineId, bottleId, wineName, wineVintage, forDinner?)`.

- [ ] **Step 1: Types** — `types.ts` : ajouter `forDinner?: boolean | null;` à `JournalEntry`, puis :

```ts
// ─── Passerelle MenuFlow ───
export interface MenuflowStatus { configured: boolean; lastSyncAt: string | null; lastError: string | null; }
export interface TonightWine { wineId: string; wine: string; vintage: number | null; reason?: string | null; location?: string | null; }
export type TonightResponse =
  | { configured: false }
  | {
      configured: true;
      dinner: { date: string; title: string; verdicts: { author: string; rating: string }[] } | null;
      suggested: TonightWine | null;
      opened: TonightWine[];
    };
```

- [ ] **Step 2: API calls** — `services/storageService.ts` :

```ts
// --- MENUFLOW ---

export const getMenuflowStatus = async (): Promise<MenuflowStatus> => {
  const response = await apiFetch(`${API_URL}/menuflow/status`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getTonight = async (): Promise<TonightResponse> => {
  const response = await apiFetch(`${API_URL}/menuflow/tonight`, { headers: getHeaders() });
  return handleResponse(response);
};

export const resuggestTonight = async (): Promise<TonightResponse> => {
  const response = await apiFetch(`${API_URL}/menuflow/tonight/resuggest`, { method: 'POST', headers: getHeaders(), body: '{}' });
  return handleResponse(response);
};
```

et `consumeSpecificBottle` reçoit un 5ᵉ paramètre `forDinner: boolean | null = null` transmis à `addJournalEntry({ …, forDinner })`.

- [ ] **Step 3: Confirmation « Pour le dîner »** — `components/cockpit/openBottle.tsx` :

```tsx
import React, { useState } from 'react';
import { useConfirm } from './feedback';
import { getTonight } from '../../services/storageService';

const ForDinnerCheck: React.FC<{ dish: string; onChange: (v: boolean) => void }> = ({ dish, onChange }) => {
  const [checked, setChecked] = useState(true);
  return (
    <label className="flex items-center gap-2 text-sm text-stone-800">
      <input
        type="checkbox"
        className="h-4 w-4 accent-wine-700"
        checked={checked}
        onChange={(e) => { setChecked(e.target.checked); onChange(e.target.checked); }}
      />
      Pour le dîner : <span className="serif-it">{dish}</span>
    </label>
  );
};

/** Confirmation d'ouverture ; propose de rattacher la bouteille au dîner MenuFlow du jour. */
export const useOpenBottleConfirm = () => {
  const confirm = useConfirm();
  return async (wineName: string): Promise<{ forDinner: boolean | null } | null> => {
    let dish: string | null = null;
    try {
      const tonight = await getTonight();
      dish = tonight.configured && tonight.dinner ? tonight.dinner.title : null;
    } catch {
      dish = null;
    }
    const choice = { forDinner: true };
    const ok = await confirm({
      title: `Ouvrir une bouteille de ${wineName} ?`,
      message: (
        <div className="space-y-3">
          <p>Elle sera retirée du stock et notée dans le journal.</p>
          {dish && <ForDinnerCheck dish={dish} onChange={(v) => { choice.forDinner = v; }} />}
        </div>
      ),
      confirmLabel: 'Ouvrir',
    });
    if (!ok) return null;
    return { forDinner: dish ? choice.forDinner : null };
  };
};
```

- [ ] **Step 4: Use it** — `pages/CockpitWineDetails.tsx`, `handleConsume` :

```tsx
  const confirmOpen = useOpenBottleConfirm();
  // …
  const handleConsume = async (bottle: Bottle) => {
    if (!wine) return;
    const choice = await confirmOpen(wine.name);
    if (!choice) return;
    try {
      await consumeSpecificBottle(wine.id, bottle.id, wine.name, wine.vintage, choice.forDinner);
      toast.success('Bouteille ouverte — santé !', { label: 'Noter', onClick: () => navigate(`/tasting/${wine.id}`) });
    } catch {
      toast.error('La bouteille n’a pas pu être retirée du stock.');
    }
    refreshWines();
  };
```

`pages/CockpitPlan.tsx` (ligne ~316) : lire le flux autour de `consumeSpecificBottle` ; s'il passe par une confirmation, la remplacer par `useOpenBottleConfirm` de la même façon ; sinon, appeler `confirmOpen` avant `act(…)` et transmettre `choice.forDinner`. `components/SommelierV2.tsx` reste inchangé (rattachement automatique : `forDinner` nul).

- [ ] **Step 5: Carte « Ce soir »** — `components/cockpit/TonightCard.tsx` :

```tsx
import React, { useEffect, useState } from 'react';
import { GlassWater, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { Button, Card, MonoLabel, WineLink } from './primitives';
import { useToast } from './feedback';
import { useOpenBottleConfirm } from './openBottle';
import { consumeSpecificBottle, getBottles, getTonight, resuggestTonight } from '../../services/storageService';
import { TonightResponse } from '../../types';

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erreur inconnue');
const label = (w: { wine: string; vintage: number | null }) => (w.vintage ? `${w.wine} ${w.vintage}` : w.wine);

/** Dîner MenuFlow du jour et vin conseillé dans la cave (absent si MenuFlow n'est pas relié). */
export const TonightCard: React.FC = () => {
  const toast = useToast();
  const confirmOpen = useOpenBottleConfirm();
  const [tonight, setTonight] = useState<TonightResponse | null>(null);
  const [busy, setBusy] = useState<'resuggest' | 'open' | null>(null);

  useEffect(() => { getTonight().then(setTonight).catch(() => setTonight(null)); }, []);
  if (!tonight || !tonight.configured || !tonight.dinner) return null;
  const { dinner, suggested, opened } = tonight;

  const another = async () => {
    setBusy('resuggest');
    try { setTonight(await resuggestTonight()); } catch (e) { toast.error('Pas d’autre idée pour l’instant : ' + errMsg(e)); } finally { setBusy(null); }
  };

  const open = async () => {
    if (!suggested) return;
    const choice = await confirmOpen(suggested.wine);
    if (!choice) return;
    setBusy('open');
    try {
      const bottle = (await getBottles()).find((b) => b.wineId === suggested.wineId && !b.isConsumed);
      if (!bottle) throw new Error('plus de bouteille en stock');
      await consumeSpecificBottle(suggested.wineId, bottle.id, suggested.wine, suggested.vintage ?? undefined, choice.forDinner);
      toast.success('Bouteille ouverte — santé !');
      setTonight(await getTonight());
    } catch (e) {
      toast.error('La bouteille n’a pas pu être ouverte : ' + errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 md:p-5">
      <MonoLabel>◌ CE SOIR · MENUFLOW</MonoLabel>
      <h2 className="serif-it text-xl text-stone-900 leading-tight mt-1">{dinner.title}</h2>
      {opened.length > 0 ? (
        <p className="text-sm text-stone-600 mt-2">Ouvert ce soir : {opened.map(label).join(', ')}</p>
      ) : suggested ? (
        <div className="mt-3 space-y-1">
          <WineLink id={suggested.wineId} className="serif-it text-lg text-wine-800">{label(suggested)}</WineLink>
          {suggested.location && <p className="text-xs text-stone-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{suggested.location}</p>}
          {suggested.reason && <p className="text-sm text-stone-600 leading-relaxed">{suggested.reason}</p>}
        </div>
      ) : (
        <p className="text-sm text-stone-500 mt-2">Pas encore de vin conseillé pour ce plat.</p>
      )}
      {opened.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggested && (
            <Button size="sm" onClick={open} disabled={busy !== null}>
              {busy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GlassWater className="w-4 h-4" />} Ouvrir cette bouteille
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={another} disabled={busy !== null}>
            {busy === 'resuggest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {suggested ? 'Une autre idée' : 'Proposer un vin'}
          </Button>
        </div>
      )}
    </Card>
  );
};
```

`pages/CockpitDashboard.tsx` : importer `TonightCard` et l'insérer juste après le bloc « Que boire ce soir ? » (le premier bloc de la page), dans le même conteneur.

- [ ] **Step 6: État MenuFlow dans Réglages** — dans `NotificationSettings.tsx`, charger `getMenuflowStatus()` au montage et afficher, en tête de la carte :

```tsx
      {menuflow && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <Badge tone={menuflow.configured ? (menuflow.lastError ? 'warning' : 'success') : 'neutral'}>
            MenuFlow · {menuflow.configured ? 'relié' : 'non relié (MENUFLOW_URL / MENUFLOW_TOKEN)'}
          </Badge>
          {menuflow.lastSyncAt && <span>dernière synchro {new Date(menuflow.lastSyncAt).toLocaleString('fr-FR')}</span>}
          {menuflow.lastError && <span className="text-wine-700">{menuflow.lastError}</span>}
        </div>
      )}
```

- [ ] **Step 7: Typecheck, tests, build** — racine : `npm run typecheck && npm test && npm run build` → PASS.

- [ ] **Step 8: Visual check** — avec `docker compose up -d --build` (comme en tâche 9) et un MenuFlow local (`cd ~/Claude/MenuFlow/backend && uv run python scripts/dev_fake_server.py`, jeton write du faux serveur dans `MENUFLOW_URL`/`MENUFLOW_TOKEN` du `.env` de dev — depuis le conteneur, l'URL est `http://host.docker.internal:3113`) : carte « Ce soir » sur le tableau de bord (bureau + 375 px), « Une autre idée » (409 attendu sans clé IA → toast lisible), case « Pour le dîner » dans la confirmation d'ouverture, état MenuFlow dans Réglages. `docker compose down` ensuite.

- [ ] **Step 9: Commit**

```bash
git add types.ts services/storageService.ts components/cockpit/TonightCard.tsx components/cockpit/openBottle.tsx pages/CockpitDashboard.tsx pages/CockpitWineDetails.tsx pages/CockpitPlan.tsx components/cockpit/NotificationSettings.tsx
git commit -m "Passerelle MenuFlow (5) : carte « Ce soir », bouteille rattachée au dîner, état de la liaison

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Documentation, vérification complète et PR (deux dépôts)

**Files:**
- Modify: `CLAUDE.md` (VinoFlow)

- [ ] **Step 1: `CLAUDE.md` (VinoFlow)** — dans « Layout », après la puce `backend/src/enrichment/` :

```markdown
- `backend/src/notifications/` — alertes « à boire avant » et newsletter, réglées par compte (`notification_settings`) : `classify.js` (états GARDE/PRET/SE_REFERME/DEPASSEE, transitions), `schedule.js` (échéances en `NOTIFY_TZ`), `channels.js` (Gotify, email Sweego), `render.js` (gabarit email Cockpit, réf. `docs/superpowers/specs/newsletter-exemple.html`), `newsletter.js` + `sommelierNote.js` (tâche IA `newsletter`, facultative), `scheduler.js` (tick `NOTIFY_TICK_MINUTES`, verrou consultatif, état écrit seulement après un envoi réussi). Routes `/api/notifications/*`.
- `backend/src/menuflow/` — passerelle vers MenuFlow (planning des dîners, autre dépôt) : VinoFlow lit les dîners et pousse le vin conseillé / ouvert par date (`dinner_pairings`, `journal.for_dinner`), dans le tick des notifications ; rubriques MenuFlow de la newsletter ; routes `/api/menuflow/*`. Inactive sans `MENUFLOW_URL` + `MENUFLOW_TOKEN`. `sommelier/pairForDish.js` = accord partagé (route `/sommelier/pair`, passerelle).
```

- [ ] **Step 2: Full verification** —
  - VinoFlow : `cd backend && npx vitest run && node --check src/server.js` ; avec base : `TEST_DATABASE_URL=… npx vitest run` ; racine : `npm run typecheck && npm test && npm run build`.
  - MenuFlow : `cd ~/Claude/MenuFlow/backend && uv run pytest -q && uv run ruff check .` ; `cd ../web && npm test && npm run check && npm run build` ; `cd ../ios && xcodebuild … test`.
  - Reporter toute exception telle quelle (sortie à l'appui).

- [ ] **Step 3: Commit** (VinoFlow)

```bash
git add CLAUDE.md
git commit -m "Docs : notifications et passerelle MenuFlow dans CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: PR MenuFlow** (sans fusionner) — `cd ~/Claude/MenuFlow && git push -u origin claude/vin-du-diner && gh pr create --base main --title "Vin du dîner : affichage du vin conseillé par VinoFlow (backend, web, iPhone)" --body-file <fichier temporaire>`. Corps : résumé, D44, route et droits, captures web + simulateur, à faire en prod (migration au démarrage ; créer le jeton `vinoflow` en rôle write sur le NAS ; nouvelle version iOS 0.6.0 à publier par `scripts/release-ios.sh` si souhaité), plan de test ; finir par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 5: PR VinoFlow** (sans fusionner) — `git push -u origin claude/notifications-newsletter && gh pr create --base main --title "Notifications « à boire avant », newsletter Cockpit et passerelle MenuFlow" --body-file <fichier temporaire>`. Corps : résumé ; captures (carte Notifications, carte « Ce soir », aperçu de la newsletter) ; variables (`NOTIFICATIONS_ENABLED`, `NOTIFY_TZ`, `NOTIFY_TICK_MINUTES`, `VINOFLOW_*_NEWSLETTER`, `MENUFLOW_URL`, `MENUFLOW_TOKEN`) ; **dépend de la PR MenuFlow** (lien) ; à faire en prod : migrations 009 et 010 au démarrage ; email après `SWEEGO_API_KEY` + `MAIL_FROM` ; mot du sommelier et conseils de vin après `ANTHROPIC_API_KEY` ; passerelle après `MENUFLOW_URL` + `MENUFLOW_TOKEN` dans `backend/.env` du NAS ; **ordre** : MenuFlow puis VinoFlow ; correctif des apogées (`drink-before`, anticipation, export CSV) et nouveau calcul des mois restants ; plan de test. Finir par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 6: Suivi** — lier la PR VinoFlow via `ccd_pr` (`get_status`, `bind_pr` si besoin) et proposer Auto-fix si la CI échoue. **Ne pas fusionner, ne pas déployer.**
