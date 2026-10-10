# Partage public (fiche vin, carte des vins d'un dîner) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partager par un lien public (sans compte) une fiche vin ou la carte des vins d'un dîner composée à la main ; révocation et compteur d'ouvertures dans Réglages.

**Architecture:** Côté serveur, une table `shares` (+ `share_items`) et un jeton 256 bits ; un routeur authentifié (`routes/shares.js`) pour créer / lister / modifier / révoquer, et une **seule** route publique en lecture seule (`routes/publicShares.js`, montée avant `authenticate`, limiteur dédié par IP) dont la réponse est construite par une fonction pure à liste blanche (`shares/publicView.js`). Côté front, une page publique autonome `/p/:token` hors `ProtectedRoute`, un compositeur de carte (`/partages/diner`), des boutons sur la fiche vin et une section « Liens partagés » dans Réglages.

**Tech Stack:** Express 4 ESM + Postgres 16 (migration 013), Vitest + supertest ; React 19 + react-router + Tailwind (Cockpit), Vitest (`utils/`).

**Spec:** `docs/superpowers/specs/2026-10-07-partage-public-design.md`

## Global Constraints

- Commits et textes d'interface en français ; pas de classes `dark:`.
- Migration `013_shares.sql` (012 pris par l'ajout rapide), idempotente, **sans** `BEGIN`/`COMMIT`.
- Jeton : `crypto.randomBytes(32).toString('base64url')` (43 caractères, `^[A-Za-z0-9_-]{43}$`).
- Route publique : `GET /api/public/shares/:token`, montée **avant** `authenticate`, limiteur `publicLimiter` 120 requêtes / 15 min / IP, en-têtes `X-Robots-Tag: noindex, nofollow` et `Cache-Control: no-store`. Jeton inconnu, mal formé ou révoqué → **404** `{ error: 'Ce lien n’est plus actif.' }` (réponse identique).
- Liste blanche publique, par vin : `position, dish, name, cuvee, producer, vintage, type, appellation, region, country, grapeVarieties, sensoryDescription, aromaProfile, suggestedFoodPairings, tastings[{ date, rating, comment }]`. Jamais : prix, cote, bouteilles, emplacements, stock, apogée, identifiants internes (`id`, `wineId`), occasion ni convives.
- Carte de dîner : 1 à 20 vins, titre 1–120 caractères, `dish` ≤ 200, date `AAAA-MM-JJ` facultative.
- Réponse de création / modification : `{ id, token, kind, url }` avec `url` = `/p/<token>`.
- Front : l'appel public n'utilise pas `apiFetch` (pas de jeton, pas de déconnexion sur erreur) ; page `/p/:token` hors `ProtectedRoute` et hors `CockpitLayout` ; `<meta name="robots" content="noindex">` ajoutée à l'affichage.
- Cave partagée : aucun filtre par utilisateur ; tous les comptes voient et révoquent tous les liens.

## Prérequis pour les tests d'API

Les tests `backend/tests/api` ne tournent que si `TEST_DATABASE_URL` est défini (la base est **vidée**). En local, lancer un Postgres pgvector jetable sur un port libre :

```bash
docker run -d --name vinoflow-test-pg -p 5436:5432 -e POSTGRES_USER=vinoflow -e POSTGRES_PASSWORD=vinoflow -e POSTGRES_DB=vinoflow_test pgvector/pgvector:pg16
```

puis `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:5436/vinoflow_test npm test`. Le conteneur se supprime avec `docker rm -f vinoflow-test-pg`.

## Review Focus

- **Dégustation express** (`general_notes` est un JSON `{ phrase, dish, occasion, … }`) : la page publique doit montrer la seule `phrase`, jamais le JSON ni `occasion` — test Tâche 3 (`tastingComment`).
- **Vin supprimé après partage** : lien de fiche → 404 « plus actif » ; carte → le vin disparaît et les numéros se resserrent (1, 2, 3 sans trou) — tests Tâches 3 et 5.
- **Date `2026-02-30` ou `2026-13-01`** envoyée par un client : 400 lisible, pas d'erreur Postgres 500 — test Tâche 2 (`validateDinner`).
- **Jeton tronqué ou de 44 caractères** collé dans l'URL : 404 identique, sans requête SQL — tests Tâches 2 et 5.
- **`navigator.share` absent (bureau) ou annulé par l'utilisateur** : copie dans le presse-papiers + toast « Lien copié », ou silence si annulé, jamais d'erreur — `shareLink` Tâche 6 (comportement documenté, non testable sans DOM) ; `serverMessage` testé pour afficher l'erreur du serveur en toast.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `db/migrations/013_shares.sql` | tables `shares`, `share_items` |
| `backend/src/shares/token.js` | `newShareToken`, `isShareToken` |
| `backend/src/shares/validate.js` | `ShareError`, `isUuid`, `validateDinner` |
| `backend/src/shares/publicView.js` | `tastingComment`, `publicTastings`, `toPublicShare` (liste blanche) |
| `backend/src/shares/store.js` | requêtes SQL (liste, lecture, création, modification, révocation, lecture publique + compteur) |
| `backend/src/routes/shares.js` | routes authentifiées `/api/shares*` |
| `backend/src/routes/publicShares.js` | route publique `/api/public/shares/:token` |
| `backend/src/middleware/rateLimits.js` (mod.) | `publicLimiter` |
| `backend/src/app.js` (mod.) | montage des deux routeurs |
| `backend/tests/unit/shares.*.test.js`, `backend/tests/api/shares.test.js`, `backend/tests/api/migrations.test.js` (mod.), `backend/tests/api/helpers.js` (mod.) | tests |
| `types.ts` (mod.) | `ShareKind`, `ShareSummary`, `ShareEditor`, `ShareCreated`, `DinnerShareInput`, `PublicShare`, `PublicShareWine`, `PublicTasting` |
| `services/storageService.ts` (mod.) | `listShares`, `getShare`, `createWineShare`, `createDinnerShare`, `updateDinnerShare`, `revokeShare`, `fetchPublicShare`, `PublicShareError` |
| `utils/shareView.ts` (+ test) | `stars`, `formatLongDate`, `formatShortDate`, `typeLabel`, `typeDotClass`, `moveItem`, `filterShareCandidates`, `serverMessage`, `shareUrl` |
| `utils/shareLink.ts` | `shareLink(url, title)` : `navigator.share` sinon presse-papiers |
| `pages/PublicShare.tsx` | page publique `/p/:token` |
| `pages/ShareDinner.tsx` | compositeur `/partages/diner`, `/partages/diner/:id` |
| `components/cockpit/SharedLinksSection.tsx` | section Réglages « Liens partagés » |
| `pages/CockpitWineDetails.tsx` (mod.), `pages/Settings.tsx` (mod.), `components/cockpit/CommandPalette.tsx` (mod.), `App.tsx` (mod.), `CLAUDE.md` (mod.) | intégration |

---

### Task 1: Migration 013 (tables `shares`, `share_items`)

**Files:**
- Create: `db/migrations/013_shares.sql`
- Modify: `backend/tests/api/migrations.test.js` (nouveau cas), `backend/tests/api/helpers.js:12-16` (TRUNCATE)

**Interfaces:**
- Produces: tables `shares(id, token, kind, wine_id, title, dinner_date, created_by, created_at, revoked_at, view_count, last_viewed_at)` et `share_items(share_id, position, wine_id, dish)`.

- [ ] **Step 1: Écrire le test de migration**

Dans `backend/tests/api/migrations.test.js`, après le cas `011 :` :

```js
  it('013 : shares et share_items, cascade depuis wines', async () => {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('shares', 'share_items') ORDER BY table_name`);
    expect(rows.map((r) => r.table_name)).toEqual(['share_items', 'shares']);
    const fk = await pool.query(`SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'shares'::regclass AND contype = 'f'`);
    expect(fk.rows.map((r) => r.confdeltype)).toEqual(['c']);
  });
```

Dans `backend/tests/api/helpers.js`, ajouter `shares, share_items` à la liste `TRUNCATE` :

```js
  await pool.query(`TRUNCATE users, wines, bottles, racks, spirits,
  tasting_notes, journal, wishlist, pairing_feedback, pairing_cache, taste_profile,
  refresh_tokens, password_reset_tokens, cocktails, dinner_pairings, shares, share_items CASCADE`);
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:5436/vinoflow_test npx vitest run tests/api/migrations.test.js`
Expected: FAIL (`['share_items','shares']` attendu, `[]` reçu).

- [ ] **Step 3: Écrire la migration**

`db/migrations/013_shares.sql` :

```sql
-- Partage public : lien vers une fiche vin (kind = WINE) ou vers la carte des
-- vins d'un dîner composée à la main (kind = DINNER, lignes dans share_items).
-- Jeton 256 bits en base64url (43 caractères) ; révocation définitive ;
-- compteur d'ouvertures. Supprimer un vin supprime son lien de fiche et le
-- retire des cartes (cascade).
CREATE TABLE IF NOT EXISTS shares (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    token text NOT NULL UNIQUE,
    kind text NOT NULL CHECK (kind IN ('WINE', 'DINNER')),
    wine_id uuid REFERENCES wines(id) ON DELETE CASCADE,
    title text,
    dinner_date date,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    view_count integer NOT NULL DEFAULT 0,
    last_viewed_at timestamp with time zone,
    CHECK ((kind = 'WINE' AND wine_id IS NOT NULL) OR (kind = 'DINNER' AND title IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS shares_wine_id_idx ON shares (wine_id);

CREATE TABLE IF NOT EXISTS share_items (
    share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    position integer NOT NULL,
    wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
    dish text,
    PRIMARY KEY (share_id, position)
);
CREATE INDEX IF NOT EXISTS share_items_wine_id_idx ON share_items (wine_id);
```

- [ ] **Step 4: Relancer le test**

Run: même commande qu'à l'étape 2.
Expected: PASS (le `globalSetup` reconstruit la base avec le runner).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/013_shares.sql backend/tests/api/migrations.test.js backend/tests/api/helpers.js
git commit -m "Partage public : migration 013 (shares, share_items)"
```

---

### Task 2: Jeton et validation (fonctions pures)

**Files:**
- Create: `backend/src/shares/token.js`, `backend/src/shares/validate.js`, `backend/tests/unit/shares.validate.test.js`

**Interfaces:**
- Produces: `newShareToken() → string` (43 car.), `isShareToken(value) → boolean` ; `class ShareError extends Error { status, message }` ; `isUuid(value) → boolean` ; `validateDinner(body) → { title: string, date: string|null, items: [{ wineId: string, dish: string|null }] }` ou lance `ShareError(400, message)` ; constantes `MAX_ITEMS = 20`, `MAX_TITLE = 120`, `MAX_DISH = 200`.

- [ ] **Step 1: Écrire les tests**

`backend/tests/unit/shares.validate.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { newShareToken, isShareToken } from '../../src/shares/token.js';
import { ShareError, isUuid, validateDinner } from '../../src/shares/validate.js';

const WINE = '11111111-2222-4333-8444-555555555555';
const err = (body) => { try { validateDinner(body); } catch (e) { return e; } return null; };

describe('jeton de partage', () => {
  it('43 caractères base64url, unique', () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isShareToken(a)).toBe(true);
  });
  it('refuse les jetons tronqués, trop longs ou étrangers', () => {
    expect(isShareToken(newShareToken().slice(0, 42))).toBe(false);
    expect(isShareToken(`${newShareToken()}A`)).toBe(false);
    expect(isShareToken('abc/def+ghi=')).toBe(false);
    expect(isShareToken(undefined)).toBe(false);
  });
});

describe('validateDinner', () => {
  it('normalise titre, date, plats', () => {
    expect(validateDinner({ title: '  Dîner du 11  ', date: '2026-10-11', items: [{ wineId: WINE, dish: ' Gigot ' }, { wineId: WINE }] }))
      .toEqual({ title: 'Dîner du 11', date: '2026-10-11', items: [{ wineId: WINE, dish: 'Gigot' }, { wineId: WINE, dish: null }] });
    expect(validateDinner({ title: 'x', date: '', items: [{ wineId: WINE }] }).date).toBeNull();
  });
  it('titre vide ou trop long → 400', () => {
    expect(err({ title: '  ', items: [{ wineId: WINE }] })).toMatchObject({ status: 400, message: 'Donne un titre à la carte.' });
    expect(err({ title: 'a'.repeat(121), items: [{ wineId: WINE }] })).toMatchObject({ status: 400 });
    expect(err({ title: 'a'.repeat(120), items: [{ wineId: WINE }] })).toBeNull();
  });
  it('0 ou 21 vins → 400', () => {
    expect(err({ title: 'x', items: [] })).toMatchObject({ status: 400, message: 'Ajoute au moins un vin à la carte.' });
    expect(err({ title: 'x' })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', items: Array.from({ length: 21 }, () => ({ wineId: WINE })) })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', items: Array.from({ length: 20 }, () => ({ wineId: WINE })) })).toBeNull();
  });
  it('vin invalide, plat trop long → 400', () => {
    expect(err({ title: 'x', items: [{ wineId: 'pas-un-uuid' }] })).toMatchObject({ status: 400, message: 'Vin n°1 invalide.' });
    expect(err({ title: 'x', items: [{ wineId: WINE, dish: 'a'.repeat(201) }] })).toMatchObject({ status: 400 });
  });
  it('date : AAAA-MM-JJ et jour réel', () => {
    expect(err({ title: 'x', date: '11/10/2026', items: [{ wineId: WINE }] })).toMatchObject({ status: 400, message: 'La date doit être au format AAAA-MM-JJ.' });
    expect(err({ title: 'x', date: '2026-02-30', items: [{ wineId: WINE }] })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', date: '2026-13-01', items: [{ wineId: WINE }] })).toMatchObject({ status: 400 });
    expect(err({ title: 'x', date: '2028-02-29', items: [{ wineId: WINE }] })).toBeNull();
  });
  it('ShareError garde le statut', () => {
    const e = new ShareError(409, 'révoqué');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(409);
    expect(isUuid(WINE)).toBe(true);
    expect(isUuid('x')).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `cd backend && npx vitest run tests/unit/shares.validate.test.js`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`backend/src/shares/token.js` :

```js
import { randomBytes } from 'node:crypto';

// 256 bits en base64url = 43 caractères, sans '=' de remplissage.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const newShareToken = () => randomBytes(32).toString('base64url');

// Un jeton mal formé est refusé avant toute requête SQL (404 indistinct).
export const isShareToken = (value) => typeof value === 'string' && TOKEN_RE.test(value);
```

`backend/src/shares/validate.js` :

```js
// Validation des cartes de dîner : messages en français, statut HTTP porté
// par l'erreur (400 corps invalide, 404 inconnu, 409 révoqué).
export class ShareError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

export const MAX_ITEMS = 20;
export const MAX_TITLE = 120;
export const MAX_DISH = 200;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// « 2026-02-30 » passe la regex mais pas le calendrier : on reconstruit la
// date en UTC et on vérifie qu'elle n'a pas glissé (sinon Postgres renverrait
// une erreur 500 peu lisible).
const isCalendarDate = (value) => {
  const m = typeof value === 'string' ? DATE_RE.exec(value) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
};

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

export const validateDinner = (body) => {
  const title = cleanText(body?.title);
  if (!title) throw new ShareError(400, 'Donne un titre à la carte.');
  if (title.length > MAX_TITLE) throw new ShareError(400, `Le titre ne doit pas dépasser ${MAX_TITLE} caractères.`);

  let date = null;
  if (body?.date !== undefined && body?.date !== null && body?.date !== '') {
    if (!isCalendarDate(body.date)) throw new ShareError(400, 'La date doit être au format AAAA-MM-JJ.');
    date = body.date;
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length < 1) throw new ShareError(400, 'Ajoute au moins un vin à la carte.');
  if (rawItems.length > MAX_ITEMS) throw new ShareError(400, `Une carte compte au plus ${MAX_ITEMS} vins.`);

  const items = rawItems.map((item, i) => {
    if (!isUuid(item?.wineId)) throw new ShareError(400, `Vin n°${i + 1} invalide.`);
    const dish = cleanText(item.dish);
    if (dish.length > MAX_DISH) throw new ShareError(400, `Le plat du vin n°${i + 1} ne doit pas dépasser ${MAX_DISH} caractères.`);
    return { wineId: item.wineId, dish: dish || null };
  });

  return { title, date, items };
};
```

- [ ] **Step 4: Relancer**

Run: `cd backend && npx vitest run tests/unit/shares.validate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/shares/token.js backend/src/shares/validate.js backend/tests/unit/shares.validate.test.js
git commit -m "Partage public : jeton 256 bits et validation des cartes de dîner"
```

---

### Task 3: Vue publique à liste blanche (`toPublicShare`)

**Files:**
- Create: `backend/src/shares/publicView.js`, `backend/tests/unit/shares.publicView.test.js`

**Interfaces:**
- Consumes: lignes SQL en `snake_case` (`wines`: `id, name, cuvee, producer, vintage, type, appellation, region, country, grape_varieties, sensory_description, aroma_profile, suggested_food_pairings` ; `tasting_notes`: `wine_id, date, overall_rating, general_notes` ; items `{ position, wine_id, dish }` ; share `{ kind, title, dinner_date }`).
- Produces: `tastingComment(generalNotes) → string|null` ; `publicTastings(rows) → [{ date: ISO, rating, comment }]` (tri date décroissante, sans note ni commentaire ignorées) ; `toPublicShare(share, items, wines, tastings) → { kind, title, date, wines: [...] }` (liste blanche, positions renumérotées 1..n).

- [ ] **Step 1: Écrire les tests**

`backend/tests/unit/shares.publicView.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { tastingComment, publicTastings, toPublicShare } from '../../src/shares/publicView.js';

const wine = (id, over = {}) => ({
  id, name: `Vin ${id}`, cuvee: null, producer: 'Domaine', vintage: 2018, type: 'RED', appellation: 'Pommard',
  region: 'Bourgogne', country: 'France', grape_varieties: ['Pinot noir'], sensory_description: 'Soyeux',
  aroma_profile: ['cerise'], suggested_food_pairings: ['gigot'],
  // Colonnes qui ne doivent JAMAIS sortir :
  peak_start: 2024, peak_end: 2032, purchase_price: 40, embedding: [0.1], user_id: 'u', valuation_status: 'ok',
  ...over,
});
const ALLOWED = new Set(['position', 'dish', 'name', 'cuvee', 'producer', 'vintage', 'type', 'appellation', 'region', 'country',
  'grapeVarieties', 'sensoryDescription', 'aromaProfile', 'suggestedFoodPairings', 'tastings', 'date', 'rating', 'comment']);
const keysDeep = (value, acc = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, acc));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { acc.add(k); keysDeep(v, acc); });
  return acc;
};

describe('tastingComment', () => {
  it('texte brut, JSON de la dégustation express, vide', () => {
    expect(tastingComment('Superbe')).toBe('Superbe');
    expect(tastingComment(JSON.stringify({ phrase: 'Une claque', occasion: 'Noël', dish: 'Chapon' }))).toBe('Une claque');
    expect(tastingComment(JSON.stringify({ phrase: '', occasion: 'Noël' }))).toBeNull();
    expect(tastingComment('   ')).toBeNull();
    expect(tastingComment(null)).toBeNull();
  });
});

describe('publicTastings', () => {
  it('trie par date décroissante, ignore les dégustations vides, ne garde que date/rating/comment', () => {
    const rows = [
      { wine_id: 'a', date: new Date('2025-01-01T12:00:00Z'), overall_rating: 3, general_notes: 'Bien', occasion: 'Repas', companions: 'Marc' },
      { wine_id: 'a', date: new Date('2026-01-01T12:00:00Z'), overall_rating: 5, general_notes: null },
      { wine_id: 'a', date: new Date('2024-01-01T12:00:00Z'), overall_rating: null, general_notes: '' },
    ];
    expect(publicTastings(rows)).toEqual([
      { date: '2026-01-01T12:00:00.000Z', rating: 5, comment: null },
      { date: '2025-01-01T12:00:00.000Z', rating: 3, comment: 'Bien' },
    ]);
  });
});

describe('toPublicShare', () => {
  it('fiche vin : un seul vin, titre et date nuls, aucune clé hors liste blanche', () => {
    const out = toPublicShare({ kind: 'WINE', title: null, dinner_date: null }, [{ position: 1, wine_id: 'a', dish: null }], [wine('a')], []);
    expect(out).toEqual({
      kind: 'WINE', title: null, date: null,
      wines: [{
        position: 1, dish: null, name: 'Vin a', cuvee: null, producer: 'Domaine', vintage: 2018, type: 'RED', appellation: 'Pommard',
        region: 'Bourgogne', country: 'France', grapeVarieties: ['Pinot noir'], sensoryDescription: 'Soyeux', aromaProfile: ['cerise'],
        suggestedFoodPairings: ['gigot'], tastings: [],
      }],
    });
    for (const key of keysDeep(out.wines)) expect(ALLOWED.has(key), `clé interdite : ${key}`).toBe(true);
  });

  it('carte : ordre des positions, plats, dégustations par vin, vin supprimé retiré et numéros resserrés', () => {
    const share = { kind: 'DINNER', title: 'Dîner', dinner_date: '2026-10-11' };
    const items = [
      { position: 3, wine_id: 'c', dish: 'Fromages' },
      { position: 1, wine_id: 'a', dish: 'Huîtres' },
      { position: 2, wine_id: 'zz-supprimé', dish: null },
    ];
    const tastings = [{ wine_id: 'c', date: new Date('2026-01-01T12:00:00Z'), overall_rating: 4, general_notes: 'Top' }];
    const out = toPublicShare(share, items, [wine('a'), wine('c')], tastings);
    expect(out.title).toBe('Dîner');
    expect(out.date).toBe('2026-10-11');
    expect(out.wines.map((w) => [w.position, w.name, w.dish])).toEqual([[1, 'Vin a', 'Huîtres'], [2, 'Vin c', 'Fromages']]);
    expect(out.wines[0].tastings).toEqual([]);
    expect(out.wines[1].tastings).toEqual([{ date: '2026-01-01T12:00:00.000Z', rating: 4, comment: 'Top' }]);
    for (const key of keysDeep(out)) expect(new Set([...ALLOWED, 'kind', 'title', 'wines']).has(key), `clé interdite : ${key}`).toBe(true);
  });

  it('tableaux absents → tableaux vides', () => {
    const out = toPublicShare({ kind: 'WINE' }, [{ position: 1, wine_id: 'a', dish: null }],
      [wine('a', { grape_varieties: null, aroma_profile: null, suggested_food_pairings: null, cuvee: undefined })], []);
    expect(out.wines[0]).toMatchObject({ grapeVarieties: [], aromaProfile: [], suggestedFoodPairings: [], cuvee: null });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `cd backend && npx vitest run tests/unit/shares.publicView.test.js`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`backend/src/shares/publicView.js` :

```js
// Vue publique d'un partage. Fonction pure : elle NE COPIE QUE la liste
// blanche ci-dessous. Tout ce qui n'est pas nommé ici (prix, cote, bouteilles,
// emplacements, apogée, identifiants, occasion, convives…) ne sort jamais.

// La dégustation express range sa phrase dans un JSON { phrase, dish,
// occasion, … } ; les autres notes sont du texte brut.
export const tastingComment = (generalNotes) => {
  if (typeof generalNotes !== 'string') return null;
  let text = generalNotes;
  try {
    const parsed = JSON.parse(generalNotes);
    if (parsed && typeof parsed === 'object') text = typeof parsed.phrase === 'string' ? parsed.phrase : '';
  } catch {
    // texte libre
  }
  text = text.trim();
  return text || null;
};

const toIso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const publicTastings = (rows) =>
  rows
    .map((t) => ({ date: toIso(t.date), rating: t.overall_rating ?? null, comment: tastingComment(t.general_notes) }))
    .filter((t) => t.rating !== null || t.comment !== null)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

const publicWine = (wine, position, dish, tastings) => ({
  position,
  dish: dish ?? null,
  name: wine.name,
  cuvee: wine.cuvee ?? null,
  producer: wine.producer ?? null,
  vintage: wine.vintage ?? null,
  type: wine.type ?? null,
  appellation: wine.appellation ?? null,
  region: wine.region ?? null,
  country: wine.country ?? null,
  grapeVarieties: wine.grape_varieties ?? [],
  sensoryDescription: wine.sensory_description ?? null,
  aromaProfile: wine.aroma_profile ?? [],
  suggestedFoodPairings: wine.suggested_food_pairings ?? [],
  tastings: publicTastings(tastings),
});

export const toPublicShare = (share, items, wines, tastings) => {
  const byId = new Map(wines.map((w) => [w.id, w]));
  const ordered = [...items]
    .sort((a, b) => a.position - b.position)
    .filter((item) => byId.has(item.wine_id)); // vin supprimé entre-temps
  const isDinner = share.kind === 'DINNER';
  return {
    kind: share.kind,
    title: isDinner ? share.title ?? null : null,
    date: isDinner ? share.dinner_date ?? null : null,
    wines: ordered.map((item, i) =>
      publicWine(byId.get(item.wine_id), i + 1, item.dish, tastings.filter((t) => t.wine_id === item.wine_id))),
  };
};
```

- [ ] **Step 4: Relancer**

Run: `cd backend && npx vitest run tests/unit/shares.publicView.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/shares/publicView.js backend/tests/unit/shares.publicView.test.js
git commit -m "Partage public : vue publique à liste blanche (toPublicShare)"
```

---

### Task 4: Routes authentifiées `/api/shares`

**Files:**
- Create: `backend/src/shares/store.js`, `backend/src/routes/shares.js`, `backend/tests/api/shares.test.js`
- Modify: `backend/src/app.js` (import + `app.use('/api', sharesRouter)` après `valuationRouter`)

**Interfaces:**
- Consumes: `newShareToken` (Tâche 2), `ShareError`, `validateDinner`, `isUuid` (Tâche 2), `pool`, `withTransaction` (`db.js`), `convertKeysToCamelCase` (`utils/case.js`).
- Produces (store) : `listShares() → rows` ; `getShareForEditor(id) → { id, token, kind, title, dinner_date, revoked_at, items: [{ wine_id, dish, name, producer, vintage }] } | null` ; `wineExists(wineId) → boolean` ; `findActiveWineShare(wineId) → { id, token, kind } | null` ; `createWineShare(wineId, userId) → { id, token, kind }` ; `createDinnerShare(dinner, userId) → { id, token, kind }` ; `updateDinnerShare(id, dinner) → { id, token, kind }` (lance `ShareError` 404/400/409) ; `revokeShare(id) → { id, revoked_at } | null` ; `loadPublicShare(token) → { share, items, wines, tastings } | null` (utilisé Tâche 5).
- Produces (routes) : voir tableau de la spec ; réponses de création `{ id, token, kind, url }`.

- [ ] **Step 1: Écrire les tests d'API (gestion)**

`backend/tests/api/shares.test.js` :

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

describe.skipIf(!hasDb)('API partage public', () => {
  let client;
  let a;
  let b;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Pauillac', grapeVarieties: ['Cabernet'] })).body;
    b = (await client.post('/api/wines', { name: 'Petit Blanc', producer: 'Dom. Essai', vintage: 2022, type: 'WHITE' })).body;
    await client.post('/api/bottles', { wineId: a.id, location: 'Non trié', purchasePrice: 42 });
  });
  afterAll(() => pool.end());

  const dinner = (over = {}) => ({ kind: 'DINNER', title: 'Dîner du 11', date: '2026-10-11', items: [{ wineId: a.id, dish: 'Gigot' }, { wineId: b.id }], ...over });

  describe('gestion (authentifiée)', () => {
    it('401 sans compte', async () => {
      expect((await api().get('/api/shares')).status).toBe(401);
      expect((await api().post('/api/shares').send({ kind: 'WINE', wineId: a.id })).status).toBe(401);
    });

    it('fiche vin : créée (201) puis reprise (200, même jeton) ; 404 vin inconnu ; 400 corps invalide', async () => {
      const first = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ kind: 'WINE', url: `/p/${first.body.token}` });
      expect(first.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const again = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
      expect(again.status).toBe(200);
      expect(again.body.token).toBe(first.body.token);
      expect((await client.post('/api/shares', { kind: 'WINE', wineId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
      expect((await client.post('/api/shares', { kind: 'WINE', wineId: 'x' })).status).toBe(400);
      expect((await client.post('/api/shares', { kind: 'AUTRE' })).status).toBe(400);
    });

    it('fiche révoquée puis repartagée : nouveau jeton', async () => {
      const first = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      expect((await client.post(`/api/shares/${first.id}/revoke`, {})).status).toBe(200);
      const second = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
      expect(second.status).toBe(201);
      expect(second.body.token).not.toBe(first.token);
    });

    it('carte : création, lecture pour le compositeur, modification (même jeton, nouvel ordre, plats)', async () => {
      const created = await client.post('/api/shares', dinner());
      expect(created.status).toBe(201);
      const { id, token } = created.body;

      const read = await client.get(`/api/shares/${id}`);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ id, token, kind: 'DINNER', title: 'Dîner du 11', dinnerDate: '2026-10-11', revokedAt: null });
      expect(read.body.items).toEqual([
        { wineId: a.id, dish: 'Gigot', name: 'Grand Vin', producer: 'Château Test', vintage: 2018 },
        { wineId: b.id, dish: null, name: 'Petit Blanc', producer: 'Dom. Essai', vintage: 2022 },
      ]);

      const updated = await client.put(`/api/shares/${id}`, { title: 'Dîner du 12', date: null, items: [{ wineId: b.id, dish: 'Huîtres' }, { wineId: a.id }] });
      expect(updated.status).toBe(200);
      expect(updated.body).toEqual({ id, token, kind: 'DINNER', url: `/p/${token}` });
      const after = (await client.get(`/api/shares/${id}`)).body;
      expect(after.title).toBe('Dîner du 12');
      expect(after.dinnerDate).toBeNull();
      expect(after.items.map((i) => [i.wineId, i.dish])).toEqual([[b.id, 'Huîtres'], [a.id, null]]);
    });

    it('carte : validation (0 vin, 21 vins, titre vide, vin inconnu, date impossible)', async () => {
      expect((await client.post('/api/shares', dinner({ items: [] }))).status).toBe(400);
      expect((await client.post('/api/shares', dinner({ items: Array.from({ length: 21 }, () => ({ wineId: a.id })) }))).status).toBe(400);
      expect((await client.post('/api/shares', dinner({ title: '  ' }))).status).toBe(400);
      const unknown = await client.post('/api/shares', dinner({ items: [{ wineId: '00000000-0000-4000-8000-000000000000' }] }));
      expect(unknown.status).toBe(400);
      expect(unknown.body.error).toMatch(/n’existe plus/);
      expect((await client.post('/api/shares', dinner({ date: '2026-02-30' }))).status).toBe(400);
      expect(Number((await pool.query('SELECT count(*) FROM shares')).rows[0].count)).toBe(0);
    });

    it('PUT : 404 inconnue, 400 sur une fiche, 409 sur une carte révoquée', async () => {
      expect((await client.put('/api/shares/00000000-0000-4000-8000-000000000000', dinner())).status).toBe(404);
      const wineShare = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      expect((await client.put(`/api/shares/${wineShare.id}`, dinner())).status).toBe(400);
      const card = (await client.post('/api/shares', dinner())).body;
      await client.post(`/api/shares/${card.id}/revoke`, {});
      expect((await client.put(`/api/shares/${card.id}`, dinner())).status).toBe(409);
    });

    it('liste : plus récents d’abord, résumé par lien ; révocation idempotente', async () => {
      const wineShare = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      const card = (await client.post('/api/shares', dinner())).body;
      const revoke = await client.post(`/api/shares/${wineShare.id}/revoke`, {});
      expect(revoke.status).toBe(200);
      expect(revoke.body.revokedAt).toBeTruthy();
      const revokeAgain = await client.post(`/api/shares/${wineShare.id}/revoke`, {});
      expect(revokeAgain.body.revokedAt).toBe(revoke.body.revokedAt);
      expect((await client.post('/api/shares/00000000-0000-4000-8000-000000000000/revoke', {})).status).toBe(404);

      const list = await client.get('/api/shares');
      expect(list.status).toBe(200);
      expect(list.body.map((s) => s.id)).toEqual([card.id, wineShare.id]);
      expect(list.body[0]).toMatchObject({ kind: 'DINNER', title: 'Dîner du 11', dinnerDate: '2026-10-11', wineName: null, itemCount: 2, revokedAt: null, viewCount: 0, lastViewedAt: null });
      expect(list.body[1]).toMatchObject({ kind: 'WINE', title: null, wineName: 'Grand Vin', wineVintage: 2018, itemCount: 0 });
      expect(list.body[1].revokedAt).toBeTruthy();
      expect(list.body[0]).toHaveProperty('token');
      expect(list.body[0]).toHaveProperty('createdAt');
    });

    it('GET /api/shares/:id : 404 inconnue', async () => {
      expect((await client.get('/api/shares/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:5436/vinoflow_test npx vitest run tests/api/shares.test.js`
Expected: FAIL (404 au lieu de 401/201 : routes absentes).

- [ ] **Step 3: Écrire le store**

`backend/src/shares/store.js` :

```js
import { pool, withTransaction } from '../db.js';
import { newShareToken } from './token.js';
import { ShareError } from './validate.js';

// dinner_date est un DATE : on le lit en texte pour ne pas subir le fuseau du
// process Node (pg le convertirait en Date à minuit local).
const DATE_TEXT = "to_char(s.dinner_date, 'YYYY-MM-DD') AS dinner_date";

export const listShares = async () => {
  const { rows } = await pool.query(`
    SELECT s.id, s.token, s.kind, s.title, ${DATE_TEXT},
           w.name AS wine_name, w.vintage AS wine_vintage,
           (SELECT count(*)::int FROM share_items si WHERE si.share_id = s.id) AS item_count,
           s.created_at, s.revoked_at, s.view_count, s.last_viewed_at
    FROM shares s
    LEFT JOIN wines w ON w.id = s.wine_id
    ORDER BY s.created_at DESC, s.id DESC`);
  return rows;
};

export const getShareForEditor = async (id) => {
  const { rows } = await pool.query(`SELECT s.id, s.token, s.kind, s.title, ${DATE_TEXT}, s.revoked_at FROM shares s WHERE s.id = $1`, [id]);
  if (!rows[0]) return null;
  const items = (await pool.query(`
    SELECT si.wine_id, si.dish, w.name, w.producer, w.vintage
    FROM share_items si JOIN wines w ON w.id = si.wine_id
    WHERE si.share_id = $1 ORDER BY si.position`, [id])).rows;
  return { ...rows[0], items };
};

export const wineExists = async (wineId) => (await pool.query('SELECT 1 FROM wines WHERE id = $1', [wineId])).rowCount === 1;

const assertWinesExist = async (client, wineIds) => {
  const { rows } = await client.query('SELECT id FROM wines WHERE id = ANY($1::uuid[])', [wineIds]);
  const found = new Set(rows.map((r) => r.id));
  if (wineIds.some((id) => !found.has(id))) throw new ShareError(400, 'Un des vins n’existe plus dans la cave.');
};

export const findActiveWineShare = async (wineId) => {
  const { rows } = await pool.query(
    `SELECT id, token, kind FROM shares WHERE kind = 'WINE' AND wine_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [wineId]
  );
  return rows[0] ?? null;
};

export const createWineShare = async (wineId, userId) => {
  const { rows } = await pool.query(
    `INSERT INTO shares (token, kind, wine_id, created_by) VALUES ($1, 'WINE', $2, $3) RETURNING id, token, kind`,
    [newShareToken(), wineId, userId]
  );
  return rows[0];
};

const insertItems = async (client, shareId, items) => {
  for (const [i, item] of items.entries()) {
    await client.query('INSERT INTO share_items (share_id, position, wine_id, dish) VALUES ($1, $2, $3, $4)', [shareId, i + 1, item.wineId, item.dish]);
  }
};

export const createDinnerShare = (dinner, userId) =>
  withTransaction(async (client) => {
    await assertWinesExist(client, dinner.items.map((i) => i.wineId));
    const { rows } = await client.query(
      `INSERT INTO shares (token, kind, title, dinner_date, created_by) VALUES ($1, 'DINNER', $2, $3, $4) RETURNING id, token, kind`,
      [newShareToken(), dinner.title, dinner.date, userId]
    );
    await insertItems(client, rows[0].id, dinner.items);
    return rows[0];
  });

// Le jeton ne change pas : le lien déjà envoyé montre la carte corrigée.
export const updateDinnerShare = (id, dinner) =>
  withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id, token, kind, revoked_at FROM shares WHERE id = $1 FOR UPDATE', [id]);
    const share = rows[0];
    if (!share) throw new ShareError(404, 'Carte introuvable.');
    if (share.kind !== 'DINNER') throw new ShareError(400, 'Ce lien est une fiche vin, pas une carte.');
    if (share.revoked_at) throw new ShareError(409, 'Ce lien a été révoqué ; crée une nouvelle carte.');
    await assertWinesExist(client, dinner.items.map((i) => i.wineId));
    await client.query('UPDATE shares SET title = $2, dinner_date = $3 WHERE id = $1', [id, dinner.title, dinner.date]);
    await client.query('DELETE FROM share_items WHERE share_id = $1', [id]);
    await insertItems(client, id, dinner.items);
    return { id: share.id, token: share.token, kind: share.kind };
  });

// Définitif et idempotent : une seconde révocation garde la première date.
export const revokeShare = async (id) => {
  const { rows } = await pool.query('UPDATE shares SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING id, revoked_at', [id]);
  return rows[0] ?? null;
};

// Lecture publique : jeton actif → compteur +1 et données brutes (filtrées
// ensuite par toPublicShare) ; sinon null (inconnu ou révoqué, indistincts).
export const loadPublicShare = async (token) => {
  const { rows } = await pool.query(
    `UPDATE shares s SET view_count = view_count + 1, last_viewed_at = now()
     WHERE s.token = $1 AND s.revoked_at IS NULL
     RETURNING s.id, s.kind, s.title, ${DATE_TEXT}, s.wine_id`,
    [token]
  );
  const share = rows[0];
  if (!share) return null;
  const items = share.kind === 'WINE'
    ? [{ position: 1, wine_id: share.wine_id, dish: null }]
    : (await pool.query('SELECT position, wine_id, dish FROM share_items WHERE share_id = $1 ORDER BY position', [share.id])).rows;
  const wineIds = items.map((i) => i.wine_id);
  const wines = (await pool.query(
    `SELECT id, name, cuvee, producer, vintage, type, appellation, region, country,
            grape_varieties, sensory_description, aroma_profile, suggested_food_pairings
     FROM wines WHERE id = ANY($1::uuid[])`,
    [wineIds]
  )).rows;
  const tastings = (await pool.query(
    'SELECT wine_id, date, overall_rating, general_notes FROM tasting_notes WHERE wine_id = ANY($1::uuid[])',
    [wineIds]
  )).rows;
  return { share, items, wines, tastings };
};
```

- [ ] **Step 4: Écrire le routeur authentifié**

`backend/src/routes/shares.js` :

```js
import { Router } from 'express';
import { convertKeysToCamelCase } from '../utils/case.js';
import { ShareError, isUuid, validateDinner } from '../shares/validate.js';
import * as store from '../shares/store.js';

const router = Router();
const UUID = '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

// ========== PARTAGE PUBLIC — gestion (comptes du foyer) ==========
// La lecture publique est dans routes/publicShares.js, montée avant authenticate.

const created = (share) => ({ id: share.id, token: share.token, kind: share.kind, url: `/p/${share.token}` });

const fail = (res, error, fallback) => {
  if (error instanceof ShareError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

router.get('/shares', async (req, res) => {
  try {
    res.json(convertKeysToCamelCase(await store.listShares()));
  } catch (error) {
    fail(res, error, 'Impossible de lister les liens partagés.');
  }
});

router.get(`/shares/:id${UUID}`, async (req, res) => {
  try {
    const share = await store.getShareForEditor(req.params.id);
    if (!share) return res.status(404).json({ error: 'Carte introuvable.' });
    res.json(convertKeysToCamelCase(share));
  } catch (error) {
    fail(res, error, 'Impossible de charger la carte.');
  }
});

router.post('/shares', async (req, res) => {
  try {
    const userId = req.user?.userId ?? null;
    const kind = req.body?.kind;
    if (kind === 'WINE') {
      if (!isUuid(req.body.wineId)) throw new ShareError(400, 'Vin invalide.');
      if (!(await store.wineExists(req.body.wineId))) return res.status(404).json({ error: 'Ce vin n’existe plus dans la cave.' });
      // Un seul lien actif par fiche : on le reprend plutôt que d'en créer un second.
      const existing = await store.findActiveWineShare(req.body.wineId);
      if (existing) return res.json(created(existing));
      return res.status(201).json(created(await store.createWineShare(req.body.wineId, userId)));
    }
    if (kind === 'DINNER') {
      return res.status(201).json(created(await store.createDinnerShare(validateDinner(req.body), userId)));
    }
    throw new ShareError(400, 'Type de partage inconnu (WINE ou DINNER).');
  } catch (error) {
    fail(res, error, 'La création du lien a échoué.');
  }
});

router.put(`/shares/:id${UUID}`, async (req, res) => {
  try {
    res.json(created(await store.updateDinnerShare(req.params.id, validateDinner(req.body))));
  } catch (error) {
    fail(res, error, 'La modification de la carte a échoué.');
  }
});

router.post(`/shares/:id${UUID}/revoke`, async (req, res) => {
  try {
    const revoked = await store.revokeShare(req.params.id);
    if (!revoked) return res.status(404).json({ error: 'Lien introuvable.' });
    res.json({ id: revoked.id, revokedAt: revoked.revoked_at });
  } catch (error) {
    fail(res, error, 'La révocation a échoué.');
  }
});

export default router;
```

Dans `backend/src/app.js` : ajouter `import sharesRouter from './routes/shares.js';` après l'import de `valuationRouter`, et `app.use('/api', sharesRouter);` après `app.use('/api', valuationRouter);`.

- [ ] **Step 5: Relancer**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:5436/vinoflow_test npx vitest run tests/api/shares.test.js`
Expected: PASS (bloc « gestion »).

- [ ] **Step 6: Commit**

```bash
git add backend/src/shares/store.js backend/src/routes/shares.js backend/src/app.js backend/tests/api/shares.test.js
git commit -m "Partage public : routes de création, liste, modification et révocation"
```

---

### Task 5: Route publique `/api/public/shares/:token` + limiteur

**Files:**
- Create: `backend/src/routes/publicShares.js`
- Modify: `backend/src/middleware/rateLimits.js` (store `public`, `publicLimiter`), `backend/src/app.js` (montage avant `authenticate`), `backend/tests/api/shares.test.js` (bloc « lecture publique »)

**Interfaces:**
- Consumes: `isShareToken` (Tâche 2), `loadPublicShare` (Tâche 4), `toPublicShare` (Tâche 3).
- Produces: `publicLimiter` (120 / 15 min / IP, store `stores.public`, remis à zéro par `resetRateLimits`) ; `GET /api/public/shares/:token`.

- [ ] **Step 1: Ajouter les tests publics**

Dans `backend/tests/api/shares.test.js`, un second `describe` à l'intérieur du `describe` racine, après « gestion » :

```js
  describe('lecture publique (sans compte)', () => {
    const GONE = { error: 'Ce lien n’est plus actif.' };

    it('fiche : champs autorisés seulement, en-têtes noindex/no-store, compteur incrémenté', async () => {
      await client.post('/api/tasting-notes', { wineId: a.id, overallRating: 4, generalNotes: JSON.stringify({ phrase: 'Une claque', occasion: 'Noël', dish: 'Chapon' }), occasion: 'Noël', companions: 'Marc et Léa' });
      await client.post('/api/tasting-notes', { wineId: a.id, overallRating: null, generalNotes: null });
      const { token, id } = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;

      const res = await api().get(`/api/public/shares/${token}`);
      expect(res.status).toBe(200);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ kind: 'WINE', title: null, date: null });
      expect(res.body.wines).toHaveLength(1);
      expect(Object.keys(res.body.wines[0]).sort()).toEqual([
        'appellation', 'aromaProfile', 'country', 'cuvee', 'dish', 'grapeVarieties', 'name', 'position', 'producer', 'region',
        'sensoryDescription', 'suggestedFoodPairings', 'tastings', 'type', 'vintage',
      ]);
      expect(res.body.wines[0]).toMatchObject({ position: 1, name: 'Grand Vin', producer: 'Château Test', vintage: 2018, appellation: 'Pauillac', grapeVarieties: ['Cabernet'] });
      expect(res.body.wines[0].tastings).toEqual([{ date: expect.any(String), rating: 4, comment: 'Une claque' }]);
      const text = JSON.stringify(res.body);
      for (const forbidden of ['price', 'purchase', 'bottle', 'location', 'companion', 'occasion', 'peak', 'valuation', '"id"', 'wineId', 'Marc', 'Noël', '42', a.id]) {
        expect(text, `contenu interdit : ${forbidden}`).not.toContain(forbidden);
      }

      await api().get(`/api/public/shares/${token}`);
      const { rows } = await pool.query('SELECT view_count, last_viewed_at FROM shares WHERE id = $1', [id]);
      expect(rows[0].view_count).toBe(2);
      expect(rows[0].last_viewed_at).toBeTruthy();
      const list = (await client.get('/api/shares')).body;
      expect(list[0].viewCount).toBe(2);
    });

    it('carte : titre, date, vins dans l’ordre avec plats ; dégustation ajoutée après coup visible', async () => {
      const { token } = (await client.post('/api/shares', dinner())).body;
      const before = await api().get(`/api/public/shares/${token}`);
      expect(before.body).toMatchObject({ kind: 'DINNER', title: 'Dîner du 11', date: '2026-10-11' });
      expect(before.body.wines.map((w) => [w.position, w.name, w.dish])).toEqual([[1, 'Grand Vin', 'Gigot'], [2, 'Petit Blanc', null]]);
      expect(before.body.wines[1].tastings).toEqual([]);

      await client.post('/api/tasting-notes', { wineId: b.id, overallRating: 5, generalNotes: 'Vif et salin' });
      const after = await api().get(`/api/public/shares/${token}`);
      expect(after.body.wines[1].tastings).toEqual([{ date: expect.any(String), rating: 5, comment: 'Vif et salin' }]);
    });

    it('404 identique : inconnu, mal formé, révoqué ; le compteur ne bouge pas', async () => {
      const { id, token } = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      const unknown = await api().get(`/api/public/shares/${'A'.repeat(43)}`);
      const short = await api().get(`/api/public/shares/${token.slice(0, 42)}`);
      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual(GONE);
      expect(short.status).toBe(404);
      expect(short.body).toEqual(GONE);
      await client.post(`/api/shares/${id}/revoke`, {});
      const revoked = await api().get(`/api/public/shares/${token}`);
      expect(revoked.status).toBe(404);
      expect(revoked.body).toEqual(GONE);
      expect(revoked.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect((await pool.query('SELECT view_count FROM shares WHERE id = $1', [id])).rows[0].view_count).toBe(0);
    });

    it('vin supprimé : lien de fiche inactif, retiré de la carte (numéros resserrés)', async () => {
      const wineShare = (await client.post('/api/shares', { kind: 'WINE', wineId: b.id })).body;
      const card = (await client.post('/api/shares', dinner())).body;
      expect((await client.delete(`/api/wines/${b.id}`)).status).toBe(200);
      expect((await api().get(`/api/public/shares/${wineShare.token}`)).status).toBe(404);
      const res = await api().get(`/api/public/shares/${card.token}`);
      expect(res.status).toBe(200);
      expect(res.body.wines.map((w) => [w.position, w.name])).toEqual([[1, 'Grand Vin']]);
      expect((await client.get('/api/shares')).body.map((s) => s.id)).toEqual([card.id]);
    });

    it('limiteur dédié : 429 après 120 lectures depuis la même IP, en JSON français', async () => {
      const { token } = (await client.post('/api/shares', { kind: 'WINE', wineId: a.id })).body;
      let last;
      for (let i = 0; i < 121; i++) last = await api().get(`/api/public/shares/${token}`).set('X-Forwarded-For', '203.0.113.9');
      expect(last.status).toBe(429);
      expect(last.body.error).toMatch(/Trop de requêtes/);
      // Autre IP : toujours servie ; la gestion n'est pas touchée par ce limiteur.
      expect((await api().get(`/api/public/shares/${token}`).set('X-Forwarded-For', '203.0.113.10')).status).toBe(200);
      expect((await client.get('/api/shares')).status).toBe(200);
    });
  });
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:5436/vinoflow_test npx vitest run tests/api/shares.test.js`
Expected: FAIL sur le bloc public (401 : la route n'existe pas, `authenticate` répond).

- [ ] **Step 3: Limiteur**

Dans `backend/src/middleware/rateLimits.js`, étendre `stores` et ajouter le limiteur :

```js
const stores = { auth: new MemoryStore(), refresh: new MemoryStore(), ai: new MemoryStore(), notify: new MemoryStore(), public: new MemoryStore() };
```

```js
// Page publique /p/<jeton> (sans compte) : par IP, contre l'énumération de jetons.
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: stores.public,
  handler: (req, res, next, options) =>
    res.status(options.statusCode).json({ error: 'Trop de requêtes, réessaie dans quelques minutes.' }),
});
```

- [ ] **Step 4: Route publique et montage**

`backend/src/routes/publicShares.js` :

```js
import { Router } from 'express';
import { isShareToken } from '../shares/token.js';
import { loadPublicShare } from '../shares/store.js';
import { toPublicShare } from '../shares/publicView.js';

const router = Router();

// ========== PARTAGE PUBLIC — lecture sans compte ==========
// Seule route de l'API ouverte sans JWT (montée avant authenticate, derrière
// publicLimiter). Lecture seule ; la réponse passe par la liste blanche de
// toPublicShare. Inconnu, mal formé ou révoqué : même 404.
const GONE = { error: 'Ce lien n’est plus actif.' };

router.get('/public/shares/:token', async (req, res) => {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  try {
    if (!isShareToken(req.params.token)) return res.status(404).json(GONE);
    const loaded = await loadPublicShare(req.params.token);
    if (!loaded) return res.status(404).json(GONE);
    return res.json(toPublicShare(loaded.share, loaded.items, loaded.wines, loaded.tastings));
  } catch (error) {
    console.error('Public share error:', error);
    return res.status(500).json({ error: 'Impossible de charger ce partage.' });
  }
});

export default router;
```

Dans `backend/src/app.js` :

```js
import { aiLimiter, publicLimiter } from './middleware/rateLimits.js';
import publicSharesRouter from './routes/publicShares.js';
```

et, entre `app.use('/api', authRouter);` et le commentaire `// ========== Protected routes` :

```js
// Partage public : la seule route lisible sans compte (lecture seule, par IP).
app.use('/api/public', publicLimiter);
app.use('/api', publicSharesRouter);
```

- [ ] **Step 5: Relancer tout le backend**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:5436/vinoflow_test npm test`
Expected: PASS (dont `rateLimit.test.js`, inchangé).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/publicShares.js backend/src/middleware/rateLimits.js backend/src/app.js backend/tests/api/shares.test.js
git commit -m "Partage public : route publique en lecture seule, limitée par IP"
```

---

### Task 6: Front — types, service, utilitaires testés

**Files:**
- Modify: `types.ts` (fin de fichier), `services/storageService.ts` (import de types + section `// --- PARTAGE PUBLIC ---` à la fin)
- Create: `utils/shareView.ts`, `utils/shareView.test.ts`, `utils/shareLink.ts`

**Interfaces:**
- Produces (types) : `ShareKind`, `ShareSummary`, `ShareEditorItem`, `ShareEditor`, `ShareCreated`, `DinnerShareInput`, `PublicTasting`, `PublicShareWine`, `PublicShare`.
- Produces (service) : `listShares(): Promise<ShareSummary[]>` ; `getShare(id): Promise<ShareEditor>` ; `createWineShare(wineId): Promise<ShareCreated>` ; `createDinnerShare(input: DinnerShareInput): Promise<ShareCreated>` ; `updateDinnerShare(id, input): Promise<ShareCreated>` ; `revokeShare(id): Promise<void>` ; `class PublicShareError extends Error { status }` ; `fetchPublicShare(token): Promise<PublicShare>` (sans `apiFetch`).
- Produces (utils) : `stars(rating: number|null): string` ; `formatLongDate(ymd: string|null): string` ; `formatShortDate(iso: string): string` ; `typeLabel(type: string|null): string` ; `typeDotClass(type: string|null): string` ; `moveItem<T>(items: T[], from: number, to: number): T[]` ; `filterShareCandidates(wines: CellarWine[], query: string, limit = 8): CellarWine[]` ; `serverMessage(e: unknown, fallback: string): string` ; `shareUrl(token: string, origin?: string): string` ; `shareLink(url, title): Promise<'shared'|'copied'|'cancelled'|'failed'>`.

- [ ] **Step 1: Écrire les tests**

`utils/shareView.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { stars, formatLongDate, formatShortDate, typeLabel, typeDotClass, moveItem, filterShareCandidates, serverMessage, shareUrl } from './shareView';
import type { CellarWine } from '../types';

const w = (id: string, name: string, over: Partial<CellarWine> = {}) =>
  ({ id, name, producer: '', cuvee: '', appellation: '', vintage: 2020, inventoryCount: 1, type: 'RED', ...over }) as unknown as CellarWine;

describe('stars', () => {
  it('arrondit sur 5, vide sans note', () => {
    expect(stars(4)).toBe('★★★★☆');
    expect(stars(3.5)).toBe('★★★★☆');
    expect(stars(0)).toBe('☆☆☆☆☆');
    expect(stars(7)).toBe('★★★★★');
    expect(stars(null)).toBe('');
  });
});

describe('dates', () => {
  it('date en toutes lettres (fr), sans décalage de fuseau', () => {
    expect(formatLongDate('2026-10-11')).toBe('dimanche 11 octobre 2026');
    expect(formatLongDate('2026-01-01')).toBe('jeudi 1 janvier 2026');
    expect(formatLongDate(null)).toBe('');
    expect(formatLongDate('n’importe')).toBe('');
  });
  it('date courte pour une dégustation', () => {
    expect(formatShortDate('2026-10-11T12:00:00.000Z')).toBe('11/10/2026');
  });
});

describe('couleur', () => {
  it('libellé et pastille', () => {
    expect(typeLabel('RED')).toBe('Rouge');
    expect(typeLabel('SPARKLING')).toBe('Pétillant');
    expect(typeLabel(null)).toBe('');
    expect(typeDotClass('WHITE')).toContain('amber');
    expect(typeDotClass(null)).toContain('stone');
  });
});

describe('moveItem', () => {
  it('déplace sans muter ; hors bornes → même tableau', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(items, 2, 1)).toEqual(['a', 'c', 'b']);
    expect(items).toEqual(['a', 'b', 'c']);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 3)).toBe(items);
  });
});

describe('filterShareCandidates', () => {
  const wines = [
    w('1', 'Pommard', { producer: 'Lafarge', inventoryCount: 0, vintage: 2018 }),
    w('2', 'Sancerre', { producer: 'Vacheron', cuvee: 'Les Romains' }),
    w('3', 'Chablis', { appellation: 'Chablis 1er Cru Montée de Tonnerre' }),
    w('4', 'Côte-Rôtie', { producer: 'Jamet', inventoryCount: 0 }),
  ];
  it('sans requête : en stock d’abord, puis par nom, 8 au plus', () => {
    expect(filterShareCandidates(wines, '').map((x) => x.id)).toEqual(['3', '2', '4', '1']);
    expect(filterShareCandidates(Array.from({ length: 12 }, (_, i) => w(String(i), `Vin ${i}`)), '')).toHaveLength(8);
    expect(filterShareCandidates(wines, '', 2)).toHaveLength(2);
  });
  it('filtre sans accents sur nom, cuvée, producteur, appellation, millésime', () => {
    expect(filterShareCandidates(wines, 'cote rotie').map((x) => x.id)).toEqual(['4']);
    expect(filterShareCandidates(wines, 'romains').map((x) => x.id)).toEqual(['2']);
    expect(filterShareCandidates(wines, 'LAFARGE').map((x) => x.id)).toEqual(['1']);
    expect(filterShareCandidates(wines, 'montee').map((x) => x.id)).toEqual(['3']);
    expect(filterShareCandidates(wines, '2018').map((x) => x.id)).toEqual(['1']);
    expect(filterShareCandidates(wines, 'zzz')).toEqual([]);
  });
});

describe('serverMessage', () => {
  it('extrait le message JSON du serveur, sinon le repli', () => {
    expect(serverMessage(new Error('API Error: 409 Conflict - {"error":"Ce lien a été révoqué ; crée une nouvelle carte."}'), 'x'))
      .toBe('Ce lien a été révoqué ; crée une nouvelle carte.');
    expect(serverMessage(new Error('API Error: 429 Too Many Requests - {"msg":"Trop de tentatives"}'), 'x')).toBe('Trop de tentatives');
    expect(serverMessage(new Error('Failed to fetch'), 'Hors ligne')).toBe('Hors ligne');
    expect(serverMessage('boom', 'Repli')).toBe('Repli');
  });
});

describe('shareUrl', () => {
  it('origine + /p/jeton', () => {
    expect(shareUrl('abc', 'https://vinoflow.example')).toBe('https://vinoflow.example/p/abc');
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run utils/shareView.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Types**

À la fin de `types.ts` :

```ts
// ─── Partage public (liens /p/<jeton>) ───
export type ShareKind = 'WINE' | 'DINNER';

// Ligne de GET /api/shares (Réglages → Liens partagés).
export interface ShareSummary {
  id: string;
  token: string;
  kind: ShareKind;
  title: string | null;
  dinnerDate: string | null; // AAAA-MM-JJ
  wineName: string | null;
  wineVintage: number | null;
  itemCount: number;
  createdAt: string;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
}

export interface ShareEditorItem {
  wineId: string;
  dish: string | null;
  name: string;
  producer: string | null;
  vintage: number | null;
}

// GET /api/shares/:id — une carte pour le compositeur.
export interface ShareEditor {
  id: string;
  token: string;
  kind: ShareKind;
  title: string | null;
  dinnerDate: string | null;
  revokedAt: string | null;
  items: ShareEditorItem[];
}

// Réponse de création / modification : url = /p/<token> (relative).
export interface ShareCreated {
  id: string;
  token: string;
  kind: ShareKind;
  url: string;
}

export interface DinnerShareInput {
  title: string;
  date: string | null; // AAAA-MM-JJ
  items: { wineId: string; dish: string | null }[];
}

// Réponse de GET /api/public/shares/:token — liste blanche, rien d'autre.
export interface PublicTasting {
  date: string;
  rating: number | null;
  comment: string | null;
}

export interface PublicShareWine {
  position: number;
  dish: string | null;
  name: string;
  cuvee: string | null;
  producer: string | null;
  vintage: number | null;
  type: WineType | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  grapeVarieties: string[];
  sensoryDescription: string | null;
  aromaProfile: string[];
  suggestedFoodPairings: string[];
  tastings: PublicTasting[];
}

export interface PublicShare {
  kind: ShareKind;
  title: string | null;
  date: string | null;
  wines: PublicShareWine[];
}
```

- [ ] **Step 4: Service**

Dans `services/storageService.ts`, ajouter à l'import de `../types` : `ShareSummary, ShareEditor, ShareCreated, DinnerShareInput, PublicShare`. À la fin du fichier :

```ts
// --- PARTAGE PUBLIC ---

export const listShares = async (): Promise<ShareSummary[]> => {
  const response = await apiFetch(`${API_URL}/shares`, { headers: getHeaders() });
  return handleResponse(response);
};

export const getShare = async (id: string): Promise<ShareEditor> => {
  const response = await apiFetch(`${API_URL}/shares/${id}`, { headers: getHeaders() });
  return handleResponse(response);
};

export const createWineShare = async (wineId: string): Promise<ShareCreated> => {
  const response = await apiFetch(`${API_URL}/shares`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ kind: 'WINE', wineId }) });
  return handleResponse(response);
};

export const createDinnerShare = async (input: DinnerShareInput): Promise<ShareCreated> => {
  const response = await apiFetch(`${API_URL}/shares`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ kind: 'DINNER', ...input }) });
  return handleResponse(response);
};

export const updateDinnerShare = async (id: string, input: DinnerShareInput): Promise<ShareCreated> => {
  const response = await apiFetch(`${API_URL}/shares/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(input) });
  return handleResponse(response);
};

export const revokeShare = async (id: string): Promise<void> => {
  const response = await apiFetch(`${API_URL}/shares/${id}/revoke`, { method: 'POST', headers: getHeaders(), body: '{}' });
  await handleResponse(response);
};

export class PublicShareError extends Error {
  status: number;
  constructor(status: number) {
    super(`Partage public : ${status}`);
    this.status = status;
  }
}

// Page publique : fetch nu, sans jeton ni apiFetch (un 404 ne doit pas
// déconnecter un membre du foyer qui ouvrirait son propre lien révoqué).
export const fetchPublicShare = async (token: string): Promise<PublicShare> => {
  const response = await fetch(`${API_URL}/public/shares/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!response.ok) throw new PublicShareError(response.status);
  return response.json();
};
```

- [ ] **Step 5: Utilitaires**

`utils/shareView.ts` :

```ts
// Affichage du partage public et du compositeur de carte : fonctions pures.
import type { CellarWine } from '../types';

export const stars = (rating: number | null): string => {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return '';
  const n = Math.min(5, Math.max(0, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

// « 2026-10-11 » → « dimanche 11 octobre 2026 » ; construite en heure locale
// à partir des composantes pour ne pas glisser d'un jour selon le fuseau.
export const formatLongDate = (ymd: string | null): string => {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!m) return '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

export const formatShortDate = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR');

const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};
export const typeLabel = (type: string | null): string => (type ? TYPE_LABELS[type] ?? type : '');

const TYPE_DOTS: Record<string, string> = {
  RED: 'bg-wine-700', WHITE: 'bg-amber-300', ROSE: 'bg-pink-400', SPARKLING: 'bg-cyan-400', DESSERT: 'bg-amber-500', FORTIFIED: 'bg-stone-700',
};
export const typeDotClass = (type: string | null): string => (type && TYPE_DOTS[type]) || 'bg-stone-400';

// Réordonnancement (↑ ↓) : nouveau tableau, ou le même si la cible est hors bornes.
export const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const normalize = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// « Ajouter un vin » : en stock d'abord, filtre sans accents, 8 résultats.
export const filterShareCandidates = (wines: CellarWine[], query: string, limit = 8): CellarWine[] => {
  const q = normalize(query.trim());
  const matches = q
    ? wines.filter((w) => [w.name, w.cuvee, w.producer, w.appellation, w.vintage?.toString()]
        .some((field) => field && normalize(String(field)).includes(q)))
    : wines;
  return [...matches]
    .sort((a, b) => Number((b.inventoryCount || 0) > 0) - Number((a.inventoryCount || 0) > 0) || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit);
};

// handleResponse lance « API Error: 409 Conflict - {"error":"…"} » : on en
// extrait le message du serveur pour le toast.
export const serverMessage = (e: unknown, fallback: string): string => {
  if (!(e instanceof Error)) return fallback;
  const start = e.message.indexOf('{');
  if (start === -1) return fallback;
  try {
    const parsed = JSON.parse(e.message.slice(start));
    const text = parsed?.error ?? parsed?.msg;
    return typeof text === 'string' && text ? text : fallback;
  } catch {
    return fallback;
  }
};

export const shareUrl = (token: string, origin = typeof window !== 'undefined' ? window.location.origin : ''): string => `${origin}/p/${token}`;
```

`utils/shareLink.ts` :

```ts
// Partage d'un lien : feuille native (téléphone) si disponible, sinon copie
// dans le presse-papiers. Non testé (dépend du navigateur) : garder minuscule.
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export const shareLink = async (url: string, title: string): Promise<ShareOutcome> => {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      // L'utilisateur a fermé la feuille : rien à dire.
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Autre refus (contexte non sécurisé, type non géré) : on copie.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};
```

- [ ] **Step 6: Relancer tests et typecheck**

Run: `npx vitest run utils/shareView.test.ts && npm run typecheck`
Expected: PASS, aucune erreur TypeScript.

- [ ] **Step 7: Commit**

```bash
git add types.ts services/storageService.ts utils/shareView.ts utils/shareView.test.ts utils/shareLink.ts
git commit -m "Partage public : types, service et utilitaires d'affichage (front)"
```

---

### Task 7: Page publique `/p/:token`

**Files:**
- Create: `pages/PublicShare.tsx`
- Modify: `App.tsx` (lazy import + route publique)

**Interfaces:**
- Consumes: `fetchPublicShare`, `PublicShareError` (Tâche 6) ; `stars`, `formatLongDate`, `formatShortDate`, `typeLabel`, `typeDotClass` (Tâche 6) ; types `PublicShare`, `PublicShareWine`.

- [ ] **Step 1: Écrire la page**

`pages/PublicShare.tsx` :

```tsx
// Page publique /p/:token — sans compte, hors CockpitLayout, mobile d'abord.
// Rendu React uniquement (texte échappé) ; aucune donnée HTML injectée.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublicShare, PublicShareError } from '../services/storageService';
import type { PublicShare as PublicShareData, PublicShareWine } from '../types';
import { formatLongDate, formatShortDate, stars, typeDotClass, typeLabel } from '../utils/shareView';

type State =
  | { status: 'loading' }
  | { status: 'gone' }
  | { status: 'error' }
  | { status: 'ok'; data: PublicShareData };

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-cream-50 text-stone-900">
    <main className="max-w-2xl mx-auto px-4 py-8 md:py-12">{children}</main>
    <footer className="max-w-2xl mx-auto px-4 pb-10 text-center">
      <span className="mono text-[10px] tracking-widest text-stone-400 uppercase">Partagé depuis VinoFlow</span>
    </footer>
  </div>
);

const Message: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="py-16 text-center">
    <div className="text-4xl mb-4">🍷</div>
    <h1 className="serif text-2xl text-stone-900">{title}</h1>
    {hint && <p className="text-stone-500 text-sm mt-2">{hint}</p>}
  </div>
);

const WineBlock: React.FC<{ wine: PublicShareWine; numbered: boolean }> = ({ wine, numbered }) => (
  <article className="bg-white rounded-lg border border-stone-200 p-5 md:p-6">
    {numbered && (
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="mono text-[11px] tracking-widest text-wine-700">N° {wine.position}</span>
        {wine.dish && <span className="text-sm text-stone-600 italic text-right">Servi avec {wine.dish}</span>}
      </div>
    )}
    <div className="flex items-center gap-2 mb-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${typeDotClass(wine.type)}`} aria-hidden="true" />
      <span className="mono text-[10px] tracking-widest text-stone-500 uppercase">
        {[typeLabel(wine.type), wine.appellation].filter(Boolean).join(' · ')}
      </span>
    </div>
    <h2 className="serif text-2xl text-stone-900 leading-tight">{wine.name}</h2>
    {wine.cuvee && <div className="serif-it text-lg text-wine-700">{wine.cuvee}</div>}
    <div className="text-stone-600 text-sm mt-1">
      {[wine.producer, wine.vintage ? String(wine.vintage) : null, wine.region, wine.country].filter(Boolean).join(' · ')}
    </div>

    {wine.grapeVarieties.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-3">
        {wine.grapeVarieties.map((g, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-wine-50 text-wine-800">{g}</span>
        ))}
      </div>
    )}

    {wine.sensoryDescription && (
      <p className="text-stone-700 italic leading-relaxed text-sm mt-4">« {wine.sensoryDescription} »</p>
    )}

    {wine.aromaProfile.length > 0 && (
      <div className="mt-4">
        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mb-1.5">Arômes</div>
        <div className="flex flex-wrap gap-1.5">
          {wine.aromaProfile.map((a, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">{a}</span>
          ))}
        </div>
      </div>
    )}

    {wine.suggestedFoodPairings.length > 0 && (
      <div className="mt-4">
        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mb-1.5">Accords</div>
        <ul className="space-y-1 text-sm text-stone-700">
          {wine.suggestedFoodPairings.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-wine-500 flex-shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    )}

    {wine.tastings.length > 0 && (
      <div className="mt-5 pt-4 border-t border-stone-100">
        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mb-2">Mes dégustations</div>
        <ul className="space-y-2">
          {wine.tastings.map((t, i) => (
            <li key={i} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-wine-700 tracking-wider" aria-label={t.rating !== null ? `${t.rating} sur 5` : undefined}>{stars(t.rating)}</span>
                <span className="mono text-[10px] text-stone-500">{formatShortDate(t.date)}</span>
              </div>
              {t.comment && <p className="text-stone-600 italic mt-0.5">« {t.comment} »</p>}
            </li>
          ))}
        </ul>
      </div>
    )}
  </article>
);

export const PublicShare: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  // Non indexée : balise robots posée à l'affichage, retirée en quittant.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    const previousTitle = document.title;
    return () => {
      meta.remove();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchPublicShare(token)
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ok', data });
        document.title = `${data.title ?? data.wines[0]?.name ?? 'Partage'} — VinoFlow`;
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: e instanceof PublicShareError && e.status === 404 ? 'gone' : 'error' });
      });
    return () => { cancelled = true; };
  }, [token]);

  if (state.status === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-600" />
        </div>
      </Shell>
    );
  }
  if (state.status === 'gone') return <Shell><Message title="Ce lien n’est plus actif" hint="La personne qui l’a partagé l’a retiré." /></Shell>;
  if (state.status === 'error') return <Shell><Message title="Impossible de charger la carte, réessaie." /></Shell>;

  const { data } = state;
  const isDinner = data.kind === 'DINNER';
  return (
    <Shell>
      <header className="mb-6 md:mb-8">
        <div className="mono text-[10px] tracking-widest text-wine-700 uppercase">{isDinner ? 'Carte des vins' : 'Fiche vin'}</div>
        {isDinner && <h1 className="serif text-3xl md:text-4xl text-stone-900 leading-tight mt-1">{data.title}</h1>}
        {isDinner && data.date && <div className="text-stone-500 text-sm mt-1 first-letter:uppercase">{formatLongDate(data.date)}</div>}
      </header>
      {data.wines.length === 0 ? (
        <Message title="Cette carte est vide" hint="Les vins qu’elle contenait ne sont plus dans la cave." />
      ) : (
        <div className="space-y-4">
          {data.wines.map((wine) => <WineBlock key={wine.position} wine={wine} numbered={isDinner} />)}
        </div>
      )}
    </Shell>
  );
};
```

- [ ] **Step 2: Route publique dans `App.tsx`**

Ajouter l'import lazy après `ResetPassword` :

```tsx
const PublicShare        = lazy(() => import('./pages/PublicShare').then(m => ({ default: m.PublicShare })));
```

et, sous `/reset-password`, dans le bloc « Public Route » :

```tsx
      {/* Partage public : sans compte, hors CockpitLayout */}
      <Route path="/p/:token" element={<Suspense fallback={<PageLoader />}><PublicShare /></Suspense>} />
```

- [ ] **Step 3: Typecheck et build**

Run: `npm run typecheck && npm run build`
Expected: aucune erreur ; un chunk `PublicShare-*.js` dans `dist/assets`.

- [ ] **Step 4: Commit**

```bash
git add pages/PublicShare.tsx App.tsx
git commit -m "Partage public : page /p/:jeton (sans compte, non indexée)"
```

---

### Task 8: Compositeur de carte de dîner + palette de commandes

**Files:**
- Create: `pages/ShareDinner.tsx`
- Modify: `App.tsx` (routes `/partages/diner`, `/partages/diner/:id` dans le bloc protégé), `components/cockpit/CommandPalette.tsx` (action « Nouvelle carte de dîner »)

**Interfaces:**
- Consumes: `useWines` ; `getShare`, `createDinnerShare`, `updateDinnerShare` (Tâche 6) ; `filterShareCandidates`, `moveItem`, `serverMessage`, `shareUrl`, `typeDotClass` (Tâche 6) ; `shareLink` (Tâche 6) ; `useToast` ; primitives `Button`, `Card`, `Input`, `MonoLabel`.
- Produces: routes `/partages/diner` (création ; `?wine=<id>` pré-remplit un vin) et `/partages/diner/:id` (modification d'une carte active).

- [ ] **Step 1: Écrire la page**

`pages/ShareDinner.tsx` :

```tsx
// Compositeur d'une carte des vins de dîner partagée : titre, date, vins de
// la cave dans l'ordre de service, plat facultatif ; « Enregistrer et
// partager » crée (ou modifie, même jeton) puis ouvre la feuille de partage.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, Copy, Loader2, Plus, Share2, X } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { createDinnerShare, getShare, updateDinnerShare } from '../services/storageService';
import { filterShareCandidates, moveItem, serverMessage, shareUrl, typeDotClass } from '../utils/shareView';
import { shareLink } from '../utils/shareLink';
import { useToast } from '../components/cockpit/feedback';
import { Button, Card, Input, MonoLabel } from '../components/cockpit/primitives';

interface DinnerItem { wineId: string; dish: string }

export const ShareDinner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { wines, loading: loadingWines } = useWines();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [items, setItems] = useState<DinnerItem[]>([]);
  const [query, setQuery] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [loadingShare, setLoadingShare] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);

  // Modification : charge la carte existante.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingShare(true);
    getShare(id)
      .then((share) => {
        if (cancelled) return;
        setTitle(share.title ?? '');
        setDate(share.dinnerDate ?? '');
        setItems(share.items.map((i) => ({ wineId: i.wineId, dish: i.dish ?? '' })));
        setToken(share.token);
        setRevoked(Boolean(share.revokedAt));
      })
      .catch(() => { if (!cancelled) toast.error('Carte introuvable.'); })
      .finally(() => { if (!cancelled) setLoadingShare(false); });
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Depuis la fiche vin : ?wine=<id> pré-remplit la carte.
  useEffect(() => {
    const wineId = search.get('wine');
    if (!wineId || id) return;
    setItems((prev) => (prev.some((i) => i.wineId === wineId) ? prev : [...prev, { wineId, dish: '' }]));
  }, [search, id]);

  const byId = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const candidates = useMemo(() => filterShareCandidates(wines, query), [wines, query]);

  const addWine = (wineId: string) => {
    setItems((prev) => [...prev, { wineId, dish: '' }]);
    setQuery('');
  };
  const setDish = (index: number, dish: string) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, dish } : it)));
  const remove = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => setItems((prev) => moveItem(prev, index, index + delta));

  const doShare = async (t: string) => {
    const outcome = await shareLink(shareUrl(t), title.trim() || 'Carte des vins');
    if (outcome === 'copied') toast.success('Lien copié');
    else if (outcome === 'failed') toast.error('Impossible de partager le lien ; copie-le depuis Réglages → Liens partagés.');
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Donne un titre à la carte.'); return; }
    if (items.length === 0) { toast.error('Ajoute au moins un vin à la carte.'); return; }
    setSaving(true);
    try {
      const input = { title: title.trim(), date: date || null, items: items.map((i) => ({ wineId: i.wineId, dish: i.dish.trim() || null })) };
      const res = id ? await updateDinnerShare(id, input) : await createDinnerShare(input);
      setToken(res.token);
      if (!id) navigate(`/partages/diner/${res.id}`, { replace: true });
      await doShare(res.token);
    } catch (e) {
      toast.error(serverMessage(e, 'L’enregistrement a échoué.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingWines || loadingShare) {
    return <div className="flex items-center gap-2 text-stone-500 py-12"><Loader2 className="animate-spin w-4 h-4" /> Chargement…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <Link to="/settings" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Réglages
      </Link>
      <div className="mb-5">
        <MonoLabel>PARTAGE · CARTE DE DÎNER</MonoLabel>
        <h1 className="serif text-2xl md:text-3xl text-stone-900 leading-tight mt-1">{id ? 'Modifier la carte' : 'Nouvelle carte de dîner'}</h1>
        <p className="text-sm text-stone-500 mt-1">Les invités verront les vins dans l’ordre, avec leur description et tes notes de dégustation. Jamais les prix ni le stock.</p>
      </div>

      {revoked && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
          Ce lien a été révoqué : il ne peut plus être modifié. Crée une <Link to="/partages/diner" className="underline">nouvelle carte</Link>.
        </div>
      )}

      <Card className="p-4 md:p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Dîner du samedi" wrapperClassName="sm:col-span-2" disabled={revoked} />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={revoked} />
        </div>
      </Card>

      <Card className="p-4 md:p-5 mb-4">
        <MonoLabel>◌ Vins · {items.length}</MonoLabel>
        <h2 className="serif-it text-xl text-stone-900 mt-0.5 mb-3">Dans l’ordre de service</h2>
        {items.length === 0 && <p className="text-sm text-stone-400 italic mb-3">Aucun vin pour l’instant.</p>}
        <ol className="space-y-2">
          {items.map((item, index) => {
            const wine = byId.get(item.wineId);
            return (
              <li key={`${item.wineId}-${index}`} className="rounded-md bg-stone-50 p-3">
                <div className="flex items-start gap-3">
                  <span className="mono text-[11px] tracking-widest text-wine-700 mt-1">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${typeDotClass(wine?.type ?? null)}`} />
                      <span className="font-medium text-stone-900 truncate">{wine ? wine.name : 'Vin supprimé'}</span>
                      {wine?.vintage && <span className="mono text-xs text-stone-500">{wine.vintage}</span>}
                    </div>
                    {wine?.producer && <div className="text-xs text-stone-500 truncate">{wine.producer}</div>}
                    <input
                      value={item.dish}
                      onChange={(e) => setDish(index, e.target.value)}
                      maxLength={200}
                      placeholder="Servi avec…"
                      disabled={revoked}
                      className="mt-2 w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-wine-600/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button type="button" onClick={() => move(index, -1)} disabled={revoked || index === 0} aria-label="Monter" className="p-1.5 rounded text-stone-500 hover:text-wine-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(index, 1)} disabled={revoked || index === items.length - 1} aria-label="Descendre" className="p-1.5 rounded text-stone-500 hover:text-wine-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(index)} disabled={revoked} aria-label="Retirer" className="p-1.5 rounded text-stone-500 hover:text-wine-700 disabled:opacity-30"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {!revoked && items.length < 20 && (
          <div className="mt-4">
            <Input label="Ajouter un vin" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, cuvée, producteur, appellation, millésime…" />
            <ul className="mt-2 divide-y divide-stone-100 rounded-md border border-stone-200 bg-white">
              {candidates.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => addWine(w.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-stone-50">
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${typeDotClass(w.type)}`} />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-stone-900">{w.name}</span>
                      {w.vintage && <span className="mono text-xs text-stone-500 ml-2">{w.vintage}</span>}
                      <span className="block text-xs text-stone-500 truncate">{[w.producer, w.appellation].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`mono text-[10px] shrink-0 ${w.inventoryCount > 0 ? 'text-stone-500' : 'text-stone-300'}`}>×{w.inventoryCount}</span>
                    <Plus className="w-4 h-4 text-wine-700 shrink-0" />
                  </button>
                </li>
              ))}
              {candidates.length === 0 && <li className="px-3 py-2.5 text-sm text-stone-400 italic">Aucun vin ne correspond.</li>}
            </ul>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving || revoked}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          Enregistrer et partager
        </Button>
        {token && (
          <Button variant="outline" onClick={() => doShare(token)} disabled={revoked}>
            <Copy className="w-4 h-4" />Copier le lien
          </Button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Routes et palette**

`App.tsx` — import lazy :

```tsx
const ShareDinner        = lazy(() => import('./pages/ShareDinner').then(m => ({ default: m.ShareDinner })));
```

et dans le bloc protégé, après `/settings` :

```tsx
        <Route path="/partages/diner" element={<Suspense fallback={<PageLoader />}><ShareDinner /></Suspense>} />
        <Route path="/partages/diner/:id" element={<Suspense fallback={<PageLoader />}><ShareDinner /></Suspense>} />
```

`components/cockpit/CommandPalette.tsx` — ajouter `UtensilsCrossed` à l'import `lucide-react`, puis dans `fastActions` :

```tsx
      { id: 'act:dinner', label: 'Nouvelle carte de dîner', icon: UtensilsCrossed, group: 'actions', exec: () => navigate('/partages/diner'), hint: 'Lien public pour les invités' },
```

- [ ] **Step 3: Typecheck et build**

Run: `npm run typecheck && npm run build`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add pages/ShareDinner.tsx App.tsx components/cockpit/CommandPalette.tsx
git commit -m "Partage public : compositeur de carte de dîner et action dans la palette"
```

---

### Task 9: Boutons « Partager » et « Ajouter à une carte de dîner » sur la fiche vin

**Files:**
- Modify: `pages/CockpitWineDetails.tsx` (imports, handler `handleShare`, deux boutons dans « Actions rapides »)

**Interfaces:**
- Consumes: `createWineShare` (Tâche 6), `shareUrl`, `serverMessage` (Tâche 6), `shareLink` (Tâche 6).

- [ ] **Step 1: Imports**

Ajouter `Share2, UtensilsCrossed` à l'import `lucide-react` ; `createWineShare` à l'import de `../services/storageService` ; et :

```tsx
import { shareUrl, serverMessage } from '../utils/shareView';
import { shareLink } from '../utils/shareLink';
```

- [ ] **Step 2: Handler**

Après `handleConsume` :

```tsx
  // Lien public de la fiche : créé la première fois, repris ensuite (même jeton).
  const handleShare = async () => {
    if (!wine) return;
    try {
      const share = await createWineShare(wine.id);
      const outcome = await shareLink(shareUrl(share.token), `${wine.name}${wine.vintage ? ` ${wine.vintage}` : ''}`);
      if (outcome === 'copied') toast.success('Lien copié', { label: 'Gérer', onClick: () => navigate('/settings') });
      else if (outcome === 'failed') toast.error('Impossible de partager le lien ; copie-le depuis Réglages → Liens partagés.');
    } catch (e) {
      toast.error(serverMessage(e, 'La création du lien a échoué.'));
    }
  };
```

- [ ] **Step 3: Boutons**

Dans le bloc « Actions rapides « à la cave » », après le `<Link to={`/tasting/${wine.id}`} …>` :

```tsx
          <Button variant="outline" onClick={handleShare} className="col-span-1"><Share2 className="w-3.5 h-3.5" />Partager</Button>
          <Link to={`/partages/diner?wine=${wine.id}`} className="col-span-1">
            <Button variant="outline" className="w-full"><UtensilsCrossed className="w-3.5 h-3.5" />Carte de dîner</Button>
          </Link>
```

(Libellé court « Carte de dîner » pour tenir sur deux colonnes mobiles ; `title="Ajouter à une carte de dîner"` sur le `Link`.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add pages/CockpitWineDetails.tsx
git commit -m "Fiche vin : boutons Partager et Carte de dîner"
```

---

### Task 10: Réglages → « Liens partagés »

**Files:**
- Create: `components/cockpit/SharedLinksSection.tsx`
- Modify: `pages/Settings.tsx` (import + `<Section>` avant « Données »)

**Interfaces:**
- Consumes: `listShares`, `revokeShare` (Tâche 6) ; `shareUrl`, `formatLongDate`, `serverMessage` (Tâche 6) ; `shareLink` ; `useToast`, `useConfirm` ; primitives `Badge`, `Button`, `Skeleton`.

- [ ] **Step 1: Écrire la section**

`components/cockpit/SharedLinksSection.tsx` :

```tsx
// Réglages → Liens partagés : une ligne par lien (fiche ou dîner), Copier,
// Modifier (dîner actif), Révoquer (définitif, confirmé). Cave partagée :
// tous les comptes voient et révoquent tous les liens.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Pencil, Plus, Ban, Wine as WineIcon, UtensilsCrossed } from 'lucide-react';
import { listShares, revokeShare } from '../../services/storageService';
import type { ShareSummary } from '../../types';
import { formatLongDate, serverMessage, shareUrl } from '../../utils/shareView';
import { shareLink } from '../../utils/shareLink';
import { useConfirm, useToast } from './feedback';
import { Badge, Button, Skeleton } from './primitives';

const label = (s: ShareSummary) =>
  s.kind === 'WINE'
    ? [s.wineName ?? 'Vin supprimé', s.wineVintage].filter(Boolean).join(' ')
    : s.title ?? 'Carte sans titre';

const detail = (s: ShareSummary) => {
  const parts = [s.kind === 'WINE' ? 'Fiche vin' : `Carte · ${s.itemCount} vin${s.itemCount > 1 ? 's' : ''}`];
  if (s.kind === 'DINNER' && s.dinnerDate) parts.push(formatLongDate(s.dinnerDate));
  parts.push(s.viewCount === 0 ? 'jamais ouvert' : `ouvert ${s.viewCount} fois`);
  return parts.join(' · ');
};

export const SharedLinksSection: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [shares, setShares] = useState<ShareSummary[] | null>(null);

  const load = useCallback(() => {
    listShares().then(setShares).catch(() => { setShares([]); toast.error('Impossible de charger les liens partagés.'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  const copy = async (s: ShareSummary) => {
    const outcome = await shareLink(shareUrl(s.token), label(s));
    if (outcome === 'copied') toast.success('Lien copié');
    else if (outcome === 'failed') toast.error('Impossible de copier le lien.');
  };

  const revoke = async (s: ShareSummary) => {
    const ok = await confirm({
      title: 'Révoquer ce lien ?',
      message: <>« {label(s)} » affichera « Ce lien n’est plus actif » pour tous ceux qui l’ont reçu. C’est définitif.</>,
      confirmLabel: 'Révoquer',
      danger: true,
    });
    if (!ok) return;
    try {
      await revokeShare(s.id);
      toast.success('Lien révoqué');
      load();
    } catch (e) {
      toast.error(serverMessage(e, 'La révocation a échoué.'));
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/partages/diner')}><Plus className="w-3.5 h-3.5" />Nouvelle carte de dîner</Button>
      </div>
      {shares === null && <Skeleton className="h-16" />}
      {shares && shares.length === 0 && (
        <p className="text-sm text-stone-400 italic">Aucun lien partagé. Depuis une fiche vin, « Partager » crée un lien public ; une carte de dîner réunit plusieurs vins.</p>
      )}
      {shares && shares.length > 0 && (
        <ul className="divide-y divide-stone-100">
          {shares.map((s) => {
            const active = !s.revokedAt;
            return (
              <li key={s.id} className={`py-3 flex flex-col sm:flex-row sm:items-center gap-2 ${active ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {s.kind === 'WINE' ? <WineIcon className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" /> : <UtensilsCrossed className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-stone-900 truncate">{label(s)}</span>
                      <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Actif' : 'Révoqué'}</Badge>
                    </div>
                    <div className="text-xs text-stone-500 first-letter:uppercase">{detail(s)}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 sm:ml-auto">
                  {active && <Button variant="ghost" size="sm" onClick={() => copy(s)} title="Copier le lien"><Copy className="w-3.5 h-3.5" />Copier</Button>}
                  {active && s.kind === 'DINNER' && <Button variant="ghost" size="sm" onClick={() => navigate(`/partages/diner/${s.id}`)}><Pencil className="w-3.5 h-3.5" />Modifier</Button>}
                  {active && <Button variant="danger" size="sm" onClick={() => revoke(s)}><Ban className="w-3.5 h-3.5" />Révoquer</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Insérer dans Réglages**

`pages/Settings.tsx` — import :

```tsx
import { SharedLinksSection } from '../components/cockpit/SharedLinksSection';
```

Avant `{/* ───── Données ───── */}` :

```tsx
        {/* ───── Liens partagés ───── */}
        <Section
          label="Partage"
          title="Liens partagés"
          hint="Liens publics vers une fiche vin ou la carte des vins d’un dîner : ouverts sans compte, montrent l’état actuel (description, notes de dégustation), jamais les prix ni le stock. Révoquer est définitif."
        >
          <SharedLinksSection />
        </Section>
```

Mettre à jour le sous-titre de la page : `Compte, notifications, intelligence artificielle, enrichissement, partage et données`.

- [ ] **Step 3: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: tout passe.

- [ ] **Step 4: Commit**

```bash
git add components/cockpit/SharedLinksSection.tsx pages/Settings.tsx
git commit -m "Réglages : liste et révocation des liens partagés"
```

---

### Task 11: Documentation, vérification complète, PR

**Files:**
- Modify: `CLAUDE.md` (entrée `backend/src/shares/` dans « Layout », note dans « Security model »)

- [ ] **Step 1: CLAUDE.md**

Dans « Layout », après l'entrée `backend/src/valuation/` :

```markdown
- `backend/src/shares/` — partage public (`/p/<jeton>`) d'une fiche vin ou d'une carte des vins de dîner composée à la main : `token.js` (256 bits base64url), `validate.js`, `publicView.js` (`toPublicShare`, **liste blanche** : identité, description, arômes, accords, dégustations `{ date, rating, comment }` ; jamais prix, cote, bouteilles, emplacements, stock, apogée, identifiants, occasion, convives), `store.js`. Routes authentifiées `/api/shares*` (`routes/shares.js`) ; **seule route publique** `GET /api/public/shares/:token` (`routes/publicShares.js`, montée avant `authenticate`, `publicLimiter` 120/15 min/IP, 404 indistinct inconnu/révoqué, `X-Robots-Tag: noindex`). Front : `pages/PublicShare.tsx` (hors `ProtectedRoute`, fetch nu sans `apiFetch`), `pages/ShareDinner.tsx` (`/partages/diner[/:id]`), `components/cockpit/SharedLinksSection.tsx` (Réglages), `utils/shareView.ts`.
```

Dans « Security model », après la ligne sur les rate limits :

```markdown
- Partage public : `/api/public/*` est la seule zone sans JWT (lecture seule, liste blanche `toPublicShare`, limiteur par IP). Toute nouvelle route publique doit passer par ce routeur et être justifiée.
```

- [ ] **Step 2: Vérification complète**

Run (backend) : `cd backend && node --check src/app.js && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:5436/vinoflow_test npm test`
Run (front) : `npm run typecheck && npm test && npm run build`
Expected: tout passe.

- [ ] **Step 3: Commit et PR**

```bash
git add CLAUDE.md
git commit -m "Doc : partage public dans CLAUDE.md"
git push -u origin claude/sharp-diffie-725ced
gh pr create --base main --title "Partage public : fiche vin et carte des vins d'un dîner" --body-file <(cat <<'EOF'
## Résumé
- Lien public `/p/<jeton>` (sans compte, non indexé) vers une **fiche vin** ou la **carte des vins d'un dîner** composée à la main (titre, date, vins dans l'ordre, plat facultatif).
- Serveur : migration `013_shares.sql` ; routes authentifiées `/api/shares*` (créer / lister / modifier / révoquer) ; **une seule** route publique `GET /api/public/shares/:token` (lecture seule, 120 req / 15 min / IP, 404 indistinct, `X-Robots-Tag`), réponse construite par `toPublicShare` à **liste blanche** (jamais prix, cote, bouteilles, emplacements, stock, apogée, identifiants, occasion, convives).
- Front : page publique autonome, compositeur `/partages/diner`, boutons « Partager » / « Carte de dîner » sur la fiche vin, section « Liens partagés » (copier, modifier, révoquer, compteur d'ouvertures) dans Réglages, action dans la palette.
- Spec : `docs/superpowers/specs/2026-10-07-partage-public-design.md` ; plan : `docs/superpowers/plans/2026-10-07-partage-public.md`.

## Tests
- Backend : unitaires (`shares.validate`, `shares.publicView`) + API (`shares.test.js` : fiche reprise, carte modifiée à jeton constant, liste blanche publique, 404 identique, compteur, validation, 409, vin supprimé, limiteur).
- Front : `utils/shareView.test.ts` ; `npm run typecheck && npm test && npm run build`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```
