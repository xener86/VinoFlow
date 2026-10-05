// Comparaison côte à côte de 2 ou 3 vins (radar superposé + tableau).
// Ouverte depuis la Cave : sélection multiple puis « Comparer ».

import React from 'react';
import { FlavorRadar } from '../FlavorRadar';
import { CellarWine } from '../../types';
import { MonoLabel, WineLink } from './primitives';

const COLORS = ['#7f1d1d', '#0f766e', '#b45309'];

const TYPE_LABELS: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Moelleux', FORTIFIED: 'Muté',
};

const profileValue = (w: CellarWine, key: 'body' | 'acidity' | 'tannin' | 'sweetness' | 'alcohol') =>
  w.sensoryProfile && typeof w.sensoryProfile[key] === 'number' ? `${w.sensoryProfile[key]}/100` : '—';

export const WineComparison: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const withProfile = wines.filter((w) => w.sensoryProfile);
  const rows: { label: string; values: React.ReactNode[] }[] = [
    { label: 'Couleur', values: wines.map((w) => TYPE_LABELS[w.type] || w.type) },
    { label: 'Millésime', values: wines.map((w) => w.vintage || '—') },
    { label: 'Producteur', values: wines.map((w) => w.producer || '—') },
    { label: 'Région', values: wines.map((w) => w.region || '—') },
    { label: 'Appellation', values: wines.map((w) => w.appellation || '—') },
    { label: 'Cépages', values: wines.map((w) => (w.grapeVarieties || []).join(', ') || '—') },
    { label: 'Corps', values: wines.map((w) => profileValue(w, 'body')) },
    { label: 'Acidité', values: wines.map((w) => profileValue(w, 'acidity')) },
    { label: 'Tanins', values: wines.map((w) => profileValue(w, 'tannin')) },
    { label: 'Sucre', values: wines.map((w) => profileValue(w, 'sweetness')) },
    { label: 'Alcool', values: wines.map((w) => profileValue(w, 'alcohol')) },
    { label: 'Arômes', values: wines.map((w) => (w.aromaProfile || []).slice(0, 5).join(', ') || '—') },
    { label: 'Accords', values: wines.map((w) => (w.suggestedFoodPairings || []).slice(0, 3).join(', ') || '—') },
    { label: 'En stock', values: wines.map((w) => `×${w.inventoryCount}`) },
  ];

  return (
    <div className="space-y-5">
      {withProfile.length >= 2 && (
        <div>
          <MonoLabel>Profil gustatif comparé</MonoLabel>
          <div className="h-64 md:h-72 w-full mt-2">
            <FlavorRadar
              overlays={withProfile.map((w) => ({ data: w.sensoryProfile, color: COLORS[wines.indexOf(w)], name: w.name }))}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {wines.map((w, i) => (
          <span key={w.id} className="inline-flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
            <WineLink id={w.id} className="serif-it text-stone-900">{w.name}</WineLink>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="w-28" />
              {wines.map((w, i) => (
                <th key={w.id} className="py-2 pr-3 text-left font-normal align-bottom">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: COLORS[i] }} />
                  <WineLink id={w.id} className="serif-it text-stone-900">{w.name}</WineLink>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-2 pr-3 mono text-[10px] tracking-widest text-stone-500 uppercase whitespace-nowrap align-top">{r.label}</td>
                {r.values.map((v, i) => <td key={i} className="py-2 pr-3 text-stone-800 align-top">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
