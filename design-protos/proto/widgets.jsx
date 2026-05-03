// KPI cards + Wishlist + Hall of Fame + Journal — secondary surfaces
function KpiBottles() {
  const c = window.SEED.cellar;
  return (
    <Card className="p-4">
      <SectionLabel>Bouteilles</SectionLabel>
      <div className="text-3xl font-medium text-stone-900 mt-1.5">{c.bottles}</div>
      <div className="text-[11px] text-stone-500 mt-0.5">+{c.monthIn} entrées · −{c.monthOut} sorties</div>
      <svg viewBox="0 0 100 24" className="w-full h-5 mt-2">
        <polyline fill="none" stroke="#16a34a" strokeWidth="1.4" points="0,8 14,6 28,9 42,5 56,8 70,6 84,7 100,5"/>
        <polyline fill="none" stroke="#7f1d1d" strokeWidth="1.4" strokeDasharray="2 2" points="0,18 14,17 28,16 42,18 56,15 70,17 84,16 100,18"/>
      </svg>
    </Card>
  );
}
function KpiStock() {
  const c = window.SEED.cellar;
  return (
    <Card className="p-4">
      <SectionLabel>Mois de stock</SectionLabel>
      <div className="text-3xl font-medium text-stone-900 mt-1.5">{Math.floor(c.monthsOfStock)}<span className="text-base text-stone-500">.{String(c.monthsOfStock).split('.')[1]}</span></div>
      <div className="text-[11px] text-stone-500 mt-0.5">rythme actuel</div>
      <div className="mt-2 h-1.5 rounded-full bg-stone-200 overflow-hidden">
        <motion.div initial={{width:0}} animate={{width:'71%'}} transition={{duration:0.8, delay:0.2}} className="h-full bg-wine-700 rounded-full"/>
      </div>
    </Card>
  );
}
function KpiTastings() {
  return (
    <Card className="p-4">
      <SectionLabel>Dégust. '26</SectionLabel>
      <div className="text-3xl font-medium text-stone-900 mt-1.5">38</div>
      <div className="text-[11px] text-stone-500 mt-0.5">2.1× vs '25</div>
      <div className="flex gap-0.5 mt-2 items-end h-6">
        {[30,50,40,65,55,80,90].map((h, i) => (
          <motion.div key={i} initial={{height:0}} animate={{height:`${h}%`}} transition={{duration:0.4, delay:i*0.05}}
            className={`flex-1 rounded-sm ${i>=5 ? 'bg-wine-700' : 'bg-stone-300'}`}/>
        ))}
      </div>
    </Card>
  );
}
function KpiRegions() {
  return (
    <Card className="p-4">
      <SectionLabel>Régions</SectionLabel>
      <div className="text-3xl font-medium text-stone-900 mt-1.5">12<span className="text-base text-stone-500">/27</span></div>
      <div className="text-[11px] text-stone-500 mt-0.5">+3 cette année</div>
      <div className="flex flex-wrap gap-0.5 mt-2">
        {Array.from({length:12}).map((_,i) => {
          const fill = i < 4 ? 'bg-wine-700' : i < 7 ? 'bg-stone-400' : 'bg-stone-200';
          return <span key={i} className={`w-3 h-3 rounded-sm ${fill}`}/>;
        })}
      </div>
    </Card>
  );
}

function Wishlist() {
  const items = window.SEED.wishlist;
  return (
    <Card className="col-span-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>★ Wishlist · 23 vins</SectionLabel>
          <SectionTitle>À chercher</SectionTitle>
        </div>
        <Button variant="ghost" size="sm" className="mono text-[10px] tracking-widest">+ AJOUTER</Button>
      </div>
      <div className="mt-3 divide-y divide-stone-100 text-sm">
        {items.map(it => (
          <div key={it.id} className="flex items-center gap-2 py-2.5">
            <span className="serif-it text-stone-900 flex-1 truncate">{it.name} <span className="mono text-[10px] text-stone-500">'{String(it.vintage).slice(2)}</span></span>
            {it.status === 'dispo' && <Badge tone="success">● DISPO</Badge>}
            {it.status === 'rare' && <Badge tone="rare">● RARE</Badge>}
            {it.status === 'none' && <span className="mono text-[10px] text-stone-400">—</span>}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-3 w-full">Voir toute la wishlist</Button>
    </Card>
  );
}

function HallOfFame() {
  const items = window.SEED.hallOfFame;
  return (
    <Card className="col-span-8 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <SectionLabel>◎ Hall of Fame · Top 5</SectionLabel>
          <SectionTitle>Tes coups de cœur</SectionTitle>
        </div>
        <a className="mono text-[10px] text-stone-500 hover:text-wine-700 tracking-widest cursor-pointer">TOUT VOIR →</a>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {items.map((it, i) => (
          <div key={it.rank} className={`flex items-baseline gap-3 ${i < 4 ? 'pb-3 border-b border-stone-100' : ''}`}>
            <span className={`serif text-3xl leading-none w-7 ${i < 3 ? 'text-wine-700' : 'text-stone-400'}`}>{it.rank}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-stone-900 truncate">{it.name} <span className="mono text-[10px] text-stone-500">'{it.vintage}</span></div>
              <div className="text-[11px] text-stone-500 mt-0.5">{it.note}</div>
            </div>
            <div className={`text-base font-medium ${i < 3 ? 'text-wine-700' : 'text-stone-700'}`}>{it.score}</div>
          </div>
        ))}
        <div></div>
      </div>
    </Card>
  );
}

function Journal() {
  const items = window.SEED.journal;
  return (
    <Card className="col-span-12 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <SectionLabel>✎ Journal · activité récente</SectionLabel>
          <SectionTitle>Dernières entrées</SectionTitle>
        </div>
        <a className="mono text-[10px] text-stone-500 hover:text-wine-700 tracking-widest cursor-pointer">TOUT LE JOURNAL →</a>
      </div>
      <div className="mono text-[12px] space-y-1.5">
        {items.map((e, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-stone-500 w-20">{e.ts}</span>
            <span className={`w-14 ${e.accent ? 'text-wine-700 font-medium' : 'text-stone-600'}`}>[{e.type}]</span>
            <span className="text-stone-800">{e.text}</span>
            <span className="text-stone-500 ml-auto">{e.ago}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

Object.assign(window, { KpiBottles, KpiStock, KpiTastings, KpiRegions, Wishlist, HallOfFame, Journal });
