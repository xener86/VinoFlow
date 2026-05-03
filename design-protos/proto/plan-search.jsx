// Compact search-and-locate strip — used on the Plan tab.
// Search → max ~4 result rows visible → click row to focus the slot in the map.

function PlanSearch({ rows, focusedId, onFocus }) {
  const [q, setQ] = React.useState('');
  const [color, setColor] = React.useState('all');
  const [region, setRegion] = React.useState('all');

  const regions = React.useMemo(() => ['all', ...new Set(rows.map(r => r.region))], [rows]);

  const results = React.useMemo(() => {
    let arr = rows;
    if (color !== 'all') arr = arr.filter(r => r.color === color);
    if (region !== 'all') arr = arr.filter(r => r.region === region);
    if (q.trim()) {
      const lo = q.toLowerCase();
      arr = arr.filter(r =>
        r.name.toLowerCase().includes(lo) ||
        r.region.toLowerCase().includes(lo) ||
        String(r.vintage).includes(lo) ||
        (r.loc || '').toLowerCase().includes(lo)
      );
    }
    return arr;
  }, [rows, q, color, region]);

  const colorDot = (c) => c==='rouge' ? 'bg-wine-700' : 'bg-amber-200';
  const peakTone = (d) => d <= 30 ? 'urgent' : d <= 90 ? 'warning' : 'neutral';

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      <header className="px-5 py-3.5 border-b border-stone-200 flex items-center gap-3 bg-stone-50/40">
        <div className="flex-1 flex items-center gap-2">
          <span className="mono text-[10px] tracking-widest text-stone-500 shrink-0">⌕ LOCALISER</span>
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="Nom, région, millésime, casier (ex. C5)…"
            className="flex-1 h-9 px-3 rounded-md border border-stone-300 bg-white text-sm outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600"
            autoFocus
          />
        </div>
        <select value={color} onChange={e=>setColor(e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white text-sm px-2 text-stone-700">
          <option value="all">Toutes couleurs</option><option value="rouge">Rouge</option><option value="blanc">Blanc</option>
        </select>
        <select value={region} onChange={e=>setRegion(e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white text-sm px-2 text-stone-700">
          {regions.map(r => <option key={r} value={r}>{r==='all' ? 'Toutes régions' : r}</option>)}
        </select>
        <span className="mono text-[10px] tracking-widest text-stone-500">{results.length} RÉSULTATS</span>
      </header>

      {/* compact result list — max ~4 rows visible, scroll for the rest */}
      <div className="max-h-[176px] overflow-y-auto">
        {results.length === 0 ? (
          <div className="px-5 py-6 text-center mono text-[11px] tracking-widest text-stone-400">AUCUN RÉSULTAT</div>
        ) : results.map(r => {
          const isFocused = focusedId === r.id;
          return (
            <button
              key={r.id}
              onClick={() => onFocus?.(r.id)}
              className={`w-full text-left px-5 h-11 flex items-center gap-3 border-b border-stone-100 last:border-b-0 transition ${isFocused ? 'bg-wine-50' : 'hover:bg-stone-50'}`}
            >
              <span className={`w-2 h-2 rounded-full ${colorDot(r.color)} shrink-0`}/>
              <span className="serif-it text-stone-900 truncate flex-1">{r.name}</span>
              <span className="mono text-[10px] text-stone-500 w-20 text-right">{r.region}</span>
              <span className="mono text-[10px] text-stone-500 w-12 text-right">{r.vintage}</span>
              <span className="mono text-[10px] tracking-widest text-stone-700 w-16 text-right">{r.loc}</span>
              <span className="mono text-[10px] tracking-widest w-10 text-right">×{r.qty}</span>
              {r.peak == null ? (
                <Badge tone="neutral">—</Badge>
              ) : (
                <Badge tone={peakTone(r.peak)}>{r.peak < 365 ? `${r.peak} J` : `${Math.round(r.peak/365)} A`}</Badge>
              )}
              <span className="mono text-[10px] tracking-widest text-wine-700 shrink-0">VOIR →</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

window.PlanSearch = PlanSearch;
