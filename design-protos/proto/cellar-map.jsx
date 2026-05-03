// Cellar Map — top-down visualization with full structure editing.
// Bottles in 'LIMBO' (loc='LIMBO' or no parseable loc) live in the unloading zone:
// a holding pen for newly-added bottles awaiting placement OR bottles orphaned
// by shrinking/removing a shelf/case.
//
// Edit mode (toggle): inline rename, +/− dims, delete container, add new container.

const DEFAULT_SHELVES = [
  { id:'A', label:'ÉTAGÈRE A · OUEST',    cols:4, rows:6 },
  { id:'B', label:'ÉTAGÈRE B · NORD',     cols:5, rows:7 },
  { id:'C', label:'ÉTAGÈRE C · CENTRE',   cols:6, rows:7 },
  { id:'D', label:'ÉTAGÈRE D · SUD',      cols:5, rows:6 },
];

const DEFAULT_CASES = [
  { id:'CX-01', label:'Caisse #01', capacity:6  },
  { id:'CX-02', label:'Caisse #02', capacity:12 },
  { id:'CX-03', label:'Caisse #03', capacity:6  },
  { id:'CX-04', label:'Caisse #04', capacity:6  },
  { id:'CX-05', label:'Caisse #05', capacity:12 },
  { id:'CX-06', label:'Caisse #06', capacity:6  },
];

const CASE_WINE_COLORS = [
  { rouge:'bg-wine-700 border-wine-800',   blanc:'bg-amber-200 border-amber-400' },
  { rouge:'bg-wine-400 border-wine-500',   blanc:'bg-amber-400 border-amber-600' },
];

// Loc parsing
function canonLoc(loc) {
  if (!loc) return null;
  if (loc === 'LIMBO') return 'LIMBO';
  if (loc.startsWith('CX-')) return loc;
  if (loc.includes('-')) return loc;
  const m = loc.match(/^([A-Z])(\d+)$/);
  if (!m) return loc;
  return `${m[1]}${m[2]}-1`;
}
function parseShelfLoc(loc) {
  const c = canonLoc(loc);
  if (!c || c === 'LIMBO') return null;
  const m = c.match(/^([A-Z])(\d+)-(\d+)$/);
  if (!m) return null;
  return { shelf: m[1], col: parseInt(m[2],10), row: parseInt(m[3],10) };
}
const isCaseLoc = (loc) => !!loc && loc.startsWith('CX-');
const slotName = (shelf, col, row) => `${shelf}${col}-${row}`;

// Inline editable text (click to edit)
function InlineText({ value, onChange, className='', placeholder='' }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef(null);
  React.useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  React.useEffect(() => { setDraft(value); }, [value]);
  if (!editing) {
    return (
      <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className={`text-left hover:bg-stone-200/60 hover:ring-1 hover:ring-stone-300 rounded px-1 -mx-1 transition ${className}`}>
        {value || <span className="text-stone-400 italic">{placeholder}</span>}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onChange(draft); setEditing(false); }}
      onKeyDown={(e) => { if (e.key==='Enter') { onChange(draft); setEditing(false); } if (e.key==='Escape') { setDraft(value); setEditing(false); } }}
      className={`bg-white border border-wine-400 rounded px-1 -mx-1 outline-none ring-1 ring-wine-200 ${className}`}
    />
  );
}

// +/− stepper
function Stepper({ value, onMinus, onPlus, label, minDisabled, maxDisabled }) {
  return (
    <div className="inline-flex items-center gap-0.5 bg-white border border-stone-300 rounded">
      <button onClick={onMinus} disabled={minDisabled}
        className="w-5 h-5 flex items-center justify-center text-stone-700 hover:bg-stone-100 disabled:text-stone-300 disabled:hover:bg-transparent rounded-l">−</button>
      <span className="mono text-[10px] text-stone-700 px-1.5 min-w-[2ch] text-center" title={label}>{value}</span>
      <button onClick={onPlus} disabled={maxDisabled}
        className="w-5 h-5 flex items-center justify-center text-stone-700 hover:bg-stone-100 disabled:text-stone-300 disabled:hover:bg-transparent rounded-r">+</button>
    </div>
  );
}

function CellarMap({ rows, focusedId, onFocus, setRows }) {
  const toast = useToast();
  const [shelves, setShelves] = React.useState(DEFAULT_SHELVES);
  const [cases, setCases] = React.useState(DEFAULT_CASES);
  const [editMode, setEditMode] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const [drag, setDrag] = React.useState(null);
  const [hoverDrop, setHoverDrop] = React.useState(null);
  const [moves, setMoves] = React.useState({}); // wineId → overrideLoc

  const adjustedRows = React.useMemo(
    () => rows.map(r => moves[r.id] !== undefined ? { ...r, loc: moves[r.id] } : r),
    [rows, moves]
  );

  // Determine if a loc is "valid" (points to an existing shelf slot or case)
  const isValidLoc = (loc) => {
    if (!loc || loc === 'LIMBO') return false;
    if (isCaseLoc(loc)) return cases.some(c => c.id === loc);
    const p = parseShelfLoc(loc);
    if (!p) return false;
    const sh = shelves.find(s => s.id === p.shelf);
    return !!sh && p.col >= 1 && p.col <= sh.cols && p.row >= 1 && p.row <= sh.rows;
  };

  // Limbo: rows whose loc is 'LIMBO' or doesn't point to an existing container
  const limboRows = React.useMemo(
    () => adjustedRows.filter(r => r.loc === 'LIMBO' || !isValidLoc(r.loc)),
    [adjustedRows, shelves, cases]
  );

  const slotMap = React.useMemo(() => {
    const m = new Map();
    adjustedRows.forEach(r => {
      if (isCaseLoc(r.loc)) return;
      if (r.loc === 'LIMBO' || !isValidLoc(r.loc)) return;
      const c = canonLoc(r.loc);
      if (!c) return;
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(r);
    });
    return m;
  }, [adjustedRows, shelves, cases]);

  const caseMap = React.useMemo(() => {
    const m = new Map();
    adjustedRows.forEach(r => {
      if (!isCaseLoc(r.loc)) return;
      if (!isValidLoc(r.loc)) return;
      if (!m.has(r.loc)) m.set(r.loc, []);
      m.get(r.loc).push(r);
    });
    return m;
  }, [adjustedRows, cases]);

  const wineAt = (shelf, col, row) => (slotMap.get(slotName(shelf, col, row)) || [])[0];
  const stackAt = (shelf, col, row) => slotMap.get(slotName(shelf, col, row)) || [];

  const startDrag = (wineId, fromLoc) => setDrag({ wineId, fromLoc });

  const commitMove = (wineId, fromLoc, toLoc) => {
    if (!toLoc || toLoc === fromLoc) { setDrag(null); setHoverDrop(null); return; }
    const prev = moves;
    setMoves(m => ({ ...m, [wineId]: toLoc }));
    const fromLabel = fromLoc === 'LIMBO' ? 'attente' : fromLoc;
    const toLabel = toLoc === 'LIMBO' ? 'attente' : toLoc;
    toast.show({
      title: `Déplacé ${fromLabel} → ${toLabel}`,
      message: 'Action réversible · 8s',
      duration: 8000,
      action: { label:'ANNULER', onClick: () => setMoves(prev) },
    });
    setDrag(null);
    setHoverDrop(null);
  };

  const canDropInCase = (caseId, draggedWineId) => {
    const meta = cases.find(c => c.id === caseId);
    if (!meta) return false;
    const lots = (caseMap.get(caseId) || []).filter(l => l.id !== draggedWineId);
    const used = lots.reduce((a,l) => a + l.qty, 0);
    const dragged = adjustedRows.find(r => r.id === draggedWineId);
    if (!dragged) return false;
    return used + dragged.qty <= meta.capacity;
  };

  const handleSlotClick = (shelf, col, row) => {
    const w = wineAt(shelf, col, row);
    if (w) onFocus?.(w.id);
  };
  const handleSlotDrop = (shelf, col, row) => {
    if (!drag) return;
    commitMove(drag.wineId, drag.fromLoc, slotName(shelf, col, row));
  };
  const handleSlotDragStart = (shelf, col, row) => {
    const w = wineAt(shelf, col, row);
    if (w) startDrag(w.id, slotName(shelf, col, row));
  };

  // Orphan handler: any loc that no longer points to an existing slot → LIMBO
  const orphanInvalid = (newShelves, newCases) => {
    const updates = {};
    adjustedRows.forEach(r => {
      const loc = r.loc;
      if (loc === 'LIMBO') return;
      if (isCaseLoc(loc)) {
        if (!newCases.some(c => c.id === loc)) updates[r.id] = 'LIMBO';
        return;
      }
      const p = parseShelfLoc(loc);
      if (!p) return;
      const sh = newShelves.find(s => s.id === p.shelf);
      if (!sh || p.col > sh.cols || p.row > sh.rows) updates[r.id] = 'LIMBO';
    });
    return updates;
  };

  const applyShelvesChange = (newShelves) => {
    const orphans = orphanInvalid(newShelves, cases);
    setShelves(newShelves);
    if (Object.keys(orphans).length) {
      setMoves(m => ({ ...m, ...orphans }));
      toast.show({ title:`${Object.keys(orphans).length} bouteille(s) en attente`, message:'Déplacées en zone de déchargement', duration:4000 });
    }
  };
  const applyCasesChange = (newCases) => {
    const orphans = orphanInvalid(shelves, newCases);
    setCases(newCases);
    if (Object.keys(orphans).length) {
      setMoves(m => ({ ...m, ...orphans }));
      toast.show({ title:`${Object.keys(orphans).length} bouteille(s) en attente`, message:'Déplacées en zone de déchargement', duration:4000 });
    }
  };

  // Shelf ops
  const renameShelf = (id, label) => setShelves(ss => ss.map(s => s.id===id ? { ...s, label } : s));
  const adjustShelf = (id, key, delta) => {
    const next = shelves.map(s => s.id===id ? { ...s, [key]: Math.max(1, Math.min(12, s[key]+delta)) } : s);
    applyShelvesChange(next);
  };
  const deleteShelf = (id) => {
    if (!confirm(`Supprimer ${id} ? Les bouteilles partiront en zone d'attente.`)) return;
    applyShelvesChange(shelves.filter(s => s.id !== id));
  };
  const addShelf = () => {
    const usedIds = new Set(shelves.map(s => s.id));
    const next = [...'EFGHIJKLMNOPQRSTUVWXYZ'].find(c => !usedIds.has(c)) || `S${shelves.length+1}`;
    setShelves([...shelves, { id: next, label:`ÉTAGÈRE ${next}`, cols:4, rows:5 }]);
  };

  // Case ops
  const renameCase = (id, label) => setCases(cs => cs.map(c => c.id===id ? { ...c, label } : c));
  const adjustCase = (id, delta) => {
    const next = cases.map(c => c.id===id ? { ...c, capacity: Math.max(1, Math.min(24, c.capacity+delta)) } : c);
    applyCasesChange(next);
  };
  const deleteCase = (id) => {
    if (!confirm(`Supprimer ${id} ? Les bouteilles partiront en zone d'attente.`)) return;
    applyCasesChange(cases.filter(c => c.id !== id));
  };
  const addCase = () => {
    const used = new Set(cases.map(c => parseInt(c.id.split('-')[1],10)));
    let n = 1; while (used.has(n)) n++;
    const id = `CX-${String(n).padStart(2,'0')}`;
    setCases([...cases, { id, label:`Caisse #${String(n).padStart(2,'0')}`, capacity:6 }]);
  };

  // Add new bottle (lands in limbo). Uses setRows from parent.
  const addBottle = () => {
    if (!setRows) {
      toast.show({ title:'Indisponible', message:'L\'ajout n\'est pas câblé sur cette page', duration:3000 });
      return;
    }
    const id = `new-${Date.now()}`;
    const newRow = {
      id, name:'Nouvelle bouteille', vintage:new Date().getFullYear(),
      color:'rouge', qty:1, loc:'LIMBO',
      peak:null, region:'—', score:null,
    };
    setRows(rs => [newRow, ...rs]);
    toast.show({ title:'Bouteille créée', message:'En zone de déchargement · glisse-la sur une étagère', duration:3000 });
  };

  const slotClasses = (color, isFocused, isHovered, isDragSrc) => {
    let bg = 'bg-white', border = 'border-stone-200 border-dashed';
    if (color === 'rouge')    { bg = 'bg-wine-700';   border = 'border-wine-800 border-solid'; }
    else if (color === 'blanc'){ bg = 'bg-amber-100'; border = 'border-amber-300 border-solid'; }
    if (isFocused) return 'bg-wine-500 border-wine-700 ring-2 ring-wine-700 ring-offset-1 border-solid';
    if (isHovered && color) return `${bg} ${border} ring-1 ring-stone-900/40`;
    if (isDragSrc) return `${bg} ${border} opacity-30`;
    return `${bg} ${border}`;
  };

  const limboDropTarget = drag && hoverDrop === 'LIMBO';

  return (
    <div className="space-y-6">
      {/* legend + edit toggle */}
      <div className="flex items-center gap-4 mono text-[10px] tracking-widest text-stone-600 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-wine-700 rounded-sm border border-wine-800"/>ROUGE</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-amber-100 rounded-sm border border-amber-300"/>BLANC</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-white rounded-sm border border-stone-300 border-dashed"/>VIDE</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-wine-500 rounded-sm border-2 border-wine-700"/>SÉLECTIONNÉ</span>
        <div className="flex-1"/>
        <span>{adjustedRows.reduce((a,r)=>a+r.qty,0)} BTL</span>
        <button
          onClick={() => setEditMode(!editMode)}
          className={`px-2.5 h-7 rounded border transition ${editMode ? 'bg-wine-700 text-white border-wine-800' : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'}`}
        >
          ⚙ {editMode ? 'TERMINER' : 'ÉDITER STRUCTURE'}
        </button>
      </div>

      {/* LIMBO / unloading zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setHoverDrop('LIMBO'); }}
        onDragLeave={() => setHoverDrop(null)}
        onDrop={() => { if (drag) commitMove(drag.wineId, drag.fromLoc, 'LIMBO'); }}
        className={`border rounded-lg p-3 transition ${
          limboDropTarget ? 'ring-2 ring-wine-600 ring-offset-1 border-wine-300 bg-wine-50/30' :
          limboRows.length > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-dashed border-stone-300 bg-stone-50/40'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className={`mono text-[10px] tracking-widest ${limboRows.length ? 'text-amber-800' : 'text-stone-500'}`}>
            ▼ ZONE DE DÉCHARGEMENT {limboRows.length > 0 && `· ${limboRows.length} EN ATTENTE`}
          </span>
          <div className="flex-1"/>
          <button onClick={addBottle}
            className="mono text-[10px] tracking-widest px-2.5 h-7 rounded border border-stone-300 bg-white text-stone-700 hover:border-wine-600 hover:text-wine-700 transition">
            + AJOUTER UNE BOUTEILLE
          </button>
        </div>
        {limboRows.length === 0 ? (
          <div className="mono text-[10px] tracking-widest text-stone-400 italic py-2">
            Aucune bouteille en attente · les nouveaux ajouts atterrissent ici
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {limboRows.map(lot => {
                const isDragSrc = drag && drag.wineId === lot.id;
                const isFocused = focusedId === lot.id;
                const colorClass = lot.color === 'rouge' ? 'bg-wine-700 border-wine-800'
                                 : lot.color === 'blanc' ? 'bg-amber-100 border-amber-300'
                                 : 'bg-stone-300 border-stone-400';
                return (
                  <motion.div
                    key={lot.id}
                    layout
                    initial={{ opacity:0, scale:0.9 }}
                    animate={{ opacity: isDragSrc ? 0.3 : 1, scale:1 }}
                    exit={{ opacity:0, scale:0.9 }}
                    draggable
                    onDragStart={() => startDrag(lot.id, 'LIMBO')}
                    onClick={() => onFocus?.(lot.id)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 bg-white border rounded-md cursor-grab active:cursor-grabbing transition ${
                      isFocused ? 'border-wine-700 ring-2 ring-wine-200' : 'border-stone-300 hover:border-stone-500'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 ${colorClass}`}/>
                    <span className="serif-it text-[12.5px] text-stone-900 leading-tight">{lot.name}</span>
                    <span className="mono text-[9px] tracking-widest text-stone-500">{lot.vintage}</span>
                    <span className="mono text-[9px] text-stone-500">×{lot.qty}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* SHELVES */}
      <div>
        <div className="mono text-[10px] tracking-widest text-stone-500 mb-3">▌ ÉTAGÈRES</div>
        <div className="overflow-x-auto pb-3 -mx-2 px-2">
          <div className="flex items-start gap-6" style={{ minWidth:'fit-content' }}>
            {shelves.map(sh => {
              const filledCount = adjustedRows.filter(r => {
                const p = parseShelfLoc(r.loc); return p && p.shelf === sh.id;
              }).reduce((a,r)=>a+r.qty,0);
              const total = sh.cols * sh.rows;
              return (
                <div key={sh.id} className="shrink-0">
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <div className="serif text-lg text-stone-900">{sh.id}</div>
                      {editMode ? (
                        <InlineText value={sh.label} onChange={(v) => renameShelf(sh.id, v)}
                          className="mono text-[9px] tracking-widest text-stone-500"/>
                      ) : (
                        <div className="mono text-[9px] tracking-widest text-stone-500">{sh.label}</div>
                      )}
                    </div>
                    <div className="mono text-[10px] text-stone-600">{filledCount}/{total}</div>
                  </div>
                  {editMode && (
                    <div className="flex items-center gap-1.5 mb-2 mono text-[9px] tracking-widest text-stone-500">
                      <span>COL</span>
                      <Stepper value={sh.cols} label="cols"
                        onMinus={() => adjustShelf(sh.id,'cols',-1)} onPlus={() => adjustShelf(sh.id,'cols',+1)}
                        minDisabled={sh.cols<=1} maxDisabled={sh.cols>=12}/>
                      <span className="ml-1">RNG</span>
                      <Stepper value={sh.rows} label="rows"
                        onMinus={() => adjustShelf(sh.id,'rows',-1)} onPlus={() => adjustShelf(sh.id,'rows',+1)}
                        minDisabled={sh.rows<=1} maxDisabled={sh.rows>=12}/>
                      <button onClick={() => deleteShelf(sh.id)}
                        className="ml-auto w-5 h-5 flex items-center justify-center rounded border border-stone-300 bg-white text-stone-500 hover:border-wine-700 hover:text-wine-700 hover:bg-wine-50">×</button>
                    </div>
                  )}
                  <div className="border border-stone-300 bg-stone-50/50 p-2 rounded-sm relative">
                    <div className="grid mb-1" style={{ gridTemplateColumns:`16px repeat(${sh.cols}, 28px)`, gap:'4px' }}>
                      <span/>
                      {Array.from({length:sh.cols}).map((_,c) => (
                        <span key={c} className="mono text-[9px] text-stone-400 text-center">{c+1}</span>
                      ))}
                    </div>
                    {Array.from({length: sh.rows}).map((_, rIdx) => {
                      const row = rIdx + 1;
                      return (
                        <div key={row} className="grid mb-1" style={{ gridTemplateColumns:`16px repeat(${sh.cols}, 28px)`, gap:'4px' }}>
                          <span className="mono text-[9px] text-stone-400 self-center text-right pr-1">{row}</span>
                          {Array.from({length: sh.cols}).map((_, cIdx) => {
                            const col = cIdx + 1;
                            const sname = slotName(sh.id, col, row);
                            const stack = stackAt(sh.id, col, row);
                            const w = stack[0];
                            const color = w ? w.color : null;
                            const isFocused = w && focusedId === w.id;
                            const isHovered = hover === sname;
                            const isDragSrc = drag && drag.fromLoc === sname;
                            const isDropTarget = drag && hoverDrop === sname;
                            const stackCount = stack.length;
                            return (
                              <div
                                key={col}
                                draggable={!!w}
                                onDragStart={() => handleSlotDragStart(sh.id, col, row)}
                                onDragOver={(e) => { e.preventDefault(); setHoverDrop(sname); }}
                                onDragLeave={() => setHoverDrop(null)}
                                onDrop={() => handleSlotDrop(sh.id, col, row)}
                                onMouseEnter={() => setHover(sname)}
                                onMouseLeave={() => setHover(null)}
                                onClick={() => handleSlotClick(sh.id, col, row)}
                                className={`relative w-7 h-7 border rounded-sm transition ${w ? 'cursor-pointer' : 'cursor-default'} ${slotClasses(color, isFocused, isHovered, isDragSrc)} ${isDropTarget ? 'ring-2 ring-wine-600 ring-offset-1' : ''}`}
                                title={w ? `${sname} · ${w.name} ${w.vintage}` : sname}
                              >
                                {stackCount > 1 && (
                                  <span className="absolute -top-1 -right-1 bg-stone-900 text-white mono text-[8px] px-1 rounded-full leading-tight">+{stackCount-1}</span>
                                )}
                                <AnimatePresence>
                                  {isHovered && w && (
                                    <motion.div
                                      initial={{opacity:0,y:4,scale:0.95}}
                                      animate={{opacity:1,y:0,scale:1}}
                                      exit={{opacity:0,scale:0.95}}
                                      className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-stone-900 text-white px-3 py-1.5 rounded text-[11px] whitespace-nowrap pointer-events-none"
                                    >
                                      <div className="serif-it">{w.name}</div>
                                      <div className="mono text-[9px] tracking-widest text-stone-400 mt-0.5">{sname} · {w.vintage} · ×{w.qty}</div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                  <div className="h-1 bg-stone-300 mx-2 mt-1 rounded-b"/>
                </div>
              );
            })}

            {editMode && (
              <button onClick={addShelf}
                className="shrink-0 self-center mono text-[10px] tracking-widest px-3 py-3 rounded border-2 border-dashed border-stone-300 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 transition">
                + AJOUTER<br/>UNE ÉTAGÈRE
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CASES */}
      <div>
        <div className="mono text-[10px] tracking-widest text-stone-500 mb-3">▢ CAISSES</div>
        <div className="grid grid-cols-12 gap-2.5">
          {cases.map(meta => {
            const lots = caseMap.get(meta.id) || [];
            const filled = lots.reduce((a,l) => a + l.qty, 0);
            const isLarge = meta.capacity >= 12;
            const cols = isLarge ? 6 : 3;
            const rows_ = Math.ceil(meta.capacity / cols);
            const span = isLarge ? 'col-span-3' : 'col-span-2';

            const slotFills = [];
            lots.forEach((lot, lotIdx) => {
              const palette = CASE_WINE_COLORS[lotIdx] || CASE_WINE_COLORS[0];
              const fill = palette[lot.color] || palette.rouge;
              for (let i = 0; i < lot.qty; i++) slotFills.push({ fill, lot });
            });

            const isDropTarget = drag && hoverDrop === meta.id;
            const dropAllowed = drag && drag.fromLoc !== meta.id && canDropInCase(meta.id, drag.wineId);
            const dropForbidden = drag && drag.fromLoc !== meta.id && !canDropInCase(meta.id, drag.wineId);

            return (
              <div
                key={meta.id}
                onDragOver={(e) => { e.preventDefault(); setHoverDrop(meta.id); }}
                onDragLeave={() => setHoverDrop(null)}
                onDrop={() => {
                  if (!drag) return;
                  if (drag.fromLoc === meta.id) { setDrag(null); setHoverDrop(null); return; }
                  if (!canDropInCase(meta.id, drag.wineId)) {
                    toast.show({ title:`Caisse ${meta.id} pleine`, message:'Capacité dépassée', duration:3000 });
                    setDrag(null); setHoverDrop(null);
                    return;
                  }
                  commitMove(drag.wineId, drag.fromLoc, meta.id);
                }}
                className={`${span} border bg-stone-50/50 rounded p-2.5 transition ${
                  isDropTarget && dropAllowed ? 'ring-2 ring-wine-600 ring-offset-1 border-wine-300 bg-wine-50/30' :
                  isDropTarget && dropForbidden ? 'ring-2 ring-stone-400 ring-offset-1 border-stone-400 bg-stone-100' :
                  'border-stone-300 hover:bg-stone-100/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="mono text-[9px] tracking-widest text-stone-500">{meta.id}</div>
                  <div className="mono text-[10px] text-stone-700">{filled}/{meta.capacity}</div>
                </div>
                {editMode && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Stepper value={meta.capacity} label="capacity"
                      onMinus={() => adjustCase(meta.id,-1)} onPlus={() => adjustCase(meta.id,+1)}
                      minDisabled={meta.capacity<=1} maxDisabled={meta.capacity>=24}/>
                    <button onClick={() => deleteCase(meta.id)}
                      className="ml-auto w-5 h-5 flex items-center justify-center rounded border border-stone-300 bg-white text-stone-500 hover:border-wine-700 hover:text-wine-700 hover:bg-wine-50">×</button>
                  </div>
                )}
                <div className="grid gap-1 mb-2" style={{ gridTemplateColumns:`repeat(${cols}, 28px)` }}>
                  {Array.from({length: rows_ * cols}).map((_,i) => {
                    if (i >= meta.capacity) return <div key={i}/>;
                    const slot = slotFills[i];
                    if (!slot) {
                      return <div key={i} className="w-7 h-7 rounded-sm border bg-white border-stone-200 border-dashed"/>;
                    }
                    const lot = slot.lot;
                    const isDragSrc = drag && drag.wineId === lot.id;
                    const isFocused = focusedId === lot.id;
                    return (
                      <div
                        key={i}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); startDrag(lot.id, meta.id); }}
                        onClick={() => onFocus?.(lot.id)}
                        title={`${lot.name} · ${lot.vintage}`}
                        className={`w-7 h-7 rounded-sm border cursor-pointer transition ${slot.fill} ${isDragSrc ? 'opacity-30' : ''} ${isFocused ? 'ring-2 ring-wine-700 ring-offset-1' : ''}`}
                      />
                    );
                  })}
                </div>
                <div className="mb-2">
                  {editMode ? (
                    <InlineText value={meta.label} onChange={(v) => renameCase(meta.id, v)}
                      className="serif text-[12px] text-stone-900"/>
                  ) : (
                    <div className="serif text-[12px] text-stone-900">{meta.label}</div>
                  )}
                </div>
                <div className="space-y-0.5">
                  {lots.length === 0 ? (
                    <div className="mono text-[9px] tracking-widest text-stone-400 italic">VIDE</div>
                  ) : lots.map((lot, i) => {
                    const palette = CASE_WINE_COLORS[i] || CASE_WINE_COLORS[0];
                    const swatch = palette[lot.color] || palette.rouge;
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-[10.5px]" title={`${lot.name} · ${lot.vintage} · ×${lot.qty}`}>
                        <span className={`w-2 h-2 rounded-[2px] border shrink-0 ${swatch}`}/>
                        <span className="serif-it text-stone-800 truncate flex-1 leading-tight">{lot.name}</span>
                        <span className="mono text-[9px] text-stone-500 shrink-0">×{lot.qty}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {editMode && (
            <button onClick={addCase}
              className="col-span-2 mono text-[10px] tracking-widest px-3 py-6 rounded border-2 border-dashed border-stone-300 text-stone-500 hover:border-wine-600 hover:text-wine-700 hover:bg-wine-50/30 transition">
              + AJOUTER<br/>UNE CAISSE
            </button>
          )}
        </div>
      </div>

      <div className="mono text-[10px] text-stone-500 italic pt-2 border-t border-stone-200">
        Drag &amp; drop entre étagères, caisses et zone de déchargement · adressage <span className="text-stone-700">[Étagère][Colonne]-[Rangée]</span>
      </div>
    </div>
  );
}

window.CellarMap = CellarMap;
