import { convertKeysToCamelCase } from './case.js';

// Dates produites par json_build_object (bouteilles agrégées) : Postgres écrit
// le fuseau "+00", que Date de JavaScript refuse → on le complète en "+00:00".
const fixJsonTimestamp = (value) =>
  typeof value === 'string' ? value.replace(/([+-]\d{2})$/, '$1:00') : value;

const normalizeBottle = (bottle) => {
  const b = { ...bottle };
  // Normalize legacy {"label": "..."} locations to plain strings
  if (b.location && typeof b.location === 'object' && 'label' in b.location && !('rackId' in b.location)) {
    b.location = b.location.label;
  }
  for (const key of ['purchaseDate', 'consumedDate', 'createdAt']) b[key] = fixJsonTimestamp(b[key]);
  return b;
};

/**
 * Ligne `wines` (+ bouteilles agrégées éventuelles) → objet renvoyé par l'API.
 * La colonne `embedding` (768 flottants pgvector) n'est utile qu'en interne.
 */
export const serializeWine = (row) => {
  const { embedding: _embedding, ...wine } = convertKeysToCamelCase(row);
  if (Array.isArray(wine.bottles)) wine.bottles = wine.bottles.map(normalizeBottle);
  return wine;
};
