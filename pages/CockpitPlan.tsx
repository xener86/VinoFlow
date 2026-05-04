// Cockpit Plan — visual cellar map (faithful port of design-protos/proto/cellar-map.jsx).
//   - Read mode: limbo + shelves side-by-side + cases grid, click to open wine
//   - Edit mode: inline rename, +/− cols/rows, delete, add new shelf/case
//   - Drag & drop bottles between limbo / shelves / cases
// All mutations go through storageService (saveRack, updateRack, deleteRack, moveBottle).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Plus, X, Check } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useRacks } from '../hooks/useRacks';
import { Card, MonoLabel } from '../components/cockpit/primitives';
import { saveRack, updateRack, deleteRack, moveBottle } from '../services/storageService';
import { CellarWine, Bottle, Rack, BottleLocation } from '../types';

interface CockpitPlanProps {
  embedded?: boolean;
}

type SlotInfo = { wine: CellarWine; bottle: Bottle } | null;
type DragState = { bottleId: string; wineId: string; wineName: string; wineVintage?: number; from: 'LIMBO' | { rackId: string; x: number; y: number } } | null;

// Wine type → cell color
const typeToCellClass: Record<string, string> = {
  RED:       'bg-wine-700 border-wine-800',
  WHITE:     'bg-amber-100 border-amber-300',
  ROSE:      'bg-pink-200 border-pink-300',
  SPARKLING: 'bg-cyan-100 border-cyan-300',
  DESSERT:   'bg-amber-300 border-amber-400',
  FORTIFIED: 'bg-orange-700 border-orange-800',
};

const slotColor = (type: string | null | undefined, hovered: boolean, isDragSrc: boolean, isDropTarget: boolean) => {
  let base = 'bg-white dark:bg-stone-800/40 border border-dashed border-stone-300 dark:border-stone-700';
  if (type && typeToCellClass[type]) base = `border ${typeToCellClass[type]}`;
  if (isDragSrc) base += ' opacity-30';
  if (isDropTarget) base += ' ring-2 ring-wine-600 ring-offset-1 dark:ring-offset-stone-950';
  else if (hovered) base += ' ring-1 ring-stone-900/40 dark:ring-white/40';
  return base;
};

// Two color shades per case lot (so multiple wines in the same case look distinct)
const CASE_LOT_PALETTE: Record<string, string>[] = [
  { RED: 'bg-wine-700 border-wine-800', WHITE: 'bg-amber-200 border-amber-400', ROSE: 'bg-pink-200 border-pink-300', SPARKLING: 'bg-cyan-200 border-cyan-400', DESSERT: 'bg-amber-300 border-amber-400', FORTIFIED: 'bg-orange-700 border-orange-800' },
  { RED: 'bg-wine-400 border-wine-500', WHITE: 'bg-amber-400 border-amber-600', ROSE: 'bg-pink-300 border-pink-400', SPARKLING: 'bg-cyan-300 border-cyan-500', DESSERT: 'bg-amber-200 border-amber-300', FORTIFIED: 'bg-orange-500 border-orange-700' },
];

// ────────────────────────────────────────────
// Inline editable text — click to edit
// ────────────────────────────────────────────
const InlineText: React.FC<{ value: string; onSave: (v: string) => void; className?: string; placeholder?: string }> = ({ value, onSave, className = '', placeholder = '' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className={`text-left hover:bg-stone-200/60 dark:hover:bg-stone-700/40 hover:ring-1 hover:ring-stone-300 dark:hover:ring-stone-600 rounded px-1 -mx-1 transition ${className}`}
      >
        {value || <span className="text-stone-400 italic">{placeholder}</span>}
      </button>
    );
  }
  const commit = () => { onSave(draft); setEditing(false); };
  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      className={`bg-white dark:bg-stone-900 border border-wine-400 rounded px-1 -mx-1 outline-none ring-1 ring-wine-200 dark:ring-wine-900/50 ${className}`}
    />
  );
};

// ────────────────────────────────────────────
// +/− stepper for cols/rows/capacity
// ────────────────────────────────────────────
const Stepper: React.FC<{ value: number; onMinus: () => void; onPlus: () => void; min?: boolean; max?: boolean }> = ({ value, onMinus, onPlus, min, max }) => (
  <div className="inline-flex items-center gap-0.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded">
    <button onClick={onMinus} disabled={min} className="w-5 h-5 flex items-center justify-center text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:text-stone-300 disabled:hover:bg-transparent rounded-l text-sm">−</button>
    <span className="mono text-[10px] text-stone-700 dark:text-stone-300 px-1.5 min-w-[2ch] text-center">{value}</span>
    <button onClick={onPlus} disabled={max} className="w-5 h-5 flex items-center justify-center text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:text-stone-300 disabled:hover:bg-transparent rounded-r text-sm">+</button>
  </div>
);

// ────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────
export const CockpitPlan: React.FC<CockpitPlanProps> = ({ embedded = false }) => {
  const { wines, refresh: refreshWines } = useWines();
  const { racks, refresh: refreshRacks } = useRacks();
  const [hover, setHover] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // 'LIMBO' | rackId | rackId/x-y

  const refreshAll = async () => { await Promise.all([refreshWines(), refreshRacks()]); };

  // rackId → { (x,y) → wine } for shelves & cases
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

  // Bottles in "limbo" — no rack OR rack/slot doesn't exist anymore
  const validRackIds = new Set((racks || []).map(r => r.id));
  const limboBottles = useMemo(() => {
    const list: { wine: CellarWine; bottle: Bottle }[] = [];
    for (const wine of wines) {
      for (const bottle of wine.bottles || []) {
        if (bottle.isConsumed) continue;
        const loc = bottle.location;
        if (typeof loc === 'string' || !loc) {
          list.push({ wine, bottle });
          continue;
        }
        if ('rackId' in loc) {
          const rack = racks.find(r => r.id === loc.rackId);
          if (!rack || loc.x >= rack.width || loc.y >= rack.height) {
            list.push({ wine, bottle });
          }
        }
      }
    }
    return list;
  }, [wines, racks]);

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

  // ───── Mutation handlers ─────
  const handleRename = async (id: string, name: string) => {
    await updateRack(id, { name });
    refreshRacks();
  };

  const handleResize = async (id: string, key: 'width' | 'height', delta: number) => {
    const rack = racks.find(r => r.id === id);
    if (!rack) return;
    const next = Math.max(1, Math.min(12, rack[key] + delta));
    if (next === rack[key]) return;
    await updateRack(id, { [key]: next });
    refreshRacks();
  };

  const handleDeleteRack = async (id: string) => {
    const rack = racks.find(r => r.id === id);
    if (!rack) return;
    if (!confirm(`Supprimer "${rack.name}" ? Les bouteilles partiront en zone d'attente.`)) return;
    await deleteRack(id);
    refreshAll();
  };

  const handleAddShelf = async () => {
    const used = new Set(shelves.map(s => s.name));
    let suffix = '';
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!used.has(`Étagère ${letter}`)) { suffix = letter; break; }
    }
    await saveRack({ id: '' as any, name: `Étagère ${suffix || shelves.length + 1}`, width: 4, height: 5, type: 'SHELF' });
    refreshRacks();
  };

  const handleAddCase = async () => {
    const used = new Set(boxes.map(b => b.name));
    let n = 1;
    while (used.has(`Caisse #${String(n).padStart(2, '0')}`)) n++;
    await saveRack({ id: '' as any, name: `Caisse #${String(n).padStart(2, '0')}`, width: 3, height: 2, type: 'BOX' });
    refreshRacks();
  };

  // Drag & drop
  const startDrag = (bottle: Bottle, wine: CellarWine, from: DragState['from']) => {
    setDrag({
      bottleId: bottle.id,
      wineId: wine.id,
      wineName: wine.name,
      wineVintage: wine.vintage || undefined,
      from,
    });
  };
  const cancelDrag = () => { setDrag(null); setDropTarget(null); };

  const commitDrop = async (target: 'LIMBO' | { rackId: string; x: number; y: number }) => {
    if (!drag) return;
    // No-op if same location
    if (target === 'LIMBO' && drag.from === 'LIMBO') return cancelDrag();
    if (typeof target === 'object' && typeof drag.from === 'object' &&
        target.rackId === drag.from.rackId && target.x === drag.from.x && target.y === drag.from.y) {
      return cancelDrag();
    }
    // If dropping on an occupied slot, we don't swap — just abort
    if (typeof target === 'object') {
      const occupied = rackContents[target.rackId]?.[`${target.x}-${target.y}`];
      if (occupied) return cancelDrag();
    }
    const newLocation: string | BottleLocation = target === 'LIMBO' ? 'Non trié' : target;
    cancelDrag();
    await moveBottle(drag.bottleId, newLocation, drag.wineName, drag.wineVintage, drag.wineId);
    refreshWines();
  };

  return (
    <div>
      {!embedded && (
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <MonoLabel>VINOFLOW · INVENTAIRE</MonoLabel>
            <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Plan de cave</h1>
            <div className="mono text-[10px] tracking-widest text-stone-500 mt-2">▢ PLAN · VUE DE DESSUS</div>
          </div>
          <span className="mono text-[10px] tracking-widest text-stone-500 hidden md:block">
            {editMode ? 'GLISSE-DÉPOSE · CLIC = MODIFIER' : 'CLIC = OUVRIR LA FICHE'}
          </span>
        </div>
      )}

      {/* Legend + edit toggle */}
      <div className="flex items-center gap-4 mono text-[10px] tracking-widest text-stone-600 dark:text-stone-400 flex-wrap mb-5">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-wine-700 rounded-sm border border-wine-800" />ROUGE</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-100 rounded-sm border border-amber-300" />BLANC</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-pink-200 rounded-sm border border-pink-300" />ROSÉ</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-cyan-100 rounded-sm border border-cyan-300" />BULLES</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-white rounded-sm border border-stone-300 border-dashed" />VIDE</span>
        <div className="flex-1" />
        <span>{totalBottles} BTL EN PLACE · {limboBottles.length} EN ATTENTE</span>
        <button
          onClick={() => setEditMode(m => !m)}
          className={`px-2.5 h-7 rounded border inline-flex items-center gap-1 transition ${
            editMode
              ? 'bg-wine-700 text-white border-wine-800 hover:bg-wine-800'
              : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:border-wine-700 hover:text-wine-700'
          }`}
        >
          {editMode ? <Check className="w-3 h-3" /> : <Settings className="w-3 h-3" />}
          {editMode ? 'TERMINER' : 'ÉDITER STRUCTURE'}
        </button>
      </div>

      {/* LIMBO / unloading zone */}
      <LimboZone
        bottles={limboBottles}
        drag={drag}
        isDropTarget={dropTarget === 'LIMBO'}
        onDragOver={() => setDropTarget('LIMBO')}
        onDragLeave={() => setDropTarget(null)}
        onDrop={() => commitDrop('LIMBO')}
        onStartDrag={(b, w) => startDrag(b, w, 'LIMBO')}
      />

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
                  editMode={editMode}
                  drag={drag}
                  dropTarget={dropTarget}
                  onDragOverSlot={key => setDropTarget(`${rack.id}/${key}`)}
                  onDropSlot={(x, y) => commitDrop({ rackId: rack.id, x, y })}
                  onStartDrag={(b, w, x, y) => startDrag(b, w, { rackId: rack.id, x, y })}
                  onRename={n => handleRename(rack.id, n)}
                  onResize={(k, d) => handleResize(rack.id, k, d)}
                  onDelete={() => handleDeleteRack(rack.id)}
                />
              ))}
              {editMode && (
                <button
                  onClick={handleAddShelf}
                  className="shrink-0 self-center mono text-[10px] tracking-widest px-3 py-3 rounded border-2 border-dashed border-stone-300 dark:border-stone-700 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 dark:hover:bg-wine-900/10 transition"
                >
                  + AJOUTER<br />UNE ÉTAGÈRE
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {shelves.length === 0 && editMode && (
        <button
          onClick={handleAddShelf}
          className="mb-8 mono text-[10px] tracking-widest px-4 py-6 rounded border-2 border-dashed border-stone-300 dark:border-stone-700 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 dark:hover:bg-wine-900/10 transition"
        >
          + AJOUTER LA PREMIÈRE ÉTAGÈRE
        </button>
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
                editMode={editMode}
                drag={drag}
                dropTarget={dropTarget}
                onDragOverSlot={key => setDropTarget(`${rack.id}/${key}`)}
                onDropSlot={(x, y) => commitDrop({ rackId: rack.id, x, y })}
                onStartDrag={(b, w, x, y) => startDrag(b, w, { rackId: rack.id, x, y })}
                onRename={n => handleRename(rack.id, n)}
                onResize={(k, d) => handleResize(rack.id, k, d)}
                onDelete={() => handleDeleteRack(rack.id)}
              />
            ))}
            {editMode && (
              <button
                onClick={handleAddCase}
                className="col-span-2 mono text-[10px] tracking-widest px-3 py-6 rounded border-2 border-dashed border-stone-300 dark:border-stone-700 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 dark:hover:bg-wine-900/10 transition"
              >
                + AJOUTER<br />UNE CAISSE
              </button>
            )}
          </div>
        </div>
      )}

      {boxes.length === 0 && editMode && (
        <div className="mt-6">
          <MonoLabel className="mb-3">▢ CAISSES</MonoLabel>
          <button
            onClick={handleAddCase}
            className="mono text-[10px] tracking-widest px-4 py-6 rounded border-2 border-dashed border-stone-300 dark:border-stone-700 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 dark:hover:bg-wine-900/10 transition"
          >
            + AJOUTER LA PREMIÈRE CAISSE
          </button>
        </div>
      )}

      {/* Empty state (no shelves, no cases, not editing) */}
      {shelves.length === 0 && boxes.length === 0 && !editMode && (
        <Card className="p-8 text-center">
          <div className="serif-it text-xl text-stone-700 dark:text-stone-300 mb-2">Pas encore d'emplacement</div>
          <p className="text-sm text-stone-500 mb-4">
            Active le mode édition pour créer tes premières étagères et caisses.
          </p>
          <button
            onClick={() => setEditMode(true)}
            className="px-3 h-9 rounded bg-wine-700 text-white hover:bg-wine-800 mono text-[10px] tracking-widest inline-flex items-center gap-1.5"
          >
            <Settings className="w-3 h-3" /> ÉDITER STRUCTURE
          </button>
        </Card>
      )}

      <div className="mono text-[10px] text-stone-500 italic pt-3 mt-6 border-t border-stone-200 dark:border-stone-800">
        {editMode
          ? <>Édition en direct · clic sur un nom pour renommer · stepper pour redimensionner · drag&amp;drop pour déplacer une bouteille</>
          : <>Vue lecture · adressage <span className="text-stone-700 dark:text-stone-300">[Étagère][Colonne]-[Rangée]</span> · ouvrir l'édition pour réorganiser</>
        }
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// LimboZone
// ────────────────────────────────────────────
interface LimboZoneProps {
  bottles: { wine: CellarWine; bottle: Bottle }[];
  drag: DragState;
  isDropTarget: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onStartDrag: (bottle: Bottle, wine: CellarWine) => void;
}
const LimboZone: React.FC<LimboZoneProps> = ({ bottles, drag, isDropTarget, onDragOver, onDragLeave, onDrop, onStartDrag }) => {
  const dropAttempt = !!drag && isDropTarget;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-lg p-3 mb-6 transition ${
        dropAttempt
          ? 'ring-2 ring-wine-600 ring-offset-1 border border-wine-300 bg-wine-50/30 dark:bg-wine-900/20 dark:border-wine-900/50'
          : bottles.length > 0
          ? 'border border-amber-300 bg-amber-50/40 dark:bg-amber-900/10 dark:border-amber-900/50'
          : 'border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/40 dark:bg-stone-900/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`mono text-[10px] tracking-widest ${bottles.length ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500'}`}>
          ▼ ZONE DE DÉCHARGEMENT {bottles.length > 0 && `· ${bottles.length} EN ATTENTE`}
        </span>
      </div>
      {bottles.length === 0 ? (
        <div className="mono text-[10px] tracking-widest text-stone-400 italic py-2">
          Aucune bouteille en attente · les nouveaux ajouts atterrissent ici
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {bottles.slice(0, 36).map(({ wine, bottle }) => {
            const cls = typeToCellClass[wine.type] || 'bg-stone-300 border-stone-400';
            const isDragSrc = drag?.bottleId === bottle.id;
            return (
              <div
                key={bottle.id}
                draggable
                onDragStart={() => onStartDrag(bottle, wine)}
                onClick={() => { window.location.href = `/wine/${wine.id}`; }}
                className={`flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:border-wine-700 rounded-md cursor-grab active:cursor-grabbing transition ${
                  isDragSrc ? 'opacity-30' : ''
                }`}
                title={`Glisser pour placer · ${wine.name} ${wine.vintage || ''}`}
              >
                <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${cls}`} />
                <span className="serif-it text-[12.5px] text-stone-900 dark:text-white leading-tight truncate max-w-[200px]">{wine.name}</span>
                <span className="mono text-[9px] tracking-widest text-stone-500">{wine.vintage}</span>
              </div>
            );
          })}
          {bottles.length > 36 && (
            <span className="mono text-[9px] text-stone-400 italic self-center">+ {bottles.length - 36} autres</span>
          )}
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────
// ShelfBlock — one shelf, dense grid + edit controls
// ────────────────────────────────────────────
interface ShelfBlockProps {
  rack: Rack;
  contents: Record<string, SlotInfo>;
  hover: string | null;
  onHover: (key: string | null) => void;
  editMode: boolean;
  drag: DragState;
  dropTarget: string | null;
  onDragOverSlot: (key: string) => void;
  onDropSlot: (x: number, y: number) => void;
  onStartDrag: (b: Bottle, w: CellarWine, x: number, y: number) => void;
  onRename: (n: string) => void;
  onResize: (key: 'width' | 'height', delta: number) => void;
  onDelete: () => void;
}
const ShelfBlock: React.FC<ShelfBlockProps> = ({ rack, contents, hover, onHover, editMode, drag, dropTarget, onDragOverSlot, onDropSlot, onStartDrag, onRename, onResize, onDelete }) => {
  const filled = Object.values(contents).filter(Boolean).length;
  const total = rack.width * rack.height;

  return (
    <div className="shrink-0">
      {/* Header */}
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="serif text-lg text-stone-900 dark:text-white leading-none">{rack.name.split(' ')[0] || rack.name}</div>
          {editMode ? (
            <InlineText
              value={rack.name}
              onSave={onRename}
              className="mono text-[9px] tracking-widest text-stone-500 mt-0.5"
            />
          ) : (
            <div className="mono text-[9px] tracking-widest text-stone-500 mt-0.5">
              {rack.name} · {rack.width}×{rack.height}
            </div>
          )}
        </div>
        <div className="mono text-[10px] text-stone-600 dark:text-stone-400">{filled}/{total}</div>
      </div>

      {/* Edit controls */}
      {editMode && (
        <div className="flex items-center gap-1.5 mb-2 mono text-[9px] tracking-widest text-stone-500">
          <span>COL</span>
          <Stepper value={rack.width} onMinus={() => onResize('width', -1)} onPlus={() => onResize('width', +1)} min={rack.width <= 1} max={rack.width >= 12} />
          <span className="ml-1">RNG</span>
          <Stepper value={rack.height} onMinus={() => onResize('height', -1)} onPlus={() => onResize('height', +1)} min={rack.height <= 1} max={rack.height >= 12} />
          <button
            onClick={onDelete}
            className="ml-auto w-5 h-5 flex items-center justify-center rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 hover:border-wine-700 hover:text-wine-700 hover:bg-wine-50 dark:hover:bg-wine-900/30"
            title="Supprimer cette étagère"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/40 p-2 rounded-sm">
        {/* Column labels */}
        <div className="grid mb-1" style={{ gridTemplateColumns: `16px repeat(${rack.width}, 28px)`, gap: '4px' }}>
          <span />
          {Array.from({ length: rack.width }).map((_, c) => (
            <span key={c} className="mono text-[9px] text-stone-400 text-center">{c + 1}</span>
          ))}
        </div>
        {Array.from({ length: rack.height }).map((_, rIdx) => (
          <div key={rIdx} className="grid mb-1 last:mb-0" style={{ gridTemplateColumns: `16px repeat(${rack.width}, 28px)`, gap: '4px' }}>
            <span className="mono text-[9px] text-stone-400 self-center text-right pr-1">{String.fromCharCode(65 + rIdx)}</span>
            {Array.from({ length: rack.width }).map((_, cIdx) => {
              const key = `${cIdx}-${rIdx}`;
              const info = contents[key];
              const slotKey = `${rack.id}/${key}`;
              const isHovered = hover === slotKey;
              const isDragSrc = !!drag && info && drag.bottleId === info.bottle.id;
              const isDropTargetCell = !!drag && dropTarget === slotKey && !info; // can't drop on occupied
              const cellClass = slotColor(info?.wine.type, isHovered, !!isDragSrc, isDropTargetCell);

              const cellProps = {
                onMouseEnter: () => onHover(slotKey),
                onMouseLeave: () => onHover(null),
                onDragOver: (e: React.DragEvent) => { e.preventDefault(); onDragOverSlot(key); },
                onDrop: () => onDropSlot(cIdx, rIdx),
              };

              if (info) {
                return (
                  <div
                    key={cIdx}
                    {...cellProps}
                    draggable
                    onDragStart={() => onStartDrag(info.bottle, info.wine, cIdx, rIdx)}
                    onClick={() => { window.location.href = `/wine/${info.wine.id}`; }}
                    className={`relative w-7 h-7 rounded-sm transition cursor-grab active:cursor-grabbing ${cellClass}`}
                    title={`${rack.name} ${String.fromCharCode(65 + rIdx)}${cIdx + 1} · ${info.wine.name} ${info.wine.vintage || ''}`}
                  >
                    {isHovered && !drag && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-30 bg-stone-900 text-white px-3 py-1.5 rounded text-[11px] whitespace-nowrap shadow-lg pointer-events-none">
                        <div className="serif-it leading-tight">{info.wine.name}</div>
                        <div className="mono text-[9px] tracking-widest text-stone-400 mt-0.5">{String.fromCharCode(65 + rIdx)}{cIdx + 1} · {info.wine.vintage || '?'}</div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={cIdx}
                  {...cellProps}
                  className={`w-7 h-7 rounded-sm transition ${cellClass}`}
                  title={`${rack.name} ${String.fromCharCode(65 + rIdx)}${cIdx + 1} · vide`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="h-1 bg-stone-300 dark:bg-stone-700 mx-2 mt-1 rounded-b" />
    </div>
  );
};

// ────────────────────────────────────────────
// CaseBlock — small case (mini grid + label + lot list)
// ────────────────────────────────────────────
interface CaseBlockProps {
  rack: Rack;
  contents: Record<string, SlotInfo>;
  editMode: boolean;
  drag: DragState;
  dropTarget: string | null;
  onDragOverSlot: (key: string) => void;
  onDropSlot: (x: number, y: number) => void;
  onStartDrag: (b: Bottle, w: CellarWine, x: number, y: number) => void;
  onRename: (n: string) => void;
  onResize: (key: 'width' | 'height', delta: number) => void;
  onDelete: () => void;
}
const CaseBlock: React.FC<CaseBlockProps> = ({ rack, contents, editMode, drag, dropTarget, onDragOverSlot, onDropSlot, onStartDrag, onRename, onResize, onDelete }) => {
  const capacity = rack.width * rack.height;
  const isLarge = capacity >= 12;
  const cols = rack.width;
  const span = isLarge ? 'col-span-3' : 'col-span-2';

  const lots = useMemo(() => {
    const m = new Map<string, { wine: CellarWine; qty: number; firstBottle: Bottle }>();
    for (const info of Object.values(contents)) {
      if (!info) continue;
      const k = info.wine.id;
      if (!m.has(k)) m.set(k, { wine: info.wine, qty: 0, firstBottle: info.bottle });
      m.get(k)!.qty += 1;
    }
    return [...m.values()];
  }, [contents]);

  const filled = lots.reduce((a, l) => a + l.qty, 0);

  return (
    <div className={`${span} border border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/40 rounded p-2.5`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="mono text-[9px] tracking-widest text-stone-500">{rack.id.slice(0, 6).toUpperCase()}</div>
        <div className="mono text-[10px] text-stone-700 dark:text-stone-300">{filled}/{capacity}</div>
      </div>

      {editMode && (
        <div className="flex items-center gap-1.5 mb-2 mono text-[9px] tracking-widest text-stone-500">
          <span>COL</span>
          <Stepper value={rack.width} onMinus={() => onResize('width', -1)} onPlus={() => onResize('width', +1)} min={rack.width <= 1} max={rack.width >= 8} />
          <span className="ml-1">RNG</span>
          <Stepper value={rack.height} onMinus={() => onResize('height', -1)} onPlus={() => onResize('height', +1)} min={rack.height <= 1} max={rack.height >= 8} />
          <button
            onClick={onDelete}
            className="ml-auto w-5 h-5 flex items-center justify-center rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 hover:border-wine-700 hover:text-wine-700 hover:bg-wine-50 dark:hover:bg-wine-900/30"
            title="Supprimer cette caisse"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Mini grid (drag&drop enabled) */}
      <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `repeat(${cols}, 28px)` }}>
        {Array.from({ length: capacity }).map((_, i) => {
          const x = i % cols;
          const y = Math.floor(i / cols);
          const slotKey = `${x}-${y}`;
          const info = contents[slotKey];
          const slotId = `${rack.id}/${slotKey}`;
          const isDragSrc = !!drag && info && drag.bottleId === info.bottle.id;
          const isDropTargetCell = !!drag && dropTarget === slotId && !info;

          const cellProps = {
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); onDragOverSlot(slotKey); },
            onDrop: () => onDropSlot(x, y),
          };

          if (!info) {
            return (
              <div
                key={i}
                {...cellProps}
                className={`w-7 h-7 rounded-sm border bg-white dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 border-dashed transition ${isDropTargetCell ? 'ring-2 ring-wine-600 ring-offset-1' : ''}`}
              />
            );
          }
          const lotIdx = lots.findIndex(l => l.wine.id === info.wine.id);
          const palette = CASE_LOT_PALETTE[lotIdx % CASE_LOT_PALETTE.length];
          const fill = palette[info.wine.type] || palette.RED;
          return (
            <div
              key={i}
              {...cellProps}
              draggable
              onDragStart={() => onStartDrag(info.bottle, info.wine, x, y)}
              onClick={() => { window.location.href = `/wine/${info.wine.id}`; }}
              title={`${info.wine.name} · ${info.wine.vintage || '?'}`}
              className={`w-7 h-7 rounded-sm border cursor-grab active:cursor-grabbing transition hover:ring-1 hover:ring-stone-900/40 ${fill} ${isDragSrc ? 'opacity-30' : ''}`}
            />
          );
        })}
      </div>

      {/* Label */}
      <div className="mb-2">
        {editMode ? (
          <InlineText value={rack.name} onSave={onRename} className="serif text-[12px] text-stone-900 dark:text-white" />
        ) : (
          <div className="serif text-[12px] text-stone-900 dark:text-white">{rack.name}</div>
        )}
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
