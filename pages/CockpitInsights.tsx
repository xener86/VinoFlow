// Cockpit Insights — temporal view of the cellar.
// 3 lenses: Garde (Gantt timeline), Inventaire (composition), Achats (spend / suggestions).

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWines } from '../hooks/useWines';
import { getPeakWindow } from '../utils/peakWindow';
import { MonoLabel, Card, Badge } from '../components/cockpit/primitives';
import { CellarWine } from '../types';

type Lens = 'GARDE' | 'INVENTAIRE' | 'ACHATS';

const NOW_YEAR = new Date().getFullYear();
const HORIZON_END = NOW_YEAR + 16;

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────
interface CockpitInsightsProps {
  embedded?: boolean;
}

export const CockpitInsights: React.FC<CockpitInsightsProps> = ({ embedded = false }) => {
  const [lens, setLens] = useState<Lens>('GARDE');

  return (
    <div>
      {!embedded && (
        <div className="mb-5">
          <MonoLabel>VINOFLOW · ANALYSE</MonoLabel>
          <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Insights</h1>
          <div className="text-[12px] text-stone-500 mt-0.5">Vue temporelle de ta cave — fenêtres, composition, achats.</div>
        </div>
      )}

      {/* Lens switcher */}
      <div className="inline-flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-md mb-5">
        <LensButton active={lens === 'GARDE'} onClick={() => setLens('GARDE')}>Garde</LensButton>
        <LensButton active={lens === 'INVENTAIRE'} onClick={() => setLens('INVENTAIRE')}>Inventaire</LensButton>
        <LensButton active={lens === 'ACHATS'} onClick={() => setLens('ACHATS')}>Achats</LensButton>
      </div>

      {lens === 'GARDE' && <GardeTimeline />}
      {lens === 'INVENTAIRE' && <InventoryView />}
      {lens === 'ACHATS' && <AchatsView />}
    </div>
  );
};

const LensButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
      active
        ? 'bg-wine-700 text-white shadow-sm'
        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
    }`}
  >
    {children}
  </button>
);

// ────────────────────────────────────────────
// Lens 1 — Garde (Gantt timeline)
// ────────────────────────────────────────────
const GardeTimeline: React.FC = () => {
  const { wines, loading } = useWines();
  const [hover, setHover] = useState<string | null>(null);
  const [filterColor, setFilterColor] = useState<'all' | 'RED' | 'WHITE' | 'OTHER'>('all');
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'peak' | 'start' | 'name'>('peak');

  const inStock = wines.filter(w => (w.inventoryCount || 0) > 0 && w.vintage);

  const enriched = useMemo(() => {
    return inStock.map(w => {
      const pw = getPeakWindow(w);
      const start = w.vintage; // approximate rise start
      return {
        wine: w,
        start: start || pw.peakStart - 5,
        peak: pw.peakStart,
        end: pw.peakEnd + 3, // graceful decline
        color: w.type === 'RED' ? 'rouge' : w.type === 'WHITE' ? 'blanc' : 'autre',
      };
    });
  }, [inStock]);

  const regions = useMemo(() => ['all', ...Array.from(new Set(inStock.map(w => w.region).filter(Boolean)))].sort() as string[], [inStock]);

  const filtered = useMemo(() => {
    let arr = [...enriched];
    if (filterColor !== 'all') {
      arr = arr.filter(e => filterColor === 'OTHER' ? !['RED', 'WHITE'].includes(e.wine.type) : e.wine.type === filterColor);
    }
    if (filterRegion !== 'all') {
      arr = arr.filter(e => e.wine.region === filterRegion);
    }
    if (sortMode === 'peak') arr.sort((a, b) => a.peak - b.peak);
    if (sortMode === 'start') arr.sort((a, b) => a.start - b.start);
    if (sortMode === 'name') arr.sort((a, b) => a.wine.name.localeCompare(b.wine.name));
    return arr;
  }, [enriched, filterColor, filterRegion, sortMode]);

  const horizonStart = NOW_YEAR;
  // Compute horizon end dynamically based on the data, capped at HORIZON_END
  const dataMaxEnd = enriched.reduce((m, e) => Math.max(m, e.end), NOW_YEAR + 5);
  const horizonEnd = Math.min(dataMaxEnd + 1, HORIZON_END);
  const range = horizonEnd - horizonStart;
  const yearToPct = (y: number) => ((y - horizonStart) / range) * 100;
  const nowPct = yearToPct(NOW_YEAR);

  const yearLabels: number[] = [];
  for (let y = horizonStart; y <= horizonEnd; y += 2) yearLabels.push(y);

  const inPeakNow = enriched.filter(e => NOW_YEAR >= e.peak - 1 && NOW_YEAR <= e.peak + 1).length;
  const inWindow = enriched.filter(e => NOW_YEAR >= e.start && NOW_YEAR <= e.end).length;
  const tooYoung = enriched.filter(e => NOW_YEAR < e.start).length;
  const farthestEnd = enriched.reduce((max, e) => e.end > max.end ? e : max, enriched[0]);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBlock label="EN PIC ACTUEL" value={inPeakNow} unit="vins" tone="warning" />
        <KpiBlock label="DANS LA FENÊTRE" value={inWindow} unit="vins" />
        <KpiBlock label="ENCORE TROP JEUNES" value={tooYoung} unit="vins" />
        <KpiBlock label="HORIZON LE + LOIN" value={farthestEnd?.end ?? '—'} unit={farthestEnd?.wine.name.toLowerCase().slice(0, 12) || ''} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <FilterPills label="COULEUR" value={filterColor} onChange={(v: any) => setFilterColor(v)} options={[['all', 'Toutes'], ['RED', 'Rouge'], ['WHITE', 'Blanc'], ['OTHER', 'Autres']]} />
        <div className="flex items-center gap-1.5">
          <span className="mono text-[10px] tracking-widest text-stone-500">RÉGION</span>
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="h-7 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-[12px] px-2 text-stone-700 dark:text-stone-300"
          >
            {regions.map(r => <option key={r} value={r}>{r === 'all' ? 'Toutes régions' : r}</option>)}
          </select>
        </div>
        <FilterPills label="TRI" value={sortMode} onChange={(v: any) => setSortMode(v)} options={[['peak', 'Pic'], ['start', 'Entrée'], ['name', 'Nom']]} />
        <div className="flex-1" />
        <span className="mono text-[10px] tracking-widest text-stone-500">{filtered.length} VINS · {filtered.reduce((a, e) => a + (e.wine.inventoryCount || 0), 0)} BTL</span>
      </div>

      {/* Timeline */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/40 flex items-center justify-between">
          <MonoLabel>◌ FENÊTRES DE GARDE · {horizonStart}–{horizonEnd}</MonoLabel>
          <span className="mono text-[10px] tracking-widest text-stone-500 hidden md:block">▌ ZONE CLAIRE = MONTÉE · ▌ FONCÉE = PIC · ▌ DÉLAVÉ = DESCENTE</span>
        </div>

        {/* Year ruler */}
        <div className="relative px-5 pt-3 pb-2 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <div className="relative h-5 ml-44">
            {yearLabels.map(y => (
              <span key={y} className="absolute mono text-[10px] text-stone-500" style={{ left: `${yearToPct(y)}%`, transform: 'translateX(-50%)' }}>
                {y}
              </span>
            ))}
            <div className="absolute top-5 w-0.5 h-2 bg-wine-700" style={{ left: `${nowPct}%` }} />
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {loading ? (
            <div className="px-5 py-8 text-sm text-stone-500 italic">Chargement de la cave…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8 text-sm text-stone-500 italic">Aucun vin avec ces filtres.</div>
          ) : (
            filtered.map((e) => (
              <GanttRow
                key={e.wine.id}
                entry={e}
                yearToPct={yearToPct}
                isHovered={hover === e.wine.id}
                onHover={() => setHover(e.wine.id)}
                onUnhover={() => setHover(null)}
              />
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/40 mono text-[10px] tracking-widest text-stone-500">
          Ligne verticale = aujourd'hui ({NOW_YEAR}) · zone foncée = pic ±1 an
        </div>
      </Card>
    </div>
  );
};

// ────────────────────────────────────────────
// Gantt row
// ────────────────────────────────────────────
const GanttRow: React.FC<{
  entry: { wine: CellarWine; start: number; peak: number; end: number; color: string };
  yearToPct: (y: number) => number;
  isHovered: boolean;
  onHover: () => void;
  onUnhover: () => void;
}> = ({ entry, yearToPct, isHovered, onHover, onUnhover }) => {
  const { wine, start, peak, end } = entry;
  const startPct = Math.max(0, yearToPct(start));
  const peakPct = yearToPct(peak);
  const endPct = Math.min(100, yearToPct(end));
  const inPeak = NOW_YEAR >= peak - 1 && NOW_YEAR <= peak + 1;
  const isYoung = NOW_YEAR < start;
  const isOld = NOW_YEAR > end;

  const colorBg = wine.type === 'RED' ? 'bg-wine-700' : wine.type === 'WHITE' ? 'bg-amber-300' : 'bg-pink-400';
  const colorBgLight = wine.type === 'RED' ? 'bg-wine-200/70' : wine.type === 'WHITE' ? 'bg-amber-100' : 'bg-pink-100';

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onUnhover}
      className={`px-5 py-3 border-b border-stone-100 dark:border-stone-800/50 last:border-b-0 grid items-center transition ${isHovered ? 'bg-stone-50 dark:bg-stone-800/30' : ''}`}
      style={{ gridTemplateColumns: '176px 1fr' }}
    >
      <Link to={`/wine/${wine.id}`} className="pr-3 group">
        <div className="serif-it text-[13.5px] text-stone-900 dark:text-white leading-tight truncate group-hover:text-wine-700" title={wine.name}>
          {wine.name}
        </div>
        <div className="mono text-[10px] text-stone-500 mt-0.5 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${colorBg}`} />
          {wine.vintage} · {wine.region} · ×{wine.inventoryCount}
          {inPeak && <Badge tone="urgent" className="ml-1">PIC</Badge>}
          {isYoung && <Badge tone="neutral" className="ml-1">JEUNE</Badge>}
          {isOld && <Badge tone="warning" className="ml-1">DÉCLIN</Badge>}
        </div>
      </Link>

      <div className="relative h-6 ml-3">
        {/* Rise (start → peak) */}
        <div
          className={`absolute inset-y-1 rounded-l ${colorBgLight}`}
          style={{ left: `${startPct}%`, width: `${Math.max(0, peakPct - startPct)}%` }}
          title={`Montée ${start} → ${peak}`}
        />
        {/* Peak zone (1 yr each side) */}
        <div
          className={`absolute inset-y-0 rounded ${colorBg} shadow-sm`}
          style={{
            left: `${Math.max(0, yearToPct(peak - 1))}%`,
            width: `${Math.max(2, yearToPct(peak + 1) - yearToPct(peak - 1))}%`,
          }}
          title={`Pic ${peak}`}
        />
        {/* Fall (peak → end) */}
        <div
          className={`absolute inset-y-1 rounded-r ${colorBgLight} opacity-60`}
          style={{
            left: `${yearToPct(peak + 1)}%`,
            width: `${Math.max(0, endPct - yearToPct(peak + 1))}%`,
          }}
          title={`Descente ${peak} → ${end}`}
        />
        {/* Now line */}
        <div className="absolute top-0 bottom-0 w-px bg-wine-700/60" style={{ left: `${yearToPct(NOW_YEAR)}%` }} />
        {/* Hover tooltip */}
        {isHovered && (
          <div
            className="absolute -top-7 z-20 bg-stone-900 text-white text-[11px] px-2 py-1 rounded mono whitespace-nowrap"
            style={{ left: `${peakPct}%`, transform: 'translateX(-50%)' }}
          >
            Pic {peak} · fenêtre {start}–{end}
          </div>
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// KPI block
// ────────────────────────────────────────────
const KpiBlock: React.FC<{ label: string; value: number | string; unit?: string; tone?: 'warning' | 'neutral' }> = ({ label, value, unit, tone }) => (
  <div className={`rounded-md border ${tone === 'warning' ? 'border-wine-200 dark:border-wine-900/50 bg-wine-50/40 dark:bg-wine-900/10' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'} p-4`}>
    <MonoLabel>{label}</MonoLabel>
    <div className="flex items-baseline gap-1.5 mt-1">
      <span className="serif text-3xl text-stone-900 dark:text-white leading-none">{value}</span>
      {unit && <span className="text-xs text-stone-500">{unit}</span>}
    </div>
  </div>
);

// ────────────────────────────────────────────
// Filter pills
// ────────────────────────────────────────────
const FilterPills: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ label, value, onChange, options }) => (
  <div className="flex items-center gap-1.5">
    <span className="mono text-[10px] tracking-widest text-stone-500">{label}</span>
    <div className="flex bg-stone-100 dark:bg-stone-800 rounded p-0.5">
      {options.map(([k, lbl]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-2 py-1 rounded text-[12px] transition-colors ${
            value === k
              ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          }`}
        >
          {lbl}
        </button>
      ))}
    </div>
  </div>
);

// ────────────────────────────────────────────
// Lens 2 — Inventaire (composition)
// ────────────────────────────────────────────
const InventoryView: React.FC = () => {
  const { wines } = useWines();
  const inStock = wines.filter(w => (w.inventoryCount || 0) > 0);
  const total = inStock.reduce((s, w) => s + w.inventoryCount, 0);

  const byType = inStock.reduce((acc: Record<string, number>, w) => {
    acc[w.type] = (acc[w.type] || 0) + w.inventoryCount;
    return acc;
  }, {});

  const byRegion = inStock.reduce((acc: Record<string, number>, w) => {
    if (!w.region) return acc;
    acc[w.region] = (acc[w.region] || 0) + w.inventoryCount;
    return acc;
  }, {});
  const regionEntries = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const byVintage = inStock.reduce((acc: Record<number, number>, w) => {
    if (!w.vintage) return acc;
    acc[w.vintage] = (acc[w.vintage] || 0) + w.inventoryCount;
    return acc;
  }, {});
  const vintageEntries = Object.entries(byVintage).map(([y, c]) => ({ y: parseInt(y), c })).sort((a, b) => a.y - b.y);
  const vintageMax = Math.max(...vintageEntries.map(v => v.c), 1);

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 md:col-span-4 p-5">
        <MonoLabel>◌ COMPOSITION · COULEUR</MonoLabel>
        <div className="serif text-3xl text-stone-900 dark:text-white mt-1">{total}<span className="text-base text-stone-500"> btl</span></div>
        <div className="mt-4 space-y-2">
          {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
            const pct = (count / total) * 100;
            const color = type === 'RED' ? 'bg-wine-700' : type === 'WHITE' ? 'bg-amber-300' : type === 'ROSE' ? 'bg-pink-400' : type === 'SPARKLING' ? 'bg-cyan-400' : 'bg-stone-400';
            return (
              <div key={type}>
                <div className="flex items-center justify-between text-[12px] mb-0.5">
                  <span className="text-stone-700 dark:text-stone-300 capitalize">{type}</span>
                  <span className="mono text-stone-500">{count} · {Math.round(pct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="col-span-12 md:col-span-8 p-5">
        <MonoLabel>◌ COMPOSITION · RÉGION (TOP 12)</MonoLabel>
        <div className="mt-4 space-y-1.5">
          {regionEntries.map(([region, count]) => {
            const pct = (count / total) * 100;
            return (
              <div key={region} className="flex items-center gap-3 text-[13px]">
                <span className="w-32 truncate text-stone-700 dark:text-stone-300">{region}</span>
                <div className="flex-1 h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div className="h-full bg-wine-700" style={{ width: `${pct}%` }} />
                </div>
                <span className="mono text-[11px] text-stone-500 w-16 text-right">{count} · {Math.round(pct)}%</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="col-span-12 p-5">
        <MonoLabel>◌ COMPOSITION · MILLÉSIMES</MonoLabel>
        <div className="mt-4 flex items-end gap-1 h-32">
          {vintageEntries.map(({ y, c }) => (
            <div key={y} className="flex-1 flex flex-col items-center gap-1 group">
              <span className="mono text-[10px] text-stone-500 opacity-0 group-hover:opacity-100">{c}</span>
              <div className="w-full bg-wine-700 rounded-t" style={{ height: `${(c / vintageMax) * 100}%` }} />
              <span className="mono text-[9px] text-stone-500 -rotate-45 origin-top-left mt-1 whitespace-nowrap">{y}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ────────────────────────────────────────────
// Lens 3 — Achats (purchase suggestions + budget + drink-before)
// ────────────────────────────────────────────
const AchatsView: React.FC = () => {
  const [purchases, setPurchases] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const [drinkBefore, setDrinkBefore] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      import('../services/storageService').then(m => m.getPurchaseSuggestions().catch(() => null)),
      import('../services/storageService').then(m => m.getCellarBudget(12).catch(() => null)),
      import('../services/storageService').then(m => m.getDrinkBeforeAlerts(6).catch(() => null)),
    ]).then(([p, b, d]) => {
      setPurchases(p);
      setBudget(b);
      setDrinkBefore(d?.alerts || []);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-stone-500 italic py-8 text-center">Chargement…</div>;
  }

  const monthlyAvg = budget?.monthly_avg ?? 0;
  const totalSpent = budget?.total_spent ?? 0;
  const totalBottles = budget?.total_bottles ?? 0;
  const avgPrice = budget?.avg_price ?? 0;

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Budget KPIs */}
      <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBlock label="DÉPENSÉ 12M" value={totalSpent ? `${totalSpent.toLocaleString('fr-FR')}€` : '—'} unit="" />
        <KpiBlock label="MOYENNE / MOIS" value={monthlyAvg ? `${monthlyAvg.toLocaleString('fr-FR')}€` : '—'} unit="" />
        <KpiBlock label="BTL ACHETÉES" value={totalBottles} unit="bouteilles" />
        <KpiBlock label="PRIX MOYEN" value={avgPrice ? `${Math.round(avgPrice)}€` : '—'} unit="" />
      </div>

      {/* Suggestions d'achat */}
      <Card className="col-span-12 lg:col-span-7 p-5">
        <MonoLabel>◌ SUGGESTIONS D'ACHAT</MonoLabel>
        <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">À renouveler</h3>
        {purchases?.count > 0 ? (
          <ul className="space-y-2">
            {purchases.suggestions.map((s: any) => (
              <li key={s.type} className="flex items-center justify-between bg-stone-50 dark:bg-stone-800/40 rounded-md p-3">
                <div>
                  <div className="text-sm font-medium text-stone-900 dark:text-white">{s.type}</div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Stock: {s.current_stock} · Conso: {s.monthly_rate}/mois · Reste {s.months_of_stock ?? '∞'} mois
                  </div>
                </div>
                <div className="text-right">
                  <div className={`mono text-sm font-bold ${s.priority === 'HIGH' ? 'text-wine-700' : s.priority === 'MEDIUM' ? 'text-amber-600' : 'text-stone-600'}`}>
                    +{s.suggested_purchase}
                  </div>
                  <div className="mono text-[10px] uppercase text-stone-400 tracking-widest">{s.priority}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-stone-400 italic text-sm py-4">Pas de manque détecté à court terme.</div>
        )}
      </Card>

      {/* À boire d'urgence (rappel ici aussi pour la dimension achat) */}
      <Card className="col-span-12 lg:col-span-5 p-5">
        <MonoLabel>◌ URGENCES · À BOIRE</MonoLabel>
        <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">À ne pas racheter avant</h3>
        {drinkBefore.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {drinkBefore.slice(0, 8).map((a: any) => (
              <li key={a.wine.id} className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800/50 pb-1 last:border-0">
                <Link to={`/wine/${a.wine.id}`} className="text-stone-700 dark:text-stone-300 hover:text-wine-700 truncate">
                  {a.wine.name} {a.wine.vintage}
                </Link>
                <span className="mono text-[10px] text-wine-700 dark:text-wine-500">
                  {a.monthsLeft <= 0 ? 'PASSÉ' : `${a.monthsLeft}m`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-stone-400 italic text-sm py-4">Aucune urgence.</div>
        )}
      </Card>

      {/* Répartition par type */}
      {budget?.by_type && budget.by_type.length > 0 && (
        <Card className="col-span-12 p-5">
          <MonoLabel>◌ RÉPARTITION PAR TYPE · 12M</MonoLabel>
          <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">Où va ton budget</h3>
          <div className="space-y-2">
            {budget.by_type.sort((a: any, b: any) => b.total - a.total).map((t: any) => {
              const pct = (t.total / totalSpent) * 100;
              return (
                <div key={t.type} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-stone-700 dark:text-stone-300 capitalize">{t.type}</span>
                  <div className="flex-1 h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                    <div className="h-full bg-wine-700" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="mono text-[11px] text-stone-500 w-32 text-right">
                    {t.total.toLocaleString('fr-FR')}€ · {t.count} btl
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};
