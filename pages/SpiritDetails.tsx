import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSpiritById, deleteSpirit } from '../services/storageService';
import { Spirit } from '../types';
import { ArrowLeft, Edit, Trash2, Calendar, Percent, Flame, Droplets, MapPin, Clock, Sparkles, Wine, GlassWater } from 'lucide-react';

export const SpiritDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [spirit, setSpirit] = useState<Spirit | null>(null);
  const [activeTab, setActiveTab] = useState<'INFO' | 'TASTING'>('INFO');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (id) {
      loadSpiritData(id);
    }
  }, [id]);

  const loadSpiritData = (spiritId: string) => {
    const s = getSpiritById(spiritId);
    if (s) {
      setSpirit(s);
    } else {
      navigate('/bar');
    }
  };

  const handleDelete = () => {
    if (spirit) {
      deleteSpirit(spirit.id);
      navigate('/bar');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toUpperCase()) {
      case 'WHISKY': case 'WHISKEY': case 'BOURBON': case 'SCOTCH':
        return <Flame size={20} className="text-amber-600 dark:text-amber-400" />;
      case 'GIN':
        return <Sparkles size={20} className="text-green-600 dark:text-green-400" />;
      case 'VODKA':
        return <Droplets size={20} className="text-blue-600 dark:text-blue-400" />;
      case 'RUM': case 'RHUM':
        return <Wine size={20} className="text-orange-600 dark:text-orange-400" />;
      case 'TEQUILA': case 'MEZCAL':
        return <Sparkles size={20} className="text-yellow-600 dark:text-yellow-400" />;
      default:
        return <GlassWater size={20} className="text-purple-600 dark:text-purple-400" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category.toUpperCase()) {
      case 'WHISKY': case 'WHISKEY': case 'BOURBON': case 'SCOTCH':
        return 'from-amber-500 to-orange-600';
      case 'GIN':
        return 'from-green-500 to-emerald-600';
      case 'VODKA':
        return 'from-blue-500 to-cyan-600';
      case 'RUM': case 'RHUM':
        return 'from-orange-500 to-red-600';
      case 'TEQUILA': case 'MEZCAL':
        return 'from-yellow-500 to-amber-600';
      default:
        return 'from-purple-500 to-pink-600';
    }
  };

  if (!spirit) return null;

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
      {/* Header with gradient background */}
      <div className={`relative mb-6 -mx-6 -mt-6 px-6 pt-6 pb-10 bg-gradient-to-br ${getCategoryColor(spirit.category)}`}>
        <div className="absolute top-0 left-0 right-0 flex justify-between z-10 p-6">
          <button 
            onClick={() => navigate('/bar')} 
            className="p-2 text-white hover:bg-white/20 rounded-full backdrop-blur-sm transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex gap-2">
            <button 
              onClick={() => navigate(`/spirit/${spirit.id}/edit`)}
              className="p-2 text-white hover:bg-white/20 rounded-full backdrop-blur-sm transition-colors"
            >
              <Edit size={20} />
            </button>
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="p-2 text-white hover:bg-white/20 rounded-full backdrop-blur-sm transition-colors"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
        
        <div className="pt-16 flex flex-col items-center text-center text-white">
          <div className="mb-4 p-4 bg-white/20 backdrop-blur-md rounded-full">
            {getCategoryIcon(spirit.category)}
          </div>
          <div className="px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-4 bg-white/20 backdrop-blur-sm">
            {spirit.category}
          </div>
          <h1 className="text-4xl font-serif mb-2 leading-tight">{spirit.name}</h1>
          <p className="text-xl font-medium opacity-90">{brand}</p>
          {origin && (
            <p className="text-sm opacity-75 mt-2">{origin}</p>
          )}
        </div>

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {alcoholContent !== undefined && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/20">
              <Percent size={20} className="mx-auto mb-2 opacity-75" />
              <p className="text-2xl font-bold">{alcoholContent}%</p>
              <p className="text-xs opacity-75 uppercase tracking-wide">Alcool</p>
            </div>
          )}
          {volume !== undefined && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/20">
              <Droplets size={20} className="mx-auto mb-2 opacity-75" />
              <p className="text-2xl font-bold">{volume}ml</p>
              <p className="text-xs opacity-75 uppercase tracking-wide">Volume</p>
            </div>
          )}
          {formattedQuantity !== undefined && (
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center border border-white/20">
              <Wine size={20} className="mx-auto mb-2 opacity-75" />
              <p className="text-2xl font-bold">{formattedQuantity}</p>
              <p className="text-xs opacity-75 uppercase tracking-wide">Stock</p>
            </div>
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

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4">

              {spirit.age && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-2 text-stone-500 mb-2">
                    <Clock size={16} />
                    <span className="text-xs uppercase font-bold">Âge</span>
                  </div>
                  <p className="text-stone-800 dark:text-stone-200 font-medium">{spirit.age} ans</p>
                </div>
              )}

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
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm col-span-2">
                  <div className="flex items-center gap-2 text-stone-500 mb-2">
                    <Wine size={16} />
                    <span className="text-xs uppercase font-bold">Type de Fût</span>
                  </div>
                  <p className="text-stone-800 dark:text-stone-200">{barrelType}</p>
                </div>
              )}

              {(spirit as any).purchaseDate && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-2 text-stone-500 mb-2">
                    <Calendar size={16} />
                    <span className="text-xs uppercase font-bold">Date d'Achat</span>
                  </div>
                  <p className="text-stone-800 dark:text-stone-200 text-sm">
                    {new Date((spirit as any).purchaseDate).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}

              {(spirit as any).price !== undefined && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-2 text-stone-500 mb-2">
                    <span className="text-xs uppercase font-bold">Prix d'Achat</span>
                  </div>
                  <p className="text-stone-800 dark:text-stone-200 font-medium">{(spirit as any).price} €</p>
                </div>
              )}

              {(spirit as any).location && (
                <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm col-span-2">
                  <div className="flex items-center gap-2 text-stone-500 mb-2">
                    <MapPin size={16} />
                    <span className="text-xs uppercase font-bold">Emplacement</span>
                  </div>
                  <p className="text-stone-800 dark:text-stone-200">{(spirit as any).location}</p>
                </div>
              )}
            </div>

            {/* Notes */}
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