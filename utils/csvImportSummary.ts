import type { CsvImportPlan, CsvPeak } from '../types';

// Mise en forme de l'aperçu d'import CSV (Réglages → Données).

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom', cuvee: 'Cuvée', producer: 'Producteur', vintage: 'Millésime', region: 'Région',
  appellation: 'Appellation', country: 'Pays', type: 'Type', grapeVarieties: 'Cépages', format: 'Format',
  isFavorite: 'Favori', sensoryDescription: 'Description', suggestedFoodPairings: 'Accords mets',
};
const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};

const formatValue = (field: string, value: unknown): string => {
  if (field === 'isFavorite') return value ? 'Oui' : 'Non';
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (field === 'type') return TYPE_LABELS[String(value)] || String(value);
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};
const formatPeak = (p: CsvPeak | null) => (p ? `${p.start}–${p.end}` : 'aucune');
export const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

export const summaryTiles = (plan: CsvImportPlan) => [
  { label: 'Vins modifiés', value: plan.updates.length },
  { label: 'Apogées', value: plan.peaks.length },
  { label: 'Prix remplis', value: plan.prices.reduce((n, p) => n + p.bottleCount, 0) },
  { label: 'Nouveaux vins', value: plan.creates.length },
  { label: 'Erreurs', value: plan.errors.length },
];

export interface ChangeGroup { key: string; label: string; line: number; isNew: boolean; lines: string[] }

/** Un groupe par vin (modifié ou créé), dans l'ordre des lignes du fichier. */
export const groupChanges = (plan: CsvImportPlan): ChangeGroup[] => {
  const groups = new Map<string, ChangeGroup>();
  const group = (key: string, label: string, line: number, isNew = false) => {
    if (!groups.has(key)) groups.set(key, { key, label, line, isNew, lines: [] });
    return groups.get(key)!;
  };
  for (const u of plan.updates) {
    const g = group(u.wineId, u.label, u.line);
    for (const c of u.changes) g.lines.push(`${FIELD_LABELS[c.field] || c.field} : ${formatValue(c.field, c.before)} → ${formatValue(c.field, c.after)}`);
  }
  for (const p of plan.peaks) group(p.wineId, p.label, p.line).lines.push(`Apogée : ${formatPeak(p.before)} → ${formatPeak(p.after)}`);
  for (const p of plan.prices) group(p.wineId, p.label, p.line).lines.push(`Prix d’achat : ${formatEuro(p.price)} sur ${p.bottleCount} bouteille(s) sans prix`);
  for (const c of plan.creates) {
    const price = c.price != null ? ` à ${formatEuro(c.price)}` : '';
    const peak = c.peak ? ` · apogée ${formatPeak(c.peak)}` : '';
    group(`new-${c.line}`, c.label, c.line, true).lines.push(`Nouveau vin · ${c.bottles} bouteille(s)${price}${peak}`);
  }
  return [...groups.values()].sort((a, b) => a.line - b.line);
};
