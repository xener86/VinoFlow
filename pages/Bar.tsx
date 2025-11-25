import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpirits, saveSpirits } from '../services/storageService';
import { getCocktailsByIngredients } from '../services/cocktailDbService';
import { Spirit, SpiritType, CocktailRecipe } from '../types';
import { Plus, Search, GlassWater, Sparkles, Shield, Loader2, X } from 'lucide-react';

export const Bar: React.FC = () => {
  const navigate = useNavigate();
  const [spirits, setSpirits] = useState<Spirit[]>([]);
  const [cocktails, setCocktails] = useState<CocktailRecipe[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoadingCocktails, setIsLoadingCocktails] = useState(false);
  
  // New spirit form
  const [newSpirit, setNewSpirit] = useState({
    name: '',
    type: SpiritType.VODKA,
    brand: '',
    level: 5,
    isPrestige: false,
  });

  useEffect(() => {
    setSpirits(getSpirits());
  }, []);

  const loadCocktails = async () => {
    if (spirits.length === 0) return;
    setIsLoadingCocktails(true);
    try {
      const availableIngredients = spirits.filter(s => s.level > 1).map(s => s.name);
      if (availableIngredients.length > 0) {
        const recipes = await getCocktailsByIngredients(availableIngredients.slice(0, 3));
        setCocktails(recipes.slice(0, 6));
      }
    } catch (err) {
      console.error('Failed to load cocktails', err);
    } finally {
      setIsLoadingCocktails(false);
    }
  };

  useEffect(() => {
    loadCocktails();
  }, [spirits.length]);

  const handleAddSpirit = () => {
    if (!newSpirit.name) return;
    const spirit: Spirit = {
      id: crypto.randomUUID(),
      ...newSpirit,
    };
    const updated = [...spirits, spirit];
    saveSpirits(updated);
    setSpirits(updated);
    setShowAddModal(false);
    setNewSpirit({ name: '', type: SpiritType.VODKA, brand: '', level: 5, isPrestige: false });
  };

  const filteredSpirits = spirits.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedSpirits = filteredSpirits.reduce((acc, spirit) => {
    if (!acc[spirit.type]) acc[spirit.type] = [];
    acc[spirit.type].push(spirit);
    return acc;
  }, {} as Record<string, Spirit[]>);

  const levelColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];

  return (
    <div className="pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Mon Bar</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="p-3 bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-lg shadow-amber-500/30 transition-all"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Rechercher un spiritueux..."
          className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl py-3 pl-12 pr-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
        />
      </div>

      {/* Cocktail Suggestions */}
      {cocktails.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-3 flex items-center gap-2">
            <Sparkles size={14} /> Cocktails Possibles
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {cocktails.map(cocktail => (
              <div
                key={cocktail.id}
                className="flex-shrink-0 w-40 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm"
              >
                {cocktail.imageUrl && (
                  <img src={cocktail.imageUrl} alt={cocktail.name} className="w-full h-24 object-cover" />
                )}
                <div className="p-3">
                  <h4 className="font-medium text-stone-900 dark:text-white text-sm truncate">{cocktail.name}</h4>
                  <p className="text-xs text-stone-500 mt-1">{cocktail.ingredients.length} ingrédients</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spirits List */}
      {Object.keys(groupedSpirits).length === 0 ? (
        <div className="text-center py-20">
          <GlassWater size={48} className="mx-auto text-stone-300 dark:text-stone-700 mb-4" />
          <p className="text-stone-500">Votre bar est vide</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-6 py-2 bg-amber-600 text-white rounded-lg text-sm"
          >
            Ajouter un spiritueux
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSpirits).map(([type, items]) => (
            <div key={type}>
              <h3 className="text-sm font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
                {type} ({items.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {items.map(spirit => (
                  <button
                    key={spirit.id}
                    onClick={() => navigate(`/spirit/${spirit.id}`)}
                    className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 text-left hover:border-amber-500 transition-all shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-stone-900 dark:text-white text-sm line-clamp-1">{spirit.name}</h4>
                      {spirit.isPrestige && <Shield size={14} className="text-amber-500" />}
                    </div>
                    {spirit.brand && (
                      <p className="text-xs text-stone-500 mb-3">{spirit.brand}</p>
                    )}
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(level => (
                        <div
                          key={level}
                          className={`flex-1 h-1.5 rounded-full ${
                            level <= spirit.level ? levelColors[spirit.level - 1] : 'bg-stone-200 dark:bg-stone-800'
                          }`}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-serif text-stone-900 dark:text-white">Ajouter un Spiritueux</h3>
              <button onClick={() => setShowAddModal(false)} className="text-stone-400 hover:text-stone-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-stone-500 uppercase">Nom *</label>
                <input
                  type="text"
                  value={newSpirit.name}
                  onChange={e => setNewSpirit({ ...newSpirit, name: e.target.value })}
                  placeholder="ex: Absolut"
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-stone-500 uppercase">Type</label>
                <select
                  value={newSpirit.type}
                  onChange={e => setNewSpirit({ ...newSpirit, type: e.target.value as SpiritType })}
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white mt-1"
                >
                  {Object.values(SpiritType).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-500 uppercase">Marque</label>
                <input
                  type="text"
                  value={newSpirit.brand}
                  onChange={e => setNewSpirit({ ...newSpirit, brand: e.target.value })}
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white mt-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newSpirit.isPrestige}
                  onChange={e => setNewSpirit({ ...newSpirit, isPrestige: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm text-stone-600 dark:text-stone-300">Bouteille de prestige</label>
              </div>
            </div>

            <button
              onClick={handleAddSpirit}
              disabled={!newSpirit.name}
              className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white py-3 rounded-xl font-bold mt-6"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
