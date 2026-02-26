import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { useWines } from '../hooks/useWines';
import { CellarWine } from '../types';
import {
  DEPT_TO_WINE_REGION,
  REGION_FILL,
  WINE_REGIONS,
  resolveWineRegion,
} from '../data/wineRegions';
import {
  Globe, MapPin, ArrowRight, Loader2, ZoomIn, ZoomOut, RotateCcw, Wine,
} from 'lucide-react';
import geoData from '../data/france-departments.json';

// ── Types ────────────────────────────────────────────────────────────
interface RegionData {
  name: string;
  wines: CellarWine[];
  totalBottles: number;
  dominantType: string;
}

// ── Component ────────────────────────────────────────────────────────
export const RegionMap: React.FC = () => {
  const { wines, loading } = useWines();
  const navigate = useNavigate();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [hoveredDept, setHoveredDept] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([2.5, 46.5]);

  // ── Group wines by wine region ───────────────────────────────────
  const { regionMap, unmapped } = useMemo(() => {
    const inStock = wines.filter(w => w.inventoryCount > 0);
    const rm: Record<string, RegionData> = {};
    const um: CellarWine[] = [];

    for (const w of inStock) {
      const wr = resolveWineRegion(w.region, w.appellation);
      if (wr) {
        if (!rm[wr]) rm[wr] = { name: wr, wines: [], totalBottles: 0, dominantType: 'RED' };
        rm[wr].wines.push(w);
        rm[wr].totalBottles += w.inventoryCount;
      } else {
        um.push(w);
      }
    }

    // Compute dominant type per region
    for (const rd of Object.values(rm)) {
      const tc: Record<string, number> = {};
      for (const w of rd.wines) tc[w.type] = (tc[w.type] || 0) + w.inventoryCount;
      rd.dominantType = Object.entries(tc).sort((a, b) => b[1] - a[1])[0]?.[0] || 'RED';
    }

    return { regionMap: rm, unmapped: um };
  }, [wines]);

  // Group unmapped by region name
  const unmappedGroups = useMemo(() => {
    const groups: Record<string, { wines: CellarWine[]; total: number }> = {};
    for (const w of unmapped) {
      const k = w.region || 'Inconnu';
      if (!groups[k]) groups[k] = { wines: [], total: 0 };
      groups[k].wines.push(w);
      groups[k].total += w.inventoryCount;
    }
    return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  }, [unmapped]);

  // ── Department color ─────────────────────────────────────────────
  const getDeptColor = useCallback((deptCode: string) => {
    const wr = DEPT_TO_WINE_REGION[deptCode];
    if (!wr) return undefined;
    const rd = regionMap[wr];
    if (!rd || rd.totalBottles === 0) return undefined;
    return REGION_FILL[wr] || '#78716c';
  }, [regionMap]);

  const getDeptOpacity = useCallback((deptCode: string) => {
    const wr = DEPT_TO_WINE_REGION[deptCode];
    if (!wr) return 0;
    const rd = regionMap[wr];
    if (!rd || rd.totalBottles === 0) return 0;
    if (selectedRegion) {
      return wr === selectedRegion ? 0.85 : 0.15;
    }
    return 0.7;
  }, [regionMap, selectedRegion]);

  // ── Hover ────────────────────────────────────────────────────────
  const handleMouseEnter = useCallback((deptCode: string, deptName: string, evt: React.MouseEvent) => {
    setHoveredDept(deptCode);
    const wr = DEPT_TO_WINE_REGION[deptCode];
    const rd = wr ? regionMap[wr] : null;
    const text = rd
      ? `${wr} — ${rd.totalBottles} btl (${rd.wines.length} vins)`
      : deptName;
    setTooltip({ x: evt.clientX, y: evt.clientY, text });
  }, [regionMap]);

  const handleMouseLeave = useCallback(() => {
    setHoveredDept(null);
    setTooltip(null);
  }, []);

  const handleMouseMove = useCallback((evt: React.MouseEvent) => {
    if (tooltip) setTooltip(t => t ? { ...t, x: evt.clientX, y: evt.clientY } : null);
  }, [tooltip]);

  // ── Click on department → select its wine region ─────────────────
  const handleDeptClick = useCallback((deptCode: string) => {
    const wr = DEPT_TO_WINE_REGION[deptCode];
    if (!wr || !regionMap[wr]) return;
    setSelectedRegion(prev => prev === wr ? null : wr);
  }, [regionMap]);

  // ── Selected wines ───────────────────────────────────────────────
  const selectedWines = useMemo(() => {
    if (!selectedRegion) return [];
    if (regionMap[selectedRegion]) return regionMap[selectedRegion].wines;
    const ug = unmappedGroups.find(([k]) => k === selectedRegion);
    return ug ? ug[1].wines : [];
  }, [selectedRegion, regionMap, unmappedGroups]);

  // ── Zoom controls ────────────────────────────────────────────────
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 8));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.5, 1));
  const handleReset = () => { setZoom(1); setCenter([2.5, 46.5]); };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-wine-600" size={48} />
    </div>
  );

  const totalRegions = Object.keys(regionMap).filter(k => regionMap[k].totalBottles > 0).length + unmappedGroups.length;
  const totalBottlesOnMap = Object.values(regionMap).reduce((s, r) => s + r.totalBottles, 0);

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-serif text-stone-800 dark:text-white flex items-center gap-3">
          <Globe className="text-wine-600 dark:text-wine-400" size={28} />
          Carte des Régions
        </h2>
        <p className="text-stone-500 dark:text-stone-400 text-sm mt-1">
          {totalRegions} région{totalRegions > 1 ? 's' : ''} • {totalBottlesOnMap} bouteille{totalBottlesOnMap > 1 ? 's' : ''} localisées
        </p>
      </div>

      {/* ── Map Card ────────────────────────────────────────────── */}
      <div className="relative bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <button onClick={handleZoomIn} className="w-8 h-8 bg-white/90 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700 rounded-lg flex items-center justify-center text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-sm backdrop-blur-sm">
            <ZoomIn size={16} />
          </button>
          <button onClick={handleZoomOut} className="w-8 h-8 bg-white/90 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700 rounded-lg flex items-center justify-center text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-sm backdrop-blur-sm">
            <ZoomOut size={16} />
          </button>
          <button onClick={handleReset} className="w-8 h-8 bg-white/90 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700 rounded-lg flex items-center justify-center text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-sm backdrop-blur-sm">
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Map */}
        <div onMouseMove={handleMouseMove}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [2.5, 46.5], scale: 2800 }}
            width={500}
            height={520}
            style={{ width: '100%', height: 'auto', maxHeight: '62vh' }}
          >
            <ZoomableGroup
              zoom={zoom}
              center={center}
              onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates as [number, number]); setZoom(z); }}
              minZoom={1}
              maxZoom={8}
            >
              <Geographies geography={geoData}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const deptCode = geo.properties.code as string;
                    const deptName = geo.properties.nom as string;
                    const wr = DEPT_TO_WINE_REGION[deptCode];
                    const color = getDeptColor(deptCode);
                    const opacity = getDeptOpacity(deptCode);
                    const isInSelectedRegion = selectedRegion && wr === selectedRegion;

                    return (
                      <Geography
                        key={geo.rpiKey}
                        geography={geo}
                        onMouseEnter={(evt: any) => handleMouseEnter(deptCode, deptName, evt)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleDeptClick(deptCode)}
                        style={{
                          default: {
                            fill: color || '#e7e5e4',
                            fillOpacity: color ? opacity : 1,
                            stroke: isInSelectedRegion ? '#7c3aed' : '#d6d3d1',
                            strokeWidth: isInSelectedRegion ? 0.8 : 0.3,
                            outline: 'none',
                            cursor: wr && regionMap[wr] ? 'pointer' : 'default',
                          },
                          hover: {
                            fill: color || '#d6d3d1',
                            fillOpacity: color ? Math.min((opacity || 0) + 0.2, 1) : 0.6,
                            stroke: color ? '#7c3aed' : '#a8a29e',
                            strokeWidth: 0.6,
                            outline: 'none',
                            cursor: wr && regionMap[wr] ? 'pointer' : 'default',
                          },
                          pressed: { outline: 'none' },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {/* Legend */}
        <div className="px-4 pb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px]">
          {WINE_REGIONS.filter(r => regionMap[r]?.totalBottles > 0).map(r => (
            <button
              key={r}
              onClick={() => setSelectedRegion(prev => prev === r ? null : r)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-all ${
                selectedRegion === r
                  ? 'bg-stone-100 dark:bg-stone-800 ring-1 ring-wine-500'
                  : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block border border-white/30"
                style={{ backgroundColor: REGION_FILL[r] }}
              />
              <span className="text-stone-600 dark:text-stone-400 font-medium">
                {r} ({regionMap[r].totalBottles})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-[100] pointer-events-none px-3 py-1.5 bg-stone-900/90 text-white text-xs rounded-lg shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x + 12, top: tooltip.y - 30 }}
        >
          {tooltip.text}
        </div>
      )}

      {/* ── Unmapped regions ──────────────────────────────────── */}
      {unmappedGroups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400">Autres régions / pays</h3>
          <div className="flex flex-wrap gap-2">
            {unmappedGroups.map(([name, data]) => (
              <button
                key={name}
                onClick={() => setSelectedRegion(selectedRegion === name ? null : name)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  selectedRegion === name
                    ? 'bg-wine-600 text-white border-wine-700'
                    : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800 hover:border-wine-300 dark:hover:border-wine-700'
                }`}
              >
                {name} ({data.total})
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
      {wines.filter(w => w.inventoryCount > 0).length === 0 && (
        <div className="text-center py-20 text-stone-500 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col items-center gap-3">
          <Wine size={48} className="opacity-30" />
          <p className="text-lg font-serif">Aucun vin en stock</p>
          <p className="text-sm">Ajoutez des vins pour voir la carte des régions.</p>
        </div>
      )}
    </div>
  );
};
