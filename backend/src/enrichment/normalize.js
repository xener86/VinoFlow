// Normalisation des noms de producteurs et de cuvées : clés de la table de
// connaissances partagées et variantes de requêtes (accents, abréviations,
// pluriels). « Les Aieuls » et « Réserve de l'Aïeul » doivent se rapprocher.

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const PRODUCER_PREFIXES = /^(domaines?|dom\.?|chateau|ch\.?|clos|maison|champagne|cave|vignobles?|earl|scea|gaec|famille)\s+/;
const ARTICLES = /\b(les?|la|l|des?|du|d)\b/g;

const base = (s) => stripAccents(String(s || '').toLowerCase())
  .replace(/['’`]/g, ' ')
  .replace(/[^a-z0-9#]+/g, ' ')
  .trim();

// Pluriel simple en fin de mot (aieuls → aieul), sans toucher aux mots courts.
const singular = (word) => (word.length > 3 && /s$/.test(word) ? word.slice(0, -1) : word);

export const producerKey = (producer) => {
  let s = base(producer);
  let previous;
  do { previous = s; s = s.replace(PRODUCER_PREFIXES, ''); } while (s !== previous);
  return s.split(' ').filter(Boolean).map(singular).join(' ');
};

export const cuveeKey = (cuvee) => base(cuvee)
  .replace(/^cuvee\s+/, '')
  .replace(ARTICLES, ' ')
  .split(' ').filter(Boolean).map(singular).join(' ');

/**
 * Variantes de requêtes pour la recherche : nom tel que saisi, sans accents,
 * avec abréviations Dom./Ch. développées, cuvée seule + producteur.
 */
export const queryVariants = (wine) => {
  const producer = String(wine.producer || '').trim();
  const cuvee = String(wine.cuvee || wine.name || '').trim();
  const vintage = wine.vintage ? String(wine.vintage) : '';
  const expanded = producer
    .replace(/^Dom\.?\s+/i, 'Domaine ')
    .replace(/^Ch\.?\s+/i, 'Château ');
  const variants = [
    [producer, cuvee, vintage],
    [expanded, cuvee, vintage],
    [stripAccents(expanded), stripAccents(cuvee), vintage],
    [expanded, cuvee],
    [expanded, wine.appellation || wine.region || ''],
  ].map((parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
  return [...new Set(variants)].filter(Boolean);
};
