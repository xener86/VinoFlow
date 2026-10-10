import { describe, it, expect } from 'vitest';
import { decodeCsvBytes, fixCp1252 } from './decodeCsv';

describe('fixCp1252', () => {
  it('rétablit les caractères 0x80–0x9F quand le décodeur ne connaît que latin-1 (Node sans ICU complet)', () => {
    expect(fixCp1252('12\u0080 \u0092 \u009c')).toBe('12€ ’ œ');
    expect(fixCp1252('Rosé')).toBe('Rosé');
  });
});

const bytes = (...b: number[]) => new Uint8Array(b).buffer;

describe('decodeCsvBytes', () => {
  it('UTF-8 (avec ou sans BOM) lu tel quel', () => {
    const utf8 = new TextEncoder().encode('﻿Millésime;Rosé').buffer;
    expect(decodeCsvBytes(utf8)).toBe('Millésime;Rosé');
  });

  it('Windows-1252 (« CSV séparateur point-virgule » d’Excel FR) : accents et € retrouvés', () => {
    // M i l l é s i m e ; R o s é ; 1 2 €
    const ansi = bytes(0x4d, 0x69, 0x6c, 0x6c, 0xe9, 0x73, 0x69, 0x6d, 0x65, 0x3b, 0x52, 0x6f, 0x73, 0xe9, 0x3b, 0x31, 0x32, 0x80);
    expect(decodeCsvBytes(ansi)).toBe('Millésime;Rosé;12€');
  });
});
