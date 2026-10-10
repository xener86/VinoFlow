import type { CellarWine, WineType } from '../types';

// Mise en forme des partages (page publique, compositeur).

export const stars = (rating: number | null | undefined): string => {
  if (rating == null) return '';
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-10-12 » → « lundi 12 octobre 2026 » (sans dépendre de la locale du navigateur). */
export const frenchDate = (iso: string | null | undefined): string => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[day]} ${d === 1 ? '1er' : d} ${MONTHS[mo - 1]} ${y}`;
};

const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Effervescent', DESSERT: 'Moelleux', FORTIFIED: 'Muté',
};
export const typeLabel = (type: WineType | string | null | undefined): string => (type ? TYPE_LABELS[type] || type : '');

/** Déplace l'élément `index` de `delta` (−1 / +1), sans sortir de la liste. */
export const moveItem = <T>(list: T[], index: number, delta: number): T[] => {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Vins de la cave correspondant à la recherche (tous les mots), en stock d'abord, sans ceux déjà dans la carte. */
export const searchWines = (wines: CellarWine[], query: string, limit = 8, excludeIds: string[] = []): CellarWine[] => {
  const words = norm(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return [];
  const excluded = new Set(excludeIds);
  return wines
    .filter(w => {
      if (excluded.has(w.id)) return false;
      const hay = norm([w.name, w.cuvee, w.producer, w.appellation, w.vintage].filter(Boolean).join(' '));
      return words.every(word => hay.includes(word));
    })
    .sort((a, b) => (b.inventoryCount > 0 ? 1 : 0) - (a.inventoryCount > 0 ? 1 : 0))
    .slice(0, limit);
};

export const absoluteUrl = (path: string) => `${window.location.origin}${path}`;
