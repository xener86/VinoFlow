// Affichage du partage public et du compositeur de carte : fonctions pures.
import type { CellarWine } from '../types';

export const stars = (rating: number | null): string => {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return '';
  const n = Math.min(5, Math.max(0, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

// « 2026-10-11 » → « dimanche 11 octobre 2026 » ; construite en heure locale
// à partir des composantes pour ne pas glisser d'un jour selon le fuseau.
export const formatLongDate = (ymd: string | null): string => {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!m) return '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

export const formatShortDate = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR');

const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};
export const typeLabel = (type: string | null): string => (type ? TYPE_LABELS[type] ?? type : '');

const TYPE_DOTS: Record<string, string> = {
  RED: 'bg-wine-700', WHITE: 'bg-amber-300', ROSE: 'bg-pink-400', SPARKLING: 'bg-cyan-400', DESSERT: 'bg-amber-500', FORTIFIED: 'bg-stone-700',
};
export const typeDotClass = (type: string | null): string => (type && TYPE_DOTS[type]) || 'bg-stone-400';

// Réordonnancement (↑ ↓) : nouveau tableau, ou le même si la cible est hors bornes.
export const moveItem = <T>(items: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

// Sans accents, tirets et apostrophes ramenés à des espaces (« cote rotie »
// retrouve « Côte-Rôtie »).
const normalize = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-\u2010\u2011\u2013\u2014'\u2019]+/g, ' ').replace(/\s+/g, ' ').trim();

// « Ajouter un vin » : en stock d'abord, filtre sans accents, 8 résultats.
export const filterShareCandidates = (wines: CellarWine[], query: string, limit = 8): CellarWine[] => {
  const q = normalize(query.trim());
  const matches = q
    ? wines.filter((w) => [w.name, w.cuvee, w.producer, w.appellation, w.vintage?.toString()]
        .some((field) => field && normalize(String(field)).includes(q)))
    : wines;
  return [...matches]
    .sort((a, b) => Number((b.inventoryCount || 0) > 0) - Number((a.inventoryCount || 0) > 0) || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit);
};

// handleResponse lance « API Error: 409 Conflict - {"error":"…"} » : on en
// extrait le message du serveur pour le toast.
export const serverMessage = (e: unknown, fallback: string): string => {
  if (!(e instanceof Error)) return fallback;
  const start = e.message.indexOf('{');
  if (start === -1) return fallback;
  try {
    const parsed = JSON.parse(e.message.slice(start));
    const text = parsed?.error ?? parsed?.msg;
    return typeof text === 'string' && text ? text : fallback;
  } catch {
    return fallback;
  }
};

export const shareUrl = (token: string, origin = typeof window !== 'undefined' ? window.location.origin : ''): string => `${origin}/p/${token}`;
