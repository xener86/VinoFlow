// Cockpit Tasting express.
// 3 blocs verticaux selon le pivot verdict/pourquoi/futur :
//   1. Verdict (note + claque)
//   2. Pourquoi (qu'est-ce qui sublime, contexte plat/occasion)
//   3. Futur (rachet ?, similaires ?, retenir pour grande occasion ?)
//   + champ libre + photo

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Loader2, Camera, ArrowLeft, Star } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { saveTastingNote } from '../services/storageService';
import { Card, MonoLabel, Button, Badge, Chip } from '../components/cockpit/primitives';
import { CellarWine } from '../types';

const SUBLIMATING_FACTORS = [
  { id: 'pairing',  emoji: '🍽️', label: "L'accord avec le plat" },
  { id: 'moment',   emoji: '🌅', label: 'Le moment / l\'ambiance' },
  { id: 'vintage',  emoji: '📅', label: 'Le millésime / la maturité' },
  { id: 'aeration', emoji: '💨', label: 'L\'aération / décantage' },
  { id: 'wine',     emoji: '🍷', label: 'Le vin en lui-même' },
  { id: 'company',  emoji: '🤝', label: 'La compagnie / le partage' },
  { id: 'nothing',  emoji: '❌', label: 'Rien de spécial' },
];

const OCCASIONS = ['Apéro', 'Dîner', 'Festif', 'À deux', 'Solo', 'Découverte'];

const REPURCHASE = [
  { id: 'yes', label: 'Oui' },
  { id: 'maybe', label: 'Peut-être' },
  { id: 'no', label: 'Non' },
];

export const CockpitTasting: React.FC = () => {
  const { wineId: paramWineId } = useParams<{ wineId?: string }>();
  const navigate = useNavigate();
  const { wines, loading } = useWines();

  // Step 1: choose the wine
  const [wineId, setWineId] = useState<string>(paramWineId || '');
  const wine = useMemo(() => wines.find(w => w.id === wineId), [wineId, wines]);

  // Verdict
  const [rating, setRating] = useState(7); // 1-10
  const [claque, setClaque] = useState<'YES' | 'NO' | 'MEH' | null>(null);

  // Pourquoi
  const [factors, setFactors] = useState<Set<string>>(new Set());
  const [dish, setDish] = useState('');
  const [occasion, setOccasion] = useState<string>('');

  // Futur
  const [repurchase, setRepurchase] = useState<string>('');
  const [similar, setSimilar] = useState<boolean | null>(null);
  const [keep, setKeep] = useState(false);

  // Champ libre
  const [phrase, setPhrase] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFactor = (id: string) => {
    setFactors(f => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleSave = async () => {
    if (!wine) return;
    setSaving(true);
    setError(null);
    try {
      // Convert rating from 1-10 to 0-5 stars to match existing TastingNote shape
      const ratingStars = Math.round((rating / 10) * 5);
      await saveTastingNote({
        wineId: wine.id,
        wineName: wine.name,
        wineVintage: wine.vintage,
        date: new Date().toISOString(),
        rating: ratingStars,
        notes: phrase,
        // Verdict + reasons stored in generalNotes for now (until backend
        // schema gains explicit fields)
        generalNotes: JSON.stringify({
          score10: rating,
          claque,
          factors: [...factors],
          dish,
          occasion,
          repurchase,
          similar,
          keep,
          phrase,
        }),
        visual: 0,
        visualNotes: '',
        nose: [],
        body: 0,
        acidity: 0,
        tannin: 0,
        finish: 0,
      } as any);
      navigate(`/wine/${wine.id}`);
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  // ───── Step 1: choose wine ─────
  if (!wineId || !wine) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-5">
          <MonoLabel>VINOFLOW · DÉGUSTATION</MonoLabel>
          <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Tasting express</h1>
          <div className="text-[12px] text-stone-500 mt-0.5">Note ce que tu bois en moins d'une minute.</div>
        </div>
        <Card className="p-6">
          <MonoLabel>◌ Choisis le vin</MonoLabel>
          <h2 className="serif text-xl text-stone-900 dark:text-white mt-1 mb-4">Tu bois quoi ?</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-stone-500"><Loader2 className="animate-spin w-4 h-4" /> Chargement…</div>
          ) : (
            <select
              value={wineId}
              onChange={e => setWineId(e.target.value)}
              className="w-full h-11 px-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm outline-none focus:ring-2 focus:ring-wine-600/40 text-stone-700 dark:text-stone-300"
            >
              <option value="">Sélectionne un vin de ta cave…</option>
              {wines
                .filter(w => (w.inventoryCount || 0) > 0 || true)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(w => (
                  <option key={w.id} value={w.id}>
                    {w.producer ? `${w.producer} — ` : ''}{w.name} {w.vintage || ''}
                  </option>
                ))}
            </select>
          )}
        </Card>
      </div>
    );
  }

  // ───── Step 2: form ─────
  return (
    <div className="max-w-3xl mx-auto pb-10">
      <Link to={`/wine/${wine.id}`} className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-wine-700 mb-5">
        <ArrowLeft className="w-4 h-4" /> Retour à la fiche vin
      </Link>

      <div className="mb-5">
        <MonoLabel>VINOFLOW · DÉGUSTATION</MonoLabel>
        <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Tasting express</h1>
        <div className="serif-it text-stone-700 dark:text-stone-300 text-lg mt-2">{wine.name} · {wine.vintage}</div>
      </div>

      {/* ───── Bloc 1 : Verdict ───── */}
      <Card className="p-6 mb-4">
        <MonoLabel>◌ Verdict — 5s</MonoLabel>
        <h2 className="serif text-xl text-stone-900 dark:text-white mt-1 mb-4">Tu as aimé ?</h2>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-stone-600 dark:text-stone-400">Note globale</span>
            <span className="serif text-3xl text-wine-700 font-medium">{rating}<span className="text-base text-stone-500"> / 10</span></span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={rating}
            onChange={e => setRating(parseInt(e.target.value))}
            className="w-full accent-wine-700"
          />
          <div className="flex justify-between text-[10px] text-stone-400 mono mt-1">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            <span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>
          </div>
        </div>

        <div>
          <div className="text-sm text-stone-600 dark:text-stone-400 mb-2">C'était une claque ?</div>
          <div className="flex gap-2">
            {(['YES', 'MEH', 'NO'] as const).map(v => (
              <Chip
                key={v}
                active={claque === v}
                onClick={() => setClaque(v)}
              >
                {v === 'YES' ? '⭐ Oui' : v === 'MEH' ? 'Pas vraiment' : '🤷 Non'}
              </Chip>
            ))}
          </div>
        </div>
      </Card>

      {/* ───── Bloc 2 : Pourquoi ───── */}
      <Card className="p-6 mb-4">
        <MonoLabel>◌ Pourquoi — 15s</MonoLabel>
        <h2 className="serif text-xl text-stone-900 dark:text-white mt-1 mb-4">Qu'est-ce qui a sublimé ce vin ?</h2>

        <div className="flex flex-wrap gap-2 mb-5">
          {SUBLIMATING_FACTORS.map(f => (
            <Chip
              key={f.id}
              active={factors.has(f.id)}
              onClick={() => toggleFactor(f.id)}
            >
              <span className="mr-1">{f.emoji}</span>{f.label}
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Plat associé</div>
            <input
              type="text"
              value={dish}
              onChange={e => setDish(e.target.value)}
              placeholder="ex: agneau aux herbes"
              className="w-full h-10 px-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm outline-none focus:ring-2 focus:ring-wine-600/40 text-stone-700 dark:text-stone-300"
            />
          </div>
          <div>
            <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Occasion</div>
            <div className="flex flex-wrap gap-1.5">
              {OCCASIONS.map(o => (
                <Chip key={o} active={occasion === o} onClick={() => setOccasion(occasion === o ? '' : o)}>
                  {o}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ───── Bloc 3 : Pour la suite ───── */}
      <Card className="p-6 mb-4">
        <MonoLabel>◌ Pour la suite — 5s</MonoLabel>
        <h2 className="serif text-xl text-stone-900 dark:text-white mt-1 mb-4">Et après ?</h2>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-stone-600 dark:text-stone-400 mb-2">Tu rachètes le même ?</div>
            <div className="flex gap-2">
              {REPURCHASE.map(r => (
                <Chip key={r.id} active={repurchase === r.id} onClick={() => setRepurchase(repurchase === r.id ? '' : r.id)}>
                  {r.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-stone-600 dark:text-stone-400 mb-2">Tu cherches des vins similaires ?</div>
            <div className="flex gap-2">
              <Chip active={similar === true} onClick={() => setSimilar(similar === true ? null : true)}>Oui</Chip>
              <Chip active={similar === false} onClick={() => setSimilar(similar === false ? null : false)}>Non</Chip>
            </div>
          </div>

          <div>
            <div className="text-sm text-stone-600 dark:text-stone-400 mb-2">À retenir pour grande occasion ?</div>
            <Chip active={keep} onClick={() => setKeep(!keep)}>
              <Star className="w-3 h-3" />
              {keep ? 'Oui — favori contextuel' : 'Marquer'}
            </Chip>
          </div>
        </div>
      </Card>

      {/* ───── Bloc 4 : Phrase libre ───── */}
      <Card className="p-6 mb-4">
        <MonoLabel>◌ Optionnel — 15s</MonoLabel>
        <h2 className="serif text-xl text-stone-900 dark:text-white mt-1 mb-4">Une phrase qui résume ?</h2>
        <textarea
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          placeholder="Une émotion, un détail marquant — pour ton futur toi qui relit dans 6 mois…"
          rows={3}
          className="w-full px-4 py-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm outline-none focus:ring-2 focus:ring-wine-600/40 text-stone-700 dark:text-stone-300 serif-it"
        />
      </Card>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 p-3 rounded-md text-sm mb-4">
          {error}
        </div>
      )}

      <Button size="lg" onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="animate-spin w-4 h-4" /> : null}
        {saving ? 'Sauvegarde…' : 'Enregistrer la dégustation'}
      </Button>
    </div>
  );
};
