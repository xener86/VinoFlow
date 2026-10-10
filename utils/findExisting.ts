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
