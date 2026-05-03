// Command palette (cmdk-flavored, hand-rolled to avoid ESM import issues)
const { motion: _m1, AnimatePresence: _ap1 } = window.Motion;
function CommandPalette({ open, onClose, onAction }) {
  const [q, setQ] = React.useState('');
  const inputRef = React.useRef(null);
  const items = React.useMemo(() => {
    const actions = window.SEED.quickActions.map(a => ({ ...a, kind:'action' }));
    const wines = [...window.SEED.urgent, ...window.SEED.wishlist].map(w => ({
      kind:'wine', label: w.name + (w.vintage ? ` ${w.vintage}` : ''), id:w.id, region:w.region,
    }));
    const all = [...actions, ...wines];
    if (!q.trim()) return all.slice(0, 8);
    const lower = q.toLowerCase();
    return all.filter(x => x.label.toLowerCase().includes(lower) || (x.region||'').toLowerCase().includes(lower)).slice(0, 10);
  }, [q]);

  const [active, setActive] = React.useState(0);
  React.useEffect(() => { setActive(0); }, [q, open]);
  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ('');
  }, [open]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a+1, items.length-1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a-1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it) { onAction(it); onClose(); } }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-stone-900/40 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <motion.div
        initial={{ opacity:0, y:-8, scale:0.98 }} animate={{ opacity:1, y:0, scale:1 }}
        transition={{ duration:0.15 }}
        className="w-[600px] max-w-[92vw] bg-white rounded-lg shadow-2xl ring-1 ring-stone-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-stone-200">
          <svg className="w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Cherche un vin, une action..."
            className="flex-1 outline-none text-sm bg-transparent placeholder:text-stone-400"
          />
          <Kbd>ESC</Kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto py-1">
          {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-stone-500">Aucun résultat</div>}
          {items.map((it, idx) => (
            <button
              key={(it.kind || 'x') + '-' + (it.id || it.label) + '-' + idx}
              onMouseEnter={() => setActive(idx)}
              onClick={() => { onAction(it); onClose(); }}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${active===idx ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
            >
              <span className={`mono text-[10px] tracking-widest w-12 ${it.kind==='action' ? 'text-wine-700' : 'text-stone-400'}`}>
                {it.kind === 'action' ? 'CMD' : 'VIN'}
              </span>
              <span className={`flex-1 ${it.kind==='wine' ? 'serif-it text-stone-900' : 'text-stone-800'}`}>{it.label}</span>
              {it.region && <span className="text-[12px] text-stone-500">{it.region}</span>}
              {it.hint && <Kbd>{it.hint}</Kbd>}
            </button>
          ))}
        </div>
        <div className="px-4 h-9 border-t border-stone-200 bg-stone-50/50 flex items-center justify-between mono text-[10px] text-stone-500 tracking-widest">
          <span>↑↓ NAVIGUER · ↵ SÉLECTIONNER</span>
          <span>{items.length} RÉSULTATS</span>
        </div>
      </motion.div>
    </div>
  );
}

window.CommandPalette = CommandPalette;
