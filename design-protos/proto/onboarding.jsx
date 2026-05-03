// Onboarding — first-run flow.
// 5 steps: welcome → profile → cellar setup → seed import → ready.
// Side rail shows progress; right side is the active step.

function Onboarding() {
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState({
    name: '',
    role: '',
    cellarSize: 'small',
    cellarType: 'home',
    style: ['rouge'],
    importMode: null, // 'manual' | 'photo' | 'csv' | 'demo'
    seeded: false,
  });

  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const steps = [
    { id:'welcome', label:'Bienvenue' },
    { id:'profile', label:'Profil' },
    { id:'cellar', label:'Cave' },
    { id:'goûts', label:'Goûts' },
    { id:'import', label:'Inventaire' },
    { id:'ready', label:'Prêt' },
  ];

  const next = () => setStep(s => Math.min(steps.length - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  return (
    <div className="grid grid-cols-12 min-h-screen">
      {/* Side rail */}
      <aside className="col-span-3 bg-stone-900 text-white p-8 flex flex-col">
        <div>
          <div className="serif-it text-3xl">VinoFlow</div>
          <div className="mono text-[10px] tracking-widest text-stone-400 mt-1">SETUP · 5 MIN</div>
        </div>

        <div className="mt-12 space-y-1">
          {steps.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.id} className="flex items-center gap-3 py-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center mono text-[11px] shrink-0 transition ${
                  done ? 'bg-emerald-500 text-white' :
                  active ? 'bg-wine-500 text-white' :
                  'bg-stone-700 text-stone-400'
                }`}>
                  {done ? '✓' : i + 1}
                </div>
                <div className={`text-[14px] transition ${
                  done ? 'text-stone-400 line-through' :
                  active ? 'text-white serif-it text-[16px]' :
                  'text-stone-500'
                }`}>{s.label}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-auto">
          <div className="h-1 bg-stone-700 rounded-full overflow-hidden">
            <motion.div className="h-full bg-wine-500" animate={{ width:`${((step+1)/steps.length)*100}%` }}/>
          </div>
          <div className="mono text-[10px] tracking-widest text-stone-400 mt-2 text-right">{step+1} / {steps.length}</div>
        </div>

        <p className="serif-it text-[13px] text-stone-400 mt-8 leading-snug">
          « Le vin est la plus saine et la plus hygiénique des boissons. »<br/>
          <span className="mono text-[10px] tracking-widest not-italic">— LOUIS PASTEUR</span>
        </p>
      </aside>

      {/* Active step */}
      <main className="col-span-9 bg-cream-50 p-12 overflow-y-auto flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity:0, x:20 }}
            animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-20 }}
            transition={{ duration:0.25 }}
            className="max-w-[640px] mx-auto w-full flex-1 flex flex-col"
          >
            {step === 0 && (
              <div className="my-auto">
                <div className="mono text-[10px] tracking-widest text-stone-500">ÉTAPE 1 SUR 6</div>
                <h1 className="serif-it text-5xl text-stone-900 leading-[1.1] mt-4">
                  Une cave qui<br/>
                  <span className="text-wine-700">se souvient pour toi.</span>
                </h1>
                <p className="text-stone-700 text-lg mt-6 leading-relaxed">
                  VinoFlow garde la mémoire de ce que tu bois, t'avertit avant qu'un vin ne passe son pic, et te conseille selon le moment. <span className="serif-it">Cinq minutes</span> pour tout configurer.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {[
                    { k:'01', t:'Pic optimal', d:'Sois prévenu avant qu\'il soit trop tard.' },
                    { k:'02', t:'Sommelier', d:'Demande à l\'IA, qui connaît ta cave.' },
                    { k:'03', t:'Mémoire', d:'Note. Compare. Apprends.' },
                  ].map(c => (
                    <div key={c.k} className="border-l-2 border-wine-700 pl-3">
                      <div className="mono text-[10px] tracking-widest text-stone-500">{c.k}</div>
                      <div className="serif-it text-stone-900 text-[16px] mt-0.5">{c.t}</div>
                      <p className="text-[12px] text-stone-600 mt-1 leading-snug">{c.d}</p>
                    </div>
                  ))}
                </div>
                <Button size="lg" onClick={next} className="mt-10">Commencer →</Button>
              </div>
            )}

            {step === 1 && (
              <div className="my-auto">
                <div className="mono text-[10px] tracking-widest text-stone-500">ÉTAPE 2 SUR 6 · PROFIL</div>
                <h2 className="serif-it text-4xl text-stone-900 mt-3">Faisons connaissance.</h2>
                <p className="text-stone-600 mt-2">Pour qu'on adapte le ton.</p>

                <div className="mt-8 space-y-5">
                  <div>
                    <label className="mono text-[10px] tracking-widest text-stone-500">PRÉNOM</label>
                    <input value={data.name} onChange={(e) => update('name', e.target.value)} placeholder="Léo" autoFocus className="w-full h-12 px-4 mt-1 rounded-md border border-stone-300 bg-white text-base outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600"/>
                  </div>
                  <div>
                    <label className="mono text-[10px] tracking-widest text-stone-500">TU TE DÉCRIS COMME ?</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        ['curious', 'Curieux qui apprend', 'Pas encore expert, j\'ai envie de comprendre.'],
                        ['amateur', 'Amateur passionné', 'Je connais mes goûts, j\'aime explorer.'],
                        ['collector', 'Collectionneur', 'Je garde, je trace, je négocie.'],
                        ['pro', 'Pro / sommelier', 'C\'est mon métier ou tout comme.'],
                      ].map(([id, t, d]) => (
                        <button key={id} onClick={() => update('role', id)} className={`text-left p-3 rounded-md border transition ${data.role===id ? 'border-wine-600 bg-wine-50 ring-2 ring-wine-600/20' : 'border-stone-300 bg-white hover:border-stone-400'}`}>
                          <div className="serif-it text-[15px] text-stone-900">{t}</div>
                          <div className="text-[12px] text-stone-600 mt-0.5">{d}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="my-auto">
                <div className="mono text-[10px] tracking-widest text-stone-500">ÉTAPE 3 SUR 6 · TA CAVE</div>
                <h2 className="serif-it text-4xl text-stone-900 mt-3">Parle-moi de ta cave.</h2>
                <p className="text-stone-600 mt-2">Pour calibrer les seuils et alertes.</p>

                <div className="mt-8 space-y-6">
                  <div>
                    <label className="mono text-[10px] tracking-widest text-stone-500">TAILLE APPROXIMATIVE</label>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[
                        ['xs', '< 20', 'btl'],
                        ['small', '20–100', 'btl'],
                        ['medium', '100–500', 'btl'],
                        ['large', '500+', 'btl'],
                      ].map(([id, n, u]) => (
                        <button key={id} onClick={() => update('cellarSize', id)} className={`p-4 rounded-md border transition text-center ${data.cellarSize===id ? 'border-wine-600 bg-wine-50 ring-2 ring-wine-600/20' : 'border-stone-300 bg-white hover:border-stone-400'}`}>
                          <div className="serif text-2xl text-stone-900">{n}</div>
                          <div className="mono text-[10px] tracking-widest text-stone-500 mt-0.5">{u}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mono text-[10px] tracking-widest text-stone-500">TYPE</label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {[
                        ['home', '🏠', 'Domicile', 'Cave perso, chez moi'],
                        ['storage', '❄', 'Cave climatique', 'Cellier ou armoire dédiée'],
                        ['external', '📦', 'Garde externe', 'Stockage chez un caviste'],
                      ].map(([id, ico, t, d]) => (
                        <button key={id} onClick={() => update('cellarType', id)} className={`p-4 rounded-md border transition text-left ${data.cellarType===id ? 'border-wine-600 bg-wine-50 ring-2 ring-wine-600/20' : 'border-stone-300 bg-white hover:border-stone-400'}`}>
                          <div className="text-2xl mb-1">{ico}</div>
                          <div className="serif-it text-[15px] text-stone-900">{t}</div>
                          <div className="text-[11.5px] text-stone-600 mt-0.5">{d}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="my-auto">
                <div className="mono text-[10px] tracking-widest text-stone-500">ÉTAPE 4 SUR 6 · GOÛTS</div>
                <h2 className="serif-it text-4xl text-stone-900 mt-3">Qu'est-ce que tu aimes ?</h2>
                <p className="text-stone-600 mt-2">Tu pourras affiner plus tard. Coche ce qui te parle.</p>

                <div className="mt-8 space-y-5">
                  <div>
                    <label className="mono text-[10px] tracking-widest text-stone-500">COULEURS</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[['rouge','Rouge'],['blanc','Blanc'],['rosé','Rosé'],['effervescent','Effervescent'],['liquoreux','Liquoreux'],['orange','Orange / nature']].map(([id, l]) => (
                        <button key={id} onClick={() => update('style', toggle(data.style, id))}
                          className={`px-3 h-9 rounded-full text-[13px] border transition ${data.style.includes(id) ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-stone-700 border-stone-300 hover:border-stone-400'}`}>
                          {data.style.includes(id) ? '✓ ' : ''}{l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mono text-[10px] tracking-widest text-stone-500">RÉGIONS PRÉFÉRÉES (optionnel)</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['Bourgogne','Bordeaux','Loire','Rhône','Provence','Champagne','Italie','Espagne','Allemagne'].map(r => (
                        <button key={r} className="px-3 h-9 rounded-full text-[13px] border border-stone-300 bg-white text-stone-700 hover:border-stone-400 transition">{r}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mono text-[10px] tracking-widest text-stone-500">BUDGET HABITUEL</label>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {['< 15€', '15–30€', '30–60€', '60€+'].map(b => (
                        <button key={b} className="p-3 rounded-md border border-stone-300 bg-white text-stone-700 text-[13px] hover:border-stone-400">{b}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="my-auto">
                <div className="mono text-[10px] tracking-widest text-stone-500">ÉTAPE 5 SUR 6 · INVENTAIRE</div>
                <h2 className="serif-it text-4xl text-stone-900 mt-3">Et ce que tu as déjà ?</h2>
                <p className="text-stone-600 mt-2">L'étape la plus longue. Choisis ton mode — tu pourras toujours en ajouter plus tard.</p>

                <div className="mt-8 space-y-2">
                  {[
                    { id:'photo', ico:'📷', t:'Scanner les étiquettes une à une', d:'Le plus précis. ~10 sec / btl. Idéal si <50 vins.', best:true },
                    { id:'csv', ico:'⤴', t:'Importer un fichier (CSV, Vivino, CellarTracker)', d:'Le plus rapide pour les grandes caves. On match automatiquement.' },
                    { id:'manual', ico:'⌨', t:'Saisir manuellement plus tard', d:'On démarre à vide. Tu ajoutes au fur et à mesure.' },
                    { id:'demo', ico:'✨', t:'Mode démo — me montrer avec une cave fictive', d:'12 vins exemples. Tu pourras tout effacer ensuite.' },
                  ].map(o => (
                    <button key={o.id} onClick={() => update('importMode', o.id)} className={`w-full text-left p-4 rounded-md border transition flex items-start gap-4 ${data.importMode===o.id ? 'border-wine-600 bg-wine-50 ring-2 ring-wine-600/20' : 'border-stone-300 bg-white hover:border-stone-400'}`}>
                      <div className="w-12 h-12 rounded-md bg-stone-100 flex items-center justify-center text-2xl shrink-0">{o.ico}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="serif-it text-[16px] text-stone-900">{o.t}</div>
                          {o.best && <Badge tone="success">RECOMMANDÉ</Badge>}
                        </div>
                        <div className="text-[12.5px] text-stone-600 mt-1">{o.d}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="my-auto text-center">
                <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:'spring', delay:0.1}} className="w-20 h-20 rounded-full bg-emerald-100 mx-auto flex items-center justify-center text-5xl text-emerald-700 mb-6">✓</motion.div>
                <div className="mono text-[10px] tracking-widest text-stone-500">ÉTAPE 6 SUR 6 · PRÊT</div>
                <h2 className="serif-it text-5xl text-stone-900 mt-3">Bonjour, {data.name || 'Léo'}.</h2>
                <p className="text-stone-700 text-lg mt-3 max-w-md mx-auto">
                  Ta cave est configurée. {data.importMode === 'demo' ? 'Tu démarres avec 12 vins exemples — efface-les quand tu veux.' : data.importMode === 'manual' ? 'Tu démarres à vide. Ajoute ta première bouteille en haut à droite.' : 'On commence par importer ton inventaire.'}
                </p>

                <div className="mt-10 grid grid-cols-3 gap-3 max-w-2xl mx-auto">
                  <a href="cockpit-proto.html" className="p-5 rounded-md border-2 border-wine-700 bg-wine-50 text-left hover:bg-wine-100 transition">
                    <div className="mono text-[10px] tracking-widest text-wine-800">PROCHAINE ÉTAPE</div>
                    <div className="serif-it text-[18px] text-wine-900 mt-1">Cockpit →</div>
                    <div className="text-[12px] text-wine-800 mt-1">Vue d'ensemble.</div>
                  </a>
                  <a href="add-wine-proto.html" className="p-5 rounded-md border border-stone-300 bg-white text-left hover:border-stone-400 transition">
                    <div className="mono text-[10px] tracking-widest text-stone-500">SI TU AS DU TEMPS</div>
                    <div className="serif-it text-[18px] text-stone-900 mt-1">Ajouter du vin</div>
                    <div className="text-[12px] text-stone-600 mt-1">Continuer l'import.</div>
                  </a>
                  <a href="sommelier-proto.html" className="p-5 rounded-md border border-stone-300 bg-white text-left hover:border-stone-400 transition">
                    <div className="mono text-[10px] tracking-widest text-stone-500">DÉCOUVRIR</div>
                    <div className="serif-it text-[18px] text-stone-900 mt-1">Le sommelier</div>
                    <div className="text-[12px] text-stone-600 mt-1">Pose-lui une question.</div>
                  </a>
                </div>

                <p className="serif-it text-stone-500 text-[14px] mt-12">À ta santé.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        {step > 0 && step < 5 && (
          <div className="max-w-[640px] mx-auto w-full flex items-center justify-between mt-8 pt-6 border-t border-stone-200">
            <Button variant="ghost" onClick={back}>← Retour</Button>
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(5)} className="mono text-[10px] tracking-widest text-stone-500 hover:text-wine-700">PASSER</button>
              <Button onClick={next} disabled={
                (step === 1 && (!data.name || !data.role)) ||
                (step === 4 && !data.importMode)
              }>Continuer →</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

window.Onboarding = Onboarding;
