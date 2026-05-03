// Cockpit Plan — visual cellar map.
// Read-mostly view of every rack with bottles in their slots.
// For drag-drop / heavy editing, fall back to /cellar-map-classic.

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine as WineIcon, Inbox, Boxes, ArrowLeftRight } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useRacks } from '../hooks/useRacks';
import { Card, MonoLabel, Badge, Chip } from '../components/cockpit/primitives';
import { CellarWine, Bottle, Rack } from '../types';

const colorDot = (type: string): string => {
  switch (type) {
    case 'RED': return 'bg-wine-700';
    case 'WHITE': return 'bg-amber-300';
    case 'ROSE': return 'bg-pink-400';
    case 'SPARKLING': return 'bg-cyan-400';
    case 'DESSERT': return 'bg-amber-500';
    case 'FORTIFIED': return 'bg-orange-700';
    default: return 'bg-stone-400';
  }
};

const slotLabel = (x: number, y: number): string => `${String.fromCharCode(65 + y)}${x + 1}`;

type SlotInfo = { wine: CellarWine; bottle: Bottle } | null;

export const CockpitPlan: React.FC = () => {
  const { wines } = useWines();
  const { racks } = useRacks();
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<{ rackId: string; x: number; y: number } | null>(null);

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

  // Wines without a rack (in "Non trié")
  const unsortedBottles = useMemo(() => {
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

  // Default: show first rack (alphabetical)
  const sortedRacks = useMemo(
    () => [...(racks || [])].sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [racks]
  );
  const activeRack = sortedRacks.find(r => r.id === selectedRackId) || sortedRacks[0];

  // Stats per rack
  const rackStats = (rack: Rack) => {
    const slots = rack.width * rack.height;
    const filled = Object.values(rackContents[rack.id] || {}).filter(Boolean).length;
    return { filled, slots, free: slots - filled, pct: slots > 0 ? (filled / slots) * 100 : 0 };
  };

  return (
    <div>
      <div className="mb-5">
        <MonoLabel>VINOFLOW · INVENTAIRE · PLAN</MonoLabel>
        <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Plan de cave</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">
          {sortedRacks.length} emplacements · {unsortedBottles.length} btl en attente
          {' · '}
          <Link to="/cellar-map-classic" className="text-wine-700 hover:underline">Vue éditable (drag &amp; drop) →</Link>
        </div>
      </div>

      {sortedRacks.length === 0 ? (
        <Card className="p-8 text-center">
          <Boxes className="w-10 h-10 text-stone-300 mx-auto mb-2" />
          <div className="serif-it text-xl text-stone-700 dark:text-stone-300 mb-2">Pas encore d'emplacement</div>
          <p className="text-sm text-stone-500 mb-4">
            Crée tes étagères et caisses dans la <Link to="/cellar-map-classic" className="text-wine-700 hover:underline">vue éditable</Link>.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* ───── Sidebar : list of racks ───── */}
          <aside className="col-span-12 md:col-span-3 space-y-3">
            <Card className="p-3">
              <MonoLabel>◌ Étagères &amp; caisses</MonoLabel>
              <div className="mt-3 space-y-1">
                {sortedRacks.map(rack => {
                  const s = rackStats(rack);
                  const isActive = activeRack?.id === rack.id;
                  return (
                    <button
                      key={rack.id}
                      onClick={() => setSelectedRackId(rack.id)}
                      className={`w-full text-left p-2 rounded transition ${
                        isActive
                          ? 'bg-wine-50 dark:bg-wine-900/20 ring-1 ring-wine-200 dark:ring-wine-900/50'
                          : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="serif-it text-[14px] text-stone-900 dark:text-white truncate flex-1">{rack.name}</span>
                        <span className="mono text-[10px] text-stone-500">{rack.type === 'BOX' ? '📦' : '▤'}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                          <div
                            className={`h-full ${s.pct > 90 ? 'bg-wine-700' : s.pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                        <span className="mono text-[10px] text-stone-500">{s.filled}/{s.slots}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Limbo bottles */}
            {unsortedBottles.length > 0 && (
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Inbox className="w-3.5 h-3.5 text-amber-600" />
                  <MonoLabel>◌ Zone d'attente</MonoLabel>
                </div>
                <div className="serif-it text-stone-700 dark:text-stone-300 text-base mt-0.5 mb-2">
                  {unsortedBottles.length} btl à placer
                </div>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {unsortedBottles.slice(0, 12).map(({ wine, bottle }) => (
                    <li key={bottle.id} className="text-[12px] truncate">
                      <Link to={`/wine/${wine.id}`} className="text-stone-700 dark:text-stone-300 hover:text-wine-700">
                        {wine.name} {wine.vintage}
                      </Link>
                    </li>
                  ))}
                  {unsortedBottles.length > 12 && (
                    <li className="text-[10px] text-stone-400 italic">+{unsortedBottles.length - 12} autres</li>
                  )}
                </ul>
              </Card>
            )}
          </aside>

          {/* ───── Main : rack visual ───── */}
          <main className="col-span-12 md:col-span-9">
            {activeRack && (
              <Card className="overflow-hidden">
                <header className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/40 flex items-center justify-between">
                  <div>
                    <MonoLabel>◌ {activeRack.type === 'BOX' ? 'CAISSE' : 'ÉTAGÈRE'} · {activeRack.width}×{activeRack.height}</MonoLabel>
                    <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5">{activeRack.name}</h3>
                  </div>
                  <Link
                    to="/cellar-map-classic"
                    className="mono text-[10px] tracking-widest text-stone-600 hover:text-wine-700 px-2 py-1 inline-flex items-center gap-1"
                  >
                    <ArrowLeftRight className="w-3 h-3" /> ÉDITER
                  </Link>
                </header>

                <div className="p-5 overflow-x-auto">
                  <RackGrid
                    rack={activeRack}
                    contents={rackContents[activeRack.id] || {}}
                    hovered={hoveredSlot && hoveredSlot.rackId === activeRack.id ? hoveredSlot : null}
                    onHover={(x, y) => setHoveredSlot({ rackId: activeRack.id, x, y })}
                    onUnhover={() => setHoveredSlot(null)}
                  />
                </div>
              </Card>
            )}
          </main>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────
// Rack grid (read-only, click slot → wine details)
// ────────────────────────────────────────────
const RackGrid: React.FC<{
  rack: Rack;
  contents: Record<string, SlotInfo>;
  hovered: { x: number; y: number } | null;
  onHover: (x: number, y: number) => void;
  onUnhover: () => void;
}> = ({ rack, contents, hovered, onHover, onUnhover }) => {
  const slots: Array<{ x: number; y: number; info: SlotInfo }> = [];
  for (let y = 0; y < rack.height; y++) {
    for (let x = 0; x < rack.width; x++) {
      slots.push({ x, y, info: contents[`${x}-${y}`] || null });
    }
  }

  // Tooltip target
  const hoveredInfo = hovered ? contents[`${hovered.x}-${hovered.y}`] : null;

  const cellSize = rack.type === 'BOX' ? 'w-16 h-16' : 'w-14 h-14';

  return (
    <div className="space-y-3">
      {/* Column labels */}
      <div className="flex items-center gap-1 ml-9">
        {Array.from({ length: rack.width }, (_, i) => (
          <div key={i} className={`${cellSize} flex items-center justify-center mono text-[10px] text-stone-400`}>
            {i + 1}
          </div>
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rack.height }, (_, y) => (
        <div key={y} className="flex items-center gap-1">
          <div className="w-8 mono text-[10px] text-stone-400 text-center">
            {String.fromCharCode(65 + y)}
          </div>
          {Array.from({ length: rack.width }, (_, x) => {
            const info = contents[`${x}-${y}`];
            const isHovered = hovered?.x === x && hovered?.y === y;
            if (info) {
              const dotColor = colorDot(info.wine.type);
              return (
                <Link
                  key={x}
                  to={`/wine/${info.wine.id}`}
                  onMouseEnter={() => onHover(x, y)}
                  onMouseLeave={onUnhover}
                  className={`${cellSize} flex flex-col items-center justify-center rounded ${dotColor} hover:ring-2 hover:ring-wine-600 hover:ring-offset-2 dark:hover:ring-offset-stone-900 cursor-pointer transition relative group`}
                  title={`${info.wine.name} ${info.wine.vintage}`}
                >
                  <span className="serif-it text-[11px] text-white/90 leading-tight">
                    {info.wine.vintage || '?'}
                  </span>
                  {isHovered && info && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-10 bg-stone-900 text-white text-[11px] px-2 py-1 rounded mono whitespace-nowrap shadow-lg">
                      {info.wine.name} · {info.wine.vintage}
                    </div>
                  )}
                </Link>
              );
            }
            return (
              <div
                key={x}
                onMouseEnter={() => onHover(x, y)}
                onMouseLeave={onUnhover}
                className={`${cellSize} flex items-center justify-center rounded border border-dashed border-stone-200 dark:border-stone-700 ${isHovered ? 'bg-stone-100 dark:bg-stone-800/50' : ''}`}
              >
                <span className="mono text-[9px] text-stone-300 dark:text-stone-700">{slotLabel(x, y)}</span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 mono text-[10px] text-stone-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-wine-700" />ROUGE</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-amber-300" />BLANC</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-pink-400" />ROSÉ</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-cyan-400" />BULLES</span>
      </div>
    </div>
  );
};
