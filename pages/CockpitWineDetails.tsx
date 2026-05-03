// Cockpit-style wine details page.
// Lean redesign: cockpit aesthetic with the essentials only.
// Sections: header / sensory profile / aromas / tasting history / bottles / actions.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Edit, Loader2, Plus, Heart, Sparkles, ChefHat, MapPin,
  Wine as WineIcon, Trash2,
} from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { useTastingNotes } from '../hooks/useTastingNotes';
import { useRacks } from '../hooks/useRacks';
import {
  toggleFavorite, addBottles, consumeSpecificBottle, getWineHistory,
} from '../services/storageService';
import { getPeakWindow, getPeakBadgeStyles } from '../utils/peakWindow';
import { FlavorRadar } from '../components/FlavorRadar';
import { AromaConfidenceBadge } from '../components/AromaConfidenceBadge';
import { Card, MonoLabel, Button, Badge } from '../components/cockpit/primitives';
import { JournalEntry, Bottle } from '../types';

const typeLabel = (type: string) => {
  switch (type) {
    case 'RED': return 'Rouge';
    case 'WHITE': return 'Blanc';
    case 'ROSE': return 'Rosé';
    case 'SPARKLING': return 'Pétillant';
    case 'DESSERT': return 'Dessert';
    case 'FORTIFIED': return 'Fortifié';
    default: return type;
  }
};

const typeAccent = (type: string) => {
  switch (type) {
    case 'RED': return 'bg-wine-700 text-white';
    case 'WHITE': return 'bg-amber-300 text-stone-900';
    case 'ROSE': return 'bg-pink-400 text-white';
    case 'SPARKLING': return 'bg-cyan-400 text-stone-900';
    default: return 'bg-stone-400 text-white';
  }
};

export const CockpitWineDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { wines, loading: loadingWines, refresh: refreshWines } = useWines();
  const { notes: allTastingNotes, refresh: refreshNotes } = useTastingNotes();
  const { racks } = useRacks();

  const wine = useMemo(() => wines.find(w => w.id === id), [id, wines]);
  const wineNotes = useMemo(() => allTastingNotes.filter(n => n.wineId === id), [allTastingNotes, id]);

  const [history, setHistory] = useState<JournalEntry[]>([]);
  useEffect(() => {
    if (id) getWineHistory(id).then(setHistory).catch(() => setHistory([]));
  }, [id]);

  const handleToggleFavorite = async () => {
    if (!wine) return;
    await toggleFavorite(wine.id);
    refreshWines();
  };

  const handleAddBottle = async () => {
    if (!wine) return;
    await addBottles(wine.id, 1, 'Non trié', wine.name, wine.vintage);
    refreshWines();
  };

  const handleConsume = async (bottle: Bottle) => {
    if (!wine) return;
    if (!confirm(`Consommer cette bouteille de ${wine.name} ?`)) return;
    await consumeSpecificBottle(wine.id, bottle.id, wine.name, wine.vintage);
    refreshWines();
  };

  if (loadingWines) {
    return (
      <div className="flex items-center gap-2 text-stone-500 py-12">
        <Loader2 className="animate-spin w-4 h-4" /> Chargement…
      </div>
    );
  }

  if (!wine) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <h1 className="serif text-2xl text-stone-900 dark:text-white mb-2">Vin introuvable</h1>
        <p className="text-stone-500 mb-4">Ce vin n'existe plus dans la cave.</p>
        <Button onClick={() => navigate('/cave')}>Retour à la cave</Button>
      </div>
    );
  }

  const peak = getPeakWindow(wine);
  const peakStyles = getPeakBadgeStyles(peak.status);

  // Last tasting score
  const lastNote = wineNotes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const avgRating = wineNotes.length > 0
    ? wineNotes.reduce((s, n) => s + (n.rating || 0), 0) / wineNotes.length
    : null;

  // Bottles by location
  const activeBottles = wine.bottles?.filter(b => !b.isConsumed) || [];

  return (
    <div className="max-w-5xl mx-auto pb-10">
      {/* Header with back link */}
      <Link to="/cave" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-wine-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Retour à la cave
      </Link>

      {/* Hero */}
      <Card className="p-6 md:p-8 mb-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className={`mono text-[10px] tracking-widest px-2 py-0.5 rounded ${typeAccent(wine.type)}`}>
              {typeLabel(wine.type)}
            </span>
            {wine.appellation && (
              <span className="mono text-[10px] tracking-widest text-stone-500 uppercase">{wine.appellation}</span>
            )}
            <span className={`mono text-[10px] tracking-widest px-2 py-0.5 rounded ${peakStyles.bg} ${peakStyles.text}`}>
              {peak.status} · {peak.peakStart}–{peak.peakEnd}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleFavorite}
              className={`p-2 rounded-md border border-stone-200 dark:border-stone-700 transition-colors ${wine.isFavorite ? 'bg-wine-50 dark:bg-wine-900/20 text-wine-700' : 'text-stone-400 hover:text-wine-700'}`}
              title={wine.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              aria-label="Favori"
            >
              <Heart className={`w-4 h-4 ${wine.isFavorite ? 'fill-current' : ''}`} />
            </button>
            <Link to={`/wine/${wine.id}/edit`}>
              <Button variant="outline" size="sm"><Edit className="w-3.5 h-3.5" />Editer</Button>
            </Link>
          </div>
        </div>

        <h1 className="serif text-3xl md:text-4xl text-stone-900 dark:text-white leading-tight">
          {wine.name}
        </h1>
        {wine.cuvee && <div className="serif-it text-xl text-wine-700 dark:text-wine-500 mt-1">{wine.cuvee}</div>}
        <div className="text-stone-600 dark:text-stone-400 mt-2 text-sm">
          {wine.producer && <span>{wine.producer} · </span>}
          <span className="mono">{wine.vintage}</span>
          {wine.region && <span> · {wine.region}</span>}
        </div>

        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-stone-50 dark:bg-stone-800/40 rounded-md p-3">
            <MonoLabel>EN STOCK</MonoLabel>
            <div className="serif text-2xl text-stone-900 dark:text-white mt-1">{wine.inventoryCount} <span className="text-base text-stone-500">btl</span></div>
          </div>
          <div className="bg-stone-50 dark:bg-stone-800/40 rounded-md p-3">
            <MonoLabel>NOTE MOYENNE</MonoLabel>
            <div className="serif text-2xl text-stone-900 dark:text-white mt-1">
              {avgRating !== null ? <>{avgRating.toFixed(1)} <span className="text-base text-stone-500">/ 5</span></> : <span className="text-stone-400">—</span>}
            </div>
          </div>
          <div className="bg-stone-50 dark:bg-stone-800/40 rounded-md p-3">
            <MonoLabel>DÉGUSTATIONS</MonoLabel>
            <div className="serif text-2xl text-stone-900 dark:text-white mt-1">{wineNotes.length}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <Button onClick={handleAddBottle}><Plus className="w-3.5 h-3.5" />Ajouter une bouteille</Button>
          <Link to={`/tasting/${wine.id}`}>
            <Button variant="outline"><WineIcon className="w-3.5 h-3.5" />Je viens de boire</Button>
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-5">
        {/* ───── Profil sensoriel ───── */}
        <Card className="col-span-12 lg:col-span-7 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <MonoLabel>◌ Profil sensoriel</MonoLabel>
              <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5">Caractère</h3>
            </div>
            <AromaConfidenceBadge
              source={(wine as any).aromaSource}
              confidence={(wine as any).aromaConfidence}
            />
          </div>

          {wine.sensoryDescription && (
            <p className="text-stone-700 dark:text-stone-300 italic leading-relaxed mb-4 text-sm">
              « {wine.sensoryDescription} »
            </p>
          )}

          <div className="grid grid-cols-2 gap-6 items-center">
            <div className="bg-stone-50 dark:bg-stone-800/30 rounded-md p-4">
              {wine.sensoryProfile ? <FlavorRadar data={wine.sensoryProfile} /> : <div className="text-stone-400 text-sm italic">Pas de profil</div>}
            </div>
            <div className="flex flex-wrap gap-1.5 content-start">
              {(wine.aromaProfile || []).map((aroma, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                  {aroma}
                </span>
              ))}
              {(!wine.aromaProfile || wine.aromaProfile.length === 0) && (
                <span className="text-stone-400 text-xs italic">Aucun arôme renseigné</span>
              )}
            </div>
          </div>
        </Card>

        {/* ───── Accords & cépages ───── */}
        <Card className="col-span-12 lg:col-span-5 p-6">
          <MonoLabel>◌ Cépages & accords</MonoLabel>
          <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">Sur la table</h3>

          {wine.grapeVarieties && wine.grapeVarieties.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] mono tracking-widest text-stone-500 uppercase mb-1.5">Cépages</div>
              <div className="flex flex-wrap gap-1.5">
                {wine.grapeVarieties.map((g, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-wine-50 dark:bg-wine-900/20 text-wine-800 dark:text-wine-300">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {wine.suggestedFoodPairings && wine.suggestedFoodPairings.length > 0 && (
            <div>
              <div className="text-[11px] mono tracking-widest text-stone-500 uppercase mb-1.5 flex items-center gap-1">
                <ChefHat className="w-3 h-3" /> Accords suggérés
              </div>
              <ul className="space-y-1 text-sm text-stone-700 dark:text-stone-300">
                {wine.suggestedFoodPairings.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-wine-500 flex-shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* ───── Bouteilles & emplacements ───── */}
        <Card className="col-span-12 lg:col-span-7 p-6">
          <MonoLabel>◌ Bouteilles · {activeBottles.length}</MonoLabel>
          <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">Emplacements</h3>

          {activeBottles.length > 0 ? (
            <ul className="space-y-1.5">
              {activeBottles.map((b, i) => {
                let locText = 'Non trié';
                if (typeof b.location === 'string') {
                  locText = b.location;
                } else if (b.location && typeof b.location === 'object' && 'rackId' in b.location) {
                  const loc = b.location as { rackId: string; x: number; y: number };
                  const rack = racks.find(r => r.id === loc.rackId);
                  locText = `${rack?.name || '?'} [${String.fromCharCode(65 + loc.y)}${loc.x + 1}]`;
                }
                return (
                  <li key={b.id} className="flex items-center justify-between py-2 px-3 rounded bg-stone-50 dark:bg-stone-800/30 text-sm">
                    <div className="flex items-center gap-3">
                      <MapPin className="w-3.5 h-3.5 text-stone-400" />
                      <span className="font-medium text-stone-700 dark:text-stone-300">{locText}</span>
                      {b.purchaseDate && (
                        <span className="mono text-[10px] text-stone-500">
                          Acheté le {new Date(b.purchaseDate).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleConsume(b)}
                      className="text-xs text-stone-500 hover:text-wine-700 px-2 py-1 rounded hover:bg-wine-50 dark:hover:bg-wine-900/20"
                    >
                      J'ai bu →
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-stone-400 text-sm italic">Plus aucune bouteille en stock.</div>
          )}
        </Card>

        {/* ───── Dégustations & journal ───── */}
        <Card className="col-span-12 lg:col-span-5 p-6">
          <MonoLabel>◌ Dégustations · {wineNotes.length}</MonoLabel>
          <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">Souvenirs</h3>

          {wineNotes.length > 0 ? (
            <ul className="space-y-3">
              {wineNotes.slice(0, 5).map(n => (
                <li key={n.id} className="border-b border-stone-100 dark:border-stone-800 pb-2 last:border-b-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="mono text-stone-500">{new Date(n.date).toLocaleDateString('fr-FR')}</span>
                    <span className="serif text-base text-wine-700 dark:text-wine-500 font-medium">{n.rating}/5</span>
                  </div>
                  {(n as any).pairedWith && (
                    <div className="text-[12px] text-stone-700 dark:text-stone-300 mt-1">{(n as any).pairedWith}</div>
                  )}
                  {n.notes && (
                    <div className="text-[12px] text-stone-600 dark:text-stone-400 italic mt-1 line-clamp-2">« {n.notes} »</div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-stone-400 text-sm italic">
              Aucune dégustation enregistrée.{' '}
              <Link to={`/tasting/${wine.id}`} className="text-wine-700 hover:underline">Note ta première</Link>.
            </div>
          )}
        </Card>

        {/* ───── Histoire / récit producteur ───── */}
        {wine.producerHistory && (
          <Card className="col-span-12 p-6">
            <MonoLabel>◌ Récit producteur</MonoLabel>
            <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">Le domaine</h3>
            <p className="text-stone-700 dark:text-stone-300 text-[13.5px] leading-relaxed whitespace-pre-line">
              {wine.producerHistory}
            </p>
          </Card>
        )}

        {/* ───── Activité récente ───── */}
        {history.length > 0 && (
          <Card className="col-span-12 p-6">
            <MonoLabel>◌ Activité · {history.length} entrées</MonoLabel>
            <h3 className="serif-it text-xl text-stone-900 dark:text-white mt-0.5 mb-3">Journal</h3>
            <ul className="space-y-1 text-sm">
              {history.slice(0, 10).map((e, i) => (
                <li key={e.id || i} className="grid grid-cols-12 gap-2 items-baseline border-b border-stone-100 dark:border-stone-800/50 py-1.5">
                  <span className="col-span-2 mono text-[10px] text-stone-500">
                    {new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="col-span-1 mono text-[10px] tracking-widest text-stone-500">[{e.type}]</span>
                  <span className="col-span-9 text-stone-700 dark:text-stone-300 truncate">
                    {e.description || `${e.wineName}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
};
