// Sommelier — full conversation page.
// Persistent thread, contextual suggestions, three-card answers from cellar.

const SOMM_LS = 'vinoflow:somm:thread';

const PROACTIVE_PROMPTS = [
  { ctx:'Mardi soir · 19h', q:"Mardi tranquille — qu'est-ce qui se boit bien ce soir, sans grand cérémonial ?" },
  { ctx:'Météo · pluie', q:"Il pleut. Quelque chose de réconfortant, plutôt rond." },
  { ctx:'Calendrier · vendredi', q:"Vendredi, on reçoit les amis. Un rouge qui claque mais pas trop snob." },
  { ctx:'Pic imminent', q:"Quel vin de la cave est sur le point de passer son pic ?" },
];

const STARTER_QUERIES = [
  "agneau aux herbes, mardi soir, dîner à deux",
  "un blanc pour l'apéro de samedi, ami pas connaisseur",
  "j'ai un Pommard 2018 — il est encore bon ?",
  "qu'est-ce que je devrais boire avant qu'il ne soit trop tard ?",
];

// Scripted multi-turn responses keyed by intent.
function generateAnswer(query) {
  const q = query.toLowerCase();
  // very simple intent matching
  if (q.includes('agneau') || q.includes('viande') || q.includes('rouge')) {
    return {
      intent: 'pairing-rouge',
      lead: "Pour cet accord, je vois trois directions selon ton humeur du soir.",
      picks: [
        { vin:"Côte-Rôtie La Landonne", vtg:2014, loc:'C1', why:"Épicé, ample, profil syrah du Nord. Rencontre l'agneau sans le couvrir.", score:9.0, mood:"Si tu cherches la rencontre parfaite" },
        { vin:"Pommard 1er Cru Rugiens", vtg:2018, loc:'A2', why:"Dans sa fenêtre — note 8.5 au journal d'avril. Pinot noir charpenté.", score:8.5, mood:"Si tu veux honorer ta cave" },
        { vin:"Vacqueyras Le Sang", vtg:2017, loc:'C5', why:"Plus rustique, garrigue, idéal sans cérémonie un mardi.", score:8.0, mood:"Si la simplicité gagne" },
      ],
      followups: ["Et avec un agneau plutôt grillé ?", "Lequel est le moins fragile à ouvrir ?", "Décante-t-on ?"],
    };
  }
  if (q.includes('blanc') || q.includes('apéro') || q.includes('apero')) {
    return {
      intent: 'pairing-blanc',
      lead: "Trois blancs faciles, du plus accessible au plus pointu.",
      picks: [
        { vin:"Sancerre Les Caillottes", vtg:2020, loc:'B4', why:"Sauvignon classique, vif, fait pour l'apéritif. Plaît à tous.", score:8.0, mood:"L'évidence" },
        { vin:"Chablis Vaudésir", vtg:2019, loc:'B7', why:"Chardonnay minéral, pierre à fusil. Un peu plus structuré.", score:7.5, mood:"Si tu veux montrer un blanc" },
        { vin:"Vouvray Foreau", vtg:2011, loc:'D6', why:"Chenin sec — original, complexe. Pour un ami curieux.", score:8.0, mood:"Si tu veux surprendre" },
      ],
      followups: ["On accompagne d'un fromage de chèvre ?", "Lequel se garde s'il en reste ?", "Un crémant à la place ?"],
    };
  }
  if (q.includes('pic') || q.includes('avant') || q.includes('trop tard') || q.includes('urgent')) {
    return {
      intent: 'urgency',
      lead: "Quatre vins entrent en pic ce mois-ci. Voici les trois plus urgents.",
      picks: [
        { vin:"Pommard 1er Cru Rugiens", vtg:2018, loc:'A2', why:"Pic dans 15 jours. Bourgogne classique, dans son optimum aromatique.", score:8.5, mood:"Le plus urgent" },
        { vin:"Sancerre Les Caillottes", vtg:2020, loc:'B4', why:"Pic dans 28 jours. Vif, fruit présent — perd sa fraîcheur si on attend.", score:8.0, mood:"Pour cette semaine" },
        { vin:"Vouvray Foreau", vtg:2011, loc:'D6', why:"Pic dans 42 jours. Chenin moelleux qui demande un dessert ou un foie gras.", score:8.0, mood:"À planifier autour d'un repas" },
      ],
      followups: ["Plan-moi un dîner pour boire le Pommard", "Quoi avec le Sancerre ?", "Combien de temps tient le Vouvray après son pic ?"],
    };
  }
  if (q.includes('pommard') || q.includes('encore bon') || q.includes('2018')) {
    return {
      intent: 'lookup',
      lead: "Oui — et c'est même le bon moment.",
      picks: [
        { vin:"Pommard 1er Cru Rugiens", vtg:2018, loc:'A2', why:"En pic dans 15 jours. À boire dans le mois pour profiter de son optimum. Au-delà, il commence à perdre du fruit.", score:8.5, mood:"Verdict" },
      ],
      followups: ["Avec quoi le servir ?", "Combien de temps après ouverture ?", "Faut-il décanter ?"],
    };
  }
  // fallback
  return {
    intent: 'general',
    lead: "Je n'ai pas une réponse parfaite à ça, mais voici trois vins de ta cave qui pourraient répondre.",
    picks: [
      { vin:"Saint-Joseph Granit", vtg:2016, loc:'C3', why:"Polyvalent — syrah du Nord, élégante, sans excès.", score:8.0, mood:"Le passe-partout" },
      { vin:"Chablis Vaudésir", vtg:2019, loc:'B7', why:"Si tu veux un blanc, voilà la valeur sûre.", score:7.5, mood:"L'option blanche" },
      { vin:"Bandol Tempier", vtg:'10', loc:'D3', why:"Hall of Fame — pour quand l'occasion compte.", score:9.0, mood:"Si l'occasion compte" },
    ],
    followups: ["Précise un plat", "Plutôt rouge ou blanc ?", "Pour quelle occasion ?"],
  };
}

function loadThread() {
  try { return JSON.parse(localStorage.getItem(SOMM_LS) || 'null') || []; } catch { return []; }
}
function saveThread(t) { localStorage.setItem(SOMM_LS, JSON.stringify(t)); }

function SommelierPage() {
  const [thread, setThread] = React.useState(() => loadThread());
  const [query, setQuery] = React.useState('');
  const [thinking, setThinking] = React.useState(false);
  const scrollRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => { saveThread(thread); }, [thread]);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread, thinking]);

  const ask = (q) => {
    if (!q.trim()) return;
    const userMsg = { role:'user', text:q, ts:Date.now() };
    setThread(t => [...t, userMsg]);
    setQuery('');
    setThinking(true);
    setTimeout(() => {
      const ans = generateAnswer(q);
      setThread(t => [...t, { role:'somm', ...ans, ts:Date.now() }]);
      setThinking(false);
    }, 900 + Math.random() * 600);
  };

  const reset = () => {
    if (!confirm('Effacer toute la conversation ?')) return;
    setThread([]);
  };

  const isEmpty = thread.length === 0;

  return (
    <div className="grid grid-cols-12 gap-4 max-w-[1200px] mx-auto p-5">
      {/* Sidebar — context + proactive prompts */}
      <aside className="col-span-3 space-y-4">
        <Card className="p-4">
          <SectionLabel>◌ Contexte</SectionLabel>
          <div className="mt-3 space-y-2 text-[12px]">
            <div className="flex justify-between"><span className="text-stone-500">Date</span><span className="text-stone-800">Mardi 14 mai · 19h42</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Météo</span><span className="text-stone-800">Pluie, 14°</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Cave</span><span className="text-stone-800">290 btl</span></div>
            <div className="flex justify-between"><span className="text-stone-500">En pic ce mois</span><span className="text-wine-700 font-medium">4 vins</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <SectionLabel>◌ Suggestions proactives</SectionLabel>
          <div className="mt-3 space-y-1.5">
            {PROACTIVE_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => ask(p.q)} className="w-full text-left p-2 rounded hover:bg-stone-50 transition group">
                <div className="mono text-[9px] tracking-widest text-stone-500 group-hover:text-wine-700 mb-0.5">{p.ctx}</div>
                <div className="text-[12.5px] text-stone-800 leading-snug">{p.q}</div>
              </button>
            ))}
          </div>
        </Card>
        {thread.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mono text-[10px] tracking-widest" onClick={reset}>EFFACER LA CONVERSATION</Button>
        )}
      </aside>

      {/* Main thread */}
      <main className="col-span-9">
        <Card className="flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight:'600px' }}>
          {/* Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
            {isEmpty ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="serif-it text-3xl text-wine-700 mb-3">« Que cherches-tu, ce soir ? »</div>
                <p className="text-stone-600 text-sm mb-6">Donne-moi un plat, une occasion, un nom de vin — ou laisse-toi guider par les suggestions de gauche.</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {STARTER_QUERIES.map(s => (
                    <button key={s} onClick={() => ask(s)} className="text-[12px] px-3 py-1.5 rounded-full border border-stone-300 bg-white text-stone-700 hover:border-wine-600 hover:text-wine-700 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {thread.map((m, i) => m.role === 'user' ? (
                  <motion.div key={i} initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} className="flex justify-end">
                    <div className="max-w-md bg-wine-700 text-white px-4 py-2.5 rounded-2xl rounded-br-md text-[14px] leading-snug">
                      {m.text}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key={i} initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} transition={{duration:0.3}} className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-wine-700 text-white flex items-center justify-center serif-it text-base shrink-0">S</div>
                      <div className="text-[14px] text-stone-800 leading-relaxed pt-1">{m.lead}</div>
                    </div>
                    <div className="ml-11 grid grid-cols-3 gap-3">
                      {m.picks.map((p, j) => (
                        <motion.div key={j} initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} transition={{delay:0.15 + j*0.12}}
                          className="rounded-md border border-stone-200 bg-white p-3.5 hover:border-wine-300 hover:shadow-sm transition cursor-pointer group">
                          <div className="mono text-[9px] tracking-widest text-stone-400 mb-2">{p.mood}</div>
                          <div className="serif-it text-[15px] text-stone-900 leading-tight mb-1">{p.vin}</div>
                          <div className="mono text-[10px] tracking-widest text-stone-500 mb-2">{p.vtg} · {p.loc} {p.score && `· ${p.score}/10`}</div>
                          <p className="text-[12px] text-stone-700 leading-snug">{p.why}</p>
                          <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between mono text-[10px] tracking-widest">
                            <span className="text-stone-500">📍 {p.loc}</span>
                            <span className="text-wine-700 group-hover:text-wine-800">JE LE PRENDS →</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {m.followups && (
                      <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.6}} className="ml-11 flex flex-wrap gap-1.5 pt-1">
                        {m.followups.map(f => (
                          <button key={f} onClick={() => ask(f)} className="text-[11.5px] px-2.5 py-1 rounded-full bg-stone-50 border border-stone-200 text-stone-600 hover:border-wine-400 hover:text-wine-700 transition">
                            ↳ {f}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            {thinking && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-wine-700 text-white flex items-center justify-center serif-it text-base shrink-0">S</div>
                <div className="flex items-center gap-1.5 pt-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-pulse" style={{animationDelay:'0ms'}}/>
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-pulse" style={{animationDelay:'200ms'}}/>
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-pulse" style={{animationDelay:'400ms'}}/>
                </div>
              </motion.div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-stone-200 p-4 bg-stone-50/40">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') ask(query); }}
                placeholder="Demande au sommelier — un plat, une occasion, un nom…"
                className="flex-1 h-11 px-4 rounded-md border border-stone-300 bg-white text-sm outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600"
                autoFocus
              />
              <Button onClick={() => ask(query)} disabled={!query.trim() || thinking} size="lg">
                {thinking ? '…' : 'Demander'}
              </Button>
            </div>
            <div className="mono text-[10px] tracking-widest text-stone-500 mt-2">↵ envoyer · contexte cave + saison + météo intégré aux réponses</div>
          </div>
        </Card>
      </main>
    </div>
  );
}

window.SommelierPage = SommelierPage;
