import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, Input, Modal, MonoLabel } from '../primitives';
import { useToast } from '../feedback';
import { getWineValuations, refreshWineValuation, saveWineValuation } from '../../../services/storageService';
import { WineValuations } from '../../../types';

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const BASIS = { EXACT: 'ce millésime', AUTRE_MILLESIME: 'autre millésime', USER: 'saisie' } as const;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erreur inconnue');

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${max === min ? 12 : 22 - ((v - min) / (max - min)) * 20}`).join(' ');
  return <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-6" aria-hidden="true"><polyline fill="none" stroke="#7f1d1d" strokeWidth="1.4" points={pts} /></svg>;
};

/** Cote du vin : dernière valeur, fourchette, sources, historique, saisie et rafraîchissement. */
export const WineValuationCard: React.FC<{ wineId: string; avgPurchase: number | null; className?: string }> = ({ wineId, avgPurchase, className = '' }) => {
  const toast = useToast();
  const [data, setData] = useState<WineValuations | null>(null);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getWineValuations(wineId).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, [wineId]);

  const save = async () => {
    const value = Number(price.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return toast.error('Prix invalide');
    setBusy(true);
    try {
      await saveWineValuation(wineId, { priceEur: value });
      toast.success('Cote enregistrée');
      setEditing(false);
      setPrice('');
      await load();
    } catch (e) {
      toast.error("L'enregistrement a échoué : " + errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Après une demande, la carte se recharge toutes les 15 s (8 min au plus) jusqu'à
  // ce que la recherche aboutisse (nouveau point ou nouveau statut).
  const [watching, setWatching] = useState<{ since: string | null; status: string | null } | null>(null);
  useEffect(() => {
    if (!watching) return undefined;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const next = await getWineValuations(wineId).catch(() => null);
      if (next) setData(next);
      const changed = next && ((next.latest?.valuedAt ?? null) !== watching.since || next.status !== watching.status || next.nextCheckAt !== data?.nextCheckAt);
      if (changed || tries >= 32) setWatching(null);
    }, 15_000);
    return () => clearInterval(timer);
  }, [watching, wineId]);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await refreshWineValuation(wineId);
      toast.success(r.position > 1 ? `Recherche de cote en file (position ${r.position}) — résultat dans quelques minutes` : 'Recherche de cote lancée — résultat dans quelques minutes');
      setWatching({ since: data?.latest?.valuedAt ?? null, status: data?.status ?? null });
    } catch (e) {
      toast.error('Impossible de lancer la recherche : ' + errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const latest = data?.latest;
  const history = [...(data?.history ?? [])].reverse().map((v) => v.priceEur);
  const gain = latest && avgPurchase ? latest.priceEur - avgPurchase : null;
  const counted = latest?.sources.filter((s) => s.counted) ?? [];

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <MonoLabel>◌ Cote</MonoLabel>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={busy}><Pencil className="w-3.5 h-3.5" /> Saisir</Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={busy || watching !== null}>{busy || watching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {watching ? 'Recherche…' : 'Rafraîchir'}</Button>
        </div>
      </div>
      {!latest ? (
        <p className="text-sm text-stone-500 mt-3">
          {data?.status === 'NONE' ? 'Aucun prix vérifiable trouvé lors de la dernière recherche.' : 'Pas encore de cote.'}
          {data?.nextCheckAt && ` Prochaine recherche : ${DATE.format(new Date(data.nextCheckAt))}.`}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl text-stone-900 font-medium tabular-nums">{EUR.format(latest.priceEur)}</span>
            {latest.lowEur != null && latest.highEur != null && latest.lowEur !== latest.highEur && (
              <span className="text-sm text-stone-500 tabular-nums">{EUR.format(latest.lowEur)} – {EUR.format(latest.highEur)}</span>
            )}
            <Badge tone={latest.basis === 'EXACT' ? 'success' : 'neutral'}>{BASIS[latest.basis]}</Badge>
          </div>
          <div className="text-xs text-stone-500">
            {DATE.format(new Date(latest.valuedAt))}
            {gain != null && <> · <span className={gain >= 0 ? 'text-emerald-700' : 'text-wine-700'}>{gain >= 0 ? '+' : ''}{EUR.format(gain)} / bouteille</span> par rapport au prix d’achat</>}
          </div>
          <Sparkline values={history} />
          {counted.length > 0 && (
            <ul className="space-y-1">
              {counted.map((s) => (
                <li key={s.url} className="text-xs text-stone-600 flex items-center gap-1.5 min-w-0">
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="truncate hover:text-wine-700">{s.title || new URL(s.url).hostname}</a>
                  <span className="tabular-nums shrink-0">· {EUR.format(s.price_eur)}</span>
                </li>
              ))}
            </ul>
          )}
          {latest.note && <p className="text-xs text-stone-500 italic">{latest.note}</p>}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Saisir une cote" subtitle="Prix actuel d’une bouteille de ce format" size="sm"
        footer={<Button onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Enregistrer</Button>}>
        <Input label="Cote (€)" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <p className="text-xs text-stone-500 mt-2">Une cote saisie est prioritaire : la recherche automatique ne la remplace pas pendant 3 mois.</p>
      </Modal>
    </Card>
  );
};
