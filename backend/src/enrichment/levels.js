// Niveaux de la cascade d'enrichissement, du plus précis au plus générique.
// La confiance découle du niveau réellement atteint (et vérifié), jamais de
// l'auto-évaluation du modèle.

export const LEVELS = ['EXACT', 'AUTRE_MILLESIME', 'PRODUCTEUR', 'APPELLATION', 'REGLES'];

export const LEVEL_LABELS = {
  EXACT: 'Cette cuvée, ce millésime',
  AUTRE_MILLESIME: "D'après un autre millésime de la cuvée",
  PRODUCTEUR: 'Estimé d\'après le style du producteur',
  APPELLATION: "Estimé d'après l'appellation",
  REGLES: 'Règle générique',
};

// Niveaux qui exigent au moins une source vérifiée (sinon rétrogradation).
export const SOURCED_LEVELS = new Set(['EXACT', 'AUTRE_MILLESIME', 'PRODUCTEUR']);

const CONFIDENCE = {
  EXACT: 'HIGH',
  AUTRE_MILLESIME: 'MEDIUM',
  PRODUCTEUR: 'MEDIUM',
  APPELLATION: 'LOW',
  REGLES: 'LOW',
};

export const confidenceFor = (level) => CONFIDENCE[level] || 'LOW';

// Prochaine vérification : mensuelle pour les niveaux incertains, trimestrielle
// pour les intermédiaires, annuelle pour EXACT.
const RECHECK_MONTHS = {
  EXACT: 12,
  AUTRE_MILLESIME: 3,
  PRODUCTEUR: 3,
  APPELLATION: 1,
  REGLES: 1,
};

export const nextCheckDate = (level, from = new Date()) => {
  const d = new Date(from);
  d.setMonth(d.getMonth() + (RECHECK_MONTHS[level] ?? 1));
  return d;
};

export const levelRank = (level) => {
  const i = LEVELS.indexOf(level);
  return i === -1 ? LEVELS.length : i;
};
