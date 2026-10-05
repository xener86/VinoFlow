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
