// Cockpit Cave — unified page with 3 sub-tabs: Liste / Plan / Insights.
// Default tab is liste (the table). Plan embeds the visual rack view
// (CockpitPlan content). Insights tab links to the dedicated /insights
// page (which has the Gantt + composition + budget).

import React, { useMemo, useState, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, MoreHorizontal, List, Map, TrendingUp, Columns3 } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useTastingNotes } from '../hooks/useTastingNotes';
import { getPeakWindow } from '../utils/peakWindow';
import { Card, Badge, MonoLabel, Button, Tabs, EmptyState, Modal } from '../components/cockpit/primitives';
import { WineComparison } from '../components/cockpit/WineComparison';
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
  const [comparing, setComparing] = useState(false);

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
        className="mono text-[10px] tracking-widest text-stone-500 hover:text-stone-900 inline-flex items-center gap-1"
      >
        {children}
        {sort.key === k && <span className="text-wine-700">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <header className="px-4 md:px-5 py-4 border-b border-stone-200 flex flex-wrap items-center gap-3 bg-stone-50/40">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer… (nom, producteur, région, millésime)"
          aria-label="Filtrer la cave"
          className="h-10 md:h-9 px-3 rounded-md border border-stone-300 bg-white text-sm w-full md:w-72 outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600"
        />
        <select
          value={filterColor}
          onChange={e => setFilterColor(e.target.value as any)}
          aria-label="Couleur"
          className="h-10 md:h-9 rounded-md border border-stone-300 bg-white text-sm px-2 text-stone-700"
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
          aria-label="Région"
          className="h-10 md:h-9 rounded-md border border-stone-300 bg-white text-sm px-2 text-stone-700 max-w-[180px]"
        >
          {regions.map(r => <option key={r} value={r}>{r === 'all' ? 'Toutes régions' : r}</option>)}
        </select>
        <div className="flex-1" />
        <span className="mono text-[10px] tracking-widest text-stone-500">{filtered.length} / {inStock.length}</span>
        <Link to="/add-wine">
          <Button size="sm"><Plus className="w-3.5 h-3.5" />Ajouter</Button>
        </Link>
      </header>

      {/* Barre de sélection : comparer 2 ou 3 vins */}
      {selected.size > 0 && (
        <div className="bg-stone-900 text-white px-4 md:px-5 min-h-12 py-2 flex items-center gap-3 fixed md:static inset-x-0 bottom-16 z-40 shadow-lg md:shadow-none">
          <span className="mono text-[11px] tracking-widest">{selected.size} SÉLECTIONNÉ{selected.size > 1 ? 'S' : ''}</span>
          <button onClick={() => setSelected(new Set())} className="mono text-[10px] tracking-widest text-stone-400 hover:text-white py-2">
            EFFACER
          </button>
          <div className="flex-1" />
          {selected.size > 3 && <span className="hidden sm:inline text-xs text-stone-400">3 vins maximum pour comparer</span>}
          <button
            onClick={() => setComparing(true)}
            disabled={selected.size < 2 || selected.size > 3}
            title={selected.size < 2 ? 'Sélectionne 2 ou 3 vins' : selected.size > 3 ? '3 vins maximum' : undefined}
            className="h-9 px-3 rounded-md bg-white text-stone-900 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Columns3 className="w-3.5 h-3.5" />Comparer
          </button>
        </div>
      )}

      <Modal
        open={comparing}
        onClose={() => setComparing(false)}
        title="Comparer"
        subtitle={`${selected.size} vins côte à côte`}
        size="lg"
      >
        <WineComparison wines={wines.filter(w => selected.has(w.id))} />
      </Modal>

      {/* Table */}
      {loading ? (
        <div className="px-5 py-8 text-sm text-stone-500 italic">Chargement de la cave…</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Aucun vin ne correspond." hint="Ajuster les filtres" />
      ) : (
        <>
        {/* Mobile : cartes */}
        <ul className="md:hidden divide-y divide-stone-100">
          {filtered.map(w => {
            const days = peakDays(w);
            const rating = ratings[w.id];
            return (
              <li key={w.id} className={`flex items-center ${selected.has(w.id) ? 'bg-wine-50/40' : ''}`}>
                <label className="pl-4 pr-1 self-stretch flex items-center">
                  <input
                    type="checkbox"
                    checked={selected.has(w.id)}
                    onChange={() => toggleOne(w.id)}
                    aria-label={`Sélectionner ${w.name}`}
                    className="w-5 h-5 accent-wine-700"
                  />
                </label>
                <Link to={`/wine/${w.id}`} className="flex-1 min-w-0 flex items-center gap-3 pl-2 pr-4 py-3 active:bg-stone-50">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorDot(w.type)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="serif-it text-stone-900 truncate">{w.name}</div>
                    <div className="mono text-[10px] tracking-widest text-stone-500 uppercase truncate">
                      {[w.producer, w.vintage, w.region].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="mono text-xs text-stone-700">×{w.inventoryCount}</span>
                    <div className="flex items-center gap-1.5">
                      {rating ? <span className="serif text-xs text-wine-700">{rating.toFixed(1)}</span> : null}
                      <Badge tone={peakTone(days)}>
                        {days < 0 ? 'PASSÉ' : days < 365 ? `${days} J` : `${Math.round(days / 365)} A`}
                      </Badge>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Espace pour la barre de sélection fixe (mobile) */}
        {selected.size > 0 && <div className="h-16 md:hidden" aria-hidden="true" />}

        {/* Desktop : tableau */}
        <table className="hidden md:table w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="w-10 px-5 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Tout sélectionner" className="accent-wine-700" />
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
                  className={`border-b border-stone-100 group ${isSelected ? 'bg-wine-50/40' : 'hover:bg-stone-50'}`}
                >
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(w.id)}
                      aria-label={`Sélectionner ${w.name}`}
                      className="accent-wine-700"
                    />
                  </td>
                  <td className="py-2.5">
                    <Link to={`/wine/${w.id}`} className="flex items-center gap-2 group">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorDot(w.type)}`} />
                      <span className="serif-it text-stone-900 group-hover:text-wine-700 truncate">{w.name}</span>
                    </Link>
                  </td>
                  <td className="text-stone-700 text-xs">{w.region}</td>
                  <td className="mono text-stone-500 text-xs">{w.vintage || '—'}</td>
                  <td className="mono text-stone-500 text-xs">{formatLoc(w)}</td>
                  <td className="mono text-stone-700 text-xs">×{w.inventoryCount}</td>
                  <td>
                    <Badge tone={peakTone(days)}>
                      {days < 0 ? 'PASSÉ' : days < 365 ? `${days} J` : `${Math.round(days / 365)} A`}
                    </Badge>
                  </td>
                  <td className="text-xs">
                    {rating ? (
                      <span className="serif text-wine-700 font-medium">{rating.toFixed(1)}</span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="text-right px-5">
                    <Link to={`/wine/${w.id}`} aria-label={`Fiche de ${w.name}`} className="text-stone-400 hover:text-wine-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                      <MoreHorizontal className="w-4 h-4 inline" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>
      )}

      <div className="px-5 py-2 border-t border-stone-200 mono text-[10px] text-stone-500 flex justify-between bg-stone-50/40">
        <span>{filtered.length} affichés</span>
        <span>TOTAL : {inStock.reduce((a, w) => a + w.inventoryCount, 0)} BTL</span>
      </div>
    </Card>
  );
};

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
          <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">
            {titles[tab]}
          </h1>
          <div className="text-[12px] text-stone-500 mt-0.5">
            {inStock.length} vins en stock · {total} bouteilles
          </div>
        </div>
        <Tabs<Tab>
          aria-label="Vue de la cave"
          value={tab}
          onChange={switchTab}
          items={[
            { key: 'liste', label: 'Liste', icon: List },
            { key: 'plan', label: 'Plan', icon: Map },
            { key: 'insights', label: 'Insights', icon: TrendingUp },
          ]}
        />
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
