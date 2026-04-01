import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deleteSpirit, saveSpirit } from '../services/storageService';
import { useSpirits } from '../hooks/useSpirits'; // ✅ Import du Hook
import { Spirit } from '../types';
import { ArrowLeft, Edit, Trash2, Percent, Droplets, Clock, Sparkles, Wine, GlassWater, Gem, Martini, Flame, Loader2 } from 'lucide-react';

export const SpiritDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // ✅ Utilisation du Hook pour récupérer la liste
  const { spirits, loading, refresh } = useSpirits();
  
  const [spirit, setSpirit] = useState<Spirit | null>(null);
  const [activeTab, setActiveTab] = useState<'INFO' | 'TASTING'>('INFO');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ✅ Effet pour trouver le spiritueux une fois les données chargées
  useEffect(() => {
    if (!loading && id) {
        const found = spirits.find(s => s.id === id);
        if (found) {
            setSpirit(found);
        } else {
            navigate('/bar');
        }
    }
  }, [id, spirits, loading, navigate]);

  // ✅ Suppression Asynchrone
  const handleDelete = async () => {
    if (spirit) {
      await deleteSpirit(spirit.id); // Await
      await refresh(); // Refresh global list
      navigate('/bar');
    }
  };

  // ✅ Modification Asynchrone (Toggle Luxury)
  const toggleLuxury = async () => {
    if (spirit) {
      const updated = { ...spirit, isLuxury: !spirit.isLuxury };
      // Optimistic update pour réactivité immédiate
      setSpirit(updated); 
      
      await saveSpirit(updated);
      await refresh(); 
    }
  };

  // Gestion du loading
  if (loading || !spirit) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
              <Loader2 className="animate-spin text-amber-600" size={32} />
          </div>
      );
  }

  // Mapping des champs (support rétrocompatible des anciens noms si nécessaire)
  const alcoholContent = (spirit as any).alcoholContent ?? (spirit as any).abv;
  const volume = (spirit as any).volume ?? (spirit as any).format;
  const quantity = (spirit as any).quantity ?? (spirit as any).inventoryLevel;
  const isInventoryPercentage = (spirit as any).quantity === undefined && (spirit as any).inventoryLevel !== undefined;
  
  const formattedQuantity = (() => {
    if (quantity === undefined) return undefined;
    if (typeof quantity === 'number') {
      const value = quantity > 0 ? quantity : 0;
      return `${value}${isInventoryPercentage ? '%' : ''}`;
    }
    return quantity;
  })();

  const origin =
    (spirit as any).origin ??
    [(spirit as any).region, (spirit as any).country].filter(Boolean).join(' • ');
  const barrelType = (spirit as any).barrelType ?? (spirit as any).caskType;
  const aromas = (spirit as any).aromas ?? (spirit as any).aromaProfile;
  const notes = (spirit as any).notes;
  const finish = (spirit as any).finish;
  const brand = (spirit as any).brand ?? spirit.distillery;

  return (
    <div className="pb-32 animate-fade-in">
      {/* Header / Hero */}
      <div className="relative mb-6">
        <div className="absolute top-0 left-0 right-0 flex justify-between z-10">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 text-stone-400 hover:text-stone-800 dark:hover:text-white bg-white/80 dark:bg-stone-900/50 rounded-full backdrop-blur-sm shadow-sm border border-stone-200 dark:border-stone-800"
          >
            <ArrowLeft size={24} />
          </button>
          <button 
            onClick={() => navigate(`/spirit/${spirit.id}/edit`)}
            className="p-2 text-stone-400 hover:text-stone-800 dark:hover:text-white bg-white/80 dark:bg-stone-900/50 rounded-full backdrop-blur-sm shadow-sm border border-stone-200 dark:border-stone-800"
          >
            <Edit size={20} />
          </button>
        </div>
        
        <div className="pt-10 flex flex-col items-center text-center">
          <div className="px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-4 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 border border-amber-100 dark:border-amber-900/50">
            {spirit.category}
          </div>
          <h1 className="text-4xl font-serif text-stone-900 dark:text-white mb-2 leading-tight">{spirit.name}</h1>
          
          {/* Badges Collection / Disponibilité */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={toggleLuxury}
              className={`px-3 py-1 rounded-full text-xs font-medium tracking-wide transition-all ${
                spirit.isLuxury
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 flex items-center gap-1.5'
                  : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30 flex items-center gap-1.5'
              }`}
            >
              {spirit.isLuxury ? (
                <>
                  <Gem size={12} />
                  <span>Collection Prestige</span>
                </>
              ) : (
                <>
                  <Martini size={12} />
                  <span>Disponible pour cocktails</span>
                </>
              )}
            </button>
          </div>

          <p className="text-stone-600 dark:text-stone-400 text-lg">{brand}</p>
          {origin && (
            <p className="text-stone-500 text-sm">{origin}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-stone-100 dark:bg-stone-900 rounded-xl mb-6 border border-stone-200 dark:border-stone-800">
        <button 
          onClick={() => setActiveTab('INFO')}
          className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'INFO' 
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' 
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
          }`}
        >
          Informations
        </button>
        <button 
          onClick={() => setActiveTab('TASTING')}
          className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'TASTING' 
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' 
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
          }`}
        >
          Dégustation
        </button>
      </div>

      {/* Content */}
      <div className="space-y-6">
        
        {/* TAB: INFO */}
        {activeTab === 'INFO' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Description */}
            {spirit.description && (
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <h3 className="font-serif text-lg text-stone-900 dark:text-white mb-3">Description</h3>
                <p className="text-stone-700 dark:text-stone-300 leading-relaxed">
                  {spirit.description}
                </p>
              </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
              {alcoholContent !== undefined && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
                      <Percent size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-stone-900 dark:text-white">{alcoholContent}%</p>
                      <p className="text-xs text-stone-500">Alcool</p>
                    </div>
                  </div>
                </div>
              )}
              
              {volume !== undefined && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Droplets size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-stone-900 dark:text-white">{volume}ml</p>
                      <p className="text-xs text-stone-500">Volume</p>
                    </div>
                  </div>
                </div>
              )}

              {formattedQuantity !== undefined && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-wine-600 dark:text-wine-500">
                      <Wine size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-stone-900 dark:text-white">{formattedQuantity}</p>
                      <p className="text-xs text-stone-500">Stock</p>
                    </div>
                  </div>
                </div>
              )}

              {spirit.age && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-orange-600 dark:text-orange-400">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-stone-900 dark:text-white">{spirit.age}</p>
                      <p className="text-xs text-stone-500">Âge</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Détails Grid */}
            {(spirit.distillery || barrelType) && (
              <div className="grid gap-4">
                {spirit.distillery && (
                  <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <div className="flex items-center gap-2 text-stone-500 mb-2">
                      <Flame size={16} />
                      <span className="text-xs uppercase font-bold">Distillerie</span>
                    </div>
                    <p className="text-stone-800 dark:text-stone-200 text-sm">{spirit.distillery}</p>
                  </div>
                )}

                {barrelType && (
                  <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <div className="flex items-center gap-2 text-stone-500 mb-2">
                      <Wine size={16} />
                      <span className="text-xs uppercase font-bold">Type de Fût</span>
                    </div>
                    <p className="text-stone-800 dark:text-stone-200">{barrelType}</p>
                  </div>
                )}
              </div>
            )}

            {/* Histoire du Producteur */}
            {spirit.producerHistory && (
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 relative overflow-hidden shadow-sm">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                  <GlassWater size={120} />
                </div>
                <div className="relative z-10">
                  <h3 className="font-serif text-xl text-stone-900 dark:text-white mb-4">Histoire du Producteur</h3>
                  <div className="prose prose-invert prose-stone max-w-none">
                    <p className="text-stone-700 dark:text-stone-300 leading-relaxed">
                      {spirit.producerHistory}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Notes Personnelles */}
            {notes && (
              <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-2xl border border-amber-200 dark:border-amber-900/50">
                <h3 className="font-serif text-lg text-amber-900 dark:text-amber-200 mb-3">Notes Personnelles</h3>
                <p className="text-amber-800 dark:text-amber-300 leading-relaxed italic">
                  "{notes}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB: TASTING */}
        {activeTab === 'TASTING' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Tasting Notes */}
            {spirit.tastingNotes && (
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-wine-600 dark:text-wine-400">
                  <Sparkles size={18} />
                  <h3 className="font-serif text-lg text-stone-900 dark:text-white">Notes de Dégustation</h3>
                </div>
                <p className="text-stone-700 dark:text-stone-300 leading-relaxed text-lg">
                  {spirit.tastingNotes}
                </p>
              </div>
            )}

            {/* Aromas */}
            {aromas && aromas.length > 0 && (
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <h3 className="font-serif text-lg text-stone-900 dark:text-white mb-4">Profil Aromatique</h3>
                <div className="flex flex-wrap gap-2">
                  {aromas.map((aroma: string, i: number) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-sm border border-stone-200 dark:border-stone-700"
                    >
                      {aroma}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Finish */}
            {finish && (
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 p-6 rounded-2xl border border-orange-200 dark:border-orange-900/50">
                <h3 className="font-serif text-lg text-orange-900 dark:text-orange-200 mb-3">Finale</h3>
                <p className="text-orange-800 dark:text-orange-300 leading-relaxed">
                  {finish}
                </p>
              </div>
            )}

            {/* Suggestions de Cocktails */}
            {spirit.suggestedCocktails && spirit.suggestedCocktails.length > 0 && (
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-indigo-600 dark:text-indigo-400">
                  <Martini size={18} />
                  <h3 className="font-serif text-lg text-stone-900 dark:text-white">Suggestions de Cocktails</h3>
                </div>
                <ul className="space-y-3">
                  {spirit.suggestedCocktails.map((cocktail, i) => (
                    <li key={i} className="flex items-start gap-3 text-stone-700 dark:text-stone-300">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500/50"></span>
                      {cocktail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Serving Suggestions */}
            <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
              <h3 className="font-serif text-lg text-stone-900 dark:text-white mb-4">Suggestions de Service</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-wine-500 mt-2"></div>
                  <div>
                    <p className="font-medium text-stone-800 dark:text-stone-200">Neat (Pur)</p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">À température ambiante pour apprécier tous les arômes</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-wine-500 mt-2"></div>
                  <div>
                    <p className="font-medium text-stone-800 dark:text-stone-200">Sur Glace</p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">Pour adoucir et rafraîchir</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-wine-500 mt-2"></div>
                  <div>
                    <p className="font-medium text-stone-800 dark:text-stone-200">Cocktails</p>
                    <p className="text-sm text-stone-600 dark:text-stone-400">Base idéale pour des créations mixologiques</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Empty State */}
            {!spirit.tastingNotes && (!aromas || aromas.length === 0) && !finish && (
              <div className="bg-stone-50 dark:bg-stone-900/30 p-12 rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 text-center">
                <GlassWater size={48} className="mx-auto mb-4 text-stone-400" />
                <h3 className="font-serif text-xl text-stone-600 dark:text-stone-400 mb-2">
                  Aucune note de dégustation
                </h3>
                <p className="text-stone-500 dark:text-stone-500 text-sm">
                  Éditez ce spiritueux pour ajouter vos impressions
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div 
            className="absolute inset-0 bg-stone-900/50 dark:bg-black/80 backdrop-blur-sm" 
            onClick={() => setShowDeleteModal(false)} 
          />
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Trash2 size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-serif text-stone-900 dark:text-white">Supprimer ce spiritueux ?</h3>
            </div>
            
            <p className="text-sm text-stone-600 dark:text-stone-400 mb-6">
              Êtes-vous sûr de vouloir supprimer <span className="font-semibold text-stone-900 dark:text-white">{spirit.name}</span> ? 
              Cette action est irréversible.
            </p>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors font-medium"
              >
                Annuler
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};