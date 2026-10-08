// Cockpit Plan — visual cellar map (faithful port of design-protos/proto/cellar-map.jsx).
//   - Read mode: limbo + shelves side-by-side + cases grid, click to open wine
//   - Edit mode: inline rename, +/− cols/rows, delete, add new shelf/case
//   - Drag & drop bottles between limbo / shelves / cases
// All mutations go through storageService (saveRack, updateRack, deleteRack, moveBottle).

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Settings, Plus, X, Check, ChevronLeft, ChevronRight, GlassWater, Gift, Move, Trash2, Inbox, Search, ArrowRight } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useRacks } from '../hooks/useRacks';
import { Card, MonoLabel, Modal, Button, Input, WineLink } from '../components/cockpit/primitives';
import { getPeakWindow } from '../utils/peakWindow';
import { saveRack, updateRack, deleteRack, moveBottle, reorderRack, consumeSpecificBottle, giftBottle, deleteBottle, addBottleAtLocation, fillRackWithWine } from '../services/storageService';
import { CellarWine, Bottle, Rack, BottleLocation } from '../types';
import { useToast, useConfirm } from '../components/cockpit/feedback';
import { useOpenBottleConfirm } from '../components/cockpit/openBottle';

interface CockpitPlanProps {
  embedded?: boolean;
}

type SlotInfo = { wine: CellarWine; bottle: Bottle } | null;

// Vin mis en évidence (?wine=<id>, ex. « Voir l'emplacement » depuis le sommelier).
const PlanFocusContext = createContext<string | null>(null);
const FOCUS_RING = 'ring-2 ring-wine-600 ring-offset-2 ring-offset-white z-10 animate-pulse';

// Actions de la vue lecture (ex-« CellarMap ») : clic sur une bouteille =
// fiche d'actions, clic sur un emplacement vide = ajout / placement / fin de
// déplacement. `moving` = bouteille en cours de déplacement (au toucher).
interface PlanActions {
  onBottle: (info: NonNullable<SlotInfo>, addr: string) => void;
  onEmpty: (rack: Rack, x: number, y: number, addr: string) => void;
  onFill: (rack: Rack) => void;
  moving: string | null;
}
const PlanActionsContext = createContext<PlanActions | null>(null);
const MOVE_TARGET = 'ring-2 ring-wine-600/60 ring-offset-1 bg-wine-50';
type DragState = { bottleId: string; wineId: string; wineName: string; wineVintage?: number; from: 'LIMBO' | { rackId: string; x: number; y: number } } | null;

// Short alias from a free-form rack name. Used as the big letter on top of
// each shelf and in slot addresses (e.g. "Étagère A" → "A", "Droite" → "D",
// "Cave principale" → "CP").
const rackAlias = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  // 1) trailing single uppercase letter (e.g. "Étagère A")
  const last = parts[parts.length - 1];
  if (last && last.length === 1) return last.toUpperCase();
  // 2) first 2 letters of the last word (e.g. "Droite" → "DR")
  if (parts.length === 1 && last) return last.charAt(0).toUpperCase();
  // 3) initials of the words (max 3)
  return parts.map(p => p.charAt(0).toUpperCase()).join('').slice(0, 3);
};

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
  let base = 'bg-white border border-dashed border-stone-300';
  if (type && typeToCellClass[type]) base = `border ${typeToCellClass[type]}`;
  if (isDragSrc) base += ' opacity-30';
  if (isDropTarget) base += ' ring-2 ring-wine-600 ring-offset-1';
  else if (hovered) base += ' ring-1 ring-stone-900/40';
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
        className={`text-left hover:bg-stone-200/60 hover:ring-1 hover:ring-stone-300 rounded px-1 -mx-1 transition ${className}`}
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
      className={`bg-white border border-wine-400 rounded px-1 -mx-1 outline-none ring-1 ring-wine-200 ${className}`}
    />
  );
};

// ────────────────────────────────────────────
// +/− stepper for cols/rows/capacity
// ────────────────────────────────────────────
const Stepper: React.FC<{ value: number; onMinus: () => void; onPlus: () => void; min?: boolean; max?: boolean }> = ({ value, onMinus, onPlus, min, max }) => (
  <div className="inline-flex items-center gap-0.5 bg-white border border-stone-300 rounded">
    <button onClick={onMinus} disabled={min} className="w-5 h-5 flex items-center justify-center text-stone-700 hover:bg-stone-100 disabled:text-stone-300 disabled:hover:bg-transparent rounded-l text-sm">−</button>
    <span className="mono text-[10px] text-stone-700 px-1.5 min-w-[2ch] text-center">{value}</span>
    <button onClick={onPlus} disabled={max} className="w-5 h-5 flex items-center justify-center text-stone-700 hover:bg-stone-100 disabled:text-stone-300 disabled:hover:bg-transparent rounded-r text-sm">+</button>
  </div>
);

// ────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────
export const CockpitPlan: React.FC<CockpitPlanProps> = ({ embedded = false }) => {
  const confirmAction = useConfirm();
  const confirmOpen = useOpenBottleConfirm();
  const toast = useToast();
  const { wines, refresh: refreshWines } = useWines();
  const { racks, refresh: refreshRacks } = useRacks();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusWineId = searchParams.get('wine');
  const focusWine = focusWineId ? wines.find(w => w.id === focusWineId) : undefined;
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

  // Sort racks: shelves first, then boxes; within each group by sortOrder
  // (server-managed via POST /api/racks/reorder), name as tie-breaker.
  const allRacks = useMemo(
    () => [...(racks || [])].sort((a, b) => {
      const aShelf = a.type !== 'BOX' ? 0 : 1;
      const bShelf = b.type !== 'BOX' ? 0 : 1;
      if (aShelf !== bShelf) return aShelf - bShelf;
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
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
    if (!(await confirmAction({ title: `Supprimer « ${rack.name} » ?`, message: 'Les bouteilles partiront en zone d’attente.', confirmLabel: 'Supprimer', danger: true }))) return;
    await deleteRack(id);
    toast.success(`« ${rack.name} » supprimé`);
    refreshAll();
  };

  const handleMove = async (id: string, direction: 'left' | 'right') => {
    await reorderRack(id, direction);
    refreshRacks();
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

  // ───── Actions de la vue lecture (fusion de l'ancienne page CellarMap) ─────
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<{ info: NonNullable<SlotInfo>; addr: string } | null>(null);
  const [gift, setGift] = useState<{ recipient: string; occasion: string } | null>(null);
  const [emptyTarget, setEmptyTarget] = useState<{ rack: Rack; x: number; y: number; addr: string } | null>(null);
  const [moving, setMoving] = useState<{ bottle: Bottle; wine: CellarWine } | null>(null);
  const [fillRack, setFillRack] = useState<Rack | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const closeSheet = () => { setSheet(null); setGift(null); };
  const closePicker = () => { setEmptyTarget(null); setFillRack(null); setPickQuery(''); };

  const act = async (fn: () => Promise<unknown>, ok: string, fail: string, after?: () => void, okAction?: { label: string; onClick: () => void }) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok, okAction);
      after?.();
      await refreshWines();
    } catch {
      toast.error(fail);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenBottle = async () => {
    if (!sheet) return;
    const { wine, bottle } = sheet.info;
    const choice = await confirmOpen(`${wine.name}${wine.vintage ? ' ' + wine.vintage : ''}`);
    if (!choice) return;
    await act(() => consumeSpecificBottle(wine.id, bottle.id, wine.name, wine.vintage, choice.forDinner), 'Bouteille ouverte — santé !', 'La bouteille n’a pas pu être retirée du stock.', closeSheet,
      { label: 'Noter', onClick: () => navigate(`/tasting/${wine.id}`) });
  };

  const handleGift = async () => {
    if (!sheet || !gift?.recipient.trim()) return;
    const { wine, bottle } = sheet.info;
    await act(() => giftBottle(wine.id, bottle.id, gift.recipient.trim(), gift.occasion.trim(), wine.name, wine.vintage), `Bouteille offerte à ${gift.recipient.trim()}`, 'Le cadeau n’a pas pu être enregistré.', closeSheet);
  };

  const handleDeleteBottle = async () => {
    if (!sheet) return;
    const { wine, bottle } = sheet.info;
    if (!(await confirmAction({ title: 'Supprimer cette bouteille ?', message: `${wine.name} — à utiliser pour une erreur de saisie. Pour une bouteille bue ou offerte, utilise plutôt « Ouvrir » ou « Offrir ».`, confirmLabel: 'Supprimer', danger: true }))) return;
    await act(() => deleteBottle(bottle.id, wine.id, wine.name), 'Bouteille supprimée', 'La suppression a échoué.', closeSheet);
  };

  const handleToLimbo = async () => {
    if (!sheet) return;
    const { wine, bottle } = sheet.info;
    await act(() => moveBottle(bottle.id, 'Non trié', wine.name, wine.vintage, wine.id), 'Bouteille remise en zone d’attente', 'Le déplacement a échoué.', closeSheet);
  };

  const startMove = () => {
    if (!sheet) return;
    setMoving({ bottle: sheet.info.bottle, wine: sheet.info.wine });
    closeSheet();
  };

  const planActions: PlanActions = {
    onBottle: (info, addr) => { if (!moving) setSheet({ info, addr }); },
    onEmpty: (rack, x, y, addr) => {
      if (moving) {
        const { bottle, wine } = moving;
        setMoving(null);
        act(() => moveBottle(bottle.id, { rackId: rack.id, x, y }, wine.name, wine.vintage, wine.id), `Déplacée en ${addr}`, 'Le déplacement a échoué.');
        return;
      }
      setEmptyTarget({ rack, x, y, addr });
    },
    onFill: (rack) => setFillRack(rack),
    moving: moving?.bottle.id ?? null,
  };

  const pickWines = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    return wines
      .filter(w => !q || [w.name, w.producer, w.cuvee, w.region, w.vintage].filter(Boolean).join(' ').toLowerCase().includes(q))
      .sort((a, b) => (b.inventoryCount > 0 ? 1 : 0) - (a.inventoryCount > 0 ? 1 : 0) || a.name.localeCompare(b.name))
      .slice(0, 30);
  }, [wines, pickQuery]);

  // Suggestions de rangement : bouteilles en caisse ou en attente dont la
  // fenêtre de dégustation est ouverte → à sortir sur une étagère.
  const suggestions = useMemo(() => {
    const boxIds = new Set(boxes.map(b => b.id));
    const out: { wine: CellarWine; bottle: Bottle; status: string }[] = [];
    for (const w of wines) {
      const status = getPeakWindow(w).status;
      if (status !== 'Boire Vite' && status !== 'À Boire' && status !== 'Apogée passée') continue;
      for (const b of w.bottles || []) {
        if (b.isConsumed) continue;
        const inBox = typeof b.location === 'object' && b.location && 'rackId' in b.location && boxIds.has(b.location.rackId);
        const inLimbo = typeof b.location === 'string' || !b.location;
        if (inBox || inLimbo) out.push({ wine: w, bottle: b, status });
      }
    }
    const rank = (st: string) => (st === 'Apogée passée' ? 0 : st === 'Boire Vite' ? 1 : 2);
    return out.sort((a, b) => rank(a.status) - rank(b.status)).slice(0, 8);
  }, [wines, boxes]);

  // Fait défiler jusqu'à la première bouteille mise en évidence.
  useEffect(() => {
    if (!focusWine) return;
    const el = document.querySelector('[data-plan-focus="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [focusWine, racks]);

  const focusPlaced = focusWine ? Object.values(rackContents).flatMap(slots => Object.values(slots)).filter(i => i?.wine.id === focusWine.id).length : 0;
  const focusLimbo = focusWine ? limboBottles.filter(b => b.wine.id === focusWine.id).length : 0;

  return (
    <PlanFocusContext.Provider value={focusWineId}>
    <PlanActionsContext.Provider value={planActions}>
    <div>
      {moving && (
        <div className="mb-4 sticky top-[66px] z-20 flex items-center gap-3 rounded-md border border-wine-300 bg-white shadow-md px-4 py-3">
          <Move className="w-4 h-4 text-wine-700 shrink-0" />
          <div className="flex-1 text-sm text-stone-800">
            Déplacer <span className="serif-it">{moving.wine.name}</span> : touche un emplacement libre.
          </div>
          <button onClick={() => setMoving(null)} className="mono text-[10px] tracking-widest text-stone-600 hover:text-wine-700 h-9 px-2">ANNULER</button>
        </div>
      )}
      {focusWine && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-wine-200 bg-wine-50/60 px-4 py-3">
          <span className="w-2.5 h-2.5 rounded-full bg-wine-700 animate-pulse shrink-0" />
          <div className="flex-1 text-sm text-stone-800">
            <Link to={`/wine/${focusWine.id}`} className="serif-it hover:text-wine-800">{focusWine.name} {focusWine.vintage || ''}</Link>
            <span className="text-stone-500"> · {focusPlaced} bouteille(s) rangée(s){focusLimbo ? `, ${focusLimbo} en attente` : ''}</span>
          </div>
          <button
            onClick={() => { searchParams.delete('wine'); setSearchParams(searchParams, { replace: true }); }}
            className="mono text-[10px] tracking-widest text-stone-600 hover:text-wine-700 h-9 px-2"
          >
            EFFACER
          </button>
        </div>
      )}
      {!embedded && (
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <MonoLabel>VINOFLOW · INVENTAIRE</MonoLabel>
            <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Plan de cave</h1>
            <div className="mono text-[10px] tracking-widest text-stone-500 mt-2">▢ PLAN · VUE DE DESSUS</div>
          </div>
          <span className="mono text-[10px] tracking-widest text-stone-500 hidden md:block">
            {editMode ? 'GLISSE-DÉPOSE · CLIC = MODIFIER' : 'CLIC = ACTIONS · CASE VIDE = RANGER'}
          </span>
        </div>
      )}

      {/* Legend + edit toggle */}
      <div className="flex items-center gap-4 mono text-[10px] tracking-widest text-stone-600 flex-wrap mb-5">
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
              : 'bg-white text-stone-700 border-stone-300 hover:border-wine-700 hover:text-wine-700'
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
              {shelves.map((rack, idx) => (
                <ShelfBlock
                  key={rack.id}
                  rack={rack}
                  contents={rackContents[rack.id] || {}}
                  hover={hover}
                  onHover={setHover}
                  editMode={editMode}
                  drag={drag}
                  dropTarget={dropTarget}
                  canMoveLeft={idx > 0}
                  canMoveRight={idx < shelves.length - 1}
                  onMoveLeft={() => handleMove(rack.id, 'left')}
                  onMoveRight={() => handleMove(rack.id, 'right')}
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
                  className="shrink-0 self-center mono text-[10px] tracking-widest px-3 py-3 rounded border-2 border-dashed border-stone-300 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 transition"
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
          className="mb-8 mono text-[10px] tracking-widest px-4 py-6 rounded border-2 border-dashed border-stone-300 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 transition"
        >
          + AJOUTER LA PREMIÈRE ÉTAGÈRE
        </button>
      )}

      {/* CASES */}
      {boxes.length > 0 && (
        <div>
          <MonoLabel className="mb-3">▢ CAISSES</MonoLabel>
          <div className="grid grid-cols-12 gap-2.5">
            {boxes.map((rack, idx) => (
              <CaseBlock
                key={rack.id}
                rack={rack}
                contents={rackContents[rack.id] || {}}
                editMode={editMode}
                drag={drag}
                dropTarget={dropTarget}
                canMoveLeft={idx > 0}
                canMoveRight={idx < boxes.length - 1}
                onMoveLeft={() => handleMove(rack.id, 'left')}
                onMoveRight={() => handleMove(rack.id, 'right')}
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
                className="col-span-2 mono text-[10px] tracking-widest px-3 py-6 rounded border-2 border-dashed border-stone-300 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 transition"
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
            className="mono text-[10px] tracking-widest px-4 py-6 rounded border-2 border-dashed border-stone-300 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 transition"
          >
            + AJOUTER LA PREMIÈRE CAISSE
          </button>
        </div>
      )}

      {/* Empty state (no shelves, no cases, not editing) */}
      {shelves.length === 0 && boxes.length === 0 && !editMode && (
        <Card className="p-8 text-center">
          <div className="serif-it text-xl text-stone-700 mb-2">Pas encore d'emplacement</div>
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

      {/* Suggestions de rangement */}
      {!editMode && suggestions.length > 0 && (
        <Card className="mt-8 p-5">
          <MonoLabel>◌ À SORTIR DES CAISSES</MonoLabel>
          <p className="text-sm text-stone-600 mt-1 mb-3">Ces bouteilles sont dans leur fenêtre de dégustation mais rangées en caisse ou en attente : mieux vaut les avoir sous la main.</p>
          <ul className="divide-y divide-stone-100">
            {suggestions.map(({ wine, bottle, status }) => (
              <li key={bottle.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <WineLink id={wine.id} className="serif-it text-stone-900 truncate block">{wine.name} {wine.vintage || ''}</WineLink>
                  <span className="mono text-[10px] tracking-widest text-stone-500 uppercase">{status}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setMoving({ bottle, wine }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <Move className="w-3.5 h-3.5" />Déplacer
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Fiche d'actions d'une bouteille */}
      <Modal
        open={!!sheet}
        onClose={closeSheet}
        title={sheet ? `${sheet.info.wine.name}${sheet.info.wine.vintage ? ' · ' + sheet.info.wine.vintage : ''}` : ''}
        subtitle={sheet ? `Emplacement : ${sheet.addr}` : undefined}
        size="sm"
      >
        {sheet && !gift && (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleOpenBottle} disabled={busy} className="col-span-2 h-11"><GlassWater className="w-4 h-4" />Ouvrir cette bouteille</Button>
            <Button variant="outline" onClick={startMove} disabled={busy}><Move className="w-3.5 h-3.5" />Déplacer</Button>
            <Button variant="outline" onClick={() => setGift({ recipient: '', occasion: '' })} disabled={busy}><Gift className="w-3.5 h-3.5" />Offrir</Button>
            {sheet.addr !== 'Zone d’attente' && (
              <Button variant="outline" onClick={handleToLimbo} disabled={busy}><Inbox className="w-3.5 h-3.5" />En attente</Button>
            )}
            <Link to={`/wine/${sheet.info.wine.id}`} className={sheet.addr === 'Zone d’attente' ? 'col-span-2' : ''}>
              <Button variant="outline" className="w-full"><ArrowRight className="w-3.5 h-3.5" />Fiche du vin</Button>
            </Link>
            <Button variant="danger" onClick={handleDeleteBottle} disabled={busy} className="col-span-2"><Trash2 className="w-3.5 h-3.5" />Supprimer (erreur de saisie)</Button>
          </div>
        )}
        {sheet && gift && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); handleGift(); }}>
            <Input label="Offerte à" autoFocus value={gift.recipient} onChange={e => setGift({ ...gift, recipient: e.target.value })} placeholder="ex. Paul et Marie" />
            <Input label="Occasion" value={gift.occasion} onChange={e => setGift({ ...gift, occasion: e.target.value })} placeholder="ex. crémaillère" />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setGift(null)}>Retour</Button>
              <Button type="submit" disabled={busy || !gift.recipient.trim()}><Gift className="w-3.5 h-3.5" />Offrir</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Emplacement vide : placer une bouteille en attente ou en ajouter une */}
      <Modal
        open={!!emptyTarget || !!fillRack}
        onClose={closePicker}
        title={fillRack ? `Remplir « ${fillRack.name} »` : `Emplacement ${emptyTarget?.addr ?? ''}`}
        subtitle={fillRack ? 'Tous les emplacements vides recevront une nouvelle bouteille du vin choisi.' : 'Place une bouteille en attente, ou ajoute une nouvelle bouteille ici.'}
      >
        {emptyTarget && limboBottles.length > 0 && !pickQuery && (
          <div className="mb-4">
            <MonoLabel>En attente · {limboBottles.length}</MonoLabel>
            <ul className="mt-2 space-y-1">
              {limboBottles.slice(0, 12).map(({ wine, bottle }) => (
                <li key={bottle.id}>
                  <button
                    disabled={busy}
                    onClick={() => { const t = emptyTarget; closePicker(); act(() => moveBottle(bottle.id, { rackId: t.rack.id, x: t.x, y: t.y }, wine.name, wine.vintage, wine.id), `Rangée en ${t.addr}`, 'Le rangement a échoué.'); }}
                    className="w-full text-left flex items-center gap-2 rounded-md border border-stone-200 hover:border-wine-300 px-3 py-2.5"
                  >
                    <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${typeToCellClass[wine.type] || 'bg-stone-300 border-stone-400'}`} />
                    <span className="serif-it text-stone-900 truncate flex-1">{wine.name}</span>
                    <span className="mono text-[10px] text-stone-500">{wine.vintage}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <MonoLabel>{fillRack ? 'Choisir le vin' : 'Ajouter une nouvelle bouteille de…'}</MonoLabel>
        <div className="relative mt-2 mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <input
            value={pickQuery}
            onChange={e => setPickQuery(e.target.value)}
            placeholder="Rechercher un vin de la cave"
            aria-label="Rechercher un vin"
            className="w-full h-11 md:h-9 pl-9 pr-3 rounded-md border border-stone-300 bg-white text-sm outline-none focus:border-wine-600 focus:ring-2 focus:ring-wine-600/30"
          />
        </div>
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {pickWines.map(w => (
            <li key={w.id}>
              <button
                disabled={busy}
                onClick={async () => {
                  if (fillRack) {
                    const rack = fillRack;
                    if (!(await confirmAction({ title: `Remplir « ${rack.name} » avec ${w.name} ?`, message: 'Une bouteille sera créée dans chaque emplacement vide.', confirmLabel: 'Remplir' }))) return;
                    closePicker();
                    act(() => fillRackWithWine(rack.id, w.id), `« ${rack.name} » rempli`, 'Le remplissage a échoué.');
                  } else if (emptyTarget) {
                    const t = emptyTarget;
                    closePicker();
                    act(() => addBottleAtLocation(w.id, { rackId: t.rack.id, x: t.x, y: t.y }, w.name, w.vintage), `Bouteille ajoutée en ${t.addr}`, 'L’ajout a échoué.');
                  }
                }}
                className="w-full text-left flex items-center gap-2 rounded-md hover:bg-stone-50 px-3 py-2.5"
              >
                <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${typeToCellClass[w.type] || 'bg-stone-300 border-stone-400'}`} />
                <span className="serif-it text-stone-900 truncate flex-1">{w.name}</span>
                <span className="mono text-[10px] text-stone-500">{w.vintage} · ×{w.inventoryCount}</span>
              </button>
            </li>
          ))}
          {pickWines.length === 0 && <li className="text-sm text-stone-400 italic px-3 py-2">Aucun vin trouvé. <Link to="/add-wine" className="text-wine-700 underline">Créer une fiche</Link></li>}
        </ul>
      </Modal>

      <div className="mono text-[10px] text-stone-500 italic pt-3 mt-6 border-t border-stone-200">
        {editMode
          ? <>Édition en direct · clic sur un nom pour renommer · stepper pour redimensionner · drag&amp;drop pour déplacer une bouteille</>
          : <>Vue lecture · adressage <span className="text-stone-700">[Étagère][Colonne]-[Rangée]</span> (ex: A2-3) · ouvrir l'édition pour réorganiser</>
        }
      </div>
    </div>
    </PlanActionsContext.Provider>
    </PlanFocusContext.Provider>
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
  const actions = useContext(PlanActionsContext);
  const focusWineId = useContext(PlanFocusContext);
  const dropAttempt = !!drag && isDropTarget;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-lg p-3 mb-6 transition ${
        dropAttempt
          ? 'ring-2 ring-wine-600 ring-offset-1 border border-wine-300 bg-wine-50/30'
          : bottles.length > 0
          ? 'border border-amber-300 bg-amber-50/40'
          : 'border border-dashed border-stone-300 bg-stone-50/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`mono text-[10px] tracking-widest ${bottles.length ? 'text-amber-800' : 'text-stone-500'}`}>
          ▼ ZONE DE DÉCHARGEMENT {bottles.length > 0 && `· ${bottles.length} EN ATTENTE`}
        </span>
        <div className="flex-1" />
        <Link
          to="/add-wine"
          className="mono text-[10px] tracking-widest px-2.5 h-7 inline-flex items-center rounded border border-stone-300 bg-white text-stone-700 hover:border-wine-600 hover:text-wine-700 transition"
        >
          + AJOUTER UNE BOUTEILLE
        </Link>
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
                onClick={() => actions?.onBottle({ wine, bottle }, 'Zone d’attente')}
                data-plan-focus={focusWineId === wine.id ? 'true' : undefined}
                className={`flex items-center gap-2 px-2.5 py-1.5 bg-white border border-stone-300 hover:border-wine-700 rounded-md cursor-grab active:cursor-grabbing transition ${
                  isDragSrc ? 'opacity-30' : ''
                } ${focusWineId === wine.id ? FOCUS_RING : ''}`}
                title={`Glisser pour placer · ${wine.name} ${wine.vintage || ''}`}
              >
                <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${cls}`} />
                <span className="serif-it text-[12.5px] text-stone-900 leading-tight truncate max-w-[200px]">{wine.name}</span>
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
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDragOverSlot: (key: string) => void;
  onDropSlot: (x: number, y: number) => void;
  onStartDrag: (b: Bottle, w: CellarWine, x: number, y: number) => void;
  onRename: (n: string) => void;
  onResize: (key: 'width' | 'height', delta: number) => void;
  onDelete: () => void;
}
const ShelfBlock: React.FC<ShelfBlockProps> = ({ rack, contents, hover, onHover, editMode, drag, dropTarget, canMoveLeft, canMoveRight, onMoveLeft, onMoveRight, onDragOverSlot, onDropSlot, onStartDrag, onRename, onResize, onDelete }) => {
  const actions = useContext(PlanActionsContext);
  const focusWineId = useContext(PlanFocusContext);
  const filled = Object.values(contents).filter(Boolean).length;
  const total = rack.width * rack.height;

  return (
    <div className="shrink-0">
      {/* Header */}
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="serif text-lg text-stone-900 leading-none">{rackAlias(rack.name)}</div>
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
        <div className="mono text-[10px] text-stone-600">{filled}/{total}</div>
      </div>

      {/* Edit controls */}
      {editMode && (
        <>
          <div className="flex items-center gap-1.5 mb-2 mono text-[9px] tracking-widest text-stone-500">
            <span>COL</span>
            <Stepper value={rack.width} onMinus={() => onResize('width', -1)} onPlus={() => onResize('width', +1)} min={rack.width <= 1} max={rack.width >= 12} />
            <span className="ml-1">RNG</span>
            <Stepper value={rack.height} onMinus={() => onResize('height', -1)} onPlus={() => onResize('height', +1)} min={rack.height <= 1} max={rack.height >= 12} />
            <button
              onClick={() => actions?.onFill(rack)}
              className="ml-auto h-5 px-1.5 rounded border border-stone-300 bg-white text-stone-600 hover:border-wine-700 hover:text-wine-700"
              title="Remplir les emplacements vides avec un vin"
            >
              REMPLIR
            </button>
            <button
              onClick={onDelete}
              className="w-5 h-5 flex items-center justify-center rounded border border-stone-300 bg-white text-stone-500 hover:border-wine-700 hover:text-wine-700 hover:bg-wine-50"
              title="Supprimer cette étagère"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 mb-2">
            <button
              onClick={onMoveLeft}
              disabled={!canMoveLeft}
              className="flex-1 h-6 flex items-center justify-center gap-1 rounded border border-stone-300 bg-white text-stone-700 hover:border-wine-700 hover:text-wine-700 disabled:opacity-30 disabled:hover:border-stone-300 disabled:hover:text-stone-700 transition mono text-[9px] tracking-widest"
              title="Déplacer à gauche"
            >
              <ChevronLeft className="w-3 h-3" /> GAUCHE
            </button>
            <button
              onClick={onMoveRight}
              disabled={!canMoveRight}
              className="flex-1 h-6 flex items-center justify-center gap-1 rounded border border-stone-300 bg-white text-stone-700 hover:border-wine-700 hover:text-wine-700 disabled:opacity-30 disabled:hover:border-stone-300 disabled:hover:text-stone-700 transition mono text-[9px] tracking-widest"
              title="Déplacer à droite"
            >
              DROITE <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </>
      )}

      {/* Grid */}
      <div className="border border-stone-300 bg-stone-50/50 p-2 rounded-sm">
        {/* Column labels */}
        <div className="grid mb-1" style={{ gridTemplateColumns: `16px repeat(${rack.width}, 28px)`, gap: '4px' }}>
          <span />
          {Array.from({ length: rack.width }).map((_, c) => (
            <span key={c} className="mono text-[9px] text-stone-400 text-center">{c + 1}</span>
          ))}
        </div>
        {Array.from({ length: rack.height }).map((_, rIdx) => {
          const rowNum = rIdx + 1;
          const alias = rackAlias(rack.name);
          return (
          <div key={rIdx} className="grid mb-1 last:mb-0" style={{ gridTemplateColumns: `16px repeat(${rack.width}, 28px)`, gap: '4px' }}>
            <span className="mono text-[9px] text-stone-400 self-center text-right pr-1">{rowNum}</span>
            {Array.from({ length: rack.width }).map((_, cIdx) => {
              const key = `${cIdx}-${rIdx}`;
              const info = contents[key];
              const slotKey = `${rack.id}/${key}`;
              const slotAddr = `${alias}${cIdx + 1}-${rowNum}`;
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
                    onClick={() => actions?.onBottle(info, slotAddr)}
                    data-plan-focus={focusWineId === info.wine.id ? 'true' : undefined}
                    className={`relative w-7 h-7 rounded-sm transition cursor-grab active:cursor-grabbing ${cellClass} ${focusWineId === info.wine.id ? FOCUS_RING : ''}`}
                    title={`${slotAddr} · ${info.wine.name} ${info.wine.vintage || ''}`}
                  >
                    {isHovered && !drag && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full z-30 bg-stone-900 text-white px-3 py-1.5 rounded text-[11px] whitespace-nowrap shadow-lg pointer-events-none">
                        <div className="serif-it leading-tight">{info.wine.name}</div>
                        <div className="mono text-[9px] tracking-widest text-stone-400 mt-0.5">{slotAddr} · {info.wine.vintage || '?'}</div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={cIdx}
                  {...cellProps}
                  onClick={() => !editMode && actions?.onEmpty(rack, cIdx, rIdx, slotAddr)}
                  className={`w-7 h-7 rounded-sm transition ${!editMode ? 'cursor-pointer' : ''} ${cellClass} ${actions?.moving ? MOVE_TARGET : ''}`}
                  title={`${slotAddr} · vide`}
                />
              );
            })}
          </div>
          );
        })}
      </div>
      <div className="h-1 bg-stone-300 mx-2 mt-1 rounded-b" />
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
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDragOverSlot: (key: string) => void;
  onDropSlot: (x: number, y: number) => void;
  onStartDrag: (b: Bottle, w: CellarWine, x: number, y: number) => void;
  onRename: (n: string) => void;
  onResize: (key: 'width' | 'height', delta: number) => void;
  onDelete: () => void;
}
const CaseBlock: React.FC<CaseBlockProps> = ({ rack, contents, editMode, drag, dropTarget, canMoveLeft, canMoveRight, onMoveLeft, onMoveRight, onDragOverSlot, onDropSlot, onStartDrag, onRename, onResize, onDelete }) => {
  const actions = useContext(PlanActionsContext);
  const focusWineId = useContext(PlanFocusContext);
  const capacity = rack.width * rack.height;
  const isLarge = capacity >= 12;
  const cols = rack.width;
  const span = isLarge ? 'col-span-6 sm:col-span-4 md:col-span-3' : 'col-span-4 sm:col-span-3 md:col-span-2';

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
    <div className={`${span} border border-stone-300 bg-stone-50/50 rounded p-2.5`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="mono text-[9px] tracking-widest text-stone-500">{rack.id.slice(0, 6).toUpperCase()}</div>
        <div className="mono text-[10px] text-stone-700">{filled}/{capacity}</div>
      </div>

      {editMode && (
        <>
          <div className="flex items-center gap-1.5 mb-2 mono text-[9px] tracking-widest text-stone-500">
            <span>COL</span>
            <Stepper value={rack.width} onMinus={() => onResize('width', -1)} onPlus={() => onResize('width', +1)} min={rack.width <= 1} max={rack.width >= 8} />
            <span className="ml-1">RNG</span>
            <Stepper value={rack.height} onMinus={() => onResize('height', -1)} onPlus={() => onResize('height', +1)} min={rack.height <= 1} max={rack.height >= 8} />
            <button
              onClick={() => actions?.onFill(rack)}
              className="ml-auto h-5 px-1.5 rounded border border-stone-300 bg-white text-stone-600 hover:border-wine-700 hover:text-wine-700"
              title="Remplir les emplacements vides avec un vin"
            >
              REMPLIR
            </button>
            <button
              onClick={onDelete}
              className="w-5 h-5 flex items-center justify-center rounded border border-stone-300 bg-white text-stone-500 hover:border-wine-700 hover:text-wine-700 hover:bg-wine-50"
              title="Supprimer cette caisse"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 mb-2">
            <button
              onClick={onMoveLeft}
              disabled={!canMoveLeft}
              className="flex-1 h-6 flex items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:border-wine-700 hover:text-wine-700 disabled:opacity-30 disabled:hover:border-stone-300 disabled:hover:text-stone-700 transition"
              title="Déplacer à gauche"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              onClick={onMoveRight}
              disabled={!canMoveRight}
              className="flex-1 h-6 flex items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:border-wine-700 hover:text-wine-700 disabled:opacity-30 disabled:hover:border-stone-300 disabled:hover:text-stone-700 transition"
              title="Déplacer à droite"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </>
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
                onClick={() => !editMode && actions?.onEmpty(rack, x, y, `${rack.name} · ${x + 1}-${y + 1}`)}
                className={`w-7 h-7 rounded-sm border bg-white border-stone-200 border-dashed transition ${!editMode ? 'cursor-pointer' : ''} ${isDropTargetCell ? 'ring-2 ring-wine-600 ring-offset-1' : ''} ${actions?.moving ? MOVE_TARGET : ''}`}
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
              onClick={() => actions?.onBottle(info, `${rack.name} · ${x + 1}-${y + 1}`)}
              data-plan-focus={focusWineId === info.wine.id ? 'true' : undefined}
              title={`${info.wine.name} · ${info.wine.vintage || '?'}`}
              className={`w-7 h-7 rounded-sm border cursor-grab active:cursor-grabbing transition hover:ring-1 hover:ring-stone-900/40 ${fill} ${isDragSrc ? 'opacity-30' : ''} ${focusWineId === info.wine.id ? FOCUS_RING : ''}`}
            />
          );
        })}
      </div>

      {/* Label */}
      <div className="mb-2">
        {editMode ? (
          <InlineText value={rack.name} onSave={onRename} className="serif text-[12px] text-stone-900" />
        ) : (
          <div className="serif text-[12px] text-stone-900">{rack.name}</div>
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
              className="flex items-center gap-1.5 text-[10.5px] hover:bg-white rounded -mx-0.5 px-0.5 transition"
              title={`${lot.wine.name} · ${lot.wine.vintage || '?'} · ×${lot.qty}`}
            >
              <span className={`w-2 h-2 rounded-[2px] border shrink-0 ${swatch}`} />
              <span className="serif-it text-stone-800 truncate flex-1 leading-tight">{lot.wine.name}</span>
              <span className="mono text-[9px] text-stone-500 shrink-0">×{lot.qty}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
