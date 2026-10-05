// Cockpit — édition de la fiche d'un vin.
// Seuls les champs d'identité / description sont envoyés (mise à jour partielle) :
// arômes et fenêtre d'apogée ne passent pas par ce formulaire, leur provenance
// (aroma_source / peak_source) reste donc intacte.

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { updateWine } from '../services/storageService';
import { useWines } from '../hooks/useWines';
import { Wine, WineType } from '../types';
import { Button, Card, EmptyState, Input, MonoLabel, Skeleton, Textarea } from '../components/cockpit/primitives';
import { useToast } from '../components/cockpit/feedback';

const TYPES: { value: WineType; label: string; dot: string }[] = [
  { value: 'RED', label: 'Rouge', dot: 'bg-wine-700' },
  { value: 'WHITE', label: 'Blanc', dot: 'bg-amber-300' },
  { value: 'ROSE', label: 'Rosé', dot: 'bg-pink-400' },
  { value: 'SPARKLING', label: 'Pétillant', dot: 'bg-cyan-400' },
  { value: 'DESSERT', label: 'Dessert', dot: 'bg-orange-400' },
  { value: 'FORTIFIED', label: 'Fortifié', dot: 'bg-stone-600' },
];

interface FormState {
  type: WineType;
  name: string;
  cuvee: string;
  parcel: string;
  producer: string;
  vintage: string;
  region: string;
  appellation: string;
  country: string;
  format: string;
  grapes: string;
  sensoryDescription: string;
  pairings: string;
}

const toForm = (w: Wine): FormState => ({
  type: w.type,
  name: w.name || '',
  cuvee: w.cuvee || '',
  parcel: w.parcel || '',
  producer: w.producer || '',
  vintage: w.vintage ? String(w.vintage) : '',
  region: w.region || '',
  appellation: w.appellation || '',
  country: w.country || '',
  format: w.format || '',
  grapes: (w.grapeVarieties || []).filter(Boolean).join(', '),
  sensoryDescription: w.sensoryDescription || '',
  pairings: (w.suggestedFoodPairings || []).filter(Boolean).join(', '),
});

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export const EditWine: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { wines, loading, refresh } = useWines();

  const [form, setForm] = useState<FormState | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // On n'initialise le formulaire qu'une fois par vin : un rafraîchissement
  // de l'inventaire en arrière-plan ne doit pas écraser la saisie en cours.
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !id || initializedFor.current === id) return;
    const found = wines.find((w) => w.id === id);
    if (found) {
      const f = toForm(found);
      setForm(f);
      setInitial(f);
      setNotFound(false);
      initializedFor.current = id;
    } else {
      setNotFound(true);
    }
  }, [id, loading, wines]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const dirty = !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial);
  const vintageNum = form ? Number(form.vintage) : NaN;
  const vintageError = form && form.vintage && (!Number.isInteger(vintageNum) || vintageNum < 1800 || vintageNum > 2100)
    ? 'Millésime invalide'
    : undefined;
  const canSave = !!form && form.name.trim().length > 0 && !vintageError && !saving;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !id || !canSave) return;
    setSaving(true);
    const updates: Partial<Wine> = {
      type: form.type,
      name: form.name.trim(),
      cuvee: form.cuvee.trim(),
      parcel: form.parcel.trim(),
      producer: form.producer.trim(),
      region: form.region.trim(),
      appellation: form.appellation.trim(),
      country: form.country.trim(),
      format: form.format.trim(),
      grapeVarieties: splitList(form.grapes),
      sensoryDescription: form.sensoryDescription,
      suggestedFoodPairings: splitList(form.pairings),
    };
    if (form.vintage) updates.vintage = vintageNum;
    try {
      await updateWine(id, updates);
      await refresh();
      toast.success('Fiche enregistrée');
      navigate(`/wine/${id}`);
    } catch (err: any) {
      toast.error(err?.message ? `Échec de l'enregistrement : ${err.message}` : "Échec de l'enregistrement");
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <EmptyState
            title="Vin introuvable"
            hint="Il a peut-être été supprimé"
            action={
              <Link to="/cave" className="inline-flex items-center h-10 md:h-9 px-3.5 rounded-md border border-stone-300 bg-white hover:bg-stone-50 text-sm text-stone-700 font-medium">
                Retour à la cave
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  if (loading || !form) {
    return (
      <div className="max-w-2xl mx-auto space-y-4" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* En-tête */}
      <div className="mb-5 flex items-start gap-3">
        <Link
          to={`/wine/${id}`}
          aria-label="Retour à la fiche"
          className="mt-1 h-10 w-10 md:h-9 md:w-9 shrink-0 inline-flex items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0">
          <MonoLabel>VINOFLOW · FICHE VIN</MonoLabel>
          <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Modifier la fiche</h1>
          <div className="serif-it text-stone-600 mt-0.5 truncate">
            {initial?.name}{initial?.vintage ? ` · ${initial.vintage}` : ''}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Identité */}
        <Card className="p-4 md:p-6 space-y-4">
          <div>
            <MonoLabel>◌ Identité</MonoLabel>
          </div>

          <fieldset>
            <legend className="mono block text-[10px] tracking-widest text-stone-500 uppercase mb-1.5">Couleur</legend>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => {
                const active = form.type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set('type', t.value)}
                    className={`h-11 md:h-9 px-2 rounded-md border text-sm inline-flex items-center justify-center gap-2 transition-colors ${
                      active
                        ? 'border-wine-700 bg-wine-50 text-wine-800 ring-1 ring-wine-700'
                        : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.dot}`} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Input
            label="Nom (domaine) *"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={form.name.trim() ? undefined : 'Le nom est obligatoire'}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Cuvée" value={form.cuvee} onChange={(e) => set('cuvee', e.target.value)} placeholder="ex. Les Caillottes" />
            <Input label="Parcelle / lieu-dit" value={form.parcel} onChange={(e) => set('parcel', e.target.value)} placeholder="ex. Monts de Milieu" />
            <Input label="Producteur" value={form.producer} onChange={(e) => set('producer', e.target.value)} />
            <Input
              label="Millésime"
              type="number"
              inputMode="numeric"
              value={form.vintage}
              onChange={(e) => set('vintage', e.target.value)}
              error={vintageError}
            />
            <Input label="Région" value={form.region} onChange={(e) => set('region', e.target.value)} />
            <Input label="Appellation" value={form.appellation} onChange={(e) => set('appellation', e.target.value)} placeholder="ex. Chablis Premier Cru" />
            <Input label="Pays" value={form.country} onChange={(e) => set('country', e.target.value)} />
            <Input label="Format" value={form.format} onChange={(e) => set('format', e.target.value)} placeholder="750ml" />
          </div>
        </Card>

        {/* Description */}
        <Card className="p-4 md:p-6 space-y-4">
          <MonoLabel>◌ Description</MonoLabel>
          <Input
            label="Cépages"
            hint="Séparés par des virgules"
            value={form.grapes}
            onChange={(e) => set('grapes', e.target.value)}
          />
          <Textarea
            label="Description sensorielle"
            rows={4}
            value={form.sensoryDescription}
            onChange={(e) => set('sensoryDescription', e.target.value)}
            className="resize-y"
          />
          <Input
            label="Accords mets-vins"
            hint="Séparés par des virgules"
            value={form.pairings}
            onChange={(e) => set('pairings', e.target.value)}
          />
        </Card>

        {/* Barre d'enregistrement : collée au-dessus de la navigation mobile */}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-20">
          <div className="rounded-md border border-stone-200 bg-white/95 backdrop-blur shadow-lg px-3 py-2.5 flex items-center gap-2">
            <span className="mono text-[10px] tracking-widest uppercase text-stone-500 flex-1 min-w-0 truncate">
              {saving ? 'Enregistrement…' : dirty ? 'Modifications non enregistrées' : 'Aucune modification'}
            </span>
            <Button type="button" variant="outline" onClick={() => navigate(`/wine/${id}`)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave || !dirty}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
