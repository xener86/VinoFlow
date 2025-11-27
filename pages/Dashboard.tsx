
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInventory, consumeSpecificBottle, getRacks } from '../services/storageService';
import { CellarWine, BottleLocation } from '../types';
import { Droplet, MapPin, Grape, Utensils, Sparkles, Search, X, ArrowRight, ChefHat } from 'lucide-react';
import { Heart } from 'lucide-react';
import { toggleFavorite } from '../services/storageService';

interface WineCardProps {
  wine: CellarWine;
  onConsume: (id: string, e: React.MouseEvent) => void;
  onClick: (id: string) => void;
}

const wineTypeLabels: Record<string, string> = {
  'RED': 'ROUGE',
  'WHITE': 'BLANC',
  'ROSE': 'ROSÉ',
  'SPARKLING': 'PÉTILLANT',
  'DESSERT': 'DESSERT',
  'FORTIFIED': 'FORTIFIÉ'
};

const WineCard: React.FC<WineCardProps> = ({ wine, onConsume, onClick }) => (
  <div 
    onClick={() => onClick(wine.id)}
    className="group relative overflow-hidden rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-wine-300 dark:hover:border-wine-800/50 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer"
  >
    
    {/* Background Accent */}
    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-wine-50 dark:from-wine-900/20 to-transparent rounded-bl-full -mr-8 -mt-8 pointer-events-none transition-opacity opacity-50 dark:opacity-30 group-hover:opacity-100`} />

    <div className="p-5 relative z-10">
      
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase border
                ${wine.type === 'RED' ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900/50' : 
                  wine.type === 'WHITE' ? 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-950/50 dark:text-yellow-200 dark:border-yellow-900/50' : 
                  'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-900/50'}`}>
                {wineTypeLabels[wine.type] || wine.type}
              </span>
              {wine.enrichedByAI && (
                <span className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full border dark:border-purple-900/30">
                  <Sparkles size={8} /> IA
                </span>
              )}
            </div>
            <h3 className="text-2xl font-serif text-stone-800 dark:text-stone-100 leading-tight mb-1">{wine.name}</h3>
            {wine.cuvee && <p className="text-sm font-serif text-wine-700 dark:text-wine-400 italic mb-1">{wine.cuvee}</p>}
            <p className="text-stone-600 dark:text-stone-400 text-sm font-medium">{wine.producer} • {wine.vintage}</p>
          </div>
          <div className="text-center bg-stone-50 dark:bg-stone-950 rounded-lg p-2 border border-stone-100 dark:border-stone-800 min-w-[60px]">
              <span className="block text-2xl font-bold text-wine-700 dark:text-wine-500">{wine.inventoryCount}</span>
              <span className="text-[9px] uppercase text-stone-500 dark:text-stone-400 tracking-wider">Stock</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-stone-600 dark:text-stone-500">
          <div className="flex items-center gap-1">
            <MapPin size={12} /> {wine.region}, {wine.country}
          </div>
          <div className="flex items-center gap-1">
            <Grape size={12} /> {wine.grapeVarieties.join(', ')}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-stone-700 dark:text-stone-300 text-sm italic leading-relaxed border-l-2 border-wine-200 dark:border-wine-900 pl-3">
            "{wine.sensoryDescription}"
          </p>
        </div>
        
        <div className="flex items-center gap-2 pt-2">
          <Utensils size={14} className="text-wine-600/70 dark:text-wine-500/70" />
          <div className="flex flex-wrap gap-2">
            {wine.suggestedFoodPairings?.slice(0, 3).map((pair, i) => (
              <span key={i} className="text-xs bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-md text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700/50">{pair}</span>
            ))}
          </div>
        </div>

        {wine.inventoryCount > 0 && (
            <button 
            onClick={(e) => onConsume(wine.id, e)}
            className="mt-2 text-xs flex items-center gap-2 text-stone-500 hover:text-wine-700 dark:text-stone-400 dark:hover:text-wine-400 transition-colors z-20 relative font-medium"
          >
            <Droplet size={14} /> Consommer
          </button>
        )}
      </div>
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  const [wines, setWines] = useState<CellarWine[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [foodPairingQuery, setFoodPairingQuery] = useState('');
  const [consumingWine, setConsumingWine] = useState<CellarWine | null>(null);
  const navigate = useNavigate();

  const loadData = () => {
    setWines(getInventory());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConsume = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = wines.find(w => w.id === id);
    if (target) {
        setConsumingWine(target);
    }
  };

  const confirmConsumption = (bottleId: string) => {
      if (!consumingWine) return;
      consumeSpecificBottle(consumingWine.id, bottleId);
      setConsumingWine(null);
      loadData();
  };

  const handleCardClick = (id: string) => {
    navigate(`/wine/${id}`);
  };

  const handleQuickPairing = (e: React.FormEvent) => {
      e.preventDefault();
      if (foodPairingQuery) {
          navigate(`/sommelier?mode=PAIRING&q=${encodeURIComponent(foodPairingQuery)}`);
      }
  };

  const filteredWines = wines.filter(w => {
    const matchesType = filter === 'ALL' || w.type === filter;
    
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
        w.name.toLowerCase().includes(query) ||
        w.producer.toLowerCase().includes(query) ||
        w.region.toLowerCase().includes(query) ||
        w.vintage.toString().includes(query);
    const hasStock = w.inventoryCount > 0;

  
    return matchesType && matchesSearch && hasStock;
  });
  
  const filterLabels: Record<string, string> = {
      'ALL': 'TOUS',
      'RED': 'ROUGE',
      'WHITE': 'BLANC',
      'ROSE': 'ROSÉ',
      'SPARKLING': 'BULLES'
  }

  const getRackName = (rackId: string) => {
      const racks = getRacks();
      return racks.find(r => r.id === rackId)?.name || 'Inconnu';
  }

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col gap-4">
        <h2 className="text-3xl font-serif text-stone-800 dark:text-white">Ma Cave</h2>
        
        {/* Quick Pairing Widget */}
        <div className="bg-gradient-to-r from-stone-50 via-white to-wine-50 dark:from-stone-900 dark:via-stone-900 dark:to-wine-900/20 p-1 rounded-2xl shadow-md dark:shadow-xl border border-stone-200 dark:border-stone-800/50 overflow-hidden group">
            <div className="bg-white/90 dark:bg-stone-950/90 p-5 rounded-xl backdrop-blur-sm relative">
                <div className="absolute -top-4 -right-4 p-4 opacity-5 text-wine-600 group-hover:opacity-10 transition-opacity">
                    <ChefHat size={100} />
                </div>
                
                <div className="relative z-10">
                    <h3 className="text-lg font-serif text-stone-800 dark:text-white mb-1 flex items-center gap-2">
                        <Utensils size={18} className="text-wine-600 dark:text-wine-500" /> 
                        Accord Mets & Vins
                    </h3>
                    <p className="text-stone-600 dark:text-stone-400 text-xs mb-4 max-w-[85%]">
                        Dites-moi ce que vous mangez, je trouve le vin parfait dans votre stock.
                    </p>
                    
                    <form onSubmit={handleQuickPairing} className="flex gap-2">
                        <input 
                            type="text"
                            value={foodPairingQuery}
                            onChange={(e) => setFoodPairingQuery(e.target.value)}
                            placeholder="ex: Poulet rôti, Sushi, Comté..."
                            className="flex-1 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-600 focus:bg-white dark:focus:bg-stone-900 outline-none placeholder-stone-400 dark:placeholder-stone-600 transition-all"
                        />
                        <button 
                            type="submit"
                            disabled={!foodPairingQuery}
                            className="bg-wine-600 hover:bg-wine-700 disabled:opacity-50 text-white px-4 rounded-xl transition-colors flex items-center justify-center shadow-lg shadow-wine-900/20"
                        >
                            <ArrowRight size={20} />
                        </button>
                    </form>
                </div>
            </div>
        </div>

        {/* Inventory Search */}
        <div className="relative">
            <Search className="absolute left-3 top-3 text-stone-400" size={18} />
            <input 
                type="text"
                placeholder="Chercher une bouteille..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl py-3 pl-10 pr-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 outline-none placeholder-stone-400 dark:placeholder-stone-600 transition-all shadow-sm"
            />
        </div>

        {/* Filters */}
        <div className="flex gap-2 text-sm bg-white dark:bg-stone-900 p-1 rounded-lg border border-stone-200 dark:border-stone-800 overflow-x-auto no-scrollbar shadow-sm">
           {['ALL', 'RED', 'WHITE', 'ROSE', 'SPARKLING'].map((t) => (
             <button
               key={t}
               onClick={() => setFilter(t)}
               className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap text-xs font-medium tracking-wide ${
                   filter === t 
                   ? 'bg-stone-800 text-white dark:bg-stone-700 shadow-md' 
                   : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
                }`}
             >
               {filterLabels[t]}
             </button>
           ))}
        </div>
      </div>

      <div className="grid gap-6">
        {filteredWines.map(wine => (
          <WineCard 
            key={wine.id} 
            wine={wine} 
            onConsume={handleConsume} 
            onClick={handleCardClick}
          />
        ))}
        {filteredWines.length === 0 && (
          <div className="text-center py-20 text-stone-500 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col items-center gap-2">
            <Search size={32} className="opacity-50" />
            <p>Aucun vin trouvé pour cette recherche.</p>
          </div>
        )}
      </div>

      {/* Consumption Modal */}
      {consumingWine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-0 bg-stone-900/20 dark:bg-black/80 backdrop-blur-sm" onClick={() => setConsumingWine(null)} />
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-xl font-serif text-stone-900 dark:text-white">Consommer</h3>
                        <p className="text-stone-500 dark:text-stone-400 text-sm">{consumingWine.name}</p>
                    </div>
                    <button onClick={() => setConsumingWine(null)} className="text-stone-400 hover:text-stone-600 dark:hover:text-white"><X size={20} /></button>
                </div>

                <p className="text-xs text-stone-500 mb-4">Sélectionnez la bouteille exacte que vous avez ouverte pour mettre à jour le plan de cave.</p>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {consumingWine.bottles.map((bottle, idx) => {
                        let locationLabel = "Non trié";
                        if (typeof bottle.location !== 'string') {
                             locationLabel = `${getRackName(bottle.location.rackId)} [${String.fromCharCode(65 + bottle.location.y)}${bottle.location.x + 1}]`;
                        } else {
                            locationLabel = bottle.location;
                        }

                        return (
                            <button
                                key={bottle.id}
                                onClick={() => confirmConsumption(bottle.id)}
                                className="w-full text-left p-3 rounded-lg bg-stone-50 dark:bg-stone-950 hover:bg-wine-50 dark:hover:bg-wine-900/20 border border-stone-200 dark:border-stone-800 hover:border-wine-300 dark:hover:border-wine-500/50 flex justify-between items-center group transition-all"
                            >
                                <div>
                                    <span className="text-stone-700 dark:text-stone-300 text-sm font-medium">Bouteille #{idx + 1}</span>
                                    <div className="text-xs text-stone-500 flex items-center gap-1">
                                        <MapPin size={10} /> {locationLabel}
                                    </div>
                                </div>
                                <Droplet size={16} className="text-stone-400 group-hover:text-wine-500" />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
