// Insights — hi-fi temporal view of the cellar.
// Three lenses, switchable: Garde (peak windows), Inventaire (composition), Achats (spend curve).

const INSIGHTS_WINES = [
  { id:'w1', name:"Pommard 1er Cru Rugiens",   region:'Bourgogne',  vintage:2018, color:'rouge', loc:'A2', start:2024, peak:2026, end:2034, qty:3, score:8.5 },
  { id:'w2', name:"Sancerre Les Caillottes",   region:'Loire',      vintage:2020, color:'blanc', loc:'B4', start:2022, peak:2025, end:2028, qty:6, score:8.0 },
  { id:'w3', name:"Vouvray Foreau",            region:'Loire',      vintage:2011, color:'blanc', loc:'D6', start:2018, peak:2025, end:2040, qty:2, score:8.0 },
  { id:'w4', name:"Vacqueyras Le Sang",        region:'Rhône Sud',  vintage:2017, color:'rouge', loc:'C5', start:2022, peak:2026, end:2029, qty:6, score:null },
  { id:'w5', name:"Côte-Rôtie La Landonne",    region:'Rhône Nord', vintage:2014, color:'rouge', loc:'C1', start:2024, peak:2028, end:2040, qty:1, score:null },
  { id:'w6', name:"Chablis Vaudésir",          region:'Bourgogne',  vintage:2019, color:'blanc', loc:'B7', start:2022, peak:2026, end:2030, qty:6, score:7.5 },
  { id:'w7', name:"Saint-Joseph Granit",       region:'Rhône Nord', vintage:2016, color:'rouge', loc:'C3', start:2020, peak:2026, end:2032, qty:3, score:8.0 },
  { id:'w8', name:"Hermitage La Chapelle",     region:'Rhône Nord', vintage:2010, color:'rouge', loc:'D1', start:2020, peak:2030, end:2050, qty:2, score:9.5 },
  { id:'w9', name:"Bandol Tempier",            region:'Provence',   vintage:2016, color:'rouge', loc:'D3', start:2022, peak:2028, end:2036, qty:6, score:8.0 },
  { id:'w10',name:"Crozes-Hermitage Graillot", region:'Rhône Nord', vintage:2018, color:'rouge', loc:'D2', start:2022, peak:2025, end:2028, qty:4, score:8.5 },
  { id:'w11',name:"Chambolle-Musigny",         region:'Bourgogne',  vintage:2015, color:'rouge', loc:'A4', start:2022, peak:2027, end:2035, qty:2, score:8.5 },
  { id:'w12',name:"Pavillon Blanc Margaux",    region:'Bordeaux',   vintage:2017, color:'blanc', loc:'B1', start:2025, peak:2030, end:2040, qty:1, score:9.0 },
];

const NOW_YEAR = 2025;
const HORIZON_START = 2024;
const HORIZON_END   = 2040;

// ============== TIMELINE VIEW ==============
function GardeTimeline() {
  const [hover, setHover] = React.useState(null);
  const [filterColor, setFilterColor] = React.useState('all');
  const [filterRegion, setFilterRegion] = React.useState('all');
  const [sortMode, setSortMode] = React.useState('peak'); // peak | start | name

  const regions = React.useMemo(() => ['all', ...new Set(INSIGHTS_WINES.map(w => w.region))], []);

  const filtered = React.useMemo(() => {
    let arr = [...INSIGHTS_WINES];
    if (filterColor !== 'all') arr = arr.filter(w => w.color === filterColor);
    if (filterRegion !== 'all') arr = arr.filter(w => w.region === filterRegion);
    if (sortMode === 'peak') arr.sort((a,b) => a.peak - b.peak);
    if (sortMode === 'start') arr.sort((a,b) => a.start - b.start);
    if (sortMode === 'name') arr.sort((a,b) => a.name.localeCompare(b.name));
    return arr;
  }, [filterColor, filterRegion, sortMode]);

  const range = HORIZON_END - HORIZON_START;
  const yearToPct = (y) => ((y - HORIZON_START) / range) * 100;
  const nowPct = yearToPct(NOW_YEAR);

  const yearLabels = [];
  for (let y = HORIZON_START; y <= HORIZON_END; y += 2) yearLabels.push(y);

  const urgentCount = INSIGHTS_WINES.filter(w => w.peak - NOW_YEAR <= 1 && w.peak - NOW_YEAR >= -1).length;

  return (
    <div className="space-y-5">
      {/* KPIs strip */}
      <div className="grid grid-cols-4 gap-3">
        <KPI label="EN PIC ACTUEL" value={urgentCount} unit="vins" tone="warning"/>
        <KPI label="DANS LA FENÊTRE" value={INSIGHTS_WINES.filter(w => NOW_YEAR >= w.start && NOW_YEAR <= w.end).length} unit="vins"/>
        <KPI label="ENCORE TROP JEUNES" value={INSIGHTS_WINES.filter(w => NOW_YEAR < w.start).length} unit="vins"/>
        <KPI label="HORIZON LE + LOIN" value="2050" unit="hermitage"/>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <FilterPills label="COULEUR" value={filterColor} onChange={setFilterColor} options={[['all','Toutes'],['rouge','Rouge'],['blanc','Blanc']]}/>
        <div className="flex items-center gap-1.5">
          <span className="mono text-[10px] tracking-widest text-stone-500">RÉGION</span>
          <select value={filterRegion} onChange={(e)=>setFilterRegion(e.target.value)} className="h-7 rounded border border-stone-300 bg-white text-[12px] px-2">
            {regions.map(r => <option key={r} value={r}>{r==='all' ? 'Toutes régions' : r}</option>)}
          </select>
        </div>
        <FilterPills label="TRI" value={sortMode} onChange={setSortMode} options={[['peak','Pic'],['start','Entrée'],['name','Nom']]}/>
        <div className="flex-1"/>
        <span className="mono text-[10px] tracking-widest text-stone-500">{filtered.length} VINS · {filtered.reduce((a,w)=>a+w.qty,0)} BTL</span>
      </div>

      {/* Timeline */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/40 flex items-center justify-between">
          <SectionLabel>◌ FENÊTRES DE GARDE · {HORIZON_START}–{HORIZON_END}</SectionLabel>
          <span className="mono text-[10px] tracking-widest text-stone-500">▌ ZONE CLAIRE = MONTÉE · ▌ FONCÉE = PIC · ▌ DÉLAVÉ = DESCENTE</span>
        </div>

        {/* Year ruler */}
        <div className="relative px-5 pt-3 pb-2 border-b border-stone-200 bg-white">
          <div className="relative h-5 ml-44">
            {yearLabels.map(y => (
              <span key={y} className="absolute mono text-[10px] text-stone-500" style={{ left:`${yearToPct(y)}%`, transform:'translateX(-50%)' }}>
                {y}
              </span>
            ))}
            {/* NOW marker */}
            <div className="absolute top-5 w-0.5 h-2 bg-wine-700" style={{ left:`${nowPct}%` }}/>
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {/* Vertical NOW line spanning all rows */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-wine-700/40 z-10 pointer-events-none" style={{ left:`calc(176px + ${nowPct}% * (100% - 176px) / 100% + 20px)` }}/>

          <AnimatePresence>
            {filtered.map((w, i) => {
              const startPct = yearToPct(w.start);
              const peakPct = yearToPct(w.peak);
              const endPct = yearToPct(w.end);
              const inPeak = NOW_YEAR >= w.peak - 1 && NOW_YEAR <= w.peak + 1;
              const isYoung = NOW_YEAR < w.start;
              const isOld = NOW_YEAR > w.end;
              const isHovered = hover === w.id;

              const colorBg = w.color === 'rouge' ? 'bg-wine-700' : 'bg-amber-300';
              const colorBgLight = w.color === 'rouge' ? 'bg-wine-200/70' : 'bg-amber-100';

              return (
                <motion.div
                  key={w.id}
                  layout
                  initial={{ opacity:0, x:-8 }}
                  animate={{ opacity:1, x:0 }}
                  transition={{ delay: i*0.02 }}
                  onMouseEnter={() => setHover(w.id)}
                  onMouseLeave={() => setHover(null)}
                  className={`px-5 py-3 border-b border-stone-100 last:border-b-0 grid items-center cursor-pointer transition ${isHovered ? 'bg-stone-50' : ''}`}
                  style={{ gridTemplateColumns: '176px 1fr' }}
                >
                  <div className="pr-3">
                    <div className="serif-it text-[13.5px] text-stone-900 leading-tight truncate" title={w.name}>{w.name}</div>
                    <div className="mono text-[10px] text-stone-500 mt-0.5 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${colorBg}`}/>
                      {w.vintage} · {w.region} · ×{w.qty}
                      {inPeak && <Badge tone="urgent" className="ml-1">PIC</Badge>}
                      {isYoung && <Badge tone="neutral" className="ml-1">JEUNE</Badge>}
                      {isOld && <Badge tone="warning" className="ml-1">DÉCLIN</Badge>}
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="relative h-6 ml-3">
                    {/* Rise (start → peak) */}
                    <div
                      className={`absolute inset-y-1 rounded-l ${colorBgLight}`}
                      style={{ left:`${startPct}%`, width:`${peakPct - startPct}%` }}
                      title={`Montée ${w.start} → ${w.peak}`}
                    />
                    {/* Peak zone (1 yr each side) */}
                    <div
                      className={`absolute inset-y-0 rounded ${colorBg} shadow-sm`}
                      style={{ left:`${yearToPct(w.peak - 1)}%`, width:`${yearToPct(w.peak + 1) - yearToPct(w.peak - 1)}%` }}
                      title={`Pic ${w.peak}`}
                    />
                    {/* Fall (peak → end) */}
                    <div
                      className={`absolute inset-y-1 rounded-r ${colorBgLight} opacity-60`}
                      style={{ left:`${yearToPct(w.peak + 1)}%`, width:`${endPct - yearToPct(w.peak + 1)}%` }}
                      title={`Descente ${w.peak} → ${w.end}`}
                    />
                    {/* Hover tooltip with peak number */}
                    {isHovered && (
                      <motion.div
                        initial={{ opacity:0, y:4 }}
                        animate={{ opacity:1, y:0 }}
                        className="absolute -top-7 z-20 bg-stone-900 text-white text-[11px] px-2 py-1 rounded mono whitespace-nowrap"
                        style={{ left:`${peakPct}%`, transform:'translateX(-50%)' }}
                      >
                        Pic {w.peak} · fenêtre {w.start}–{w.end}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="px-5 py-3 border-t border-stone-200 bg-stone-50/40 mono text-[10px] tracking-widest text-stone-500">
          Ligne verticale = aujourd'hui ({NOW_YEAR}) · ligne pleine = pic optimal ±1 an
        </div>
      </Card>
    </div>
  );
}

// ============== INVENTORY COMPOSITION ==============
function InventoryView() {
  const total = INSIGHTS_WINES.reduce((a,w) => a+w.qty, 0);
  const byColor = {
    rouge: INSIGHTS_WINES.filter(w => w.color==='rouge').reduce((a,w)=>a+w.qty, 0),
    blanc: INSIGHTS_WINES.filter(w => w.color==='blanc').reduce((a,w)=>a+w.qty, 0),
  };
  const byRegion = {};
  INSIGHTS_WINES.forEach(w => { byRegion[w.region] = (byRegion[w.region]||0) + w.qty; });
  const regionEntries = Object.entries(byRegion).sort((a,b) => b[1]-a[1]);

  // Vintage distribution
  const byVintage = {};
  INSIGHTS_WINES.forEach(w => { byVintage[w.vintage] = (byVintage[w.vintage]||0) + w.qty; });
  const vintageEntries = Object.entries(byVintage).map(([y,c])=>({y:parseInt(y),c})).sort((a,b)=>a.y-b.y);
  const vintageMax = Math.max(...vintageEntries.map(v => v.c));

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-4 p-5">
        <SectionLabel>◌ COULEUR</SectionLabel>
        <div className="mt-4 space-y-3">
          {Object.entries(byColor).map(([c, n]) => {
            const pct = (n / total) * 100;
            return (
              <div key={c}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="capitalize">{c}</span>
                  <span className="mono text-stone-500">{n} btl · {pct.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-stone-100 rounded">
                  <div className={`h-full rounded ${c==='rouge'?'bg-wine-700':'bg-amber-300'}`} style={{ width:`${pct}%` }}/>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="col-span-4 p-5">
        <SectionLabel>◌ RÉGIONS</SectionLabel>
        <div className="mt-4 space-y-2">
          {regionEntries.map(([r, n]) => {
            const pct = (n/total)*100;
            return (
              <div key={r}>
                <div className="flex items-center justify-between text-[12px]">
                  <span>{r}</span>
                  <span className="mono text-stone-500">{n}</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded">
                  <div className="h-full rounded bg-stone-700" style={{ width:`${pct}%` }}/>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="col-span-4 p-5">
        <SectionLabel>◌ MILLÉSIMES</SectionLabel>
        <div className="mt-4 flex items-end gap-1 h-32">
          {vintageEntries.map(({y, c}) => (
            <div key={y} className="flex-1 flex flex-col items-center group">
              <div className="text-[10px] text-stone-700 mono opacity-0 group-hover:opacity-100">{c}</div>
              <div className="w-full bg-wine-700 rounded-t group-hover:bg-wine-800 transition" style={{ height:`${(c/vintageMax)*100}%`, minHeight:'4px' }}/>
              <div className="mono text-[9px] text-stone-500 mt-1">{String(y).slice(2)}</div>
            </div>
          ))}
        </div>
        <div className="mono text-[10px] tracking-widest text-stone-500 mt-2 text-center">
          de {vintageEntries[0]?.y} à {vintageEntries[vintageEntries.length-1]?.y}
        </div>
      </Card>

      <Card className="col-span-12 p-5">
        <SectionLabel>◌ COUVERTURE — RÉGIONS PRÉSENTES vs MANQUANTES</SectionLabel>
        <div className="mt-4 grid grid-cols-9 gap-2">
          {[
            'Bordeaux','Bourgogne','Loire','Rhône Nord','Rhône Sud','Provence','Languedoc','Alsace','Champagne',
            'Jura','Savoie','Sud-Ouest','Beaujolais','Roussillon','Corse','Allemagne','Italie','Espagne',
          ].map(r => {
            const present = byRegion[r] || 0;
            return (
              <div key={r} className={`p-2 rounded text-center ${present ? 'bg-wine-700 text-white' : 'bg-stone-100 text-stone-400'}`}>
                <div className="text-[11px] truncate">{r}</div>
                <div className="mono text-[9px] mt-0.5">{present || '—'}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 mono text-[10px] tracking-widest text-stone-500">
          {regionEntries.length} / 18 régions explorées · {18 - regionEntries.length} terra incognita
        </div>
      </Card>
    </div>
  );
}

// ============== ACHATS / SPEND ==============
function AchatsView() {
  const months = [
    { m:'jan', in:8, spent:380 },
    { m:'fév', in:4, spent:140 },
    { m:'mar', in:12, spent:620 },
    { m:'avr', in:6, spent:220 },
    { m:'mai', in:14, spent:780 },
    { m:'jun', in:9, spent:390 },
    { m:'jul', in:5, spent:160 },
    { m:'aoû', in:3, spent:95 },
    { m:'sep', in:18, spent:1100 },
    { m:'oct', in:11, spent:540 },
    { m:'nov', in:7, spent:300 },
    { m:'déc', in:13, spent:670 },
  ];
  const totalIn = months.reduce((a,m)=>a+m.in, 0);
  const totalSpent = months.reduce((a,m)=>a+m.spent, 0);
  const avgPrice = Math.round(totalSpent / totalIn);
  const maxSpent = Math.max(...months.map(m=>m.spent));

  return (
    <div className="grid grid-cols-12 gap-4">
      <KPI className="col-span-3" label="ACHATS 12 MOIS" value={totalIn} unit="bouteilles"/>
      <KPI className="col-span-3" label="DÉPENSE TOTALE" value={`${totalSpent}€`}/>
      <KPI className="col-span-3" label="PRIX MOYEN" value={`${avgPrice}€`} unit="par btl"/>
      <KPI className="col-span-3" label="ROTATION" value="+6%" unit="vs 2024" tone="success"/>

      <Card className="col-span-12 p-5">
        <SectionLabel>◌ DÉPENSE MENSUELLE</SectionLabel>
        <div className="mt-5 flex items-end gap-2 h-48">
          {months.map(m => (
            <div key={m.m} className="flex-1 flex flex-col items-center group">
              <div className="text-[11px] mono text-stone-700 mb-1 opacity-0 group-hover:opacity-100">{m.spent}€</div>
              <div className="w-full bg-stone-200 rounded-t flex items-end overflow-hidden" style={{ height:'80%' }}>
                <div className="w-full bg-gradient-to-t from-wine-800 to-wine-500 rounded-t" style={{ height:`${(m.spent/maxSpent)*100}%` }}/>
              </div>
              <div className="mono text-[10px] text-stone-500 mt-1.5 capitalize">{m.m}</div>
              <div className="mono text-[9px] text-stone-400">{m.in} btl</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="col-span-6 p-5">
        <SectionLabel>◌ FLUX MENSUEL</SectionLabel>
        <SectionTitle>Entrée vs sortie</SectionTitle>
        <div className="mt-5 space-y-3">
          {[
            { label:'Entrées (achats)', value:108, color:'bg-emerald-600' },
            { label:'Sorties (consom.)', value:67, color:'bg-wine-700' },
            { label:'Net', value:41, color:'bg-stone-900' },
          ].map(r => (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span>{r.label}</span><span className="mono">{r.value} btl/an</span>
              </div>
              <div className="h-2 bg-stone-100 rounded">
                <div className={`h-full rounded ${r.color}`} style={{ width:`${(r.value/120)*100}%` }}/>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-stone-600 mt-4 italic">À ce rythme, ta cave gagne ~41 btl/an. Capacité restante : ~3 ans avant remplissage.</p>
      </Card>

      <Card className="col-span-6 p-5">
        <SectionLabel>◌ TOP CAVISTES</SectionLabel>
        <div className="mt-4 space-y-2">
          {[
            { name:'Caviste de quartier', n:42, total:1840 },
            { name:'Le Repaire de Bacchus', n:28, total:1320 },
            { name:'Domaine direct (Foreau)', n:12, total:580 },
            { name:'Salons de vins', n:18, total:790 },
            { name:'Autres', n:8, total:235 },
          ].map(c => (
            <div key={c.name} className="flex items-center justify-between py-1.5 border-b border-stone-100 last:border-0">
              <div>
                <div className="text-[13px] text-stone-900">{c.name}</div>
                <div className="mono text-[10px] text-stone-500">{c.n} btl</div>
              </div>
              <div className="serif text-stone-900">{c.total}€</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============== Helpers ==============
function KPI({ label, value, unit, tone, className='' }) {
  const valueColor = tone === 'warning' ? 'text-wine-700' : tone === 'success' ? 'text-emerald-700' : 'text-stone-900';
  return (
    <Card className={`p-4 ${className}`}>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-baseline gap-2 mt-2">
        <div className={`serif text-4xl ${valueColor}`}>{value}</div>
        {unit && <div className="mono text-[10px] tracking-widest text-stone-500">{unit}</div>}
      </div>
    </Card>
  );
}

function FilterPills({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="mono text-[10px] tracking-widest text-stone-500">{label}</span>
      <div className="flex bg-stone-100 p-0.5 rounded">
        {options.map(([val, lbl]) => (
          <button key={val} onClick={() => onChange(val)} className={`px-2 h-6 rounded text-[11.5px] ${value===val?'bg-white shadow-sm text-stone-900':'text-stone-600'}`}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============== Main ==============
function InsightsHiFi() {
  const [lens, setLens] = React.useState('garde');
  const lenses = [
    { id:'garde',     label:'Garde',     desc:'Fenêtres de pic et urgences temporelles' },
    { id:'inventory', label:'Inventaire',desc:'Composition par couleur, région, millésime' },
    { id:'achats',    label:'Achats',    desc:'Dépense, rotation, flux entrée/sortie' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto p-5 space-y-5">
      {/* Lens picker */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex gap-1 bg-white border border-stone-200 rounded-md p-1">
          {lenses.map(l => (
            <button key={l.id} onClick={() => setLens(l.id)} className={`px-4 h-9 rounded text-sm transition ${lens===l.id ? 'bg-wine-700 text-white' : 'text-stone-700 hover:bg-stone-50'}`}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-stone-500 italic max-w-md text-right">
          {lenses.find(l => l.id===lens).desc}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={lens} initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-8}} transition={{duration:0.2}}>
          {lens === 'garde' && <GardeTimeline/>}
          {lens === 'inventory' && <InventoryView/>}
          {lens === 'achats' && <AchatsView/>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

window.InsightsHiFi = InsightsHiFi;
