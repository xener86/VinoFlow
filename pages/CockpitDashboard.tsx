// Cockpit-style home dashboard.
// Uses real data from existing hooks; no seed/mock data.

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Music, ChevronRight } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useTastingNotes } from '../hooks/useTastingNotes';
import { useJournal } from '../hooks/useJournal';
import { useWishlist } from '../hooks/useWishlist';
import { useAuth } from '../contexts/AuthContext';
import { getDrinkBeforeAlerts, getCellarBudget } from '../services/storageService';
import { getPeakWindow } from '../utils/peakWindow';
import { MonoLabel } from '../components/cockpit/primitives';

// ────────────────────────────────────────────
// Greeting based on time of day
// ────────────────────────────────────────────
const getGreeting = (name?: string) => {
  const h = new Date().getHours();
  const period = h < 6 ? 'Nuit calme' : h < 12 ? 'Bonjour' : h < 18 ? 'Bel après-midi' : 'Bonsoir';
  const day = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date().getDay()];
  const period2 = h < 12 ? 'matin' : h < 18 ? 'après-midi' : 'soir';
  const time = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  return `${period}${name ? ' ' + name : ''} — il est ${time}, ${day} ${period2}.`;
};

// ────────────────────────────────────────────
// KPI tile
// ────────────────────────────────────────────
const KpiTile: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; chart?: React.ReactNode }> = ({ label, value, sub, chart }) => (
  <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
    <MonoLabel>{label}</MonoLabel>
    <div className="text-3xl font-medium text-stone-900 dark:text-white mt-1.5 leading-none">{value}</div>
    {sub && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
    {chart && <div className="mt-2">{chart}</div>}
  </div>
);

// Mini sparkline computed from the last 12 months of journal additions
const buildSparkline = (entries: any[]) => {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i));
    return { y: d.getFullYear(), m: d.getMonth(), in: 0, out: 0 };
  });
  for (const e of entries || []) {
    const d = new Date(e.date);
    const idx = months.findIndex(m => m.y === d.getFullYear() && m.m === d.getMonth());
    if (idx >= 0) {
      if (e.type === 'IN') months[idx].in += e.quantity || 1;
      if (e.type === 'OUT' || e.type === 'GIFT') months[idx].out += e.quantity || 1;
    }
  }
  const max = Math.max(...months.map(m => Math.max(m.in, m.out)), 1);
  const norm = (v: number) => 22 - (v / max) * 18;
  const inPts = months.map((m, i) => `${i * (100 / 11)},${norm(m.in)}`).join(' ');
  const outPts = months.map((m, i) => `${i * (100 / 11)},${norm(m.out)}`).join(' ');
  return { inPts, outPts };
};

// ────────────────────────────────────────────
// Main Dashboard
// ────────────────────────────────────────────
export const CockpitDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { wines, loading: loadingWines } = useWines();
  const { notes: tastingNotes } = useTastingNotes();
  const { entries: journal } = useJournal();
  const { items: wishlist } = useWishlist();

  const [drinkBefore, setDrinkBefore] = useState<any[]>([]);
  const [budget, setBudget] = useState<any>(null);
  const [dish, setDish] = useState('');

  useEffect(() => {
    getDrinkBeforeAlerts(12).then(r => setDrinkBefore(r?.alerts || [])).catch(() => {});
    getCellarBudget(12).then(setBudget).catch(() => {});
  }, []);

  // KPIs derived from real data
  const totalBottles = wines.reduce((s, w) => s + (w.inventoryCount || 0), 0);
  const monthlyConsumption = budget?.monthly_avg ? (budget.total_bottles / 12) : 0;
  const monthsOfStock = monthlyConsumption > 0 ? Math.round((totalBottles / monthlyConsumption) * 10) / 10 : null;
  const tastingsThisYear = tastingNotes.filter(n => new Date(n.date).getFullYear() === new Date().getFullYear()).length;
  const tastingsLastYear = tastingNotes.filter(n => new Date(n.date).getFullYear() === new Date().getFullYear() - 1).length;
  const yearOverYear = tastingsLastYear > 0 ? Math.round((tastingsThisYear / tastingsLastYear) * 10) / 10 : null;

  const regions = useMemo(() => {
    const set = new Set(wines.filter(w => w.inventoryCount > 0).map(w => w.region).filter(Boolean));
    return set.size;
  }, [wines]);

  const sparkline = useMemo(() => buildSparkline(journal), [journal]);

  // Username (email prefix)
  const userName = user?.email?.split('@')[0]?.split('.')[0] || '';
  const friendlyName = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : '';

  const handleSommelierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dish.trim()) return;
    navigate(`/sommelier?mode=PAIRING&q=${encodeURIComponent(dish)}`);
  };

  // Hall of Fame: top 5 wines with rating >= 8
  const hallOfFame = useMemo(() => {
    const byWine: Record<string, { wineId: string; rating: number; date: string; occasion?: string; companions?: string }> = {};
    for (const note of tastingNotes) {
      // Rating is on a 0-5 stars scale in the existing app; keep top 5
      if (typeof note.rating === 'number' && note.rating >= 4) {
        const cur = byWine[note.wineId];
        if (!cur || (cur.rating < note.rating)) {
          byWine[note.wineId] = {
            wineId: note.wineId,
            rating: note.rating,
            date: note.date,
            occasion: (note as any).occasion,
            companions: (note as any).companions,
          };
        }
      }
    }
    return Object.values(byWine)
      .map(t => ({ ...t, wine: wines.find(w => w.id === t.wineId) }))
      .filter(t => t.wine)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);
  }, [tastingNotes, wines]);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ───── Page header ───── */}
      <div className="col-span-12 mb-1">
        <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight">Tableau de bord</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">{getGreeting(friendlyName)}</div>
      </div>

      {/* ───── Sommelier hero ───── */}
      <section className="col-span-12 rounded-md bg-cream-100 dark:bg-stone-900 p-7 ring-1 ring-stone-900/5 dark:ring-stone-700/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 mono text-[10px] tracking-widest text-wine-700 dark:text-wine-500">
            <span className="w-1.5 h-1.5 rounded-full bg-wine-700"></span>
            SOMMELIER · MODÈLE LOCAL
          </div>
          <div className="mono text-[10px] text-stone-500">3 PERSPECTIVES</div>
        </div>
        <h2 className="serif text-3xl md:text-4xl text-stone-900 dark:text-white leading-tight">
          Que boire <span className="serif-it text-wine-700 dark:text-wine-500">ce soir</span> ?
        </h2>
        <p className="text-stone-600 dark:text-stone-400 text-sm mt-3 max-w-md">
          Décris le moment, le plat, l'humeur — ou pose la question.
        </p>
        <form
          onSubmit={handleSommelierSubmit}
          className="mt-6 flex items-center gap-2 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 px-3 h-12 focus-within:ring-2 focus-within:ring-wine-600 focus-within:border-wine-600"
        >
          <Music className="w-4 h-4 text-stone-500 flex-shrink-0" />
          <input
            value={dish}
            onChange={e => setDish(e.target.value)}
            className="bg-transparent flex-1 text-sm outline-none placeholder:text-stone-500 text-stone-900 dark:text-white"
            placeholder="ex. dîner à deux, agneau aux herbes, on est mardi"
          />
          <button type="submit" className="h-7 px-3 rounded bg-wine-700 hover:bg-wine-800 text-white text-xs font-medium flex items-center gap-1">
            Demander <ArrowRight className="w-3 h-3" />
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['À DEUX', 'FESTIF', 'SOLO', 'APÉRO', 'SURPRISE-MOI'].map(chip => (
            <button
              key={chip}
              onClick={() => navigate(`/sommelier?mode=PAIRING&q=${encodeURIComponent(chip.toLowerCase())}`)}
              className="mono text-[10px] px-2 py-1 rounded border border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-800/40 text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800 cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      </section>

      {/* ───── 4 KPI tiles ───── */}
      <section className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile
          label="Bouteilles"
          value={totalBottles}
          sub={budget ? `${budget.total_bottles ?? '?'} entrées sur 12 mois` : '—'}
          chart={
            <svg viewBox="0 0 100 24" className="w-full h-5">
              <polyline fill="none" stroke="#16a34a" strokeWidth="1.4" points={sparkline.inPts} />
              <polyline fill="none" stroke="#9b1c1c" strokeWidth="1.4" strokeDasharray="2 2" points={sparkline.outPts} />
            </svg>
          }
        />
        <KpiTile
          label="Mois de stock"
          value={
            monthsOfStock !== null && monthsOfStock > 0 ? (
              <>{Math.floor(monthsOfStock)}<span className="text-base text-stone-500">.{Math.round((monthsOfStock - Math.floor(monthsOfStock)) * 10)}</span></>
            ) : <span className="text-stone-400">—</span>
          }
          sub={monthsOfStock !== null && monthsOfStock > 0 ? 'rythme actuel' : 'pas assez de conso enregistrée'}
          chart={
            monthsOfStock !== null && monthsOfStock > 0 ? (
              <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                <div className="h-full bg-wine-700 rounded-full" style={{ width: `${Math.min(monthsOfStock * 5, 100)}%` }} />
              </div>
            ) : null
          }
        />
        <KpiTile
          label={`Dégust. '${String(new Date().getFullYear()).slice(-2)}`}
          value={tastingsThisYear}
          sub={yearOverYear !== null ? `${yearOverYear}× vs '${String(new Date().getFullYear() - 1).slice(-2)}` : '—'}
        />
        <KpiTile
          label="Régions"
          value={<>{regions}</>}
          sub={`${wines.filter(w => w.inventoryCount > 0).length} vins en stock`}
        />
      </section>

      {/* ───── À boire — table critique ───── */}
      <section className="col-span-12 lg:col-span-8 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
        <header className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/40 dark:bg-stone-950/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 mono text-[10px] tracking-widest text-wine-700 dark:text-wine-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-wine-700 animate-pulse"></span>
              {drinkBefore.length} URGENTS
            </span>
            <span className="mono text-[10px] text-stone-500 tracking-widest">· EN FIN DE FENÊTRE</span>
          </div>
          <Link to="/insights" className="mono text-[10px] tracking-widest text-stone-600 hover:text-wine-700 px-2 py-1">
            INSIGHTS →
          </Link>
        </header>
        <div className="px-5 pt-4 pb-2">
          <h3 className="serif-it text-xl text-stone-900 dark:text-white">Avant qu'ils ne passent leur pic</h3>
        </div>
        {drinkBefore.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="mono text-[10px] tracking-widest text-stone-500 border-b border-stone-200 dark:border-stone-800">
                <th className="text-left font-normal px-5 py-2">VIN</th>
                <th className="text-left font-normal py-2">RÉGION</th>
                <th className="text-left font-normal py-2">VTG</th>
                <th className="text-left font-normal py-2">PIC</th>
                <th className="text-right font-normal px-5 py-2">QTÉ</th>
              </tr>
            </thead>
            <tbody>
              {drinkBefore.slice(0, 5).map((a: any) => (
                <tr key={a.wine.id} className="border-b border-stone-100 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30">
                  <td className="px-5 py-2.5">
                    <Link to={`/wine/${a.wine.id}`} className="serif-it text-stone-900 dark:text-white hover:text-wine-700">
                      {a.wine.name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-stone-600 dark:text-stone-400 text-xs">{a.wine.region}</td>
                  <td className="py-2.5 text-stone-600 dark:text-stone-400 text-xs mono">{a.wine.vintage}</td>
                  <td className="py-2.5">
                    <span className={`mono text-[10px] px-1.5 py-0.5 rounded ${a.monthsLeft <= 0 ? 'bg-wine-700 text-white' : a.monthsLeft <= 6 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'}`}>
                      {a.monthsLeft <= 0 ? 'PASSÉ' : `${a.monthsLeft} MOIS`}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right mono text-xs text-stone-600 dark:text-stone-400">×{a.wine.inventoryCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-8 text-sm text-stone-500 italic">Aucun vin en fin de fenêtre — votre cave est sereine.</div>
        )}
      </section>

      {/* ───── Hall of Fame (right column) ───── */}
      <aside className="col-span-12 lg:col-span-4 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
        <header className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-950/40">
          <div className="flex items-center gap-2 mono text-[10px] tracking-widest text-stone-600 dark:text-stone-400">
            <Sparkles className="w-3 h-3 text-wine-700" />
            HALL OF FAME · TOP {hallOfFame.length}
          </div>
          <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5">Tes coups de cœur</h3>
        </header>
        {hallOfFame.length > 0 ? (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800/50">
            {hallOfFame.map((t, i) => (
              <li key={t.wineId} className="px-5 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/30">
                <Link to={`/wine/${t.wineId}`} className="block">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="serif-it text-stone-400 text-sm w-5">{['I', 'II', 'III', 'IV', 'V'][i]}</span>
                      <span className="serif-it text-stone-900 dark:text-white truncate">{t.wine?.name}</span>
                    </div>
                    <span className="mono text-sm text-wine-700 dark:text-wine-500 font-medium flex-shrink-0">{t.rating}/5</span>
                  </div>
                  {(t.occasion || t.companions) && (
                    <div className="text-[11px] text-stone-500 mt-0.5 truncate">
                      « {[t.occasion, t.companions].filter(Boolean).join(', ')} »
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-8 text-sm text-stone-500 italic">
            Note tes premières dégustations à 4/5+ pour les voir ici.
          </div>
        )}
      </aside>

      {/* ───── Recent activity ───── */}
      <section className="col-span-12 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden">
        <header className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/40 dark:bg-stone-950/40">
          <div className="flex items-center gap-2 mono text-[10px] tracking-widest text-stone-600 dark:text-stone-400">
            JOURNAL · ACTIVITÉ RÉCENTE
          </div>
          <Link to="/journal" className="text-xs text-stone-500 hover:text-wine-700 flex items-center gap-1">
            Tout voir <ChevronRight className="w-3 h-3" />
          </Link>
        </header>
        <div className="px-5 py-2">
          <h3 className="serif-it text-xl text-stone-900 dark:text-white pt-2 pb-2">Dernières entrées</h3>
        </div>
        {journal.length > 0 ? (
          <ul className="text-sm">
            {journal.slice(0, 5).map(e => {
              const d = new Date(e.date);
              const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              return (
                <li key={e.id} className="px-5 py-2 grid grid-cols-12 gap-3 items-baseline border-t border-stone-100 dark:border-stone-800/50">
                  <span className="col-span-1 mono text-[10px] text-stone-500">{time}</span>
                  <span className="col-span-2 mono text-[10px] tracking-widest text-stone-500">[{e.type}]</span>
                  <span className="col-span-9 truncate text-stone-700 dark:text-stone-300">
                    {e.description || `${e.wineName}${e.wineVintage ? ' · ' + e.wineVintage : ''}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-5 py-8 text-sm text-stone-500 italic">Aucune activité récente.</div>
        )}
      </section>
    </div>
  );
};
