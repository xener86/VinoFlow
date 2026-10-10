// Compositeur d'une carte des vins de dîner partagée : titre, date, vins de
// la cave dans l'ordre de service, plat facultatif ; « Enregistrer et
// partager » crée (ou modifie, même jeton) puis ouvre la feuille de partage.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, Copy, Loader2, Plus, Share2, X } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { createDinnerShare, getShare, updateDinnerShare } from '../services/storageService';
import { filterShareCandidates, moveItem, serverMessage, shareUrl, typeDotClass } from '../utils/shareView';
import { shareLink } from '../utils/shareLink';
import { useToast } from '../components/cockpit/feedback';
import { Button, Card, Input, MonoLabel } from '../components/cockpit/primitives';

interface DinnerItem { wineId: string; dish: string }

export const ShareDinner: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { wines, loading: loadingWines } = useWines();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [items, setItems] = useState<DinnerItem[]>([]);
  const [query, setQuery] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [loadingShare, setLoadingShare] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);

  // Modification : charge la carte existante.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingShare(true);
    getShare(id)
      .then((share) => {
        if (cancelled) return;
        setTitle(share.title ?? '');
        setDate(share.dinnerDate ?? '');
        setItems(share.items.map((i) => ({ wineId: i.wineId, dish: i.dish ?? '' })));
        setToken(share.token);
        setRevoked(Boolean(share.revokedAt));
      })
      .catch(() => { if (!cancelled) toast.error('Carte introuvable.'); })
      .finally(() => { if (!cancelled) setLoadingShare(false); });
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Depuis la fiche vin : ?wine=<id> pré-remplit la carte.
  useEffect(() => {
    const wineId = search.get('wine');
    if (!wineId || id) return;
    setItems((prev) => (prev.some((i) => i.wineId === wineId) ? prev : [...prev, { wineId, dish: '' }]));
  }, [search, id]);

  const byId = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const candidates = useMemo(() => filterShareCandidates(wines, query), [wines, query]);

  const addWine = (wineId: string) => {
    setItems((prev) => [...prev, { wineId, dish: '' }]);
    setQuery('');
  };
  const setDish = (index: number, dish: string) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, dish } : it)));
  const remove = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => setItems((prev) => moveItem(prev, index, index + delta));

  const doShare = async (t: string) => {
    const outcome = await shareLink(shareUrl(t), title.trim() || 'Carte des vins');
    if (outcome === 'copied') toast.success('Lien copié');
    else if (outcome === 'failed') toast.error('Impossible de partager le lien ; copie-le depuis Réglages → Liens partagés.');
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Donne un titre à la carte.'); return; }
    if (items.length === 0) { toast.error('Ajoute au moins un vin à la carte.'); return; }
    setSaving(true);
    try {
      const input = { title: title.trim(), date: date || null, items: items.map((i) => ({ wineId: i.wineId, dish: i.dish.trim() || null })) };
      const res = id ? await updateDinnerShare(id, input) : await createDinnerShare(input);
      setToken(res.token);
      if (!id) navigate(`/partages/diner/${res.id}`, { replace: true });
      await doShare(res.token);
    } catch (e) {
      toast.error(serverMessage(e, 'L’enregistrement a échoué.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingWines || loadingShare) {
    return <div className="flex items-center gap-2 text-stone-500 py-12"><Loader2 className="animate-spin w-4 h-4" /> Chargement…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <Link to="/settings" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Réglages
      </Link>
      <div className="mb-5">
        <MonoLabel>PARTAGE · CARTE DE DÎNER</MonoLabel>
        <h1 className="serif text-2xl md:text-3xl text-stone-900 leading-tight mt-1">{id ? 'Modifier la carte' : 'Nouvelle carte de dîner'}</h1>
        <p className="text-sm text-stone-500 mt-1">Les invités verront les vins dans l’ordre, avec leur description et tes notes de dégustation. Jamais les prix ni le stock.</p>
      </div>

      {revoked && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
          Ce lien a été révoqué : il ne peut plus être modifié. Crée une <Link to="/partages/diner" className="underline">nouvelle carte</Link>.
        </div>
      )}

      <Card className="p-4 md:p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Dîner du samedi" wrapperClassName="sm:col-span-2" disabled={revoked} />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={revoked} />
        </div>
      </Card>

      <Card className="p-4 md:p-5 mb-4">
        <MonoLabel>◌ Vins · {items.length}</MonoLabel>
        <h2 className="serif-it text-xl text-stone-900 mt-0.5 mb-3">Dans l’ordre de service</h2>
        {items.length === 0 && <p className="text-sm text-stone-400 italic mb-3">Aucun vin pour l’instant.</p>}
        <ol className="space-y-2">
          {items.map((item, index) => {
            const wine = byId.get(item.wineId);
            return (
              <li key={`${item.wineId}-${index}`} className="rounded-md bg-stone-50 p-3">
                <div className="flex items-start gap-3">
                  <span className="mono text-[11px] tracking-widest text-wine-700 mt-1">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${typeDotClass(wine?.type ?? null)}`} />
                      <span className="font-medium text-stone-900 truncate">{wine ? wine.name : 'Vin supprimé'}</span>
                      {wine?.vintage && <span className="mono text-xs text-stone-500">{wine.vintage}</span>}
                    </div>
                    {wine?.producer && <div className="text-xs text-stone-500 truncate">{wine.producer}</div>}
                    <input
                      value={item.dish}
                      onChange={(e) => setDish(index, e.target.value)}
                      maxLength={200}
                      placeholder="Servi avec…"
                      disabled={revoked}
                      className="mt-2 w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-wine-600/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button type="button" onClick={() => move(index, -1)} disabled={revoked || index === 0} aria-label="Monter" className="p-1.5 rounded text-stone-500 hover:text-wine-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => move(index, 1)} disabled={revoked || index === items.length - 1} aria-label="Descendre" className="p-1.5 rounded text-stone-500 hover:text-wine-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => remove(index)} disabled={revoked} aria-label="Retirer" className="p-1.5 rounded text-stone-500 hover:text-wine-700 disabled:opacity-30"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {!revoked && items.length < 20 && (
          <div className="mt-4">
            <Input label="Ajouter un vin" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, cuvée, producteur, appellation, millésime…" />
            <ul className="mt-2 divide-y divide-stone-100 rounded-md border border-stone-200 bg-white">
              {candidates.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => addWine(w.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-stone-50">
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${typeDotClass(w.type)}`} />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-stone-900">{w.name}</span>
                      {w.vintage && <span className="mono text-xs text-stone-500 ml-2">{w.vintage}</span>}
                      <span className="block text-xs text-stone-500 truncate">{[w.producer, w.appellation].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`mono text-[10px] shrink-0 ${w.inventoryCount > 0 ? 'text-stone-500' : 'text-stone-300'}`}>×{w.inventoryCount}</span>
                    <Plus className="w-4 h-4 text-wine-700 shrink-0" />
                  </button>
                </li>
              ))}
              {candidates.length === 0 && <li className="px-3 py-2.5 text-sm text-stone-400 italic">Aucun vin ne correspond.</li>}
            </ul>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving || revoked}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          Enregistrer et partager
        </Button>
        {token && (
          <Button variant="outline" onClick={() => doShare(token)} disabled={revoked}>
            <Copy className="w-4 h-4" />Copier le lien
          </Button>
        )}
      </div>
    </div>
  );
};
