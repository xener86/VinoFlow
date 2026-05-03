// Urgent table: optimistic "j'ai bu" with Sonner-style undo, sortable columns
function urgencyTone(d) {
  if (d <= 30) return 'urgent';
  if (d <= 60) return 'warning';
  return 'neutral';
}

function UrgentTable() {
  const [rows, setRows] = React.useState(window.SEED.urgent);
  const [sort, setSort] = React.useState({ key:'daysToPeak', dir:'asc' });
  const toast = useToast();

  const sorted = React.useMemo(() => {
    const arr = [...rows];
    arr.sort((a,b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === 'number') return sort.dir==='asc' ? va-vb : vb-va;
      return sort.dir==='asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [rows, sort]);

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir==='asc' ? 'desc' : 'asc' } : { key, dir:'asc' });
  };

  const drink = (row) => {
    const prev = rows;
    // optimistic
    setRows(rs => rs.filter(r => r.id !== row.id));
    toast.show({
      title: `« ${row.name} » consommé`,
      message: 'Retiré de la cave · ajouté au journal',
      duration: 8000,
      action: { label: 'ANNULER', onClick: () => setRows(prev) },
    });
  };

  const Header = ({ k, children, className='' }) => (
    <th className={`text-left font-normal py-2 ${className}`}>
      <button onClick={() => toggleSort(k)} className="mono text-[10px] tracking-widest text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
        {children}
        {sort.key === k && <span className="text-wine-700">{sort.dir==='asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  const urgentCount = rows.filter(r => r.daysToPeak <= 30).length;

  return (
    <Card className="col-span-8 overflow-hidden">
      <header className="px-5 py-3 border-b border-stone-200 flex items-center justify-between bg-stone-50/40">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 mono text-[10px] tracking-widest text-wine-700 font-medium">
            <PulseDot/>{urgentCount} URGENTS
          </span>
          <span className="mono text-[10px] text-stone-500 tracking-widest">· {rows.length} EN FIN DE FENÊTRE</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="mono text-[10px] tracking-widest">INSIGHTS →</Button>
        </div>
      </header>
      <div className="px-5 pt-4 pb-2"><h3 className="serif-it text-xl text-stone-900">Avant qu'ils ne passent leur pic</h3></div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200">
            <Header k="name" className="px-5">VIN</Header>
            <Header k="region">RÉGION</Header>
            <Header k="vintage">VTG</Header>
            <Header k="loc">LOC</Header>
            <Header k="daysToPeak">PIC</Header>
            <Header k="score">NOTE</Header>
            <th className="py-2 px-5"></th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {sorted.map(r => (
              <motion.tr
                key={r.id}
                layout
                initial={{ opacity:0 }}
                animate={{ opacity:1 }}
                exit={{ opacity:0, height:0, x:-20, transition:{ duration:0.2 } }}
                className="border-b border-stone-100 hover:bg-stone-50 group"
              >
                <td className="px-5 py-2.5"><span className="serif-it text-stone-900">{r.name}</span></td>
                <td className="text-stone-700">{r.region}</td>
                <td className="mono text-stone-500">{r.vintage}</td>
                <td className="mono text-stone-500">{r.loc}</td>
                <td><Badge tone={urgencyTone(r.daysToPeak)}>{r.daysToPeak} J</Badge></td>
                <td className="text-stone-700">{r.score ?? '—'}</td>
                <td className="text-right px-5">
                  <button onClick={() => drink(r)} className="mono text-[10px] tracking-widest text-stone-400 hover:text-wine-700 opacity-0 group-hover:opacity-100 transition-opacity">J'AI BU →</button>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="px-5 py-10 text-center">
          <div className="serif-it text-stone-500 text-base">Plus rien d'urgent.</div>
          <div className="mono text-[10px] text-stone-400 tracking-widest mt-2">CAVE EN PAIX</div>
        </div>
      )}
      <div className="px-5 py-2 border-t border-stone-200 mono text-[10px] text-stone-500 flex justify-between bg-stone-50/40">
        <span>{rows.length} affichés</span>
        <a className="hover:text-wine-700 cursor-pointer">VOIR TOUS →</a>
      </div>
    </Card>
  );
}

window.UrgentTable = UrgentTable;
