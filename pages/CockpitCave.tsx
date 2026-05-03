// Cockpit Cave — unified page with 3 sub-tabs: Liste / Plan / Insights.
// Default tab is liste (the table). Plan embeds the visual rack view
// (CockpitPlan content). Insights tab links to the dedicated /insights
// page (which has the Gantt + composition + budget).

import React, { useMemo, useState, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, MoreHorizontal, List, Map, TrendingUp } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useTastingNotes } from '../hooks/useTastingNotes';
import { getPeakWindow } from '../utils/peakWindow';
import { Card, Badge, MonoLabel, Button } from '../components/cockpit/primitives';
import { CellarWine } from '../types';

const CockpitPlan = lazy(() => import('./CockpitPlan').then(m => ({ default: m.CockpitPlan })));
const CockpitInsights = lazy(() => import('./CockpitInsights').then(m => ({ default: m.CockpitInsights })));

type Tab = 'liste' | 'plan' | 'insights';
type SortKey = 'name' | 'region' | 'vintage' | 'qty' | 'peak' | 'rating';

const NOW_YEAR = new Date().getFullYear();

const peakDays = (wine: CellarWine): number => {
  const pw = getPeakWindow(wine);
  const yearsDiff = pw.peakEnd - NOW_YEAR;
  return Math.round(yearsDiff * 365);
};

const peakTone = (days: number): 'urgent' | 'warning' | 'neutral' => {
  if (days <= 30) return 'urgent';
  if (days <= 365) return 'warning';
  return 'neutral';
};

const colorDot = (type: string): string => {
  switch (type) {
    case 'RED': return 'bg-wine-700';
    case 'WHITE': return 'bg-amber-300';
    case 'ROSE': return 'bg-pink-400';
    case 'SPARKLING': return 'bg-cyan-400';
    case 'DESSERT': return 'bg-amber-500';
    case 'FORTIFIED': return 'bg-orange-700';
    default: return 'bg-stone-400';
  }
};

const formatLoc = (wine: CellarWine): string => {
  const b = wine.bottles?.[0];
  if (!b) return '—';
  if (typeof b.location === 'string') return b.location.length > 12 ? b.location.slice(0, 12) + '…' : b.location;
  return `${b.location.rackId.slice(0, 4)}…`;
};

// ────────────────────────────────────────────
// CaveList — table view (the previous CockpitCave content)
// ────────────────────────────────────────────
const CaveList: React.FC = () => {
  const { wines, loading } = useWines();
  const { notes: allNotes } = useTastingNotes();
  const [search, setSearch] = useState('');
  const [filterColor, setFilterColor] = useState<'all' | 'RED' | 'WHITE' | 'ROSE' | 'SPARKLING'>('all');
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const inStock = wines.filter(w => (w.inventoryCount || 0) > 0);

  const regions = useMemo(() => {
    const set = new Set(inStock.map(w => w.region).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [inStock]);

  // Average rating per wine (over all tasting notes)
  const ratings = useMemo(() => {
    const map: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const note of allNotes) {
      if (typeof note.rating !== 'number') continue;
      map[note.wineId] = (map[note.wineId] || 0) + note.rating;
      counts[note.wineId] = (counts[note.wineId] || 0) + 1;
    }
    const avgs: Record<string, number> = {};
    for (const id of Object.keys(map)) {
      avgs[id] = map[id] / counts[id];
    }
    return avgs;
  }, [allNotes]);

  const filtered = useMemo(() => {
    let arr = [...inStock];
    if (filterColor !== 'all') arr = arr.filter(w => w.type === filterColor);
    if (filterRegion !== 'all') arr = arr.filter(w => w.region === filterRegion);
    if (search.trim()) {
      const lo = search.toLowerCase();
      arr = arr.filter(w =>
        (w.name || '').toLowerCase().includes(lo) ||
        (w.producer || '').toLowerCase().includes(lo) ||
        (w.region || '').toLowerCase().includes(lo) ||
        (w.vintage != null && String(w.vintage).includes(lo))
      );
    }
    arr.sort((a, b) => {
      let va: any, vb: any;
      switch (sort.key) {
        case 'name':    va = a.name; vb = b.name; break;
        case 'region':  va = a.region || ''; vb = b.region || ''; break;
        case 'vintage': va = a.vintage || 0; vb = b.vintage || 0; break;
        case 'qty':     va = a.inventoryCount; vb = b.inventoryCount; break;
        case 'peak':    va = peakDays(a); vb = peakDays(b); break;
        case 'rating':  va = ratings[a.id] || 0; vb = ratings[b.id] || 0; break;
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return sort.dir === 'asc' ? va - vb : vb - va;
      }
      return sort.dir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [inStock, search, filterColor, filterRegion, sort, ratings]);

  const allSelected = filtered.length > 0 && filtered.every(w => selected.has(w.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(w => w.id)));
  };
  const toggleOne = (id: string) => {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const HeaderBtn: React.FC<{ k: SortKey; children: React.ReactNode }> = ({ k, children }) => (
    <th className="text-left font-normal py-2">
      <button
        onClick={() => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })}
        className="mono text-[10px] tracking-widest text-stone-500 hover:text-stone-900 dark:hover:text-white inline-flex items-center gap-1"
      >
        {children}
        {sort.key === k && <span className="text-wine-700">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-3 bg-stone-50/40 dark:bg-stone-950/40">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer… (nom, producteur, région, millésime)"
          className="h-9 px-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm w-72 outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600 dark:text-stone-200"
        />
        <select
          value={filterColor}
          onChange={e => setFilterColor(e.target.value as any)}
          className="h-9 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm px-2 text-stone-700 dark:text-stone-300"
        >
          <option value="all">Toutes couleurs</option>
          <option value="RED">Rouge</option>
          <option value="WHITE">Blanc</option>
          <option value="ROSE">Rosé</option>
          <option value="SPARKLING">Bulles</option>
        </select>
        <select
          value={filterRegion}
          onChange={e => setFilterRegion(e.target.value)}
          className="h-9 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm px-2 text-stone-700 dark:text-stone-300 max-w-[180px]"
        >
          {regions.map(r => <option key={r} value={r}>{r === 'all' ? 'Toutes régions' : r}</option>)}
        </select>
        <div className="flex-1" />
        <span className="mono text-[10px] tracking-widest text-stone-500">{filtered.length} / {inStock.length}</span>
        <Link to="/add-wine">
          <Button size="sm"><Plus className="w-3.5 h-3.5" />Ajouter</Button>
        </Link>
      </header>

      {/* Bulk actions strip */}
      {selected.size > 0 && (
        <div className="bg-stone-900 dark:bg-stone-950 text-white px-5 h-12 flex items-center gap-3">
          <span className="mono text-[11px] tracking-widest">{selected.size} SÉLECTIONNÉ{selected.size > 1 ? 'S' : ''}</span>
          <button onClick={() => setSelected(new Set())} className="mono text-[10px] tracking-widest text-stone-400 hover:text-white">
            DÉSÉLECTIONNER
          </button>
          <div className="flex-1" />
          <span className="text-xs text-stone-500 italic">Actions bulk — bientôt</span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="px-5 py-8 text-sm text-stone-500 italic">Chargement de la cave…</div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-8 text-sm text-stone-500 italic">Aucun vin trouvé.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-800">
              <th className="w-10 px-5 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-wine-700" />
              </th>
              <HeaderBtn k="name">VIN</HeaderBtn>
              <HeaderBtn k="region">RÉGION</HeaderBtn>
              <HeaderBtn k="vintage">VTG</HeaderBtn>
              <th className="text-left font-normal py-2 mono text-[10px] tracking-widest text-stone-500">LOC</th>
              <HeaderBtn k="qty">QTÉ</HeaderBtn>
              <HeaderBtn k="peak">PIC</HeaderBtn>
              <HeaderBtn k="rating">NOTE</HeaderBtn>
              <th className="px-5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(w => {
              const days = peakDays(w);
              const isSelected = selected.has(w.id);
              const rating = ratings[w.id];
              return (
                <tr
                  key={w.id}
                  className={`border-b border-stone-100 dark:border-stone-800/50 group ${isSelected ? 'bg-wine-50/40 dark:bg-wine-900/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/30'}`}
                >
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(w.id)}
                      className="accent-wine-700"
                    />
                  </td>
                  <td className="py-2.5">
                    <Link to={`/wine/${w.id}`} className="flex items-center gap-2 group">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorDot(w.type)}`} />
                      <span className="serif-it text-stone-900 dark:text-white group-hover:text-wine-700 truncate">{w.name}</span>
                    </Link>
                  </td>
                  <td className="text-stone-700 dark:text-stone-400 text-xs">{w.region}</td>
                  <td className="mono text-stone-500 text-xs">{w.vintage || '—'}</td>
                  <td className="mono text-stone-500 text-xs">{formatLoc(w)}</td>
                  <td className="mono text-stone-700 dark:text-stone-300 text-xs">×{w.inventoryCount}</td>
                  <td>
                    <Badge tone={peakTone(days)}>
                      {days < 0 ? 'PASSÉ' : days < 365 ? `${days} J` : `${Math.round(days / 365)} A`}
                    </Badge>
                  </td>
                  <td className="text-xs">
                    {rating ? (
                      <span className="serif text-wine-700 dark:text-wine-500 font-medium">{rating.toFixed(1)}</span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="text-right px-5">
                    <Link to={`/wine/${w.id}`} className="text-stone-400 hover:text-wine-700 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="w-4 h-4 inline" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="px-5 py-2 border-t border-stone-200 dark:border-stone-800 mono text-[10px] text-stone-500 flex justify-between bg-stone-50/40 dark:bg-stone-950/40">
        <span>{filtered.length} affichés</span>
        <span>TOTAL : {inStock.reduce((a, w) => a + w.inventoryCount, 0)} BTL</span>
      </div>
    </Card>
  );
};

// ────────────────────────────────────────────
// Tab switcher
// ────────────────────────────────────────────
const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.FC<any>; children: React.ReactNode }> = ({ active, onClick, icon: Icon, children }) => (
  <button
    onClick={onClick}
    className={`px-4 h-9 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
      active
        ? 'bg-white dark:bg-stone-900 shadow-sm text-stone-900 dark:text-white'
        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
    }`}
  >
    <Icon className="w-3.5 h-3.5" />
    {children}
  </button>
);

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────
export const CockpitCave: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam === 'plan' || tabParam === 'insights' ? tabParam : 'liste');

  const switchTab = (t: Tab) => {
    setTab(t);
    setSearchParams(t === 'liste' ? {} : { tab: t });
  };

  const { wines } = useWines();
  const inStock = wines.filter(w => (w.inventoryCount || 0) > 0);
  const total = inStock.reduce((s, w) => s + w.inventoryCount, 0);

  const titles: Record<Tab, string> = {
    liste: 'Cave · Liste',
    plan: 'Cave · Plan',
    insights: 'Cave · Insights',
  };

  return (
    <div>
      {/* Header avec tabs */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <MonoLabel>VINOFLOW · INVENTAIRE</MonoLabel>
          <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">
            {titles[tab]}
          </h1>
          <div className="text-[12px] text-stone-500 mt-0.5">
            {inStock.length} vins en stock · {total} bouteilles
          </div>
        </div>
        <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-md">
          <TabButton active={tab === 'liste'} onClick={() => switchTab('liste')} icon={List}>Liste</TabButton>
          <TabButton active={tab === 'plan'} onClick={() => switchTab('plan')} icon={Map}>Plan</TabButton>
          <TabButton active={tab === 'insights'} onClick={() => switchTab('insights')} icon={TrendingUp}>Insights</TabButton>
        </div>
      </div>

      {tab === 'liste' && <CaveList />}
      {tab === 'plan' && (
        <Suspense fallback={<div className="text-stone-500 italic py-8 text-center">Chargement du plan…</div>}>
          <CockpitPlan embedded />
        </Suspense>
      )}
      {tab === 'insights' && (
        <Suspense fallback={<div className="text-stone-500 italic py-8 text-center">Chargement des insights…</div>}>
          <CockpitInsights embedded />
        </Suspense>
      )}
    </div>
  );
};
