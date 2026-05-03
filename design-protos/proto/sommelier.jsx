// Sommelier hero with conversational state machine
function SommelierHero() {
  const [phase, setPhase] = React.useState('idle'); // idle | thinking | answered
  const [query, setQuery] = React.useState('');
  const [answers, setAnswers] = React.useState([]);
  const inputRef = React.useRef(null);

  const ask = (q) => {
    if (!q.trim()) return;
    setPhase('thinking');
    setQuery(q);
    setTimeout(() => {
      setAnswers(window.SEED.sommelierExamples[0].answers);
      setPhase('answered');
    }, 1100);
  };

  const reset = () => { setPhase('idle'); setQuery(''); setAnswers([]); inputRef.current?.focus(); };

  const onSubmit = (e) => { e.preventDefault(); ask(query); };

  const chips = ['À DEUX', 'FESTIF', 'SOLO', 'APÉRO', 'SURPRISE-MOI'];

  return (
    <section className="col-span-12 rounded-md bg-cream-100 grid-bg p-8 ring-1 ring-stone-900/5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 mono text-[10px] tracking-widest text-wine-700">
          <PulseDot/>SOMMELIER · MODÈLE LOCAL
        </div>
        <div className="mono text-[10px] text-stone-500">RÉPONSE MOY. 1.4s</div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div key="idle" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.2}}>
            <h2 className="serif text-4xl text-stone-900 leading-tight">Que boire <span className="serif-it text-wine-700">ce soir</span> ?</h2>
            <p className="text-stone-600 text-sm mt-3 max-w-md">Décris le moment, le plat, l'humeur — ou pose la question.</p>
            <form onSubmit={onSubmit} className="mt-6 flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 h-12 focus-within:ring-2 focus-within:ring-wine-600 focus-within:border-wine-600">
              <svg className="w-4 h-4 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} className="bg-transparent flex-1 text-sm outline-none placeholder:text-stone-500 text-stone-900" placeholder="ex. dîner à deux, agneau aux herbes, on est mardi"/>
              <Button size="sm" type="submit">Demander →</Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map(c => (
                <button key={c} onClick={() => ask(c.toLowerCase())} className="mono text-[10px] px-2 py-1 rounded border border-stone-300 bg-white/60 text-stone-700 hover:bg-white">{c}</button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'thinking' && (
          <motion.div key="thinking" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="py-4">
            <div className="text-stone-600 text-sm italic mb-1">« {query} »</div>
            <div className="flex items-center gap-2 mono text-[11px] text-wine-700">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-wine-700 animate-bounce" style={{animationDelay:'0ms'}}/>
                <span className="w-1.5 h-1.5 rounded-full bg-wine-700 animate-bounce" style={{animationDelay:'120ms'}}/>
                <span className="w-1.5 h-1.5 rounded-full bg-wine-700 animate-bounce" style={{animationDelay:'240ms'}}/>
              </span>
              LE SOMMELIER RÉFLÉCHIT…
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[0,1,2].map(i => <Skeleton key={i} className="h-32 rounded-md"/>)}
            </div>
          </motion.div>
        )}

        {phase === 'answered' && (
          <motion.div key="answered" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-stone-600 text-sm italic">« {query} »</div>
                <div className="serif text-2xl text-stone-900 mt-1">3 idées dans <span className="serif-it text-wine-700">ta cave</span></div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>← Nouvelle question</Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {answers.map((a, i) => (
                <motion.div
                  key={a.vin}
                  initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} transition={{delay: i*0.08}}
                  className="rounded-md border border-stone-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="serif-it text-stone-900 text-base leading-snug">{a.vin}</div>
                    <Badge tone="success">★ {a.score}</Badge>
                  </div>
                  <div className="mono text-[10px] tracking-widest text-stone-500">{a.vtg} · CASE {a.loc}</div>
                  <p className="text-[13px] text-stone-700 mt-2 leading-snug">{a.why}</p>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100">
                    <Button size="sm" variant="outline" className="flex-1">Voir</Button>
                    <Button size="sm" className="flex-1">Je l'ouvre</Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

window.SommelierHero = SommelierHero;
