// Cave list — filtres + bulk actions + tri + drag-to-reorder rows
const { motion: _m3, AnimatePresence: _ap3 } = window.Motion;

const CELLAR_DATA = [
  // Shelves
  { id:'c01', name:"Pommard 1er Cru Rugiens",  region:'Bourgogne',   color:'rouge', vintage:2018, loc:'A2-1', qty:2, peak:15,  score:8.5 },
  { id:'c02', name:"Sancerre Les Caillottes",  region:'Loire',       color:'blanc', vintage:2020, loc:'B1-2', qty:3, peak:28,  score:8.0 },
  { id:'c03', name:"Vouvray Foreau",           region:'Loire',       color:'blanc', vintage:2011, loc:'B4-3', qty:1, peak:42,  score:8.0 },
  { id:'c04', name:"Vacqueyras Le Sang",       region:'Rhône Sud',   color:'rouge', vintage:2017, loc:'C2-4', qty:2, peak:58,  score:null },
  { id:'c05', name:"Côte-Rôtie La Landonne",   region:'Rhône Nord',  color:'rouge', vintage:2014, loc:'C5-1', qty:1, peak:75,  score:null },
  { id:'c06', name:"Chablis Vaudésir",         region:'Bourgogne',   color:'blanc', vintage:2019, loc:'B3-5', qty:4, peak:82,  score:7.5 },
  { id:'c07', name:"Saint-Joseph Granit",      region:'Rhône Nord',  color:'rouge', vintage:2016, loc:'C3-2', qty:2, peak:88,  score:8.0 },
  { id:'c08', name:"Bandol Tempier",           region:'Provence',    color:'rouge', vintage:2020, loc:'D3-6', qty:6, peak:340, score:null },
  { id:'c09', name:"Hermitage Chave",          region:'Rhône Nord',  color:'rouge', vintage:2011, loc:'C6-3', qty:1, peak:1100, score:9.0 },
  { id:'c10', name:"Chambolle-Musigny",        region:'Bourgogne',   color:'rouge', vintage:2015, loc:'A4-2', qty:2, peak:520, score:8.5 },
  { id:'c11', name:"Pavillon Blanc Margaux",   region:'Bordeaux',    color:'blanc', vintage:2017, loc:'B5-1', qty:1, peak:920, score:9.0 },
  { id:'c12', name:"Trimbach Riesling",        region:'Alsace',      color:'blanc', vintage:2019, loc:'D1-4', qty:3, peak:280, score:7.5 },
  // Cases — loc = case ID, qty = bottles in that case for that lot
  { id:'k01', name:"Bandol Tempier",           region:'Provence',    color:'rouge', vintage:2020, loc:'CX-01', qty:6,  peak:340, score:null },
  { id:'k02', name:"Châteauneuf Vieux Tél.",   region:'Rhône Sud',   color:'rouge', vintage:2019, loc:'CX-02', qty:8,  peak:680, score:null },
  { id:'k03', name:"Gigondas Saint-Damien",    region:'Rhône Sud',   color:'rouge', vintage:2020, loc:'CX-02', qty:4,  peak:540, score:null },
  { id:'k04', name:"Mercurey Faiveley",        region:'Bourgogne',   color:'rouge', vintage:2021, loc:'CX-03', qty:3,  peak:420, score:null },
  { id:'k05', name:"Pouilly-Fuissé Robert-D.", region:'Bourgogne',   color:'blanc', vintage:2021, loc:'CX-03', qty:2,  peak:380, score:null },
  { id:'k06', name:"Pessac-Léognan Smith",     region:'Bordeaux',    color:'blanc', vintage:2018, loc:'CX-04', qty:6,  peak:520, score:null },
  { id:'k07', name:"Crozes-Hermitage Graillot",region:'Rhône Nord',  color:'rouge', vintage:2020, loc:'CX-05', qty:8,  peak:460, score:null },
  { id:'k08', name:"Riesling Hugel",           region:'Alsace',      color:'blanc', vintage:2021, loc:'CX-06', qty:3,  peak:420, score:null },
  { id:'k09', name:"Pinot Gris Trimbach",      region:'Alsace',      color:'blanc', vintage:2020, loc:'CX-06', qty:2,  peak:340, score:null },
];

function CaveList({ rows: extRows, setRows: extSetRows, focusedId, onFocus } = {}) {
  const [internalRows, setInternalRows] = React.useState(CELLAR_DATA);
  const rows = extRows ?? internalRows;
  const setRows = extSetRows ?? setInternalRows;
  const rowRefs = React.useRef({});
  React.useEffect(() => {
    if (focusedId && rowRefs.current[focusedId]) {
      rowRefs.current[focusedId].scrollIntoView({ block:'center', behavior:'smooth' });
    }
  }, [focusedId]);
  const [selected, setSelected] = React.useState(new Set());
  const [filterColor, setFilterColor] = React.useState('all');
  const [filterRegion, setFilterRegion] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState({ key:'name', dir:'asc' });
  const [dragId, setDragId] = React.useState(null);
  const toast = useToast();

  const regions = React.useMemo(() => ['all', ...new Set(CELLAR_DATA.map(r => r.region))], []);

  const filtered = React.useMemo(() => {
    let arr = rows;
    if (filterColor !== 'all') arr = arr.filter(r => r.color === filterColor);
    if (filterRegion !== 'all') arr = arr.filter(r => r.region === filterRegion);
    if (q.trim()) {
      const lo = q.toLowerCase();
      arr = arr.filter(r => r.name.toLowerCase().includes(lo) || r.region.toLowerCase().includes(lo));
    }
    arr = [...arr].sort((a,b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === 'number') return sort.dir==='asc' ? va-vb : vb-va;
      return sort.dir==='asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [rows, filterColor, filterRegion, q, sort]);

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  };
  const toggleOne = (id) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const bulkDelete = () => {
    const ids = [...selected];
    const prev = rows;
    setRows(rs => rs.filter(r => !selected.has(r.id)));
    setSelected(new Set());
    toast.show({
      title: `${ids.length} bouteille${ids.length>1?'s':''} retirée${ids.length>1?'s':''}`,
      message: 'Action réversible · 8s',
      duration: 8000,
      action: { label:'ANNULER', onClick: () => setRows(prev) },
    });
  };

  const bulkMove = () => {
    toast.info(`${selected.size} sélectionné${selected.size>1?'s':''} · choisis l'emplacement…`);
  };

  // drag-to-reorder
  const onDragStart = (id) => setDragId(id);
  const onDragOver = (e, overId) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setRows(rs => {
      const a = [...rs];
      const from = a.findIndex(r => r.id === dragId);
      const to = a.findIndex(r => r.id === overId);
      if (from < 0 || to < 0) return rs;
      const [m] = a.splice(from, 1);
      a.splice(to, 0, m);
      return a;
    });
  };
  const onDragEnd = () => setDragId(null);

  const Header = ({ k, children, className='' }) => (
    <th className={`text-left font-normal py-2 ${className}`}>
      <button onClick={() => setSort(s => s.key === k ? { key, dir: s.dir==='asc' ? 'desc' : 'asc' } : { key:k, dir:'asc' })} className="mono text-[10px] tracking-widest text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
        {children}{sort.key === k && <span className="text-wine-700">{sort.dir==='asc'?'↑':'↓'}</span>}
      </button>
    </th>
  );

  const peakTone = (d) => d <= 30 ? 'urgent' : d <= 90 ? 'warning' : 'neutral';
  const colorDot = (c) => c==='rouge' ? 'bg-wine-700' : c==='blanc' ? 'bg-amber-200' : 'bg-stone-400';

  return (
    <Card className="col-span-12 overflow-hidden">
      <header className="px-5 py-4 border-b border-stone-200 flex items-center gap-3 bg-stone-50/40">
        <div className="flex-1">
          <SectionLabel>≡ Cave · {filtered.length} sur {rows.length}</SectionLabel>
          <SectionTitle>Toute la cave</SectionTitle>
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filtrer… (nom, région)" className="h-9 px-3 rounded-md border border-stone-300 bg-white text-sm w-64 outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600"/>
        <select value={filterColor} onChange={e=>setFilterColor(e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white text-sm px-2 text-stone-700">
          <option value="all">Toutes couleurs</option><option value="rouge">Rouge</option><option value="blanc">Blanc</option>
        </select>
        <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white text-sm px-2 text-stone-700">
          {regions.map(r => <option key={r} value={r}>{r==='all' ? 'Toutes régions' : r}</option>)}
        </select>
        <Button>+ Ajouter</Button>
      </header>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{height:0, opacity:0}} animate={{height:'auto', opacity:1}} exit={{height:0, opacity:0}} className="overflow-hidden bg-stone-900 text-white">
            <div className="px-5 h-12 flex items-center gap-3">
              <span className="mono text-[11px] tracking-widest">{selected.size} SÉLECTIONNÉ{selected.size>1?'S':''}</span>
              <button onClick={() => setSelected(new Set())} className="mono text-[10px] tracking-widest text-stone-400 hover:text-white">DÉSÉLECTIONNER</button>
              <div className="flex-1"/>
              <Button size="sm" variant="ghost" onClick={bulkMove} className="text-white hover:bg-stone-800">Déplacer…</Button>
              <Button size="sm" variant="ghost" onClick={() => toast.info('Étiqueter…')} className="text-white hover:bg-stone-800">Étiqueter…</Button>
              <Button size="sm" onClick={bulkDelete} className="bg-wine-700 hover:bg-wine-800">Supprimer</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="w-10 px-5 py-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-wine-700"/></th>
            <th className="w-6"></th>
            <Header k="name">VIN</Header>
            <Header k="region">RÉGION</Header>
            <Header k="vintage">VTG</Header>
            <Header k="loc">LOC</Header>
            <Header k="qty">QTÉ</Header>
            <Header k="peak">PIC</Header>
            <Header k="score">NOTE</Header>
            <th className="px-5"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr
              key={r.id}
              ref={el => { if (el) rowRefs.current[r.id] = el; }}
              draggable
              onDragStart={() => onDragStart(r.id)}
              onDragOver={(e) => onDragOver(e, r.id)}
              onDragEnd={onDragEnd}
              onClick={() => onFocus?.(r.id)}
              className={`border-b border-stone-100 group cursor-pointer ${dragId === r.id ? 'opacity-40' : 'hover:bg-stone-50'} ${selected.has(r.id) ? 'bg-wine-50/40' : ''} ${focusedId === r.id ? 'bg-wine-100/60 ring-1 ring-inset ring-wine-600' : ''}`}
            >
              <td className="px-5 py-2.5"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="accent-wine-700"/></td>
              <td className="text-stone-300 cursor-grab select-none">⋮⋮</td>
              <td className="py-2.5 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${colorDot(r.color)}`}/><span className="serif-it text-stone-900">{r.name}</span></td>
              <td className="text-stone-700">{r.region}</td>
              <td className="mono text-stone-500">{r.vintage}</td>
              <td className="mono text-stone-500">{r.loc}</td>
              <td className="mono text-stone-700">×{r.qty}</td>
              <td><Badge tone={peakTone(r.peak)}>{r.peak < 365 ? `${r.peak} J` : `${Math.round(r.peak/365)} A`}</Badge></td>
              <td className="text-stone-700">{r.score ?? '—'}</td>
              <td className="text-right px-5"><button className="mono text-[10px] tracking-widest text-stone-400 hover:text-wine-700 opacity-0 group-hover:opacity-100">⋯</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-2 border-t border-stone-200 mono text-[10px] text-stone-500 flex justify-between bg-stone-50/40">
        <span>{filtered.length} affichés · drag pour réordonner</span><span>TOTAL : {rows.reduce((a,r)=>a+r.qty,0)} BTL</span>
      </div>
    </Card>
  );
}

window.CaveList = CaveList;
