// Cockpit Add Wine — ajout rapide, pensé pour le téléphone « à la cave ».
// L'utilisateur tape l'étiquette (ex. "Pommard 1er Cru Rugiens 2018") :
// - si le vin est déjà en cave, un toucher ajoute une bouteille à sa fiche ;
// - sinon l'IA du navigateur propose une fiche (si configurée), et à défaut
//   la saisie manuelle (nom, millésime, couleur) suffit. Après création, la
//   cascade d'enrichissement serveur complète et source la fiche.

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Loader2, Plus, Minus, Check } from 'lucide-react';
import { saveWine, addBottles, requestWineEnrichment, identifyWine } from '../services/storageService';
import { useWines } from '../hooks/useWines';
import { CellarWine, Wine, WineType } from '../types';
import { Card, MonoLabel, Button, Skeleton, Badge, Input } from '../components/cockpit/primitives';
import { useToast } from '../components/cockpit/feedback';
import { parseFreeText, findExisting } from '../utils/findExisting';

const EXAMPLES = [
  'Pommard 1er Cru Rugiens 2018',
  'Sancerre Caillottes 2020',
  'Chablis Vaudésir 2019',
  'Côte-Rôtie La Landonne 2014',
];

const TYPES: { k: WineType; l: string; dot: string }[] = [
  { k: 'RED' as WineType, l: 'Rouge', dot: 'bg-wine-700' },
  { k: 'WHITE' as WineType, l: 'Blanc', dot: 'bg-amber-300' },
  { k: 'ROSE' as WineType, l: 'Rosé', dot: 'bg-pink-400' },
  { k: 'SPARKLING' as WineType, l: 'Bulles', dot: 'bg-cyan-400' },
  { k: 'DESSERT' as WineType, l: 'Moelleux', dot: 'bg-amber-500' },
  { k: 'FORTIFIED' as WineType, l: 'Muté', dot: 'bg-orange-700' },
];

export const CockpitAddWine: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { wines, refresh: refreshWines } = useWines();
  const [params] = useSearchParams();
  const routeState = useLocation().state as { prefill?: Partial<Wine>; text?: string } | null;

  // Pré-remplissage : wishlist (?name=&vintage=&producer=&type=) ou OCR (state.prefill)
  const prefill = useMemo<Partial<Wine>>(() => {
    if (routeState?.prefill) return routeState.prefill;
    const p: Partial<Wine> = {};
    if (params.get('name')) p.name = params.get('name')!;
    if (params.get('producer')) p.producer = params.get('producer')!;
    if (params.get('vintage')) p.vintage = parseInt(params.get('vintage')!) || undefined;
    if (params.get('type')) p.type = params.get('type') as WineType;
    return p;
  }, [params, routeState]);

  const [text, setText] = useState(() => routeState?.text || [prefill.producer, prefill.name, prefill.vintage].filter(Boolean).join(' '));
  const [thinking, setThinking] = useState(false);
  const [analysis, setAnalysis] = useState<Partial<Wine> | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  // Saisie manuelle (utilisée si l'IA n'a rien donné, ou pour corriger)
  const [type, setType] = useState<WineType | null>(prefill.type || null);
  const [producer, setProducer] = useState(prefill.producer || '');

  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const existing = useMemo(() => (text.trim().length >= 3 ? findExisting(wines, text) : []), [wines, text]);

  // Analyse IA différée pendant la frappe (facultative)
  useEffect(() => {
    if (aiUnavailable || !text.trim() || text.trim().length < 5) {
      setAnalysis(null);
      return;
    }
    const timer = setTimeout(async () => {
      setThinking(true);
      try {
        const { name, vintage } = parseFreeText(text);
        const result = await identifyWine(name, vintage || undefined, text);
        if (result) {
          setAnalysis({ ...result, name: result.name || name, vintage: result.vintage || vintage || undefined });
          if (result.type && !type) setType(result.type as WineType);
          if (result.producer && !producer) setProducer(result.producer);
        } else {
          setAnalysis(null);
        }
      } catch {
        // IA indisponible côté serveur (pas de clé, limite atteinte) : saisie manuelle.
        setAiUnavailable(true);
        setAnalysis(null);
      } finally {
        setThinking(false);
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, aiUnavailable]);

  const parsed = parseFreeText(text);
  const finalName = (analysis?.name || parsed.name).trim();
  const finalVintage = analysis?.vintage || parsed.vintage || prefill.vintage || null;
  const finalType = type || (analysis?.type as WineType) || null;
  const canSave = finalName.length >= 2 && !!finalType && !saving;

  const handleAddToExisting = async (w: CellarWine) => {
    setSaving(true);
    try {
      await addBottles(w.id, qty, 'Non trié', w.name, w.vintage, price ? parseFloat(price) : undefined);
      await refreshWines();
      toast.success(`${qty} bouteille${qty > 1 ? 's' : ''} ajoutée${qty > 1 ? 's' : ''} à ${w.name}`, { label: 'Ranger', onClick: () => navigate(`/plan?wine=${w.id}`) });
      navigate(`/wine/${w.id}`);
    } catch {
      toast.error('L’ajout a échoué.');
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const a = analysis || {};
    try {
      const wine: Wine = {
        id: crypto.randomUUID(),
        name: finalName,
        producer: producer.trim() || a.producer || '',
        vintage: finalVintage || new Date().getFullYear(),
        region: a.region || '',
        country: a.country || 'France',
        type: finalType!,
        grapeVarieties: a.grapeVarieties || [],
        format: a.format || '750ml',
        sensoryDescription: a.sensoryDescription || '',
        aromaProfile: a.aromaProfile || [],
        tastingNotes: a.tastingNotes || '',
        suggestedFoodPairings: a.suggestedFoodPairings || [],
        producerHistory: a.producerHistory || '',
        enrichedByAi: !!analysis,
        aiConfidence: a.aiConfidence || 'LOW',
        isFavorite: false,
        sensoryProfile: a.sensoryProfile || { body: 50, acidity: 50, tannin: 50, sweetness: 0, alcohol: 50, flavors: [] },
        cuvee: a.cuvee,
        appellation: a.appellation,
        personalNotes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const wineId = await saveWine(wine, qty, price ? parseFloat(price) : undefined);
      // Cascade serveur : sources vérifiées, arômes, apogée (1 à 3 min, en tâche de fond).
      const enriching = await requestWineEnrichment(wineId).then(() => true).catch(() => false);
      await refreshWines();
      toast.success(enriching ? 'Vin ajouté — recherche des informations en cours' : 'Vin ajouté', { label: 'Ranger', onClick: () => navigate(`/plan?wine=${wineId}`) });
      navigate(`/wine/${wineId}`);
    } catch (e: any) {
      toast.error('La sauvegarde a échoué.');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto pb-28 md:pb-0">
      <div className="mb-5">
        <MonoLabel>VINOFLOW · INVENTAIRE</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Ajouter un vin</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">Tape l'étiquette : on retrouve le vin s'il est déjà en cave, sinon on crée sa fiche.</div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* ───── Saisie ───── */}
        <div className="col-span-12 md:col-span-7 space-y-4">
          <Card className="p-4 md:p-6">
            <label htmlFor="label-text" className="block">
              <MonoLabel>◌ Étiquette</MonoLabel>
            </label>
            <textarea
              id="label-text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="ex. Pommard 1er Cru Rugiens 2018"
              rows={2}
              autoFocus
              enterKeyHint="done"
              className="mt-2 w-full px-4 py-3 rounded-md border border-stone-300 bg-white text-base outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600 serif-it text-stone-900"
            />
            {!text && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {EXAMPLES.map(e => (
                  <button
                    key={e}
                    onClick={() => setText(e)}
                    className="text-[11.5px] px-3 py-2 md:py-1 rounded-full border border-stone-200 text-stone-600 hover:border-stone-400 transition"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}

            {/* Déjà en cave ? */}
            {existing.length > 0 && (
              <div className="mt-4">
                <MonoLabel>Déjà en cave</MonoLabel>
                <ul className="mt-2 space-y-1.5">
                  {existing.map(w => (
                    <li key={w.id}>
                      <button
                        onClick={() => handleAddToExisting(w)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 rounded-md border border-stone-200 hover:border-wine-300 bg-white px-3 py-2.5 text-left"
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPES.find(t => t.k === w.type)?.dot || 'bg-stone-400'}`} />
                        <span className="flex-1 min-w-0">
                          <span className="serif-it text-stone-900 block truncate">{w.name}</span>
                          <span className="mono text-[10px] tracking-widest text-stone-500 uppercase">{[w.producer, w.vintage].filter(Boolean).join(' · ')} · ×{w.inventoryCount}</span>
                        </span>
                        <span className="mono text-[10px] tracking-widest text-wine-700 shrink-0">+{qty} BTL</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Fiche minimale (nouveau vin) */}
          {text.trim().length >= 3 && (
            <Card className="p-4 md:p-6 space-y-4">
              <MonoLabel>◌ Nouveau vin</MonoLabel>
              <div>
                <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Couleur</div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Couleur">
                  {TYPES.map(t => (
                    <button
                      key={t.k}
                      role="radio"
                      aria-checked={finalType === t.k}
                      onClick={() => setType(t.k)}
                      className={`h-10 md:h-8 px-3 rounded-md border text-sm inline-flex items-center gap-1.5 transition ${finalType === t.k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${t.dot}`} />{t.l}
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Producteur" value={producer} onChange={e => setProducer(e.target.value)} placeholder="facultatif" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Quantité</div>
                  <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-md p-1 w-fit">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Une bouteille de moins" className="w-10 h-10 md:w-8 md:h-8 rounded hover:bg-stone-200 inline-flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                    <span className="serif text-2xl text-stone-900 w-10 text-center tabular-nums">{qty}</span>
                    <button onClick={() => setQty(q => q + 1)} aria-label="Une bouteille de plus" className="w-10 h-10 md:w-8 md:h-8 rounded hover:bg-stone-200 inline-flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
                <Input label="Prix d'achat (€)" type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="—" />
              </div>
              <p className="text-xs text-stone-500">Les bouteilles arrivent en zone d’attente : range-les ensuite depuis le plan.</p>
            </Card>
          )}
        </div>

        {/* ───── Aperçu ───── */}
        <div className="col-span-12 md:col-span-5">
          <Card className="p-4 md:p-6 md:sticky md:top-20">
            <div className="flex items-center justify-between mb-4">
              <MonoLabel>◌ Aperçu</MonoLabel>
              {analysis && !thinking && <Badge tone="neutral">IA</Badge>}
            </div>
            {thinking ? (
              <div className="space-y-2.5">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="pt-2 grid grid-cols-2 gap-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
              </div>
            ) : finalName ? (
              <div>
                <div className="serif-it text-2xl text-stone-900 leading-tight">{finalName}</div>
                <div className="mono text-[11px] tracking-widest text-stone-500 mt-1">
                  {finalVintage || 'SANS MILLÉSIME'} · {analysis?.appellation || analysis?.region || '—'}
                </div>
                {analysis && (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
                    <PreviewField label="Région" value={analysis.region} />
                    <PreviewField label="Cépages" value={analysis.grapeVarieties?.join(', ')} />
                  </div>
                )}
                <p className="mt-4 text-xs text-stone-500 leading-relaxed">
                  Après l’ajout, la recherche web complète la fiche (arômes, apogée) avec des sources vérifiées.
                </p>
              </div>
            ) : (
              <div className="text-[13px] text-stone-500 italic py-6 text-center">L’aperçu apparaît dès que tu tapes.</div>
            )}
          </Card>
        </div>
      </div>

      {/* Barre d'action : collée au-dessus de la navigation mobile */}
      {text.trim().length >= 3 && (
        <div className="fixed md:static inset-x-0 bottom-16 z-30 md:z-auto bg-white/95 md:bg-transparent backdrop-blur md:backdrop-blur-none border-t border-stone-200 md:border-0 px-4 py-3 md:p-0 md:mt-5">
          <Button size="lg" disabled={!canSave} onClick={handleSave} className="w-full">
            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <Check className="w-4 h-4" />}
            {saving ? 'Ajout…' : !finalType ? 'Choisis la couleur' : `Créer la fiche · ${qty} btl`}
          </Button>
        </div>
      )}
    </div>
  );
};

const PreviewField: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-stone-50 rounded-md p-2">
    <div className="mono text-[9px] tracking-widest uppercase text-stone-500">{label}</div>
    <div className="text-stone-900 text-[13px] mt-0.5 truncate">{value || <span className="text-stone-400">—</span>}</div>
  </div>
);
