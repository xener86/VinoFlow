// Cockpit — carte des régions viticoles (France) : bouteilles en stock par région.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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
import { ChevronRight, ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';
import { Card, Chip, EmptyState, MonoLabel, Skeleton } from '../components/cockpit/primitives';
import geoData from '../data/france-departments.json';

// Couleurs de traits de la carte (jetons wine-700 / stone du design system)
const STROKE_SELECTED = '#7f1d1d';
const STROKE_DEFAULT = '#d6d3d1';
const STROKE_HOVER_EMPTY = '#a8a29e';

const TYPE_DOT: Record<string, string> = {
  RED: 'bg-wine-700', WHITE: 'bg-amber-300', ROSE: 'bg-pink-400',
  SPARKLING: 'bg-cyan-400', DESSERT: 'bg-orange-400', FORTIFIED: 'bg-stone-600',
};
const TYPE_LABEL: Record<string, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié',
};

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
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [, setHoveredDept] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([2.5, 46.5]);
  const listRef = useRef<HTMLDivElement>(null);

  // Sur mobile la liste est sous la carte : on la fait défiler à l'écran.
  useEffect(() => {
    if (!selectedRegion || typeof window === 'undefined' || window.innerWidth >= 768) return;
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedRegion]);

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
    const list = regionMap[selectedRegion]
      ? regionMap[selectedRegion].wines
      : unmappedGroups.find(([k]) => k === selectedRegion)?.[1].wines || [];
    return [...list].sort((a, b) => b.inventoryCount - a.inventoryCount || a.name.localeCompare(b.name));
  }, [selectedRegion, regionMap, unmappedGroups]);

  // ── Zoom controls ────────────────────────────────────────────────
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.5, 8));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.5, 1));
  const handleReset = () => { setZoom(1); setCenter([2.5, 46.5]); };

  const header = (subtitle: React.ReactNode) => (
    <div className="mb-5">
      <MonoLabel>VINOFLOW · ANALYSE</MonoLabel>
      <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Carte des régions</h1>
      <div className="text-[12px] text-stone-500 mt-0.5">{subtitle}</div>
    </div>
  );

  if (loading && wines.length === 0) return (
    <div className="max-w-[1100px] mx-auto" aria-busy="true">
      {header('Chargement…')}
      <div className="grid grid-cols-12 gap-5">
        <Skeleton className="col-span-12 md:col-span-7 h-[420px]" />
        <Skeleton className="col-span-12 md:col-span-5 h-[240px]" />
      </div>
    </div>
  );

  const totalRegions = Object.keys(regionMap).filter(k => regionMap[k].totalBottles > 0).length + unmappedGroups.length;
  const totalBottlesOnMap = Object.values(regionMap).reduce((s, r) => s + r.totalBottles, 0);
  const hasStock = wines.some(w => w.inventoryCount > 0);

  if (!hasStock) return (
    <div className="max-w-[1100px] mx-auto">
      {header('Aucune bouteille en stock')}
      <Card>
        <EmptyState
          title="Aucun vin en stock"
          hint="Ajoutez des vins pour voir la carte des régions"
          action={
            <Link to="/add-wine" className="inline-flex items-center h-10 md:h-9 px-3.5 rounded-md bg-wine-700 hover:bg-wine-800 text-white text-sm font-medium">
              Ajouter un vin
            </Link>
          }
        />
      </Card>
    </div>
  );

  const zoomBtn = 'w-10 h-10 md:w-8 md:h-8 bg-white/95 border border-stone-200 rounded-md flex items-center justify-center text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors';
  const selectedBottles = selectedWines.reduce((s, w) => s + w.inventoryCount, 0);

  return (
    <div className="max-w-[1100px] mx-auto">
      {header(
        <>
          {totalRegions} région{totalRegions > 1 ? 's' : ''} · {totalBottlesOnMap} bouteille{totalBottlesOnMap > 1 ? 's' : ''} localisée{totalBottlesOnMap > 1 ? 's' : ''} en France
        </>,
      )}

      <div className="grid grid-cols-12 gap-4 md:gap-5">
        {/* ── Carte ─────────────────────────────────────────────── */}
        <div className="col-span-12 md:col-span-7 space-y-4">
          <Card className="relative overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3">
              <MonoLabel>◌ France · vignobles</MonoLabel>
              <span className="mono text-[10px] tracking-widest text-stone-400 uppercase hidden sm:inline">Clic = filtrer</span>
            </div>

            {/* Zoom */}
            <div className="absolute top-10 right-3 z-10 flex flex-col gap-1">
              <button type="button" onClick={handleZoomIn} className={zoomBtn} aria-label="Zoomer"><ZoomIn className="w-4 h-4" /></button>
              <button type="button" onClick={handleZoomOut} className={zoomBtn} aria-label="Dézoomer"><ZoomOut className="w-4 h-4" /></button>
              <button type="button" onClick={handleReset} className={zoomBtn} aria-label="Recentrer la carte"><RotateCcw className="w-3.5 h-3.5" /></button>
            </div>

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
                        const clickable = !!(wr && regionMap[wr]);

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
                                stroke: isInSelectedRegion ? STROKE_SELECTED : STROKE_DEFAULT,
                                strokeWidth: isInSelectedRegion ? 0.8 : 0.3,
                                outline: 'none',
                                cursor: clickable ? 'pointer' : 'default',
                              },
                              hover: {
                                fill: color || '#d6d3d1',
                                fillOpacity: color ? Math.min((opacity || 0) + 0.2, 1) : 0.6,
                                stroke: color ? STROKE_SELECTED : STROKE_HOVER_EMPTY,
                                strokeWidth: 0.6,
                                outline: 'none',
                                cursor: clickable ? 'pointer' : 'default',
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

            {/* Légende = filtres */}
            <div className="px-3 pb-3 pt-1 border-t border-stone-100 flex flex-wrap items-center gap-1.5">
              {WINE_REGIONS.filter(r => regionMap[r]?.totalBottles > 0).map(r => {
                const active = selectedRegion === r;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedRegion(prev => prev === r ? null : r)}
                    className={`inline-flex items-center gap-1.5 h-9 md:h-7 px-2.5 rounded-full border text-xs transition-colors ${
                      active
                        ? 'border-wine-700 bg-wine-50 text-wine-800'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: REGION_FILL[r] }} />
                    {r}
                    <span className="mono text-[10px] text-stone-400 tabular-nums">{regionMap[r].totalBottles}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ── Hors carte ─────────────────────────────────────── */}
          {unmappedGroups.length > 0 && (
            <Card className="p-4">
              <MonoLabel>◌ Autres régions / pays</MonoLabel>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {unmappedGroups.map(([name, data]) => (
                  <Chip
                    key={name}
                    type="button"
                    active={selectedRegion === name}
                    aria-pressed={selectedRegion === name}
                    onClick={() => setSelectedRegion(selectedRegion === name ? null : name)}
                    className="h-9 md:h-7"
                  >
                    {name}
                    <span className={`mono text-[10px] tabular-nums ${selectedRegion === name ? 'text-white/70' : 'text-stone-400'}`}>{data.total}</span>
                  </Chip>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Vins de la région sélectionnée ─────────────────────── */}
        <div ref={listRef} className="col-span-12 md:col-span-5 scroll-mt-20">
          <Card className="md:sticky md:top-20">
            {selectedRegion && selectedWines.length > 0 ? (
              <>
                <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-stone-100">
                  <div className="flex-1 min-w-0">
                    <MonoLabel>◌ Région sélectionnée</MonoLabel>
                    <h2 className="serif text-xl text-stone-900 leading-tight mt-1 flex items-center gap-2">
                      {REGION_FILL[selectedRegion] && (
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: REGION_FILL[selectedRegion] }} />
                      )}
                      <span className="truncate">{selectedRegion}</span>
                    </h2>
                    <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mt-1">
                      {selectedBottles} btl · {selectedWines.length} vin{selectedWines.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedRegion(null)}
                    aria-label="Effacer la sélection"
                    className="-mr-2 h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ul className="divide-y divide-stone-100 md:max-h-[60vh] md:overflow-y-auto">
                  {selectedWines.map(wine => (
                    <li key={wine.id}>
                      <Link
                        to={`/wine/${wine.id}`}
                        className="group flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-stone-50 transition-colors"
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPE_DOT[wine.type] || 'bg-stone-400'}`}
                          title={TYPE_LABEL[wine.type] || wine.type}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-stone-900 truncate group-hover:text-wine-700">
                            {wine.name}{wine.cuvee ? <span className="serif-it text-stone-600"> · {wine.cuvee}</span> : null}
                          </div>
                          <div className="text-[12px] text-stone-500 truncate">
                            {[wine.producer, wine.vintage, wine.appellation].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <span className="mono text-[11px] text-stone-600 tabular-nums shrink-0">{wine.inventoryCount} btl</span>
                        <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-wine-700 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                title="Choisissez une région"
                hint="Touchez la carte ou une pastille de la légende"
              />
            )}
          </Card>
        </div>
      </div>

      {/* Tooltip (souris) */}
      {tooltip && (
        <div
          className="fixed z-[100] pointer-events-none px-2.5 py-1 bg-stone-900/90 text-white text-xs rounded-md shadow-lg whitespace-nowrap hidden md:block"
          style={{ left: tooltip.x + 12, top: tooltip.y - 30 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};
