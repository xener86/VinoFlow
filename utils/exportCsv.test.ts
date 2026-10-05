import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportWinesToCsv } from './exportCsv';
import type { CellarWine } from '../types';

// Capture le Blob produit au lieu de déclencher un téléchargement.
let blob: Blob | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  blob = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blob = b as Blob; return 'blob:x'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const link = { click: vi.fn(), href: '', download: '' };
  vi.stubGlobal('document', {
    createElement: () => link,
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const csvLines = async () => (await blob!.text()).replace(/^﻿/, '').split('\n');

const wine = (overrides: Partial<CellarWine> = {}) => ({
  id: '1', name: 'Grand Vin', cuvee: '', producer: 'Château, Test', vintage: 2018, region: 'Bordeaux',
  appellation: 'Pauillac', country: 'France', type: 'RED', grapeVarieties: ['Merlot', 'Cabernet'],
  format: '750ml', inventoryCount: 2, isFavorite: true, sensoryDescription: 'Dit "superbe"',
  suggestedFoodPairings: ['agneau'], bottles: [{ purchasePrice: 20 }, { purchasePrice: 30 }, { purchasePrice: 0 }],
  ...overrides,
}) as unknown as CellarWine;

describe('exportWinesToCsv', () => {
  it('en-têtes, BOM UTF-8 et une ligne par vin', async () => {
    exportWinesToCsv([wine()], []);
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 pour Excel
    const lines = await csvLines();
    expect(lines[0].startsWith('Nom,Cuvée,Producteur,Millésime')).toBe(true);
    expect(lines).toHaveLength(2);
  });

  it('libellé de type, prix moyen des bouteilles valorisées, apogée, échappement CSV', async () => {
    exportWinesToCsv([wine()], []);
    const row = (await csvLines())[1];
    expect(row).toContain('"Château, Test"');
    expect(row).toContain('"Merlot; Cabernet"');
    expect(row).toContain(',Rouge,');
    expect(row).toContain(',25.00,Oui,À Boire,2023-2028,');
    expect(row).toContain('"Dit ""superbe"""');
  });
});
