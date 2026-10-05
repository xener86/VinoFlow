// Fiche spiritueux (port Cockpit) : en-tête + chiffres clés, onglets
// Informations / Dégustation, bascule « collection prestige », suppression.

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Gem, Martini, Loader2, Sparkles } from 'lucide-react';
import { deleteSpirit, saveSpirit } from '../services/storageService';
import { useSpirits } from '../hooks/useSpirits';
import { Spirit } from '../types';
import { Button, Badge, Card, MonoLabel, Tabs, EmptyState } from '../components/cockpit/primitives';
import { useToast, useConfirm } from '../components/cockpit/feedback';
import { spiritLabel, spiritDot, levelTone } from '../components/bar/spiritMeta';

type Tab = 'info' | 'tasting';

const SectionCard: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
  <Card className={`p-5 ${className}`}>
    <MonoLabel className="block mb-3">{label}</MonoLabel>
    {children}
  </Card>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; children?: React.ReactNode }> = ({ label, value, children }) => (
  <div className="rounded-md border border-stone-200 bg-stone-50/60 px-3 py-2.5 min-w-0">
    <MonoLabel>{label}</MonoLabel>
    <div className="serif text-xl text-stone-900 mt-0.5 truncate">{value}</div>
    {children}
  </div>
);

const SERVING = [
  { title: 'Pur', text: 'À température ambiante pour apprécier tous les arômes.' },
  { title: 'Sur glace', text: 'Pour adoucir et rafraîchir.' },
  { title: 'En cocktail', text: 'Base idéale pour des créations mixologiques.' },
];

export const SpiritDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmAction = useConfirm();

  const { spirits, loading, refresh } = useSpirits();

  const [spirit, setSpirit] = useState<Spirit | null>(null);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [savingLuxury, setSavingLuxury] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && id) {
      setSpirit(spirits.find(s => s.id === id) ?? null);
      setReady(true);
    }
  }, [id, spirits, loading]);

  const handleDelete = async () => {
    if (!spirit) return;
    const ok = await confirmAction({
      title: `Supprimer ${spirit.name} ?`,
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteSpirit(spirit.id);
      await refresh();
      toast.success(`${spirit.name} supprimé du bar.`);
      navigate('/bar');
    } catch {
      toast.error('La suppression a échoué.');
      setDeleting(false);
    }
  };

  const toggleLuxury = async () => {
    if (!spirit || savingLuxury) return;
    const previous = spirit;
    const updated = { ...spirit, isLuxury: !spirit.isLuxury };
    setSpirit(updated); // mise à jour optimiste
    setSavingLuxury(true);
    try {
      await saveSpirit(updated);
      toast.success(updated.isLuxury
        ? 'Rangé dans la collection prestige — exclu des cocktails IA.'
        : 'Disponible pour les cocktails.');
      await refresh();
    } catch {
      setSpirit(previous);
      toast.error("La modification n'a pas pu être enregistrée.");
    } finally {
      setSavingLuxury(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex items-center gap-2 text-stone-500 py-12">
        <Loader2 className="animate-spin w-4 h-4" /> Chargement…
      </div>
    );
  }

  if (!spirit) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <h1 className="serif text-2xl text-stone-900 mb-2">Spiritueux introuvable</h1>
        <p className="text-stone-500 mb-4">Cette bouteille n'existe plus dans le bar.</p>
        <Button onClick={() => navigate('/bar')}>Retour au bar</Button>
      </div>
    );
  }

  // Champs rétrocompatibles (anciens noms éventuels côté données)
  const s = spirit as any;
  const alcoholContent = s.alcoholContent ?? s.abv;
  const volume = s.volume ?? s.format;
  const quantity = s.quantity ?? s.inventoryLevel;
  const isInventoryPercentage = s.quantity === undefined && s.inventoryLevel !== undefined;
  const formattedQuantity = (() => {
    if (quantity === undefined || quantity === null) return undefined;
    if (typeof quantity === 'number') return `${Math.max(0, quantity)}${isInventoryPercentage ? '%' : ''}`;
    return quantity;
  })();
  const origin = s.origin ?? [s.region, s.country].filter(Boolean).join(' · ');
  const barrelType = s.barrelType ?? s.caskType;
  const aromas: string[] = (s.aromas ?? s.aromaProfile ?? []).filter(Boolean);
  const notes = s.notes;
  const finish = s.finish;
  const brand = s.brand ?? spirit.distillery;
  const hasTasting = !!spirit.tastingNotes || aromas.length > 0 || !!finish;

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <Link to="/bar" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-wine-700 mb-4 min-h-10">
        <ArrowLeft className="w-4 h-4" /> Retour au bar
      </Link>

      {/* Hero */}
      <Card className="p-5 md:p-8 mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 mono text-[10px] tracking-widest uppercase text-stone-600">
            <span className={`w-2.5 h-2.5 rounded-full ${spiritDot(spirit.category)}`} />
            {spiritLabel(spirit.category)}
          </span>
          {spirit.enrichedByAi && <Badge tone="neutral"><Sparkles className="w-3 h-3 mr-1" />ENRICHI PAR IA</Badge>}
          {spirit.isLuxury && <Badge tone="rare">PRESTIGE</Badge>}
        </div>

        <h1 className="serif-it text-3xl md:text-4xl text-stone-900 leading-tight break-words">{spirit.name}</h1>
        <div className="text-stone-600 mt-1">{brand}</div>
        {origin && <div className="mono text-[11px] tracking-widest text-stone-500 uppercase mt-1">{origin}</div>}

        {/* Chiffres clés */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-5">
          {alcoholContent !== undefined && alcoholContent !== null && <Stat label="Alcool" value={`${alcoholContent}%`} />}
          {volume !== undefined && volume !== null && <Stat label="Volume" value={`${volume} ml`} />}
          {formattedQuantity !== undefined && (
            <Stat label="Niveau" value={formattedQuantity}>
              {isInventoryPercentage && typeof quantity === 'number' && (
                <div className="mt-2 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                  <div className={`h-full ${levelTone(quantity)}`} style={{ width: `${Math.max(0, Math.min(100, quantity))}%` }} />
                </div>
              )}
            </Stat>
          )}
          {spirit.age && <Stat label="Âge" value={spirit.age} />}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-5 border-t border-stone-100">
          <Button
            variant={spirit.isLuxury ? 'subtle' : 'outline'}
            onClick={toggleLuxury}
            disabled={savingLuxury}
            aria-pressed={spirit.isLuxury}
            title="Les bouteilles de prestige sont exclues des cocktails générés par l'IA"
          >
            {savingLuxury
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : spirit.isLuxury ? <Gem className="w-4 h-4 text-amber-600" /> : <Martini className="w-4 h-4" />}
            {spirit.isLuxury ? 'Collection prestige' : 'Disponible pour cocktails'}
          </Button>
          <div className="flex-1" />
          <Link
            to={`/spirit/${spirit.id}/edit`}
            className="inline-flex items-center justify-center gap-1.5 font-medium rounded-md h-10 md:h-9 px-3.5 text-sm border border-stone-300 bg-white hover:bg-stone-50 text-stone-700"
          >
            <Edit className="w-4 h-4" />Modifier
          </Link>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Supprimer
          </Button>
        </div>
      </Card>

      <Tabs<Tab>
        aria-label="Sections de la fiche"
        className="mb-5"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'info', label: 'Informations' },
          { key: 'tasting', label: 'Dégustation' },
        ]}
      />

      {activeTab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in">
          {spirit.description && (
            <SectionCard label="Description" className="md:col-span-2">
              <p className="text-stone-700 leading-relaxed">{spirit.description}</p>
            </SectionCard>
          )}

          {(spirit.distillery || barrelType) && (
            <SectionCard label="Production">
              <dl className="space-y-3 text-sm">
                {spirit.distillery && (
                  <div>
                    <dt className="text-stone-500 text-xs">Distillerie</dt>
                    <dd className="text-stone-900">{spirit.distillery}</dd>
                  </div>
                )}
                {barrelType && (
                  <div>
                    <dt className="text-stone-500 text-xs">Type de fût</dt>
                    <dd className="text-stone-900">{barrelType}</dd>
                  </div>
                )}
              </dl>
            </SectionCard>
          )}

          {spirit.culinaryPairings?.length > 0 && (
            <SectionCard label="Accords culinaires">
              <ul className="space-y-1.5 text-sm text-stone-700">
                {spirit.culinaryPairings.map((p, i) => (
                  <li key={i} className="flex gap-2"><span className="text-wine-700">·</span>{p}</li>
                ))}
              </ul>
            </SectionCard>
          )}

          {spirit.producerHistory && (
            <SectionCard label="Histoire du producteur" className="md:col-span-2">
              <p className="text-stone-700 leading-relaxed">{spirit.producerHistory}</p>
            </SectionCard>
          )}

          {notes && (
            <SectionCard label="Notes personnelles" className="md:col-span-2 bg-amber-50/40">
              <p className="serif-it text-stone-800 leading-relaxed">« {notes} »</p>
            </SectionCard>
          )}

          {!spirit.description && !spirit.distillery && !barrelType && !spirit.producerHistory && !notes && !(spirit.culinaryPairings?.length > 0) && (
            <Card className="md:col-span-2">
              <EmptyState
                title="Pas encore d'informations."
                hint="Complétez la fiche"
                action={<Button variant="outline" onClick={() => navigate(`/spirit/${spirit.id}/edit`)}><Edit className="w-4 h-4" />Modifier</Button>}
              />
            </Card>
          )}
        </div>
      )}

      {activeTab === 'tasting' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in">
          {spirit.tastingNotes && (
            <SectionCard label="Notes de dégustation" className="md:col-span-2">
              <p className="text-stone-800 leading-relaxed md:text-lg">{spirit.tastingNotes}</p>
            </SectionCard>
          )}

          {aromas.length > 0 && (
            <SectionCard label="Profil aromatique">
              <div className="flex flex-wrap gap-1.5">
                {aromas.map((aroma, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-700">{aroma}</span>
                ))}
              </div>
            </SectionCard>
          )}

          {finish && (
            <SectionCard label="Finale">
              <p className="text-stone-700 leading-relaxed">{finish}</p>
            </SectionCard>
          )}

          {spirit.suggestedCocktails?.length > 0 && (
            <SectionCard label="Cocktails suggérés">
              <ul className="space-y-1.5 text-sm text-stone-700">
                {spirit.suggestedCocktails.map((c, i) => (
                  <li key={i} className="flex gap-2"><Martini className="w-3.5 h-3.5 text-stone-400 mt-0.5 shrink-0" />{c}</li>
                ))}
              </ul>
            </SectionCard>
          )}

          <SectionCard label="Suggestions de service">
            <ul className="space-y-3">
              {SERVING.map(item => (
                <li key={item.title} className="flex gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-wine-700 mt-2 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-stone-800">{item.title}</div>
                    <div className="text-sm text-stone-600">{item.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          {!hasTasting && (
            <Card className="md:col-span-2">
              <EmptyState
                title="Aucune note de dégustation."
                hint="Modifiez ce spiritueux pour ajouter vos impressions"
                action={<Button variant="outline" onClick={() => navigate(`/spirit/${spirit.id}/edit`)}><Edit className="w-4 h-4" />Modifier</Button>}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
