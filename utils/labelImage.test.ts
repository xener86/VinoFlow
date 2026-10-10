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
    const encode = vi.fn((_quality: number) => 'x'.repeat(1000));
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
