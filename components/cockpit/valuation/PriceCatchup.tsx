import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button, EmptyState, MonoLabel, Skeleton } from '../primitives';
import { useToast } from '../feedback';
import { getMissingPrices, saveMissingPrices } from '../../../services/storageService';
import { MissingPriceRow } from '../../../types';

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erreur inconnue');
const label = (r: MissingPriceRow) => [r.name, r.cuvee].filter(Boolean).join(' ');

/** Rattrapage des prix d'achat : un prix par vin, appliqué à ses bouteilles sans prix. */
export const PriceCatchup: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const toast = useToast();
  const [rows, setRows] = useState<MissingPriceRow[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = () => getMissingPrices().then(setRows).catch((e) => toast.error('Liste indisponible : ' + errMsg(e)));
  useEffect(() => { load(); }, []);

  const filled = useMemo(
    () => Object.entries(prices)
      .map(([wineId, v]) => ({ wineId, priceEur: Number(v.replace(',', '.')) }))
      .filter((i) => Number.isFinite(i.priceEur) && i.priceEur > 0),
    [prices],
  );

  const save = async () => {
    setSaving(true);
    try {
      const { updated } = await saveMissingPrices(filled);
      toast.success(`${updated} bouteille(s) mises à jour`);
      setPrices({});
      await load();
      onDone?.();
    } catch (e) {
      toast.error("L'enregistrement a échoué : " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (!rows) return <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>;
  if (rows.length === 0) return <EmptyState title="Tous les prix d’achat sont renseignés" hint="La valeur investie est complète." />;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <MonoLabel>◌ {rows.length} vin(s) sans prix d’achat</MonoLabel>
        <Button size="sm" onClick={save} disabled={saving || filled.length === 0}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer {filled.length > 0 ? `(${filled.length})` : ''}
        </Button>
      </div>
      <div className="divide-y divide-stone-100 border border-stone-200 rounded-md bg-white">
        {rows.map((r) => (
          <label key={r.wineId} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 min-w-0">
              <span className="serif-it text-stone-900 truncate block">{label(r)}</span>
              <span className="text-[11px] text-stone-500">{[r.vintage, r.format, `${r.missing} bt sans prix`].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                aria-label={`Prix d’achat de ${label(r)}`}
                placeholder={r.suggestedPrice != null ? String(r.suggestedPrice) : '—'}
                value={prices[r.wineId] ?? ''}
                onChange={(e) => setPrices((p) => ({ ...p, [r.wineId]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && filled.length > 0) save(); }}
                className="w-24 h-9 rounded-md border border-stone-300 px-2 text-right text-sm tabular-nums focus:border-wine-600 focus:ring-2 focus:ring-wine-600/30 outline-none"
              />
              <span className="text-sm text-stone-500">€</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-stone-500 mt-2">Le prix s’applique aux bouteilles de ce vin qui n’en ont pas ; un prix déjà saisi n’est jamais modifié. En grisé : la dernière cote connue.</p>
    </div>
  );
};
