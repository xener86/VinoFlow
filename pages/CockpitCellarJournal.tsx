// Cockpit-style cellar journal — faithful port of journal-proto.html (Phase 2).
//   - 4-card KPI strip (Entrées MAI · Sorties MAI · Net MAI · Sparkline 12 mois IN/OUT)
//   - Filter bar (type chips, period chips, search, export CSV)
//   - Git-log timeline grouped by day with rail + colored node
//   - Per-type detail rendering (IN: source · OUT: note italic · MOVE: from→to · GIFT: recipient · NOTE: citation)
//   - Undo on OUT < 24h (optimistic local-only — no server route exists yet)

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, ArrowRight } from 'lucide-react';
import { useJournal } from '../hooks/useJournal';
import { useWines } from '../hooks/useWines';
import { JournalEntry } from '../types';
import { Card, MonoLabel } from '../components/cockpit/primitives';

type EntryType = 'IN' | 'OUT' | 'MOVE' | 'GIFT' | 'NOTE';
type Period = 'month' | '3m' | '12m' | 'all';

const TYPE_META: Record<EntryType, { label: string; verb: string; bg: string; fg: string; dot: string }> = {
  IN:   { label: 'Entrée',      verb: '+', bg: 'bg-emerald-50',  fg: 'text-emerald-800', dot: 'bg-emerald-600' },
  OUT:  { label: 'Sortie',      verb: '−', bg: 'bg-wine-50',         fg: 'text-wine-800',       dot: 'bg-wine-700' },
  MOVE: { label: 'Déplacement', verb: '→', bg: 'bg-stone-100',         fg: 'text-stone-800',     dot: 'bg-stone-500' },
  GIFT: { label: 'Cadeau',      verb: '⬦', bg: 'bg-amber-50',       fg: 'text-amber-800',     dot: 'bg-amber-600' },
  NOTE: { label: 'Note',        verb: '✎', bg: 'bg-cream-100',         fg: 'text-stone-800',     dot: 'bg-stone-700' },
};

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────
export const CockpitCellarJournal: React.FC = () => {
  const { entries, loading } = useJournal();
  const { wines } = useWines();
  const [removed, setRemoved] = useState<Set<string>>(new Set()); // optimistic-only undos
  const [types, setTypes] = useState<EntryType[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [q, setQ] = useState('');

  const now = useMemo(() => new Date(), []);

  // Lookup map wineId → CellarWine (for appellation)
  const winesById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const w of wines) m[w.id] = w;
    return m;
  }, [wines]);

  // Period cutoff
  const periodCutoff = useMemo(() => {
    const d = new Date(now);
    if (period === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
    if (period === '3m')    { d.setMonth(d.getMonth() - 3); return d; }
    if (period === '12m')   { d.setFullYear(d.getFullYear() - 1); return d; }
    return new Date(0);
  }, [period, now]);

  const liveEntries = useMemo(() => entries.filter(e => !removed.has(e.id)), [entries, removed]);

  // Filtered list shown in the timeline
  const visible = useMemo(() => liveEntries.filter(e => {
    if (types.length && !types.includes(e.type as EntryType)) return false;
    const d = new Date(e.date);
    // Period filter: invalid dates only show in "Tout"
    if (period !== 'all') {
      if (!isValidDate(d)) return false;
      if (d < periodCutoff) return false;
    }
    if (q) {
      const blob = `${e.wineName || ''} ${e.recipient || ''} ${e.occasion || ''} ${e.description || ''}`.toLowerCase();
      if (!blob.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [liveEntries, types, periodCutoff, period, q]);

  // KPIs — month-to-date counts (always, not affected by filters)
  const monthStart = useMemo(() => { const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0); return d; }, [now]);
  const mtd = liveEntries.filter(e => {
    const d = new Date(e.date);
    return isValidDate(d) && d >= monthStart;
  });
  const sumQty = (t: EntryType) => mtd.filter(e => e.type === t).reduce((a, e) => a + (e.quantity || 1), 0);
  const ins   = sumQty('IN');
  const outs  = sumQty('OUT');
  const gifts = sumQty('GIFT');
  const net   = ins - outs - gifts;

  // Sparkline data — 12 months ending now, IN bottles vs OUT bottles
  const monthly = useMemo(() => {
    const months: { m: string; IN: number; OUT: number }[] = [];
    const monthLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ m: monthLabels[d.getMonth()], IN: 0, OUT: 0 });
    }
    for (const e of liveEntries) {
      const d = new Date(e.date);
      if (!isValidDate(d)) continue;
      const monthsBack = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (monthsBack < 0 || monthsBack > 11) continue;
      const slot = months[11 - monthsBack];
      if (!slot) continue;
      if (e.type === 'IN') slot.IN += (e.quantity || 1);
      else if (e.type === 'OUT' || e.type === 'GIFT') slot.OUT += (e.quantity || 1);
    }
    return months;
  }, [liveEntries, now]);

  const onUndo = (id: string) => setRemoved(s => new Set([...s, id]));

  const monthLabelFR = (() => {
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    return `${months[now.getMonth()]} ${now.getFullYear()}`;
  })();

  if (loading) {
    return <div className="text-sm text-stone-500 italic py-8 text-center">Chargement du journal…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page intro */}
      <div>
        <MonoLabel>◇ JOURNAL DE CAVE</MonoLabel>
        <h1 className="serif text-4xl text-stone-900 mt-1.5 leading-tight">
          Tout ce qui passe par la cave.
        </h1>
        <p className="serif-it text-stone-500 mt-1.5 text-lg">
          Entrées, sorties, déplacements, cadeaux, notes — par ordre chronologique.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label={`ENTRÉES — ${monthLabelFR.split(' ')[0].toUpperCase()}`} value={`+${ins}`} delta="bouteilles ajoutées ce mois" accent="forest" />
        <KPI label={`SORTIES — ${monthLabelFR.split(' ')[0].toUpperCase()}`} value={`−${outs}`} delta="bouteilles consommées" accent="wine" />
        <KPI label={`NET — ${monthLabelFR.split(' ')[0].toUpperCase()}`} value={`${net >= 0 ? '+' : ''}${net}`} delta={`après ${gifts} cadeau${gifts > 1 ? 'x' : ''}`} accent="stone" />
        <Card className="p-5 h-full">
          <div className="flex items-center justify-between">
            <MonoLabel>FLUX 12 MOIS</MonoLabel>
            <div className="flex items-center gap-3 mono text-[10px] text-stone-500 uppercase tracking-widest">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-700" />IN</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-wine-700" />OUT</span>
            </div>
          </div>
          <div className="mt-2 -mx-2"><Sparkline data={monthly} width={300} height={60} /></div>
          <div className="flex justify-between mono text-[9px] text-stone-400 px-2 -mt-1">
            {monthly.map((m, i) => <span key={i}>{m.m[0]}</span>)}
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      <FilterBar
        types={types} setTypes={setTypes}
        period={period} setPeriod={setPeriod}
        q={q} setQ={setQ}
        onExport={() => exportCsv(visible)}
      />

      {/* Counter line */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase">
          {visible.length} évènement{visible.length > 1 ? 's' : ''} affiché{visible.length > 1 ? 's' : ''}
          {types.length > 0 && <> · filtre {types.map(t => TYPE_META[t].label.toLowerCase()).join(', ')}</>}
          {q && <> · « {q} »</>}
        </div>
        <div className="mono text-[10px] tracking-widest text-stone-400 uppercase hidden md:block">
          CLIC = FICHE VIN · SURVOL OUT &lt; 24H = ANNULER
        </div>
      </div>

      {/* Timeline */}
      <Timeline entries={visible} winesById={winesById} now={now} onUndo={onUndo} />
    </div>
  );
};

// ────────────────────────────────────────────
// KPI — proto's `serif text-[44px]` block
// ────────────────────────────────────────────
const KPI: React.FC<{ label: string; value: string; delta?: string; accent?: 'forest' | 'wine' | 'stone' }> = ({ label, value, delta, accent = 'stone' }) => {
  const accentMap = {
    forest: 'text-emerald-700',
    wine:   'text-wine-700',
    stone:  'text-stone-900',
  };
  return (
    <Card className="p-5">
      <MonoLabel>{label}</MonoLabel>
      <div className={`serif text-[44px] leading-none mt-2 ${accentMap[accent]}`}>{value}</div>
      {delta && <div className="text-xs text-stone-500 mt-2">{delta}</div>}
    </Card>
  );
};

// ────────────────────────────────────────────
// Sparkline — IN (emerald) and OUT (wine) lines + dots, last point emphasised
// ────────────────────────────────────────────
const Sparkline: React.FC<{ data: { IN: number; OUT: number }[]; width: number; height: number }> = ({ data, width, height }) => {
  const max = Math.max(1, ...data.flatMap(d => [d.IN, d.OUT]));
  const padX = 8, padY = 6;
  const w = width - padX * 2, h = height - padY * 2;
  const step = w / Math.max(1, data.length - 1);
  const y = (v: number) => padY + h - (v / max) * h;
  const x = (i: number) => padX + i * step;
  const path = (key: 'IN' | 'OUT') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');

  return (
    <svg width={width} height={height} className="block">
      <line x1={padX} x2={width - padX} y1={padY + h} y2={padY + h} stroke="#e7e5e4" strokeDasharray="2 3" />
      <path d={path('OUT')} fill="none" stroke="#7f1d1d" strokeWidth="1.5" />
      <path d={path('IN')}  fill="none" stroke="#3f6b4e" strokeWidth="1.5" />
      {data.map((d, i) => <circle key={'i' + i} cx={x(i)} cy={y(d.IN)}  r={2} fill="#3f6b4e" />)}
      {data.map((d, i) => <circle key={'o' + i} cx={x(i)} cy={y(d.OUT)} r={2} fill="#7f1d1d" />)}
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].IN)}  r={3.5} fill="#fcfaf6" stroke="#3f6b4e" strokeWidth={1.5} />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].OUT)} r={3.5} fill="#fcfaf6" stroke="#7f1d1d" strokeWidth={1.5} />
    </svg>
  );
};

// ────────────────────────────────────────────
// FilterBar
// ────────────────────────────────────────────
interface FilterBarProps {
  types: EntryType[]; setTypes: (t: EntryType[]) => void;
  period: Period;     setPeriod: (p: Period) => void;
  q: string;          setQ: (s: string) => void;
  onExport: () => void;
}
const FilterBar: React.FC<FilterBarProps> = ({ types, setTypes, period, setPeriod, q, setQ, onExport }) => {
  const allTypes: EntryType[] = ['IN', 'OUT', 'MOVE', 'GIFT', 'NOTE'];
  const toggle = (t: EntryType) => {
    if (types.includes(t)) setTypes(types.filter(x => x !== t));
    else setTypes([...types, t]);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Type chips */}
      <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-md p-1">
        <button
          onClick={() => setTypes([])}
          className={`px-2.5 h-7 rounded text-xs transition ${
            types.length === 0
              ? 'bg-stone-900 text-white'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          Tout
        </button>
        {allTypes.map(t => {
          const on = types.includes(t);
          const m = TYPE_META[t];
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={`px-2.5 h-7 rounded text-xs flex items-center gap-1.5 transition ${
                on
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${m.dot}`} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Period chips */}
      <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-md p-1">
        {([
          { k: 'month', l: 'Ce mois' }, { k: '3m', l: '3 mois' },
          { k: '12m', l: '12 mois' }, { k: 'all', l: 'Tout' },
        ] as { k: Period; l: string }[]).map(p => (
          <button
            key={p.k}
            onClick={() => setPeriod(p.k)}
            className={`px-2.5 h-7 rounded text-xs transition ${
              period === p.k
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {p.l}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex-1 min-w-[260px]">
        <div className="relative">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher un vin, destinataire, occasion…"
            className="w-full h-9 pl-9 pr-3 rounded-md bg-white border border-stone-200 text-sm placeholder:text-stone-400 focus:outline-none focus:border-stone-400 text-stone-900"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-3.5 h-3.5" />
        </div>
      </div>

      {/* Export */}
      <button
        onClick={onExport}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm bg-white border border-stone-200 text-stone-700 hover:border-stone-400 transition"
      >
        <Download className="w-3.5 h-3.5" />
        Export CSV
      </button>
    </div>
  );
};

// ────────────────────────────────────────────
// Day grouping helpers (proto's longDate / relativeWeeks / dayKey)
// All helpers are defensive against invalid dates: the API has historical
// entries with malformed/null `date` fields that previously crashed the page
// with "Invalid time value" (toISOString throws on Invalid Date).
// ────────────────────────────────────────────
const isValidDate = (d: Date): boolean => !isNaN(d.getTime());

const longDate = (d: Date): string => {
  if (!isValidDate(d)) return 'Date inconnue';
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const days   = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};
const relativeWeeks = (days: number): string => {
  if (days < 7)  return `il y a ${days} jours`;
  if (days < 30) return `il y a ${Math.round(days / 7)} sem.`;
  return `il y a ${Math.round(days / 30)} mois`;
};

const UNKNOWN_DAY = { k: '__unknown__', label: 'Date inconnue', sub: 'évènement sans date' };

const dayKey = (iso: string, now: Date): { k: string; label: string; sub: string } => {
  const d = new Date(iso);
  if (!isValidDate(d)) return UNKNOWN_DAY;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const that  = new Date(d);   that.setHours(0, 0, 0, 0);
  const diff  = Math.round((today.getTime() - that.getTime()) / 86400000);
  const k = that.toISOString().slice(0, 10);
  if (diff === 0) return { k, label: "Aujourd'hui", sub: longDate(d) };
  if (diff === 1) return { k, label: 'Hier',         sub: longDate(d) };
  return { k, label: longDate(d), sub: relativeWeeks(diff) };
};
const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  if (!isValidDate(d)) return '—:—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ────────────────────────────────────────────
// Timeline
// ────────────────────────────────────────────
const Timeline: React.FC<{
  entries: JournalEntry[];
  winesById: Record<string, any>;
  now: Date;
  onUndo: (id: string) => void;
}> = ({ entries, winesById, now, onUndo }) => {
  const groups = useMemo(() => {
    const g: { k: string; label: string; sub: string; items: JournalEntry[] }[] = [];
    for (const e of entries) {
      const k = dayKey(e.date, now);
      let group = g.find(x => x.k === k.k);
      if (!group) { group = { ...k, items: [] }; g.push(group); }
      group.items.push(e);
    }
    // sort items inside a group by date desc, NaN at the bottom
    g.forEach(grp => grp.items.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    }));
    // Push the "unknown" bucket to the end
    return g.sort((a, b) => {
      if (a.k === '__unknown__') return 1;
      if (b.k === '__unknown__') return -1;
      return 0;
    });
  }, [entries, now]);

  if (groups.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="serif-it text-stone-400 text-lg">Rien à afficher pour cette sélection.</div>
        <div className="mono text-[10px] tracking-widest text-stone-400 mt-2 uppercase">AJUSTER LES FILTRES</div>
      </Card>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map(g => (
        <div key={g.k}>
          {/* Day header */}
          <div className="flex items-baseline gap-3 pl-[88px] py-3 flex-wrap">
            <div className="serif text-stone-900 text-lg">{g.label}</div>
            <div className="mono text-[10px] tracking-widest text-stone-400 uppercase">{g.sub}</div>
            <div className="flex-1 ml-2 border-t border-dashed border-stone-200 self-center" />
            <div className="mono text-[10px] tracking-widest text-stone-400 uppercase">
              {g.items.length} évènement{g.items.length > 1 ? 's' : ''}
            </div>
          </div>
          {g.items.map(e => (
            <EventRow key={e.id} entry={e} wine={e.wineId ? winesById[e.wineId] : null} now={now} onUndo={onUndo} />
          ))}
        </div>
      ))}
    </div>
  );
};

// ────────────────────────────────────────────
// EventRow — a single event in the timeline
// ────────────────────────────────────────────
const EventRow: React.FC<{
  entry: JournalEntry;
  wine: any;
  now: Date;
  onUndo: (id: string) => void;
}> = ({ entry, wine, now, onUndo }) => {
  const m = TYPE_META[entry.type as EntryType];
  const minutesAgo = Math.round((now.getTime() - new Date(entry.date).getTime()) / 60000);
  const canUndo = entry.type === 'OUT' && minutesAgo < 60 * 24;
  const appellation = wine?.appellation || wine?.region;

  return (
    <div className="flex gap-4 group">
      {/* Time gutter */}
      <div className="w-14 pt-3.5 shrink-0 text-right">
        <div className="mono text-[11px] text-stone-400">{fmtTime(entry.date)}</div>
      </div>

      {/* Rail + node */}
      <div className="relative w-6 shrink-0">
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-stone-200" />
        <div className={`absolute left-1/2 -translate-x-1/2 top-4 w-3 h-3 rounded-full ${m.dot} ring-4 ring-cream-50 z-10`} />
      </div>

      {/* Card */}
      <div className="flex-1 min-w-0 pb-5">
        <div className="rounded-md border border-stone-200 bg-white px-4 py-3 hover:border-stone-300 transition-colors">
          <div className="flex items-start gap-3">
            {/* Type icon */}
            <div className={`shrink-0 w-9 h-9 rounded-md ${m.bg} flex items-center justify-center mono text-base ${m.fg} leading-none`}>
              {m.verb}
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`mono text-[10px] tracking-widest ${m.fg}`}>{m.label.toUpperCase()}</span>
                {appellation && <>
                  <span className="text-stone-300">·</span>
                  <span className="mono text-[10px] tracking-widest text-stone-400 uppercase truncate">{appellation}</span>
                </>}
              </div>

              <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className="serif text-[18px] text-stone-900 leading-tight">{entry.wineName}</span>
                {entry.wineVintage && <span className="mono text-xs text-stone-500">· {entry.wineVintage}</span>}
                {(entry.quantity || 0) > 1 && (
                  <span className="mono text-[10px] tracking-widest text-stone-500 uppercase">× {entry.quantity} btl</span>
                )}
              </div>

              <EventDetail entry={entry} />
            </div>

            {/* Right column: actions */}
            <div className="shrink-0 flex flex-col items-end gap-1.5">
              {canUndo && (
                <button
                  onClick={() => onUndo(entry.id)}
                  className="mono text-[10px] tracking-widest text-stone-500 hover:text-wine-700 uppercase opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Retire l'événement de la liste (local uniquement)"
                >
                  Annuler
                </button>
              )}
              {entry.wineId && (
                <Link
                  to={`/wine/${entry.wineId}`}
                  className="mono text-[10px] tracking-widest text-stone-400 hover:text-stone-700 uppercase inline-flex items-center gap-1"
                >
                  Voir vin <ArrowRight className="w-2.5 h-2.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// EventDetail — per-type body
// ────────────────────────────────────────────
const EventDetail: React.FC<{ entry: JournalEntry }> = ({ entry }) => {
  if (entry.type === 'MOVE') {
    return (
      <div className="mt-1.5 flex items-center gap-2 text-sm text-stone-600 flex-wrap">
        {entry.fromLocation && <span className="mono text-xs text-stone-500">{entry.fromLocation}</span>}
        <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
        {entry.toLocation && <span className="mono text-xs text-stone-700">{entry.toLocation}</span>}
      </div>
    );
  }
  if (entry.type === 'GIFT') {
    return (
      <div className="mt-1.5 text-sm text-stone-600">
        {entry.recipient && (<>
          <span className="text-stone-500">Pour</span>{' '}
          <span className="text-stone-800">{entry.recipient}</span>
        </>)}
        {entry.occasion && <>
          <span className="text-stone-300 mx-1.5">·</span>
          <span className="serif-it text-stone-700">{entry.occasion}</span>
        </>}
      </div>
    );
  }
  if (entry.type === 'NOTE') {
    return (
      <div className="mt-2 text-sm text-stone-700 serif-it leading-snug pr-4">
        « {entry.note || entry.description || 'Note de dégustation'} »
      </div>
    );
  }
  if (entry.type === 'IN') {
    // Try to extract a "source" from the description (e.g. "Caviste — Lavinia")
    return (
      <div className="mt-1.5 text-sm text-stone-600 flex flex-wrap gap-x-3 gap-y-0.5">
        {entry.description && <span>{entry.description}</span>}
      </div>
    );
  }
  // OUT
  return (
    <div className="mt-1.5 text-sm text-stone-600">
      {entry.description && <div>{entry.description}</div>}
      {entry.note && (
        <div className="serif-it text-stone-500 text-[13px] mt-1 pr-4 leading-snug">
          « {entry.note} »
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────
// CSV export of the visible entries
// ────────────────────────────────────────────
const exportCsv = (entries: JournalEntry[]) => {
  const headers = ['Date', 'Type', 'Vin', 'Millésime', 'Quantité', 'Description', 'De', 'Vers', 'Destinataire', 'Occasion'];
  const rows = entries.map(e => [
    e.date,
    e.type,
    e.wineName,
    e.wineVintage ?? '',
    e.quantity ?? '',
    e.description ?? '',
    e.fromLocation ?? '',
    e.toLocation ?? '',
    e.recipient ?? '',
    e.occasion ?? '',
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vinoflow-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
