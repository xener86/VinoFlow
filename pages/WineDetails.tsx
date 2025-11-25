import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getWineById, getInventory, consumeBottle } from '../services/storageService';
import { Wine, Bottle } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { ArrowLeft, Edit3, MapPin, Calendar, Grape, Wine as WineIcon, Utensils, Sparkles, Trash2, Star } from 'lucide-react';

export const WineDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wine, setWine] = useState<Wine | null>(null);
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [showConsumeModal, setShowConsumeModal] = useState(false);

  useEffect(() => {
    if (id) {
      const w = getWineById(id);
      if (w) {
        setWine(w);
        const inv = getInventory();
        setBottles(inv.filter(b => b.wineId === id));
      } else {
        navigate('/');
      }
    }
  }, [id, navigate]);

  const handleConsume = (bottleId: string) => {
    consumeBottle(bottleId);
    setBottles(bottles.filter(b => b.id !== bottleId));
    setShowConsumeModal(false);
  };

  if (!wine) return null;

  const typeColors: Record<string, string> = {
    RED: 'bg-red-600',
    WHITE: 'bg-amber-100 border border-amber-300',
    ROSE: 'bg-pink-300',
    SPARKLING: 'bg-yellow-200 border border-yellow-400',
    DESSERT: 'bg-amber-500',
  };

  return (
    <div className="max-w-4xl mx-auto pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="p-2 bg-white dark:bg-stone-900 rounded-full text-stone-400 hover:text-stone-800 dark:hover:text-white border border-stone-200 dark:border-stone-800 shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <button 
          onClick={() => navigate(`/wine/${id}/edit`)}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-stone-900 rounded-full text-stone-500 hover:text-stone-800 dark:hover:text-white border border-stone-200 dark:border-stone-800 shadow-sm text-sm"
        >
          <Edit3 size={16} /> Éditer
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg overflow-hidden">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-wine-50 via-white to-stone-50 dark:from-wine-950/30 dark:via-stone-900 dark:to-stone-950 p-8 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-start gap-4">
            <div className={`w-4 h-4 rounded-full mt-2 ${typeColors[wine.type] || 'bg-stone-400'}`}></div>
            <div className="flex-1">
              <h1 className="text-3xl font-serif text-stone-900 dark:text-white mb-2">{wine.name}</h1>
              <p className="text-lg text-stone-500 dark:text-stone-400">{wine.producer}</p>
              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-stone-500 dark:text-stone-400">
                <span className="flex items-center gap-1"><Calendar size={14} /> {wine.vintage}</span>
                <span className="flex items-center gap-1"><MapPin size={14} /> {wine.region}, {wine.country}</span>
                {wine.grapeVarieties.length > 0 && (
                  <span className="flex items-center gap-1"><Grape size={14} /> {wine.grapeVarieties.join(', ')}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-wine-600 dark:text-wine-500">{bottles.length}</div>
              <div className="text-xs text-stone-500 uppercase">bouteilles</div>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="p-8 grid md:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Description */}
            {wine.sensoryDescription && (
              <div>
                <h3 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-3 flex items-center gap-2">
                  <WineIcon size={14} /> Description
                </h3>
                <p className="text-stone-600 dark:text-stone-300 italic leading-relaxed">
                  "{wine.sensoryDescription}"
                </p>
              </div>
            )}

            {/* Food Pairings */}
            {wine.suggestedFoodPairings && wine.suggestedFoodPairings.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-3 flex items-center gap-2">
                  <Utensils size={14} /> Accords Mets-Vins
                </h3>
                <div className="flex flex-wrap gap-2">
                  {wine.suggestedFoodPairings.map((pairing, i) => (
                    <span 
                      key={i}
                      className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-full text-sm"
                    >
                      {pairing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Badge */}
            {wine.enrichedByAI && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 rounded-lg w-fit">
                <Sparkles size={14} /> Enrichi par l'IA
              </div>
            )}
          </div>

          {/* Right Column - Sensory Profile */}
          <div>
            {wine.sensoryProfile && (
              <div className="bg-stone-50 dark:bg-stone-950/50 rounded-xl p-6 border border-stone-100 dark:border-stone-800">
                <h3 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-4 text-center">
                  Profil Sensoriel
                </h3>
                <FlavorRadar data={wine.sensoryProfile} size={220} />
              </div>
            )}
          </div>
        </div>

        {/* Bottles Section */}
        {bottles.length > 0 && (
          <div className="border-t border-stone-200 dark:border-stone-800 p-8">
            <h3 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-4">
              Mes Bouteilles ({bottles.length})
            </h3>
            <div className="space-y-2">
              {bottles.slice(0, 5).map((bottle) => (
                <div 
                  key={bottle.id}
                  className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-950/50 rounded-lg border border-stone-100 dark:border-stone-800"
                >
                  <div className="flex items-center gap-3">
                    <WineIcon size={16} className="text-wine-500" />
                    <span className="text-sm text-stone-600 dark:text-stone-300">
                      {bottle.rackId ? `Étagère ${bottle.rackId}` : 'Non placée'}
                      {bottle.position && ` - Position ${bottle.position.row + 1}×${bottle.position.col + 1}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleConsume(bottle.id)}
                    className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                    title="Consommer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {bottles.length > 5 && (
                <p className="text-xs text-stone-500 text-center mt-2">
                  +{bottles.length - 5} autres bouteilles
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-stone-200 dark:border-stone-800 p-6 flex gap-4">
          <button
            onClick={() => setShowConsumeModal(true)}
            disabled={bottles.length === 0}
            className="flex-1 bg-wine-600 hover:bg-wine-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
          >
            <WineIcon size={18} /> Ouvrir une bouteille
          </button>
          <button
            onClick={() => navigate('/map')}
            className="px-6 py-3 border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            <MapPin size={18} />
          </button>
        </div>
      </div>

      {/* Consume Modal */}
      {showConsumeModal && bottles.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowConsumeModal(false)}>
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-serif text-stone-900 dark:text-white mb-4">Quelle bouteille ?</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {bottles.map((bottle) => (
                <button
                  key={bottle.id}
                  onClick={() => handleConsume(bottle.id)}
                  className="w-full flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-wine-500 transition-colors text-left"
                >
                  <span className="text-sm text-stone-600 dark:text-stone-300">
                    {bottle.rackId ? `Étagère ${bottle.rackId}` : 'Non placée'}
                  </span>
                  <WineIcon size={16} className="text-wine-500" />
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowConsumeModal(false)}
              className="w-full mt-4 py-2 text-stone-500 hover:text-stone-800 dark:hover:text-white text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
