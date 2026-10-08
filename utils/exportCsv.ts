import { CellarWine } from '../types';
import { getPeakWindow } from './peakWindow';

// Format « aller-retour » : relu par l'import (backend/src/csvImport/). Toute
// modification des en-têtes doit être reportée dans csvImport/columns.js.
// Les trois dernières colonnes sont calculées et ignorées à l'import.
export const CSV_HEADERS = [
  'Identifiant', 'Nom', 'Cuvée', 'Producteur', 'Millésime', 'Région', 'Appellation', 'Pays',
  'Type', 'Cépages', 'Format', 'Favori', 'Apogée début', 'Apogée fin', "Prix d'achat (€)",
  'Bouteilles', 'Description', 'Accords mets', 'Stock', 'Apogée', 'Fenêtre estimée',
];

const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé',
  SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};

const escapeCsv = (val: unknown): string => {
  const str = String(val ?? '');
  return /[;,"\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Prix moyen des bouteilles en stock, seulement si toutes ont un prix : une
// cellule vide invite à le compléter (l'import ne remplit que les prix manquants).
const purchasePriceCell = (w: CellarWine): string => {
  const inStock = (w.bottles || []).filter(b => !b.isConsumed);
  if (inStock.length === 0 || inStock.some(b => !b.purchasePrice || b.purchasePrice <= 0)) return '';
  const avg = inStock.reduce((sum, b) => sum + (b.purchasePrice || 0), 0) / inStock.length;
  return avg.toFixed(2).replace('.', ',');
};

/** CSV de la cave (BOM UTF-8, séparateur ;, CRLF) — lisible tel quel par Excel FR. */
export const buildCellarCsv = (wines: CellarWine[]): string => {
  const rows = wines.map(w => {
    const peak = getPeakWindow(w);
    const stored = w.peakStart != null && w.peakEnd != null;
    return [
      w.id, w.name, w.cuvee || '', w.producer, w.vintage ?? '', w.region || '',
      w.appellation || '', w.country || '', TYPE_LABELS[w.type] || w.type || '',
      (w.grapeVarieties || []).join('; '), w.format || '', w.isFavorite ? 'Oui' : 'Non',
      stored ? w.peakStart : '', stored ? w.peakEnd : '', purchasePriceCell(w), '',
      w.sensoryDescription || '', (w.suggestedFoodPairings || []).join('; '),
      w.inventoryCount, peak.peakStart ? peak.status : '',
      peak.peakStart ? `${peak.peakStart}-${peak.peakEnd}` : '',
    ];
  });
  return '﻿' + [CSV_HEADERS, ...rows].map(r => r.map(escapeCsv).join(';')).join('\r\n');
};

/** Télécharge l'export CSV des vins donnés. */
export const exportWinesToCsv = (wines: CellarWine[]) => {
  const blob = new Blob([buildCellarCsv(wines)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vinoflow-cave-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
