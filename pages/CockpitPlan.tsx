// Cockpit Plan — visual cellar map (faithful port of design-protos/proto/cellar-map.jsx).
//   - Limbo zone (bottles waiting for a slot)
//   - All shelves shown side-by-side with horizontal scroll, dense 28px grid
//   - Cases in a 12-col grid with mini-grid + label + lot list (small/large variants)
//   - Color-coded cells (wine type), dashed for empty
//   - Click slot → wine details
// For drag-drop / structural editing → /cellar-map-classic.

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useRacks } from '../hooks/useRacks';
import { Card, MonoLabel } from '../components/cockpit/primitives';
import { CellarWine, Bottle, Rack } from '../types';

interface CockpitPlanProps {
  embedded?: boolean;
}

type SlotInfo = { wine: CellarWine; bottle: Bottle } | null;

// Wine type → cell color
const typeToCellClass: Record<string, string> = {
  RED:       'bg-wine-700 border-wine-800',
  WHITE:     'bg-amber-100 border-amber-300',
  ROSE:      'bg-pink-200 border-pink-300',
  SPARKLING: 'bg-cyan-100 border-cyan-300',
  DESSERT:   'bg-amber-300 border-amber-400',
  FORTIFIED: 'bg-orange-700 border-orange-800',
};

const slotColor = (type: string | null | undefined, hovered: boolean) => {
  let base = 'bg-white dark:bg-stone-800/40 border border-dashed border-stone-300 dark:border-stone-700';
  if (type && typeToCellClass[type]) base = `border ${typeToCellClass[type]}`;
  if (hovered) base += ' ring-1 ring-stone-900/40 dark:ring-white/40';
  return base;
};

// Two color shades per case lot (so multiple wines in the same case look distinct)
const CASE_LOT_PALETTE: Record<string, string>[] = [
  { RED: 'bg-wine-700 border-wine-800', WHITE: 'bg-amber-200 border-amber-400', ROSE: 'bg-pink-200 border-pink-300', SPARKLING: 'bg-cyan-200 border-cyan-400', DESSERT: 'bg-amber-300 border-amber-400', FORTIFIED: 'bg-orange-700 border-orange-800' },
  { RED: 'bg-wine-400 border-wine-500', WHITE: 'bg-amber-400 border-amber-600', ROSE: 'bg-pink-300 border-pink-400', SPARKLING: 'bg-cyan-300 border-cyan-500', DESSERT: 'bg-amber-200 border-amber-300', FORTIFIED: 'bg-orange-500 border-orange-700' },
];

export const CockpitPlan: React.FC<CockpitPlanProps> = ({ embedded = false }) => {
  const { wines } = useWines();
  const { racks } = useRacks();
  const [hover, setHover] = useState<string | null>(null);

  // rackId → { (x,y) → wine } for shelves
  const rackContents = useMemo(() => {
    const map: Record<string, Record<string, SlotInfo>> = {};
    for (const wine of wines) {
      for (const bottle of wine.bottles || []) {
        if (bottle.isConsumed) continue;
        if (typeof bottle.location === 'object' && bottle.location && 'rackId' in bottle.location) {
          const loc = bottle.location;
          if (!map[loc.rackId]) map[loc.rackId] = {};
          map[loc.rackId][`${loc.x}-${loc.y}`] = { wine, bottle };
        }
      }
    }
    return map;
  }, [wines]);

  // Bottles in "limbo" (no rack)
  const limboBottles = useMemo(() => {
    const list: { wine: CellarWine; bottle: Bottle }[] = [];
    for (const wine of wines) {
      for (const bottle of wine.bottles || []) {
        if (bottle.isConsumed) continue;
        if (typeof bottle.location === 'string' || !bottle.location) {
          list.push({ wine, bottle });
        }
      }
    }
    return list;
  }, [wines]);

  // Sort racks: shelves first, then boxes
  const allRacks = useMemo(
    () => [...(racks || [])].sort((a, b) => {
      const aShelf = a.type !== 'BOX' ? 0 : 1;
      const bShelf = b.type !== 'BOX' ? 0 : 1;
      if (aShelf !== bShelf) return aShelf - bShelf;
      return a.name.localeCompare(b.name);
    }),
    [racks]
  );

  const shelves = allRacks.filter(r => r.type !== 'BOX');
  const boxes = allRacks.filter(r => r.type === 'BOX');

  const totalBottles = Object.values(rackContents).reduce(
    (s, slots) => s + Object.values(slots).filter(Boolean).length,
    0
  );

  return (
    <div>
      {!embedded && (
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <MonoLabel>VINOFLOW · INVENTAIRE</MonoLabel>
            <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Plan de cave</h1>
            <div className="mono text-[10px] tracking-widest text-stone-500 mt-2">▢ PLAN · VUE DE DESSUS</div>
          </div>
          <span className="mono text-[10px] tracking-widest text-stone-500 hidden md:block">CLIC = OUVRIR LA FICHE</span>
        </div>
      )}

      {/* Legend + edit link */}
      <div className="flex items-center gap-4 mono text-[10px] tracking-widest text-stone-600 dark:text-stone-400 flex-wrap mb-5">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-wine-700 rounded-sm border border-wine-800" />ROUGE</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-100 rounded-sm border border-amber-300" />BLANC</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-pink-200 rounded-sm border border-pink-300" />ROSÉ</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-cyan-100 rounded-sm border border-cyan-300" />BULLES</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-white rounded-sm border border-stone-300 border-dashed" />VIDE</span>
        <div className="flex-1" />
        <span>{totalBottles} BTL EN PLACE · {limboBottles.length} EN ATTENTE</span>
        <Link
          to="/cellar-map-classic"
          className="px-2.5 h-7 rounded border bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:border-wine-700 hover:text-wine-700 inline-flex items-center gap-1 transition"
        >
          <ArrowLeftRight className="w-3 h-3" />
          ÉDITER STRUCTURE
        </Link>
      </div>

      {/* LIMBO / unloading zone */}
      <div className={`rounded-lg p-3 mb-6 transition ${
        limboBottles.length > 0
          ? 'border border-amber-300 bg-amber-50/40 dark:bg-amber-900/10 dark:border-amber-900/50'
          : 'border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/40 dark:bg-stone-900/40'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`mono text-[10px] tracking-widest ${limboBottles.length ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`}>
            ▼ ZONE DE DÉCHARGEMENT {limboBottles.length > 0 && `· ${limboBottles.length} EN ATTENTE`}
          </span>
        </div>
        {limboBottles.length === 0 ? (
          <div className="mono text-[10px] tracking-widest text-stone-400 italic py-2">
            Aucune bouteille en attente · les nouveaux ajouts atterrissent ici
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {limboBottles.slice(0, 36).map(({ wine, bottle }) => {
              const cls = typeToCellClass[wine.type] || 'bg-stone-300 border-stone-400';
              return (
                <Link
                  key={bottle.id}
                  to={`/wine/${wine.id}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:border-wine-700 rounded-md transition"
                >
                  <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${cls}`} />
                  <span className="serif-it text-[12.5px] text-stone-900 dark:text-white leading-tight truncate max-w-[200px]">{wine.name}</span>
                  <span className="mono text-[9px] tracking-widest text-stone-500">{wine.vintage}</span>
                </Link>
              );
            })}
            {limboBottles.length > 36 && (
              <span className="mono text-[9px] text-stone-400 italic self-center">+ {limboBottles.length - 36} autres</span>
            )}
          </div>
        )}
      </div>

      {/* SHELVES */}
      {shelves.length > 0 && (
        <div className="mb-8">
          <MonoLabel className="mb-3">▌ ÉTAGÈRES</MonoLabel>
          <div className="overflow-x-auto pb-3 -mx-2 px-2">
            <div className="flex items-start gap-6" style={{ minWidth: 'fit-content' }}>
              {shelves.map(rack => (
                <ShelfBlock
                  key={rack.id}
                  rack={rack}
                  contents={rackContents[rack.id] || {}}
                  hover={hover}
                  onHover={setHover}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CASES */}
      {boxes.length > 0 && (
        <div>
          <MonoLabel className="mb-3">▢ CAISSES</MonoLabel>
          <div className="grid grid-cols-12 gap-2.5">
            {boxes.map(rack => (
              <CaseBlock
                key={rack.id}
                rack={rack}
                contents={rackContents[rack.id] || {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {shelves.length === 0 && boxes.length === 0 && (
        <Card className="p-8 text-center">
          <div className="serif-it text-xl text-stone-700 dark:text-stone-300 mb-2">Pas encore d'emplacement</div>
          <p className="text-sm text-stone-500 mb-4">
            Crée tes étagères et caisses dans la <Link to="/cellar-map-classic" className="text-wine-700 hover:underline">vue éditable</Link>.
          </p>
        </Card>
      )}

      <div className="mono text-[10px] text-stone-500 italic pt-3 mt-6 border-t border-stone-200 dark:border-stone-800">
        Vue lecture · adressage <span className="text-stone-700 dark:text-stone-300">[Étagère][Colonne]-[Rangée]</span> · pour réorganiser, ouvrir le mode édition
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// ShelfBlock — one shelf, dense grid layout
// ────────────────────────────────────────────
const ShelfBlock: React.FC<{
  rack: Rack;
  contents: Record<string, SlotInfo>;
  hover: string | null;
  onHover: (key: string | null) => void;
}> = ({ rack, contents, hover, onHover }) => {
  const filled = Object.values(contents).filter(Boolean).length;
  const total = rack.width * rack.height;
  const shortId = rack.id.slice(0, 4).toUpperCase();

  return (
    <div className="shrink-0">
      {/* Header */}
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="serif text-lg text-stone-900 dark:text-white leading-none">{rack.name}</div>
          <div className="mono text-[9px] tracking-widest text-stone-500 mt-0.5">
            ÉTAGÈRE · {rack.width}×{rack.height} · {shortId}
          </div>
        </div>
        <div className="mono text-[10px] text-stone-600 dark:text-stone-400">{filled}/{total}</div>
      </div>

      {/* Grid */}
      <div className="border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/40 p-2 rounded-sm">
        {/* Column labels */}
        <div className="grid mb-1" style={{ gridTemplateColumns: `16px repeat(${rack.width}, 28px)`, gap: '4px' }}>
          <span />
          {Array.from({ length: rack.width }).map((_, c) => (
            <span key={c} className="mono text-[9px] text-stone-400 text-center">{c + 1}</span>
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rack.height }).map((_, rIdx) => (
          <div key={rIdx} className="grid mb-1 last:mb-0" style={{ gridTemplateColumns: `16px repeat(${rack.width}, 28px)`, gap: '4px' }}>
            <span className="mono text-[9px] text-stone-400 self-center text-right pr-1">{String.fromCharCode(65 + rIdx)}</span>
            {Array.from({ length: rack.width }).map((_, cIdx) => {
              const key = `${cIdx}-${rIdx}`;
              const info = contents[key];
              const wineType = info?.wine.type;
              const slotName = `${rack.id}/${key}`;
              const isHovered = hover === slotName;
              const cellClass = slotColor(wineType, isHovered);

              if (info) {
                return (
                  <Link
                    key={cIdx}
                    to={`/wine/${info.wine.id}`}
                    onMouseEnter={() => onHover(slotName)}
                    onMouseLeave={() => onHover(null)}
                    className={`relative w-7 h-7 rounded-sm transition cursor-pointer ${cellClass}`}
                    title={`${rack.name} ${String.fromCharCode(65 + rIdx)}${cIdx + 1} · ${info.wine.name} ${info.wine.vintage || ''}`}
                  >
                    {isHovered && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-30 bg-stone-900 text-white px-3 py-1.5 rounded text-[11px] whitespace-nowrap shadow-lg pointer-events-none">
                        <div className="serif-it leading-tight">{info.wine.name}</div>
                        <div className="mono text-[9px] tracking-widest text-stone-400 mt-0.5">{String.fromCharCode(65 + rIdx)}{cIdx + 1} · {info.wine.vintage || '?'}</div>
                      </div>
                    )}
                  </Link>
                );
              }

              return (
                <div
                  key={cIdx}
                  onMouseEnter={() => onHover(slotName)}
                  onMouseLeave={() => onHover(null)}
                  className={`w-7 h-7 rounded-sm transition ${cellClass}`}
                  title={`${rack.name} ${String.fromCharCode(65 + rIdx)}${cIdx + 1} · vide`}
                />
              );
            })}
          </div>
        ))}
      </div>
      {/* Wood-shelf base accent */}
      <div className="h-1 bg-stone-300 dark:bg-stone-700 mx-2 mt-1 rounded-b" />
    </div>
  );
};

// ────────────────────────────────────────────
// CaseBlock — one case (mini grid + label + lot list)
// Faithful port of cellar-map.jsx CASES section.
// ────────────────────────────────────────────
const CaseBlock: React.FC<{
  rack: Rack;
  contents: Record<string, SlotInfo>;
}> = ({ rack, contents }) => {
  const capacity = rack.width * rack.height;
  const isLarge = capacity >= 12;
  // Cells grid: keep 28px squares, lay out with rack's dimensions
  const cols = rack.width;
  const span = isLarge ? 'col-span-3' : 'col-span-2';

  // Group slots by wine to assign distinct shades to each lot in the case
  const lots = useMemo(() => {
    const m = new Map<string, { wine: CellarWine; qty: number }>();
    for (const info of Object.values(contents)) {
      if (!info) continue;
      const k = info.wine.id;
      if (!m.has(k)) m.set(k, { wine: info.wine, qty: 0 });
      m.get(k)!.qty += 1;
    }
    return [...m.values()];
  }, [contents]);

  const filled = lots.reduce((a, l) => a + l.qty, 0);

  // Build flat slot list: for each lot, push qty copies in order
  const flatSlots: { wine: CellarWine; lotIdx: number }[] = [];
  lots.forEach((lot, lotIdx) => {
    for (let i = 0; i < lot.qty; i++) flatSlots.push({ wine: lot.wine, lotIdx });
  });

  return (
    <div className={`${span} border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/40 rounded p-2.5`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="mono text-[9px] tracking-widest text-stone-500">{rack.id.slice(0, 6).toUpperCase()}</div>
        <div className="mono text-[10px] text-stone-700 dark:text-stone-300">{filled}/{capacity}</div>
      </div>

      {/* Mini grid */}
      <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `repeat(${cols}, 28px)` }}>
        {Array.from({ length: capacity }).map((_, i) => {
          const slot = flatSlots[i];
          if (!slot) {
            return <div key={i} className="w-7 h-7 rounded-sm border bg-white dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 border-dashed" />;
          }
          const palette = CASE_LOT_PALETTE[slot.lotIdx % CASE_LOT_PALETTE.length];
          const fill = palette[slot.wine.type] || palette.RED;
          return (
            <Link
              key={i}
              to={`/wine/${slot.wine.id}`}
              title={`${slot.wine.name} · ${slot.wine.vintage || '?'}`}
              className={`w-7 h-7 rounded-sm border cursor-pointer transition hover:ring-1 hover:ring-stone-900/40 ${fill}`}
            />
          );
        })}
      </div>

      {/* Label */}
      <div className="mb-2">
        <div className="serif text-[12px] text-stone-900 dark:text-white">{rack.name}</div>
      </div>

      {/* Lot list */}
      <div className="space-y-0.5">
        {lots.length === 0 ? (
          <div className="mono text-[9px] tracking-widest text-stone-400 italic">VIDE</div>
        ) : lots.map((lot, i) => {
          const palette = CASE_LOT_PALETTE[i % CASE_LOT_PALETTE.length];
          const swatch = palette[lot.wine.type] || palette.RED;
          return (
            <Link
              key={lot.wine.id}
              to={`/wine/${lot.wine.id}`}
              className="flex items-center gap-1.5 text-[10.5px] hover:bg-white dark:hover:bg-stone-800/60 rounded -mx-0.5 px-0.5 transition"
              title={`${lot.wine.name} · ${lot.wine.vintage || '?'} · ×${lot.qty}`}
            >
              <span className={`w-2 h-2 rounded-[2px] border shrink-0 ${swatch}`} />
              <span className="serif-it text-stone-800 dark:text-stone-200 truncate flex-1 leading-tight">{lot.wine.name}</span>
              <span className="mono text-[9px] text-stone-500 shrink-0">×{lot.qty}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
