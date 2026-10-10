# Partage public (fiche vin, carte de dîner) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partager une fiche vin ou la carte des vins d'un dîner par un lien public sans compte, révocable.

**Architecture:** Deux tables (`shares`, `share_items`, migration 013). Routes authentifiées `/api/shares` (créer, modifier, lister, révoquer) et **une** route publique `GET /api/public/shares/:token` montée avant l'authentification, avec limiteur dédié et réponse construite par une fonction pure à liste blanche (`backend/src/shares/publicView.js`). Front : page publique `/p/:token` hors connexion, compositeur `/partages/diner`, boutons sur la fiche vin, section « Liens partagés » dans Réglages.

**Tech Stack:** Express 4 ESM, Postgres 16, Vitest + supertest ; React 19 + Tailwind (Cockpit), Vitest (`utils/`).

**Spec:** `docs/superpowers/specs/2026-10-07-partage-public-design.md`

## Global Constraints

- Commits et textes d'interface en français ; pas de classes `dark:`.
- Jeton : `crypto.randomBytes(32).toString('base64url')` (43 caractères `[A-Za-z0-9_-]`).
- Route publique : 404 `{ error: 'Ce lien n’est plus actif.' }` identique pour jeton mal formé, inconnu ou révoqué ; en-têtes `X-Robots-Tag: noindex, nofollow` et `Cache-Control: no-store` ; limiteur 120 requêtes / 15 min / IP.
- Champs publics (liste blanche) : `kind, title, date, wines[{ position, dish, name, cuvee, producer, vintage, type, appellation, region, country, grapeVarieties, sensoryDescription, aromaProfile, suggestedFoodPairings, tastings[{ date, rating, comment }] }]`. Jamais : identifiants, prix, bouteilles, emplacements, apogée, cote, occasion, convives.
- Carte de dîner : titre 1–120 caractères, date `AAAA-MM-JJ` facultative, 1 à 20 vins, « Servi avec » ≤ 200 caractères.
- Un seul lien actif par fiche vin (le second POST renvoie le même) ; révocation définitive ; PUT sur carte révoquée → 409.
- Migration `013_shares.sql` (012 pris par #18), sans BEGIN/COMMIT.
- La page publique n'utilise pas `apiFetch` (pas de jeton, pas de déconnexion).
- Dates `dinner_date` lues en SQL avec `to_char(dinner_date, 'YYYY-MM-DD')` (pas d'objet Date décalé par le fuseau).

## Review Focus

- **Fuite de données par la route publique** (prix, emplacements, convives, identifiants) : test qui parcourt toutes les clés de la réponse — Tâche 2.
- **Énumération des jetons / distinction lien révoqué vs inconnu** : réponses 404 identiques — Tâche 2.
- **Page publique ouverte sans être connecté** : ne doit ni rediriger vers /login ni déclencher la déconnexion — vérifié en bout en bout (Tâche 6) ; route hors `ProtectedRoute` (Tâche 4).
- **Vin supprimé après partage** : lien de fiche inactif, vin retiré de la carte — test API Tâche 2.
- **Double clic sur « Partager »** : un seul lien de fiche (verrou `FOR UPDATE` sur le vin) — test API Tâche 2 (deux POST en parallèle).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `db/migrations/013_shares.sql` | tables `shares`, `share_items` |
| `backend/src/shares/validate.js` | `ShareError`, `validateDinner`, `newToken`, `isToken`, `MAX_ITEMS` |
| `backend/src/shares/publicView.js` | `toPublicShare`, `toPublicTastings` (liste blanche) |
| `backend/src/routes/shares.js` | routes authentifiées |
| `backend/src/routes/publicShares.js` | route publique |
| `backend/src/middleware/rateLimits.js` (mod.) | `publicLimiter` |
| `backend/src/app.js` (mod.) | montage public avant `authenticate`, privé après |
| `types.ts`, `services/storageService.ts` (mod.) | types et appels |
| `utils/shareView.ts`, `utils/shareLink.ts` (+ tests) | mise en forme, réordonnancement, recherche, partage/copie |
| `pages/PublicShare.tsx` | page publique `/p/:token` |
| `pages/ShareDinner.tsx` | compositeur |
| `components/cockpit/SharedLinks.tsx` | section Réglages |
| `pages/CockpitWineDetails.tsx`, `components/cockpit/CommandPalette.tsx`, `pages/Settings.tsx`, `App.tsx`, `CLAUDE.md` (mod.) | points d'entrée, routes, doc |

---

### Task 1: Migration, validation et vue publique (pur)

**Files:**
- Create: `db/migrations/013_shares.sql`, `backend/src/shares/validate.js`, `backend/src/shares/publicView.js`
- Test: `backend/tests/unit/shares.test.js`

**Interfaces:**
- Produces: `class ShareError extends Error { status }` ; `MAX_ITEMS = 20` ; `validateDinner(body) → { title, date: string|null, items: [{ wineId, dish: string|null }] }` ; `newToken() → string` ; `isToken(s) → boolean` ; `toPublicTastings(rows) → [{ date, rating, comment }]` ; `toPublicShare(share: { kind, title, dinner_date }, items: [{ dish, wine: <ligne wines snake_case>, tastings: <lignes tasting_notes> }]) → PublicShare`.

- [ ] **Step 1: Écrire le test**

```js
import { describe, it, expect } from 'vitest';
import { validateDinner, ShareError, newToken, isToken, MAX_ITEMS } from '../../src/shares/validate.js';
import { toPublicShare } from '../../src/shares/publicView.js';

const W = '11111111-1111-4111-8111-111111111111';
const errorOf = (body) => { try { validateDinner(body); return null; } catch (e) { expect(e).toBeInstanceOf(ShareError); return e; } };

// Toutes les clés d'un objet, récursivement.
export const allKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
  return out;
};

describe('validateDinner', () => {
  it('normalise titre, date, vins et plats', () => {
    expect(validateDinner({ title: ' Dîner chez nous ', date: '2026-10-12', items: [{ wineId: W.toUpperCase(), dish: ' Agneau ' }, { wineId: W }] }))
      .toEqual({ title: 'Dîner chez nous', date: '2026-10-12', items: [{ wineId: W, dish: 'Agneau' }, { wineId: W, dish: null }] });
    expect(validateDinner({ title: 'X', items: [{ wineId: W }] }).date).toBeNull();
  });

  it('refuse titre vide ou trop long, date invalide, 0 ou 21 vins, vin invalide, plat trop long', () => {
    expect(errorOf({ title: ' ', items: [{ wineId: W }] }).status).toBe(400);
    expect(errorOf({ title: 'x'.repeat(121), items: [{ wineId: W }] })).toBeTruthy();
    expect(errorOf({ title: 'X', date: '12/10/2026', items: [{ wineId: W }] }).message).toMatch(/Date/);
    expect(errorOf({ title: 'X', items: [] }).message).toMatch(/entre 1 et 20/);
    expect(errorOf({ title: 'X', items: Array.from({ length: MAX_ITEMS + 1 }, () => ({ wineId: W })) })).toBeTruthy();
    expect(errorOf({ title: 'X', items: [{ wineId: 'abc' }] }).message).toMatch(/Vin invalide/);
    expect(errorOf({ title: 'X', items: [{ wineId: W, dish: 'x'.repeat(201) }] }).message).toMatch(/200/);
  });
});

describe('jeton', () => {
  it('43 caractères base64url, jamais deux fois le même', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
    expect(isToken(a)).toBe(true);
    expect(isToken('abc')).toBe(false);
    expect(isToken(`${a}'`)).toBe(false);
  });
});

describe('toPublicShare', () => {
  const wine = {
    id: W, name: 'Grand Vin', cuvee: null, producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Pauillac',
    region: 'Bordeaux', country: 'France', grape_varieties: ['Merlot'], sensory_description: 'Ample', aroma_profile: ['cassis'],
    suggested_food_pairings: ['agneau'], purchase_price: 25, location: { rackId: 'r' }, peak_start: 2025, user_id: 'u',
  };
  const tastings = [
    { id: 't1', wine_id: W, date: '2026-01-01T19:00:00Z', overall_rating: 3, general_notes: 'Fermé', occasion: 'Noël', companions: 'Paul' },
    { id: 't2', wine_id: W, date: '2026-06-01T19:00:00Z', overall_rating: 5, general_notes: ' Superbe ', occasion: null, companions: 'Marie' },
    { id: 't3', wine_id: W, date: '2026-07-01T19:00:00Z', overall_rating: null, general_notes: '  ', occasion: null, companions: null },
  ];

  it('dîner : ordre de service, plats, dégustations récentes d’abord et vides ignorées', () => {
    const out = toPublicShare({ kind: 'DINNER', title: 'Dîner', dinner_date: '2026-10-12' }, [
      { dish: 'Agneau', wine, tastings },
      { dish: null, wine: { ...wine, name: 'Second' }, tastings: [] },
    ]);
    expect(out).toMatchObject({ kind: 'DINNER', title: 'Dîner', date: '2026-10-12' });
    expect(out.wines.map((w) => [w.position, w.name, w.dish])).toEqual([[1, 'Grand Vin', 'Agneau'], [2, 'Second', null]]);
    expect(out.wines[0].tastings).toEqual([
      { date: '2026-06-01', rating: 5, comment: 'Superbe' },
      { date: '2026-01-01', rating: 3, comment: 'Fermé' },
    ]);
    expect(out.wines[0]).toMatchObject({ grapeVarieties: ['Merlot'], aromaProfile: ['cassis'], suggestedFoodPairings: ['agneau'], sensoryDescription: 'Ample' });
  });

  it('fiche : ni titre ni date', () => {
    expect(toPublicShare({ kind: 'WINE', title: 'x', dinner_date: '2026-10-12' }, [{ dish: null, wine, tastings: [] }]))
      .toMatchObject({ kind: 'WINE', title: null, date: null });
  });

  it('liste blanche : aucun identifiant, prix, emplacement, apogée, occasion ni convive', () => {
    const keys = allKeys(toPublicShare({ kind: 'DINNER', title: 'D', dinner_date: null }, [{ dish: null, wine, tastings }]));
    for (const forbidden of ['id', 'wine_id', 'purchase_price', 'location', 'peak_start', 'user_id', 'occasion', 'companions']) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Lancer, il échoue**

Run: `cd backend && npx vitest run tests/unit/shares.test.js`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Migration `db/migrations/013_shares.sql`**

```sql
-- Partage public : fiche vin ou carte des vins d'un dîner, par lien sans compte.
-- Le jeton (256 bits, base64url) est la seule clé d'accès ; révocation définitive.
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

CREATE TABLE IF NOT EXISTS share_items (
    share_id uuid NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    position integer NOT NULL,
    wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
    dish text,
    PRIMARY KEY (share_id, position)
);

CREATE INDEX IF NOT EXISTS idx_shares_wine ON shares (wine_id) WHERE revoked_at IS NULL;
```

- [ ] **Step 4: `backend/src/shares/validate.js`**

```js
import { randomBytes } from 'node:crypto';

// Partages : validation d'une carte de dîner, jetons d'accès public.

export class ShareError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ITEMS = 20;

/** Jeton d'accès public : 256 bits aléatoires, en base64url (43 caractères). */
export const newToken = () => randomBytes(32).toString('base64url');
export const isToken = (value) => /^[A-Za-z0-9_-]{43}$/.test(String(value ?? ''));
export const isUuid = (value) => UUID.test(String(value ?? ''));

export const validateDinner = (body) => {
  const b = body || {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > 120) throw new ShareError(400, 'Titre obligatoire (120 caractères au plus)');
  let date = null;
  if (b.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(Date.parse(`${b.date}T00:00:00Z`))) {
      throw new ShareError(400, 'Date invalide (AAAA-MM-JJ)');
    }
    date = b.date;
  }
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) {
    throw new ShareError(400, `Une carte contient entre 1 et ${MAX_ITEMS} vins`);
  }
  const items = b.items.map((item) => {
    if (!isUuid(item?.wineId)) throw new ShareError(400, 'Vin invalide');
    const dish = typeof item.dish === 'string' ? item.dish.trim() : '';
    if (dish.length > 200) throw new ShareError(400, '« Servi avec » : 200 caractères au plus');
    return { wineId: String(item.wineId).toLowerCase(), dish: dish || null };
  });
  return { title, date, items };
};
```

- [ ] **Step 5: `backend/src/shares/publicView.js`**

```js
// Réponse publique d'un partage : uniquement les champs autorisés (liste
// blanche). Jamais d'identifiant, de prix, de bouteille, d'emplacement,
// d'apogée, d'occasion ni de convive.

const text = (value) => {
  if (value == null) return null;
  const t = String(value).trim();
  return t ? t : null;
};
const list = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/** Dégustations publiques : note et commentaire, les plus récentes d'abord ; les vides sont ignorées. */
export const toPublicTastings = (rows) => rows
  .filter((t) => t.overall_rating != null || text(t.general_notes))
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .map((t) => ({ date: day(t.date), rating: t.overall_rating == null ? null : Number(t.overall_rating), comment: text(t.general_notes) }));

export const toPublicShare = (share, items) => ({
  kind: share.kind,
  title: share.kind === 'DINNER' ? text(share.title) : null,
  date: share.kind === 'DINNER' ? share.dinner_date || null : null,
  wines: items.map((item, index) => {
    const w = item.wine;
    return {
      position: index + 1,
      dish: text(item.dish),
      name: text(w.name),
      cuvee: text(w.cuvee),
      producer: text(w.producer),
      vintage: w.vintage ?? null,
      type: w.type ?? null,
      appellation: text(w.appellation),
      region: text(w.region),
      country: text(w.country),
      grapeVarieties: list(w.grape_varieties),
      sensoryDescription: text(w.sensory_description),
      aromaProfile: list(w.aroma_profile),
      suggestedFoodPairings: list(w.suggested_food_pairings),
      tastings: toPublicTastings(item.tastings || []),
    };
  }),
});
```

- [ ] **Step 6: Lancer, il passe**

Run: `cd backend && npx vitest run tests/unit/shares.test.js`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add db/migrations/013_shares.sql backend/src/shares/validate.js backend/src/shares/publicView.js backend/tests/unit/shares.test.js
git commit -m "Partage public : tables, validation des cartes, vue publique à liste blanche

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Routes `/api/shares` et route publique

**Files:**
- Create: `backend/src/routes/shares.js`, `backend/src/routes/publicShares.js`
- Modify: `backend/src/middleware/rateLimits.js` (store `public` + `publicLimiter`), `backend/src/app.js`
- Test: `backend/tests/api/shares.test.js`

**Interfaces:**
- Consumes: Tâche 1 (`validateDinner`, `ShareError`, `newToken`, `isToken`, `isUuid`, `toPublicShare`).
- Produces (HTTP) :
  - `GET /api/shares` → `[{ id, token, kind, title, dinnerDate, wineName, wineVintage, itemCount, createdAt, revokedAt, viewCount, lastViewedAt }]`
  - `GET /api/shares/:id` (dîner) → `{ id, token, title, dinnerDate, revokedAt, items: [{ wineId, dish, name, producer, vintage }] }`
  - `POST /api/shares` → `{ id, token, kind, url }` (201 créé, 200 fiche déjà partagée)
  - `PUT /api/shares/:id` → `{ id, token, kind, url }`
  - `POST /api/shares/:id/revoke` → `{ id, token, kind, url, revokedAt }`
  - `GET /api/public/shares/:token` → `PublicShare` | 404 `{ error: 'Ce lien n’est plus actif.' }`

- [ ] **Step 1: Écrire le test d'API**

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

const allKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
  return out;
};
const GONE = { error: 'Ce lien n’est plus actif.' };

describe.skipIf(!hasDb)('API partages', () => {
  let client;
  let a;
  let b;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Pauillac', grapeVarieties: ['Merlot'] })).body;
    b = (await client.post('/api/wines', { name: 'Petit Vin', producer: 'Domaine Y', vintage: 2020, type: 'WHITE' })).body;
    await client.post('/api/bottles', { wineId: a.id, purchasePrice: 25, location: { rackId: 'r1', x: 1, y: 1 } });
    await client.post('/api/tasting-notes', { wineId: a.id, overallRating: 4, generalNotes: 'Superbe', occasion: 'Anniversaire', companions: 'Paul et Marie' });
  });
  afterAll(() => pool.end());

  const publicGet = (token) => api().get(`/api/public/shares/${token}`);
  const tokenOf = (res) => res.body.url.replace('/p/', '');

  it('routes de gestion réservées aux comptes', async () => {
    expect((await api().get('/api/shares')).status).toBe(401);
    expect((await api().post('/api/shares').send({ kind: 'WINE', wineId: a.id })).status).toBe(401);
  });

  it('fiche : créée, puis reprise ; un seul lien même en double clic', async () => {
    const [r1, r2] = await Promise.all([
      client.post('/api/shares', { kind: 'WINE', wineId: a.id }),
      client.post('/api/shares', { kind: 'WINE', wineId: a.id }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.token).toBe(r2.body.token);
    expect(r1.body.url).toBe(`/p/${r1.body.token}`);
    expect(r1.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await client.post('/api/shares', { kind: 'WINE', wineId: '33333333-3333-4333-8333-333333333333' })).status).toBe(404);
  });

  it('page publique sans compte : champs autorisés seulement, en-têtes, compteur', async () => {
    const token = tokenOf(await client.post('/api/shares', { kind: 'WINE', wineId: a.id }));
    const res = await publicGet(token);
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ kind: 'WINE', title: null, wines: [{ position: 1, name: 'Grand Vin', appellation: 'Pauillac', grapeVarieties: ['Merlot'], tastings: [{ rating: 4, comment: 'Superbe' }] }] });
    const keys = allKeys(res.body);
    for (const forbidden of ['id', 'wineId', 'wine_id', 'purchasePrice', 'purchase_price', 'bottles', 'location', 'occasion', 'companions', 'peakStart', 'peak_start', 'embedding']) {
      expect(keys.has(forbidden)).toBe(false);
    }
    await publicGet(token);
    const list = (await client.get('/api/shares')).body;
    expect(list).toEqual([expect.objectContaining({ kind: 'WINE', wineName: 'Grand Vin', wineVintage: 2018, viewCount: 2, revokedAt: null })]);
  });

  it('carte de dîner : création, lecture, modification avec le même lien', async () => {
    const created = await client.post('/api/shares', { kind: 'DINNER', title: 'Dîner chez nous', date: '2026-10-12', items: [{ wineId: b.id, dish: 'Huîtres' }, { wineId: a.id, dish: 'Agneau' }] });
    expect(created.status).toBe(201);
    const token = tokenOf(created);
    expect((await publicGet(token)).body).toMatchObject({ kind: 'DINNER', title: 'Dîner chez nous', date: '2026-10-12', wines: [{ position: 1, name: 'Petit Vin', dish: 'Huîtres' }, { position: 2, name: 'Grand Vin', dish: 'Agneau' }] });

    const updated = await client.put(`/api/shares/${created.body.id}`, { title: 'Dîner du samedi', items: [{ wineId: a.id }, { wineId: b.id, dish: 'Fromages' }] });
    expect(updated.status).toBe(200);
    expect(updated.body.token).toBe(token);
    expect((await publicGet(token)).body).toMatchObject({ title: 'Dîner du samedi', date: null, wines: [{ name: 'Grand Vin', dish: null }, { name: 'Petit Vin', dish: 'Fromages' }] });
    expect((await client.get(`/api/shares/${created.body.id}`)).body).toMatchObject({ title: 'Dîner du samedi', items: [{ wineId: a.id, name: 'Grand Vin' }, { wineId: b.id, dish: 'Fromages' }] });
  });

  it('validation de la carte', async () => {
    const post = (body) => client.post('/api/shares', { kind: 'DINNER', ...body });
    expect((await post({ title: 'X', items: [] })).status).toBe(400);
    expect((await post({ title: 'X', items: Array.from({ length: 21 }, () => ({ wineId: a.id })) })).status).toBe(400);
    expect((await post({ title: ' ', items: [{ wineId: a.id }] })).status).toBe(400);
    expect((await post({ title: 'X', date: '2026-13-40', items: [{ wineId: a.id }] })).status).toBe(400);
    const unknown = await post({ title: 'X', items: [{ wineId: '33333333-3333-4333-8333-333333333333' }] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/n’existe pas/);
    expect((await client.post('/api/shares', { kind: 'OTHER' })).status).toBe(400);
  });

  it('révocation : 404 identique à un lien inconnu, modification refusée, idempotente', async () => {
    const created = await client.post('/api/shares', { kind: 'DINNER', title: 'D', items: [{ wineId: a.id }] });
    const token = tokenOf(created);
    const revoked = await client.post(`/api/shares/${created.body.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.revokedAt).toBeTruthy();
    expect((await client.post(`/api/shares/${created.body.id}/revoke`)).status).toBe(200);

    const gone = await publicGet(token);
    const unknown = await publicGet('A'.repeat(43));
    const malformed = await publicGet('abc');
    expect([gone.status, unknown.status, malformed.status]).toEqual([404, 404, 404]);
    expect(gone.body).toEqual(GONE);
    expect(unknown.body).toEqual(GONE);
    expect(malformed.body).toEqual(GONE);
    expect((await client.put(`/api/shares/${created.body.id}`, { title: 'D2', items: [{ wineId: a.id }] })).status).toBe(409);

    // Après révocation, partager la fiche crée un nouveau lien.
    const wine1 = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
    await client.post(`/api/shares/${wine1.body.id}/revoke`);
    const wine2 = await client.post('/api/shares', { kind: 'WINE', wineId: a.id });
    expect(wine2.status).toBe(201);
    expect(wine2.body.token).not.toBe(wine1.body.token);
  });

  it('vin supprimé : lien de fiche inactif, vin retiré de la carte', async () => {
    const wineToken = tokenOf(await client.post('/api/shares', { kind: 'WINE', wineId: a.id }));
    const dinnerToken = tokenOf(await client.post('/api/shares', { kind: 'DINNER', title: 'D', items: [{ wineId: a.id }, { wineId: b.id }] }));
    await client.delete(`/api/wines/${a.id}`);
    expect((await publicGet(wineToken)).status).toBe(404);
    expect((await publicGet(dinnerToken)).body.wines.map((w) => w.name)).toEqual(['Petit Vin']);
  });
});
```

- [ ] **Step 2: Démarrer la base de test et lancer, il échoue**

```bash
docker run -d --rm --name vinoflow-test-db -e POSTGRES_USER=vinoflow -e POSTGRES_PASSWORD=vinoflow -e POSTGRES_DB=vinoflow_test -p 55432:5432 pgvector/pgvector:pg16
```

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npx vitest run tests/api/shares.test.js`
Expected: FAIL — 404 sur les routes (le test 401 sur `/api/shares` passe déjà : l'authentification précède le 404).

- [ ] **Step 3: Limiteur public (`backend/src/middleware/rateLimits.js`)**

Remplacer `const stores = { auth: new MemoryStore(), refresh: new MemoryStore(), ai: new MemoryStore() };` par `const stores = { auth: new MemoryStore(), refresh: new MemoryStore(), ai: new MemoryStore(), public: new MemoryStore() };`, puis ajouter en fin de fichier :

```js
// Pages publiques des partages (sans compte) : par IP, contre l'énumération des jetons.
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

- [ ] **Step 4: `backend/src/routes/publicShares.js`**

```js
import { Router } from 'express';
import { pool } from '../db.js';
import { isToken } from '../shares/validate.js';
import { toPublicShare } from '../shares/publicView.js';

const router = Router();

// ========== PARTAGE PUBLIC (sans compte) ==========
// Seule route ouverte sans authentification. Lien inconnu, mal formé ou
// révoqué : même réponse, pour ne rien révéler. Le jeton n'est jamais journalisé.
const GONE = { error: 'Ce lien n’est plus actif.' };
const WINE_COLUMNS = `w.id, w.name, w.cuvee, w.producer, w.vintage, w.type, w.appellation, w.region, w.country,
  w.grape_varieties, w.sensory_description, w.aroma_profile, w.suggested_food_pairings`;

router.get('/shares/:token', async (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  try {
    if (!isToken(req.params.token)) return res.status(404).json(GONE);
    const { rows: [share] } = await pool.query(
      `UPDATE shares SET view_count = view_count + 1, last_viewed_at = now()
        WHERE token = $1 AND revoked_at IS NULL
        RETURNING id, kind, title, to_char(dinner_date, 'YYYY-MM-DD') AS dinner_date, wine_id`,
      [req.params.token],
    );
    if (!share) return res.status(404).json(GONE);
    const { rows: wines } = share.kind === 'WINE'
      ? await pool.query(`SELECT NULL AS dish, ${WINE_COLUMNS} FROM wines w WHERE w.id = $1`, [share.wine_id])
      : await pool.query(
        `SELECT i.dish, ${WINE_COLUMNS} FROM share_items i JOIN wines w ON w.id = i.wine_id
          WHERE i.share_id = $1 ORDER BY i.position`,
        [share.id],
      );
    const ids = wines.map((w) => w.id);
    const { rows: tastings } = ids.length
      ? await pool.query('SELECT wine_id, date, overall_rating, general_notes FROM tasting_notes WHERE wine_id = ANY($1::uuid[])', [ids])
      : { rows: [] };
    return res.json(toPublicShare(share, wines.map((w) => ({ dish: w.dish, wine: w, tastings: tastings.filter((t) => t.wine_id === w.id) }))));
  } catch (error) {
    console.error('Public share error:', error.message);
    return res.status(500).json({ error: 'Impossible de charger la carte.' });
  }
});

export default router;
```

- [ ] **Step 5: `backend/src/routes/shares.js`**

```js
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { validateDinner, ShareError, newToken, isUuid } from '../shares/validate.js';

const router = Router();

// ========== PARTAGES (gestion, comptes du foyer) ==========
const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const link = (row) => ({ id: row.id, token: row.token, kind: row.kind, url: `/p/${row.token}` });

const fail = (res, error, label) => {
  if (error instanceof ShareError) return res.status(error.status).json({ error: error.message });
  console.error(label, error);
  return res.status(500).json({ error: 'Le partage a échoué.' });
};

const checkWines = async (db, ids) => {
  const { rows } = await db.query('SELECT id FROM wines WHERE id = ANY($1::uuid[])', [ids]);
  const found = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !found.has(id))) throw new ShareError(400, 'Un des vins n’existe pas (ou plus) dans la cave');
};

const writeItems = async (db, shareId, items) => {
  await db.query('DELETE FROM share_items WHERE share_id = $1', [shareId]);
  for (const [index, item] of items.entries()) {
    await db.query('INSERT INTO share_items (share_id, position, wine_id, dish) VALUES ($1, $2, $3, $4)', [shareId, index + 1, item.wineId, item.dish]);
  }
};

router.get('/shares', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.token, s.kind, s.title, to_char(s.dinner_date, 'YYYY-MM-DD') AS dinner_date, s.created_at, s.revoked_at,
             s.view_count, s.last_viewed_at, w.name AS wine_name, w.vintage AS wine_vintage,
             (SELECT count(*)::int FROM share_items i WHERE i.share_id = s.id) AS item_count
        FROM shares s LEFT JOIN wines w ON w.id = s.wine_id
       ORDER BY s.created_at DESC`);
    return res.json(rows.map((r) => ({
      id: r.id, token: r.token, kind: r.kind, title: r.title, dinnerDate: r.dinner_date, wineName: r.wine_name,
      wineVintage: r.wine_vintage, itemCount: r.item_count, createdAt: r.created_at, revokedAt: r.revoked_at,
      viewCount: r.view_count, lastViewedAt: r.last_viewed_at,
    })));
  } catch (error) {
    return fail(res, error, 'List shares error:');
  }
});

router.get(`/shares/:id(${ID})`, async (req, res) => {
  try {
    const { rows: [s] } = await pool.query(
      `SELECT id, token, kind, title, to_char(dinner_date, 'YYYY-MM-DD') AS dinner_date, revoked_at FROM shares WHERE id = $1`,
      [req.params.id],
    );
    if (!s || s.kind !== 'DINNER') return res.status(404).json({ error: 'Carte introuvable' });
    const { rows: items } = await pool.query(
      `SELECT i.wine_id, i.dish, w.name, w.producer, w.vintage FROM share_items i JOIN wines w ON w.id = i.wine_id
        WHERE i.share_id = $1 ORDER BY i.position`,
      [s.id],
    );
    return res.json({
      id: s.id, token: s.token, title: s.title, dinnerDate: s.dinner_date, revokedAt: s.revoked_at,
      items: items.map((i) => ({ wineId: i.wine_id, dish: i.dish, name: i.name, producer: i.producer, vintage: i.vintage })),
    });
  } catch (error) {
    return fail(res, error, 'Get share error:');
  }
});

router.post('/shares', async (req, res) => {
  try {
    const body = req.body || {};
    const userId = req.user?.userId ?? null;
    if (body.kind === 'WINE') {
      if (!isUuid(body.wineId)) throw new ShareError(400, 'Vin invalide');
      const wineId = String(body.wineId).toLowerCase();
      // Verrou sur le vin : deux clics simultanés donnent un seul lien.
      const { row, created } = await withTransaction(async (db) => {
        const { rows: [wine] } = await db.query('SELECT id FROM wines WHERE id = $1 FOR UPDATE', [wineId]);
        if (!wine) throw new ShareError(404, 'Vin introuvable');
        const { rows: [existing] } = await db.query(
          `SELECT id, token, kind FROM shares WHERE kind = 'WINE' AND wine_id = $1 AND revoked_at IS NULL`, [wineId],
        );
        if (existing) return { row: existing, created: false };
        const { rows: [inserted] } = await db.query(
          `INSERT INTO shares (token, kind, wine_id, created_by) VALUES ($1, 'WINE', $2, $3) RETURNING id, token, kind`,
          [newToken(), wineId, userId],
        );
        return { row: inserted, created: true };
      });
      return res.status(created ? 201 : 200).json(link(row));
    }
    if (body.kind === 'DINNER') {
      const dinner = validateDinner(body);
      const row = await withTransaction(async (db) => {
        await checkWines(db, dinner.items.map((i) => i.wineId));
        const { rows: [share] } = await db.query(
          `INSERT INTO shares (token, kind, title, dinner_date, created_by) VALUES ($1, 'DINNER', $2, $3, $4) RETURNING id, token, kind`,
          [newToken(), dinner.title, dinner.date, userId],
        );
        await writeItems(db, share.id, dinner.items);
        return share;
      });
      return res.status(201).json(link(row));
    }
    throw new ShareError(400, 'Type de partage inconnu');
  } catch (error) {
    return fail(res, error, 'Create share error:');
  }
});

router.put(`/shares/:id(${ID})`, async (req, res) => {
  try {
    const dinner = validateDinner(req.body);
    const row = await withTransaction(async (db) => {
      const { rows: [share] } = await db.query('SELECT id, token, kind, revoked_at FROM shares WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!share) throw new ShareError(404, 'Carte introuvable');
      if (share.kind !== 'DINNER') throw new ShareError(400, 'Seule une carte de dîner se modifie');
      if (share.revoked_at) throw new ShareError(409, 'Ce lien a été révoqué : crée une nouvelle carte.');
      await checkWines(db, dinner.items.map((i) => i.wineId));
      await db.query('UPDATE shares SET title = $1, dinner_date = $2 WHERE id = $3', [dinner.title, dinner.date, share.id]);
      await writeItems(db, share.id, dinner.items);
      return share;
    });
    return res.json(link(row));
  } catch (error) {
    return fail(res, error, 'Update share error:');
  }
});

router.post(`/shares/:id(${ID})/revoke`, async (req, res) => {
  try {
    const { rows: [share] } = await pool.query(
      'UPDATE shares SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 RETURNING id, token, kind, revoked_at',
      [req.params.id],
    );
    if (!share) return res.status(404).json({ error: 'Lien introuvable' });
    return res.json({ ...link(share), revokedAt: share.revoked_at });
  } catch (error) {
    return fail(res, error, 'Revoke share error:');
  }
});

export default router;
```

- [ ] **Step 6: Montage dans `backend/src/app.js`**

- Imports : `import { aiLimiter, publicLimiter } from './middleware/rateLimits.js';` (remplace l'import d'`aiLimiter`), `import sharesRouter from './routes/shares.js';`, `import publicSharesRouter from './routes/publicShares.js';`.
- Juste après `app.use('/api', authRouter);` :

```js
// Partage public : seule route de données ouverte sans compte (lecture seule).
app.use('/api/public', publicLimiter, publicSharesRouter);
```

- Après `app.use('/api', importRouter);` : `app.use('/api', sharesRouter);`.

- [ ] **Step 7: Lancer, il passe ; puis toute la suite backend**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npx vitest run tests/api/shares.test.js`
Expected: PASS (7 tests).

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npm test` puis `for f in src/shares/*.js src/routes/shares.js src/routes/publicShares.js src/middleware/rateLimits.js src/app.js; do node --check "$f"; done`
Expected: toute la suite verte ; aucune erreur de syntaxe.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/shares.js backend/src/routes/publicShares.js backend/src/middleware/rateLimits.js backend/src/app.js backend/tests/api/shares.test.js
git commit -m "Partage public : routes de gestion et page publique en lecture seule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Front — types, services, mise en forme et partage

**Files:**
- Modify: `types.ts` (fin de fichier), `services/storageService.ts` (fin de fichier)
- Create: `utils/shareView.ts`, `utils/shareView.test.ts`, `utils/shareLink.ts`, `utils/shareLink.test.ts`

**Interfaces:**
- Consumes: HTTP de la Tâche 2.
- Produces:
  - types `PublicShare`, `PublicShareWine`, `ShareSummary`, `DinnerShareDetail`, `ShareLink` ;
  - services `listShares()`, `getDinnerShare(id)`, `shareWine(wineId)`, `createDinnerShare(body)`, `updateDinnerShare(id, body)`, `revokeShare(id)` (lèvent une `Error` avec le message du serveur), `fetchPublicShare(token) → Promise<{ status: 'ok'; share: PublicShare } | { status: 'gone' } | { status: 'error' }>` ;
  - `utils/shareView.ts` : `stars(rating)`, `frenchDate(iso)`, `typeLabel(type)`, `moveItem(list, index, delta)`, `searchWines(wines, query, limit = 8)`, `absoluteUrl(path)` ;
  - `utils/shareLink.ts` : `shareOrCopy({ title, url }) → Promise<'shared' | 'copied' | 'cancelled' | 'failed'>`.

- [ ] **Step 1: Écrire les tests**

`utils/shareView.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { stars, frenchDate, typeLabel, moveItem, searchWines } from './shareView';
import type { CellarWine } from '../types';

describe('shareView', () => {
  it('étoiles, date en français, couleur', () => {
    expect(stars(4)).toBe('★★★★☆');
    expect(stars(0)).toBe('☆☆☆☆☆');
    expect(stars(null)).toBe('');
    expect(frenchDate('2026-10-12')).toBe('lundi 12 octobre 2026');
    expect(frenchDate('2026-03-01')).toBe('dimanche 1er mars 2026');
    expect(frenchDate(null)).toBe('');
    expect(typeLabel('SPARKLING')).toBe('Effervescent');
    expect(typeLabel(null)).toBe('');
  });

  it('déplace un vin dans la liste sans sortir des bornes', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('recherche sans accents, en stock d’abord, 8 résultats au plus', () => {
    const w = (id: string, name: string, inventoryCount: number, extra = {}) =>
      ({ id, name, producer: 'Dom', cuvee: '', appellation: '', vintage: 2018, inventoryCount, ...extra }) as unknown as CellarWine;
    const wines = [w('a', 'Côte-Rôtie', 0), w('b', 'Cote Rotie La Landonne', 2), w('c', 'Chablis', 1, { vintage: 2020 })];
    expect(searchWines(wines, 'cote rotie').map((x) => x.id)).toEqual(['b', 'a']);
    expect(searchWines(wines, '2020').map((x) => x.id)).toEqual(['c']);
    expect(searchWines(wines, '')).toEqual([]);
    expect(searchWines(Array.from({ length: 12 }, (_, i) => w(`${i}`, 'Vin', 1)), 'vin')).toHaveLength(8);
  });
});
```

`utils/shareLink.test.ts` :

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shareOrCopy } from './shareLink';

afterEach(() => vi.unstubAllGlobals());

describe('shareOrCopy', () => {
  it('feuille de partage du téléphone si disponible', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share });
    expect(await shareOrCopy({ title: 'Dîner', url: 'https://x/p/t' })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Dîner', url: 'https://x/p/t' });
  });

  it('partage annulé par l’utilisateur', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }) });
    expect(await shareOrCopy({ title: 'D', url: 'u' })).toBe('cancelled');
  });

  it('sinon copie dans le presse-papiers', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareOrCopy({ title: 'D', url: 'u' })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('u');
  });

  it('ni partage ni presse-papiers', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareOrCopy({ title: 'D', url: 'u' })).toBe('failed');
  });
});
```

- [ ] **Step 2: Lancer, ils échouent**

Run: `npx vitest run utils/shareView.test.ts utils/shareLink.test.ts`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Types (`types.ts`, fin de fichier)**

```ts
// ─── Partage public ───
export interface PublicShareWine {
  position: number; dish: string | null; name: string | null; cuvee: string | null; producer: string | null;
  vintage: number | null; type: WineType | null; appellation: string | null; region: string | null; country: string | null;
  grapeVarieties: string[]; sensoryDescription: string | null; aromaProfile: string[]; suggestedFoodPairings: string[];
  tastings: { date: string | null; rating: number | null; comment: string | null }[];
}
export interface PublicShare { kind: 'WINE' | 'DINNER'; title: string | null; date: string | null; wines: PublicShareWine[] }
export interface ShareLink { id: string; token: string; kind: 'WINE' | 'DINNER'; url: string; revokedAt?: string | null }
export interface ShareSummary {
  id: string; token: string; kind: 'WINE' | 'DINNER'; title: string | null; dinnerDate: string | null;
  wineName: string | null; wineVintage: number | null; itemCount: number; createdAt: string;
  revokedAt: string | null; viewCount: number; lastViewedAt: string | null;
}
export interface DinnerShareDetail {
  id: string; token: string; title: string; dinnerDate: string | null; revokedAt: string | null;
  items: { wineId: string; dish: string | null; name: string; producer: string | null; vintage: number | null }[];
}
export interface DinnerShareInput { title: string; date?: string | null; items: { wineId: string; dish?: string | null }[] }
```

- [ ] **Step 4: Services (`services/storageService.ts`, fin de fichier ; ajouter `PublicShare, ShareLink, ShareSummary, DinnerShareDetail, DinnerShareInput` à l'import depuis `../types`)**

```ts
// ─── Partage public ───
const shareRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await apiFetch(`${API_URL}${path}`, { ...init, headers: getHeaders() });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Erreur ${response.status}`);
  return data as T;
};

export const listShares = () => shareRequest<ShareSummary[]>('/shares');
export const getDinnerShare = (id: string) => shareRequest<DinnerShareDetail>(`/shares/${id}`);
export const shareWine = (wineId: string) =>
  shareRequest<ShareLink>('/shares', { method: 'POST', body: JSON.stringify({ kind: 'WINE', wineId }) });
export const createDinnerShare = (body: DinnerShareInput) =>
  shareRequest<ShareLink>('/shares', { method: 'POST', body: JSON.stringify({ kind: 'DINNER', ...body }) });
export const updateDinnerShare = (id: string, body: DinnerShareInput) =>
  shareRequest<ShareLink>(`/shares/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const revokeShare = (id: string) => shareRequest<ShareLink>(`/shares/${id}/revoke`, { method: 'POST' });

/** Page publique : sans jeton ni déconnexion (fetch simple). */
export const fetchPublicShare = async (token: string): Promise<{ status: 'ok'; share: PublicShare } | { status: 'gone' } | { status: 'error' }> => {
  try {
    const response = await fetch(`${API_URL}/public/shares/${encodeURIComponent(token)}`);
    if (response.status === 404) return { status: 'gone' };
    if (!response.ok) return { status: 'error' };
    return { status: 'ok', share: await response.json() };
  } catch {
    return { status: 'error' };
  }
};
```

- [ ] **Step 5: `utils/shareView.ts`**

```ts
import type { CellarWine, WineType } from '../types';

// Mise en forme des partages (page publique, compositeur).

export const stars = (rating: number | null | undefined): string => {
  if (rating == null) return '';
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-10-12 » → « lundi 12 octobre 2026 » (sans dépendre de la locale du navigateur). */
export const frenchDate = (iso: string | null | undefined): string => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[day]} ${d === 1 ? '1er' : d} ${MONTHS[mo - 1]} ${y}`;
};

const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Effervescent', DESSERT: 'Moelleux', FORTIFIED: 'Muté',
};
export const typeLabel = (type: WineType | string | null | undefined): string => (type ? TYPE_LABELS[type] || type : '');

/** Déplace l'élément `index` de `delta` (−1 / +1), sans sortir de la liste. */
export const moveItem = <T>(list: T[], index: number, delta: number): T[] => {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Vins de la cave correspondant à la recherche (tous les mots), en stock d'abord. */
export const searchWines = (wines: CellarWine[], query: string, limit = 8): CellarWine[] => {
  const words = norm(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return [];
  return wines
    .filter(w => {
      const hay = norm([w.name, w.cuvee, w.producer, w.appellation, w.vintage].filter(Boolean).join(' '));
      return words.every(word => hay.includes(word));
    })
    .sort((a, b) => (b.inventoryCount > 0 ? 1 : 0) - (a.inventoryCount > 0 ? 1 : 0))
    .slice(0, limit);
};

export const absoluteUrl = (path: string) => `${window.location.origin}${path}`;
```

- [ ] **Step 6: `utils/shareLink.ts`**

```ts
/**
 * Partage un lien : feuille de partage du téléphone (iMessage, WhatsApp…) si
 * disponible, sinon copie dans le presse-papiers.
 */
export const shareOrCopy = async ({ title, url }: { title: string; url: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> => {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav?.share) {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (!nav?.clipboard?.writeText) return 'failed';
    await nav.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};
```

- [ ] **Step 7: Lancer, ils passent**

Run: `npx vitest run utils/shareView.test.ts utils/shareLink.test.ts && npm run typecheck`
Expected: PASS (7 tests), typecheck sans erreur.

- [ ] **Step 8: Commit**

```bash
git add types.ts services/storageService.ts utils/shareView.ts utils/shareView.test.ts utils/shareLink.ts utils/shareLink.test.ts
git commit -m "Partage public : services, mise en forme et partage du lien côté app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Page publique `/p/:token`

**Files:**
- Create: `pages/PublicShare.tsx`
- Modify: `App.tsx` (lazy import + route hors `ProtectedRoute`)

**Interfaces:**
- Consumes: `fetchPublicShare` (Tâche 3), `stars`, `frenchDate`, `typeLabel` (Tâche 3), `PublicShare`, `PublicShareWine`.

- [ ] **Step 1: `pages/PublicShare.tsx`**

```tsx
// Page publique d'un partage (fiche vin ou carte de dîner) : sans compte,
// sans menu ni lien vers le reste de l'app, en lecture seule.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublicShare } from '../services/storageService';
import type { PublicShare as PublicShareData, PublicShareWine } from '../types';
import { frenchDate, stars, typeLabel } from '../utils/shareView';

const DOT: Record<string, string> = {
  RED: 'bg-wine-700', WHITE: 'bg-amber-300', ROSE: 'bg-pink-400', SPARKLING: 'bg-cyan-400', DESSERT: 'bg-amber-500', FORTIFIED: 'bg-orange-700',
};

const Line: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (items.length ? (
  <div className="mt-2 text-[13px] text-stone-700"><span className="mono text-[10px] tracking-widest uppercase text-stone-500 mr-2">{label}</span>{items.join(', ')}</div>
) : null);

const WineBlock: React.FC<{ wine: PublicShareWine; numbered: boolean }> = ({ wine, numbered }) => (
  <article className="bg-white border border-stone-200 rounded-md p-4">
    <div className="flex items-start gap-3">
      {numbered && <span className="mono text-xs text-stone-400 pt-1">{String(wine.position).padStart(2, '0')}</span>}
      <div className="min-w-0 flex-1">
        {wine.dish && <div className="text-xs text-wine-700 mb-1">Servi avec {wine.dish}</div>}
        <h2 className="serif-it text-xl text-stone-900 leading-tight">{[wine.name, wine.cuvee].filter(Boolean).join(' · ')}</h2>
        <div className="mono text-[11px] tracking-widest text-stone-500 uppercase mt-1">
          {[wine.producer, wine.vintage].filter(Boolean).join(' · ')}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[13px] text-stone-600">
          {wine.type && <span className={`w-2.5 h-2.5 rounded-full ${DOT[wine.type] || 'bg-stone-400'}`} aria-hidden />}
          <span>{[typeLabel(wine.type), wine.appellation, wine.region, wine.country].filter(Boolean).join(' · ')}</span>
        </div>
        {wine.sensoryDescription && <p className="mt-3 text-sm text-stone-700 leading-relaxed">{wine.sensoryDescription}</p>}
        <Line label="Cépages" items={wine.grapeVarieties} />
        <Line label="Arômes" items={wine.aromaProfile} />
        <Line label="Accords" items={wine.suggestedFoodPairings} />
        {wine.tastings.length > 0 && (
          <ul className="mt-3 space-y-2 border-t border-stone-100 pt-3">
            {wine.tastings.map((t, i) => (
              <li key={i} className="text-sm">
                <span className="text-amber-500" aria-label={t.rating != null ? `${t.rating} sur 5` : undefined}>{stars(t.rating)}</span>
                {t.date && <span className="ml-2 text-xs text-stone-400">{frenchDate(t.date)}</span>}
                {t.comment && <p className="text-stone-700 mt-0.5">{t.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </article>
);

export const PublicShare: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'gone' } | { status: 'error' } | { status: 'ok'; share: PublicShareData }>({ status: 'loading' });

  // Pas d'indexation par les moteurs de recherche.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPublicShare(token).then(r => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (state.status === 'ok') document.title = state.share.title || state.share.wines[0]?.name || 'VinoFlow';
  }, [state]);

  return (
    <div className="min-h-screen bg-stone-50">
      <main className="max-w-[640px] mx-auto px-4 py-8">
        {state.status === 'loading' && <div className="text-center text-stone-500 py-20">Chargement…</div>}
        {state.status === 'gone' && <div className="text-center text-stone-600 py-20 serif-it text-lg">Ce lien n’est plus actif.</div>}
        {state.status === 'error' && <div className="text-center text-stone-600 py-20">Impossible de charger la carte, réessaie.</div>}
        {state.status === 'ok' && (
          <>
            {state.share.kind === 'DINNER' && (
              <header className="mb-6 text-center">
                <div className="mono text-[10px] tracking-widest uppercase text-stone-500">Carte des vins</div>
                <h1 className="serif text-3xl text-stone-900 mt-1">{state.share.title}</h1>
                {state.share.date && <div className="text-sm text-stone-500 mt-1">{frenchDate(state.share.date)}</div>}
              </header>
            )}
            <div className="space-y-3">
              {state.share.wines.map(w => <WineBlock key={w.position} wine={w} numbered={state.share.kind === 'DINNER'} />)}
            </div>
            <footer className="mt-8 text-center mono text-[10px] tracking-widest uppercase text-stone-400">Partagé depuis VinoFlow</footer>
          </>
        )}
      </main>
    </div>
  );
};
```

- [ ] **Step 2: Route dans `App.tsx`**

Ajouter `const PublicShare = lazy(() => import('./pages/PublicShare').then(m => ({ default: m.PublicShare })));` avec les autres imports paresseux, et juste après la route `/reset-password` (bloc « Public Route », hors `ProtectedRoute`) :

```tsx
      <Route path="/p/:token" element={<Suspense fallback={<PageLoader />}><PublicShare /></Suspense>} />
```

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sans erreur, tests verts, build OK.

- [ ] **Step 4: Commit**

```bash
git add pages/PublicShare.tsx App.tsx
git commit -m "Partage public : page /p/:jeton sans compte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Partager une fiche, composer une carte de dîner

**Files:**
- Create: `pages/ShareDinner.tsx`
- Modify: `pages/CockpitWineDetails.tsx` (boutons), `components/cockpit/CommandPalette.tsx` (action), `App.tsx` (routes)

**Interfaces:**
- Consumes: `shareWine`, `getDinnerShare`, `createDinnerShare`, `updateDinnerShare` (Tâche 3), `shareOrCopy`, `moveItem`, `searchWines`, `absoluteUrl` (Tâche 3), `useWines`, primitives Cockpit, `useToast`.
- Produces: page `ShareDinner` (routes `/partages/diner`, `/partages/diner/:id`, paramètre `?wine=<id>`). Toasts selon le résultat de `shareOrCopy` : « Lien copié » si copié, rien de plus si partagé ou annulé, « Copie impossible : <url> » si échec.

- [ ] **Step 1: Boutons sur `pages/CockpitWineDetails.tsx`**

Ajouter `Share2, ListPlus` à l'import `lucide-react`, `shareWine` à l'import `storageService`, `import { shareOrCopy } from '../utils/shareLink';` et `import { absoluteUrl } from '../utils/shareView';`. Dans le composant (après `handleAddBottle`) :

```tsx
  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (!wine) return;
    setSharing(true);
    try {
      const link = await shareWine(wine.id);
      const url = absoluteUrl(link.url);
      const result = await shareOrCopy({ title: [wine.name, wine.vintage].filter(Boolean).join(' '), url });
      if (result === 'copied') toast.success('Lien copié');
      else if (result === 'failed') toast.info(`Copie impossible : ${url}`);
    } catch (e) {
      toast.error(`Partage impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
    } finally {
      setSharing(false);
    }
  };
```

Dans le bloc « Actions rapides », après le lien « Noter une dégustation » :

```tsx
          <Button variant="outline" onClick={handleShare} disabled={sharing}><Share2 className="w-3.5 h-3.5" />Partager</Button>
          <Link to={`/partages/diner?wine=${wine.id}`}>
            <Button variant="outline" className="w-full"><ListPlus className="w-3.5 h-3.5" />Carte de dîner</Button>
          </Link>
```

- [ ] **Step 2: `pages/ShareDinner.tsx`**

```tsx
// Compositeur de carte des vins d'un dîner : titre, date, vins de la cave dans
// l'ordre de service, plat associé ; puis partage du lien public.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Loader2, Share2, X } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { createDinnerShare, getDinnerShare, updateDinnerShare } from '../services/storageService';
import { absoluteUrl, moveItem, searchWines } from '../utils/shareView';
import { shareOrCopy } from '../utils/shareLink';
import { Button, Card, Input, MonoLabel } from '../components/cockpit/primitives';
import { useToast } from '../components/cockpit/feedback';

interface Item { wineId: string; dish: string; label: string }

export const ShareDinner: React.FC = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { wines } = useWines();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  const label = (w: { name: string | null; producer?: string | null; vintage?: number | null }) =>
    [w.name, w.producer, w.vintage].filter(Boolean).join(' · ');

  // Modification d'une carte existante.
  useEffect(() => {
    if (!id) return;
    getDinnerShare(id)
      .then(d => {
        setTitle(d.title);
        setDate(d.dinnerDate || '');
        setItems(d.items.map(i => ({ wineId: i.wineId, dish: i.dish || '', label: label(i) })));
      })
      .catch(e => toast.error(`Carte introuvable : ${e instanceof Error ? e.message : ''}`))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // « Carte de dîner » depuis une fiche : le vin est ajouté d'office.
  useEffect(() => {
    const wineId = params.get('wine');
    if (id || !wineId || items.length) return;
    const w = wines.find(x => x.id === wineId);
    if (w) setItems([{ wineId: w.id, dish: '', label: label(w) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wines, params, id]);

  const results = useMemo(() => searchWines(wines, query), [wines, query]);

  const add = (w: (typeof wines)[number]) => {
    setItems(list => [...list, { wineId: w.id, dish: '', label: label(w) }]);
    setQuery('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { title: title.trim(), date: date || null, items: items.map(i => ({ wineId: i.wineId, dish: i.dish.trim() || null })) };
      const link = id ? await updateDinnerShare(id, body) : await createDinnerShare(body);
      const url = absoluteUrl(link.url);
      const result = await shareOrCopy({ title: body.title, url });
      if (result === 'copied') toast.success('Carte enregistrée, lien copié');
      else if (result === 'failed') toast.info(`Carte enregistrée : ${url}`);
      else toast.success('Carte enregistrée');
      if (!id) navigate(`/partages/diner/${link.id}`, { replace: true });
    } catch (e) {
      toast.error(`Enregistrement impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
    } finally {
      setSaving(false);
    }
  };

  const canSave = title.trim().length > 0 && items.length > 0 && items.length <= 20 && !saving;

  if (!loaded) return <div className="text-center text-stone-500 py-20">Chargement…</div>;

  return (
    <div className="max-w-[720px] mx-auto pb-28 md:pb-0">
      <div className="mb-5">
        <MonoLabel>VINOFLOW · PARTAGE</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">{id ? 'Modifier la carte' : 'Carte des vins d’un dîner'}</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">Tes invités l’ouvrent sans compte ; tes notes de dégustation y apparaissent ensuite.</div>
      </div>

      <Card className="p-4 space-y-3">
        <Input label="Titre" placeholder="ex. Dîner chez nous" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
        <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Card>

      <Card className="p-4 mt-4">
        <MonoLabel>Vins, dans l’ordre de service</MonoLabel>
        {items.length === 0 && <p className="text-sm text-stone-500 mt-2">Ajoute les vins du dîner ci-dessous.</p>}
        <ol className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${item.wineId}-${index}`} className="border border-stone-200 rounded-md p-2.5">
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-stone-400 w-5">{index + 1}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-stone-900">{item.label}</span>
                <button aria-label="Monter" onClick={() => setItems(l => moveItem(l, index, -1))} className="h-9 w-9 inline-flex items-center justify-center rounded hover:bg-stone-100"><ArrowUp className="w-4 h-4" /></button>
                <button aria-label="Descendre" onClick={() => setItems(l => moveItem(l, index, 1))} className="h-9 w-9 inline-flex items-center justify-center rounded hover:bg-stone-100"><ArrowDown className="w-4 h-4" /></button>
                <button aria-label="Retirer" onClick={() => setItems(l => l.filter((_, i) => i !== index))} className="h-9 w-9 inline-flex items-center justify-center rounded text-stone-400 hover:text-wine-700"><X className="w-4 h-4" /></button>
              </div>
              <Input aria-label="Servi avec" placeholder="Servi avec… (facultatif)" value={item.dish} maxLength={200} wrapperClassName="mt-2"
                onChange={e => setItems(l => l.map((x, i) => (i === index ? { ...x, dish: e.target.value } : x)))} />
            </li>
          ))}
        </ol>

        {items.length < 20 && (
          <div className="mt-4">
            <Input label="Ajouter un vin" placeholder="Nom, producteur, appellation, millésime…" value={query} onChange={e => setQuery(e.target.value)} />
            {results.length > 0 && (
              <ul className="mt-2 border border-stone-200 rounded-md divide-y divide-stone-100">
                {results.map(w => (
                  <li key={w.id}>
                    <button onClick={() => add(w)} className="w-full text-left px-3 py-2.5 hover:bg-stone-50 text-sm">
                      <span className="text-stone-900">{w.name}</span>
                      <span className="text-stone-500"> · {[w.producer, w.vintage].filter(Boolean).join(' · ')}{w.inventoryCount > 0 ? ` · ×${w.inventoryCount}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="fixed md:static inset-x-0 bottom-16 z-30 md:z-auto bg-white/95 md:bg-transparent backdrop-blur md:backdrop-blur-none border-t border-stone-200 md:border-0 px-4 py-3 md:p-0 md:mt-5">
        <Button size="lg" className="w-full" disabled={!canSave} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          {id ? 'Enregistrer et partager' : 'Créer et partager'}
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Routes (`App.tsx`) et palette (`components/cockpit/CommandPalette.tsx`)**

`App.tsx` : `const ShareDinner = lazy(() => import('./pages/ShareDinner').then(m => ({ default: m.ShareDinner })));` et, dans le bloc protégé (après `/sommelier-tools`) :

```tsx
        <Route path="/partages/diner" element={<Suspense fallback={<PageLoader />}><ShareDinner /></Suspense>} />
        <Route path="/partages/diner/:id" element={<Suspense fallback={<PageLoader />}><ShareDinner /></Suspense>} />
```

`CommandPalette.tsx` : ajouter `Share2` à l'import `lucide-react` et, dans `fastActions` après `act:taste` :

```tsx
      { id: 'act:dinner-card', label: 'Nouvelle carte de dîner', icon: Share2, group: 'actions', exec: () => navigate('/partages/diner'), hint: 'Lien à envoyer aux invités' },
```

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sans erreur, tests verts, build OK.

- [ ] **Step 5: Commit**

```bash
git add pages/ShareDinner.tsx pages/CockpitWineDetails.tsx components/cockpit/CommandPalette.tsx App.tsx
git commit -m "Partage public : bouton Partager sur la fiche et compositeur de carte de dîner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Liens partagés dans Réglages, documentation, bout en bout

**Files:**
- Create: `components/cockpit/SharedLinks.tsx`
- Modify: `pages/Settings.tsx` (section avant « Données »), `CLAUDE.md`

**Interfaces:**
- Consumes: `listShares`, `revokeShare` (Tâche 3), `shareOrCopy`, `absoluteUrl`, `frenchDate`, primitives Cockpit, `useToast`, `useConfirm`.

- [ ] **Step 1: `components/cockpit/SharedLinks.tsx`**

```tsx
// Réglages → liens partagés : copier, modifier (carte de dîner), révoquer.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ListPlus, Loader2, Pencil, Wine as WineIcon, Utensils } from 'lucide-react';
import { listShares, revokeShare } from '../../services/storageService';
import type { ShareSummary } from '../../types';
import { absoluteUrl, frenchDate } from '../../utils/shareView';
import { shareOrCopy } from '../../utils/shareLink';
import { Badge, Button } from './primitives';
import { useConfirm, useToast } from './feedback';

const titleOf = (s: ShareSummary) => (s.kind === 'DINNER' ? s.title || 'Carte de dîner' : [s.wineName, s.wineVintage].filter(Boolean).join(' '));

export const SharedLinks: React.FC = () => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [shares, setShares] = useState<ShareSummary[] | null>(null);

  const load = useCallback(() => {
    listShares().then(setShares).catch(() => setShares([]));
  }, []);
  useEffect(load, [load]);

  const copy = async (s: ShareSummary) => {
    const url = absoluteUrl(`/p/${s.token}`);
    const result = await shareOrCopy({ title: titleOf(s), url });
    if (result === 'copied') toast.success('Lien copié');
    else if (result === 'failed') toast.info(url);
  };

  const revoke = async (s: ShareSummary) => {
    const ok = await confirmAction({
      title: 'Révoquer ce lien ?',
      message: <>Les personnes qui ont <strong>{titleOf(s)}</strong> ne pourront plus l’ouvrir. C’est définitif : il faudra créer un nouveau lien.</>,
      confirmLabel: 'Révoquer',
    });
    if (!ok) return;
    try {
      await revokeShare(s.id);
      toast.success('Lien révoqué');
      load();
    } catch (e) {
      toast.error(`Révocation impossible : ${e instanceof Error ? e.message : ''}`);
    }
  };

  if (shares === null) return <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  return (
    <div className="space-y-3">
      <Link to="/partages/diner"><Button variant="outline"><ListPlus className="w-4 h-4" />Nouvelle carte de dîner</Button></Link>
      {shares.length === 0 ? (
        <p className="text-sm text-stone-500">Aucun lien partagé. Partage une fiche depuis la page d’un vin, ou compose une carte de dîner.</p>
      ) : (
        <ul className="divide-y divide-stone-100 border-y border-stone-100">
          {shares.map(s => (
            <li key={s.id} className={`py-2.5 flex items-center gap-3 ${s.revokedAt ? 'opacity-50' : ''}`}>
              {s.kind === 'DINNER' ? <Utensils className="w-4 h-4 text-stone-400 shrink-0" /> : <WineIcon className="w-4 h-4 text-stone-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-900 truncate">{titleOf(s)}</div>
                <div className="text-xs text-stone-500">
                  {s.kind === 'DINNER' ? `${s.itemCount} vin(s)${s.dinnerDate ? ` · ${frenchDate(s.dinnerDate)}` : ''} · ` : ''}
                  ouvert {s.viewCount} fois
                </div>
              </div>
              {s.revokedAt ? <Badge>RÉVOQUÉ</Badge> : (
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => copy(s)} aria-label="Copier le lien"><Copy className="w-3.5 h-3.5" /></Button>
                  {s.kind === 'DINNER' && <Link to={`/partages/diner/${s.id}`}><Button size="sm" variant="ghost" aria-label="Modifier"><Pencil className="w-3.5 h-3.5" /></Button></Link>}
                  <Button size="sm" variant="danger" onClick={() => revoke(s)}>Révoquer</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Section dans `pages/Settings.tsx`**

Importer `import { SharedLinks } from '../components/cockpit/SharedLinks';` et ajouter, juste avant `{/* ───── Données ───── */}` :

```tsx
        {/* ───── Partages ───── */}
        <Section label="Partages" title="Liens partagés" hint="Fiches et cartes de dîner ouvertes sans compte par ceux qui ont le lien. Un lien révoqué ne fonctionne plus.">
          <SharedLinks />
        </Section>
```

- [ ] **Step 3: Documenter dans `CLAUDE.md`**

Après la ligne `backend/src/enrichment/` de la section Layout :

```markdown
- `backend/src/shares/` + `routes/shares.js` / `routes/publicShares.js` — partage public d'une fiche vin ou d'une carte de dîner (`shares`, `share_items`, migration 013). Seule route de données sans compte : `GET /api/public/shares/:token` (montée avant `authenticate`, `publicLimiter`, `noindex`, 404 identique inconnu/révoqué), réponse construite par `toPublicShare` (liste blanche : jamais prix, emplacements, apogée, convives). Front : `/p/:token` (`pages/PublicShare.tsx`, hors `ProtectedRoute`, `fetch` simple), compositeur `/partages/diner`, Réglages → Liens partagés.
```

Et dans « Security model », ajouter une ligne : `- Public share links (\`/p/:token\`): 256-bit tokens, read-only whitelist view, revocable; the only unauthenticated data route.`

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sans erreur, tests verts, build OK.

- [ ] **Step 5: Essai de bout en bout (navigateur)**

Pile isolée `docker compose -p vinoflow-share --env-file <scratchpad>/share-e2e.env up -d --build db backend frontend` (port libre, ex. 5095 ; compte de test et deux vins dont une dégustation créés par l'API). Dans le navigateur intégré :
1. Connecté : fiche vin → **Partager** (le lien est copié — lire `navigator.clipboard` ou la liste des liens) ; **Carte de dîner** → composer 3 vins (réordonner, plats), enregistrer.
2. Ouvrir `/p/<jeton>` dans un **onglet après déconnexion** (ou en vidant `localStorage`) : la carte s'affiche, sans menu, sans redirection vers /login ; vérifier qu'aucun prix ni emplacement n'apparaît.
3. Reconnecté : ajouter une dégustation à un vin de la carte → la page publique la montre.
4. Réglages → Liens partagés : compteur d'ouvertures > 0 ; **Révoquer** → la page publique affiche « Ce lien n'est plus actif ».
5. Capture de la page publique pour la PR ; arrêter la pile (`docker compose -p vinoflow-share down -v`).

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/SharedLinks.tsx pages/Settings.tsx CLAUDE.md
git commit -m "Partage public : liens partagés dans Réglages et documentation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
