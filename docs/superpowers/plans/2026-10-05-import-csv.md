# Import CSV (aller-retour avec l'export) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exporter la cave en CSV, la corriger dans un tableur, la réimporter : aperçu des changements, puis application atomique.

**Architecture:** L'export front (`utils/exportCsv.ts`) adopte un format « aller-retour » (colonne Identifiant, `;`, virgule décimale). Le backend lit le fichier dans un module pur `backend/src/csvImport/` (parse → patches → plan) et l'applique en une transaction (`apply.js`) derrière `POST /api/import/csv` (`dryRun` puis application protégée par `planHash`). Réglages → Données affiche l'aperçu dans une modale Cockpit.

**Tech Stack:** Express 4 (ESM), Postgres 16, Vitest + supertest (backend) ; React 19 + Tailwind + Vitest (front, `utils/` seulement).

**Spec:** `docs/superpowers/specs/2026-10-05-import-csv-design.md`

## Global Constraints

- Messages de commit et textes d'interface en français. Pas de classes `dark:`.
- Seul le format VinoFlow est accepté ; clé = colonne **Identifiant** ; fichier sans cette colonne → 400 « Ce fichier ne contient pas la colonne Identifiant. Réexporte ta cave depuis VinoFlow puis modifie ce nouveau fichier. »
- Cellule vide = ne pas toucher ; `-` efface (interdit pour Nom et Producteur, et pour le prix) ; colonne absente = ne pas toucher.
- Le prix d'achat ne s'applique qu'aux bouteilles **en stock** dont `purchase_price` est NULL ou 0.
- Apogée importée = `peak_source 'USER'`, `peak_confidence 'HIGH'`.
- Limites : CSV ≤ 2 Mo (413), ≤ 5 000 lignes (400).
- Nouveau vin : N bouteilles (défaut 1, 1–99) en « Non trié », une entrée journal `IN` « Import CSV » ; pas d'appel d'enrichissement (le planificateur s'en charge).
- Pas de migration de schéma.
- Pas de rate limit dédié : `/api/import` n'en a pas (le spec dit « même rate limit que `/api/import` ») et l'aperçu ne coûte qu'une lecture SQL.

## Review Focus

- **CSV réenregistré par Excel FR** (`;`, CRLF, BOM, `14,50`, `1 234,50 €`, espaces insécables) : doit être lu sans erreur — tests dans Tâche 2 (parse) et Tâche 3 (nombres).
- **Réimport du fichier exporté sans modification** : zéro changement et aucun avertissement de prix — test plan (Tâche 4) et API (Tâche 5).
- **Ligne à moitié invalide** (ex. Appellation valide + apogée incohérente) : toute la ligne est écartée, pas seulement le champ fautif — test Tâche 4.
- **Cave modifiée entre l'aperçu et l'application** : 409, rien d'écrit — test Tâche 5.
- **Erreur SQL au milieu de l'application** : rien d'écrit (transaction) — test Tâche 5 (caractère NUL).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `utils/exportCsv.ts` (modifié) | `CSV_HEADERS`, `buildCellarCsv(wines)` (pur), `exportWinesToCsv(wines)` (téléchargement) |
| `utils/exportCsv.test.ts` (réécrit) | format de l'export |
| `backend/tests/fixtures/exportVinoflow.js` (nouveau) | fichier type produit par l'export, relu par les tests backend |
| `backend/src/csvImport/parse.js` | `parseCsv(text)`, `CsvFormatError` |
| `backend/src/csvImport/columns.js` | en-têtes → champs, types, constantes |
| `backend/src/csvImport/rows.js` | `toPatches(table)` : lignes → patches typés + erreurs par ligne |
| `backend/src/csvImport/plan.js` | `buildPlan(patches, cellar, errors)` : comparaison avec la cave, `planHash` |
| `backend/src/csvImport/apply.js` | `loadCellar(db)`, `applyPlan(db, plan, userId)` |
| `backend/src/routes/import.js` (modifié) | `POST /import/csv` |
| `backend/src/app.js` (modifié) | parseur JSON global contourné pour `/api/import/csv` |
| `services/storageService.ts` (modifié) | `previewCsvImport`, `applyCsvImport` |
| `types.ts` (modifié) | `CsvImportPlan`, `CsvImportApplied` |
| `utils/csvImportSummary.ts` (+ test) | libellés FR, tuiles, regroupement par vin |
| `components/cockpit/CsvImportPreview.tsx` | modale d'aperçu |
| `pages/Settings.tsx` (modifié) | bouton « Importer un CSV modifié » |

---

### Task 1: Export CSV au format aller-retour

**Files:**
- Modify: `utils/exportCsv.ts` (réécriture complète)
- Modify: `pages/Settings.tsx:209-221` (`handleCsvExport`) et texte d'aide `:429-431`
- Test: `utils/exportCsv.test.ts` (réécriture complète)
- Create: `backend/tests/fixtures/exportVinoflow.js`

**Interfaces:**
- Produces: `CSV_HEADERS: string[]`, `buildCellarCsv(wines: CellarWine[]): string` (avec BOM, `;`, CRLF), `exportWinesToCsv(wines: CellarWine[]): void`. En-tête exact : `Identifiant;Nom;Cuvée;Producteur;Millésime;Région;Appellation;Pays;Type;Cépages;Format;Favori;Apogée début;Apogée fin;Prix d'achat (€);Bouteilles;Description;Accords mets;Stock;Apogée;Fenêtre estimée`
- Produces: `backend/tests/fixtures/exportVinoflow.js` → `export const EXPORT_HEADER`, `export const WINE_A_ID`, `export const WINE_B_ID`, `export const exportCsv` (chaîne).

- [ ] **Step 1: Réécrire le test**

`utils/exportCsv.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildCellarCsv, exportWinesToCsv, CSV_HEADERS } from './exportCsv';
import type { CellarWine } from '../types';

// En-tête figé : le backend (backend/src/csvImport/columns.js et
// backend/tests/fixtures/exportVinoflow.js) relit exactement ce format.
const HEADER = "Identifiant;Nom;Cuvée;Producteur;Millésime;Région;Appellation;Pays;Type;Cépages;Format;Favori;Apogée début;Apogée fin;Prix d'achat (€);Bouteilles;Description;Accords mets;Stock;Apogée;Fenêtre estimée";

// Découpe une ligne CSV `;` en respectant les guillemets.
const cells = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
};
const col = (name: string) => CSV_HEADERS.indexOf(name);

const wine = (overrides: Partial<CellarWine> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Grand Vin', cuvee: '', producer: 'Château, Test',
  vintage: 2018, region: 'Bordeaux', appellation: 'Pauillac', country: 'France', type: 'RED',
  grapeVarieties: ['Merlot', 'Cabernet'], format: '750ml', inventoryCount: 2, isFavorite: true,
  sensoryDescription: 'Dit "superbe"', suggestedFoodPairings: ['agneau'],
  bottles: [{ purchasePrice: 20 }, { purchasePrice: 30 }],
  ...overrides,
}) as unknown as CellarWine;

const row = (w: CellarWine) => cells(buildCellarCsv([w]).replace(/^﻿/, '').split('\r\n')[1]);

describe('buildCellarCsv', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('BOM, en-tête figé, séparateur ; et CRLF', () => {
    const csv = buildCellarCsv([wine(), wine({ id: '2' } as Partial<CellarWine>)]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(CSV_HEADERS.join(';')).toBe(HEADER);
    expect(lines[0]).toBe(HEADER);
    expect(lines).toHaveLength(3);
  });

  it('identifiant en 1re colonne, libellés FR, listes et échappement', () => {
    const r = row(wine());
    expect(r[0]).toBe('11111111-1111-4111-8111-111111111111');
    expect(r[col('Producteur')]).toBe('Château, Test');
    expect(r[col('Type')]).toBe('Rouge');
    expect(r[col('Cépages')]).toBe('Merlot; Cabernet');
    expect(r[col('Favori')]).toBe('Oui');
    expect(r[col('Description')]).toBe('Dit "superbe"');
    expect(r[col('Bouteilles')]).toBe('');
    expect(r[col('Stock')]).toBe('2');
  });

  it('apogée enregistrée seulement si stockée en base ; estimation en lecture seule', () => {
    const estimated = row(wine());
    expect(estimated[col('Apogée début')]).toBe('');
    expect(estimated[col('Apogée fin')]).toBe('');
    expect(estimated[col('Apogée')]).toBe('À Boire');
    expect(estimated[col('Fenêtre estimée')]).toBe('2023-2028');

    const stored = row(wine({ peakStart: 2025, peakEnd: 2035, peakSource: 'USER' }));
    expect(stored[col('Apogée début')]).toBe('2025');
    expect(stored[col('Apogée fin')]).toBe('2035');
    expect(stored[col('Fenêtre estimée')]).toBe('2025-2035');
  });

  it('prix d’achat : moyenne à virgule si toutes les bouteilles en stock ont un prix, sinon vide', () => {
    expect(row(wine())[col("Prix d'achat (€)")]).toBe('25,00');
    expect(row(wine({ bottles: [{ purchasePrice: 20 }, { purchasePrice: 0 }] } as Partial<CellarWine>))[col("Prix d'achat (€)")]).toBe('');
    expect(row(wine({ bottles: [{ purchasePrice: 20 }, {}] } as Partial<CellarWine>))[col("Prix d'achat (€)")]).toBe('');
    // Une bouteille bue sans prix ne compte pas.
    expect(row(wine({ bottles: [{ purchasePrice: 20 }, { purchasePrice: 0, isConsumed: true }] } as Partial<CellarWine>))[col("Prix d'achat (€)")]).toBe('20,00');
  });
});

describe('exportWinesToCsv', () => {
  let blob: Blob | null = null;
  beforeEach(() => {
    blob = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const link = { click: vi.fn(), href: '', download: '' };
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn(), removeChild: vi.fn() } });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('télécharge le fichier avec un BOM UTF-8 (Excel)', async () => {
    exportWinesToCsv([wine()]);
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
```

- [ ] **Step 2: Lancer le test, il échoue**

Run: `npm test -- utils/exportCsv.test.ts`
Expected: FAIL — `buildCellarCsv` / `CSV_HEADERS` non exportés.

- [ ] **Step 3: Réécrire `utils/exportCsv.ts`**

```ts
import { CellarWine } from '../types';
import { getPeakWindow } from './peakWindow';

// Format « aller-retour » : relu par l'import (backend/src/csvImport/). Toute
// modification des en-têtes doit être reportée dans csvImport/columns.js.
// Les trois dernières colonnes sont calculées et ignorées à l'import.
export const CSV_HEADERS = [
  'Identifiant', 'Nom', 'Cuvée', 'Producteur', 'Millésime', 'Région', 'Appellation', 'Pays',
  'Type', 'Cépages', 'Format', 'Favori', 'Apogée début', 'Apogée fin', "Prix d'achat (€)",
  'Bouteilles', 'Description', 'Accords mets', 'Stock', 'Apogée', 'Fenêtre estimée',
];

const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé',
  SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};

const escapeCsv = (val: unknown): string => {
  const str = String(val ?? '');
  return /[;,"\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Prix moyen des bouteilles en stock, seulement si toutes ont un prix : une
// cellule vide invite à le compléter (l'import ne remplit que les prix manquants).
const purchasePriceCell = (w: CellarWine): string => {
  const inStock = (w.bottles || []).filter(b => !b.isConsumed);
  if (inStock.length === 0 || inStock.some(b => !b.purchasePrice || b.purchasePrice <= 0)) return '';
  const avg = inStock.reduce((sum, b) => sum + (b.purchasePrice || 0), 0) / inStock.length;
  return avg.toFixed(2).replace('.', ',');
};

/** CSV de la cave (BOM UTF-8, séparateur ;, CRLF) — lisible tel quel par Excel FR. */
export const buildCellarCsv = (wines: CellarWine[]): string => {
  const rows = wines.map(w => {
    const peak = getPeakWindow(w);
    const stored = w.peakStart != null && w.peakEnd != null;
    return [
      w.id, w.name, w.cuvee || '', w.producer, w.vintage ?? '', w.region || '',
      w.appellation || '', w.country || '', TYPE_LABELS[w.type] || w.type || '',
      (w.grapeVarieties || []).join('; '), w.format || '', w.isFavorite ? 'Oui' : 'Non',
      stored ? w.peakStart : '', stored ? w.peakEnd : '', purchasePriceCell(w), '',
      w.sensoryDescription || '', (w.suggestedFoodPairings || []).join('; '),
      w.inventoryCount, peak.peakStart ? peak.status : '',
      peak.peakStart ? `${peak.peakStart}-${peak.peakEnd}` : '',
    ];
  });
  return '﻿' + [CSV_HEADERS, ...rows].map(r => r.map(escapeCsv).join(';')).join('\r\n');
};

/** Télécharge l'export CSV des vins donnés. */
export const exportWinesToCsv = (wines: CellarWine[]) => {
  const blob = new Blob([buildCellarCsv(wines)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vinoflow-cave-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 4: Adapter `pages/Settings.tsx`**

Dans `handleCsvExport`, remplacer `const [wines, racks] = await Promise.all([getInventory(), getRacks()]);` par `const wines = await getInventory();` et `exportWinesToCsv(withStock, racks);` par `exportWinesToCsv(withStock);`. Si `getRacks` n'est plus utilisé ailleurs dans le fichier (`grep -n getRacks pages/Settings.tsx`), le retirer de l'import.

- [ ] **Step 5: Lancer les tests et le typecheck**

Run: `npm test -- utils/exportCsv.test.ts && npm run typecheck`
Expected: PASS (5 tests), typecheck sans erreur.

- [ ] **Step 6: Créer la fixture backend**

`backend/tests/fixtures/exportVinoflow.js` :

```js
// Fichier type produit par l'export VinoFlow (utils/exportCsv.ts, buildCellarCsv) :
// BOM, séparateur ;, CRLF, virgule décimale, colonnes calculées en fin de ligne.
// L'en-tête doit rester identique à CSV_HEADERS côté front.
export const EXPORT_HEADER = "Identifiant;Nom;Cuvée;Producteur;Millésime;Région;Appellation;Pays;Type;Cépages;Format;Favori;Apogée début;Apogée fin;Prix d'achat (€);Bouteilles;Description;Accords mets;Stock;Apogée;Fenêtre estimée";
export const WINE_A_ID = '11111111-1111-4111-8111-111111111111';
export const WINE_B_ID = '22222222-2222-4222-8222-222222222222';
export const exportCsv = '﻿' + [
  EXPORT_HEADER,
  `${WINE_A_ID};Grand Vin;;"Château, Test";2018;Bordeaux;Pauillac;France;Rouge;"Merlot; Cabernet";750ml;Oui;2025;2035;25,00;;"Dit ""superbe""";agneau;2;À Boire;2025-2035`,
  `${WINE_B_ID};Petit Vin;Cuvée Lune;Domaine Y;2020;Loire;Vouvray;France;Blanc;Chenin;750ml;Non;;;;;"Sur deux lignes
fin";"poisson; fromage";1;À Boire;2022-2027`,
].join('\r\n');
```

- [ ] **Step 7: Commit**

```bash
git add utils/exportCsv.ts utils/exportCsv.test.ts pages/Settings.tsx backend/tests/fixtures/exportVinoflow.js
git commit -m "Export CSV au format aller-retour : identifiant, point-virgule, apogée et prix réimportables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lecture CSV tolérante (`parse.js`)

**Files:**
- Create: `backend/src/csvImport/parse.js`
- Test: `backend/tests/unit/csvImport.parse.test.js`

**Interfaces:**
- Produces: `class CsvFormatError extends Error`, `parseCsv(text: string) → { headers: string[], rows: { line: number, cells: string[] }[] }` — `line` = numéro de ligne du tableur (en-tête = 1, un retour à la ligne dans une cellule ne compte pas), cellules et en-têtes trimés, lignes entièrement vides omises (numérotation conservée). Fichier vide → `CsvFormatError('Le fichier est vide.')`.

- [ ] **Step 1: Écrire le test**

```js
import { describe, it, expect } from 'vitest';
import { parseCsv, CsvFormatError } from '../../src/csvImport/parse.js';

describe('parseCsv', () => {
  it('BOM, point-virgule et CRLF', () => {
    expect(parseCsv('﻿Identifiant;Nom\r\nabc;Vin\r\n')).toEqual({
      headers: ['Identifiant', 'Nom'],
      rows: [{ line: 2, cells: ['abc', 'Vin'] }],
    });
  });

  it('virgule détectée sur l’en-tête, guillemets', () => {
    expect(parseCsv('Identifiant,Nom\nx,"Château, Test"').rows).toEqual([{ line: 2, cells: ['x', 'Château, Test'] }]);
  });

  it('virgule entre guillemets dans l’en-tête : séparateur ; conservé', () => {
    expect(parseCsv('Nom;"Prix, €"\na;1,5').rows[0].cells).toEqual(['a', '1,5']);
  });

  it('guillemets doublés et retour à la ligne dans une cellule (une seule ligne du tableur)', () => {
    expect(parseCsv('A;B\n1;"Dit ""super""\nfin"\n2;z').rows).toEqual([
      { line: 2, cells: ['1', 'Dit "super"\nfin'] },
      { line: 3, cells: ['2', 'z'] },
    ]);
  });

  it('lignes vides omises, numérotation conservée', () => {
    expect(parseCsv('A;B\n1;x\n;\n\n3;y').rows.map((r) => r.line)).toEqual([2, 5]);
  });

  it('espaces autour des valeurs supprimés', () => {
    expect(parseCsv(' A ; B \n a ; b ')).toEqual({ headers: ['A', 'B'], rows: [{ line: 2, cells: ['a', 'b'] }] });
  });

  it('fichier vide refusé', () => {
    expect(() => parseCsv('﻿  \r\n')).toThrow(CsvFormatError);
  });
});
```

- [ ] **Step 2: Lancer, il échoue**

Run: `cd backend && npx vitest run tests/unit/csvImport.parse.test.js`
Expected: FAIL — module `parse.js` introuvable.

- [ ] **Step 3: Implémenter `backend/src/csvImport/parse.js`**

```js
// Lecture d'un CSV issu de l'export VinoFlow, éventuellement réenregistré par
// Excel ou Numbers : BOM, séparateur ; ou , (détecté sur l'en-tête), guillemets
// doublés, retours à la ligne dans une cellule, CRLF.

export class CsvFormatError extends Error {}

// Séparateur le plus fréquent sur la ligne d'en-tête (hors guillemets).
const detectDelimiter = (text) => {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === '\n' || c === '\r') break;
    else if (c === ';') semicolons += 1;
    else if (c === ',') commas += 1;
  }
  return semicolons >= commas ? ';' : ',';
};

const parseRecords = (text, delimiter) => {
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); records.push(row); }
  return records;
};

export const parseCsv = (input) => {
  const text = String(input ?? '').replace(/^﻿/, '');
  if (!text.trim()) throw new CsvFormatError('Le fichier est vide.');
  const [header, ...body] = parseRecords(text, detectDelimiter(text));
  const rows = [];
  body.forEach((cells, index) => {
    if (cells.every((c) => c.trim() === '')) return;
    rows.push({ line: index + 2, cells: cells.map((c) => c.trim()) });
  });
  return { headers: header.map((h) => h.trim()), rows };
};
```

- [ ] **Step 4: Lancer, il passe**

Run: `cd backend && npx vitest run tests/unit/csvImport.parse.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/csvImport/parse.js backend/tests/unit/csvImport.parse.test.js
git commit -m "Import CSV : lecture tolérante (BOM, ; ou ,, guillemets, CRLF)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lignes → patches typés (`columns.js`, `rows.js`)

**Files:**
- Create: `backend/src/csvImport/columns.js`, `backend/src/csvImport/rows.js`
- Test: `backend/tests/unit/csvImport.rows.test.js`

**Interfaces:**
- Consumes: `parseCsv`, `CsvFormatError` (Tâche 2) ; fixture `exportCsv`, `WINE_A_ID`, `WINE_B_ID` (Tâche 1).
- Produces (`columns.js`): `normalizeHeader(s)`, `COLUMNS`, `LIST_FIELDS`, `WINE_FIELDS` (ordre des champs de fiche), `WINE_COLUMNS` (champ → colonne SQL), `MAX_ROWS = 5000`.
- Produces (`rows.js`): `toPatches({ headers, rows }, { currentYear? }) → { patches: Patch[], errors: { line, message }[] }` ; lève `CsvFormatError` sans colonne Identifiant.
  `Patch = { line: number, id: string|null, fields: { [field]: value|null }, peak?: 'clear' | { start?: number, end?: number }, price?: number, bottles?: number }`. Champs de fiche : `name, cuvee, producer, vintage, region, appellation, country, type, grapeVarieties, format, isFavorite, sensoryDescription, suggestedFoodPairings`. Effacement (`-`) : texte/vintage/type → `null`, listes → `[]`, favori → `false`.

- [ ] **Step 1: Écrire le test**

```js
import { describe, it, expect } from 'vitest';
import { parseCsv, CsvFormatError } from '../../src/csvImport/parse.js';
import { toPatches } from '../../src/csvImport/rows.js';
import { exportCsv, WINE_A_ID, WINE_B_ID } from '../fixtures/exportVinoflow.js';

const ID = '11111111-1111-4111-8111-111111111111';
const HEADERS = ['Identifiant', 'Nom', 'Producteur', 'Millésime', 'Appellation', 'Type', 'Cépages', 'Favori',
  'Apogée début', 'Apogée fin', "Prix d'achat (€)", 'Bouteilles', 'Stock'];
// Construit une table d'une ligne par objet { en-tête: valeur }.
const table = (...objs) => ({
  headers: HEADERS,
  rows: objs.map((o, i) => ({ line: i + 2, cells: HEADERS.map((h) => o[h] ?? '') })),
});
const run = (...objs) => toPatches(table(...objs), { currentYear: 2026 });

describe('toPatches', () => {
  it('fichier sans colonne Identifiant refusé', () => {
    expect(() => toPatches({ headers: ['Nom', 'Producteur'], rows: [] })).toThrow(CsvFormatError);
    expect(() => toPatches({ headers: ['Nom'], rows: [] })).toThrow(/Réexporte ta cave/);
  });

  it('en-têtes normalisés (casse, accents, apostrophe typographique)', () => {
    const { patches } = toPatches({ headers: ['IDENTIFIANT', 'Millesime', 'prix d’achat'], rows: [{ line: 2, cells: [ID, '2019', '12'] }] }, { currentYear: 2026 });
    expect(patches[0]).toMatchObject({ id: ID, fields: { vintage: 2019 }, price: 12 });
  });

  it('cellule vide = champ absent ; colonnes calculées ignorées', () => {
    const { patches, errors } = run({ Identifiant: ID, Stock: '12' });
    expect(errors).toEqual([]);
    expect(patches).toEqual([{ line: 2, id: ID, fields: {} }]);
  });

  it('conversions : type, millésime, listes, favori, prix FR, bouteilles', () => {
    const { patches } = run(
      { Identifiant: ID, Type: 'Rosé', Millésime: '2018', Cépages: 'Merlot; Cabernet ;', Favori: 'oui', "Prix d'achat (€)": '14,50' },
      { Nom: 'Nouveau', Producteur: 'Dom', Type: 'red', "Prix d'achat (€)": '1 234,5 €', Bouteilles: '3' },
    );
    expect(patches[0]).toMatchObject({ fields: { type: 'ROSE', vintage: 2018, grapeVarieties: ['Merlot', 'Cabernet'], isFavorite: true }, price: 14.5 });
    expect(patches[1]).toMatchObject({ id: null, fields: { name: 'Nouveau', producer: 'Dom', type: 'RED' }, price: 1234.5, bottles: 3 });
  });

  it('« - » efface', () => {
    const { patches } = run({ Identifiant: ID, Appellation: '-', Cépages: '-', Favori: '-', 'Apogée début': '-', 'Apogée fin': '-' });
    expect(patches[0]).toEqual({ line: 2, id: ID, fields: { appellation: null, grapeVarieties: [], isFavorite: false }, peak: 'clear' });
  });

  it('apogée partielle conservée telle quelle (complétée par le plan)', () => {
    expect(run({ Identifiant: ID, 'Apogée début': '2025' }).patches[0].peak).toEqual({ start: 2025 });
  });

  it('erreurs par ligne : la ligne est écartée, les autres passent', () => {
    const { patches, errors } = run(
      { Identifiant: ID, Nom: '-' },
      { Nom: 'Sans producteur' },
      { Identifiant: 'pas-un-uuid' },
      { Identifiant: ID, Millésime: '20xx' },
      { Identifiant: ID, Millésime: '1700' },
      { Identifiant: ID, Type: 'Orange' },
      { Identifiant: ID, "Prix d'achat (€)": '-12' },
      { Identifiant: ID, "Prix d'achat (€)": '-' },
      { Identifiant: ID, 'Apogée début': '2030', 'Apogée fin': '2025' },
      { Identifiant: ID, 'Apogée début': '-', 'Apogée fin': '2030' },
      { Nom: 'X', Producteur: 'Y', Bouteilles: '0' },
      { Nom: 'X', Producteur: 'Y', Bouteilles: '100' },
      { Identifiant: ID, Favori: 'peut-être' },
      { Identifiant: ID, Appellation: 'Valide' },
    );
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(errors[0].message).toMatch(/nom ne peut pas être effacé/i);
    expect(errors[1].message).toMatch(/Nom et Producteur/);
    expect(errors[5].message).toMatch(/Type inconnu/);
    expect(patches).toEqual([{ line: 15, id: ID, fields: { appellation: 'Valide' } }]);
  });

  it('relit le fichier type de l’export sans erreur', () => {
    const { patches, errors } = toPatches(parseCsv(exportCsv), { currentYear: 2026 });
    expect(errors).toEqual([]);
    expect(patches.map((p) => p.id)).toEqual([WINE_A_ID, WINE_B_ID]);
    expect(patches[0]).toMatchObject({
      fields: { name: 'Grand Vin', producer: 'Château, Test', vintage: 2018, type: 'RED', grapeVarieties: ['Merlot', 'Cabernet'], isFavorite: true, sensoryDescription: 'Dit "superbe"' },
      peak: { start: 2025, end: 2035 }, price: 25,
    });
    expect(patches[1].fields).toMatchObject({ cuvee: 'Cuvée Lune', sensoryDescription: 'Sur deux lignes\nfin', suggestedFoodPairings: ['poisson', 'fromage'] });
    expect(patches[1]).not.toHaveProperty('peak');
  });
});
```

- [ ] **Step 2: Lancer, il échoue**

Run: `cd backend && npx vitest run tests/unit/csvImport.rows.test.js`
Expected: FAIL — module `rows.js` introuvable.

- [ ] **Step 3: Implémenter `backend/src/csvImport/columns.js`**

```js
// Correspondance avec l'export (utils/exportCsv.ts, CSV_HEADERS). Les en-têtes
// sont comparés normalisés (casse, accents, ponctuation ignorés). Les colonnes
// calculées (Stock, Apogée, Fenêtre estimée) n'y figurent pas : ignorées.
export const normalizeHeader = (value) => String(value)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

export const COLUMNS = {
  identifiant: 'id', nom: 'name', cuvee: 'cuvee', producteur: 'producer', millesime: 'vintage',
  region: 'region', appellation: 'appellation', pays: 'country', type: 'type', cepages: 'grapeVarieties',
  format: 'format', favori: 'isFavorite', favoris: 'isFavorite', apogeedebut: 'peakStart', apogeefin: 'peakEnd',
  prixdachat: 'price', bouteilles: 'bottles', description: 'sensoryDescription', accordsmets: 'suggestedFoodPairings',
};

// Champs de la fiche, dans l'ordre d'affichage de l'aperçu, et leur colonne SQL.
export const WINE_COLUMNS = {
  name: 'name', cuvee: 'cuvee', producer: 'producer', vintage: 'vintage', region: 'region',
  appellation: 'appellation', country: 'country', type: 'type', grapeVarieties: 'grape_varieties',
  format: 'format', isFavorite: 'is_favorite', sensoryDescription: 'sensory_description',
  suggestedFoodPairings: 'suggested_food_pairings',
};
export const WINE_FIELDS = Object.keys(WINE_COLUMNS);
export const LIST_FIELDS = ['grapeVarieties', 'suggestedFoodPairings'];
export const TEXT_FIELDS = ['name', 'cuvee', 'producer', 'region', 'appellation', 'country', 'format', 'sensoryDescription'];

export const TYPES = {
  rouge: 'RED', red: 'RED', blanc: 'WHITE', white: 'WHITE', rose: 'ROSE',
  petillant: 'SPARKLING', sparkling: 'SPARKLING', dessert: 'DESSERT', fortifie: 'FORTIFIED', fortified: 'FORTIFIED',
};

export const CLEAR = '-';
export const MAX_ROWS = 5000;
```

- [ ] **Step 4: Implémenter `backend/src/csvImport/rows.js`**

```js
import { CsvFormatError } from './parse.js';
import { COLUMNS, LIST_FIELDS, TEXT_FIELDS, TYPES, CLEAR, normalizeHeader } from './columns.js';

// Chaque ligne du tableur → patch typé (seuls les champs renseignés), ou une
// erreur rattachée à son numéro de ligne. Règles : cellule vide = ne pas
// toucher, « - » = effacer.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_ID = 'Ce fichier ne contient pas la colonne Identifiant. Réexporte ta cave depuis VinoFlow puis modifie ce nouveau fichier.';
const LABELS = { vintage: 'Millésime', peakStart: 'Apogée début', peakEnd: 'Apogée fin', bottles: 'Bouteilles' };

class LineError extends Error {}

// « 1 234,50 € » → 1234.5 (espaces, insécables compris, et symbole € ignorés).
const toNumber = (raw, label) => {
  const n = Number(raw.replace(/[\s€]/g, '').replace(',', '.'));
  if (raw.trim() === '' || !Number.isFinite(n)) throw new LineError(`${label} : « ${raw} » n’est pas un nombre`);
  return n;
};

const toInteger = (raw, field, min, max) => {
  const n = toNumber(raw, LABELS[field]);
  if (!Number.isInteger(n) || n < min || n > max) throw new LineError(`${LABELS[field]} invalide : « ${raw} » (entre ${min} et ${max})`);
  return n;
};

const toBoolean = (raw) => {
  const v = normalizeHeader(raw);
  if (['oui', 'o', 'yes', 'true', '1'].includes(v)) return true;
  if (['non', 'n', 'no', 'false', '0'].includes(v)) return false;
  throw new LineError(`Favori : « ${raw} » (Oui ou Non attendu)`);
};

const toPatch = (fields, cells, line, currentYear) => {
  const patch = { line, id: null, fields: {} };
  const peak = {};
  fields.forEach((field, i) => {
    const raw = (cells[i] ?? '').trim();
    if (!field || raw === '') return;
    const clear = raw === CLEAR;
    if (field === 'id') {
      if (!UUID.test(raw)) throw new LineError(`Identifiant invalide : « ${raw} »`);
      patch.id = raw.toLowerCase();
    } else if (field === 'name' || field === 'producer') {
      if (clear) throw new LineError(`Le ${field === 'name' ? 'nom' : 'producteur'} ne peut pas être effacé`);
      patch.fields[field] = raw;
    } else if (TEXT_FIELDS.includes(field)) {
      patch.fields[field] = clear ? null : raw;
    } else if (LIST_FIELDS.includes(field)) {
      patch.fields[field] = clear ? [] : raw.split(';').map((s) => s.trim()).filter(Boolean);
    } else if (field === 'vintage') {
      patch.fields.vintage = clear ? null : toInteger(raw, 'vintage', 1800, currentYear + 1);
    } else if (field === 'type') {
      const type = clear ? null : TYPES[normalizeHeader(raw)];
      if (type === undefined) throw new LineError(`Type inconnu : « ${raw} » (Rouge, Blanc, Rosé, Pétillant, Dessert, Fortifié)`);
      patch.fields.type = type;
    } else if (field === 'isFavorite') {
      patch.fields.isFavorite = clear ? false : toBoolean(raw);
    } else if (field === 'peakStart' || field === 'peakEnd') {
      peak[field] = clear ? null : toInteger(raw, field, 1800, 2200);
    } else if (field === 'price') {
      if (clear) throw new LineError('Un prix d’achat ne peut pas être effacé');
      const price = toNumber(raw, 'Prix d’achat');
      if (price < 0) throw new LineError(`Prix d’achat négatif : « ${raw} »`);
      patch.price = Math.round(price * 100) / 100;
    } else if (field === 'bottles' && !clear) {
      patch.bottles = toInteger(raw, 'bottles', 1, 99);
    }
  });

  if ('peakStart' in peak || 'peakEnd' in peak) {
    const { peakStart: start, peakEnd: end } = peak;
    if (start === null || end === null) {
      if (start !== null || end !== null) throw new LineError('Pour effacer l’apogée, mets « - » dans Apogée début et Apogée fin');
      patch.peak = 'clear';
    } else {
      if (start !== undefined && end !== undefined && start > end) throw new LineError('Apogée début après Apogée fin');
      patch.peak = { ...(start !== undefined && { start }), ...(end !== undefined && { end }) };
    }
  }
  if (!patch.id && (!patch.fields.name || !patch.fields.producer)) {
    throw new LineError('Nouveau vin : Nom et Producteur sont obligatoires');
  }
  return patch;
};

export const toPatches = ({ headers, rows }, { currentYear = new Date().getFullYear() } = {}) => {
  const fields = headers.map((h) => COLUMNS[normalizeHeader(h)] || null);
  if (!fields.includes('id')) throw new CsvFormatError(MISSING_ID);
  const patches = [];
  const errors = [];
  for (const { line, cells } of rows) {
    try {
      patches.push(toPatch(fields, cells, line, currentYear));
    } catch (error) {
      if (!(error instanceof LineError)) throw error;
      errors.push({ line, message: error.message });
    }
  }
  return { patches, errors };
};
```

- [ ] **Step 5: Lancer, il passe**

Run: `cd backend && npx vitest run tests/unit/csvImport.rows.test.js`
Expected: PASS (8 tests). Si `toEqual` sur l'objet `peak` échoue à cause d'une clé `undefined`, corriger l'implémentation (le spread conditionnel n'ajoute pas la clé), pas le test.

- [ ] **Step 6: Commit**

```bash
git add backend/src/csvImport/columns.js backend/src/csvImport/rows.js backend/tests/unit/csvImport.rows.test.js
git commit -m "Import CSV : conversion des lignes (vide = ne pas toucher, « - » = effacer, erreurs par ligne)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Comparaison avec la cave (`plan.js`)

**Files:**
- Create: `backend/src/csvImport/plan.js`
- Test: `backend/tests/unit/csvImport.plan.test.js`

**Interfaces:**
- Consumes: `Patch` (Tâche 3), `WINE_FIELDS`, `LIST_FIELDS` (Tâche 3).
- Consumes: `cellar: CellarWine[]` où `CellarWine = { id, name, cuvee, producer, vintage, region, appellation, country, type, grapeVarieties, format, isFavorite, sensoryDescription, suggestedFoodPairings, peakStart, peakEnd, bottles: { purchasePrice: number|null }[] }` — **bouteilles en stock seulement** (fourni par `loadCellar`, Tâche 5).
- Produces: `buildPlan(patches, cellar, errors = []) → Plan` :

```
Plan = {
  updates:  [{ line, wineId, label, changes: [{ field, before, after }] }],
  peaks:    [{ line, wineId, label, before: {start,end}|null, after: {start,end}|null }],
  prices:   [{ line, wineId, label, price, bottleCount }],
  creates:  [{ line, label, fields, peak: {start,end}|null, price: number|null, bottles: number }],
  unchanged: number, errors: [{ line, message }], warnings: [{ line, message }],
  changeCount: number, planHash: string (sha256 hex de updates+peaks+prices+creates)
}
```

- [ ] **Step 1: Écrire le test**

```js
import { describe, it, expect } from 'vitest';
import { buildPlan } from '../../src/csvImport/plan.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const cellar = () => [
  {
    id: A, name: 'Grand Vin', cuvee: null, producer: 'Château Test', vintage: 2018, region: 'Bordeaux',
    appellation: 'Bordeaux', country: 'France', type: 'RED', grapeVarieties: ['Merlot'], format: '750ml',
    isFavorite: false, sensoryDescription: '', suggestedFoodPairings: null, peakStart: null, peakEnd: null,
    bottles: [{ purchasePrice: 20 }, { purchasePrice: null }, { purchasePrice: 0 }],
  },
  {
    id: B, name: 'Petit Vin', cuvee: 'Lune', producer: 'Domaine Y', vintage: 2020, region: 'Loire',
    appellation: 'Vouvray', country: 'France', type: 'WHITE', grapeVarieties: [], format: '750ml',
    isFavorite: true, sensoryDescription: null, suggestedFoodPairings: [], peakStart: 2022, peakEnd: 2027,
    bottles: [{ purchasePrice: 20 }, { purchasePrice: 30 }],
  },
];
const patch = (line, id, extra = {}) => ({ line, id, fields: {}, ...extra });

describe('buildPlan', () => {
  it('fichier identique à la cave : aucun changement (null = vide, listes égales)', () => {
    const plan = buildPlan([
      patch(2, A, { fields: { name: 'Grand Vin', vintage: 2018, grapeVarieties: ['Merlot'], isFavorite: false, suggestedFoodPairings: [] } }),
      patch(3, B, { fields: { cuvee: 'Lune', grapeVarieties: [] }, peak: { start: 2022, end: 2027 }, price: 25 }),
    ], cellar());
    expect(plan).toMatchObject({ updates: [], peaks: [], prices: [], creates: [], unchanged: 2, warnings: [], changeCount: 0 });
  });

  it('changements champ par champ, « - » compris', () => {
    const plan = buildPlan([patch(2, B, { fields: { appellation: 'Montlouis', cuvee: null } })], cellar());
    expect(plan.updates).toEqual([{
      line: 2, wineId: B, label: 'Petit Vin Lune 2020',
      changes: [{ field: 'cuvee', before: 'Lune', after: null }, { field: 'appellation', before: 'Vouvray', after: 'Montlouis' }],
    }]);
    expect(plan.changeCount).toBe(1);
  });

  it('prix : seulement les bouteilles sans prix ; prix déjà connus → avertissement si différent', () => {
    const plan = buildPlan([patch(2, A, { price: 15 }), patch(3, B, { price: 30 })], cellar());
    expect(plan.prices).toEqual([{ line: 2, wineId: A, label: 'Grand Vin 2018', price: 15, bottleCount: 2 }]);
    expect(plan.warnings).toEqual([{ line: 3, message: expect.stringMatching(/déjà connu/) }]);
  });

  it('apogée : saisie, partielle complétée, effacement, inchangée', () => {
    const set = buildPlan([patch(2, A, { peak: { start: 2025, end: 2035 } })], cellar());
    expect(set.peaks).toEqual([{ line: 2, wineId: A, label: 'Grand Vin 2018', before: null, after: { start: 2025, end: 2035 } }]);
    expect(buildPlan([patch(2, B, { peak: { start: 2024 } })], cellar()).peaks[0].after).toEqual({ start: 2024, end: 2027 });
    expect(buildPlan([patch(2, B, { peak: 'clear' })], cellar()).peaks[0].after).toBeNull();
    expect(buildPlan([patch(2, A, { peak: 'clear' })], cellar())).toMatchObject({ peaks: [], unchanged: 1 });
  });

  it('ligne à moitié invalide : toute la ligne est écartée', () => {
    const plan = buildPlan([patch(2, A, { fields: { appellation: 'Pauillac' }, peak: { start: 2025 } })], cellar());
    expect(plan.updates).toEqual([]);
    expect(plan.errors).toEqual([{ line: 2, message: expect.stringMatching(/Apogée début et Apogée fin/) }]);
    const inverted = buildPlan([patch(3, B, { peak: { start: 2030 } })], cellar());
    expect(inverted.errors[0].message).toMatch(/après/);
  });

  it('identifiant inconnu ou en double', () => {
    const unknown = '33333333-3333-4333-8333-333333333333';
    const plan = buildPlan([patch(2, unknown), patch(3, A, { fields: { region: 'X' } }), patch(4, A)], cellar());
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(plan.errors[0].message).toMatch(/inconnu/);
    expect(plan.errors[1].message).toMatch(/plusieurs fois/);
    expect(plan.updates).toEqual([]);
  });

  it('création : bouteilles par défaut, doublon probable signalé, apogée partielle refusée', () => {
    const plan = buildPlan([
      patch(2, null, { fields: { name: 'grand vin', producer: 'CHÂTEAU TEST', vintage: 2018 } }),
      patch(3, null, { fields: { name: 'Neuf', producer: 'Dom' }, price: 12.5, bottles: 3, peak: { start: 2026, end: 2030 } }),
      patch(4, null, { fields: { name: 'Bancal', producer: 'Dom' }, peak: { end: 2030 } }),
    ], cellar());
    expect(plan.creates).toEqual([
      { line: 2, label: 'grand vin 2018', fields: { name: 'grand vin', producer: 'CHÂTEAU TEST', vintage: 2018 }, peak: null, price: null, bottles: 1 },
      { line: 3, label: 'Neuf', fields: { name: 'Neuf', producer: 'Dom' }, peak: { start: 2026, end: 2030 }, price: 12.5, bottles: 3 },
    ]);
    expect(plan.warnings).toEqual([{ line: 2, message: expect.stringMatching(/existe peut-être déjà/) }]);
    expect(plan.errors.map((e) => e.line)).toEqual([4]);
  });

  it('erreurs de lecture reprises et triées ; empreinte stable', () => {
    const patches = [patch(3, A, { price: 15 })];
    const a = buildPlan(patches, cellar(), [{ line: 5, message: 'x' }, { line: 2, message: 'y' }]);
    expect(a.errors.map((e) => e.line)).toEqual([2, 5]);
    expect(buildPlan(patches, cellar()).planHash).toBe(a.planHash);
    expect(buildPlan([patch(3, A, { price: 16 })], cellar()).planHash).not.toBe(a.planHash);
    expect(a.planHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Lancer, il échoue**

Run: `cd backend && npx vitest run tests/unit/csvImport.plan.test.js`
Expected: FAIL — module `plan.js` introuvable.

- [ ] **Step 3: Implémenter `backend/src/csvImport/plan.js`**

```js
import { createHash } from 'node:crypto';
import { WINE_FIELDS, LIST_FIELDS } from './columns.js';

// Compare les patches du fichier à la cave et décrit ce que l'import ferait.
// Pur : la même entrée donne le même plan et la même empreinte (planHash),
// ce qui permet de vérifier à l'application que la cave n'a pas bougé.

const normalize = (field, value) => {
  if (LIST_FIELDS.includes(field)) return (value || []).map((s) => String(s).trim()).filter(Boolean);
  if (field === 'isFavorite') return Boolean(value);
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identity = (w) => [w.name, w.producer, w.vintage].map((v) => String(v ?? '').trim().toLowerCase()).join('|');
const wineLabel = (w) => [w.name, w.cuvee, w.vintage].filter(Boolean).join(' ');
const MISSING_BOUND = 'Apogée : renseigne Apogée début et Apogée fin';

export const hashPlan = ({ updates, peaks, prices, creates }) =>
  createHash('sha256').update(JSON.stringify({ updates, peaks, prices, creates })).digest('hex');

const planUpdate = (plan, p, wine) => {
  const label = wineLabel(wine);
  const changes = WINE_FIELDS.filter((f) => f in p.fields)
    .map((field) => ({ field, before: normalize(field, wine[field]), after: normalize(field, p.fields[field]) }))
    .filter((c) => !same(c.before, c.after));

  let peak = null;
  if (p.peak) {
    const before = wine.peakStart != null && wine.peakEnd != null ? { start: wine.peakStart, end: wine.peakEnd } : null;
    let after = null;
    if (p.peak !== 'clear') {
      const start = p.peak.start ?? before?.start;
      const end = p.peak.end ?? before?.end;
      if (start == null || end == null) return plan.errors.push({ line: p.line, message: MISSING_BOUND });
      if (start > end) return plan.errors.push({ line: p.line, message: 'Apogée début après Apogée fin' });
      after = { start, end };
    }
    if (!same(before, after)) peak = { line: p.line, wineId: wine.id, label, before, after };
  }

  let price = null;
  if (p.price !== undefined && wine.bottles.length > 0) {
    const missing = wine.bottles.filter((b) => !b.purchasePrice || b.purchasePrice <= 0).length;
    if (missing > 0) {
      price = { line: p.line, wineId: wine.id, label, price: p.price, bottleCount: missing };
    } else {
      const avg = Math.round((wine.bottles.reduce((s, b) => s + b.purchasePrice, 0) / wine.bottles.length) * 100) / 100;
      if (avg !== p.price) plan.warnings.push({ line: p.line, message: 'Prix d’achat déjà connu pour toutes les bouteilles : ignoré' });
    }
  }

  if (changes.length) plan.updates.push({ line: p.line, wineId: wine.id, label, changes });
  if (peak) plan.peaks.push(peak);
  if (price) plan.prices.push(price);
  if (!changes.length && !peak && !price) plan.unchanged += 1;
};

const planCreate = (plan, p, identities) => {
  let peak = null;
  if (p.peak && p.peak !== 'clear') {
    if (p.peak.start == null || p.peak.end == null) return plan.errors.push({ line: p.line, message: MISSING_BOUND });
    peak = { start: p.peak.start, end: p.peak.end };
  }
  const label = wineLabel(p.fields);
  const key = identity(p.fields);
  if (identities.has(key)) plan.warnings.push({ line: p.line, message: `${label} existe peut-être déjà dans la cave` });
  identities.add(key);
  plan.creates.push({ line: p.line, label, fields: p.fields, peak, price: p.price ?? null, bottles: p.bottles ?? 1 });
};

export const buildPlan = (patches, cellar, errors = []) => {
  const plan = { updates: [], peaks: [], prices: [], creates: [], unchanged: 0, errors: [...errors], warnings: [] };
  const byId = new Map(cellar.map((w) => [w.id, w]));
  const identities = new Set(cellar.map(identity));
  const idCount = new Map();
  for (const p of patches) if (p.id) idCount.set(p.id, (idCount.get(p.id) || 0) + 1);

  for (const p of patches) {
    if (!p.id) { planCreate(plan, p, identities); continue; }
    if (idCount.get(p.id) > 1) { plan.errors.push({ line: p.line, message: 'Identifiant présent plusieurs fois dans le fichier' }); continue; }
    const wine = byId.get(p.id);
    if (!wine) { plan.errors.push({ line: p.line, message: 'Identifiant inconnu : ce vin n’existe pas (ou plus) dans la cave' }); continue; }
    planUpdate(plan, p, wine);
  }

  plan.errors.sort((a, b) => a.line - b.line);
  plan.warnings.sort((a, b) => a.line - b.line);
  plan.changeCount = plan.updates.length + plan.peaks.length + plan.prices.length + plan.creates.length;
  plan.planHash = hashPlan(plan);
  return plan;
};
```

- [ ] **Step 4: Lancer, il passe**

Run: `cd backend && npx vitest run tests/unit/csvImport.plan.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/csvImport/plan.js backend/tests/unit/csvImport.plan.test.js
git commit -m "Import CSV : plan des changements (prix manquants seulement, apogées, créations, empreinte)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Application en transaction et route `POST /api/import/csv`

**Files:**
- Create: `backend/src/csvImport/apply.js`
- Modify: `backend/src/routes/import.js` (imports en tête + nouvelle route en fin de fichier, avant `export default`)
- Modify: `backend/src/app.js:37` (parseur JSON global)
- Test: `backend/tests/api/importCsv.test.js`

**Interfaces:**
- Consumes: `parseCsv`, `CsvFormatError`, `toPatches`, `buildPlan`, `WINE_COLUMNS`, `MAX_ROWS`.
- Produces: `loadCellar(db) → CellarWine[]` (bouteilles en stock), `applyPlan(db, plan, userId) → { updated, peaks, pricedBottles, created, createdBottles }`.
- Produces (HTTP) : `POST /api/import/csv` `{ csv, dryRun?, planHash? }` → `200 { plan }` (aperçu, défaut si `dryRun !== false`) | `200 { applied }` | `400 { error }` | `409 { error }` | `413 { error }` | `500 { error }`.

- [ ] **Step 1: Écrire le test d'API**

`backend/tests/api/importCsv.test.js` :

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, authed, bootstrapUser, hasDb, pool, resetData } from './helpers.js';

const HEADER = "Identifiant;Nom;Producteur;Millésime;Appellation;Apogée début;Apogée fin;Prix d'achat (€);Bouteilles";
const csv = (...rows) => '﻿' + [HEADER, ...rows].join('\r\n');

describe.skipIf(!hasDb)('API import CSV', () => {
  let client;
  let a;
  let b;
  beforeEach(async () => {
    await resetData();
    client = authed((await bootstrapUser()).access_token);
    a = (await client.post('/api/wines', { name: 'Grand Vin', producer: 'Château Test', vintage: 2018, type: 'RED', appellation: 'Bordeaux' })).body;
    b = (await client.post('/api/wines', { name: 'Petit Vin', producer: 'Domaine Y', vintage: 2020, type: 'WHITE' })).body;
    await client.post('/api/bottles', { wineId: a.id, purchasePrice: 25 });
    await client.post('/api/bottles', { wineId: a.id });
    await client.post('/api/bottles', { wineId: b.id, purchasePrice: 10 });
  });
  afterAll(() => pool.end());

  const wine = async (id) => (await pool.query('SELECT * FROM wines WHERE id = $1', [id])).rows[0];
  const count = async (table) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
  const edits = () => csv(
    `${a.id};;;;Pauillac;2025;2035;20;`,
    ';Nouveau;Domaine Z;2021;;;;12,5;3',
  );
  const preview = async (text) => client.post('/api/import/csv', { csv: text, dryRun: true });

  it('authentification requise', async () => {
    expect((await api().post('/api/import/csv').send({ csv: edits(), dryRun: true })).status).toBe(401);
  });

  it('l’aperçu décrit les changements sans rien écrire', async () => {
    const res = await preview(edits());
    expect(res.status).toBe(200);
    expect(res.body.plan).toMatchObject({ changeCount: 4, errors: [] });
    expect(res.body.plan.prices).toEqual([expect.objectContaining({ wineId: a.id, price: 20, bottleCount: 1 })]);
    expect((await wine(a.id)).appellation).toBe('Bordeaux');
    expect(await count('wines')).toBe(2);
    expect(await count('bottles')).toBe(3);
  });

  it('application : fiche, apogée USER, prix manquant seulement, nouveau vin + bouteilles + journal', async () => {
    const { plan } = (await preview(edits())).body;
    const res = await client.post('/api/import/csv', { csv: edits(), dryRun: false, planHash: plan.planHash });
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual({ updated: 1, peaks: 1, pricedBottles: 1, created: 1, createdBottles: 3 });

    expect(await wine(a.id)).toMatchObject({ appellation: 'Pauillac', peak_start: 2025, peak_end: 2035, peak_source: 'USER', peak_confidence: 'HIGH' });
    const prices = (await pool.query('SELECT purchase_price FROM bottles WHERE wine_id = $1 ORDER BY purchase_price', [a.id])).rows.map((r) => r.purchase_price);
    expect(prices).toEqual([20, 25]);

    const created = (await pool.query("SELECT * FROM wines WHERE name = 'Nouveau'")).rows[0];
    expect(created).toMatchObject({ producer: 'Domaine Z', vintage: 2021 });
    const newBottles = (await pool.query('SELECT purchase_price, location FROM bottles WHERE wine_id = $1', [created.id])).rows;
    expect(newBottles).toHaveLength(3);
    expect(newBottles.every((r) => r.purchase_price === 12.5 && r.location === 'Non trié')).toBe(true);
    const journal = (await pool.query('SELECT * FROM journal WHERE wine_id = $1', [created.id])).rows;
    expect(journal).toEqual([expect.objectContaining({ type: 'IN', quantity: 3, description: 'Import CSV', wine_name: 'Nouveau' })]);
  });

  it('réimporter un fichier déjà appliqué : zéro changement', async () => {
    // B : prix déjà connu et identique (10,00) → ni changement ni avertissement.
    const file = csv(`${a.id};Grand Vin;Château Test;2018;Pauillac;2025;2035;;`, `${b.id};Petit Vin;Domaine Y;2020;;;;10,00;`);
    const first = (await preview(file)).body.plan;
    await client.post('/api/import/csv', { csv: file, dryRun: false, planHash: first.planHash });
    const again = (await preview(file)).body.plan;
    expect(again).toMatchObject({ changeCount: 0, unchanged: 2, errors: [], warnings: [] });
  });

  it('cave modifiée entre l’aperçu et l’application : 409, rien n’est écrit', async () => {
    const { plan } = (await preview(edits())).body;
    await client.put(`/api/wines/${a.id}`, { appellation: 'Margaux' });
    const res = await client.post('/api/import/csv', { csv: edits(), dryRun: false, planHash: plan.planHash });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/relance/);
    expect((await wine(a.id)).appellation).toBe('Margaux');
    expect(await count('wines')).toBe(2);
  });

  it('erreur SQL en cours d’application : rien n’est écrit', async () => {
    // Le caractère NUL est refusé par Postgres : la création échoue après la mise à jour.
    const file = csv(`${a.id};;;;Pauillac;;;;`, ';Mauvais\u0000;Dom;;;;;;');
    const { plan } = (await preview(file)).body;
    const res = await client.post('/api/import/csv', { csv: file, dryRun: false, planHash: plan.planHash });
    expect(res.status).toBe(500);
    expect((await wine(a.id)).appellation).toBe('Bordeaux');
    expect(await count('wines')).toBe(2);
  });

  it('ancien export sans Identifiant : 400', async () => {
    const res = await preview('Nom,Producteur\nGrand Vin,Château Test');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Réexporte ta cave/);
  });

  it('fichier trop volumineux : 413', async () => {
    const res = await preview(`${HEADER}\r\n${'x'.repeat(2 * 1024 * 1024 + 10)}`);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Démarrer la base de test et lancer, il échoue**

```bash
docker run -d --rm --name vinoflow-test-db -e POSTGRES_USER=vinoflow -e POSTGRES_PASSWORD=vinoflow -e POSTGRES_DB=vinoflow_test -p 55432:5432 pgvector/pgvector:pg16
```

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npx vitest run tests/api/importCsv.test.js`
Expected: FAIL — 404 sur `/api/import/csv` (le test 401 peut passer : l'authentification précède le 404).

- [ ] **Step 3: Implémenter `backend/src/csvImport/apply.js`**

```js
import { WINE_COLUMNS } from './columns.js';

// Cave telle que buildPlan l'attend : fiches + bouteilles EN STOCK (prix).
export const loadCellar = async (db) => {
  const { rows } = await db.query(`
    SELECT w.id, w.name, w.cuvee, w.producer, w.vintage, w.region, w.appellation, w.country, w.type,
           w.grape_varieties, w.format, w.is_favorite, w.sensory_description, w.suggested_food_pairings,
           w.peak_start, w.peak_end,
           COALESCE(json_agg(json_build_object('purchasePrice', b.purchase_price))
             FILTER (WHERE b.id IS NOT NULL), '[]') AS bottles
      FROM wines w
      LEFT JOIN bottles b ON b.wine_id = w.id AND NOT COALESCE(b.is_consumed, false)
     GROUP BY w.id`);
  return rows.map((r) => ({
    id: r.id, name: r.name, cuvee: r.cuvee, producer: r.producer, vintage: r.vintage, region: r.region,
    appellation: r.appellation, country: r.country, type: r.type, grapeVarieties: r.grape_varieties,
    format: r.format, isFavorite: r.is_favorite, sensoryDescription: r.sensory_description,
    suggestedFoodPairings: r.suggested_food_pairings, peakStart: r.peak_start, peakEnd: r.peak_end,
    bottles: r.bottles,
  }));
};

// Même effet que PUT /wines/:id/peak (saisie manuelle) ; null = retour à l'estimation.
const setPeak = (db, wineId, peak) => (peak
  ? db.query(`UPDATE wines SET peak_start = $1, peak_end = $2, peak_source = 'USER', peak_confidence = 'HIGH',
                peak_reasoning = 'Import CSV', peak_computed_at = now(), updated_at = now() WHERE id = $3`,
    [peak.start, peak.end, wineId])
  : db.query(`UPDATE wines SET peak_start = NULL, peak_end = NULL, peak_source = NULL, peak_confidence = NULL,
                peak_reasoning = NULL, peak_computed_at = NULL, updated_at = now() WHERE id = $1`, [wineId]));

/** Applique un plan (buildPlan) ; à appeler dans withTransaction. */
export const applyPlan = async (db, plan, userId) => {
  const applied = { updated: 0, peaks: 0, pricedBottles: 0, created: 0, createdBottles: 0 };

  for (const u of plan.updates) {
    const cols = u.changes.map((c) => WINE_COLUMNS[c.field]);
    await db.query(
      `UPDATE wines SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = $${cols.length + 1}`,
      [...u.changes.map((c) => c.after), u.wineId],
    );
    applied.updated += 1;
  }

  for (const p of plan.peaks) {
    await setPeak(db, p.wineId, p.after);
    applied.peaks += 1;
  }

  // Jamais d'écrasement : seules les bouteilles en stock sans prix sont complétées.
  for (const p of plan.prices) {
    const { rowCount } = await db.query(
      `UPDATE bottles SET purchase_price = $1
        WHERE wine_id = $2 AND NOT COALESCE(is_consumed, false) AND (purchase_price IS NULL OR purchase_price = 0)`,
      [p.price, p.wineId],
    );
    applied.pricedBottles += rowCount;
  }

  for (const c of plan.creates) {
    const entries = Object.entries(c.fields);
    const { rows: [wine] } = await db.query(
      `INSERT INTO wines (${entries.map(([f]) => WINE_COLUMNS[f]).join(', ')})
       VALUES (${entries.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, name, vintage`,
      entries.map(([, v]) => v),
    );
    if (c.peak) await setPeak(db, wine.id, c.peak);
    await db.query(
      `INSERT INTO bottles (wine_id, location, added_by_user_id, purchase_price)
       SELECT $1, $2::jsonb, $3, $4 FROM generate_series(1, $5::int)`,
      [wine.id, JSON.stringify('Non trié'), userId, c.price, c.bottles],
    );
    await db.query(
      `INSERT INTO journal (date, type, wine_id, wine_name, wine_vintage, quantity, description, user_id)
       VALUES ($1, 'IN', $2, $3, $4, $5, 'Import CSV', $6)`,
      [new Date().toISOString(), wine.id, wine.name, wine.vintage, c.bottles, userId],
    );
    applied.created += 1;
    applied.createdBottles += c.bottles;
  }
  return applied;
};
```

- [ ] **Step 4: Ajouter la route dans `backend/src/routes/import.js`**

Remplacer `import { withTransaction } from '../db.js';` par :

```js
import { pool, withTransaction } from '../db.js';
import { parseCsv, CsvFormatError } from '../csvImport/parse.js';
import { toPatches } from '../csvImport/rows.js';
import { buildPlan } from '../csvImport/plan.js';
import { loadCellar, applyPlan } from '../csvImport/apply.js';
import { MAX_ROWS } from '../csvImport/columns.js';
```

Puis, juste avant `export default router;` :

```js
// ========== IMPORT CSV (aller-retour avec l'export) ==========
//
// { csv, dryRun: true }  → { plan } : aperçu, aucune écriture.
// { csv, dryRun: false, planHash } → le plan est recalculé sur la cave actuelle ;
// s'il diffère de l'aperçu (planHash) → 409, sinon application en une transaction.
const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const csvBodyParser = express.json({ limit: '4mb' });

router.post('/import/csv', csvBodyParser, async (req, res) => {
  const { csv, dryRun, planHash } = req.body || {};
  if (typeof csv !== 'string') return res.status(400).json({ error: 'Fichier CSV manquant.' });
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
    return res.status(413).json({ error: 'Fichier trop volumineux (2 Mo maximum).' });
  }
  try {
    const table = parseCsv(csv);
    if (table.rows.length > MAX_ROWS) return res.status(400).json({ error: `Trop de lignes (${MAX_ROWS} maximum).` });
    const { patches, errors } = toPatches(table);

    if (dryRun !== false) {
      return res.json({ plan: buildPlan(patches, await loadCellar(pool), errors) });
    }
    const applied = await withTransaction(async (client) => {
      const plan = buildPlan(patches, await loadCellar(client), errors);
      return plan.planHash === planHash ? applyPlan(client, plan, req.user?.userId ?? null) : null;
    });
    if (!applied) return res.status(409).json({ error: 'La cave a changé depuis l’aperçu, relance-le.' });
    return res.json({ applied });
  } catch (error) {
    if (error instanceof CsvFormatError) return res.status(400).json({ error: error.message });
    console.error('CSV import error:', error);
    return res.status(500).json({ error: 'L’import CSV a échoué ; rien n’a été modifié.' });
  }
});
```

- [ ] **Step 5: Contourner le parseur global dans `backend/src/app.js`**

Remplacer :

```js
app.use((req, res, next) => (req.path === '/api/import' ? next() : jsonParser(req, res, next)));
```

par :

```js
const OWN_PARSER = new Set(['/api/import', '/api/import/csv']);
app.use((req, res, next) => (OWN_PARSER.has(req.path) ? next() : jsonParser(req, res, next)));
```

et mettre à jour le commentaire au-dessus : « POST /api/import (sauvegarde) et /api/import/csv ont leur propre parseur, plus large, monté après l'authentification ».

- [ ] **Step 6: Lancer, il passe ; puis toute la suite backend**

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npx vitest run tests/api/importCsv.test.js`
Expected: PASS (8 tests).

Run: `cd backend && TEST_DATABASE_URL=postgresql://vinoflow:vinoflow@localhost:55432/vinoflow_test npm test`
Expected: toute la suite verte (unitaires + API, `import.test.js` compris).

- [ ] **Step 7: Commit**

```bash
git add backend/src/csvImport/apply.js backend/src/routes/import.js backend/src/app.js backend/tests/api/importCsv.test.js
git commit -m "Import CSV : route POST /api/import/csv (aperçu, puis application atomique protégée par empreinte)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Service front et résumé de l'aperçu

**Files:**
- Modify: `types.ts` (ajout en fin de fichier)
- Modify: `services/storageService.ts` (après `importFullData`)
- Create: `utils/csvImportSummary.ts`
- Test: `utils/csvImportSummary.test.ts`

**Interfaces:**
- Consumes: réponses HTTP de la Tâche 5.
- Produces: types `CsvImportPlan`, `CsvImportApplied` ; `previewCsvImport(csv) → Promise<{ ok: true; plan } | { ok: false; status; error }>` ; `applyCsvImport(csv, planHash) → Promise<{ ok: true; applied } | { ok: false; status; error }>` ; `summaryTiles(plan) → { label, value }[]` ; `groupChanges(plan) → { key, label, line, lines: string[], isNew: boolean }[]`.

- [ ] **Step 1: Ajouter les types dans `types.ts`**

```ts
// ─── Import CSV (POST /api/import/csv) ───
export interface CsvPeak { start: number; end: number }
export interface CsvImportPlan {
  updates: { line: number; wineId: string; label: string; changes: { field: string; before: unknown; after: unknown }[] }[];
  peaks: { line: number; wineId: string; label: string; before: CsvPeak | null; after: CsvPeak | null }[];
  prices: { line: number; wineId: string; label: string; price: number; bottleCount: number }[];
  creates: { line: number; label: string; peak: CsvPeak | null; price: number | null; bottles: number }[];
  unchanged: number;
  errors: { line: number; message: string }[];
  warnings: { line: number; message: string }[];
  changeCount: number;
  planHash: string;
}
export interface CsvImportApplied { updated: number; peaks: number; pricedBottles: number; created: number; createdBottles: number }
```

- [ ] **Step 2: Écrire le test du résumé**

`utils/csvImportSummary.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { summaryTiles, groupChanges } from './csvImportSummary';
import type { CsvImportPlan } from '../types';

const plan: CsvImportPlan = {
  updates: [{ line: 4, wineId: 'a', label: 'Grand Vin 2018', changes: [
    { field: 'appellation', before: 'Bordeaux', after: 'Pauillac' },
    { field: 'grapeVarieties', before: ['Merlot'], after: [] },
    { field: 'isFavorite', before: false, after: true },
    { field: 'type', before: 'RED', after: 'WHITE' },
  ] }],
  peaks: [{ line: 4, wineId: 'a', label: 'Grand Vin 2018', before: null, after: { start: 2025, end: 2035 } }],
  prices: [{ line: 4, wineId: 'a', label: 'Grand Vin 2018', price: 14.5, bottleCount: 2 }],
  creates: [{ line: 2, label: 'Nouveau 2021', peak: null, price: 12.5, bottles: 3 }],
  unchanged: 5, errors: [{ line: 9, message: 'x' }], warnings: [], changeCount: 4, planHash: 'h',
};

describe('summaryTiles', () => {
  it('compte vins modifiés, apogées, bouteilles à prix, nouveaux vins, erreurs', () => {
    expect(summaryTiles(plan).map((t) => t.value)).toEqual([1, 1, 2, 1, 1]);
    expect(summaryTiles(plan).map((t) => t.label)).toEqual(['Vins modifiés', 'Apogées', 'Prix remplis', 'Nouveaux vins', 'Erreurs']);
  });
});

describe('groupChanges', () => {
  it('regroupe par vin, dans l’ordre des lignes, avec des libellés FR', () => {
    const groups = groupChanges(plan);
    expect(groups.map((g) => g.label)).toEqual(['Nouveau 2021', 'Grand Vin 2018']);
    expect(groups[0]).toMatchObject({ isNew: true, line: 2, lines: ['Nouveau vin · 3 bouteille(s) à 12,50 €'] });
    expect(groups[1].lines).toEqual([
      'Appellation : Bordeaux → Pauillac',
      'Cépages : Merlot → —',
      'Favori : Non → Oui',
      'Type : Rouge → Blanc',
      'Apogée : aucune → 2025–2035',
      'Prix d’achat : 14,50 € sur 2 bouteille(s) sans prix',
    ]);
  });
});
```

- [ ] **Step 3: Lancer, il échoue**

Run: `npm test -- utils/csvImportSummary.test.ts`
Expected: FAIL — module `./csvImportSummary` introuvable.

- [ ] **Step 4: Implémenter `utils/csvImportSummary.ts`**

```ts
import type { CsvImportPlan, CsvPeak } from '../types';

// Mise en forme de l'aperçu d'import CSV (Réglages → Données).

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom', cuvee: 'Cuvée', producer: 'Producteur', vintage: 'Millésime', region: 'Région',
  appellation: 'Appellation', country: 'Pays', type: 'Type', grapeVarieties: 'Cépages', format: 'Format',
  isFavorite: 'Favori', sensoryDescription: 'Description', suggestedFoodPairings: 'Accords mets',
};
const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};

const formatValue = (field: string, value: unknown): string => {
  if (field === 'isFavorite') return value ? 'Oui' : 'Non';
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (field === 'type') return TYPE_LABELS[String(value)] || String(value);
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};
const formatPeak = (p: CsvPeak | null) => (p ? `${p.start}–${p.end}` : 'aucune');
export const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

export const summaryTiles = (plan: CsvImportPlan) => [
  { label: 'Vins modifiés', value: plan.updates.length },
  { label: 'Apogées', value: plan.peaks.length },
  { label: 'Prix remplis', value: plan.prices.reduce((n, p) => n + p.bottleCount, 0) },
  { label: 'Nouveaux vins', value: plan.creates.length },
  { label: 'Erreurs', value: plan.errors.length },
];

export interface ChangeGroup { key: string; label: string; line: number; isNew: boolean; lines: string[] }

/** Un groupe par vin (modifié ou créé), dans l'ordre des lignes du fichier. */
export const groupChanges = (plan: CsvImportPlan): ChangeGroup[] => {
  const groups = new Map<string, ChangeGroup>();
  const group = (key: string, label: string, line: number, isNew = false) => {
    if (!groups.has(key)) groups.set(key, { key, label, line, isNew, lines: [] });
    return groups.get(key)!;
  };
  for (const u of plan.updates) {
    const g = group(u.wineId, u.label, u.line);
    for (const c of u.changes) g.lines.push(`${FIELD_LABELS[c.field] || c.field} : ${formatValue(c.field, c.before)} → ${formatValue(c.field, c.after)}`);
  }
  for (const p of plan.peaks) group(p.wineId, p.label, p.line).lines.push(`Apogée : ${formatPeak(p.before)} → ${formatPeak(p.after)}`);
  for (const p of plan.prices) group(p.wineId, p.label, p.line).lines.push(`Prix d’achat : ${formatEuro(p.price)} sur ${p.bottleCount} bouteille(s) sans prix`);
  for (const c of plan.creates) {
    const price = c.price != null ? ` à ${formatEuro(c.price)}` : '';
    const peak = c.peak ? ` · apogée ${formatPeak(c.peak)}` : '';
    group(`new-${c.line}`, c.label, c.line, true).lines.push(`Nouveau vin · ${c.bottles} bouteille(s)${price}${peak}`);
  }
  return [...groups.values()].sort((a, b) => a.line - b.line);
};
```

- [ ] **Step 5: Ajouter le service dans `services/storageService.ts`** (après `importFullData` ; ajouter `CsvImportPlan, CsvImportApplied` à l'import depuis `../types` en tête du fichier)

```ts
// ─── Import CSV (aller-retour avec l'export) ───
type CsvImportFailure = { ok: false; status: number; error: string };

const postCsvImport = async (body: object): Promise<{ ok: true; data: any } | CsvImportFailure> => {
  try {
    const response = await apiFetch(`${API_URL}/import/csv`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status, error: data?.error || `Erreur ${response.status}` };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: 'Serveur injoignable.' };
  }
};

/** Aperçu : ce que l'import ferait, sans rien écrire. */
export const previewCsvImport = async (csv: string): Promise<{ ok: true; plan: CsvImportPlan } | CsvImportFailure> => {
  const res = await postCsvImport({ csv, dryRun: true });
  return res.ok ? { ok: true, plan: res.data.plan } : res;
};

/** Application ; status 409 si la cave a changé depuis l'aperçu. */
export const applyCsvImport = async (csv: string, planHash: string): Promise<{ ok: true; applied: CsvImportApplied } | CsvImportFailure> => {
  const res = await postCsvImport({ csv, dryRun: false, planHash });
  return res.ok ? { ok: true, applied: res.data.applied } : res;
};
```

- [ ] **Step 6: Lancer les tests et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (tous les tests front), typecheck sans erreur.

- [ ] **Step 7: Commit**

```bash
git add types.ts services/storageService.ts utils/csvImportSummary.ts utils/csvImportSummary.test.ts
git commit -m "Import CSV : service front et mise en forme de l'aperçu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Modale d'aperçu et bouton dans Réglages

**Files:**
- Create: `components/cockpit/CsvImportPreview.tsx`
- Modify: `pages/Settings.tsx` (imports, état, gestionnaires, section Données)
- Modify: `CLAUDE.md` (ligne `backend/src/csvImport/`)

**Interfaces:**
- Consumes: `previewCsvImport`, `applyCsvImport`, `summaryTiles`, `groupChanges`, `CsvImportPlan`, `Modal`, `Button`, `Card`, `MonoLabel`, `Badge` (primitives Cockpit), `useToast`.
- Produces: `CsvImportPreview` (`{ fileName: string; plan: CsvImportPlan | null; applying: boolean; onApply(): void; onClose(): void }` ; ouverte quand `plan` n'est pas `null`).

- [ ] **Step 1: Créer `components/cockpit/CsvImportPreview.tsx`**

```tsx
import React, { useMemo } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { CsvImportPlan } from '../../types';
import { groupChanges, summaryTiles } from '../../utils/csvImportSummary';
import { Badge, Button, Card, Modal, MonoLabel } from './primitives';

interface Props {
  fileName: string;
  plan: CsvImportPlan | null;
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
}

// Aperçu d'un import CSV : rien n'est écrit avant « Appliquer ».
export const CsvImportPreview: React.FC<Props> = ({ fileName, plan, applying, onApply, onClose }) => {
  const groups = useMemo(() => (plan ? groupChanges(plan) : []), [plan]);
  if (!plan) return null;
  const nothing = plan.changeCount === 0;

  return (
    <Modal
      open
      onClose={applying ? () => {} : onClose}
      size="lg"
      title="Aperçu de l’import"
      subtitle={fileName}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={applying}>Annuler</Button>
          <Button onClick={onApply} disabled={applying || nothing}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {nothing ? 'Aucun changement' : `Appliquer ${plan.changeCount} changement(s)`}
          </Button>
        </>
      )}
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {summaryTiles(plan).map((t) => (
          <Card key={t.label} className="p-3">
            <MonoLabel>{t.label}</MonoLabel>
            <div className={`text-xl mt-1 ${t.label === 'Erreurs' && t.value > 0 ? 'text-wine-700' : 'text-stone-900'}`}>{t.value}</div>
          </Card>
        ))}
      </div>

      {nothing && plan.errors.length === 0 && (
        <p className="mt-4 text-sm text-stone-600">Aucun changement : le fichier correspond déjà à la cave.</p>
      )}

      {plan.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-wine-200 bg-wine-50/40 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-wine-800"><AlertTriangle className="w-4 h-4" /> Lignes écartées</div>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {plan.errors.map((e) => <li key={`e${e.line}`}><span className="mono text-xs text-stone-500">Ligne {e.line}</span> — {e.message}</li>)}
          </ul>
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
          <div className="text-sm font-medium text-amber-900">À vérifier</div>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {plan.warnings.map((w, i) => <li key={`w${w.line}-${i}`}><span className="mono text-xs text-stone-500">Ligne {w.line}</span> — {w.message}</li>)}
          </ul>
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-4 divide-y divide-stone-100 border-y border-stone-100">
          {groups.map((g) => (
            <details key={g.key} className="py-2 group">
              <summary className="flex items-center gap-2 cursor-pointer text-sm text-stone-800">
                <span className="mono text-[10px] text-stone-400">L{g.line}</span>
                <span className="flex-1 min-w-0 truncate">{g.label}</span>
                {g.isNew ? <Badge tone="success">NOUVEAU</Badge> : <Badge>{g.lines.length}</Badge>}
              </summary>
              <ul className="mt-1.5 ml-7 space-y-0.5 text-[13px] text-stone-600">
                {g.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </details>
          ))}
        </div>
      )}

      {plan.unchanged > 0 && <p className="mt-3 text-xs text-stone-500">{plan.unchanged} ligne(s) sans changement.</p>}
    </Modal>
  );
};
```

- [ ] **Step 2: Brancher dans `pages/Settings.tsx`**

Imports : ajouter `previewCsvImport, applyCsvImport` à l'import de `../services/storageService`, `CsvImportPlan` à l'import de `../types`, et :

```tsx
import { CsvImportPreview } from '../components/cockpit/CsvImportPreview';
```

État (à côté de `const [importing, setImporting] = useState(false);`) et ref (à côté de `importInput`) :

```tsx
const [csvImport, setCsvImport] = useState<{ name: string; content: string; plan: CsvImportPlan } | null>(null);
const [csvBusy, setCsvBusy] = useState(false);
const csvInput = useRef<HTMLInputElement>(null);
```

Gestionnaires (après `handleImport`) :

```tsx
const runCsvPreview = async (name: string, content: string) => {
  const res = await previewCsvImport(content);
  if (res.ok) setCsvImport({ name, content, plan: res.plan });
  else { setCsvImport(null); toast.error(`Import CSV impossible : ${res.error}`); }
};

const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // permet de resélectionner le même fichier
  if (!file) return;
  setCsvBusy(true);
  try {
    await runCsvPreview(file.name, await file.text());
  } finally {
    setCsvBusy(false);
  }
};

const handleCsvApply = async () => {
  if (!csvImport) return;
  setCsvBusy(true);
  try {
    const res = await applyCsvImport(csvImport.content, csvImport.plan.planHash);
    if (res.ok) {
      const a = res.applied;
      setCsvImport(null);
      toast.success(`Import appliqué : ${a.updated} vin(s) modifié(s), ${a.peaks} apogée(s), ${a.pricedBottles} prix, ${a.created} nouveau(x) vin(s). Rechargement…`);
      setTimeout(() => window.location.reload(), 1500);
    } else if (res.status === 409) {
      toast.info('La cave a changé entre-temps : aperçu mis à jour.');
      await runCsvPreview(csvImport.name, csvImport.content);
    } else {
      toast.error(`Import CSV impossible : ${res.error}`);
    }
  } finally {
    setCsvBusy(false);
  }
};
```

Section Données : passer la grille à `sm:grid-cols-2 lg:grid-cols-4`, ajouter après le bouton « Export (CSV) » :

```tsx
<Button variant="outline" onClick={() => csvInput.current?.click()} disabled={csvBusy}>
  {csvBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
  Importer un CSV modifié
</Button>
<input ref={csvInput} type="file" accept=".csv,text/csv" onChange={handleCsvImport} className="hidden" />
```

remplacer le paragraphe d'aide par :

```tsx
<p className="mt-3 text-xs text-stone-500">
  La sauvegarde JSON contient toute la cave. Le CSV liste les vins en stock : modifie-le dans Excel ou Numbers puis réimporte-le.
  Une cellule vide ne change rien, « - » efface ; une ligne sans identifiant crée un vin. Un aperçu s’affiche avant toute modification.
</p>
```

et, juste avant la fermeture de la `<Section>` Données :

```tsx
<CsvImportPreview
  fileName={csvImport?.name ?? ''}
  plan={csvImport?.plan ?? null}
  applying={csvBusy}
  onApply={handleCsvApply}
  onClose={() => setCsvImport(null)}
/>
```

- [ ] **Step 3: Documenter dans `CLAUDE.md`**

Après la ligne `backend/src/enrichment/` de la section Layout, ajouter :

```markdown
- `backend/src/csvImport/` — import CSV « aller-retour » avec l'export (`utils/exportCsv.ts`, même en-têtes) : `parse.js` (BOM, `;`/`,`, guillemets), `rows.js` (cellule vide = ne pas toucher, `-` = effacer, erreurs par ligne), `plan.js` (comparaison avec la cave, prix seulement sur les bouteilles sans prix, `planHash`), `apply.js` (une transaction). Route `POST /api/import/csv` (`dryRun` puis application ; 409 si la cave a changé depuis l'aperçu).
```

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sans erreur, tests verts, build OK.

- [ ] **Step 5: Essai de bout en bout (navigateur)**

Démarrer la pile locale (`docker compose up -d --build`), se connecter, Réglages → Données : Export (CSV) ; modifier une appellation, un prix vide et ajouter une ligne sans identifiant dans le fichier ; « Importer un CSV modifié » → l'aperçu montre exactement ces 3 changements ; Appliquer → toast, rechargement ; réimporter le même fichier → « Aucun changement » pour les lignes avec identifiant (la ligne sans identifiant est de nouveau proposée en création, avec l'avertissement « existe peut-être déjà »). Capture d'écran de l'aperçu pour la PR. Arrêter la pile ensuite (`docker compose down`).

- [ ] **Step 6: Commit**

```bash
git add components/cockpit/CsvImportPreview.tsx pages/Settings.tsx CLAUDE.md
git commit -m "Import CSV : aperçu dans Réglages → Données et documentation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
