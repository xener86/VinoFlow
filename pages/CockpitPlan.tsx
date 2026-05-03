// Cockpit Plan — visual cellar map.
// Read-only overview inspired by the cave-proto layout:
//  - Limbo zone at the top (bottles waiting for a slot)
//  - All shelves shown side-by-side with horizontal scroll
//  - Each rack: dense 28px grid with column/row labels
//  - Color-coded cells (wine type), dashed for empty, no text inside
//  - Click slot → wine details
//
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

// Returns the visual class for a cell based on the wine type
const slotColor = (type: string | null | undefined, hovered: boolean, focused: boolean) => {
  let base = 'bg-white border border-dashed border-stone-300 dark:border-stone-700';
  if (type === 'RED')        base = 'bg-wine-700 border border-wine-800 dark:border-wine-900';
  else if (type === 'WHITE') base = 'bg-amber-100 dark:bg-amber-200 border border-amber-300';
  else if (type === 'ROSE')  base = 'bg-pink-200 border border-pink-300';
  else if (type === 'SPARKLING') base = 'bg-cyan-100 dark:bg-cyan-200 border border-cyan-300';
  else if (type === 'DESSERT')   base = 'bg-amber-300 border border-amber-400';
  else if (type === 'FORTIFIED') base = 'bg-orange-700 border border-orange-800';
  if (focused) base += ' ring-2 ring-wine-600 ring-offset-1 dark:ring-offset-stone-950';
  else if (hovered) base += ' ring-1 ring-wine-400';
  return base;
};

export const CockpitPlan: React.FC<CockpitPlanProps> = ({ embedded = false }) => {
  const { wines } = useWines();
  const { racks } = useRacks();
  const [hover, setHover] = useState<string | null>(null);

  // Build a rackId → { (x,y) → wine } map
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
        <div className="mb-5">
          <MonoLabel>VINOFLOW · INVENTAIRE · PLAN</MonoLabel>
          <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Plan de cave</h1>
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
        <span>{totalBottles} BTL en place · {limboBottles.length} en attente</span>
        <Link
          to="/cellar-map-classic"
          className="px-2.5 h-7 rounded border bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:border-stone-500 dark:hover:border-stone-500 inline-flex items-center gap-1 transition"
        >
          <ArrowLeftRight className="w-3 h-3" />
          ÉDITER
        </Link>
      </div>

      {/* Limbo */}
      <div className={`rounded-md p-3 mb-6 transition ${
        limboBottles.length > 0
          ? 'border border-amber-300 bg-amber-50/40 dark:bg-amber-900/10 dark:border-amber-900/50'
          : 'border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/40 dark:bg-stone-900/40'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`mono text-[10px] tracking-widest ${limboBottles.length ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`}>
            ▼ ZONE D'ATTENTE {limboBottles.length > 0 && `· ${limboBottles.length} EN ATTENTE`}
          </span>
        </div>
        {limboBottles.length === 0 ? (
          <div className="mono text-[10px] tracking-widest text-stone-400 italic py-1">
            Aucune bouteille en attente · les nouveaux ajouts atterrissent ici
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {limboBottles.slice(0, 24).map(({ wine, bottle }) => {
              const colorClass = wine.type === 'RED' ? 'bg-wine-700 border-wine-800'
                              : wine.type === 'WHITE' ? 'bg-amber-100 border-amber-300'
                              : wine.type === 'ROSE' ? 'bg-pink-200 border-pink-300'
                              : wine.type === 'SPARKLING' ? 'bg-cyan-100 border-cyan-300'
                              : 'bg-stone-300 border-stone-400';
              return (
                <Link
                  key={bottle.id}
                  to={`/wine/${wine.id}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:border-stone-500 dark:hover:border-stone-500 rounded-md transition"
                >
                  <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${colorClass}`} />
                  <span className="serif-it text-[12.5px] text-stone-900 dark:text-white leading-tight truncate max-w-[200px]">{wine.name}</span>
                  <span className="mono text-[9px] tracking-widest text-stone-500">{wine.vintage}</span>
                </Link>
              );
            })}
            {limboBottles.length > 24 && (
              <span className="mono text-[9px] text-stone-400 italic self-center">+ {limboBottles.length - 24} autres</span>
            )}
          </div>
        )}
      </div>

      {/* Shelves */}
      {shelves.length > 0 && (
        <div className="mb-6">
          <MonoLabel className="mb-3">▌ ÉTAGÈRES</MonoLabel>
          <div className="overflow-x-auto pb-3 -mx-2 px-2">
            <div className="flex items-start gap-6" style={{ minWidth: 'fit-content' }}>
              {shelves.map(rack => (
                <RackBlock
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

      {/* Boxes */}
      {boxes.length > 0 && (
        <div>
          <MonoLabel className="mb-3">📦 CAISSES</MonoLabel>
          <div className="overflow-x-auto pb-3 -mx-2 px-2">
            <div className="flex items-start gap-6" style={{ minWidth: 'fit-content' }}>
              {boxes.map(rack => (
                <RackBlock
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

      {/* Empty state */}
      {shelves.length === 0 && boxes.length === 0 && (
        <Card className="p-8 text-center">
          <div className="serif-it text-xl text-stone-700 dark:text-stone-300 mb-2">Pas encore d'emplacement</div>
          <p className="text-sm text-stone-500 mb-4">
            Crée tes étagères et caisses dans la <Link to="/cellar-map-classic" className="text-wine-700 hover:underline">vue éditable</Link>.
          </p>
        </Card>
      )}
    </div>
  );
};

// ────────────────────────────────────────────
// RackBlock — one shelf or box, dense grid layout
// ────────────────────────────────────────────
const RackBlock: React.FC<{
  rack: Rack;
  contents: Record<string, SlotInfo>;
  hover: string | null;
  onHover: (key: string | null) => void;
}> = ({ rack, contents, hover, onHover }) => {
  const filled = Object.values(contents).filter(Boolean).length;
  const total = rack.width * rack.height;

  // Pretty name handling: if rack name is just "Caisse de 6" (default-ish),
  // try to differentiate by appending a short ID suffix.
  const shortId = rack.id.slice(0, 4);

  return (
    <div className="shrink-0">
      {/* Header */}
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="serif text-lg text-stone-900 dark:text-white leading-none">{rack.name}</div>
          <div className="mono text-[9px] tracking-widest text-stone-500 mt-0.5">
            {rack.type === 'BOX' ? 'CAISSE' : 'ÉTAGÈRE'} · {rack.width}×{rack.height} · {shortId}
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
              const cellClass = slotColor(wineType, isHovered, false);

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
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-10 bg-stone-900 text-white text-[10px] px-2 py-0.5 rounded mono whitespace-nowrap shadow-lg pointer-events-none">
                        {info.wine.name} · {info.wine.vintage || '?'}
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
    </div>
  );
};
