// Add wine flow — two surfaces in one page:
//   DESKTOP : free text → AI parses & enriches (region, peak, market price, score)
//   MOBILE  : OCR-style photo → label scan → confirm
// Toggle between surfaces via top device picker.

// Mock AI knowledge base (would be a real backend call IRL)
const KB = [
  { match:/pommard|rugiens/i,        region:'Bourgogne',   subregion:'Côte de Beaune', appellation:'Pommard 1er Cru', cepage:'Pinot Noir',   color:'rouge', priceLow:75, priceHigh:120, peakRange:[2025, 2032], confidence:0.94 },
  { match:/sancerre/i,                region:'Loire',       subregion:'Centre',         appellation:'Sancerre',        cepage:'Sauvignon Blanc', color:'blanc', priceLow:18, priceHigh:32,  peakRange:[2024, 2027], confidence:0.96 },
  { match:/c[ôo]te[- ]?r[ôo]tie/i,    region:'Rhône Nord',  subregion:'',               appellation:'Côte-Rôtie',      cepage:'Syrah',         color:'rouge', priceLow:90, priceHigh:180, peakRange:[2024, 2034], confidence:0.92 },
  { match:/chablis/i,                 region:'Bourgogne',   subregion:'Auxerrois',      appellation:'Chablis',         cepage:'Chardonnay',    color:'blanc', priceLow:25, priceHigh:65,  peakRange:[2023, 2028], confidence:0.93 },
  { match:/vouvray|foreau|huet/i,     region:'Loire',       subregion:'Touraine',       appellation:'Vouvray',         cepage:'Chenin Blanc',  color:'blanc', priceLow:30, priceHigh:80,  peakRange:[2024, 2040], confidence:0.88 },
  { match:/bandol|tempier/i,          region:'Provence',    subregion:'',               appellation:'Bandol',          cepage:'Mourvèdre',     color:'rouge', priceLow:30, priceHigh:60,  peakRange:[2024, 2032], confidence:0.91 },
  { match:/hermitage|chave/i,         region:'Rhône Nord',  subregion:'',               appellation:'Hermitage',       cepage:'Syrah',         color:'rouge', priceLow:120, priceHigh:400, peakRange:[2025, 2045], confidence:0.95 },
  { match:/crozes|graillot/i,         region:'Rhône Nord',  subregion:'',               appellation:'Crozes-Hermitage',cepage:'Syrah',         color:'rouge', priceLow:18, priceHigh:35,  peakRange:[2023, 2028], confidence:0.93 },
  { match:/chambolle|musigny/i,       region:'Bourgogne',   subregion:'Côte de Nuits',  appellation:'Chambolle-Musigny',cepage:'Pinot Noir',   color:'rouge', priceLow:60, priceHigh:200, peakRange:[2025, 2035], confidence:0.92 },
];

function aiEnrich(text) {
  const t = text.trim();
  if (!t) return null;
  const yrMatch = t.match(/(19|20)\d{2}/);
  const vintage = yrMatch ? parseInt(yrMatch[0],10) : null;
  const kb = KB.find(e => e.match.test(t));
  const nameGuess = t.replace(/(19|20)\d{2}/, '').replace(/\s+/g,' ').trim();
  const cleanName = nameGuess.charAt(0).toUpperCase() + nameGuess.slice(1);
  if (!kb) {
    return {
      name: cleanName,
      vintage,
      region: '?',
      appellation: '?',
      cepage: '?',
      color: 'rouge',
      priceEstimate: null,
      peakWindow: null,
      confidence: 0.3,
      unknown: true,
    };
  }
  return {
    name: cleanName,
    vintage,
    region: kb.region,
    subregion: kb.subregion,
    appellation: kb.appellation,
    cepage: kb.cepage,
    color: kb.color,
    priceLow: kb.priceLow,
    priceHigh: kb.priceHigh,
    peakWindow: vintage ? [Math.max(vintage+5, kb.peakRange[0]), Math.max(vintage+15, kb.peakRange[1])] : kb.peakRange,
    confidence: kb.confidence,
  };
}

// ============== DESKTOP : type + AI complete ==============
function AddWineDesktop() {
  const [text, setText] = React.useState('');
  const [enriched, setEnriched] = React.useState(null);
  const [thinking, setThinking] = React.useState(false);
  const [qty, setQty] = React.useState(1);
  const [loc, setLoc] = React.useState('LIMBO');
  const [price, setPrice] = React.useState('');
  const [overrides, setOverrides] = React.useState({});
  const toast = useToast();

  // Debounced auto-enrich
  React.useEffect(() => {
    if (!text.trim()) { setEnriched(null); setOverrides({}); return; }
    setThinking(true);
    const t = setTimeout(() => {
      setEnriched(aiEnrich(text));
      setThinking(false);
    }, 700);
    return () => { clearTimeout(t); setThinking(false); };
  }, [text]);

  const final = enriched ? { ...enriched, ...overrides } : null;
  const setOverride = (k, v) => setOverrides(o => ({ ...o, [k]: v }));

  const submit = () => {
    if (!final) return;
    toast.show({
      title:`+ ${qty} × ${final.name} ${final.vintage || ''}`,
      message:`Ajouté en ${loc === 'LIMBO' ? 'zone d\'attente' : loc}`,
      action: { label:'VOIR LA CAVE', onClick: () => location.href = 'cave-proto.html' },
      duration: 6000,
    });
    setText(''); setEnriched(null); setOverrides({}); setQty(1); setPrice('');
  };

  const examples = [
    "Pommard 1er Cru Rugiens 2018",
    "Sancerre Caillottes 2020",
    "Côte-Rôtie La Landonne 2014",
    "Chablis Vaudésir 2019",
  ];

  return (
    <div className="grid grid-cols-12 gap-5 max-w-[1200px] mx-auto p-5">
      {/* Left — input */}
      <div className="col-span-7 space-y-4">
        <Card className="p-6">
          <SectionLabel>◌ Saisie libre</SectionLabel>
          <SectionTitle>Tape ce que tu vois sur l'étiquette</SectionTitle>
          <p className="text-[12.5px] text-stone-600 mt-1.5 mb-4">L'IA complète région, cépage, fenêtre de garde et prix marché.</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ex. Pommard 1er Cru Rugiens 2018"
            rows={3}
            autoFocus
            className="w-full px-4 py-3 rounded-md border border-stone-300 bg-white text-base outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600 serif-it"
          />
          {!text && (
            <div className="mt-3">
              <div className="mono text-[9px] tracking-widest text-stone-400 mb-2">EXEMPLES</div>
              <div className="flex flex-wrap gap-1.5">
                {examples.map(e => (
                  <button key={e} onClick={() => setText(e)} className="text-[11.5px] px-2.5 py-1 rounded-full border border-stone-200 text-stone-600 hover:border-stone-400 transition">{e}</button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Quantity + Location + Price */}
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Quantité</div>
              <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-md p-1 w-fit">
                <button onClick={() => setQty(q => Math.max(1, q-1))} className="w-8 h-8 rounded hover:bg-stone-200 text-lg">−</button>
                <span className="serif text-2xl text-stone-900 w-10 text-center tabular-nums">{qty}</span>
                <button onClick={() => setQty(q => q+1)} className="w-8 h-8 rounded hover:bg-stone-200 text-lg">+</button>
              </div>
            </div>
            <div>
              <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Emplacement</div>
              <select value={loc} onChange={(e) => setLoc(e.target.value)} className="h-10 px-3 rounded-md border border-stone-300 bg-white text-sm w-full outline-none focus:ring-2 focus:ring-wine-600/40">
                <option value="LIMBO">⏳ Zone d'attente (placer plus tard)</option>
                <option value="A1-1">A1-1 · Étagère A</option>
                <option value="B4-2">B4-2 · Étagère B</option>
                <option value="C5-3">C5-3 · Étagère C</option>
                <option value="CX-01">CX-01 · Caisse</option>
                <option value="CX-05">CX-05 · Caisse 12</option>
              </select>
            </div>
            <div>
              <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Prix d'achat (€)</div>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={final?.priceLow ? `~${final.priceLow}` : '—'} className="h-10 px-3 rounded-md border border-stone-300 bg-white text-sm w-full outline-none focus:ring-2 focus:ring-wine-600/40"/>
            </div>
          </div>
        </Card>

        <Button size="lg" disabled={!final || thinking} onClick={submit} className="w-full">
          {thinking ? 'Analyse…' : final ? `Ajouter ${qty} × ${final.name || 'ce vin'}` : 'Tape un vin pour commencer'}
        </Button>
      </div>

      {/* Right — AI enrichment preview */}
      <div className="col-span-5">
        <Card className="p-6 sticky top-5">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>◌ Analyse IA</SectionLabel>
            {final && !thinking && (
              <Badge tone={final.confidence > 0.85 ? 'success' : final.confidence > 0.5 ? 'warning' : 'urgent'}>
                {Math.round(final.confidence * 100)}%
              </Badge>
            )}
          </div>

          {!final && !thinking && (
            <div className="text-[13px] text-stone-500 italic py-8 text-center">
              <div className="serif-it text-2xl text-stone-300 mb-2">« en attente »</div>
              L'analyse apparaît ici dès que tu tapes.
            </div>
          )}

          {thinking && (
            <div className="space-y-2.5 py-4">
              <Skeleton className="h-6 w-3/4"/>
              <Skeleton className="h-4 w-1/2"/>
              <div className="pt-2 grid grid-cols-2 gap-3">
                <Skeleton className="h-12"/>
                <Skeleton className="h-12"/>
                <Skeleton className="h-12"/>
                <Skeleton className="h-12"/>
              </div>
            </div>
          )}

          {final && !thinking && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}}>
              <div className="serif-it text-2xl text-stone-900 leading-tight">{final.name}</div>
              <div className="mono text-[11px] tracking-widest text-stone-500 mt-1">
                {final.vintage || '????'} · {final.appellation}
              </div>

              {final.unknown && (
                <div className="mt-4 p-3 rounded bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
                  ⚠ Vin non reconnu dans la base. Tu peux le saisir manuellement ci-dessous.
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2 text-[12.5px]">
                <EnrichField label="Région" value={final.region} onChange={(v) => setOverride('region', v)}/>
                <EnrichField label="Cépage" value={final.cepage} onChange={(v) => setOverride('cepage', v)}/>
                <EnrichField label="Couleur" value={final.color} options={['rouge','blanc','rosé','effervescent']} onChange={(v) => setOverride('color', v)}/>
                <EnrichField label="Sous-région" value={final.subregion || '—'} onChange={(v) => setOverride('subregion', v)}/>
              </div>

              {final.peakWindow && (
                <div className="mt-5">
                  <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-2">Fenêtre de garde estimée</div>
                  <PeakTimeline start={final.peakWindow[0]} end={final.peakWindow[1]} now={2025}/>
                </div>
              )}

              {final.priceLow && (
                <div className="mt-5 flex items-baseline justify-between">
                  <div className="mono text-[10px] tracking-widest uppercase text-stone-500">Prix marché</div>
                  <div className="serif text-stone-900">{final.priceLow}€<span className="text-stone-400 mx-1">–</span>{final.priceHigh}€</div>
                </div>
              )}
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}

function EnrichField({ label, value, options, onChange }) {
  const [editing, setEditing] = React.useState(false);
  return (
    <div className="rounded border border-stone-200 bg-stone-50/50 px-2.5 py-2">
      <div className="mono text-[9px] tracking-widest uppercase text-stone-500">{label}</div>
      {!editing ? (
        <button onClick={() => setEditing(true)} className="text-stone-900 mt-0.5 hover:text-wine-700 transition text-left w-full truncate">
          {value || '—'}
        </button>
      ) : options ? (
        <select autoFocus defaultValue={value} onBlur={() => setEditing(false)} onChange={(e) => { onChange(e.target.value); setEditing(false); }} className="w-full bg-transparent outline-none text-stone-900 mt-0.5">
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input autoFocus defaultValue={value} onBlur={(e) => { onChange(e.target.value); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onChange(e.target.value); setEditing(false); } }}
          className="w-full bg-transparent outline-none text-stone-900 mt-0.5"/>
      )}
    </div>
  );
}

function PeakTimeline({ start, end, now }) {
  const min = Math.min(start, now) - 1;
  const max = Math.max(end, now) + 1;
  const range = max - min;
  const startPct = ((start - min) / range) * 100;
  const endPct = ((end - min) / range) * 100;
  const nowPct = ((now - min) / range) * 100;
  return (
    <div>
      <div className="relative h-8 bg-stone-100 rounded">
        <div className="absolute inset-y-1 bg-wine-200 rounded" style={{ left:`${startPct}%`, right:`${100-endPct}%` }}/>
        <div className="absolute inset-y-0 w-0.5 bg-stone-900" style={{ left:`${nowPct}%` }}/>
        <div className="absolute -top-1 mono text-[9px] tracking-widest text-stone-700" style={{ left:`${nowPct}%`, transform:'translateX(-50%)' }}>↓</div>
      </div>
      <div className="flex justify-between mono text-[10px] text-stone-500 mt-1.5">
        <span>{start}</span>
        <span className="text-stone-700">aujourd'hui · {now}</span>
        <span>{end}</span>
      </div>
    </div>
  );
}

// ============== MOBILE : OCR photo ==============
function AddWineMobile() {
  const [stage, setStage] = React.useState('start'); // start → photo → scanning → confirm → done
  const [enriched, setEnriched] = React.useState(null);
  const [qty, setQty] = React.useState(1);
  const toast = useToast();

  const startOCR = () => {
    setStage('photo');
    setTimeout(() => {
      setStage('scanning');
      setTimeout(() => {
        // Mock: simulate detected text from a Pommard label
        const detected = "POMMARD 1ER CRU RUGIENS 2018";
        setEnriched(aiEnrich(detected));
        setStage('confirm');
      }, 1800);
    }, 900);
  };

  const confirm = () => {
    setStage('done');
    toast.success(`${qty} × ${enriched.name} ajouté`);
  };

  return (
    <div className="max-w-[400px] mx-auto p-4">
      {/* iPhone frame */}
      <div className="bg-stone-900 rounded-[44px] p-2 shadow-2xl">
        <div className="bg-cream-50 rounded-[36px] overflow-hidden" style={{ height:'780px' }}>
          {/* status bar */}
          <div className="flex justify-between items-center px-7 py-2 mono text-[11px] text-stone-900">
            <span>9:41</span>
            <span className="w-20 h-5 bg-stone-900 rounded-full -mt-1"/>
            <span>●●●● 5G ▮</span>
          </div>

          <div className="px-5 pt-1 h-full flex flex-col">
            <div className="mono text-[10px] tracking-widest text-stone-500 mb-1">VINOFLOW</div>
            <h2 className="text-xl font-medium text-stone-900">Ajouter une bouteille</h2>

            {stage === 'start' && (
              <div className="mt-6 space-y-3">
                <button onClick={startOCR} className="w-full p-5 rounded-xl bg-wine-700 text-white flex items-center gap-4 hover:bg-wine-800 transition">
                  <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-2xl">📷</div>
                  <div className="text-left">
                    <div className="font-medium">Scanner l'étiquette</div>
                    <div className="text-[12px] text-wine-100">Le plus rapide · IA reconnaît 600+ vins</div>
                  </div>
                </button>
                <button className="w-full p-5 rounded-xl border border-stone-300 bg-white flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center text-2xl">⌨</div>
                  <div className="text-left">
                    <div className="font-medium text-stone-900">Saisir au clavier</div>
                    <div className="text-[12px] text-stone-500">Si tu connais déjà le vin</div>
                  </div>
                </button>
                <button className="w-full p-5 rounded-xl border border-stone-300 bg-white flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-stone-100 flex items-center justify-center text-2xl">🔎</div>
                  <div className="text-left">
                    <div className="font-medium text-stone-900">Chercher dans la wishlist</div>
                    <div className="text-[12px] text-stone-500">Marquer comme « acquis »</div>
                  </div>
                </button>
                <div className="mt-6">
                  <div className="mono text-[9px] tracking-widest text-stone-400 mb-2">RÉCEMMENT AJOUTÉS</div>
                  <div className="space-y-1.5">
                    {['Crozes-Hermitage Graillot 2018','Bandol Tempier 2020','Pommard Rugiens 2018'].map(n => (
                      <div key={n} className="px-3 py-2 rounded-lg bg-white border border-stone-200 serif-it text-[14px]">{n}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(stage === 'photo' || stage === 'scanning') && (
              <div className="mt-4 flex-1 flex flex-col">
                <div className="relative flex-1 bg-stone-900 rounded-xl overflow-hidden flex items-center justify-center">
                  {/* Mock label SVG */}
                  <div className="w-44 h-64 bg-cream-100 rounded-sm shadow-2xl rotate-2 flex flex-col items-center justify-center text-center px-3 relative">
                    <div className="absolute top-2 left-0 right-0 mono text-[7px] tracking-widest text-stone-400">CHÂTEAU MIS EN BOUTEILLE</div>
                    <div className="serif text-[10px] text-stone-700 mb-1">— BOURGOGNE —</div>
                    <div className="serif-it text-stone-900 text-[15px] leading-tight">Pommard</div>
                    <div className="serif text-[11px] text-stone-700 italic mt-0.5">1er Cru</div>
                    <div className="serif-it text-stone-900 text-[14px] mt-0.5">Rugiens</div>
                    <div className="mt-3 mono text-[10px] tracking-widest text-stone-700">2018</div>
                    <div className="absolute bottom-2 mono text-[6px] tracking-widest text-stone-400">13% VOL · 750 ML</div>
                  </div>
                  {/* OCR scanline */}
                  {stage === 'scanning' && (
                    <motion.div
                      className="absolute inset-x-8 h-0.5 bg-wine-400 shadow-[0_0_20px_rgba(220,117,117,0.8)]"
                      animate={{ top: ['10%', '90%', '10%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease:'easeInOut' }}
                    />
                  )}
                  {/* Corner brackets */}
                  {[
                    'top-4 left-4 border-l-2 border-t-2',
                    'top-4 right-4 border-r-2 border-t-2',
                    'bottom-4 left-4 border-l-2 border-b-2',
                    'bottom-4 right-4 border-r-2 border-b-2',
                  ].map(c => <div key={c} className={`absolute w-8 h-8 ${c} border-wine-400`}/>)}
                </div>
                <div className="text-center mt-4 mono text-[11px] tracking-widest text-stone-700">
                  {stage === 'photo' ? 'CADRE L\'ÉTIQUETTE…' : '◌ ANALYSE EN COURS…'}
                </div>
                {stage === 'photo' && (
                  <button onClick={() => setStage('start')} className="mt-3 mx-auto mono text-[11px] tracking-widest text-stone-500">ANNULER</button>
                )}
              </div>
            )}

            {stage === 'confirm' && enriched && (
              <motion.div initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} className="mt-4 space-y-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
                  <span className="text-2xl">✓</span>
                  <div>
                    <div className="text-emerald-800 font-medium text-sm">Reconnu — {Math.round(enriched.confidence*100)}%</div>
                    <div className="text-[11px] text-emerald-700">Vérifie avant d'enregistrer</div>
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-stone-200 p-4">
                  <div className="serif-it text-xl text-stone-900 leading-tight">{enriched.name}</div>
                  <div className="mono text-[10px] tracking-widest text-stone-500 mt-1">{enriched.vintage} · {enriched.appellation}</div>
                  <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-2 gap-2 text-[11.5px]">
                    <div><span className="text-stone-500">Région</span> <div className="text-stone-900">{enriched.region}</div></div>
                    <div><span className="text-stone-500">Cépage</span> <div className="text-stone-900">{enriched.cepage}</div></div>
                    <div><span className="text-stone-500">Couleur</span> <div className="text-stone-900">{enriched.color}</div></div>
                    <div><span className="text-stone-500">Prix marché</span> <div className="text-stone-900">{enriched.priceLow}€–{enriched.priceHigh}€</div></div>
                  </div>
                </div>
                <div className="rounded-xl bg-white border border-stone-200 p-4">
                  <div className="mono text-[9px] tracking-widest text-stone-500 mb-2">QUANTITÉ</div>
                  <div className="flex items-center gap-3 justify-center">
                    <button onClick={() => setQty(q => Math.max(1,q-1))} className="w-12 h-12 rounded-lg border border-stone-300 text-2xl">−</button>
                    <div className="serif text-4xl text-stone-900 w-16 text-center tabular-nums">{qty}</div>
                    <button onClick={() => setQty(q => q+1)} className="w-12 h-12 rounded-lg border border-stone-300 text-2xl">+</button>
                  </div>
                  <div className="mt-3 text-center mono text-[10px] tracking-widest text-stone-500">→ ZONE D'ATTENTE · place plus tard</div>
                </div>
                <button onClick={confirm} className="w-full h-14 rounded-xl bg-wine-700 text-white font-medium text-base">
                  Enregistrer {qty > 1 ? `(${qty})` : ''}
                </button>
                <button onClick={() => { setStage('start'); setEnriched(null); }} className="w-full mono text-[10px] tracking-widest text-stone-500 py-2">REFAIRE LA PHOTO</button>
              </motion.div>
            )}

            {stage === 'done' && (
              <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="mt-12 text-center">
                <motion.div initial={{scale:0}} animate={{scale:1}} transition={{delay:0.1, type:'spring'}} className="w-20 h-20 rounded-full bg-emerald-100 mx-auto flex items-center justify-center text-4xl">✓</motion.div>
                <div className="serif-it text-2xl text-stone-900 mt-4">{enriched.name}</div>
                <div className="mono text-[11px] tracking-widest text-stone-500 mt-1">{qty} × {enriched.vintage}</div>
                <p className="text-stone-600 text-sm mt-4 max-w-[260px] mx-auto">En zone d'attente. Place-le quand tu veux depuis la cave.</p>
                <div className="mt-6 space-y-2">
                  <button onClick={() => { setStage('start'); setEnriched(null); setQty(1); }} className="w-full h-12 rounded-xl bg-wine-700 text-white">Ajouter un autre</button>
                  <button onClick={() => location.href='cave-proto.html'} className="w-full h-12 rounded-xl border border-stone-300 bg-white text-stone-700">Voir la cave</button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.AddWineDesktop = AddWineDesktop;
window.AddWineMobile = AddWineMobile;
