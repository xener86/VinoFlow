import React, { useState } from 'react';
import { useWines } from '../hooks/useWines';
import { CellarWine } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { Columns3, Search, X, Loader2 } from 'lucide-react';

const OVERLAY_COLORS = ['#e02424', '#2563eb', '#16a34a'];

const wineTypeLabels: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié'
};

export const CompareWines: React.FC = () => {
  const { wines, loading } = useWines();
  const [selected, setSelected] = useState<CellarWine[]>([]);
  const [search, setSearch] = useState('');

  const filtered = wines.filter(w => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q) ||
      w.producer.toLowerCase().includes(q) ||
      w.region.toLowerCase().includes(q);
  }).filter(w => !selected.find(s => s.id === w.id));

  const addWine = (wine: CellarWine) => {
    if (selected.length >= 3) return;
    setSelected([...selected, wine]);
    setSearch('');
  };

  const removeWine = (id: string) => {
    setSelected(selected.filter(w => w.id !== id));
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-wine-600" size={48} />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-3xl font-serif text-stone-800 dark:text-white flex items-center gap-3">
        <Columns3 size={28} className="text-wine-600" /> Comparer
      </h2>

      {/* Search + Selection */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Selected chips */}
        <div className="flex flex-wrap gap-2">
          {selected.map((w, i) => (
            <div key={w.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-white" style={{ backgroundColor: OVERLAY_COLORS[i] }}>
              {w.name} ({w.vintage})
              <button onClick={() => removeWine(w.id)} className="hover:opacity-70"><X size={14} /></button>
            </div>
          ))}
          {selected.length === 0 && (
            <p className="text-sm text-stone-400 dark:text-stone-600">Sélectionnez 2 à 3 vins à comparer</p>
          )}
        </div>

        {/* Search input */}
        {selected.length < 3 && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un vin..."
              className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl pl-10 pr-4 py-3 text-sm text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-600"
            />
            {search.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20">
                {filtered.slice(0, 8).map(w => (
                  <button
                    key={w.id}
                    onClick={() => addWine(w)}
                    className="w-full text-left px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 text-sm transition-colors border-b border-stone-100 dark:border-stone-800 last:border-0"
                  >
                    <span className="font-medium text-stone-800 dark:text-stone-200">{w.name}</span>
                    <span className="text-stone-500 ml-2">{w.vintage} · {w.producer}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-4 py-3 text-sm text-stone-400">Aucun vin trouvé</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Radar Overlay */}
      {selected.length >= 2 && (
        <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
          <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200 mb-4">Profil Gustatif Comparé</h3>
          <div className="h-72 w-full">
            <FlavorRadar
              overlays={selected.map((w, i) => ({
                data: w.sensoryProfile,
                color: OVERLAY_COLORS[i],
                name: w.name
              }))}
            />
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            {selected.map((w, i) => (
              <div key={w.id} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: OVERLAY_COLORS[i] }} />
                <span className="text-stone-600 dark:text-stone-400">{w.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison Table */}
      {selected.length >= 2 && (
        <div className="bg-white dark:bg-stone-900/50 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th className="text-left p-4 text-stone-500 dark:text-stone-400 font-medium text-xs uppercase tracking-wider"></th>
                {selected.map((w, i) => (
                  <th key={w.id} className="p-4 text-left font-serif text-stone-800 dark:text-stone-200">
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: OVERLAY_COLORS[i] }} />
                    {w.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              <Row label="Type" values={selected.map(w => wineTypeLabels[w.type] || w.type)} />
              <Row label="Millésime" values={selected.map(w => String(w.vintage))} />
              <Row label="Producteur" values={selected.map(w => w.producer)} />
              <Row label="Région" values={selected.map(w => w.region)} />
              <Row label="Appellation" values={selected.map(w => w.appellation || '—')} />
              <Row label="Cépages" values={selected.map(w => w.grapeVarieties.join(', ') || '—')} />
              <Row label="Corps" values={selected.map(w => `${w.sensoryProfile.body}/100`)} />
              <Row label="Acidité" values={selected.map(w => `${w.sensoryProfile.acidity}/100`)} />
              <Row label="Tanins" values={selected.map(w => `${w.sensoryProfile.tannin}/100`)} />
              <Row label="Sucre" values={selected.map(w => `${w.sensoryProfile.sweetness}/100`)} />
              <Row label="Alcool" values={selected.map(w => `${w.sensoryProfile.alcohol}/100`)} />
              <Row label="Accords Mets" values={selected.map(w => w.suggestedFoodPairings.slice(0, 3).join(', ') || '—')} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; values: string[] }> = ({ label, values }) => (
  <tr>
    <td className="p-4 text-stone-500 dark:text-stone-400 font-medium text-xs uppercase tracking-wider whitespace-nowrap">{label}</td>
    {values.map((v, i) => (
      <td key={i} className="p-4 text-stone-800 dark:text-stone-200">{v}</td>
    ))}
  </tr>
);
