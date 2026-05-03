// Insights — visual timeline of drinking windows
const { motion: _m4, AnimatePresence: _ap4 } = window.Motion;

const TIMELINE_DATA = [
  { id:'t01', name:"Pommard 1er Cru Rugiens",  vintage:2018, openIn:-12,  closeIn:60,   peak:30,  state:'urgent' },
  { id:'t02', name:"Sancerre Les Caillottes",  vintage:2020, openIn:-6,   closeIn:90,   peak:40,  state:'urgent' },
  { id:'t03', name:"Vouvray Foreau",           vintage:2011, openIn:-60,  closeIn:120,  peak:0,   state:'open' },
  { id:'t04', name:"Vacqueyras Le Sang",       vintage:2017, openIn:-3,   closeIn:160,  peak:80,  state:'open' },
  { id:'t05', name:"Côte-Rôtie La Landonne",   vintage:2014, openIn:6,    closeIn:240,  peak:120, state:'soon' },
  { id:'t06', name:"Chambolle-Musigny",        vintage:2015, openIn:24,   closeIn:520,  peak:300, state:'closed' },
  { id:'t07', name:"Hermitage Chave",          vintage:2011, openIn:120,  closeIn:1100, peak:600, state:'closed' },
];

// horizon: months from now, [-3..+36]
const MONTHS_BACK = 3;
const MONTHS_FWD = 36;

function Insights() {
  const ref = React.useRef(null);
  const [hover, setHover] = React.useState(null);
  const w = 1100;

  const monthToX = (m) => {
    const total = MONTHS_BACK + MONTHS_FWD;
    return ((m + MONTHS_BACK) / total) * 100;
  };

  return (
    <Card className="col-span-12 p-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <SectionLabel>◐ Insights · garde</SectionLabel>
          <SectionTitle>Quand ouvrir quoi — les 3 prochaines années</SectionTitle>
        </div>
        <div className="flex items-center gap-3 mono text-[10px] tracking-widest">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-stone-300 rounded-sm"/>FERMÉ</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-wine-300 rounded-sm"/>OUVERT</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-wine-700 rounded-sm"/>PIC</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-amber-200 rounded-sm"/>DÉCLINE</span>
        </div>
      </div>

      <div className="relative mt-6 select-none" ref={ref}>
        {/* axis */}
        <div className="relative h-6 border-b border-stone-200 mb-3 mono text-[10px] text-stone-500">
          {Array.from({length:Math.floor((MONTHS_BACK+MONTHS_FWD)/6)+1}).map((_,i) => {
            const m = -MONTHS_BACK + i*6;
            const left = monthToX(m);
            const yr = 2026 + Math.floor(m/12);
            const label = m === 0 ? 'AUJOURD\'HUI' : `${yr}`;
            return (
              <div key={i} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{left:`${left}%`}}>
                <span className={m===0 ? 'text-wine-700 font-medium' : ''}>{label}</span>
                <span className={`block w-px h-2 mt-1 ${m===0 ? 'bg-wine-700' : 'bg-stone-300'}`}/>
              </div>
            );
          })}
        </div>

        {/* now line */}
        <div className="absolute top-0 bottom-0 border-l border-wine-700/60 pointer-events-none" style={{left:`${monthToX(0)}%`}}/>

        {/* rows */}
        <div className="space-y-2.5">
          {TIMELINE_DATA.map(t => {
            const left = monthToX(t.openIn/30);
            const right = monthToX(t.closeIn/30);
            const width = right - left;
            const peakLeft = monthToX(t.peak/30);
            return (
              <div key={t.id} className="relative h-9 flex items-center" onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
                <div className="w-48 pr-4 text-right shrink-0">
                  <div className="text-[13px] serif-it text-stone-900 truncate">{t.name}</div>
                  <div className="mono text-[10px] text-stone-500">{t.vintage}</div>
                </div>
                <div className="flex-1 relative h-9">
                  {/* full bar */}
                  <motion.div
                    initial={{ width:0 }}
                    animate={{ width:`${width}%` }}
                    transition={{ duration:0.6, delay:0.05 }}
                    className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full ${t.state==='urgent' ? 'bg-wine-300' : t.state==='open' ? 'bg-wine-200' : 'bg-stone-200'}`}
                    style={{ left:`${left}%` }}
                  />
                  {/* peak marker */}
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-wine-700 ring-2 ring-white" style={{ left:`${peakLeft}%` }}/>
                  {/* tooltip on hover */}
                  <AnimatePresence>
                    {hover === t.id && (
                      <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="absolute -top-12 -translate-x-1/2 bg-stone-900 text-white px-3 py-1.5 rounded text-[11px] mono tracking-widest whitespace-nowrap z-10" style={{left:`${peakLeft}%`}}>
                        PIC EN {t.peak === 0 ? 'COURS' : `${t.peak < 365 ? t.peak+' J' : Math.round(t.peak/30)+' MOIS'}`}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* summary */}
      <div className="mt-8 pt-6 border-t border-stone-200 grid grid-cols-4 gap-4">
        <div><SectionLabel>À ouvrir &lt; 3 mois</SectionLabel><div className="serif text-3xl text-wine-700 mt-2">2</div></div>
        <div><SectionLabel>En pleine fenêtre</SectionLabel><div className="serif text-3xl text-stone-900 mt-2">2</div></div>
        <div><SectionLabel>Pic dans 6–12 mois</SectionLabel><div className="serif text-3xl text-stone-700 mt-2">1</div></div>
        <div><SectionLabel>Garde longue (3 ans+)</SectionLabel><div className="serif text-3xl text-stone-700 mt-2">2</div></div>
      </div>
    </Card>
  );
}

window.Insights = Insights;
