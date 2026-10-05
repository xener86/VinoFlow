# Notifications « à boire avant » et newsletter — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque utilisateur reçoit sur Gotify et/ou par email des alertes quand un vin change d'état de garde, et une newsletter périodique (avec un « mot du sommelier » IA optionnel), réglées dans Réglages.

**Architecture:** Nouveau dossier `backend/src/notifications/` : fonctions pures (classification, planning, rendu) + accès base (`store.js`) + planificateur horaire intégré au backend sous verrou consultatif Postgres. Nouveau routeur `/api/notifications/*`, nouvelle carte Réglages côté front. Migration `009_notifications.sql`.

**Tech Stack:** Node 22 ESM + Express 4 + pg, Vitest 5 (+ supertest), React 19 + Vite + Tailwind, Gotify REST (`POST /message`), Sweego via `mailService.js`, Claude via `aiService.js`.

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
- Branche `claude/notifications-newsletter` ; ni fusion ni déploiement NAS sans accord explicite.
- Commandes : `cd backend && npx vitest run <fichier>` (unitaires) ; tests d'API seulement avec `TEST_DATABASE_URL` (base **vidée**) ; front : `npm run typecheck`, `npm test`, `npm run build`.

## Review Focus

1. **Nom de vin contenant du HTML/markdown** (`<b>`, `[x](y)`) : l'email doit l'échapper, jamais l'interpréter. → test dans la tâche 5.
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
| `backend/src/notifications/render.js` (créé) | Pur : `renderAlert`, `renderNewsletter`, `testMessage` |
| `backend/src/notifications/sommelierNote.js` (créé) | `isNoteAvailable`, `buildNoteInput`, `sanitizeNote`, `generateSommelierNote` |
| `backend/src/notifications/newsletter.js` (créé) | `collectNewsletterData` (base), `buildNewsletter` (pur), `composeNewsletter` |
| `backend/src/notifications/scheduler.js` (créé) | `runNotificationTick`, `startNotificationScheduler` |
| `backend/src/routes/notifications.js` (créé) | Routes `/notifications/*` |
| `backend/src/services/mailService.js` (modifié) | `renderMailHtml` accepte `sections` |
| `backend/src/services/aiService.js` (modifié) | Tâche `newsletter` |
| `backend/src/sommelier/schemas.js` (modifié) | `NEWSLETTER_NOTE_SCHEMA` |
| `backend/src/sommelier/proactive.js` (modifié) | `drinkBeforeAlerts` via `classifyWine`, `anticipationForEvent` via `getPeakWindow(w)` |
| `backend/src/middleware/rateLimits.js`, `backend/src/app.js`, `backend/src/server.js` (modifiés) | Limiteur, montage du routeur, démarrage du planificateur |
| `utils/exportCsv.ts` (modifié) | `getPeakWindow(w)` |
| `types.ts`, `services/storageService.ts` (modifiés) | Types et appels API |
| `components/cockpit/NotificationSettings.tsx` (créé), `pages/Settings.tsx` (modifié) | Carte Réglages |
| `.env.example`, `docker-compose.yml`, `CLAUDE.md` (modifiés) | Variables et doc |
| Tests : `backend/tests/unit/notifications.*.test.js`, `backend/tests/unit/proactive.test.js`, `backend/tests/api/notifications.test.js` | |

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

### Task 5: Rendu des messages (alerte, newsletter, test) + sections dans les emails

**Files:**
- Create: `backend/src/notifications/format.js`, `backend/src/notifications/render.js`
- Modify: `backend/src/services/mailService.js` (`renderMailHtml`)
- Test: `backend/tests/unit/notifications.render.test.js`

**Interfaces:**
- Consumes: transitions de `detectTransitions` (tâche 2) ; objet newsletter produit par `buildNewsletter` (tâche 6, forme ci-dessous) ; `renderMailHtml`.
- Produces:
  - `format.js` : `wineLabel(wine): string`, `stateLabel({ state, peakStart, peakEnd, estimated }): string`, `euros(n): string`, `periodTitle(settings, now, tz): string`
  - `render.js` : `renderAlert(transitions, { appUrl }): Message`, `renderNewsletter(nl): Message`, `testMessage(): Message` avec `Message = { title, markdown, priority, subject, text, html }`
  - `renderMailHtml({ title, paragraphs, sections = [], cta, footer })` où `sections = [{ title, lines: [{ text, url? }] }]`
  - Forme `nl` (produite en tâche 6) : `{ subject, title, appUrl, stats: { bottlesIn, bottlesOut, spent, cellarValue, bottlesInCellar }, sections: [{ title, lines: [{ text, url? }] }], note: { intro, picks: [{ wine, reason }], seasonalPairing, closing } | null }`

- [ ] **Step 1: Write the failing test** — `backend/tests/unit/notifications.render.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { renderAlert, renderNewsletter, testMessage } from '../../src/notifications/render.js';
import { wineLabel, stateLabel, periodTitle } from '../../src/notifications/format.js';

const APP = 'https://cave.example.com';
const wine = (id, name, extra = {}) => ({ id, name, vintage: 2015, inventoryCount: 2, ...extra });
const t = (w, to, extra = {}) => ({ wine: w, from: 'PRET', to, peakStart: 2018, peakEnd: 2026, monthsLeft: 3, estimated: false, ...extra });

describe('format', () => {
  it('libellés', () => {
    expect(wineLabel({ name: 'Château X', cuvee: 'Réserve', vintage: 2015 })).toBe('Château X Réserve 2015');
    expect(stateLabel({ state: 'SE_REFERME', peakStart: 2018, peakEnd: 2026, estimated: true })).toBe('à boire avant fin 2026 (estimée)');
    expect(stateLabel({ state: 'DEPASSEE', peakStart: 2010, peakEnd: 2020, estimated: false })).toBe('apogée dépassée (fin 2020)');
    expect(stateLabel({ state: 'PRET', peakStart: 2024, peakEnd: 2030, estimated: false })).toBe('en apogée 2024–2030');
  });
  it('titre de période', () => {
    const now = new Date('2026-11-01T08:00:00Z');
    expect(periodTitle({ newsletterFrequency: 'monthly' }, now, 'Europe/Paris')).toBe('novembre 2026');
    expect(periodTitle({ newsletterFrequency: 'weekly' }, now, 'Europe/Paris')).toBe('semaine du 1 novembre 2026');
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
    expect(m.html).toContain(`${APP}/wine/b`);
    expect(m.subject).toBe('VinoFlow — 3 vins changent d’état');
  });
  it('un seul vin, priorité 4 sans apogée dépassée', () => {
    const m = renderAlert([t(wine('a', 'Alpha'), 'SE_REFERME')], { appUrl: APP });
    expect(m.title).toBe('1 vin change d’état');
    expect(m.priority).toBe(4);
  });
  it('échappe le HTML des noms de vin dans l’email et neutralise le markdown', () => {
    const m = renderAlert([t(wine('a', '<b>Pirate</b> [x](http://evil)'), 'PRET')], { appUrl: APP });
    expect(m.html).not.toContain('<b>Pirate</b>');
    expect(m.html).toContain('&lt;b&gt;Pirate&lt;/b&gt;');
    expect(m.markdown).not.toContain('](http://evil)');
  });
});

describe('renderNewsletter', () => {
  const nl = {
    subject: 'VinoFlow — votre cave, novembre 2026',
    title: 'Votre cave — novembre 2026',
    appUrl: APP,
    stats: { bottlesIn: 3, bottlesOut: 2, spent: 120, cellarValue: 4300, bottlesInCellar: 152 },
    sections: [
      { title: 'À ouvrir en priorité', lines: Array.from({ length: 7 }, (_, i) => ({ text: `Vin ${i}`, url: `${APP}/wine/${i}` })) },
      { title: 'Dégustations', lines: [{ text: 'Alpha 2015 — 17/20' }] },
    ],
    note: { intro: 'x'.repeat(900), picks: [{ wine: wine('a', 'Alpha'), reason: 'parfait en automne' }], seasonalPairing: 'Gibier', closing: null },
  };
  it('email complet, Gotify court (5 vins, mot tronqué), lien vers l’app', () => {
    const m = renderNewsletter(nl);
    expect(m.subject).toBe(nl.subject);
    expect(m.html).toContain('Vin 6');
    expect(m.html).toContain('Le mot du sommelier');
    expect(m.markdown).toContain('Vin 4');
    expect(m.markdown).not.toContain('Vin 5');
    expect(m.markdown).toContain(`[Ouvrir VinoFlow](${APP})`);
    expect(m.markdown.length).toBeLessThan(2000);
    expect(m.text).toContain('Vin 6');
    expect(m.priority).toBe(4);
  });
  it('sans mot du sommelier : pas de section', () => {
    expect(renderNewsletter({ ...nl, note: null }).html).not.toContain('Le mot du sommelier');
  });
});

describe('testMessage', () => {
  it('message de test lisible', () => {
    expect(testMessage().title).toBe('VinoFlow — test de notification');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd backend && npx vitest run tests/unit/notifications.render.test.js` → FAIL.

- [ ] **Step 3: Extend `renderMailHtml` in `backend/src/services/mailService.js`** — remplacer la fonction par :

```js
// Gabarit HTML minimal et sobre, partagé par tous les emails VinoFlow.
// sections : [{ title, lines: [{ text, url? }] }] (listes de la newsletter, des alertes).
export const renderMailHtml = ({ title, paragraphs, sections = [], cta, footer = [] }) => `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Georgia,serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:32px">
<p style="margin:0 0 24px;font-size:20px;color:#7f1d1d">VinoFlow</p>
<h1 style="font-size:18px;font-weight:normal;margin:0 0 16px">${escapeHtml(title)}</h1>
${paragraphs.map((p) => `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;margin:0 0 16px">${escapeHtml(p)}</p>`).join('\n')}
${sections.map((s) => `<h2 style="font-size:15px;font-weight:normal;color:#7f1d1d;margin:24px 0 8px">${escapeHtml(s.title)}</h2>
<ul style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;margin:0 0 16px;padding-left:20px">
${s.lines.map((l) => `<li>${l.url ? `<a href="${escapeHtml(l.url)}" style="color:#7f1d1d">${escapeHtml(l.text)}</a>` : escapeHtml(l.text)}</li>`).join('\n')}
</ul>`).join('\n')}
${cta ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#7f1d1d;color:#fff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;padding:12px 20px;border-radius:6px">${escapeHtml(cta.label)}</a></p>
<p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#78716c;word-break:break-all;margin:0 0 16px">${escapeHtml(cta.url)}</p>` : ''}
${footer.map((p) => `<p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#78716c;margin:0 0 12px">${escapeHtml(p)}</p>`).join('\n')}
</div></body></html>`;
```

- [ ] **Step 4: Implement `backend/src/notifications/format.js`**

```js
// Libellés partagés par les alertes, la newsletter et le mot du sommelier.
import { notifyTz } from './schedule.js';

export const wineLabel = (wine) =>
  [wine.name, wine.cuvee, wine.vintage].filter((v) => v !== null && v !== undefined && v !== '').join(' ');

export const stateLabel = ({ state, peakStart, peakEnd, estimated }) => {
  const base = {
    GARDE: `en garde jusqu’en ${peakStart}`,
    PRET: `en apogée ${peakStart}–${peakEnd}`,
    SE_REFERME: `à boire avant fin ${peakEnd}`,
    DEPASSEE: `apogée dépassée (fin ${peakEnd})`,
  }[state];
  return estimated ? `${base} (estimée)` : base;
};

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const euros = (n) => EUR.format(Number(n) || 0);

export const periodTitle = (settings, now, tz = notifyTz()) => {
  if (settings.newsletterFrequency === 'weekly') {
    return `semaine du ${new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(now)}`;
  }
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, month: 'long', year: 'numeric' }).format(now);
};
```

- [ ] **Step 5: Implement `backend/src/notifications/render.js`**

```js
// Mise en forme des messages : markdown court pour Gotify, HTML + texte pour l'email.
import { renderMailHtml } from '../services/mailService.js';
import { wineLabel, stateLabel, euros } from './format.js';

// Neutralise la syntaxe markdown dans un texte venu de la base (noms de vins).
const md = (s) => String(s).replace(/([\\`*_[\]()#<>!|])/g, '\\$1');

const GROUPS = [
  { state: 'DEPASSEE', title: 'Apogée dépassée' },
  { state: 'SE_REFERME', title: 'Fenêtre qui se referme' },
  { state: 'PRET', title: 'Entrés en apogée' },
];

export const renderAlert = (transitions, { appUrl }) => {
  const n = transitions.length;
  const title = n === 1 ? '1 vin change d’état' : `${n} vins changent d’état`;
  const sections = GROUPS
    .map((g) => ({
      title: g.title,
      lines: transitions.filter((t) => t.to === g.state).map((t) => ({
        label: wineLabel(t.wine),
        detail: `${stateLabel(t)} · ${t.wine.inventoryCount} bt`,
        url: `${appUrl}/wine/${t.wine.id}`,
      })),
    }))
    .filter((s) => s.lines.length > 0);
  const markdown = sections
    .map((s) => `**${s.title}**\n${s.lines.map((l) => `- [${md(l.label)}](${l.url}) — ${md(l.detail)}`).join('\n')}`)
    .join('\n\n');
  const mailSections = sections.map((s) => ({ title: s.title, lines: s.lines.map((l) => ({ text: `${l.label} — ${l.detail}`, url: l.url })) }));
  const text = mailSections.map((s) => `${s.title}\n${s.lines.map((l) => `- ${l.text} : ${l.url}`).join('\n')}`).join('\n\n');
  return {
    title,
    markdown,
    priority: transitions.some((t) => t.to === 'DEPASSEE') ? 5 : 4,
    subject: `VinoFlow — ${title}`,
    text,
    html: renderMailHtml({ title, paragraphs: [], sections: mailSections, cta: { label: 'Ouvrir VinoFlow', url: appUrl }, footer: ['Réglez ces alertes dans VinoFlow › Réglages › Notifications.'] }),
  };
};

const statsSentence = (s) =>
  `${s.bottlesIn} bouteille(s) entrée(s), ${s.bottlesOut} sortie(s), ${euros(s.spent)} dépensés. ` +
  `En cave : ${s.bottlesInCellar} bouteille(s), valeur d’achat ${euros(s.cellarValue)}.`;

const noteSection = (note, appUrl) => ({
  title: 'Le mot du sommelier',
  lines: note.picks.map((p) => ({ text: `${wineLabel(p.wine)} — ${p.reason}`, url: `${appUrl}/wine/${p.wine.id}` })),
});

const truncate = (s, max) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export const renderNewsletter = (nl) => {
  const { note, appUrl } = nl;
  const noteParagraphs = note ? [note.intro, note.seasonalPairing, note.closing].filter(Boolean) : [];
  const mailSections = [...nl.sections, ...(note && note.picks.length ? [noteSection(note, appUrl)] : [])];
  const html = renderMailHtml({
    title: nl.title,
    paragraphs: [statsSentence(nl.stats)],
    sections: [
      ...nl.sections,
      ...(note ? [{ title: 'Le mot du sommelier', lines: [...noteParagraphs.map((text) => ({ text })), ...noteSection(note, appUrl).lines] }] : []),
    ],
    cta: { label: 'Ouvrir VinoFlow', url: appUrl },
    footer: ['Fréquence et canaux : VinoFlow › Réglages › Notifications.'],
  });
  const text = [
    nl.title, '', statsSentence(nl.stats), '',
    ...mailSections.flatMap((s) => [s.title, ...s.lines.map((l) => `- ${l.text}${l.url ? ` : ${l.url}` : ''}`), '']),
    ...noteParagraphs, '', appUrl,
  ].join('\n');
  const first = nl.sections.find((s) => s.title === 'À ouvrir en priorité');
  const markdown = [
    `**Bilan** : ${md(statsSentence(nl.stats))}`,
    first ? `**À ouvrir en priorité**\n${first.lines.slice(0, 5).map((l) => `- [${md(l.text)}](${l.url})`).join('\n')}` : null,
    note ? `**Le mot du sommelier**\n${md(truncate(note.intro, 600))}` : null,
    `[Ouvrir VinoFlow](${appUrl})`,
  ].filter(Boolean).join('\n\n');
  return { title: nl.title, markdown, priority: 4, subject: nl.subject, text, html };
};

export const testMessage = () => {
  const title = 'VinoFlow — test de notification';
  const body = 'Si vous lisez ceci, les notifications VinoFlow arrivent bien sur ce canal.';
  return {
    title,
    markdown: body,
    priority: 4,
    subject: title,
    text: body,
    html: renderMailHtml({ title, paragraphs: [body] }),
  };
};
```

- [ ] **Step 6: Run tests** — `cd backend && npx vitest run tests/unit/notifications.render.test.js tests/unit` → PASS (y compris les tests existants qui utilisent `renderMailHtml`, ex. `auth`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/notifications/format.js backend/src/notifications/render.js backend/src/services/mailService.js backend/tests/unit/notifications.render.test.js
git commit -m "Notifications (5) : mise en forme des alertes, de la newsletter et du message de test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Newsletter (données, composition) et mot du sommelier IA

**Files:**
- Create: `backend/src/notifications/sommelierNote.js`, `backend/src/notifications/newsletter.js`
- Modify: `backend/src/services/aiService.js` (`TASK_DEFAULTS`), `backend/src/sommelier/schemas.js`, `.env.example`
- Test: `backend/tests/unit/notifications.newsletter.test.js`

**Interfaces:**
- Consumes: `classifyWine`, `rank` (tâche 2) ; `wineLabel`, `stateLabel`, `periodTitle` (tâche 5) ; `periodStart`, `zonedParts`, `notifyTz` (tâche 2) ; `loadInventory` (`backend/src/services/inventory.js`) ; `generateJson`, `isProviderConfigured` (`aiService.js`) ; `APP_URL` (`backend/src/config.js`).
- Produces:
  - `NEWSLETTER_NOTE_SCHEMA`
  - `isNoteAvailable(): boolean`, `buildNoteInput(inventory, { settings, now, tz }): { mois, vins: [...] }`, `sanitizeNote(raw, winesById: Map): note | null`, `generateSommelierNote({ inventory, settings, now, tz, timeoutMs = 30000 }): Promise<note | null>`
  - `collectNewsletterData({ since }): Promise<{ inventory, journal, spending, cellarValue, tastings, locations: Map<wineId, string> }>`
  - `buildNewsletter(data, { settings, now, tz, appUrl, note }): nl` (forme décrite en tâche 5)
  - `composeNewsletter(settings, { now, tz, withAi }): Promise<nl>`

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
const APP = 'https://cave.example.com';
const settings = { horizonMonths: 12, newsletterFrequency: 'monthly' };
const w = (id, extra = {}) => ({ id, name: `Vin ${id}`, vintage: 2015, type: 'RED', region: 'Bordeaux', inventoryCount: 2, ...extra });

const data = (inventory, extra = {}) => ({
  inventory,
  journal: [{ type: 'IN', quantity: 6 }, { type: 'OUT', quantity: 1 }, { type: 'GIFT', quantity: 1 }, { type: 'MOVE', quantity: 3 }],
  spending: { count: 6, total: 90 },
  cellarValue: 1234.5,
  tastings: [{ wineId: 'p', name: 'Vin p', vintage: 2015, date: '2026-10-20', overallRating: 17 }],
  locations: new Map([['d', 'Cave du bas']]),
  ...extra,
});

describe('buildNewsletter', () => {
  const inventory = [
    w('d', { peakStart: 2010, peakEnd: 2020 }),            // DEPASSEE
    w('f', { peakStart: 2020, peakEnd: 2026 }),            // SE_REFERME
    w('n', { peakStart: 2026, peakEnd: 2032 }),            // PRET, entré cette année
    w('p', { peakStart: 2022, peakEnd: 2032 }),            // PRET depuis longtemps
    w('g', { peakStart: 2030, peakEnd: 2040 }),            // GARDE
  ];

  it('sections, bilan et liens', () => {
    const nl = buildNewsletter(data(inventory), { settings, now: NOW, tz: TZ, appUrl: APP, note: null });
    expect(nl.subject).toBe('VinoFlow — votre cave, novembre 2026');
    expect(nl.title).toBe('Votre cave — novembre 2026');
    expect(nl.stats).toEqual({ bottlesIn: 6, bottlesOut: 2, spent: 90, cellarValue: 1234.5, bottlesInCellar: 10 });
    const titles = nl.sections.map((s) => s.title);
    expect(titles).toEqual(['À ouvrir en priorité', 'Entrés en apogée', 'Dégustations']);
    const urgent = nl.sections[0].lines;
    expect(urgent.map((l) => l.url)).toEqual([`${APP}/wine/d`, `${APP}/wine/f`]);
    expect(urgent[0].text).toContain('Cave du bas');
    expect(nl.sections[1].lines.map((l) => l.url)).toEqual([`${APP}/wine/n`]);
    expect(nl.sections[2].lines[0].text).toBe('Vin p 2015 — 17/20 (20/10/2026)');
  });

  it('au plus 10 vins à ouvrir', () => {
    const many = Array.from({ length: 15 }, (_, i) => w(`x${i}`, { peakStart: 2010, peakEnd: 2020 }));
    expect(buildNewsletter(data(many), { settings, now: NOW, tz: TZ, appUrl: APP, note: null }).sections[0].lines).toHaveLength(10);
  });

  it('cave vide : bilan à zéro, aucune section, pas d’erreur', () => {
    const nl = buildNewsletter(
      { inventory: [], journal: [], spending: { count: 0, total: 0 }, cellarValue: 0, tastings: [], locations: new Map() },
      { settings, now: NOW, tz: TZ, appUrl: APP, note: null }
    );
    expect(nl.sections).toEqual([]);
    expect(nl.stats).toEqual({ bottlesIn: 0, bottlesOut: 0, spent: 0, cellarValue: 0, bottlesInCellar: 0 });
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

  it('buildNoteInput : vins classés, plus urgents d’abord', () => {
    const input = buildNoteInput(inventory, { settings, now: NOW, tz: TZ });
    expect(input.mois).toBe('novembre 2026');
    expect(input.vins.map((v) => v.id)).toEqual(['a', 'b']);
    expect(input.vins[0]).toMatchObject({ etat: 'DEPASSEE', apogee: '2010-2020', stock: 2 });
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

et dans `.env.example`, à côté des autres surcharges `VINOFLOW_*` :

```
# VINOFLOW_MODEL_NEWSLETTER=claude-sonnet-5-5
# VINOFLOW_MAX_TOKENS_NEWSLETTER=1500
```

(Vérifier le format exact de `envKey(task)` dans `aiService.js` : `newsletter` → `NEWSLETTER`.)

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
avec ce qui est en cave. Ton chaleureux et précis, 120 mots au plus pour l'intro.
Règles : ne cite QUE des vins de la liste fournie, par leur id dans "picks" (3 au plus) ;
privilégie les vins dont l'état est DEPASSEE ou SE_REFERME ; n'invente ni vin, ni note, ni prix.`;

export const isNoteAvailable = () => isProviderConfigured('claude') || isProviderConfigured('gemini');

export const buildNoteInput = (inventory, { settings, now, tz }) => {
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

export const generateSommelierNote = async ({ inventory, settings, now, tz, timeoutMs = 30_000 }) => {
  if (!isNoteAvailable()) return null;
  const input = buildNoteInput(inventory, { settings, now, tz });
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
import { wineLabel, stateLabel, periodTitle } from './format.js';
import { periodStart, zonedParts, notifyTz } from './schedule.js';
import { generateSommelierNote } from './sommelierNote.js';

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
    pool.query(
      `SELECT DISTINCT ON (b.wine_id) b.wine_id,
         COALESCE(r.name, CASE WHEN jsonb_typeof(b.location) = 'string' THEN b.location #>> '{}' END) AS label
       FROM bottles b LEFT JOIN racks r ON r.id::text = b.location->>'rackId'
       WHERE b.is_consumed = false
       ORDER BY b.wine_id, r.name NULLS LAST`
    ),
  ]);
  return {
    inventory,
    journal: journal.rows,
    spending: spending.rows[0],
    cellarValue: value.rows[0].total,
    tastings: convertKeysToCamelCase(tastings.rows),
    locations: new Map(locations.rows.filter((r) => r.label).map((r) => [r.wine_id, r.label])),
  };
};

const sumJournal = (journal, types) =>
  journal.filter((j) => types.includes(j.type)).reduce((s, j) => s + Number(j.quantity || 1), 0);

const shortDate = (d, tz) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

export const buildNewsletter = (data, { settings, now, tz = notifyTz(), appUrl, note }) => {
  const { year } = zonedParts(now, tz);
  const classified = data.inventory
    .map((wine) => ({ wine, c: classifyWine(wine, { horizonMonths: settings.horizonMonths, now, tz }) }))
    .filter(({ c }) => c);
  const line = ({ wine, c }) => {
    const where = data.locations.get(wine.id);
    return {
      text: `${wineLabel(wine)} — ${wine.inventoryCount} bt${where ? ` · ${where}` : ''} · ${stateLabel(c)}`,
      url: `${appUrl}/wine/${wine.id}`,
    };
  };
  const urgent = classified
    .filter(({ c }) => c.state === 'DEPASSEE' || c.state === 'SE_REFERME')
    .sort((a, b) => a.c.monthsLeft - b.c.monthsLeft)
    .slice(0, 10);
  const ready = classified.filter(({ c }) => c.state === 'PRET' && c.peakStart === year);
  const tastings = data.tastings.map((t) => ({
    text: `${wineLabel(t)}${t.overallRating != null ? ` — ${Number(t.overallRating)}/20` : ''} (${shortDate(t.date, tz)})`,
    url: `${appUrl}/wine/${t.wineId}`,
  }));
  const sections = [
    { title: 'À ouvrir en priorité', lines: urgent.map(line) },
    { title: 'Entrés en apogée', lines: ready.map(line) },
    { title: 'Dégustations', lines: tastings },
  ].filter((s) => s.lines.length > 0);
  const period = periodTitle(settings, now, tz);
  return {
    subject: `VinoFlow — votre cave, ${period}`,
    title: `Votre cave — ${period}`,
    appUrl,
    stats: {
      bottlesIn: sumJournal(data.journal, ['IN']),
      bottlesOut: sumJournal(data.journal, ['OUT', 'GIFT']),
      spent: Number(data.spending.total) || 0,
      cellarValue: Number(data.cellarValue) || 0,
      bottlesInCellar: data.inventory.reduce((s, w) => s + (w.inventoryCount || 0), 0),
    },
    sections,
    note,
  };
};

export const composeNewsletter = async (settings, { now = new Date(), tz = notifyTz(), withAi }) => {
  const data = await collectNewsletterData({ since: periodStart(settings, now) });
  const note = withAi ? await generateSommelierNote({ inventory: data.inventory, settings, now, tz }) : null;
  return buildNewsletter(data, { settings, now, tz, appUrl: APP_URL, note });
};
```

Note : dans le test `Dégustations`, `wineLabel(t)` reçoit `{ name, cuvee, vintage }` de la requête (cuvee absente → ignorée).

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
    const message = testMessage();
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

### Task 10: Documentation et PR

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`** — dans « Layout », après la puce `backend/src/enrichment/` :

```markdown
- `backend/src/notifications/` — alertes « à boire avant » et newsletter, réglées par compte (`notification_settings`) : `classify.js` (états GARDE/PRET/SE_REFERME/DEPASSEE, transitions), `schedule.js` (échéances en `NOTIFY_TZ`), `channels.js` (Gotify, email Sweego), `render.js`, `newsletter.js` + `sommelierNote.js` (tâche IA `newsletter`, facultative), `scheduler.js` (tick `NOTIFY_TICK_MINUTES`, verrou consultatif, état écrit seulement après un envoi réussi). Routes `/api/notifications/*`.
```

- [ ] **Step 2: Full verification** — `cd backend && npx vitest run && node --check src/server.js` ; si une base de test est disponible : `TEST_DATABASE_URL=… npx vitest run` ; racine : `npm run typecheck && npm test && npm run build`. Toutes vertes ; reporter toute exception telle quelle.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Docs : module de notifications dans CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the PR** (sans fusionner)

```bash
git push -u origin claude/notifications-newsletter
gh pr create --base main --title "Notifications « à boire avant » et newsletter de la cave" --body-file <fichier temporaire>
```

Corps de la PR (français) : résumé ; captures de la carte Réglages ; variables (`NOTIFICATIONS_ENABLED`, `NOTIFY_TZ`, `NOTIFY_TICK_MINUTES`, surcharges `VINOFLOW_*_NEWSLETTER`) ; **à faire en prod** : migration 009 appliquée au démarrage ; email opérationnel après `SWEEGO_API_KEY` + `MAIL_FROM` dans `backend/.env` du NAS ; mot du sommelier après `ANTHROPIC_API_KEY` ; ajouter les trois variables `NOTIFY_*`/`NOTIFICATIONS_ENABLED` au compose propre au NAS si on veut s'écarter des défauts ; correctif des apogées (`drink-before`, anticipation, export CSV) ; plan de test. Terminer par :

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Puis lier la PR via les outils `ccd_pr` (`get_status`, `bind_pr` si besoin). **Ne pas fusionner, ne pas déployer.**
