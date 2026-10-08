// Correspondance avec l'export (utils/exportCsv.ts, CSV_HEADERS). Les en-têtes
// sont comparés normalisés (casse, accents, ponctuation ignorés). Les colonnes
// calculées (Stock, Apogée, Fenêtre estimée) n'y figurent pas : ignorées.
export const normalizeHeader = (value) => String(value)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

export const COLUMNS = {
  identifiant: 'id', nom: 'name', cuvee: 'cuvee', producteur: 'producer', millesime: 'vintage',
  region: 'region', appellation: 'appellation', pays: 'country', type: 'type', cepages: 'grapeVarieties',
  format: 'format', favori: 'isFavorite', favoris: 'isFavorite', apogeedebut: 'peakStart', apogeefin: 'peakEnd',
  prixdachat: 'price', bouteilles: 'bottles', description: 'sensoryDescription', accordsmets: 'suggestedFoodPairings',
};

// Champs de la fiche, dans l'ordre d'affichage de l'aperçu, et leur colonne SQL.
export const WINE_COLUMNS = {
  name: 'name', cuvee: 'cuvee', producer: 'producer', vintage: 'vintage', region: 'region',
  appellation: 'appellation', country: 'country', type: 'type', grapeVarieties: 'grape_varieties',
  format: 'format', isFavorite: 'is_favorite', sensoryDescription: 'sensory_description',
  suggestedFoodPairings: 'suggested_food_pairings',
};
export const WINE_FIELDS = Object.keys(WINE_COLUMNS);
export const LIST_FIELDS = ['grapeVarieties', 'suggestedFoodPairings'];
export const TEXT_FIELDS = ['name', 'cuvee', 'producer', 'region', 'appellation', 'country', 'format', 'sensoryDescription'];

export const TYPES = {
  rouge: 'RED', red: 'RED', blanc: 'WHITE', white: 'WHITE', rose: 'ROSE',
  petillant: 'SPARKLING', sparkling: 'SPARKLING', dessert: 'DESSERT', fortifie: 'FORTIFIED', fortified: 'FORTIFIED',
};

export const CLEAR = '-';
export const MAX_ROWS = 5000;
