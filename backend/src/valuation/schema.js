// Sortie structurée de la passe « cote » (Claude Code et API).
import { schemaHelpers } from '../sommelier/schemas.js';

const { str, int, num, nullable, arr, enumOf, obj } = schemaHelpers;

export const VALUATION_SCHEMA = obj({
  status: enumOf('FOUND', 'NOT_FOUND'),
  basis: enumOf('EXACT', 'AUTRE_MILLESIME'),
  basis_vintage: nullable(int),
  prices: arr(obj({
    price_eur: num,
    format_ml: int,
    seller: str,
    url: str,
    quote: str,
  })),
  note: str,
});
