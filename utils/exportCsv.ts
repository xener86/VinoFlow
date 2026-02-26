import { CellarWine, Rack, BottleLocation } from '../types';
import { getPeakWindow } from './peakWindow';

/**
 * Export wine inventory to CSV and trigger browser download.
 */
export const exportWinesToCsv = (wines: CellarWine[], racks: Rack[]) => {
  const headers = [
    'Nom', 'Cuvée', 'Producteur', 'Millésime', 'Région', 'Appellation',
    'Pays', 'Type', 'Cépages', 'Format', 'Stock', 'Prix moyen (€)',
    'Favoris', 'Apogée', 'Fenêtre', 'Description', 'Accords mets'
  ];

  const getRackName = (rackId: string): string => {
    const rack = racks.find(r => r.id === rackId);
    return rack?.name || 'Inconnu';
  };

  const typeLabels: Record<string, string> = {
    RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé',
    SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié'
  };

  const rows = wines.map(w => {
    const pricedBottles = w.bottles.filter(b => b.purchasePrice && b.purchasePrice > 0);
    const avgPrice = pricedBottles.length > 0
      ? pricedBottles.reduce((sum, b) => sum + (b.purchasePrice || 0), 0) / pricedBottles.length
      : '';
    const peak = getPeakWindow(w.vintage, w.type);

    return [
      w.name,
      w.cuvee || '',
      w.producer,
      w.vintage,
      w.region,
      w.appellation || '',
      w.country,
      typeLabels[w.type] || w.type,
      w.grapeVarieties.join('; '),
      w.format,
      w.inventoryCount,
      avgPrice ? (avgPrice as number).toFixed(2) : '',
      w.isFavorite ? 'Oui' : 'Non',
      peak.status,
      `${peak.peakStart}-${peak.peakEnd}`,
      w.sensoryDescription || '',
      (w.suggestedFoodPairings || []).join('; ')
    ];
  });

  const escapeCsv = (val: any): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csv = [headers, ...rows]
    .map(row => row.map(escapeCsv).join(','))
    .join('\n');

  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vinoflow-cave-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
