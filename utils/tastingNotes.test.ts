import { describe, it, expect } from 'vitest';
import { tastingPhrase } from './tastingNotes';

describe('tastingPhrase', () => {
  it('extrait la phrase du JSON de la dégustation express', () => {
    expect(tastingPhrase(JSON.stringify({ score10: 8, phrase: 'Superbe fraîcheur' }))).toBe('Superbe fraîcheur');
    expect(tastingPhrase(JSON.stringify({ score10: 8 }))).toBe('');
  });

  it('renvoie le texte libre tel quel', () => {
    expect(tastingPhrase('cassis, cèdre')).toBe('cassis, cèdre');
    expect(tastingPhrase('42')).toBe('42'); // JSON valide mais pas un objet
  });

  it('vide si absent', () => {
    expect(tastingPhrase(null)).toBe('');
    expect(tastingPhrase(undefined)).toBe('');
  });
});
