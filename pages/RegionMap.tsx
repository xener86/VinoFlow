import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWines } from '../hooks/useWines';
import { CellarWine } from '../types';
import { Globe, MapPin, ArrowRight, Loader2 } from 'lucide-react';

// ── France outline (simplified "Hexagone") ──────────────────────────
const FRANCE_PATH = `
  M 180,15 Q 210,5 245,15 L 275,30 Q 305,48 335,78
  Q 355,105 360,140 Q 363,175 355,210 Q 347,240 335,260
  Q 328,275 332,300 Q 338,330 342,355 Q 338,375 318,390
  Q 295,405 265,412 Q 235,416 205,408 Q 175,398 148,380
  Q 120,355 100,328 Q 82,302 75,275 Q 68,248 65,218
  Q 60,190 50,178 Q 42,172 52,160 Q 65,148 72,135
  Q 85,110 102,88 Q 122,60 148,38 Q 165,22 180,15 Z
`;

const CORSE_PATH = `M 372,362 Q 378,370 380,388 Q 380,402 374,410 Q 368,405 365,390 Q 364,372 372,362 Z`;

// ── Wine region positions on the SVG ────────────────────────────────
interface RegionConfig { x: number; y: number; label: string }

const REGION_POSITIONS: Record<string, RegionConfig> = {
  'Bordeaux':              { x: 108, y: 288, label: 'Bordeaux' },
  'Bourgogne':             { x: 268, y: 198, label: 'Bourgogne' },
  'Vallée du Rhône':       { x: 278, y: 300, label: 'Rhône' },
  'Rhône':                 { x: 278, y: 300, label: 'Rhône' },
  'Loire':                 { x: 168, y: 195, label: 'Loire' },
  'Val de Loire':          { x: 168, y: 195, label: 'Loire' },
  'Alsace':                { x: 340, y: 128, label: 'Alsace' },
  'Champagne':             { x: 255, y: 78, label: 'Champagne' },
  'Languedoc':             { x: 218, y: 375, label: 'Languedoc' },
  'Languedoc-Roussillon':  { x: 218, y: 375, label: 'Languedoc' },
  'Roussillon':            { x: 198, y: 392, label: 'Roussillon' },
  'Provence':              { x: 312, y: 358, label: 'Provence' },
  'Sud-Ouest':             { x: 138, y: 352, label: 'Sud-Ouest' },
  'Beaujolais':            { x: 262, y: 245, label: 'Beaujolais' },
  'Jura':                  { x: 315, y: 202, label: 'Jura' },
  'Savoie':                { x: 330, y: 248, label: 'Savoie' },
  'Corse':                 { x: 374, y: 386, label: 'Corse' },
};

// Accent-insensitive match
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const findRegionConfig = (region: string): RegionConfig | null => {
  if (REGION_POSITIONS[region]) return REGION_POSITIONS[region];
  const n = norm(region);
  for (const [key, cfg] of Object.entries(REGION_POSITIONS)) {
    if (norm(key) === n || n.includes(norm(key)) || norm(key).includes(n)) return cfg;
  }
  return null;
};

// ── Types ───────────────────────────────────────────────────────────
interface RegionData {
  key: string;        // unique key (label-based, deduplicated)
  names: string[];    // original region names merged here
  label: string;
  wines: CellarWine[];
  totalBottles: number;
  dominantType: string;
  x: number;
  y: number;
}

// ── Bubble helpers ──────────────────────────────────────────────────
const bubbleColor = (type: string) => {
  switch (type) {
    case 'RED':       return { fill: '#dc2626', stroke: '#991b1b', text: '#fff' };
    case 'WHITE':     return { fill: '#eab308', stroke: '#a16207', text: '#1c1917' };
    case 'ROSE':      return { fill: '#ec4899', stroke: '#be185d', text: '#fff' };
    case 'SPARKLING': return { fill: '#f59e0b', stroke: '#d97706', text: '#1c1917' };
    default:          return { fill: '#78716c', stroke: '#57534e', text: '#fff' };
  }
};

// ── Component ───────────────────────────────────────────────────────
export const RegionMap: React.FC = () => {
  const { wines, loading } = useWines();
  const navigate = useNavigate();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // Group wines by region, then by map position
  const { mapped, unmapped } = useMemo(() => {
    const inStock = wines.filter(w => w.inventoryCount > 0);
    const byRegion: Record<string, CellarWine[]> = {};
    for (const w of inStock) {
      const r = w.region || 'Inconnu';
      (byRegion[r] ??= []).push(w);
    }

    // Merge regions sharing the same map position
    const posGroups: Record<string, { cfg: RegionConfig; wines: CellarWine[]; names: string[] }> = {};
    const unmappedList: { name: string; wines: CellarWine[]; total: number }[] = [];

    for (const [region, rw] of Object.entries(byRegion)) {
      const cfg = findRegionConfig(region);
      if (cfg) {
        const k = `${cfg.x}-${cfg.y}`;
        if (!posGroups[k]) posGroups[k] = { cfg, wines: [], names: [] };
        posGroups[k].wines.push(...rw);
        if (!posGroups[k].names.includes(region)) posGroups[k].names.push(region);
      } else {
        unmappedList.push({ name: region, wines: rw, total: rw.reduce((s, w) => s + w.inventoryCount, 0) });
      }
    }

    const mappedList: RegionData[] = Object.values(posGroups).map(({ cfg, wines: gw, names }) => {
      const totalBottles = gw.reduce((s, w) => s + w.inventoryCount, 0);
      const tc: Record<string, number> = {};
      for (const w of gw) tc[w.type] = (tc[w.type] || 0) + w.inventoryCount;
      const dominantType = Object.entries(tc).sort((a, b) => b[1] - a[1])[0]?.[0] || 'RED';
      return { key: cfg.label, names, label: cfg.label, wines: gw, totalBottles, dominantType, x: cfg.x, y: cfg.y };
    });

    return {
      mapped: mappedList.sort((a, b) => b.totalBottles - a.totalBottles),
      unmapped: unmappedList.sort((a, b) => b.total - a.total),
    };
  }, [wines]);

  const maxBtl = Math.max(...mapped.map(r => r.totalBottles), 1);
  const bubbleR = (n: number) => Math.max(10, Math.sqrt(n / maxBtl) * 30);

  // Wines for the selected region
  const selectedWines = useMemo(() => {
    if (!selectedRegion) return [];
    const m = mapped.find(r => r.key === selectedRegion);
    if (m) return m.wines;
    const u = unmapped.find(r => r.name === selectedRegion);
    return u?.wines || [];
  }, [selectedRegion, mapped, unmapped]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-wine-600" size={48} />
    </div>
  );

  const totalRegions = mapped.length + unmapped.length;

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-serif text-stone-800 dark:text-white flex items-center gap-3">
          <Globe className="text-wine-600 dark:text-wine-400" size={28} />
          Carte des Régions
        </h2>
        <p className="text-stone-500 dark:text-stone-400 text-sm mt-1">
          {totalRegions} région{totalRegions > 1 ? 's' : ''} représentée{totalRegions > 1 ? 's' : ''} dans votre cave
        </p>
      </div>

      {/* ── SVG Map ────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 shadow-sm">
        <svg viewBox="0 0 420 430" className="w-full max-w-md mx-auto select-none" style={{ maxHeight: '55vh' }}>
          {/* France fill */}
          <path d={FRANCE_PATH} className="fill-stone-100 dark:fill-stone-800/40" />
          <path d={FRANCE_PATH} className="fill-none stroke-stone-300 dark:stroke-stone-700" strokeWidth="1.5" />
          {/* Corse fill + stroke */}
          <path d={CORSE_PATH} className="fill-stone-100 dark:fill-stone-800/40" />
          <path d={CORSE_PATH} className="fill-none stroke-stone-300 dark:stroke-stone-700" strokeWidth="1.5" />

          {/* Region bubbles */}
          {mapped.map(region => {
            const r = bubbleR(region.totalBottles);
            const c = bubbleColor(region.dominantType);
            const isSel = selectedRegion === region.key;

            return (
              <g
                key={region.key}
                onClick={() => setSelectedRegion(isSel ? null : region.key)}
                className="cursor-pointer"
              >
                {/* Drop shadow */}
                <circle cx={region.x + 1} cy={region.y + 1} r={r} fill="black" opacity={0.08} />
                {/* Bubble */}
                <circle
                  cx={region.x} cy={region.y} r={r}
                  fill={c.fill}
                  stroke={isSel ? '#7c3aed' : c.stroke}
                  strokeWidth={isSel ? 3 : 1.5}
                  opacity={selectedRegion && !isSel ? 0.4 : 0.9}
                  className="transition-opacity duration-200"
                />
                {/* Count */}
                <text
                  x={region.x} y={region.y + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={c.text} fontSize={r > 20 ? 11 : 9} fontWeight="bold"
                  className="pointer-events-none"
                >
                  {region.totalBottles}
                </text>
                {/* Label below */}
                <text
                  x={region.x} y={region.y + r + 11}
                  textAnchor="middle" fontSize="9" fontWeight="500"
                  className="fill-stone-500 dark:fill-stone-400 pointer-events-none"
                >
                  {region.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-stone-500 dark:text-stone-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Rouge</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> Blanc</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block" /> Rosé</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Bulles</span>
        </div>
      </div>

      {/* ── Unmapped regions (non-French, etc.) ───────────────── */}
      {unmapped.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400">Autres régions / pays</h3>
          <div className="flex flex-wrap gap-2">
            {unmapped.map(r => (
              <button
                key={r.name}
                onClick={() => setSelectedRegion(selectedRegion === r.name ? null : r.name)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  selectedRegion === r.name
                    ? 'bg-wine-600 text-white border-wine-700'
                    : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800 hover:border-wine-300 dark:hover:border-wine-700'
                }`}
              >
                {r.name} ({r.total})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Selected region wine list ─────────────────────────── */}
      {selectedRegion && selectedWines.length > 0 && (
        <div className="space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-serif text-stone-800 dark:text-white flex items-center gap-2">
              <MapPin size={16} className="text-wine-600 dark:text-wine-400" />
              {selectedRegion}
            </h3>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {selectedWines.reduce((s, w) => s + w.inventoryCount, 0)} btl • {selectedWines.length} vin{selectedWines.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {selectedWines.map(wine => (
              <div
                key={wine.id}
                onClick={() => navigate(`/wine/${wine.id}`)}
                className="flex items-center justify-between p-3 bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl cursor-pointer hover:border-wine-300 dark:hover:border-wine-700 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-700 dark:text-stone-300 truncate">{wine.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-500">
                    {wine.producer} • {wine.vintage}{wine.appellation ? ` • ${wine.appellation}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    wine.type === 'RED' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' :
                    wine.type === 'WHITE' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300' :
                    wine.type === 'ROSE' ? 'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300' :
                    'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                  }`}>
                    {wine.inventoryCount} btl
                  </span>
                  <ArrowRight size={14} className="text-stone-300 group-hover:text-wine-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty */}
      {totalRegions === 0 && (
        <div className="text-center py-20 text-stone-500 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col items-center gap-3">
          <Globe size={48} className="opacity-30" />
          <p className="text-lg font-serif">Aucun vin en stock</p>
          <p className="text-sm">Ajoutez des vins pour voir la carte des régions.</p>
        </div>
      )}
    </div>
  );
};
