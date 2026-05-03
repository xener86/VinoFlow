// Cockpit mobile — vaul-flavored bottom sheets.
// One single screen with: hero question (sommelier), urgent wines list, bottom nav.
// Tapping a wine opens a bottom sheet with full detail + actions.

function BottomSheet({ open, onClose, children, title, snapPoints = ['85%'] }) {
  // very simple drag-to-dismiss
  const [dragY, setDragY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  const handlePanEnd = (_, info) => {
    if (info.offset.y > 100 || info.velocity.y > 500) onClose();
    setDragY(0);
    setDragging(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 z-40"
          />
          <motion.div
            key="sheet"
            initial={{ y:'100%' }}
            animate={{ y: dragging ? dragY : 0 }}
            exit={{ y:'100%' }}
            transition={{ type:'spring', damping:30, stiffness:300 }}
            drag="y"
            dragConstraints={{ top:0, bottom:0 }}
            dragElastic={{ top:0, bottom:0.4 }}
            onDragStart={() => setDragging(true)}
            onDrag={(_, info) => setDragY(Math.max(0, info.offset.y))}
            onDragEnd={handlePanEnd}
            className="absolute inset-x-0 bottom-0 bg-cream-50 rounded-t-3xl z-50 shadow-2xl flex flex-col"
            style={{ maxHeight: snapPoints[0] }}
          >
            <div className="pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-stone-300"/>
            </div>
            {title && (
              <div className="px-5 py-2 border-b border-stone-200 flex items-center justify-between">
                <div className="mono text-[10px] tracking-widest text-stone-500">{title}</div>
                <button onClick={onClose} className="mono text-[10px] tracking-widest text-stone-500">FERMER</button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const URGENT = [
  { id:'u1', name:"Pommard 1er Cru Rugiens", vtg:2018, loc:'A2', days:15, peak:'PIC', score:8.5, region:'Bourgogne', color:'rouge' },
  { id:'u2', name:"Sancerre Les Caillottes",  vtg:2020, loc:'B4', days:28, peak:'PIC', score:8.0, region:'Loire',     color:'blanc' },
  { id:'u3', name:"Vouvray Foreau",           vtg:2011, loc:'D6', days:42, peak:'BIENTÔT', score:8.0, region:'Loire',  color:'blanc' },
  { id:'u4', name:"Vacqueyras Le Sang",       vtg:2017, loc:'C5', days:58, peak:'BIENTÔT', score:null, region:'Rhône S.', color:'rouge' },
  { id:'u5', name:"Saint-Joseph Granit",      vtg:2016, loc:'C3', days:75, peak:'PRÉ-PIC', score:8.0, region:'Rhône N.', color:'rouge' },
];

function CockpitMobile() {
  const [tab, setTab] = React.useState('home');
  const [sheet, setSheet] = React.useState(null); // null | wine obj | 'sommelier' | 'add' | 'menu'
  const [drunkIds, setDrunkIds] = React.useState([]);
  const toast = useToast();

  const visible = URGENT.filter(w => !drunkIds.includes(w.id));

  const drink = (w) => {
    setDrunkIds(ids => [...ids, w.id]);
    setSheet(null);
    toast.show({
      title: `« ${w.name} » bu`,
      message: 'Direction le journal',
      action: {
        label: 'ANNULER',
        onClick: () => setDrunkIds(ids => ids.filter(id => id !== w.id)),
      },
      duration: 8000,
    });
  };

  const tones = {
    PIC: 'border-l-wine-700 bg-wine-50/50',
    BIENTÔT: 'border-l-amber-500 bg-amber-50/40',
    'PRÉ-PIC': 'border-l-stone-400 bg-white',
  };

  return (
    <div className="max-w-[400px] mx-auto p-4">
      <div className="bg-stone-900 rounded-[44px] p-2 shadow-2xl">
        <div className="bg-cream-50 rounded-[36px] overflow-hidden relative" style={{ height:'820px' }}>
          {/* Status bar */}
          <div className="flex justify-between items-center px-7 pt-2 pb-1 mono text-[11px] text-stone-900">
            <span>9:41</span>
            <span className="w-20 h-5 bg-stone-900 rounded-full -mt-1"/>
            <span>●●●● 5G ▮</span>
          </div>

          {/* Top bar */}
          <div className="px-5 pt-2 pb-3 flex items-center justify-between">
            <button onClick={() => setSheet({type:'menu'})} className="w-10 h-10 -ml-2 flex items-center justify-center text-stone-700">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <div className="text-center">
              <div className="mono text-[9px] tracking-widest text-stone-500">VINOFLOW</div>
              <div className="serif-it text-stone-900 text-[15px] -mt-0.5">Bonsoir, Léo.</div>
            </div>
            <button className="w-10 h-10 -mr-2 flex items-center justify-center text-stone-700">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </button>
          </div>

          {/* Content per tab */}
          {tab === 'home' && (
            <div className="px-4 pb-24 overflow-y-auto" style={{ height: 'calc(100% - 145px)' }}>
              {/* Hero — sommelier */}
              <button onClick={() => setSheet({type:'sommelier'})} className="w-full text-left">
                <Card className="p-5 bg-gradient-to-br from-wine-50 to-cream-100 border-wine-200">
                  <div className="mono text-[9px] tracking-widest text-wine-800 mb-2">◌ SOMMELIER</div>
                  <div className="serif-it text-2xl text-stone-900 leading-tight">« Mardi soir.<br/>Que cherches-tu, ce soir ? »</div>
                  <div className="mt-4 px-3 h-10 rounded-md bg-white/80 border border-stone-200 flex items-center text-stone-500 text-[13px]">
                    Demande — un plat, un nom…
                  </div>
                </Card>
              </button>

              {/* KPIs row */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  { l:'PIC', v:visible.filter(w=>w.peak==='PIC').length, u:'urgents', tone:'wine' },
                  { l:'BTL', v:290, u:'en cave' },
                  { l:'NOTÉS', v:47, u:'cette année' },
                ].map(k => (
                  <Card key={k.l} className="p-2.5 text-center">
                    <div className="mono text-[8.5px] tracking-widest text-stone-500">{k.l}</div>
                    <div className={`serif text-2xl mt-0.5 ${k.tone==='wine'?'text-wine-700':'text-stone-900'}`}>{k.v}</div>
                    <div className="mono text-[9px] text-stone-500">{k.u}</div>
                  </Card>
                ))}
              </div>

              {/* Urgent list */}
              <div className="mt-5 mb-2 flex items-center justify-between">
                <SectionLabel>◌ Avant qu'ils passent leur pic</SectionLabel>
                <span className="mono text-[10px] text-wine-700">{visible.filter(w=>w.peak==='PIC').length} URGENTS</span>
              </div>

              <div className="space-y-2">
                <AnimatePresence>
                  {visible.map(w => (
                    <motion.button
                      key={w.id}
                      layout
                      initial={{opacity:0, y:8}}
                      animate={{opacity:1, y:0}}
                      exit={{opacity:0, x:-100}}
                      onClick={() => setSheet({type:'wine', wine:w})}
                      className={`w-full text-left rounded-lg border-l-4 ${tones[w.peak]} border-y border-r border-stone-200 p-3 flex items-center gap-3 active:scale-[0.98] transition`}
                    >
                      <div>
                        <div className={`w-2 h-2 rounded-full ${w.color==='rouge'?'bg-wine-700':'bg-amber-300'}`}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="serif-it text-[14.5px] text-stone-900 leading-tight truncate">{w.name}</div>
                        <div className="mono text-[10px] text-stone-500 mt-0.5">{w.vtg} · {w.region} · {w.loc}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`mono text-[10px] tracking-widest ${w.peak==='PIC'?'text-wine-700':'text-stone-600'}`}>
                          {w.peak === 'PIC' ? `${w.days}J` : `~${w.days}J`}
                        </div>
                        <div className="text-stone-300 text-lg leading-none mt-0.5">›</div>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>

              {/* Hall of Fame teaser */}
              <div className="mt-6 mb-2">
                <SectionLabel>◌ Hall of Fame</SectionLabel>
              </div>
              <Card className="p-4">
                <div className="serif-it text-lg text-stone-900">Hermitage La Chapelle</div>
                <div className="mono text-[10px] text-stone-500 mt-0.5">2010 · 9.5/10 · le pic</div>
                <p className="text-[12.5px] text-stone-700 italic mt-2 leading-snug">« Je l'attendais depuis 14 ans. Verdict : majestueux. »</p>
                <div className="mt-3 mono text-[10px] tracking-widest text-stone-500 text-right">VOIR LES 47 →</div>
              </Card>

              <div className="mt-6 mb-2">
                <SectionLabel>◌ Journal</SectionLabel>
              </div>
              <div className="space-y-1.5">
                {[
                  { d:'Hier', n:"Crozes-Hermitage Graillot 2018", s:8.5 },
                  { d:'Sam.', n:"Sancerre Henri Bourgeois 2020", s:7.5 },
                  { d:'Jeu.', n:"Bandol Tempier 2020", s:8.0 },
                ].map((j,i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-stone-200">
                    <div className="mono text-[10px] tracking-widest text-stone-500 w-10">{j.d}</div>
                    <div className="flex-1 serif-it text-[13.5px] text-stone-900 truncate">{j.n}</div>
                    <div className="serif text-stone-900 text-[15px]">{j.s}</div>
                  </div>
                ))}
              </div>
              <div className="h-8"/>
            </div>
          )}

          {tab === 'cave' && (
            <div className="px-4 pb-24 overflow-y-auto" style={{ height: 'calc(100% - 145px)' }}>
              <input placeholder="Rechercher dans la cave…" className="w-full h-11 px-4 rounded-lg border border-stone-300 bg-white text-sm mb-3"/>
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
                {['Tout','En pic','Rouge','Blanc','Bourgogne','Rhône','Loire'].map((f,i) => (
                  <button key={f} className={`shrink-0 mono text-[10px] tracking-widest h-7 px-3 rounded-full ${i===0?'bg-stone-900 text-white':'bg-white border border-stone-300 text-stone-700'}`}>{f}</button>
                ))}
              </div>
              {URGENT.concat(URGENT).map((w, i) => (
                <button key={i} onClick={() => setSheet({type:'wine', wine:w})} className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-white border border-stone-200 mb-2 active:scale-[0.98] transition">
                  <div className={`w-2 h-2 rounded-full ${w.color==='rouge'?'bg-wine-700':'bg-amber-300'}`}/>
                  <div className="flex-1 min-w-0">
                    <div className="serif-it text-[14.5px] text-stone-900 truncate">{w.name}</div>
                    <div className="mono text-[10px] text-stone-500">{w.vtg} · {w.loc}</div>
                  </div>
                  <div className="text-stone-300 text-lg">›</div>
                </button>
              ))}
            </div>
          )}

          {tab === 'insights' && (
            <div className="px-4 pb-24 overflow-y-auto" style={{ height: 'calc(100% - 145px)' }}>
              <Card className="p-4 mb-3">
                <SectionLabel>◌ ACTIONS DU MOIS</SectionLabel>
                <ul className="mt-3 space-y-2.5 text-[13px] text-stone-800">
                  <li className="flex gap-2">
                    <span className="mono text-wine-700">▶</span>
                    <span>Boire <span className="serif-it">Pommard 2018</span> avant le 30 mai.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mono text-wine-700">▶</span>
                    <span>Recevoir samedi ? Le <span className="serif-it">Sancerre</span> est prêt.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mono text-stone-500">○</span>
                    <span>Cave déséquilibrée : 78% Rhône Sud, manque blancs frais.</span>
                  </li>
                </ul>
              </Card>
              <Card className="p-4">
                <SectionLabel>◌ Composition</SectionLabel>
                <div className="mt-3 space-y-2 text-[12px]">
                  {[['Rouge', 76, 'bg-wine-700'],['Blanc', 18, 'bg-amber-300'],['Rosé', 4, 'bg-pink-300'],['Effer.', 2, 'bg-stone-400']].map(([l, p, c]) => (
                    <div key={l}>
                      <div className="flex justify-between"><span>{l}</span><span className="mono">{p}%</span></div>
                      <div className="h-1.5 bg-stone-100 rounded mt-0.5"><div className={`h-full rounded ${c}`} style={{width:`${p}%`}}/></div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {tab === 'journal' && (
            <div className="px-4 pb-24 overflow-y-auto" style={{ height: 'calc(100% - 145px)' }}>
              <SectionLabel>◌ Journal de dégustation</SectionLabel>
              <div className="mt-3 space-y-3">
                {Array.from({length:8}).map((_,i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-baseline justify-between">
                      <div className="serif-it text-[15px] text-stone-900">Crozes-Hermitage Graillot 2018</div>
                      <div className="serif text-2xl text-stone-900">{(8 - i*0.3).toFixed(1)}</div>
                    </div>
                    <div className="mono text-[10px] text-stone-500 mt-0.5">Il y a {i+1} jour{i?'s':''} · à la maison</div>
                    <p className="text-[12.5px] text-stone-700 italic mt-2 leading-snug">« Belle expression du fruit, tanins fondus, légèrement épicé. »</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* FAB */}
          <button onClick={() => setSheet({type:'add'})} className="absolute right-5 bottom-24 w-14 h-14 rounded-full bg-wine-700 text-white text-2xl shadow-lg active:scale-95 transition flex items-center justify-center">+</button>

          {/* Bottom nav */}
          <div className="absolute inset-x-0 bottom-0 bg-white border-t border-stone-200 flex" style={{ height:'72px', paddingBottom:'12px' }}>
            {[
              { id:'home', icon:'⌂', l:'Cockpit' },
              { id:'cave', icon:'▦', l:'Cave' },
              { id:'insights', icon:'◐', l:'Insights' },
              { id:'journal', icon:'✎', l:'Journal' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex flex-col items-center justify-center transition ${tab===t.id?'text-wine-700':'text-stone-500'}`}>
                <div className="text-xl">{t.icon}</div>
                <div className="mono text-[9px] tracking-widest mt-0.5">{t.l}</div>
              </button>
            ))}
          </div>

          {/* Bottom sheets */}
          <BottomSheet open={!!sheet && sheet.type==='wine'} onClose={() => setSheet(null)} title={sheet?.wine ? `${sheet.wine.region} · ${sheet.wine.loc}` : ''}>
            {sheet?.wine && (
              <div className="p-5">
                <div className={`w-3 h-3 rounded-full mb-3 ${sheet.wine.color==='rouge'?'bg-wine-700':'bg-amber-300'}`}/>
                <div className="serif-it text-3xl text-stone-900 leading-tight">{sheet.wine.name}</div>
                <div className="mono text-[11px] tracking-widest text-stone-500 mt-1">{sheet.wine.vtg} · {sheet.wine.region}</div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-lg bg-wine-50 border border-wine-200">
                    <div className="mono text-[9px] tracking-widest text-wine-800">PIC DANS</div>
                    <div className="serif text-2xl text-wine-700 mt-1">{sheet.wine.days}j</div>
                  </div>
                  <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                    <div className="mono text-[9px] tracking-widest text-stone-500">EMPLACEMENT</div>
                    <div className="serif text-xl text-stone-900 mt-1">{sheet.wine.loc}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                    <div className="mono text-[9px] tracking-widest text-stone-500">QUANTITÉ</div>
                    <div className="serif text-2xl text-stone-900 mt-1">3</div>
                  </div>
                </div>
                <div className="mt-4 p-4 rounded-lg bg-stone-50 border border-stone-200">
                  <SectionLabel>◌ Fenêtre de garde</SectionLabel>
                  <div className="relative h-3 mt-3 rounded-full bg-stone-200 overflow-hidden">
                    <div className="absolute inset-y-0 bg-wine-700 rounded-full" style={{ left:'25%', right:'10%' }}/>
                    <div className="absolute top-0 bottom-0 w-0.5 bg-stone-900" style={{ left:'42%' }}/>
                  </div>
                  <div className="flex justify-between mono text-[10px] text-stone-500 mt-1.5">
                    <span>2024</span><span className="text-stone-700">PIC 2026</span><span>2034</span>
                  </div>
                </div>
                {sheet.wine.score && (
                  <div className="mt-3 p-4 rounded-lg bg-stone-50 border border-stone-200">
                    <SectionLabel>◌ Dernière note</SectionLabel>
                    <div className="flex items-baseline gap-3 mt-1">
                      <div className="serif text-3xl text-stone-900">{sheet.wine.score}</div>
                      <div className="mono text-[10px] text-stone-500">/10 · 14 avril</div>
                    </div>
                    <p className="text-[12.5px] text-stone-700 italic mt-1.5">« Pinot noir charpenté, dans son optimum. »</p>
                  </div>
                )}
                <div className="mt-5 space-y-2">
                  <button onClick={() => drink(sheet.wine)} className="w-full h-12 rounded-xl bg-wine-700 text-white font-medium">J'AI BU CETTE BOUTEILLE →</button>
                  <button onClick={() => setSheet(null)} className="w-full h-12 rounded-xl border border-stone-300 bg-white text-stone-800">Noter une dégustation</button>
                  <button className="w-full h-11 mono text-[10px] tracking-widest text-stone-500">DEMANDER AU SOMMELIER ↗</button>
                </div>
              </div>
            )}
          </BottomSheet>

          <BottomSheet open={sheet?.type==='sommelier'} onClose={() => setSheet(null)} title="SOMMELIER">
            <div className="p-5">
              <div className="serif-it text-2xl text-stone-900 leading-tight">Que cherches-tu ?</div>
              <input autoFocus placeholder="agneau, mardi soir…" className="mt-4 w-full h-12 px-4 rounded-lg border border-stone-300 bg-white text-base"/>
              <div className="mt-4">
                <div className="mono text-[9px] tracking-widest text-stone-500 mb-2">SUGGESTIONS</div>
                {[
                  '« Mardi pluvieux · réconfortant »',
                  '« Avant qu\'il ne soit trop tard »',
                  '« Vendredi entre amis »',
                  '« Apéro samedi · ami pas connaisseur »',
                ].map(s => (
                  <button key={s} className="w-full text-left p-3 rounded-lg hover:bg-stone-50 active:bg-stone-100 serif-it text-[14px] text-stone-800 transition">{s}</button>
                ))}
              </div>
              <a href="sommelier-proto.html" className="block mt-4 w-full h-12 rounded-xl bg-wine-700 text-white font-medium leading-[3rem] text-center">Conversation complète →</a>
            </div>
          </BottomSheet>

          <BottomSheet open={sheet?.type==='add'} onClose={() => setSheet(null)} title="AJOUTER">
            <div className="p-5 space-y-3">
              <a href="add-wine-proto.html" className="block w-full p-5 rounded-xl bg-wine-700 text-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-2xl">📷</div>
                  <div>
                    <div className="font-medium">Scanner l'étiquette</div>
                    <div className="text-[12px] text-wine-100 mt-0.5">Le plus rapide</div>
                  </div>
                </div>
              </a>
              <a href="add-wine-proto.html" className="block w-full p-5 rounded-xl border border-stone-300 bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center text-2xl">⌨</div>
                  <div>
                    <div className="font-medium text-stone-900">Saisir au clavier</div>
                    <div className="text-[12px] text-stone-500 mt-0.5">Si tu connais déjà</div>
                  </div>
                </div>
              </a>
              <a href="tasting-proto.html" className="block w-full p-5 rounded-xl border border-stone-300 bg-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center text-2xl">✎</div>
                  <div>
                    <div className="font-medium text-stone-900">Noter une dégustation</div>
                    <div className="text-[12px] text-stone-500 mt-0.5">Express ou détaillé</div>
                  </div>
                </div>
              </a>
            </div>
          </BottomSheet>

          <BottomSheet open={sheet?.type==='menu'} onClose={() => setSheet(null)} title="MENU">
            <div className="p-3">
              {[
                ['Mon profil','◐'],
                ['Wishlist','★'],
                ['Achats & cavistes','€'],
                ['Plan de cave','▦'],
                ['Paramètres','⚙'],
                ['Synchroniser','↻'],
              ].map(([l, i]) => (
                <button key={l} className="w-full text-left flex items-center gap-4 p-3 rounded-lg hover:bg-stone-50 active:bg-stone-100">
                  <span className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">{i}</span>
                  <span className="flex-1 text-[15px] text-stone-900">{l}</span>
                  <span className="text-stone-300 text-lg">›</span>
                </button>
              ))}
            </div>
          </BottomSheet>
        </div>
      </div>
    </div>
  );
}

window.CockpitMobile = CockpitMobile;
