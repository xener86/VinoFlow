// Sortie structurée de la cascade (même schéma pour Claude Code et l'API).
import { schemaHelpers, WINE_TYPES } from '../sommelier/schemas.js';

const { str, int, nullable, arr, enumOf, obj } = schemaHelpers;

export const SOURCE_LEVELS = ['EXACT', 'AUTRE_MILLESIME', 'PRODUCTEUR', 'APPELLATION'];
export const CORRECTABLE_FIELDS = ['type', 'cuvee', 'appellation', 'region', 'grape_varieties'];
const FAMILIES = ['fruity', 'floral', 'spicy', 'oaky', 'earthy', 'herbaceous', 'mineral'];

export const ENRICHMENT_SCHEMA = obj({
  identification: obj({
    status: enumOf('IDENTIFIED', 'AMBIGUOUS', 'NOT_FOUND'),
    matched_producer: nullable(str),
    matched_cuvee: nullable(str),
    note: str,
    candidates: arr(obj({
      producer: str,
      cuvee: nullable(str),
      location: str,
      evidence: str,
      url: nullable(str),
    })),
  }),
  basis: enumOf('EXACT', 'AUTRE_MILLESIME', 'PRODUCTEUR', 'APPELLATION', 'REGLES'),
  basis_vintage: nullable(int),
  corrections: arr(obj({
    field: enumOf(...CORRECTABLE_FIELDS),
    value: str,
    source_index: int,
  })),
  profile: obj({
    grape_varieties: arr(str),
    aromas: arr(str),
    families: arr(enumOf(...FAMILIES)),
    sensory: nullable(obj({ body: int, acidity: int, tannin: int, sweetness: int, alcohol: int })),
    peak_start_year: nullable(int),
    peak_end_year: nullable(int),
    peak_reasoning: str,
    style_note: str,
    aroma_source_indexes: arr(int),
    peak_source_indexes: arr(int),
  }),
  knowledge: obj({
    producer_style: nullable(str),
    cuvee_style: nullable(str),
    grape_varieties: arr(str),
    peak_years_after_vintage: nullable(arr(int)),
  }),
  sources: arr(obj({
    url: str,
    title: str,
    excerpt: str,
    level: enumOf(...SOURCE_LEVELS),
    vintage: nullable(int),
  })),
  searches: arr(str),
});

export { WINE_TYPES };
