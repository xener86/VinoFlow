import React, { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, Modal, MonoLabel, Skeleton, WineLink } from '../primitives';
import { getCellarValue } from '../../../services/storageService';
import { CellarValue, ValueMover } from '../../../types';
import { PriceCatchup } from './PriceCatchup';

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = (x: number | null) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} %`);
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
const monthLabel = (m: string) => MONTH.format(new Date(`${m}-01T12:00:00Z`));

const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ label, value, sub }) => (
  <div className="rounded-md border border-stone-200 bg-white p-4">
    <MonoLabel>{label}</MonoLabel>
    <div className="text-2xl text-stone-900 font-medium mt-1.5 leading-none tabular-nums">{value}</div>
    {sub && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
  </div>
);

const Movers: React.FC<{ title: string; items: ValueMover[]; tone: 'up' | 'down' }> = ({ title, items, tone }) => (
  <Card className="p-5">
    <MonoLabel>{title}</MonoLabel>
    {items.length === 0 ? <p className="text-sm text-stone-500 mt-3">Pas encore assez de prix et de cotes.</p> : (
      <ul className="mt-3 divide-y divide-stone-100">
        {items.map((m) => (
          <li key={m.wineId} className="py-2 flex items-center gap-3">
            <WineLink id={m.wineId} className="serif-it text-stone-900 flex-1 min-w-0 truncate">{m.name}{m.vintage ? ` ${m.vintage}` : ''}</WineLink>
            <span className="text-xs text-stone-500 tabular-nums">{EUR.format(m.avgPurchase)} → {EUR.format(m.price)}</span>
            <span className={`mono text-xs tabular-nums ${tone === 'up' ? 'text-emerald-700' : 'text-wine-700'}`}>{m.gainTotal >= 0 ? '+' : ''}{EUR.format(m.gainTotal)}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

export const ValueView: React.FC<{ openCatchup?: boolean }> = ({ openCatchup = false }) => {
  const [data, setData] = useState<CellarValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catchup, setCatchup] = useState(openCatchup);

  const load = () => getCellarValue(24).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'erreur'));
  useEffect(() => { load(); }, []);

  if (error) return <EmptyState title="Valeur indisponible" hint={error} />;
  if (!data) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  const { today, coverage } = data;
  const missing = coverage.bottles - coverage.withPrice;
  const chart = data.series.map((p) => ({ ...p, label: monthLabel(p.month), cost: p.invested + p.estimatedPurchase }));

  return (
    <div className="space-y-5">
      {missing > 0 && (
        <button onClick={() => setCatchup(true)} className="w-full text-left rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <strong>{missing} bouteille(s) sans prix d’achat</strong> — compléter pour une plus-value juste →
        </button>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Valeur estimée" value={EUR.format(today.value)} sub={`${coverage.withValuation}/${coverage.bottles} bt cotées`} />
        <Kpi label="Investi" value={EUR.format(today.invested)} sub={today.estimatedPurchase > 0 ? `+ ${EUR.format(today.estimatedPurchase)} en achat estimé` : `${coverage.withPrice}/${coverage.bottles} bt avec prix`} />
        <Kpi label="Plus-value latente" value={<span className={today.gain >= 0 ? 'text-emerald-700' : 'text-wine-700'}>{today.gain >= 0 ? '+' : ''}{EUR.format(today.gain)}</span>} sub={pct(today.gainPct)} />
        <Kpi label="Couverture" value={`${coverage.bottles ? Math.round((coverage.withValuation / coverage.bottles) * 100) : 0} %`} sub={`cotes · ${coverage.bottles ? Math.round((coverage.withPrice / coverage.bottles) * 100) : 0} % de prix`} />
      </div>

      <Card className="p-5">
        <MonoLabel>◌ Valeur et investi · 24 mois</MonoLabel>
        <div className="h-64 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#f5f5f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716c' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#78716c' }} width={56} tickFormatter={(v: number) => EUR.format(v)} />
              <Tooltip formatter={(v: number) => EUR.format(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="value" name="Valeur (cote)" stroke="#7f1d1d" fill="#7f1d1d" fillOpacity={0.12} strokeWidth={2} />
              <Area type="monotone" dataKey="invested" name="Investi (prix réels)" stroke="#57534e" fill="#57534e" fillOpacity={0.06} strokeWidth={1.5} />
              <Area type="monotone" dataKey="cost" name="+ achat estimé" stroke="#a8a29e" strokeDasharray="4 3" fill="none" strokeWidth={1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Movers title="◌ Ont pris de la valeur" items={data.movers.up} tone="up" />
        <Movers title="◌ Ont perdu de la valeur" items={data.movers.down} tone="down" />
      </div>

      <Modal open={catchup} onClose={() => setCatchup(false)} title="Prix d’achat manquants" subtitle="Un prix par vin, appliqué à ses bouteilles sans prix" size="lg">
        <PriceCatchup onDone={load} />
      </Modal>
    </div>
  );
};
