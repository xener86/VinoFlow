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
