// Atomic UI components — shadcn-flavored Tailwind primitives + small helpers.
// Loaded via <script type="text/babel">, exports to window for use across files.
const { motion, AnimatePresence } = window.Motion || {};
Object.assign(window, { motion, AnimatePresence });

// ----- Button -----
function Button({ variant='default', size='md', className='', children, ...rest }) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-wine-600/40';
  const variants = {
    default: 'bg-wine-700 hover:bg-wine-800 text-white',
    outline: 'border border-stone-300 bg-white hover:bg-stone-50 text-stone-700',
    ghost:   'hover:bg-stone-100 text-stone-700',
    subtle:  'bg-stone-100 hover:bg-stone-200 text-stone-800',
    danger:  'bg-wine-700 hover:bg-wine-800 text-white',
  };
  const sizes = {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-9 px-3.5 text-sm',
    lg: 'h-11 px-5 text-base',
    icon: 'h-9 w-9',
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>{children}</button>;
}

// ----- Badge (urgency badges in the table) -----
function Badge({ tone='neutral', className='', children }) {
  const tones = {
    urgent:  'bg-wine-700 text-white',
    warning: 'bg-amber-100 text-amber-800',
    neutral: 'bg-stone-100 text-stone-600',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rare:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  };
  return <span className={`mono inline-flex items-center px-1.5 py-0.5 rounded font-medium text-[10px] ${tones[tone]} ${className}`}>{children}</span>;
}

// ----- Card -----
function Card({ className='', children, ...rest }) {
  return <section className={`rounded-md border border-stone-200 bg-white ${className}`} {...rest}>{children}</section>;
}

// ----- SectionLabel + SectionTitle -----
function SectionLabel({ children, className='' }) {
  return <div className={`mono text-[10px] tracking-[0.18em] uppercase text-stone-500 ${className}`}>{children}</div>;
}
function SectionTitle({ children, className='' }) {
  return <h3 className={`text-[15px] font-medium text-stone-900 mt-0.5 ${className}`}>{children}</h3>;
}

// ----- Skeleton -----
function Skeleton({ className='' }) {
  return <div className={`bg-stone-200 rounded animate-pulse ${className}`} />;
}

// ----- Toast viewport (Sonner-flavored) -----
const ToastCtx = React.createContext(null);
function useToast() { return React.useContext(ToastCtx); }
function ToastProvider({ children }) {
  const [items, setItems] = React.useState([]);
  const idRef = React.useRef(0);

  const dismiss = React.useCallback((id) => {
    setItems(xs => xs.filter(x => x.id !== id));
  }, []);

  const toast = React.useCallback((opts) => {
    const id = ++idRef.current;
    const t = { id, ...opts };
    setItems(xs => [...xs, t]);
    const dur = opts.duration ?? 4000;
    if (dur > 0) {
      const tid = setTimeout(() => {
        setItems(xs => xs.filter(x => x.id !== id));
      }, dur);
      t._timeout = tid;
    }
    return id;
  }, []);

  const api = React.useMemo(() => ({
    show: toast,
    success: (msg, opts={}) => toast({ ...opts, message:msg, tone:'success' }),
    error:   (msg, opts={}) => toast({ ...opts, message:msg, tone:'error' }),
    info:    (msg, opts={}) => toast({ ...opts, message:msg, tone:'info' }),
    dismiss,
  }), [toast, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[360px] pointer-events-none">
        <AnimatePresence>
          {items.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity:0, y:20, scale:0.96 }}
              animate={{ opacity:1, y:0, scale:1 }}
              exit={{ opacity:0, y:10, scale:0.98, transition:{ duration:0.15 } }}
              className="pointer-events-auto rounded-md bg-stone-900 text-white shadow-lg ring-1 ring-stone-800 px-4 py-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                {t.title && <div className="text-sm font-medium">{t.title}</div>}
                <div className="text-[13px] text-stone-200">{t.message}</div>
              </div>
              {t.action && (
                <button
                  className="mono text-[10px] tracking-widest text-wine-300 hover:text-white px-2 py-1 -mr-2"
                  onClick={() => { t.action.onClick(); dismiss(t.id); if (t._timeout) clearTimeout(t._timeout); }}
                >{t.action.label}</button>
              )}
              <button className="text-stone-400 hover:text-white text-base leading-none -mr-1" onClick={() => dismiss(t.id)}>×</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ----- Kbd -----
function Kbd({ children }) {
  return <span className="mono text-[10px] text-stone-500 px-1.5 py-0.5 rounded border border-stone-300">{children}</span>;
}

// ----- Pulse dot -----
function PulseDot({ className='' }) {
  return (
    <span className={`relative inline-flex w-1.5 h-1.5 ${className}`}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-wine-700 opacity-60 animate-ping"></span>
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wine-700"></span>
    </span>
  );
}

Object.assign(window, { Button, Badge, Card, SectionLabel, SectionTitle, Skeleton, ToastProvider, useToast, Kbd, PulseDot });
