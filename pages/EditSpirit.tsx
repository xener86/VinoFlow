// Édition d'un spiritueux (port Cockpit) : identité + détails de dégustation.

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { saveSpirit } from '../services/storageService';
import { useSpirits } from '../hooks/useSpirits';
import { Spirit, SpiritType } from '../types';
import { Button, Card, MonoLabel, Input, Select, Textarea } from '../components/cockpit/primitives';
import { useToast } from '../components/cockpit/feedback';
import { SPIRIT_LABELS } from '../components/bar/spiritMeta';

const parseList = (raw: string) => raw.split(',').map(s => s.trim()).filter(Boolean);

export const EditSpirit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const { spirits, loading, refresh } = useSpirits();

  // État local du formulaire (initialisé une seule fois à partir du hook)
  const [spirit, setSpirit] = useState<Spirit | null>(null);
  const [aromaText, setAromaText] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading || !id || spirit) return;
    const found = spirits.find(s => s.id === id);
    if (found) {
      setSpirit({ ...found });
      setAromaText((found.aromaProfile || []).join(', '));
    } else {
      setNotFound(true);
    }
  }, [id, loading, spirits, spirit]);

  const update = <K extends keyof Spirit>(key: K, value: Spirit[K]) =>
    setSpirit(prev => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spirit || saving) return;
    if (!spirit.name.trim()) {
      toast.error('Le nom est obligatoire.');
      return;
    }
    setSaving(true);
    try {
      await saveSpirit({ ...spirit, name: spirit.name.trim(), aromaProfile: parseList(aromaText) });
      await refresh();
      toast.success('Modifications enregistrées.');
      navigate(`/spirit/${spirit.id}`);
    } catch {
      toast.error("L'enregistrement a échoué. Veuillez réessayer.");
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <h1 className="serif text-2xl text-stone-900 mb-2">Spiritueux introuvable</h1>
        <p className="text-stone-500 mb-4">Cette bouteille n'existe plus dans le bar.</p>
        <Button onClick={() => navigate('/bar')}>Retour au bar</Button>
      </div>
    );
  }

  if (!spirit) {
    return (
      <div className="flex items-center gap-2 text-stone-500 py-12">
        <Loader2 className="animate-spin w-4 h-4" /> Chargement…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <Link to={`/spirit/${spirit.id}`} className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-wine-700 mb-4 min-h-10">
        <ArrowLeft className="w-4 h-4" /> Retour à la fiche
      </Link>

      <div className="mb-5">
        <MonoLabel>VINOFLOW · BAR</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Modifier le spiritueux</h1>
        <div className="text-[12px] text-stone-500 mt-0.5 truncate">{spirit.name}</div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <Card className="p-5 md:p-6">
          <MonoLabel className="block mb-4">Identité</MonoLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              wrapperClassName="sm:col-span-2"
              label="Nom"
              required
              value={spirit.name}
              onChange={e => update('name', e.target.value)}
            />
            <Input
              label="Distillerie"
              value={spirit.distillery}
              onChange={e => update('distillery', e.target.value)}
            />
            <Select
              label="Catégorie"
              value={spirit.category}
              onChange={e => update('category', e.target.value as SpiritType)}
            >
              {Object.values(SpiritType).map(type => (
                <option key={type} value={type}>{SPIRIT_LABELS[type]}</option>
              ))}
            </Select>
            <Input
              label="Région"
              value={spirit.region || ''}
              onChange={e => update('region', e.target.value)}
            />
            <Input
              label="Pays"
              value={spirit.country || ''}
              onChange={e => update('country', e.target.value)}
            />
            <Input
              label="Âge"
              value={spirit.age || ''}
              onChange={e => update('age', e.target.value)}
              placeholder="ex : 12 ans"
            />
            <Input
              label="Degré (% vol.)"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={100}
              value={spirit.abv ?? ''}
              onChange={e => update('abv', Number(e.target.value))}
            />
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <MonoLabel className="block mb-4">Détails</MonoLabel>
          <div className="space-y-4">
            <Textarea
              label="Description"
              rows={3}
              value={spirit.description || ''}
              onChange={e => update('description', e.target.value)}
              className="resize-y"
            />
            <Textarea
              label="Notes de dégustation"
              rows={3}
              value={spirit.tastingNotes || ''}
              onChange={e => update('tastingNotes', e.target.value)}
              className="resize-y"
            />
            <Input
              label="Profil aromatique"
              hint="Séparés par des virgules"
              value={aromaText}
              onChange={e => setAromaText(e.target.value)}
              placeholder="ex : vanille, fruits secs, tourbe"
            />
          </div>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => navigate(`/spirit/${spirit.id}`)} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </div>
  );
};
