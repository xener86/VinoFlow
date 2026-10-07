# Ajout rapide (photo d'étiquette, rafale) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photo d'étiquette directement depuis « Ajouter », et rafale de photos (brouillon sur le téléphone) enregistrée d'un coup en cave, envies ou dégustations.

**Architecture:** Côté téléphone, une machine à états pure (`utils/quickAddQueue.ts`) pilote la lecture des photos via la route OCR existante ; le brouillon est gardé en IndexedDB (`utils/quickAddDraft.ts`, repli mémoire). Côté serveur, `POST /api/quick-add` valide (`backend/src/quickAdd/validate.js`) puis applique toute la rafale en une transaction (`apply.js`), idempotente par `batchId` (table `quick_add_batches`, migration 012).

**Tech Stack:** React 19 + Tailwind (Cockpit), Vitest (front `utils/`), Express 4 ESM, Postgres 16, Vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-07-ajout-rapide-design.md`

## Global Constraints

- Commits et textes d'interface en français ; pas de classes `dark:`.
- Photo : côté max 1600 px, JPEG, qualité 0,85 → 0,7 → 0,55 jusqu'à ≤ 700 000 caractères base64.
- Destinations : `CELLAR` (quantité 1–99, défaut 1 ; prix ≥ 0 facultatif), `WISHLIST` (prix estimé ≥ 0 facultatif), `TASTING` (1–5 étoiles obligatoire, commentaire facultatif).
- 1 à 50 lignes par rafale ; ligne invalide → 400 `{ error, lines: [{ clientId, message }] }`, rien d'écrit.
- Bouteilles : `location` « Non trié », `purchase_date` = maintenant ; journal `IN` « Rafale » ou « Rafale · <occasion> ».
- Envie : `source` = occasion ou « Rafale du JJ/MM » ; pas de fiche vin.
- Format par défaut d'une nouvelle fiche : `750ml`.
- File : réseau / 5xx → `PENDING`, `retryAt` = now + min(5 min, 30 s × 2^n) ; 429 → `retryAt` = now + Retry-After (défaut 60 s) ; 5 erreurs 5xx de suite ou 4xx → `FAILED`.
- Migration `012_quick_add_batches.sql` (009–011 pris par #14/#15), sans BEGIN/COMMIT.
- Enrichissement demandé (`requestEnrichment(id, 'manual')`) uniquement pour les nouvelles fiches qui ont reçu des bouteilles.

## Review Focus

- **Rafale reprise après fermeture de l'app pendant une lecture** : la ligne restée `READING` doit repartir en `PENDING` au chargement — test dans Tâche 3 (`normalizeLoaded`).
- **Même bouteille photographiée deux fois / vin ajouté par ailleurs pendant que la rafale était hors ligne** : une seule fiche — tests API Tâche 5.
- **Renvoi après réponse perdue (réseau de salon)** : même `batchId` → même compte-rendu, rien de recréé — test API Tâche 5.
- **Modification de l'utilisateur pendant la lecture** : la lecture tardive ne l'écrase pas — test Tâche 2.
- **Lecture incertaine** : jamais enregistrée sans « Valider » — test Tâche 2 (`lineProblem`).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `types.ts` (mod.) | `OcrResult` (déplacé depuis SommelierTools) |
| `utils/findExisting.ts` (+ test) | `parseFreeText`, `findExisting` (extraits de CockpitAddWine), `autoMatch` |
| `utils/labelImage.ts` (+ test) | `chooseEncoding`, `loadLabelImage`, `ocrToAddText` (extraits de SommelierTools) |
| `utils/quickAddQueue.ts` (+ test) | types de ligne, transitions, file, validité, récapitulatif, corps de requête |
| `utils/quickAddDraft.ts` (+ test) | `DraftStore` (IndexedDB + mémoire), `normalizeLoaded` |
| `db/migrations/012_quick_add_batches.sql` | idempotence |
| `backend/src/quickAdd/identity.js`, `validate.js`, `apply.js` | logique serveur |
| `backend/src/routes/quickAdd.js`, `backend/src/app.js` (mod.) | route `POST /api/quick-add` |
| `services/storageService.ts` (mod.) | `readLabel`, `saveQuickAdd` |
| `hooks/useQuickAddQueue.ts` | brouillon + file dans React |
| `pages/CockpitAddWine.tsx` (mod.) | bouton Photo, lien Rafale, bannière de reprise |
| `pages/CockpitQuickAdd.tsx`, `components/cockpit/QuickAddCard.tsx` | écran Rafale |
| `pages/SommelierTools.tsx` (mod.), `App.tsx` (mod.), `CLAUDE.md` (mod.) | réutilisation, route, doc |

---

### Task 1: Utilitaires partagés (étiquette, « Déjà en cave »)

**Files:**
- Create: `utils/findExisting.ts`, `utils/findExisting.test.ts`, `utils/labelImage.ts`, `utils/labelImage.test.ts`
- Modify: `types.ts` (ajout `OcrResult`), `pages/CockpitAddWine.tsx` (supprimer `parseFreeText`, `norm`, `findExisting` locaux → import), `pages/SommelierTools.tsx` (supprimer `interface OcrResult`, `loadImage`, `ocrToAddText` locaux → imports)

**Interfaces:**
- Produces: `OcrResult` (types.ts) ; `parseFreeText(text) → { name, vintage: number|null }` ; `findExisting(wines: CellarWine[], text) → CellarWine[]` ; `autoMatch(wines, { name?, producer?, vintage? }) → CellarWine | null` ; `chooseEncoding(encode: (q: number) => string, max = MAX_LABEL_BASE64) → string` ; `loadLabelImage(file: File) → Promise<LabelImage>` avec `LabelImage = { base64, mimeType, preview }` ; `ocrToAddText(r: OcrResult) → string` ; constantes `MAX_LABEL_BASE64 = 700_000`, `LABEL_QUALITIES = [0.85, 0.7, 0.55]`.

- [ ] **Step 1: Écrire les tests**

`utils/findExisting.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { parseFreeText, findExisting, autoMatch } from './findExisting';
import type { CellarWine } from '../types';

const w = (id: string, name: string, producer: string, vintage: number, inventoryCount = 1) =>
  ({ id, name, producer, vintage, inventoryCount, cuvee: '', appellation: '' }) as unknown as CellarWine;

describe('parseFreeText', () => {
  it('sépare le millésime final', () => {
    expect(parseFreeText('Pommard 1er Cru Rugiens 2018 ')).toEqual({ name: 'Pommard 1er Cru Rugiens', vintage: 2018 });
    expect(parseFreeText('Sancerre')).toEqual({ name: 'Sancerre', vintage: null });
  });
});

describe('findExisting', () => {
  const cave = [w('a', 'Sancerre Caillottes', 'Pinard', 2020, 0), w('b', 'Sancerre Caillottes', 'Pinard', 2020, 3), w('c', 'Chablis', 'Dauvissat', 2019)];
  it('mots sans accents, millésime respecté, vins en stock d’abord', () => {
    expect(findExisting(cave, 'sancerre caillottes 2020').map((x) => x.id)).toEqual(['b', 'a']);
    expect(findExisting(cave, 'Chablis 2018')).toEqual([]);
    expect(findExisting(cave, 'Châblis')).toHaveLength(1);
  });
});

describe('autoMatch', () => {
  const cave = [w('a', 'Grand Vin', 'Château Test', 2018), w('b', 'Grand Vin', 'Château Test', 2019), w('c', 'Petit Vin', 'Domaine Y', 2020), w('d', 'Petit Vin', 'Domaine Y', 2020)];
  it('un seul candidat au même millésime → présélection', () => {
    expect(autoMatch(cave, { name: 'Grand Vin', producer: 'Château Test', vintage: 2018 })?.id).toBe('a');
  });
  it('ambigu ou sans millésime → rien', () => {
    expect(autoMatch(cave, { name: 'Petit Vin', producer: 'Domaine Y', vintage: 2020 })).toBeNull();
    expect(autoMatch(cave, { name: 'Grand Vin', producer: 'Château Test', vintage: null })).toBeNull();
  });
});
```

`utils/labelImage.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { chooseEncoding, ocrToAddText, LABEL_QUALITIES } from './labelImage';
import type { OcrResult } from '../types';

describe('chooseEncoding', () => {
  it('garde la première qualité sous la limite', () => {
    const encode = vi.fn((q: number) => 'x'.repeat(q === 0.85 ? 900 : 600));
    expect(chooseEncoding(encode, 700)).toHaveLength(600);
    expect(encode.mock.calls.map((c) => c[0])).toEqual([0.85, 0.7]);
  });
  it('rien ne tient : la plus basse qualité', () => {
    const encode = vi.fn(() => 'x'.repeat(1000));
    chooseEncoding(encode, 700);
    expect(encode.mock.calls.map((c) => c[0])).toEqual(LABEL_QUALITIES);
  });
});

describe('ocrToAddText', () => {
  it('producteur, appellation, nom, cuvée, millésime sans doublon', () => {
    const r = { producer: 'Domaine Leflaive', appellation: 'Puligny-Montrachet', name: 'Puligny-Montrachet', cuvee: 'Clavoillon', vintage: 2019 } as OcrResult;
    expect(ocrToAddText(r)).toBe('Domaine Leflaive Puligny-Montrachet Clavoillon 2019');
  });
});
```

- [ ] **Step 2: Lancer, ils échouent**

Run: `npx vitest run utils/findExisting.test.ts utils/labelImage.test.ts`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Ajouter `OcrResult` à `types.ts`** (en fin de fichier)

```ts
// Lecture d'étiquette (POST /api/wines/extract-from-image, OCR_SCHEMA côté serveur).
export interface OcrResult {
  producer: string | null;
  name: string | null;
  cuvee: string | null;
  vintage: number | null;
  region: string | null;
  appellation: string | null;
  country: string | null;
  type: WineType | null;
  abv: number | null;
  format: string | null;
  grape_varieties: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  notes: string | null;
}
```

- [ ] **Step 4: Créer `utils/findExisting.ts`**

```ts
import type { CellarWine } from '../types';

// « Déjà en cave ? » — partagé par l'ajout au texte et la rafale.

/** "Wine name 2018" → name + vintage */
export const parseFreeText = (text: string): { name: string; vintage: number | null } => {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*?)\s+((?:19|20)\d{2})\s*$/);
  if (match) return { name: match[1].trim(), vintage: parseInt(match[2]) };
  return { name: trimmed, vintage: null };
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Vins de la cave qui ressemblent à la saisie (tous les mots trouvés). */
export const findExisting = (wines: CellarWine[], text: string): CellarWine[] => {
  const { name, vintage } = parseFreeText(text);
  const words = norm(name).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  if (words.length === 0) return [];
  return wines
    .filter(w => {
      const hay = norm([w.name, w.cuvee, w.producer, w.appellation].filter(Boolean).join(' '));
      return words.every(word => hay.includes(word)) && (!vintage || !w.vintage || w.vintage === vintage);
    })
    .sort((a, b) => (b.inventoryCount > 0 ? 1 : 0) - (a.inventoryCount > 0 ? 1 : 0))
    .slice(0, 4);
};

/** Vin à présélectionner après une lecture d'étiquette : un seul candidat, même millésime. */
export const autoMatch = (
  wines: CellarWine[],
  wine: { name?: string | null; producer?: string | null; vintage?: number | null },
): CellarWine | null => {
  if (!wine.name || !wine.vintage) return null;
  const text = `${[wine.producer, wine.name].filter(Boolean).join(' ')} ${wine.vintage}`;
  const candidates = findExisting(wines, text).filter(w => w.vintage === wine.vintage);
  return candidates.length === 1 ? candidates[0] : null;
};
```

- [ ] **Step 5: Créer `utils/labelImage.ts`**

```ts
import type { OcrResult } from '../types';

// Photo d'étiquette : réduite pour l'OCR (route JSON limitée à 1 Mo).
export const MAX_LABEL_BASE64 = 700_000;
export const LABEL_QUALITIES = [0.85, 0.7, 0.55];
const MAX_SIDE = 1600;

/** Première qualité JPEG dont l'encodage tient sous la limite (sinon la plus basse). */
export const chooseEncoding = (encode: (quality: number) => string, max = MAX_LABEL_BASE64): string => {
  let out = '';
  for (const quality of LABEL_QUALITIES) {
    out = encode(quality);
    if (out.length <= max) return out;
  }
  return out;
};

export interface LabelImage { base64: string; mimeType: string; preview: string }

/** Réduit la photo (≤ 1600 px, JPEG, ≤ ~700 Ko en base64). */
export const loadLabelImage = (file: File): Promise<LabelImage> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const raw = () => resolve({ base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg', preview: dataUrl });
      const img = new Image();
      img.onerror = raw;
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return raw();
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = chooseEncoding(quality => canvas.toDataURL('image/jpeg', quality));
        resolve({ base64: out.split(',')[1], mimeType: 'image/jpeg', preview: out });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

/** Texte libre attendu par la page d'ajout (« Pommard 1er Cru Rugiens 2018 »). */
export const ocrToAddText = (r: OcrResult) => {
  const parts = [r.producer, r.appellation && r.appellation !== r.name ? r.appellation : null, r.name, r.cuvee && r.cuvee !== r.name ? r.cuvee : null, r.vintage];
  const seen = new Set<string>();
  return parts.filter(p => {
    if (p == null || p === '') return false;
    const k = String(p).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(' ');
};
```

- [ ] **Step 6: Brancher les pages existantes**

`pages/CockpitAddWine.tsx` : supprimer les définitions locales `parseFreeText`, `norm`, `findExisting` (lignes 33-55) et ajouter `import { parseFreeText, findExisting } from '../utils/findExisting';`.

`pages/SommelierTools.tsx` : supprimer `interface OcrResult {…}`, `loadImage` et `ocrToAddText` locaux ; ajouter `OcrResult` à l'import depuis `../types` et `import { loadLabelImage, ocrToAddText } from '../utils/labelImage';` ; dans `OcrTool.handleFile`, remplacer `loadImage(file)` par `loadLabelImage(file)`.

- [ ] **Step 7: Vérifier**

Run: `npx vitest run utils/findExisting.test.ts utils/labelImage.test.ts && npm run typecheck`
Expected: PASS (6 tests), typecheck sans erreur.

- [ ] **Step 8: Commit**

```bash
git add types.ts utils/findExisting.ts utils/findExisting.test.ts utils/labelImage.ts utils/labelImage.test.ts pages/CockpitAddWine.tsx pages/SommelierTools.tsx
git commit -m "Ajout rapide : utilitaires partagés (photo d'étiquette, « Déjà en cave »)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: File de lecture et lignes de rafale (`utils/quickAddQueue.ts`)

**Files:**
- Create: `utils/quickAddQueue.ts`, `utils/quickAddQueue.test.ts`

**Interfaces:**
- Consumes: `OcrResult`, `WineType` (types.ts).
- Produces (exportés) : types `LineStatus`, `Destination`, `WineDraft`, `DraftLine`, `DraftMeta`, `ReadOutcome` ; fonctions `newLine(id, photo, now)`, `fromOcr(ocr)`, `wineOf(line)`, `markReading(line)`, `nextState(line, outcome, now)`, `pickNext(lines, now)`, `nextWakeUp(lines, now)`, `withNewPhoto(line, photo)`, `toManual(line)`, `confirmLine(line)`, `lineProblem(line) → string | null`, `summarize(lines)`, `buildPayload(meta, lines)`.

```
DraftLine = { id, createdAt, photo: string|null (base64 JPEG), status, attempts, serverErrors, retryAt: number|null,
  error: string|null, ocr: OcrResult|null, edits: Partial<WineDraft>, destination, quantity, price: number|null,
  estimatedPrice: number|null, rating: number|null, comment: string, matchWineId: string|null, forceNew: boolean }
ReadOutcome = { kind:'ok', ocr } | { kind:'network' } | { kind:'http', status, retryAfter?: number|null, message?: string }
```

- [ ] **Step 1: Écrire le test**

```ts
import { describe, it, expect } from 'vitest';
import {
  newLine, wineOf, markReading, nextState, pickNext, nextWakeUp, withNewPhoto, toManual, confirmLine,
  lineProblem, summarize, buildPayload, type DraftLine,
} from './quickAddQueue';
import type { OcrResult } from '../types';

const ocr = (o: Partial<OcrResult> = {}): OcrResult => ({
  producer: 'Château Test', name: 'Grand Vin', cuvee: null, vintage: 2018, region: 'Bordeaux', appellation: 'Pauillac',
  country: 'France', type: 'RED', abv: 13, format: '75cl', grape_varieties: ['Merlot'], confidence: 'HIGH', notes: null, ...o,
} as OcrResult);
const T = 1_000_000;
const line = (o: Partial<DraftLine> = {}): DraftLine => ({ ...newLine('l1', 'b64', T), ...o });

describe('nextState', () => {
  it('lecture sûre → prêt ; incertaine ou vide → à vérifier', () => {
    expect(nextState(markReading(line()), { kind: 'ok', ocr: ocr() }, T).status).toBe('READY');
    expect(nextState(line(), { kind: 'ok', ocr: ocr({ confidence: 'LOW' }) }, T).status).toBe('REVIEW');
    expect(nextState(line(), { kind: 'ok', ocr: ocr({ name: null, producer: null }) }, T).status).toBe('REVIEW');
  });

  it('pas de réseau : en attente, délai doublé et plafonné à 5 min', () => {
    const a = nextState(line(), { kind: 'network' }, T);
    expect(a).toMatchObject({ status: 'PENDING', attempts: 1, retryAt: T + 30_000 });
    expect(nextState(line({ attempts: 3 }), { kind: 'network' }, T).retryAt).toBe(T + 240_000);
    expect(nextState(line({ attempts: 9 }), { kind: 'network' }, T).retryAt).toBe(T + 300_000);
  });

  it('429 : attente du délai indiqué (60 s par défaut), sans compter d’échec', () => {
    expect(nextState(line(), { kind: 'http', status: 429, retryAfter: 120 }, T)).toMatchObject({ status: 'PENDING', retryAt: T + 120_000, serverErrors: 0 });
    expect(nextState(line(), { kind: 'http', status: 429 }, T).retryAt).toBe(T + 60_000);
  });

  it('5xx : réessai, puis échec à la 5e erreur de suite', () => {
    expect(nextState(line({ serverErrors: 3 }), { kind: 'http', status: 500 }, T)).toMatchObject({ status: 'PENDING', serverErrors: 4 });
    expect(nextState(line({ serverErrors: 4 }), { kind: 'http', status: 502 }, T)).toMatchObject({ status: 'FAILED', retryAt: null });
  });

  it('4xx : échec immédiat avec message', () => {
    expect(nextState(line(), { kind: 'http', status: 413, message: 'Trop gros' }, T)).toMatchObject({ status: 'FAILED', error: 'Trop gros' });
  });

  it('une lecture tardive n’écrase pas les saisies', () => {
    const edited = { ...markReading(line()), edits: { name: 'Mon nom', vintage: 2017 } };
    const done = nextState(edited, { kind: 'ok', ocr: ocr() }, T);
    expect(wineOf(done)).toMatchObject({ name: 'Mon nom', vintage: 2017, producer: 'Château Test', appellation: 'Pauillac' });
  });
});

describe('file', () => {
  it('la plus ancienne ligne en attente dont l’échéance est passée', () => {
    const lines = [line({ id: 'b', createdAt: T + 2 }), line({ id: 'a', createdAt: T + 1, retryAt: T + 10 }), line({ id: 'c', createdAt: T + 3, status: 'READY' })];
    expect(pickNext(lines, T)?.id).toBe('b');
    expect(pickNext(lines, T + 10)?.id).toBe('a');
    expect(nextWakeUp(lines, T)).toBe(T + 10);
    expect(pickNext([line({ photo: null })], T)).toBeNull();
  });

  it('nouvelle photo, saisie manuelle, validation', () => {
    expect(withNewPhoto(line({ status: 'FAILED', serverErrors: 5, ocr: ocr() }), 'new')).toMatchObject({ photo: 'new', status: 'PENDING', serverErrors: 0, attempts: 0, ocr: null, retryAt: null });
    expect(toManual(line({ status: 'FAILED' }))).toMatchObject({ photo: null, status: 'REVIEW' });
    expect(confirmLine(line({ status: 'REVIEW' })).status).toBe('READY');
    expect(newLine('x', null, T).status).toBe('REVIEW');
  });
});

describe('lineProblem et summarize', () => {
  const ready = (o: Partial<DraftLine> = {}) => line({ status: 'READY', ocr: ocr(), ...o });
  it('bloque tant que la ligne n’est pas prête et complète', () => {
    expect(lineProblem(line())).toMatch(/attente/);
    expect(lineProblem(line({ status: 'REVIEW', ocr: ocr() }))).toMatch(/vérifier/);
    expect(lineProblem(line({ status: 'FAILED' }))).toMatch(/impossible/);
    expect(lineProblem(ready({ edits: { name: ' ' } }))).toMatch(/Nom/);
    expect(lineProblem(ready({ quantity: 0 }))).toMatch(/Quantité/);
    expect(lineProblem(ready({ destination: 'TASTING' }))).toMatch(/Note/);
    expect(lineProblem(ready({ destination: 'TASTING', rating: 4 }))).toBeNull();
  });
  it('récapitulatif de la barre du bas', () => {
    expect(summarize([ready({ quantity: 6 }), ready({ quantity: 2 }), ready({ destination: 'WISHLIST' }), ready({ destination: 'TASTING', rating: 3 }), line()]))
      .toEqual({ lines: 5, cellar: 3, bottles: 9, wishlist: 1, tastings: 1, blocking: 1 });
  });
});

describe('buildPayload', () => {
  it('vin = lecture + saisies ; champs selon la destination', () => {
    const lines = [
      line({ id: 'a', status: 'READY', ocr: ocr(), edits: { cuvee: 'Réserve' }, quantity: 3, price: 12.5, matchWineId: 'w1' }),
      line({ id: 'b', status: 'READY', ocr: ocr(), destination: 'WISHLIST', estimatedPrice: 40, matchWineId: 'w1' }),
      line({ id: 'c', status: 'READY', ocr: ocr(), destination: 'TASTING', rating: 4, comment: '  Superbe ', forceNew: true, matchWineId: 'w1' }),
    ];
    const body = buildPayload({ batchId: 'B', occasion: ' Salon ' }, lines);
    expect(body).toEqual({
      batchId: 'B', occasion: 'Salon',
      lines: [
        { clientId: 'a', destination: 'CELLAR', wine: expect.objectContaining({ name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', cuvee: 'Réserve', appellation: 'Pauillac', grapeVarieties: ['Merlot'], format: '75cl' }), matchWineId: 'w1', quantity: 3, price: 12.5 },
        { clientId: 'b', destination: 'WISHLIST', wine: expect.any(Object), estimatedPrice: 40 },
        { clientId: 'c', destination: 'TASTING', wine: expect.any(Object), forceNew: true, rating: 4, comment: 'Superbe' },
      ],
    });
    expect(JSON.parse(JSON.stringify(body)).lines[1]).not.toHaveProperty('matchWineId');
  });
});
```

- [ ] **Step 2: Lancer, il échoue**

Run: `npx vitest run utils/quickAddQueue.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter `utils/quickAddQueue.ts`**

```ts
import type { OcrResult, WineType } from '../types';

// Rafale d'ajout : une ligne par photo, lue par l'OCR serveur dès que possible.
// Fonctions pures : le hook useQuickAddQueue s'occupe du stockage et du réseau.

export type LineStatus = 'PENDING' | 'READING' | 'READY' | 'REVIEW' | 'FAILED';
export type Destination = 'CELLAR' | 'WISHLIST' | 'TASTING';

export interface WineDraft {
  name: string; producer: string; vintage: number | null; type: WineType | null; cuvee: string;
  appellation: string; region: string; country: string; grapeVarieties: string[]; format: string;
}

export interface DraftLine {
  id: string; createdAt: number; photo: string | null;
  status: LineStatus; attempts: number; serverErrors: number; retryAt: number | null; error: string | null;
  ocr: OcrResult | null; edits: Partial<WineDraft>;
  destination: Destination; quantity: number; price: number | null; estimatedPrice: number | null;
  rating: number | null; comment: string;
  matchWineId: string | null; forceNew: boolean;
}

export interface DraftMeta { batchId: string; occasion: string }

export type ReadOutcome =
  | { kind: 'ok'; ocr: OcrResult }
  | { kind: 'network' }
  | { kind: 'http'; status: number; retryAfter?: number | null; message?: string };

const BASE_DELAY = 30_000;
const MAX_DELAY = 5 * 60_000;
const MAX_SERVER_ERRORS = 5;
const backoff = (attempts: number) => Math.min(MAX_DELAY, BASE_DELAY * 2 ** attempts);

export const newLine = (id: string, photo: string | null, now: number): DraftLine => ({
  id, createdAt: now, photo, status: photo ? 'PENDING' : 'REVIEW', attempts: 0, serverErrors: 0, retryAt: null, error: null,
  ocr: null, edits: {}, destination: 'CELLAR', quantity: 1, price: null, estimatedPrice: null, rating: null, comment: '',
  matchWineId: null, forceNew: false,
});

export const fromOcr = (ocr: OcrResult | null): WineDraft => ({
  name: ocr?.name || '', producer: ocr?.producer || '', vintage: ocr?.vintage ?? null, type: ocr?.type ?? null,
  cuvee: ocr?.cuvee || '', appellation: ocr?.appellation || '', region: ocr?.region || '', country: ocr?.country || '',
  grapeVarieties: ocr?.grape_varieties || [], format: ocr?.format || '',
});

/** Vin de la ligne : la lecture, corrigée par les saisies de l'utilisateur. */
export const wineOf = (line: DraftLine): WineDraft => ({ ...fromOcr(line.ocr), ...line.edits });

export const markReading = (line: DraftLine): DraftLine => ({ ...line, status: 'READING' });

export const nextState = (line: DraftLine, outcome: ReadOutcome, now: number): DraftLine => {
  if (outcome.kind === 'ok') {
    const o = outcome.ocr;
    const sure = o.confidence !== 'LOW' && Boolean(o.name || o.producer);
    return { ...line, ocr: o, status: sure ? 'READY' : 'REVIEW', retryAt: null, error: null, serverErrors: 0 };
  }
  if (outcome.kind === 'network') {
    return { ...line, status: 'PENDING', attempts: line.attempts + 1, retryAt: now + backoff(line.attempts), error: null };
  }
  if (outcome.status === 429) {
    return { ...line, status: 'PENDING', retryAt: now + (outcome.retryAfter ?? 60) * 1000, error: null };
  }
  if (outcome.status >= 500) {
    const serverErrors = line.serverErrors + 1;
    if (serverErrors >= MAX_SERVER_ERRORS) {
      return { ...line, status: 'FAILED', serverErrors, retryAt: null, error: 'Lecture impossible pour le moment' };
    }
    return { ...line, status: 'PENDING', serverErrors, attempts: line.attempts + 1, retryAt: now + backoff(line.attempts), error: null };
  }
  return { ...line, status: 'FAILED', retryAt: null, error: outcome.message || `Erreur ${outcome.status}` };
};

const waiting = (l: DraftLine) => l.status === 'PENDING' && !!l.photo;

/** Prochaine photo à lire : la plus ancienne en attente dont l'échéance est passée. */
export const pickNext = (lines: DraftLine[], now: number): DraftLine | null =>
  lines.filter(l => waiting(l) && (l.retryAt == null || l.retryAt <= now)).sort((a, b) => a.createdAt - b.createdAt)[0] || null;

/** Prochaine échéance de réessai (pour programmer un réveil), ou null. */
export const nextWakeUp = (lines: DraftLine[], now: number): number | null => {
  const times = lines.filter(l => waiting(l) && l.retryAt != null && l.retryAt > now).map(l => l.retryAt as number);
  return times.length ? Math.min(...times) : null;
};

export const withNewPhoto = (line: DraftLine, photo: string): DraftLine =>
  ({ ...line, photo, status: 'PENDING', attempts: 0, serverErrors: 0, retryAt: null, error: null, ocr: null });

/** « Saisir le texte » : on abandonne la photo, la ligne est remplie à la main. */
export const toManual = (line: DraftLine): DraftLine => ({ ...line, photo: null, status: 'REVIEW', retryAt: null, error: null });

export const confirmLine = (line: DraftLine): DraftLine => (line.status === 'REVIEW' ? { ...line, status: 'READY' } : line);

/** Ce qui empêche d'enregistrer la ligne, ou null. */
export const lineProblem = (line: DraftLine): string | null => {
  if (line.status === 'PENDING' || line.status === 'READING') return 'Lecture en attente';
  if (line.status === 'FAILED') return 'Lecture impossible';
  if (line.status === 'REVIEW') return 'À vérifier';
  if (!wineOf(line).name.trim()) return 'Nom manquant';
  if (line.destination === 'CELLAR' && !(Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99)) return 'Quantité invalide';
  if (line.destination === 'TASTING' && !(line.rating != null && line.rating >= 1 && line.rating <= 5)) return 'Note manquante';
  return null;
};

export const summarize = (lines: DraftLine[]) => {
  const s = { lines: lines.length, cellar: 0, bottles: 0, wishlist: 0, tastings: 0, blocking: 0 };
  for (const l of lines) {
    if (lineProblem(l)) s.blocking += 1;
    if (l.destination === 'CELLAR') { s.cellar += 1; s.bottles += l.quantity; }
    else if (l.destination === 'WISHLIST') s.wishlist += 1;
    else s.tastings += 1;
  }
  return s;
};

const opt = (s: string) => s.trim() || undefined;

/** Corps de POST /api/quick-add (les champs undefined disparaissent au JSON). */
export const buildPayload = (meta: DraftMeta, lines: DraftLine[]) => ({
  batchId: meta.batchId,
  occasion: opt(meta.occasion),
  lines: lines.map(l => {
    const w = wineOf(l);
    const wine = {
      name: w.name.trim(), producer: opt(w.producer), vintage: w.vintage ?? undefined, type: w.type ?? undefined,
      cuvee: opt(w.cuvee), appellation: opt(w.appellation), region: opt(w.region), country: opt(w.country),
      grapeVarieties: w.grapeVarieties.length ? w.grapeVarieties : undefined, format: opt(w.format),
    };
    const base = {
      clientId: l.id, destination: l.destination, wine,
      matchWineId: l.forceNew ? undefined : (l.matchWineId ?? undefined),
      forceNew: l.forceNew || undefined,
    };
    if (l.destination === 'CELLAR') return { ...base, quantity: l.quantity, price: l.price ?? undefined };
    if (l.destination === 'WISHLIST') return { ...base, matchWineId: undefined, estimatedPrice: l.estimatedPrice ?? undefined };
    return { ...base, rating: l.rating ?? undefined, comment: opt(l.comment) };
  }),
});
```

- [ ] **Step 4: Lancer, il passe**

Run: `npx vitest run utils/quickAddQueue.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/quickAddQueue.ts utils/quickAddQueue.test.ts
git commit -m "Ajout rapide : file de lecture des photos et lignes de rafale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Brouillon sur le téléphone (`utils/quickAddDraft.ts`)

**Files:**
- Create: `utils/quickAddDraft.ts`, `utils/quickAddDraft.test.ts`

**Interfaces:**
- Consumes: `DraftLine`, `DraftMeta` (Tâche 2).
- Produces: `interface DraftStore { kind: 'idb' | 'memory'; list(): Promise<DraftLine[]>; put(line): Promise<void>; delete(id): Promise<void>; clear(): Promise<void>; getMeta(): Promise<DraftMeta | null>; putMeta(meta): Promise<void> }` ; `createMemoryStore()` ; `openDraftStore(): Promise<DraftStore>` (IndexedDB, repli mémoire) ; `normalizeLoaded(lines) → DraftLine[]` (READING → PENDING, tri par `createdAt`).

- [ ] **Step 1: Écrire le test**

```ts
import { describe, it, expect } from 'vitest';
import { createMemoryStore, normalizeLoaded, openDraftStore } from './quickAddDraft';
import { newLine } from './quickAddQueue';

describe('createMemoryStore', () => {
  it('ajoute, liste dans l’ordre, met à jour, supprime, vide', async () => {
    const s = createMemoryStore();
    await s.put(newLine('b', 'p', 2));
    await s.put(newLine('a', 'p', 1));
    await s.put({ ...newLine('b', 'p', 2), quantity: 6 });
    expect((await s.list()).map((l) => [l.id, l.quantity])).toEqual([['a', 1], ['b', 6]]);
    await s.delete('a');
    expect((await s.list()).map((l) => l.id)).toEqual(['b']);
    await s.putMeta({ batchId: 'B', occasion: 'Salon' });
    expect(await s.getMeta()).toEqual({ batchId: 'B', occasion: 'Salon' });
    await s.clear();
    expect(await s.list()).toEqual([]);
    expect(await s.getMeta()).toBeNull();
  });

  it('copie les objets (comme IndexedDB)', async () => {
    const s = createMemoryStore();
    const l = newLine('a', 'p', 1);
    await s.put(l);
    l.quantity = 9;
    expect((await s.list())[0].quantity).toBe(1);
  });
});

describe('normalizeLoaded', () => {
  it('une lecture interrompue (app fermée) repart en attente', () => {
    const out = normalizeLoaded([{ ...newLine('b', 'p', 2), status: 'READING' }, newLine('a', 'p', 1)]);
    expect(out.map((l) => [l.id, l.status])).toEqual([['a', 'PENDING'], ['b', 'PENDING']]);
  });
});

describe('openDraftStore', () => {
  it('sans IndexedDB (navigation privée, Node) : stockage en mémoire', async () => {
    expect((await openDraftStore()).kind).toBe('memory');
  });
});
```

- [ ] **Step 2: Lancer, il échoue**

Run: `npx vitest run utils/quickAddDraft.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter `utils/quickAddDraft.ts`**

```ts
import type { DraftLine, DraftMeta } from './quickAddQueue';

// Brouillon de rafale gardé sur le téléphone (IndexedDB) : on peut fermer
// l'app et reprendre. Sans IndexedDB (navigation privée), repli en mémoire.

export interface DraftStore {
  kind: 'idb' | 'memory';
  list(): Promise<DraftLine[]>;
  put(line: DraftLine): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  getMeta(): Promise<DraftMeta | null>;
  putMeta(meta: DraftMeta): Promise<void>;
}

const byCreation = (a: DraftLine, b: DraftLine) => a.createdAt - b.createdAt;

/** Lignes relues : une lecture interrompue par la fermeture de l'app repart en attente. */
export const normalizeLoaded = (lines: DraftLine[]): DraftLine[] =>
  lines.map(l => (l.status === 'READING' ? { ...l, status: 'PENDING' as const } : l)).sort(byCreation);

export const createMemoryStore = (): DraftStore => {
  const lines = new Map<string, DraftLine>();
  let meta: DraftMeta | null = null;
  return {
    kind: 'memory',
    list: async () => [...lines.values()].map(l => structuredClone(l)).sort(byCreation),
    put: async (line) => { lines.set(line.id, structuredClone(line)); },
    delete: async (id) => { lines.delete(id); },
    clear: async () => { lines.clear(); meta = null; },
    getMeta: async () => (meta ? { ...meta } : null),
    putMeta: async (m) => { meta = { ...m }; },
  };
};

const DB_NAME = 'vinoflow-quick-add';
const LINES = 'lines';
const META = 'meta';

const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(LINES, { keyPath: 'id' });
    req.result.createObjectStore(META);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbStore = (db: IDBDatabase): DraftStore => {
  const store = (name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  return {
    kind: 'idb',
    list: async () => ((await request(store(LINES, 'readonly').getAll())) as DraftLine[]).sort(byCreation),
    put: async (line) => { await request(store(LINES, 'readwrite').put(line)); },
    delete: async (id) => { await request(store(LINES, 'readwrite').delete(id)); },
    clear: async () => {
      await request(store(LINES, 'readwrite').clear());
      await request(store(META, 'readwrite').clear());
    },
    getMeta: async () => ((await request(store(META, 'readonly').get('meta'))) as DraftMeta | undefined) ?? null,
    putMeta: async (meta) => { await request(store(META, 'readwrite').put(meta, 'meta')); },
  };
};

export const openDraftStore = async (): Promise<DraftStore> => {
  try {
    if (typeof indexedDB === 'undefined') return createMemoryStore();
    return idbStore(await openDb());
  } catch {
    return createMemoryStore();
  }
};
```

- [ ] **Step 4: Lancer, il passe**

Run: `npx vitest run utils/quickAddDraft.test.ts && npm run typecheck`
Expected: PASS (4 tests), typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add utils/quickAddDraft.ts utils/quickAddDraft.test.ts
git commit -m "Ajout rapide : brouillon de rafale gardé sur le téléphone (IndexedDB, repli mémoire)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Validation serveur, identité, migration 012

**Files:**
- Create: `db/migrations/012_quick_add_batches.sql`, `backend/src/quickAdd/identity.js`, `backend/src/quickAdd/validate.js`
- Test: `backend/tests/unit/quickAdd.test.js`

**Interfaces:**
- Produces: `identityKey({ name, producer, vintage }) → string` ; `class BatchError extends Error { lines: { clientId, message }[] }` ; `MAX_LINES = 50` ; `validateBatch(body) → Batch` (lève `BatchError`) avec

```
Batch = { batchId (minuscule), occasion: string|null, lines: Line[] }
Line  = { clientId, destination, wine: { name, producer, vintage, type, cuvee, appellation, region, country, grapeVarieties: string[], format },
          matchWineId: string|null, forceNew: boolean,
          // CELLAR: quantity, price | WISHLIST: estimatedPrice | TASTING: rating, comment }
```

- [ ] **Step 1: Écrire le test**

```js
import { describe, it, expect } from 'vitest';
import { validateBatch, BatchError, MAX_LINES } from '../../src/quickAdd/validate.js';
import { identityKey } from '../../src/quickAdd/identity.js';

const BATCH = '5a0c1b52-6d4e-4f7a-9b1c-2d3e4f5a6b7c';
const W1 = '11111111-1111-4111-8111-111111111111';
const wine = { name: ' Grand Vin ', producer: 'Château Test', vintage: 2018, type: 'RED' };
const body = (lines, extra = {}) => ({ batchId: BATCH, lines, ...extra });
const errorsOf = (b) => { try { validateBatch(b); return null; } catch (e) { expect(e).toBeInstanceOf(BatchError); return e; } };

describe('identityKey', () => {
  it('ignore casse, accents et espaces', () => {
    expect(identityKey({ name: 'Grand  Vin', producer: 'CHÂTEAU test', vintage: 2018 }))
      .toBe(identityKey({ name: 'grand vin ', producer: 'Chateau Test', vintage: 2018 }));
    expect(identityKey({ name: 'Grand Vin', producer: null, vintage: null })).toBe('grand vin||');
  });
});

describe('validateBatch', () => {
  it('rafale mixte normalisée, défauts appliqués', () => {
    const b = validateBatch(body([
      { clientId: 'a', destination: 'CELLAR', wine, matchWineId: W1 },
      { clientId: 'b', destination: 'WISHLIST', wine, estimatedPrice: 40 },
      { clientId: 'c', destination: 'TASTING', wine, rating: 4, comment: ' Top ', matchWineId: W1, forceNew: true },
    ], { occasion: ' Salon ' }));
    expect(b.occasion).toBe('Salon');
    expect(b.lines[0]).toMatchObject({ quantity: 1, price: null, matchWineId: W1, forceNew: false, wine: { name: 'Grand Vin', format: '750ml', grapeVarieties: [], cuvee: null } });
    expect(b.lines[1]).toMatchObject({ estimatedPrice: 40 });
    expect(b.lines[2]).toMatchObject({ rating: 4, comment: 'Top', matchWineId: null, forceNew: true });
  });

  it('batchId et nombre de lignes contrôlés', () => {
    expect(errorsOf({ batchId: 'x', lines: [] }).message).toMatch(/batchId/);
    expect(errorsOf(body([])).message).toMatch(/lignes/);
    expect(errorsOf(body(Array.from({ length: MAX_LINES + 1 }, (_, i) => ({ clientId: `${i}`, destination: 'WISHLIST', wine }))))).toBeTruthy();
  });

  it('erreurs collectées ligne par ligne', () => {
    const e = errorsOf(body([
      { clientId: 'a', destination: 'CELLAR', wine: { name: ' ' } },
      { clientId: 'b', destination: 'CELLAR', wine, quantity: 100 },
      { clientId: 'c', destination: 'CELLAR', wine, price: -1 },
      { clientId: 'd', destination: 'TASTING', wine },
      { clientId: 'e', destination: 'OTHER', wine },
      { clientId: 'f', destination: 'CELLAR', wine: { ...wine, type: 'ORANGE' } },
      { clientId: 'g', destination: 'CELLAR', wine: { ...wine, vintage: 1700 } },
      { clientId: 'h', destination: 'CELLAR', wine, matchWineId: 'pas-un-uuid' },
      { clientId: 'i', destination: 'CELLAR', wine },
    ]));
    expect(e.lines.map((l) => l.clientId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(e.lines[0].message).toMatch(/Nom/);
    expect(e.lines[3].message).toMatch(/étoiles/);
  });
});
```

- [ ] **Step 2: Lancer, il échoue**

Run: `cd backend && npx vitest run tests/unit/quickAdd.test.js`
Expected: FAIL — modules introuvables.

- [ ] **Step 3: Migration `db/migrations/012_quick_add_batches.sql`**

```sql
-- Ajout rapide : rafales déjà enregistrées. Un renvoi du même batchId (réponse
-- perdue sur un réseau de salon) renvoie le compte-rendu sans rien recréer.
CREATE TABLE IF NOT EXISTS quick_add_batches (
    id uuid PRIMARY KEY,
    user_id character varying(255),
    result jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
```

- [ ] **Step 4: `backend/src/quickAdd/identity.js`**

```js
// Identité d'un vin pour le rapprochement de la rafale : nom + producteur +
// millésime, sans casse, accents ni espaces superflus.
const clean = (value) => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

export const identityKey = ({ name, producer, vintage }) => [clean(name), clean(producer), vintage ?? ''].join('|');
```

- [ ] **Step 5: `backend/src/quickAdd/validate.js`**

```js
// Validation complète d'une rafale avant toute écriture : une ligne invalide
// fait refuser l'ensemble (400) avec un message par ligne.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESTINATIONS = ['CELLAR', 'WISHLIST', 'TASTING'];
const TYPES = ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED'];
export const MAX_LINES = 50;

export class BatchError extends Error {
  constructor(message, lines = []) {
    super(message);
    this.lines = lines;
  }
}

const text = (value, max = 255) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const num = (value) => (value === undefined || value === null || value === '' ? null : Number(value));
const isPrice = (n) => n === null || (Number.isFinite(n) && n >= 0);

const toLine = (raw, index, currentYear) => {
  const clientId = String(raw?.clientId ?? index);
  const fail = (message) => ({ error: { clientId, message } });
  const w = raw?.wine || {};
  const destination = raw?.destination;
  if (!DESTINATIONS.includes(destination)) return fail('Destination inconnue');
  const name = text(w.name);
  if (!name) return fail('Nom manquant');
  const vintage = num(w.vintage);
  if (vintage !== null && !(Number.isInteger(vintage) && vintage >= 1800 && vintage <= currentYear + 1)) return fail('Millésime invalide');
  const type = w.type ?? null;
  if (type !== null && !TYPES.includes(type)) return fail('Couleur inconnue');
  const matchWineId = raw.matchWineId ?? null;
  if (matchWineId !== null && !UUID.test(String(matchWineId))) return fail('Vin de la cave invalide');

  const line = {
    clientId, destination,
    wine: {
      name, producer: text(w.producer), vintage, type, cuvee: text(w.cuvee), appellation: text(w.appellation),
      region: text(w.region), country: text(w.country),
      grapeVarieties: Array.isArray(w.grapeVarieties) ? w.grapeVarieties.map((g) => text(g)).filter(Boolean).slice(0, 20) : [],
      format: text(w.format, 20) || '750ml',
    },
    forceNew: Boolean(raw.forceNew),
    matchWineId: raw.forceNew ? null : matchWineId,
  };
  if (destination === 'CELLAR') {
    const quantity = num(raw.quantity) ?? 1;
    if (!(Number.isInteger(quantity) && quantity >= 1 && quantity <= 99)) return fail('Quantité entre 1 et 99');
    const price = num(raw.price);
    if (!isPrice(price)) return fail('Prix invalide');
    return { line: { ...line, quantity, price } };
  }
  if (destination === 'WISHLIST') {
    const estimatedPrice = num(raw.estimatedPrice);
    if (!isPrice(estimatedPrice)) return fail('Prix estimé invalide');
    return { line: { ...line, estimatedPrice } };
  }
  const rating = num(raw.rating);
  if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return fail('Note entre 1 et 5 étoiles');
  return { line: { ...line, rating, comment: text(raw.comment, 2000) } };
};

export const validateBatch = (body, { currentYear = new Date().getFullYear() } = {}) => {
  const b = body || {};
  if (!UUID.test(String(b.batchId || ''))) throw new BatchError('batchId invalide');
  if (!Array.isArray(b.lines) || b.lines.length === 0 || b.lines.length > MAX_LINES) {
    throw new BatchError(`Une rafale contient entre 1 et ${MAX_LINES} lignes`);
  }
  const lines = [];
  const errors = [];
  b.lines.forEach((raw, i) => {
    const { line, error } = toLine(raw, i, currentYear);
    if (error) errors.push(error);
    else lines.push(line);
  });
  if (errors.length) throw new BatchError('Rafale invalide', errors);
  return { batchId: String(b.batchId).toLowerCase(), occasion: text(b.occasion, 120), lines };
};
```

- [ ] **Step 6: Lancer, il passe**

Run: `cd backend && npx vitest run tests/unit/quickAdd.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add db/migrations/012_quick_add_batches.sql backend/src/quickAdd/identity.js backend/src/quickAdd/validate.js backend/tests/unit/quickAdd.test.js
git commit -m "Ajout rapide : validation de la rafale, identité des vins, migration 012

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Enregistrement de la rafale — `POST /api/quick-add`

**Files:**
- Create: `backend/src/quickAdd/apply.js`, `backend/src/routes/quickAdd.js`
- Modify: `backend/src/app.js` (import + `app.use('/api', quickAddRouter);` après `importRouter`)
- Test: `backend/tests/api/quickAdd.test.js`

**Interfaces:**
- Consumes: `validateBatch`, `BatchError`, `identityKey` (Tâche 4) ; `withTransaction` (db.js) ; `requestEnrichment(wineId, trigger)` (`backend/src/enrichment/scheduler.js`).
- Produces: `applyBatch(db, batch, userId) → { result, enrich: string[], replay: boolean }` ; HTTP `POST /api/quick-add` → `200 result` où `result = { batchId, summary: { winesCreated, bottlesAdded, wishlistAdded, tastingsAdded }, lines: [{ clientId, wineId: string|null, created: boolean }] }` | `400 { error, lines }` | `401` | `500 { error }`.

- [ ] **Step 1: Écrire le test d'API**

```js
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// L'enrichissement réel appellerait les moteurs IA : on vérifie seulement la demande.
vi.mock('../../src/enrichment/scheduler.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestEnrichment: vi.fn(() => ({ queued: true, position: 1 })),
}));
const { requestEnrichment } = await import('../../src/enrichment/scheduler.js');
const { api, authed, bootstrapUser, hasDb, pool, resetData } = await import('./helpers.js');

const uuid = () => crypto.randomUUID();
const count = async (table, where = '', params = []) => Number((await pool.query(`SELECT count(*) FROM ${table} ${where}`, params)).rows[0].count);

describe.skipIf(!hasDb)('API ajout rapide', () => {
  let client;
  let a;
  beforeEach(async () => {
    await resetData();
    await pool.query('TRUNCATE quick_add_batches');
    vi.mocked(requestEnrichment).mockClear();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED' })).body;
  });
  afterAll(() => pool.end());

  const send = (lines, extra = {}) => client.post('/api/quick-add', { batchId: uuid(), lines, ...extra });

  it('authentification requise', async () => {
    expect((await api().post('/api/quick-add').send({ batchId: uuid(), lines: [] })).status).toBe(401);
  });

  it('rafale mixte : cave, envie, dégustation', async () => {
    const res = await send([
      { clientId: 'c1', destination: 'CELLAR', wine: { name: 'Sancerre', producer: 'Pinard', vintage: 2020, type: 'WHITE' }, quantity: 3, price: 18 },
      { clientId: 'w1', destination: 'WISHLIST', wine: { name: 'Barolo', producer: 'Conterno', vintage: 2016, type: 'RED' }, estimatedPrice: 60 },
      { clientId: 't1', destination: 'TASTING', wine: { name: 'Chinon', producer: 'Baudry', vintage: 2019, type: 'RED' }, rating: 4, comment: 'Croquant' },
    ], { occasion: 'Salon de Loire' });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ winesCreated: 2, bottlesAdded: 3, wishlistAdded: 1, tastingsAdded: 1 });
    const sancerre = res.body.lines.find((l) => l.clientId === 'c1');
    expect(sancerre.created).toBe(true);

    const bottles = (await pool.query('SELECT purchase_price, location, purchase_date FROM bottles WHERE wine_id = $1', [sancerre.wineId])).rows;
    expect(bottles).toHaveLength(3);
    expect(bottles.every((b) => b.purchase_price === 18 && b.location === 'Non trié' && b.purchase_date)).toBe(true);
    expect((await pool.query('SELECT * FROM journal WHERE wine_id = $1', [sancerre.wineId])).rows)
      .toEqual([expect.objectContaining({ type: 'IN', quantity: 3, description: 'Rafale · Salon de Loire', wine_name: 'Sancerre' })]);
    expect((await pool.query('SELECT * FROM wishlist')).rows).toEqual([expect.objectContaining({ name: 'Barolo', estimated_price: 60, source: 'Salon de Loire' })]);

    const chinon = res.body.lines.find((l) => l.clientId === 't1');
    expect((await pool.query('SELECT overall_rating, general_notes, occasion FROM tasting_notes WHERE wine_id = $1', [chinon.wineId])).rows)
      .toEqual([{ overall_rating: 4, general_notes: 'Croquant', occasion: 'Salon de Loire' }]);
    expect(await count('bottles', 'WHERE wine_id = $1', [chinon.wineId])).toBe(0);
    expect((await pool.query('SELECT format FROM wines WHERE id = $1', [chinon.wineId])).rows[0].format).toBe('750ml');

    // Enrichissement : seulement la nouvelle fiche qui a des bouteilles.
    expect(vi.mocked(requestEnrichment).mock.calls).toEqual([[sancerre.wineId, 'manual']]);
  });

  it('vin déjà en cave : par identifiant ou par identité, sans doublon ; forceNew crée une fiche', async () => {
    const res = await send([
      { clientId: '1', destination: 'CELLAR', wine: { name: 'Autre nom', vintage: 2018 }, matchWineId: a.id, quantity: 2 },
      { clientId: '2', destination: 'CELLAR', wine: { name: 'grand vin', producer: 'CHATEAU TEST', vintage: 2018 } },
      { clientId: '3', destination: 'CELLAR', wine: { name: 'Grand Vin', producer: 'Château Test', vintage: 2018 }, forceNew: true },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.lines.map((l) => [l.wineId === a.id, l.created])).toEqual([[true, false], [true, false], [false, true]]);
    expect(await count('bottles', 'WHERE wine_id = $1', [a.id])).toBe(3);
    expect(await count('wines')).toBe(2);
  });

  it('même vin photographié deux fois : une seule fiche', async () => {
    const wine = { name: 'Chablis', producer: 'Dauvissat', vintage: 2019, type: 'WHITE' };
    const res = await send([
      { clientId: '1', destination: 'CELLAR', wine },
      { clientId: '2', destination: 'TASTING', wine, rating: 5 },
    ]);
    expect(res.body.lines[0].wineId).toBe(res.body.lines[1].wineId);
    expect(res.body.summary.winesCreated).toBe(1);
  });

  it('ligne invalide ou vin disparu : 400, rien n’est écrit', async () => {
    const before = await count('wines');
    const bad = await send([
      { clientId: 'ok', destination: 'CELLAR', wine: { name: 'Bon' } },
      { clientId: 'ko', destination: 'TASTING', wine: { name: 'Sans note' } },
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body.lines).toEqual([{ clientId: 'ko', message: expect.stringMatching(/étoiles/) }]);

    const gone = await send([
      { clientId: 'ok', destination: 'CELLAR', wine: { name: 'Bon' } },
      { clientId: 'gone', destination: 'CELLAR', wine: { name: 'X' }, matchWineId: uuid() },
    ]);
    expect(gone.status).toBe(400);
    expect(gone.body.lines).toEqual([{ clientId: 'gone', message: expect.stringMatching(/n’existe plus/) }]);
    expect(await count('wines')).toBe(before);
    expect(await count('bottles')).toBe(0);
  });

  it('renvoi du même batchId : même compte-rendu, rien de recréé', async () => {
    const batch = { batchId: uuid(), lines: [{ clientId: '1', destination: 'CELLAR', wine: { name: 'Sancerre', vintage: 2020 }, quantity: 2 }] };
    const first = await client.post('/api/quick-add', batch);
    const again = await client.post('/api/quick-add', batch);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await count('bottles')).toBe(2);
    expect(vi.mocked(requestEnrichment)).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Démarrer la base de test et lancer, il échoue**

```bash
docker run -d --rm --name vinoflow-test-db -e POSTGRES_USER=vinoflow -e POSTGRES_PASSWORD=vinoflow -e POSTGRES_DB=vinoflow_test -p 55432:5432 pgvector/pgvector:pg16
```

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npx vitest run tests/api/quickAdd.test.js`
Expected: FAIL — 404 sur `/api/quick-add` (le test 401 passe : l'authentification précède le 404).

- [ ] **Step 3: `backend/src/quickAdd/apply.js`**

```js
import { identityKey } from './identity.js';
import { BatchError } from './validate.js';

// Applique une rafale validée (validateBatch) ; à appeler dans withTransaction.

const WINE_COLUMNS = {
  name: 'name', producer: 'producer', vintage: 'vintage', type: 'type', cuvee: 'cuvee', appellation: 'appellation',
  region: 'region', country: 'country', grapeVarieties: 'grape_varieties', format: 'format',
};

const insertWine = async (db, wine) => {
  const keys = Object.keys(WINE_COLUMNS);
  const { rows: [row] } = await db.query(
    `INSERT INTO wines (${keys.map((k) => WINE_COLUMNS[k]).join(', ')})
     VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    keys.map((k) => wine[k]),
  );
  return row.id;
};

// 1. vin choisi sur le téléphone ; 2. même identité en cave (sauf forceNew) ;
// 3. fiche déjà créée dans cette rafale ; 4. nouvelle fiche.
const findWine = async (db, line, createdByKey) => {
  if (line.matchWineId) {
    const { rows } = await db.query('SELECT id FROM wines WHERE id = $1', [line.matchWineId]);
    if (!rows.length) throw new BatchError('Rafale invalide', [{ clientId: line.clientId, message: 'Ce vin n’existe plus dans la cave' }]);
    return { wineId: rows[0].id, created: false };
  }
  const key = identityKey(line.wine);
  if (!line.forceNew) {
    const { rows } = await db.query('SELECT id, name, producer, vintage FROM wines WHERE vintage IS NOT DISTINCT FROM $1::int', [line.wine.vintage]);
    const hit = rows.find((r) => identityKey(r) === key);
    if (hit) return { wineId: hit.id, created: false };
  }
  if (createdByKey.has(key)) return { wineId: createdByKey.get(key), created: false };
  const wineId = await insertWine(db, line.wine);
  createdByKey.set(key, wineId);
  return { wineId, created: true };
};

const dayMonth = (date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

export const applyBatch = async (db, batch, userId) => {
  // Deux envois simultanés du même batchId : le second attend puis rejoue.
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [batch.batchId]);
  const { rows: done } = await db.query('SELECT result FROM quick_add_batches WHERE id = $1', [batch.batchId]);
  if (done.length) return { result: done[0].result, enrich: [], replay: true };

  const now = new Date();
  const journalLabel = batch.occasion ? `Rafale · ${batch.occasion}` : 'Rafale';
  const createdByKey = new Map();
  const newWines = new Map(); // wineId → a reçu des bouteilles
  const summary = { winesCreated: 0, bottlesAdded: 0, wishlistAdded: 0, tastingsAdded: 0 };
  const lines = [];

  for (const line of batch.lines) {
    const w = line.wine;
    if (line.destination === 'WISHLIST') {
      await db.query(
        `INSERT INTO wishlist (name, producer, region, appellation, type, vintage, source, estimated_price, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MEDIUM')`,
        [w.name, w.producer, w.region, w.appellation, w.type, w.vintage, batch.occasion || `Rafale du ${dayMonth(now)}`, line.estimatedPrice],
      );
      summary.wishlistAdded += 1;
      lines.push({ clientId: line.clientId, wineId: null, created: false });
      continue;
    }

    const { wineId, created } = await findWine(db, line, createdByKey);
    if (created) { summary.winesCreated += 1; newWines.set(wineId, false); }

    if (line.destination === 'CELLAR') {
      await db.query(
        `INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_date, purchase_price)
         SELECT $1, $2::jsonb, $3, $4, $5 FROM generate_series(1, $6::int)`,
        [wineId, JSON.stringify('Non trié'), userId, now.toISOString(), line.price, line.quantity],
      );
      const { rows: [info] } = await db.query('SELECT name, vintage FROM wines WHERE id = $1', [wineId]);
      await db.query(
        `INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, user_id)
         VALUES ($1, 'IN', $2, $3, $4, $5, $6, $7)`,
        [now.toISOString(), wineId, info.name, info.vintage, line.quantity, journalLabel, userId],
      );
      summary.bottlesAdded += line.quantity;
      if (newWines.has(wineId)) newWines.set(wineId, true);
    } else {
      await db.query(
        `INSERT INTO tasting_notes (wine_id, date, overall_rating, general_notes, occasion) VALUES ($1, $2, $3, $4, $5)`,
        [wineId, now.toISOString(), line.rating, line.comment, batch.occasion],
      );
      summary.tastingsAdded += 1;
    }
    lines.push({ clientId: line.clientId, wineId, created });
  }

  const result = { batchId: batch.batchId, summary, lines };
  await db.query('INSERT INTO quick_add_batches (id, user_id, result) VALUES ($1, $2, $3)', [batch.batchId, userId, result]);
  return { result, enrich: [...newWines].filter(([, hasBottles]) => hasBottles).map(([id]) => id), replay: false };
};
```

- [ ] **Step 4: `backend/src/routes/quickAdd.js`**

```js
import { Router } from 'express';
import { withTransaction } from '../db.js';
import { validateBatch, BatchError } from '../quickAdd/validate.js';
import { applyBatch } from '../quickAdd/apply.js';
import { requestEnrichment } from '../enrichment/scheduler.js';

const router = Router();

// ========== AJOUT RAPIDE (rafale) ==========
// Toute la rafale en une transaction ; idempotente par batchId.
router.post('/quick-add', async (req, res) => {
  try {
    const batch = validateBatch(req.body);
    const { result, enrich } = await withTransaction((client) => applyBatch(client, batch, req.user?.userId ?? null));
    for (const wineId of enrich) {
      try {
        requestEnrichment(wineId, 'manual');
      } catch (error) {
        console.error('Quick add enrichment request failed:', error);
      }
    }
    return res.json(result);
  } catch (error) {
    if (error instanceof BatchError) return res.status(400).json({ error: error.message, lines: error.lines });
    console.error('Quick add error:', error);
    return res.status(500).json({ error: 'L’enregistrement de la rafale a échoué ; rien n’a été enregistré.' });
  }
});

export default router;
```

- [ ] **Step 5: Monter le routeur dans `backend/src/app.js`**

Ajouter `import quickAddRouter from './routes/quickAdd.js';` après `import importRouter from './routes/import.js';`, et `app.use('/api', quickAddRouter);` après `app.use('/api', importRouter);`.

- [ ] **Step 6: Lancer, il passe ; puis toute la suite backend**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npx vitest run tests/api/quickAdd.test.js`
Expected: PASS (6 tests).

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npm test` puis `for f in src/quickAdd/*.js src/routes/quickAdd.js src/app.js; do node --check "$f"; done`
Expected: toute la suite verte ; aucune erreur de syntaxe.

- [ ] **Step 7: Commit**

```bash
git add backend/src/quickAdd/apply.js backend/src/routes/quickAdd.js backend/src/app.js backend/tests/api/quickAdd.test.js
git commit -m "Ajout rapide : route POST /api/quick-add (une transaction, sans doublon, idempotente)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Service, file React et photo sur « Ajouter »

**Files:**
- Modify: `services/storageService.ts` (après `extractWineFromImage`), `pages/CockpitAddWine.tsx`
- Create: `hooks/useQuickAddQueue.ts`

**Interfaces:**
- Consumes: `ReadOutcome`, `DraftLine`, `DraftMeta`, `newLine`, `markReading`, `nextState`, `pickNext`, `nextWakeUp`, `wineOf` (Tâche 2) ; `openDraftStore`, `normalizeLoaded`, `DraftStore` (Tâche 3) ; `autoMatch`, `loadLabelImage`, `ocrToAddText` (Tâche 1).
- Produces: `readLabel(base64) → Promise<ReadOutcome>` ; `saveQuickAdd(body) → Promise<QuickAddResponse>` avec `QuickAddResponse = { ok: boolean; status: number; error?: string; lines?: { clientId: string; message: string }[]; result?: QuickAddResult }` et `QuickAddResult = { batchId: string; summary: { winesCreated: number; bottlesAdded: number; wishlistAdded: number; tastingsAdded: number }; lines: { clientId: string; wineId: string | null; created: boolean }[] }` ; `useQuickAddQueue(wines) → { ready, persistent, lines, meta, addPhoto(base64), update(id, patch | (line) => line), remove(id), setOccasion(text), clearAll() }`.

- [ ] **Step 1: Services (`services/storageService.ts`)**

Ajouter l'import `import type { ReadOutcome } from '../utils/quickAddQueue';` en tête, puis après `extractWineFromImage` :

```ts
// Lecture d'étiquette pour la rafale : jamais d'exception, l'issue est décrite
// (réseau, HTTP + Retry-After) pour que la file sache s'il faut réessayer.
export const readLabel = async (base64: string): Promise<ReadOutcome> => {
  try {
    const response = await apiFetch(`${API_URL}/wines/extract-from-image`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' }),
    });
    if (response.ok) return { kind: 'ok', ocr: await response.json() };
    const data = await response.json().catch(() => null);
    return { kind: 'http', status: response.status, retryAfter: Number(response.headers.get('Retry-After')) || null, message: data?.error || data?.msg };
  } catch {
    return { kind: 'network' };
  }
};

export interface QuickAddResult {
  batchId: string;
  summary: { winesCreated: number; bottlesAdded: number; wishlistAdded: number; tastingsAdded: number };
  lines: { clientId: string; wineId: string | null; created: boolean }[];
}
export interface QuickAddResponse { ok: boolean; status: number; error?: string; lines?: { clientId: string; message: string }[]; result?: QuickAddResult }

/** Enregistre une rafale (POST /api/quick-add). */
export const saveQuickAdd = async (body: object): Promise<QuickAddResponse> => {
  try {
    const response = await apiFetch(`${API_URL}/quick-add`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status, error: data?.error || `Erreur ${response.status}`, lines: data?.lines };
    return { ok: true, status: response.status, result: data };
  } catch {
    return { ok: false, status: 0, error: 'Serveur injoignable : la rafale reste sur le téléphone, réessaie.' };
  }
};
```

- [ ] **Step 2: Hook `hooks/useQuickAddQueue.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CellarWine } from '../types';
import { readLabel } from '../services/storageService';
import { autoMatch } from '../utils/findExisting';
import { openDraftStore, normalizeLoaded, type DraftStore } from '../utils/quickAddDraft';
import { markReading, newLine, nextState, nextWakeUp, pickNext, wineOf, type DraftLine, type DraftMeta } from '../utils/quickAddQueue';

const newMeta = (): DraftMeta => ({ batchId: crypto.randomUUID(), occasion: '' });

/** Brouillon de rafale + lecture des photos, une à la fois, dès que le réseau le permet. */
export const useQuickAddQueue = (wines: CellarWine[]) => {
  const [store, setStore] = useState<DraftStore | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [meta, setMeta] = useState<DraftMeta>(newMeta);
  const [tick, setTick] = useState(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const winesRef = useRef(wines);
  winesRef.current = wines;
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    openDraftStore().then(async (s) => {
      const loaded = normalizeLoaded(await s.list());
      const savedMeta = await s.getMeta();
      if (!alive) return;
      setStore(s);
      setLines(loaded);
      if (savedMeta) setMeta(savedMeta);
      else await s.putMeta(meta);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (line: DraftLine) => {
    setLines(ls => (ls.some(l => l.id === line.id) ? ls.map(l => (l.id === line.id ? line : l)) : [...ls, line]));
    await store?.put(line);
  }, [store]);

  // Lecteur : une photo à la fois ; réveil programmé à la prochaine échéance.
  useEffect(() => {
    if (!store || busy.current) return;
    const now = Date.now();
    const next = pickNext(lines, now);
    if (!next) {
      const wake = nextWakeUp(lines, now);
      if (wake == null) return;
      const timer = setTimeout(() => setTick(t => t + 1), wake - now);
      return () => clearTimeout(timer);
    }
    busy.current = true;
    (async () => {
      await save(markReading(next));
      const outcome = await readLabel(next.photo as string);
      const current = linesRef.current.find(l => l.id === next.id);
      if (current) {
        let updated = nextState(current, outcome, Date.now());
        if (outcome.kind === 'ok' && !updated.matchWineId && !updated.forceNew) {
          const match = autoMatch(winesRef.current, wineOf(updated));
          if (match) updated = { ...updated, matchWineId: match.id };
        }
        await save(updated);
      }
      busy.current = false;
      setTick(t => t + 1);
    })();
  }, [store, lines, tick, save]);

  useEffect(() => {
    const wake = () => setTick(t => t + 1);
    window.addEventListener('online', wake);
    return () => window.removeEventListener('online', wake);
  }, []);

  const addPhoto = useCallback((photo: string | null) => save(newLine(crypto.randomUUID(), photo, Date.now())), [save]);

  const update = useCallback(async (id: string, change: Partial<DraftLine> | ((line: DraftLine) => DraftLine)) => {
    const current = linesRef.current.find(l => l.id === id);
    if (!current) return;
    await save(typeof change === 'function' ? change(current) : { ...current, ...change });
  }, [save]);

  const remove = useCallback(async (id: string) => {
    setLines(ls => ls.filter(l => l.id !== id));
    await store?.delete(id);
  }, [store]);

  const setOccasion = useCallback(async (occasion: string) => {
    const next = { ...meta, occasion };
    setMeta(next);
    await store?.putMeta(next);
  }, [meta, store]);

  const clearAll = useCallback(async () => {
    const fresh = newMeta();
    setLines([]);
    setMeta(fresh);
    await store?.clear();
    await store?.putMeta(fresh);
  }, [store]);

  return { ready: !!store, persistent: store?.kind === 'idb', lines, meta, addPhoto, update, remove, setOccasion, clearAll };
};
```

- [ ] **Step 3: Photo et rafale sur `pages/CockpitAddWine.tsx`**

Imports : ajouter `Camera, Layers` à l'import `lucide-react` ; `useRef` à l'import React ; `readLabel` à l'import `storageService` ; `import { loadLabelImage, ocrToAddText } from '../utils/labelImage';` ; `import { openDraftStore } from '../utils/quickAddDraft';` ; `OcrResult` à l'import `../types`.

État (après `const [saving, setSaving] = useState(false);`) :

```tsx
  // Photo d'étiquette : champs lus en plus du texte (appellation, cépages…).
  const photoInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [label, setLabel] = useState<OcrResult | null>(null);
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    openDraftStore().then(s => s.list()).then(l => setDraftCount(l.length)).catch(() => {});
  }, []);

  const handlePhoto = async (file: File) => {
    setReading(true);
    try {
      const img = await loadLabelImage(file);
      const outcome = await readLabel(img.base64);
      if (outcome.kind !== 'ok') {
        toast.error(outcome.kind === 'network' ? 'Pas de réseau : utilise la rafale, elle lira la photo plus tard.' : 'Lecture de l’étiquette impossible.');
        return;
      }
      const r = outcome.ocr;
      setLabel(r);
      setText(ocrToAddText(r));
      if (r.producer) setProducer(r.producer);
      if (r.type) setType(r.type);
      if (r.confidence === 'LOW') toast.info('Lecture incertaine : vérifie le nom et le millésime.');
    } catch {
      toast.error('Lecture de l’étiquette impossible.');
    } finally {
      setReading(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  };
```

Dans `handleSave`, remplacer `const a = analysis || {};` par :

```tsx
    // La lecture de l'étiquette prime sur l'identification au texte pour les champs qu'elle a lus.
    const a: Partial<Wine> = {
      ...(analysis || {}),
      ...(label?.appellation ? { appellation: label.appellation } : {}),
      ...(label?.region ? { region: label.region } : {}),
      ...(label?.country ? { country: label.country } : {}),
      ...(label?.cuvee ? { cuvee: label.cuvee } : {}),
      ...(label?.format ? { format: label.format } : {}),
      ...(label?.grape_varieties?.length ? { grapeVarieties: label.grape_varieties } : {}),
    };
```

Dans le JSX, juste après la `<textarea …/>` de la carte Étiquette :

```tsx
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => photoInput.current?.click()} disabled={reading || saving}>
                {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {reading ? 'Lecture de l’étiquette…' : 'Photo'}
              </Button>
              <Button variant="ghost" onClick={() => navigate('/add-wine/rafale')}>
                <Layers className="w-4 h-4" /> Rafale (plusieurs vins)
              </Button>
              <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
            </div>
            {draftCount > 0 && (
              <button onClick={() => navigate('/add-wine/rafale')} className="mt-3 w-full text-left rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
                Rafale en cours · {draftCount} photo(s) — <span className="underline">Reprendre</span>
              </button>
            )}
```

Mettre à jour le texte d'intro : « Tape l'étiquette ou prends-la en photo : on retrouve le vin s'il est déjà en cave, sinon on crée sa fiche. »

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test`
Expected: typecheck sans erreur ; tests front verts.

- [ ] **Step 5: Commit**

```bash
git add services/storageService.ts hooks/useQuickAddQueue.ts pages/CockpitAddWine.tsx
git commit -m "Ajout rapide : photo d'étiquette sur « Ajouter », file de lecture de la rafale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Écran Rafale, route, documentation, essai de bout en bout

**Files:**
- Create: `components/cockpit/QuickAddCard.tsx`, `pages/CockpitQuickAdd.tsx`
- Modify: `App.tsx` (lazy import + route `/add-wine/rafale`), `CLAUDE.md`

**Interfaces:**
- Consumes: `useQuickAddQueue` (Tâche 6) ; `saveQuickAdd` (Tâche 6) ; `wineOf`, `lineProblem`, `summarize`, `buildPayload`, `confirmLine`, `toManual`, `withNewPhoto`, `DraftLine`, `Destination`, `WineDraft` (Tâche 2) ; `loadLabelImage` (Tâche 1) ; `useWines`, primitives Cockpit, `useToast`, `useConfirm`.
- Produces: `QuickAddCard` (`{ line: DraftLine; wines: CellarWine[]; onChange(change: Partial<DraftLine> | ((l: DraftLine) => DraftLine)): void; onRemove(): void }`) ; page `CockpitQuickAdd`.

- [ ] **Step 1: `components/cockpit/QuickAddCard.tsx`**

```tsx
import React, { useRef } from 'react';
import { Camera, Minus, Plus, Star, Trash2, Type as TypeIcon } from 'lucide-react';
import type { CellarWine, WineType } from '../../types';
import { confirmLine, lineProblem, toManual, wineOf, withNewPhoto, type Destination, type DraftLine, type WineDraft } from '../../utils/quickAddQueue';
import { loadLabelImage } from '../../utils/labelImage';
import { Badge, Button, Card, Input } from './primitives';

const STATUS: Record<DraftLine['status'], { label: string; tone: 'urgent' | 'warning' | 'neutral' | 'success' }> = {
  PENDING: { label: 'En attente de réseau', tone: 'neutral' },
  READING: { label: 'Lecture…', tone: 'neutral' },
  READY: { label: 'Prêt', tone: 'success' },
  REVIEW: { label: 'À vérifier', tone: 'warning' },
  FAILED: { label: 'Échec', tone: 'urgent' },
};
const TYPES: { k: WineType; l: string }[] = [
  { k: 'RED' as WineType, l: 'Rouge' }, { k: 'WHITE' as WineType, l: 'Blanc' }, { k: 'ROSE' as WineType, l: 'Rosé' },
  { k: 'SPARKLING' as WineType, l: 'Bulles' }, { k: 'DESSERT' as WineType, l: 'Moelleux' }, { k: 'FORTIFIED' as WineType, l: 'Muté' },
];
const DESTINATIONS: { k: Destination; l: string }[] = [{ k: 'CELLAR', l: 'Cave' }, { k: 'WISHLIST', l: 'Envie' }, { k: 'TASTING', l: 'Dégustation' }];

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

interface Props {
  line: DraftLine;
  wines: CellarWine[];
  onChange: (change: Partial<DraftLine> | ((l: DraftLine) => DraftLine)) => void;
  onRemove: () => void;
}

// Une photo de la rafale : état de lecture, vin lu (modifiable), destination.
export const QuickAddCard: React.FC<Props> = ({ line, wines, onChange, onRemove }) => {
  const retake = useRef<HTMLInputElement>(null);
  const wine = wineOf(line);
  const status = STATUS[line.status];
  const match = line.matchWineId ? wines.find(w => w.id === line.matchWineId) : null;
  const problem = lineProblem(line);
  const edit = (patch: Partial<WineDraft>) => onChange(l => ({ ...l, edits: { ...l.edits, ...patch } }));

  const onRetake = async (file: File) => {
    const img = await loadLabelImage(file);
    onChange(l => withNewPhoto(l, img.base64));
  };

  return (
    <Card className="p-3">
      <div className="flex gap-3">
        {line.photo
          ? <img src={`data:image/jpeg;base64,${line.photo}`} alt="Étiquette" className="w-16 h-20 rounded object-cover border border-stone-200 shrink-0" />
          : <div className="w-16 h-20 rounded border border-dashed border-stone-300 shrink-0 flex items-center justify-center text-stone-400"><TypeIcon className="w-5 h-5" /></div>}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={status.tone}>{status.label.toUpperCase()}</Badge>
            {line.error && <span className="text-xs text-wine-700 truncate">{line.error}</span>}
            <button onClick={onRemove} aria-label="Supprimer la ligne" className="ml-auto h-9 w-9 inline-flex items-center justify-center rounded text-stone-400 hover:text-wine-700"><Trash2 className="w-4 h-4" /></button>
          </div>

          {(line.status === 'FAILED' || line.status === 'PENDING') && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => retake.current?.click()}><Camera className="w-3.5 h-3.5" /> Reprendre la photo</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(toManual)}>Saisir le texte</Button>
              <input ref={retake} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && onRetake(e.target.files[0])} />
            </div>
          )}

          {line.status !== 'PENDING' && line.status !== 'READING' && line.status !== 'FAILED' && (
            <>
              <Input aria-label="Nom" placeholder="Nom du vin" value={wine.name} onChange={e => edit({ name: e.target.value })} />
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <Input aria-label="Producteur" placeholder="Producteur" value={wine.producer} onChange={e => edit({ producer: e.target.value })} />
                <Input aria-label="Millésime" placeholder="Millésime" inputMode="numeric" value={wine.vintage ?? ''} onChange={e => edit({ vintage: toNumber(e.target.value) })} />
              </div>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Couleur">
                {TYPES.map(t => (
                  <button key={t.k} role="radio" aria-checked={wine.type === t.k} onClick={() => edit({ type: t.k })}
                    className={`h-9 md:h-7 px-2.5 rounded border text-xs ${wine.type === t.k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300'}`}>{t.l}</button>
                ))}
              </div>
              <details>
                <summary className="text-xs text-stone-500 cursor-pointer">Cuvée, appellation</summary>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input aria-label="Cuvée" placeholder="Cuvée" value={wine.cuvee} onChange={e => edit({ cuvee: e.target.value })} />
                  <Input aria-label="Appellation" placeholder="Appellation" value={wine.appellation} onChange={e => edit({ appellation: e.target.value })} />
                </div>
              </details>

              {match && !line.forceNew && line.destination !== 'WISHLIST' && (
                <div className="text-xs text-stone-600 bg-stone-50 rounded px-2 py-1.5">
                  Déjà en cave · {match.name} {match.vintage} ({match.inventoryCount} btl) ·{' '}
                  <button className="underline" onClick={() => onChange({ forceNew: true, matchWineId: null })}>Ce n’est pas lui</button>
                </div>
              )}

              <div className="flex gap-1" role="radiogroup" aria-label="Destination">
                {DESTINATIONS.map(d => (
                  <button key={d.k} role="radio" aria-checked={line.destination === d.k} onClick={() => onChange({ destination: d.k })}
                    className={`flex-1 h-9 rounded border text-sm ${line.destination === d.k ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-stone-700 border-stone-300'}`}>{d.l}</button>
                ))}
              </div>

              {line.destination === 'CELLAR' && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-md p-1">
                    <button onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })} aria-label="Une bouteille de moins" className="w-9 h-9 rounded hover:bg-stone-200 inline-flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                    <span className="w-8 text-center tabular-nums">{line.quantity}</span>
                    <button onClick={() => onChange({ quantity: Math.min(99, line.quantity + 1) })} aria-label="Une bouteille de plus" className="w-9 h-9 rounded hover:bg-stone-200 inline-flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                  </div>
                  <Input aria-label="Prix unitaire (€)" placeholder="Prix €" inputMode="decimal" value={line.price ?? ''} onChange={e => onChange({ price: toNumber(e.target.value) })} />
                </div>
              )}
              {line.destination === 'WISHLIST' && (
                <Input aria-label="Prix estimé (€)" placeholder="Prix estimé €" inputMode="decimal" value={line.estimatedPrice ?? ''} onChange={e => onChange({ estimatedPrice: toNumber(e.target.value) })} />
              )}
              {line.destination === 'TASTING' && (
                <div className="space-y-2">
                  <div className="flex gap-1" role="radiogroup" aria-label="Note">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} role="radio" aria-checked={line.rating === n} aria-label={`${n} étoile(s)`} onClick={() => onChange({ rating: n })} className="h-9 w-9 inline-flex items-center justify-center">
                        <Star className={`w-5 h-5 ${line.rating && n <= line.rating ? 'fill-amber-400 text-amber-500' : 'text-stone-300'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea aria-label="Commentaire" placeholder="Commentaire" rows={2} value={line.comment} onChange={e => onChange({ comment: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-stone-300 text-sm" />
                </div>
              )}

              {line.status === 'REVIEW' && (
                <Button size="sm" onClick={() => onChange(confirmLine)} disabled={!wine.name.trim()}>Valider</Button>
              )}
              {problem && line.status === 'READY' && <div className="text-xs text-wine-700">{problem}</div>}
            </>
          )}
        </div>
      </div>
    </Card>
  );
};
```

- [ ] **Step 2: `pages/CockpitQuickAdd.tsx`**

```tsx
// Rafale : une photo d'étiquette par vin, à la suite (carton, salon). Le
// brouillon reste sur le téléphone ; les photos sont lues dès que possible ;
// tout est enregistré d'un coup (cave, envies, dégustations).
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Loader2 } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useQuickAddQueue } from '../hooks/useQuickAddQueue';
import { saveQuickAdd } from '../services/storageService';
import { loadLabelImage } from '../utils/labelImage';
import { buildPayload, summarize } from '../utils/quickAddQueue';
import { QuickAddCard } from '../components/cockpit/QuickAddCard';
import { Button, EmptyState, Input, MonoLabel } from '../components/cockpit/primitives';
import { useConfirm, useToast } from '../components/cockpit/feedback';

export const CockpitQuickAdd: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirmAction = useConfirm();
  const { wines, refresh } = useWines();
  const q = useQuickAddQueue(wines);
  const photoInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const s = summarize(q.lines);

  const onPhoto = async (files: FileList | null) => {
    for (const file of Array.from(files || [])) {
      try {
        const img = await loadLabelImage(file);
        await q.addPhoto(img.base64);
      } catch {
        toast.error('Photo illisible.');
      }
    }
    if (photoInput.current) photoInput.current.value = '';
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await saveQuickAdd(buildPayload(q.meta, q.lines));
      if (res.ok && res.result) {
        const r = res.result.summary;
        await q.clearAll();
        await refresh();
        toast.success(`Rafale enregistrée : ${r.bottlesAdded} bouteille(s), ${r.wishlistAdded} envie(s), ${r.tastingsAdded} dégustation(s).`, { label: 'Ranger', onClick: () => navigate('/plan') });
        navigate('/add-wine');
        return;
      }
      for (const l of res.lines || []) await q.update(l.clientId, { error: l.message });
      toast.error(res.error || 'L’enregistrement a échoué.');
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    if (await confirmAction({ title: 'Vider la rafale ?', message: 'Les photos et les saisies de cette rafale seront effacées du téléphone.', confirmLabel: 'Vider' })) await q.clearAll();
  };

  const ordered = [...q.lines].reverse();

  return (
    <div className="max-w-[720px] mx-auto pb-44 md:pb-24">
      <div className="mb-4">
        <MonoLabel>VINOFLOW · RAFALE</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Rafale</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">
          Une photo d'étiquette par vin. {q.persistent ? 'Brouillon gardé sur ce téléphone.' : 'Brouillon non conservé si tu fermes l’app.'}
        </div>
      </div>

      <div className="flex items-end gap-2 mb-4">
        <Input label="Occasion" placeholder="ex. Salon des vins de Loire" value={q.meta.occasion} onChange={e => q.setOccasion(e.target.value)} wrapperClassName="flex-1" />
        {q.lines.length > 0 && <Button variant="ghost" onClick={onClear}>Vider</Button>}
      </div>

      {q.lines.length === 0
        ? <EmptyState title="Aucune photo pour l’instant" hint="Prends l’étiquette de chaque vin, l’une après l’autre." />
        : <div className="space-y-3">{ordered.map(line => (
            <QuickAddCard key={line.id} line={line} wines={wines} onChange={change => q.update(line.id, change)} onRemove={() => q.remove(line.id)} />
          ))}</div>}

      <div className="fixed md:sticky inset-x-0 bottom-16 md:bottom-0 z-30 bg-white/95 backdrop-blur border-t border-stone-200 px-4 py-3 space-y-2">
        <label className={`flex items-center justify-center gap-2 h-11 rounded-md border border-stone-300 bg-white text-stone-800 cursor-pointer ${!q.ready ? 'opacity-50 pointer-events-none' : ''}`}>
          <Camera className="w-4 h-4" /> Photo suivante
          <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={e => onPhoto(e.target.files)} />
        </label>
        <Button size="lg" className="w-full" disabled={saving || s.lines === 0 || s.blocking > 0} onClick={onSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {s.blocking > 0 ? `${s.blocking} ligne(s) à finir` : `Enregistrer ${s.lines} ligne(s)`}
        </Button>
        {s.lines > 0 && (
          <div className="text-center text-[11px] text-stone-500">
            {s.cellar} en cave · {s.bottles} btl · {s.wishlist} envie(s) · {s.tastings} dégustation(s)
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Route dans `App.tsx`**

Ajouter `const CockpitQuickAdd    = lazy(() => import('./pages/CockpitQuickAdd').then(m => ({ default: m.CockpitQuickAdd })));` après la ligne `CockpitAddWine`, et `<Route path="/add-wine/rafale" element={<Suspense fallback={<PageLoader />}><CockpitQuickAdd /></Suspense>} />` après la route `/add-wine`.

- [ ] **Step 4: Documenter dans `CLAUDE.md`**

Après la ligne `backend/src/enrichment/` de la section Layout :

```markdown
- `backend/src/quickAdd/` + `utils/quickAdd*.ts` — ajout rapide : photo d'étiquette sur « Ajouter » et écran Rafale (`/add-wine/rafale`). Brouillon sur le téléphone (IndexedDB, repli mémoire), lecture des photos une à une via `extract-from-image` (machine à états pure `utils/quickAddQueue.ts` : réessais réseau/5xx/429). `POST /api/quick-add` enregistre toute la rafale en une transaction (cave / envie / dégustation, rapprochement nom + producteur + millésime, idempotent par `batchId` via `quick_add_batches`).
```

- [ ] **Step 5: Vérifier**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sans erreur, tests verts, build OK.

- [ ] **Step 6: Essai de bout en bout (navigateur)**

Pile isolée : `docker compose -p vinoflow-quick --env-file <scratchpad>/quick-e2e.env up -d --build db backend frontend` (port libre, ex. 5094 ; compte de test et deux vins créés par l'API). Dans le navigateur intégré, après connexion :
1. Intercepter `fetch` sur `/api/wines/extract-from-image` (pas de clé IA locale) pour renvoyer une lecture simulée ; fournir les photos au champ fichier via `DataTransfer`.
2. « Ajouter » → Photo : le formulaire se remplit ; « Déjà en cave » apparaît pour un vin existant.
3. Rafale : 3 photos ; la 2e avec l'interception en mode « hors ligne » (`fetch` rejette) → *en attente* ; recharger la page → les 3 lignes sont toujours là ; rétablir → la 2e est lue ; choisir Cave / Envie / Dégustation ; Enregistrer.
4. Vérifier en base : bouteilles, journal IN « Rafale · <occasion> », wishlist, tasting_notes ; pas de doublon pour le vin existant. Capture de l'écran Rafale pour la PR. Arrêter la pile (`docker compose -p vinoflow-quick down -v`).

- [ ] **Step 7: Commit**

```bash
git add components/cockpit/QuickAddCard.tsx pages/CockpitQuickAdd.tsx App.tsx CLAUDE.md
git commit -m "Ajout rapide : écran Rafale (cave, envies, dégustations) et documentation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
