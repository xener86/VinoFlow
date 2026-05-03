// Top-level cockpit composition + ⌘K wiring
function StatusStrip() {
  return (
    <div className="border-b border-stone-200 bg-white px-7 h-9 flex items-center justify-between mono text-[10px] text-stone-500">
      <div className="flex items-center gap-4">
        <span className="text-wine-700 font-medium tracking-widest">VINOFLOW</span>
        <span className="flex items-center gap-1.5"><PulseDot/>LOCAL</span>
      </div>
      <div className="text-stone-500">LUN 04 MAI 2026 · 19:42</div>
      <div className="flex items-center gap-3"><span className="text-emerald-700">SYNC ✓</span><span>v1.0.0</span></div>
    </div>
  );
}

function Sidebar() {
  const navTop = [
    { icon:<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>, label:'Tableau de bord', active:true, hint:'⌘1' },
    { icon:<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 5h18M3 12h18M3 19h18"/></svg>, label:'Cave', count:290 },
    { icon:<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2 L22 12 L12 22 L2 12 Z"/></svg>, label:'Sommelier' },
    { icon:<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 17l6-6 4 4 8-8"/></svg>, label:'Insights', accent:4 },
  ];
  return (
    <aside className="w-[220px] shrink-0 border-r border-stone-200 bg-white py-5 px-3 flex flex-col">
      <div className="px-2 mb-6">
        <div className="serif-it text-2xl text-stone-900 leading-none">VinoFlow</div>
        <div className="mono text-[10px] text-stone-500 mt-1 tracking-widest">CELLAR.OS</div>
      </div>
      <SectionLabel className="px-2 mb-2">Navigation</SectionLabel>
      <nav className="flex flex-col gap-1 text-sm">
        {navTop.map(n => (
          <a key={n.label} className={`flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer ${n.active ? 'bg-stone-100 text-stone-900 ring-1 ring-stone-200' : 'text-stone-600 hover:bg-stone-100'}`}>
            {n.icon}{n.label}
            {n.hint && <span className="ml-auto mono text-[10px] text-stone-500">{n.hint}</span>}
            {n.count != null && <span className="ml-auto mono text-[10px] text-stone-500">{n.count}</span>}
            {n.accent != null && <span className="ml-auto mono text-[10px] text-wine-700 font-medium">{n.accent}</span>}
          </a>
        ))}
      </nav>
      <SectionLabel className="px-2 mb-2 mt-6">Raccourcis</SectionLabel>
      <nav className="flex flex-col gap-1 text-sm">
        <a className="flex items-center gap-2.5 px-2 py-1 text-stone-600 hover:text-stone-900 cursor-pointer">★ Wishlist<span className="ml-auto mono text-[10px] text-stone-500">23</span></a>
        <a className="flex items-center gap-2.5 px-2 py-1 text-stone-600 hover:text-stone-900 cursor-pointer">✎ Journal</a>
        <a className="flex items-center gap-2.5 px-2 py-1 text-stone-600 hover:text-stone-900 cursor-pointer">≡ Régions</a>
        <a className="flex items-center gap-2.5 px-2 py-1 text-stone-600 hover:text-stone-900 cursor-pointer">◎ Hall of Fame</a>
      </nav>
      <div className="mt-auto px-2 pt-5 border-t border-stone-200">
        <div className="serif-it text-stone-700 text-sm leading-snug">« Le vin est la plus saine et la plus hygiénique des boissons. »</div>
        <div className="mono text-[10px] text-stone-400 mt-2 tracking-widest">— L. PASTEUR</div>
      </div>
    </aside>
  );
}

function Cockpit() {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const toast = useToast();

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handlePaletteAction = (item) => {
    if (item.kind === 'action') {
      toast.info(`${item.label} → bientôt câblé`);
    } else {
      toast.info(`Ouverture · ${item.label}`);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-cream-50" data-screen-label="01 Cockpit">
      <StatusStrip/>
      <div className="flex flex-1 min-h-0">
        <Sidebar/>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-7 py-5 border-b border-stone-200 bg-white flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-2xl text-stone-900 font-medium leading-tight">Tableau de bord</h1>
              <div className="text-[12px] text-stone-500 mt-0.5">Bonsoir {window.SEED.user.name} — il est 19:42, mardi soir.</div>
            </div>
            <Button variant="outline" onClick={() => setPaletteOpen(true)}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              Cherche
              <Kbd>⌘K</Kbd>
            </Button>
            <Button onClick={() => toast.info('Ajouter un vin · bientôt câblé')}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Ajouter
            </Button>
          </div>
          <div className="p-5 grid grid-cols-12 gap-4">
            <SommelierHero/>
            <section className="col-span-12 grid grid-cols-4 gap-4">
              <KpiBottles/><KpiStock/><KpiTastings/><KpiRegions/>
            </section>
            <UrgentTable/>
            <Wishlist/>
            <HallOfFame/>
            <Journal/>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={handlePaletteAction}/>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <Cockpit/>
    </ToastProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
