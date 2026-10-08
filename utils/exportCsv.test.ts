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
