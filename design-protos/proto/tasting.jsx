// Tasting express — multi-step form with hand-rolled zod-style validation,
// auto-save to localStorage, optimistic save, confetti on 10/10.
// (We avoid loading react-hook-form/zod via CDN to keep the proto build-free;
//  the *patterns* are identical: schema-driven validation + dirty/touched state.)

const { motion: _m2, AnimatePresence: _ap2 } = window.Motion;

// --- tiny zod-style validator ---
const v = {
  string: (opts={}) => ({ kind:'string', ...opts }),
  number: (opts={}) => ({ kind:'number', ...opts }),
  enum:   (vals, opts={}) => ({ kind:'enum', vals, ...opts }),
  array:  (of, opts={}) => ({ kind:'array', of, ...opts }),
};
function validateField(rule, val) {
  if (rule.required && (val == null || val === '' || (Array.isArray(val) && val.length === 0))) return 'requis';
  if (val == null || val === '') return null;
  if (rule.kind === 'number') {
    if (typeof val !== 'number' || Number.isNaN(val)) return 'nombre invalide';
    if (rule.min != null && val < rule.min) return `min ${rule.min}`;
    if (rule.max != null && val > rule.max) return `max ${rule.max}`;
  }
  if (rule.kind === 'enum' && !rule.vals.includes(val)) return 'valeur inconnue';
  return null;
}

const TASTING_SCHEMA = {
  wine:    v.string({ required:true }),
  vintage: v.number({ required:true, min:1900, max:2030 }),
  context: v.string(),
  with:    v.string(),
  // sensory
  robe:    v.enum(['pâle','rubis','grenat','tuilé','—']),
  nez:     v.array(v.string()),
  bouche:  v.array(v.string()),
  // judgement
  score:   v.number({ required:true, min:0, max:10 }),
  comment: v.string(),
};

// --- aroma chips ---
const NEZ_OPTIONS = ['fruits rouges','fruits noirs','cassis','réglisse','vanille','cuir','sous-bois','poivre','épices','pierre à fusil','cire','miel','agrumes','fleurs blanches','toasté'];
const BOUCHE_OPTIONS = ['ample','tendu','rond','sec','frais','tannique','soyeux','long','court','minéral','salin','gras','vif'];

// --- localStorage persistence ---
const LS_KEY = 'vinoflow:tasting:draft';
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}
function saveDraft(data) { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
function clearDraft() { localStorage.removeItem(LS_KEY); }

// --- form hook ---
function useTastingForm() {
  const [data, setData] = React.useState(() => loadDraft() || {
    wine:'', vintage:'', context:'', with:'',
    robe:'—', nez:[], bouche:[],
    score:7, comment:'',
  });
  const [errors, setErrors] = React.useState({});
  const [savedAt, setSavedAt] = React.useState(null);
  const [step, setStep] = React.useState(0);

  // auto-save (debounced)
  const timerRef = React.useRef(null);
  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(data);
      setSavedAt(new Date());
    }, 600);
    return () => clearTimeout(timerRef.current);
  }, [data]);

  const setField = (k, val) => {
    setData(d => ({ ...d, [k]: val }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };
  const toggle = (k, val) => {
    setData(d => ({ ...d, [k]: d[k].includes(val) ? d[k].filter(x => x !== val) : [...d[k], val] }));
  };

  const validate = () => {
    const errs = {};
    Object.entries(TASTING_SCHEMA).forEach(([k, rule]) => {
      const e = validateField(rule, data[k]);
      if (e) errs[k] = e;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  return { data, setField, toggle, errors, validate, savedAt, step, setStep };
}

// --- confetti helper (lazy CDN) ---
function fireConfetti() {
  if (window.confetti) {
    window.confetti({ particleCount:120, spread:80, origin:{ y:0.6 }, colors:['#7f1d1d','#9b1c1c','#dc7575','#fbe9e9','#fcfaf6'] });
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
  s.onload = () => fireConfetti();
  document.head.appendChild(s);
}

// --- field components ---
function Field({ label, error, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono text-[10px] tracking-widest uppercase text-stone-500">{label}{error && <span className="text-wine-700 ml-2 normal-case tracking-normal">· {error}</span>}</span>
      {children}
      {hint && <span className="text-[11px] text-stone-500">{hint}</span>}
    </label>
  );
}
function Input(props) {
  return <input {...props} className={`h-10 px-3 rounded-md border border-stone-300 bg-white text-sm outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600 ${props.className||''}`}/>;
}
function Textarea(props) {
  return <textarea {...props} className={`px-3 py-2 rounded-md border border-stone-300 bg-white text-sm outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600 ${props.className||''}`}/>;
}
function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`mono text-[11px] px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-wine-700 text-white border-wine-700' : 'bg-white border-stone-300 text-stone-700 hover:border-stone-500'}`}>
      {children}
    </button>
  );
}

// --- score slider ---
function ScoreSlider({ value, onChange }) {
  const ref = React.useRef(null);
  const [drag, setDrag] = React.useState(false);
  const setFromEvent = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const next = Math.round(ratio * 20) / 2;
    onChange(next);
  };
  const tone = value >= 9 ? 'text-wine-700' : value >= 7 ? 'text-stone-900' : 'text-stone-500';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="mono text-[10px] tracking-widest uppercase text-stone-500">Note</div>
        <div className={`serif text-5xl font-medium ${tone} tabular-nums`}>{value.toFixed(1)}<span className="text-stone-400 text-2xl"> / 10</span></div>
      </div>
      <div
        ref={ref}
        onMouseDown={(e) => { setDrag(true); setFromEvent(e); }}
        onMouseMove={(e) => drag && setFromEvent(e)}
        onMouseUp={() => setDrag(false)}
        onMouseLeave={() => setDrag(false)}
        onTouchStart={(e) => { setDrag(true); setFromEvent(e); }}
        onTouchMove={(e) => drag && setFromEvent(e)}
        onTouchEnd={() => setDrag(false)}
        className="relative h-12 rounded-md bg-stone-100 ring-1 ring-stone-200 cursor-ew-resize select-none overflow-hidden"
      >
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-stone-300 via-wine-300 to-wine-700" style={{width:`${value*10}%`}}/>
        <div className="absolute inset-0 flex">
          {Array.from({length:11}).map((_,i) => (
            <div key={i} className="flex-1 border-r border-stone-300/60 last:border-0 flex items-end justify-start pl-1 pb-0.5">
              <span className="mono text-[9px] text-stone-500">{i}</span>
            </div>
          ))}
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 w-1 h-8 bg-wine-700 rounded-full shadow-md" style={{left:`calc(${value*10}% - 2px)`}}/>
      </div>
      <div className="flex justify-between mono text-[10px] text-stone-500 tracking-widest mt-2">
        <span>JETÉ</span><span>HONNÊTE</span><span>BON</span><span>EXCELLENT</span><span>CLAQUE</span>
      </div>
    </div>
  );
}

// --- main form ---
function TastingExpress() {
  const f = useTastingForm();
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const toast = useToast();

  const steps = ['Vin','Sensoriel','Note'];

  const next = () => f.setStep(s => Math.min(s+1, steps.length-1));
  const prev = () => f.setStep(s => Math.max(s-1, 0));

  const submit = () => {
    if (!f.validate()) {
      toast.error('Vérifie les champs obligatoires');
      // jump to first error step
      const errs = Object.keys(TASTING_SCHEMA).filter(k => {
        const e = validateField(TASTING_SCHEMA[k], f.data[k]); return e;
      });
      if (errs.includes('wine') || errs.includes('vintage')) f.setStep(0);
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      clearDraft();
      if (f.data.score >= 10) fireConfetti();
      toast.success(`« ${f.data.wine} ${f.data.vintage} » noté ${f.data.score.toFixed(1)} / 10`, {
        action: { label:'VOIR', onClick: () => toast.info('→ ouvre le journal') },
      });
    }, 600);
  };

  const reset = () => {
    clearDraft();
    setSubmitted(false);
    f.setStep(0);
    Object.keys(TASTING_SCHEMA).forEach(k => f.setField(k, k === 'score' ? 7 : k === 'nez' || k === 'bouche' ? [] : k === 'robe' ? '—' : ''));
  };

  // saved indicator
  const savedAgo = f.savedAt ? Math.max(0, Math.round((Date.now() - f.savedAt.getTime())/1000)) : null;

  if (submitted) {
    return (
      <Card className="col-span-12 p-10 text-center">
        <div className="serif-it text-3xl text-wine-700">« {f.data.wine} »</div>
        <div className="mono text-[11px] text-stone-500 tracking-widest mt-2">{f.data.vintage} · NOTÉ {f.data.score.toFixed(1)} / 10</div>
        <p className="text-stone-600 mt-4 max-w-md mx-auto text-sm">Ajouté au journal et au Hall of Fame {f.data.score >= 9 ? '— bien joué.' : '.'}</p>
        <div className="flex gap-2 justify-center mt-6">
          <Button variant="outline" onClick={reset}>Nouvelle dégustation</Button>
          <Button onClick={() => toast.info('→ retour cockpit')}>Retour cockpit</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="col-span-12 p-0 overflow-hidden">
      {/* Stepper */}
      <header className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/40">
        <div>
          <SectionLabel>◌ Dégustation express</SectionLabel>
          <SectionTitle>Note ce que tu bois, en 30 secondes</SectionTitle>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mono text-[10px] tracking-widest text-stone-500">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <span className="text-stone-300">·</span>}
                <button onClick={() => f.setStep(i)} className={`px-2 py-1 rounded ${i === f.step ? 'bg-wine-700 text-white' : 'hover:text-stone-900'}`}>{(i+1).toString().padStart(2,'0')} {s}</button>
              </React.Fragment>
            ))}
          </div>
          {f.savedAt && <span className="mono text-[10px] tracking-widest text-emerald-700">● BROUILLON {savedAgo === 0 ? 'À L\'INSTANT' : `IL Y A ${savedAgo}s`}</span>}
        </div>
      </header>

      <div className="grid grid-cols-12 min-h-[420px]">
        <div className="col-span-8 p-6 border-r border-stone-200">
          <AnimatePresence mode="wait">
            {f.step === 0 && (
              <motion.div key="s0" initial={{opacity:0, x:8}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-8}} transition={{duration:0.18}} className="flex flex-col gap-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Field label="Vin" error={f.errors.wine}>
                      <Input value={f.data.wine} onChange={e => f.setField('wine', e.target.value)} placeholder="ex. Crozes-Hermitage Graillot" autoFocus/>
                    </Field>
                  </div>
                  <Field label="Millésime" error={f.errors.vintage}>
                    <Input type="number" value={f.data.vintage} onChange={e => f.setField('vintage', e.target.value === '' ? '' : Number(e.target.value))} placeholder="2018"/>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Avec qui" hint="optionnel">
                    <Input value={f.data.with} onChange={e => f.setField('with', e.target.value)} placeholder="solo, M., amis…"/>
                  </Field>
                  <Field label="Contexte" hint="optionnel">
                    <Input value={f.data.context} onChange={e => f.setField('context', e.target.value)} placeholder="dîner mardi, BBQ, anniversaire…"/>
                  </Field>
                </div>
                <div className="text-[12px] text-stone-500">Tab pour passer entre les champs · ⌘↵ pour valider plus tard</div>
              </motion.div>
            )}
            {f.step === 1 && (
              <motion.div key="s1" initial={{opacity:0, x:8}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-8}} transition={{duration:0.18}} className="flex flex-col gap-5">
                <div>
                  <SectionLabel>Robe</SectionLabel>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['pâle','rubis','grenat','tuilé','—'].map(r => (
                      <Chip key={r} active={f.data.robe===r} onClick={() => f.setField('robe', r)}>{r}</Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel>Nez</SectionLabel>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {NEZ_OPTIONS.map(o => <Chip key={o} active={f.data.nez.includes(o)} onClick={() => f.toggle('nez', o)}>{o}</Chip>)}
                  </div>
                </div>
                <div>
                  <SectionLabel>Bouche</SectionLabel>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {BOUCHE_OPTIONS.map(o => <Chip key={o} active={f.data.bouche.includes(o)} onClick={() => f.toggle('bouche', o)}>{o}</Chip>)}
                  </div>
                </div>
              </motion.div>
            )}
            {f.step === 2 && (
              <motion.div key="s2" initial={{opacity:0, x:8}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-8}} transition={{duration:0.18}} className="flex flex-col gap-5">
                <ScoreSlider value={f.data.score} onChange={(v) => f.setField('score', v)}/>
                <Field label="Commentaire" hint="ce qui te restera dans 6 mois">
                  <Textarea rows={4} value={f.data.comment} onChange={e => f.setField('comment', e.target.value)} placeholder="« avec un agneau, un samedi d'hiver — claque »"/>
                </Field>
                {f.data.score >= 10 && (
                  <motion.div initial={{opacity:0, scale:0.9}} animate={{opacity:1, scale:1}} className="rounded-md bg-wine-50 border border-wine-200 px-4 py-3 flex items-center gap-3">
                    <span className="serif-it text-2xl text-wine-700">★</span>
                    <div>
                      <div className="text-sm text-wine-800 font-medium">Note maximale.</div>
                      <div className="text-[12px] text-stone-700">Ajouté au Hall of Fame · une bouteille comme ça, ça se fête.</div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Live preview right column */}
        <aside className="col-span-4 p-6 bg-cream-100 grid-bg flex flex-col">
          <SectionLabel>Aperçu</SectionLabel>
          <div className="serif-it text-2xl text-stone-900 mt-2 leading-tight">{f.data.wine || <span className="text-stone-400">Nom du vin…</span>}</div>
          <div className="mono text-[11px] text-stone-500 tracking-widest mt-1">{f.data.vintage || '—'} {f.data.with && `· avec ${f.data.with}`}</div>
          {f.data.context && <div className="text-[12px] text-stone-700 italic mt-2">« {f.data.context} »</div>}

          {(f.data.nez.length > 0 || f.data.bouche.length > 0 || f.data.robe !== '—') && (
            <div className="mt-4 pt-4 border-t border-stone-300/60 space-y-2">
              {f.data.robe !== '—' && <div className="text-[12px]"><span className="mono text-[10px] text-stone-500 tracking-widest uppercase">robe </span>{f.data.robe}</div>}
              {f.data.nez.length > 0 && <div className="text-[12px]"><span className="mono text-[10px] text-stone-500 tracking-widest uppercase">nez </span>{f.data.nez.join(', ')}</div>}
              {f.data.bouche.length > 0 && <div className="text-[12px]"><span className="mono text-[10px] text-stone-500 tracking-widest uppercase">bouche </span>{f.data.bouche.join(', ')}</div>}
            </div>
          )}

          <div className="mt-auto pt-4">
            {f.data.score != null && (
              <div className={`serif text-4xl ${f.data.score >= 9 ? 'text-wine-700' : 'text-stone-700'}`}>{f.data.score.toFixed(1)}<span className="text-stone-400 text-xl"> / 10</span></div>
            )}
            {f.data.comment && <div className="serif-it text-stone-700 mt-2 text-sm leading-snug">« {f.data.comment} »</div>}
          </div>
        </aside>
      </div>

      {/* Footer actions */}
      <footer className="px-6 py-3 border-t border-stone-200 flex items-center justify-between bg-stone-50/40">
        <Button variant="ghost" onClick={prev} disabled={f.step === 0}>← Précédent</Button>
        <div className="mono text-[10px] tracking-widest text-stone-500">ÉTAPE {f.step+1} / {steps.length}</div>
        {f.step < steps.length - 1 ? (
          <Button onClick={next}>Continuer →</Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer la dégustation'}</Button>
        )}
      </footer>
    </Card>
  );
}

window.TastingExpress = TastingExpress;
