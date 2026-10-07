// Rafale : une photo d'étiquette par vin, à la suite (carton, salon). Le
// brouillon reste sur le téléphone ; les photos sont lues dès que possible ;
// tout est enregistré d'un coup (cave, envies, dégustations).
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Loader2 } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useQuickAddQueue } from '../hooks/useQuickAddQueue';
import { saveQuickAdd } from '../services/storageService';
import { loadLabelImage } from '../utils/labelImage';
import { buildPayload, summarize } from '../utils/quickAddQueue';
import { QuickAddCard } from '../components/cockpit/QuickAddCard';
import { Button, EmptyState, Input, MonoLabel } from '../components/cockpit/primitives';
import { useConfirm, useToast } from '../components/cockpit/feedback';

export const CockpitQuickAdd: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirmAction = useConfirm();
  const { wines, refresh } = useWines();
  const q = useQuickAddQueue(wines);
  const photoInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const s = summarize(q.lines);

  // Écran ouvert hors ligne : la cave est rechargée au retour du réseau pour le rapprochement.
  useEffect(() => {
    const reload = () => { refresh(); };
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [refresh]);

  const onPhoto = async (files: FileList | null) => {
    for (const file of Array.from(files || [])) {
      try {
        const img = await loadLabelImage(file);
        await q.addPhoto(img.base64);
      } catch {
        toast.error('Photo illisible.');
      }
    }
    if (photoInput.current) photoInput.current.value = '';
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await saveQuickAdd(buildPayload(q.meta, q.lines));
      if (res.ok && res.result) {
        const r = res.result.summary;
        // Seules les lignes enregistrées disparaissent ; une photo prise pendant l'envoi reste.
        const remaining = await q.finishSave(res.result);
        await refresh();
        if (res.result.replay) toast.info('Cette rafale avait déjà été enregistrée : les changements faits depuis sur ces lignes n’ont pas été pris en compte.');
        else toast.success(`Rafale enregistrée : ${r.bottlesAdded} bouteille(s), ${r.wishlistAdded} envie(s), ${r.tastingsAdded} dégustation(s).`, { label: 'Ranger', onClick: () => navigate('/plan') });
        if (remaining === 0) navigate('/add-wine');
        return;
      }
      for (const l of res.lines || []) await q.update(l.clientId, { error: l.message });
      toast.error(res.error || 'L’enregistrement a échoué.');
    } finally {
      setSaving(false);
    }
  };

  const onClear = async () => {
    if (await confirmAction({ title: 'Vider la rafale ?', message: 'Les photos et les saisies de cette rafale seront effacées du téléphone.', confirmLabel: 'Vider' })) await q.clearAll();
  };

  const ordered = [...q.lines].reverse();

  return (
    <div className="max-w-[720px] mx-auto pb-44 md:pb-24">
      <div className="mb-4">
        <MonoLabel>VINOFLOW · RAFALE</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Rafale</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">
          Une photo d'étiquette par vin. {q.persistent ? 'Brouillon gardé sur ce téléphone.' : 'Brouillon non conservé si tu fermes l’app.'}
        </div>
      </div>

      <div className="flex items-end gap-2 mb-4">
        <Input label="Occasion" placeholder="ex. Salon des vins de Loire" value={q.meta.occasion} onChange={e => q.setOccasion(e.target.value)} wrapperClassName="flex-1" />
        {q.lines.length > 0 && <Button variant="ghost" onClick={onClear}>Vider</Button>}
      </div>

      {q.lines.length === 0
        ? <EmptyState title="Aucune photo pour l’instant" hint="Prends l’étiquette de chaque vin, l’une après l’autre." />
        : <div className={`space-y-3 ${saving ? 'pointer-events-none opacity-60' : ''}`}>{ordered.map(line => (
            <QuickAddCard key={line.id} line={line} wines={wines} onChange={change => q.update(line.id, change)} onEdit={patch => q.editLine(line.id, patch)} onRemove={() => q.remove(line.id)} />
          ))}</div>}

      <div className="fixed md:sticky inset-x-0 bottom-16 md:bottom-0 z-30 bg-white/95 backdrop-blur border-t border-stone-200 px-4 py-3 space-y-2">
        <label className={`flex items-center justify-center gap-2 h-11 rounded-md border border-stone-300 bg-white text-stone-800 cursor-pointer ${!q.ready || saving ? 'opacity-50 pointer-events-none' : ''}`}>
          <Camera className="w-4 h-4" /> Photo suivante
          <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={e => onPhoto(e.target.files)} />
        </label>
        <Button size="lg" className="w-full" disabled={saving || s.lines === 0 || s.blocking > 0} onClick={onSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {s.blocking > 0 ? `${s.blocking} ligne(s) à finir` : `Enregistrer ${s.lines} ligne(s)`}
        </Button>
        {s.lines > 0 && (
          <div className="text-center text-[11px] text-stone-500">
            {s.cellar} en cave · {s.bottles} btl · {s.wishlist} envie(s) · {s.tastings} dégustation(s)
          </div>
        )}
      </div>
    </div>
  );
};
