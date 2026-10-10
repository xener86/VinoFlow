// Compositeur de carte des vins d'un dîner : titre, date, vins de la cave dans
// l'ordre de service, plat associé ; puis partage du lien public.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Loader2, Share2, X } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { createDinnerShare, getDinnerShare, updateDinnerShare } from '../services/storageService';
import { absoluteUrl, moveItem, searchWines } from '../utils/shareView';
import { shareOrCopy } from '../utils/shareLink';
import { Button, Card, Input, MonoLabel } from '../components/cockpit/primitives';
import { useToast } from '../components/cockpit/feedback';
import { ShareLinkDialog } from '../components/cockpit/ShareLinkDialog';

interface Item { wineId: string; dish: string; label: string }

export const ShareDinner: React.FC = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { wines } = useWines();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const [shareFallback, setShareFallback] = useState<string | null>(null);

  const label = (w: { name: string | null; producer?: string | null; vintage?: number | null }) =>
    [w.name, w.producer, w.vintage].filter(Boolean).join(' · ');

  // Modification d'une carte existante.
  useEffect(() => {
    if (!id) return;
    getDinnerShare(id)
      .then(d => {
        setTitle(d.title);
        setDate(d.dinnerDate || '');
        setItems(d.items.map(i => ({ wineId: i.wineId, dish: i.dish || '', label: label(i) })));
      })
      // Supprimée, identifiant fantaisiste ou lien de fiche : rien à composer ici.
      .catch(() => { toast.error('Carte introuvable.'); navigate('/settings', { replace: true }); })
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // « Carte de dîner » depuis une fiche : le vin est ajouté d'office.
  useEffect(() => {
    const wineId = params.get('wine');
    if (id || !wineId || items.length) return;
    const w = wines.find(x => x.id === wineId);
    if (w) setItems([{ wineId: w.id, dish: '', label: label(w) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wines, params, id]);

  const results = useMemo(() => searchWines(wines, query, 8, items.map(i => i.wineId)), [wines, query, items]);

  const add = (w: (typeof wines)[number]) => {
    setItems(list => [...list, { wineId: w.id, dish: '', label: label(w) }]);
    setQuery('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { title: title.trim(), date: date || null, items: items.map(i => ({ wineId: i.wineId, dish: i.dish.trim() || null })) };
      const link = id ? await updateDinnerShare(id, body) : await createDinnerShare(body);
      const url = absoluteUrl(link.url);
      const result = await shareOrCopy({ title: body.title, url });
      if (result === 'copied') toast.success('Carte enregistrée, lien copié');
      else if (result === 'failed') setShareFallback(url);
      else toast.success('Carte enregistrée');
      if (!id) navigate(`/partages/diner/${link.id}`, { replace: true });
    } catch (e) {
      toast.error(`Enregistrement impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
    } finally {
      setSaving(false);
    }
  };

  const canSave = title.trim().length > 0 && items.length > 0 && items.length <= 20 && !saving;

  if (!loaded) return <div className="text-center text-stone-500 py-20">Chargement…</div>;

  return (
    <div className="max-w-[720px] mx-auto pb-28 md:pb-0">
      <ShareLinkDialog url={shareFallback} title={title.trim() || 'Carte des vins'} onClose={() => setShareFallback(null)} />
      <div className="mb-5">
        <MonoLabel>VINOFLOW · PARTAGE</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">{id ? 'Modifier la carte' : 'Carte des vins d’un dîner'}</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">Tes invités l’ouvrent sans compte ; tes notes de dégustation y apparaissent ensuite.</div>
      </div>

      <Card className="p-4 space-y-3">
        <Input label="Titre" placeholder="ex. Dîner chez nous" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
        <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Card>

      <Card className="p-4 mt-4">
        <MonoLabel>Vins, dans l’ordre de service</MonoLabel>
        {items.length === 0 && <p className="text-sm text-stone-500 mt-2">Ajoute les vins du dîner ci-dessous.</p>}
        <ol className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${item.wineId}-${index}`} className="border border-stone-200 rounded-md p-2.5">
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-stone-400 w-5">{index + 1}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-stone-900">{item.label}</span>
                <button aria-label="Monter" onClick={() => setItems(l => moveItem(l, index, -1))} className="h-9 w-9 inline-flex items-center justify-center rounded hover:bg-stone-100"><ArrowUp className="w-4 h-4" /></button>
                <button aria-label="Descendre" onClick={() => setItems(l => moveItem(l, index, 1))} className="h-9 w-9 inline-flex items-center justify-center rounded hover:bg-stone-100"><ArrowDown className="w-4 h-4" /></button>
                <button aria-label="Retirer" onClick={() => setItems(l => l.filter((_, i) => i !== index))} className="h-9 w-9 inline-flex items-center justify-center rounded text-stone-400 hover:text-wine-700"><X className="w-4 h-4" /></button>
              </div>
              <Input aria-label="Servi avec" placeholder="Servi avec… (facultatif)" value={item.dish} maxLength={200} wrapperClassName="mt-2"
                onChange={e => setItems(l => l.map((x, i) => (i === index ? { ...x, dish: e.target.value } : x)))} />
            </li>
          ))}
        </ol>

        {items.length < 20 && (
          <div className="mt-4">
            <Input label="Ajouter un vin" placeholder="Nom, producteur, appellation, millésime…" value={query} onChange={e => setQuery(e.target.value)} />
            {results.length > 0 && (
              <ul className="mt-2 border border-stone-200 rounded-md divide-y divide-stone-100">
                {results.map(w => (
                  <li key={w.id}>
                    <button onClick={() => add(w)} className="w-full text-left px-3 py-2.5 hover:bg-stone-50 text-sm">
                      <span className="text-stone-900">{w.name}</span>
                      <span className="text-stone-500"> · {[w.producer, w.vintage].filter(Boolean).join(' · ')}{w.inventoryCount > 0 ? ` · ×${w.inventoryCount}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="fixed md:static inset-x-0 bottom-16 z-30 md:z-auto bg-white/95 md:bg-transparent backdrop-blur md:backdrop-blur-none border-t border-stone-200 md:border-0 px-4 py-3 md:p-0 md:mt-5">
        <Button size="lg" className="w-full" disabled={!canSave} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          {id ? 'Enregistrer et partager' : 'Créer et partager'}
        </Button>
      </div>
    </div>
  );
};
