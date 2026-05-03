import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { consumeSpecificBottle, toggleFavorite } from '../services/storageService';
import { useWines } from '../hooks/useWines';
import { useRacks } from '../hooks/useRacks';
import { CellarWine } from '../types';
import { formatBottleLocation } from '../utils/locationFormatter';
import { getPeakWindow, getPeakBadgeStyles } from '../utils/peakWindow';
import { BottomSheet } from '../components/BottomSheet';
import { Toast, useToast } from '../components/Toast';
import { Droplet, MapPin, Grape, Utensils, Sparkles, Search, X, ArrowRight, ChefHat, Loader2, Filter, RotateCcw, ArrowUpDown, Clock } from 'lucide-react';

interface WineCardProps {
  wine: CellarWine;
  onConsume: (id: string, e: React.MouseEvent) => void;
  onClick: (id: string) => void;
  onFavoriteToggle: () => void;
}

const wineTypeLabels: Record<string, string> = {
  'RED': 'ROUGE',
  'WHITE': 'BLANC',
  'ROSE': 'ROSÉ',
  'SPARKLING': 'PÉTILLANT',
  'DESSERT': 'DESSERT',
  'FORTIFIED': 'FORTIFIÉ'
};

const normalizeText = (text: string): string => {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
};

const WineCard: React.FC<WineCardProps> = ({ wine, onConsume, onClick, onFavoriteToggle }) => {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFavoriteToggle();
  };

  return (
    <div 
      onClick={() => onClick(wine.id)}
      className="group relative overflow-hidden rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-wine-300 dark:hover:border-wine-800/50 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer"
    >
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-wine-50 dark:from-wine-900/20 to-transparent rounded-bl-full -mr-8 -mt-8 pointer-events-none transition-opacity opacity-50 dark:opacity-30 group-hover:opacity-100`} />

      <div className="p-5 relative z-10">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase border
                  ${wine.type === 'RED' ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900/50' : 
                    wine.type === 'WHITE' ? 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-950/50 dark:text-yellow-200 dark:border-yellow-900/50' : 
                    wine.type === 'ROSE' ? 'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-900/50' :
                    'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/50'}`}>
                  {wineTypeLabels[wine.type] || wine.type}
                </span>
                {wine.enrichedByAI && (
                  <span className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 px-2 py-0.5 rounded-full border dark:border-purple-900/30">
                    <Sparkles size={8} /> IA
                  </span>
                )}
                <button
                  onClick={handleFavoriteClick}
                  className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase border transition-all hover:scale-105 ${
                    wine.isFavorite 
                      ? 'bg-red-600 text-white border-red-700 dark:bg-red-600 dark:border-red-500' 
                      : 'bg-white text-stone-400 border-stone-300 dark:bg-stone-900 dark:text-stone-500 dark:border-stone-700 hover:border-red-600 hover:text-red-600 dark:hover:border-red-500 dark:hover:text-red-400'
                  }`}
                  title={wine.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                >
                  FAVORIS
                </button>
                {(() => {
                  const peak = getPeakWindow(wine as any);
                  const styles = getPeakBadgeStyles(peak.status);
                  return (
                    <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase ${styles.bg} ${styles.text}`}>
                      {peak.status}
                    </span>
                  );
                })()}
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
};

export const Dashboard: React.FC = () => {
  // Utilisation du Hook useWines
  const { wines, loading, error, refresh } = useWines();
  const { racks } = useRacks();

  const [typeFilter, setTypeFilter] = useState('ALL');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [foodPairingQuery, setFoodPairingQuery] = useState('');
  const [consumingWine, setConsumingWine] = useState<CellarWine | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [regionFilter, setRegionFilter] = useState('');
  const [appellationFilter, setAppellationFilter] = useState('');
  const [vintageMin, setVintageMin] = useState<number | ''>('');
  const [vintageMax, setVintageMax] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState('name');
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  // Summary stats
  const winesInStock = wines.filter(w => w.inventoryCount > 0);
  const totalBottles = wines.reduce((sum, w) => sum + w.inventoryCount, 0);
  const drinkNowWines = winesInStock.filter(w => {
    const peak = getPeakWindow(w as any);
    return peak.status === 'À Boire' || peak.status === 'Boire Vite';
  });
  const totalValue = wines.reduce((sum, w) => {
    return sum + w.bottles.reduce((s, b) => s + (b.purchasePrice || 0), 0);
  }, 0);

  const uniqueRegions = [...new Set(wines.map(w => w.region))].filter(Boolean).sort();
  const uniqueAppellations = [...new Set(wines.map(w => w.appellation).filter(Boolean) as string[])].sort();
  const activeFilterCount = [regionFilter, appellationFilter, vintageMin, vintageMax].filter(Boolean).length;

  const handleConsume = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = wines.find(w => w.id === id);
    if (target) {
        setConsumingWine(target);
    }
  };

  const confirmConsumption = async (bottleId: string) => {
      if (!consumingWine) return;
      const wineName = `${consumingWine.name} ${consumingWine.vintage}`;
      await consumeSpecificBottle(consumingWine.id, bottleId, consumingWine.name, consumingWine.vintage);
      setConsumingWine(null);
      showToast(`${wineName} consommé !`, 'success');
      refresh();
  };

  const handleToggleFavorite = async (wineId: string) => {
      await toggleFavorite(wineId);
      refresh();
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
    let matchesType = false;
    if (typeFilter === 'ALL') {
      matchesType = true;
    } else if (typeFilter === 'OTHER') {
      matchesType = !['RED', 'WHITE', 'ROSE', 'SPARKLING'].includes(w.type);
    } else {
      matchesType = w.type === typeFilter;
    }
    
    const matchesFavorites = !showFavoritesOnly || w.isFavorite;
    
    const normalizedQuery = normalizeText(searchQuery);
    const matchesSearch = 
        normalizeText(w.name).includes(normalizedQuery) ||
        normalizeText(w.producer).includes(normalizedQuery) ||
        normalizeText(w.region).includes(normalizedQuery) ||
        w.vintage.toString().includes(normalizedQuery);
    const hasStock = w.inventoryCount > 0;
    const matchesRegion = !regionFilter || w.region === regionFilter;
    const matchesAppellation = !appellationFilter || w.appellation === appellationFilter;
    const matchesVintageMin = !vintageMin || w.vintage >= vintageMin;
    const matchesVintageMax = !vintageMax || w.vintage <= vintageMax;

    return matchesType && matchesFavorites && matchesSearch && hasStock && matchesRegion && matchesAppellation && matchesVintageMin && matchesVintageMax;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name': return a.name.localeCompare(b.name, 'fr');
      case 'vintage-desc': return b.vintage - a.vintage;
      case 'vintage-asc': return a.vintage - b.vintage;
      case 'stock': return b.inventoryCount - a.inventoryCount;
      case 'region': return (a.region || '').localeCompare(b.region || '', 'fr');
      case 'peak': {
        const peakA = getPeakWindow(a as any);
        const peakB = getPeakWindow(b as any);
        const order: Record<string, number> = { 'Apogée passée': -1, 'Boire Vite': 0, 'À Boire': 1, 'Garde': 2 };
        return (order[peakA.status] ?? 2) - (order[peakB.status] ?? 2);
      }
      case 'recent': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      default: return 0;
    }
  });

  const filterLabels: Record<string, string> = {
      'ALL': 'TOUS',
      'RED': 'ROUGE',
      'WHITE': 'BLANC',
      'ROSE': 'ROSÉ',
      'SPARKLING': 'BULLES',
      'OTHER': 'AUTRES'
  };

  // Removed: getRackName stub - now using formatBottleLocation utility

  const favoriteCount = wines.filter(w => w.isFavorite && w.inventoryCount > 0).length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-wine-600" size={48} />
    </div>
  );

  if (error) return (
    <div className="text-center py-20 text-red-500">
        <p>Erreur : {error}</p>
        <button onClick={refresh} className="mt-4 px-4 py-2 bg-stone-100 rounded">Réessayer</button>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-3xl font-serif text-stone-800 dark:text-white">Ma Cave</h2>
          {/* Summary Stats */}
          {!loading && totalBottles > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="bg-wine-50 dark:bg-wine-900/20 text-wine-700 dark:text-wine-400 px-2.5 py-0.5 rounded-full border border-wine-100 dark:border-wine-800 text-xs font-medium">
                {totalBottles} btl
              </span>
              <span className="text-stone-300 dark:text-stone-700">•</span>
              <span className="text-xs text-stone-500 dark:text-stone-400">{winesInStock.length} réf.</span>
              {drinkNowWines.length > 0 && (
                <>
                  <span className="text-stone-300 dark:text-stone-700">•</span>
                  <Link to="/drink-now" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2.5 py-0.5 rounded-full border border-green-100 dark:border-green-800 text-xs font-medium hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex items-center gap-1">
                    <Clock size={10} /> {drinkNowWines.length} à boire
                  </Link>
                </>
              )}
              {totalValue > 0 && (
                <>
                  <span className="text-stone-300 dark:text-stone-700">•</span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">~{Math.round(totalValue)}€</span>
                </>
              )}
            </div>
          )}
        </div>

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

        {/* Advanced Filters Toggle + Sort */}
        <div className="flex items-center gap-3">
            <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors px-3 py-1.5 rounded-lg border ${
                  showAdvancedFilters || activeFilterCount > 0
                    ? 'bg-wine-50 dark:bg-wine-900/20 text-wine-700 dark:text-wine-400 border-wine-200 dark:border-wine-800'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300 border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
                }`}
            >
                <Filter size={12} />
                Filtres
                {activeFilterCount > 0 && (
                    <span className="bg-wine-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none">{activeFilterCount}</span>
                )}
            </button>

            <div className="flex items-center gap-1.5 text-xs">
                <ArrowUpDown size={12} className="text-stone-400" />
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-2 py-1.5 text-xs text-stone-600 dark:text-stone-400 outline-none cursor-pointer"
                >
                    <option value="name">Nom A→Z</option>
                    <option value="vintage-desc">Millésime ↓</option>
                    <option value="vintage-asc">Millésime ↑</option>
                    <option value="stock">Stock ↓</option>
                    <option value="region">Région</option>
                    <option value="peak">Apogée</option>
                    <option value="recent">Récents</option>
                </select>
            </div>
        </div>

        {showAdvancedFilters && (
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3 shadow-sm animate-slide-up">
                <div className="grid grid-cols-2 gap-3">
                    <select
                        value={regionFilter}
                        onChange={(e) => setRegionFilter(e.target.value)}
                        className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-700 dark:text-stone-300 outline-none"
                    >
                        <option value="">Toutes régions</option>
                        {uniqueRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select
                        value={appellationFilter}
                        onChange={(e) => setAppellationFilter(e.target.value)}
                        className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-700 dark:text-stone-300 outline-none"
                    >
                        <option value="">Toutes appellations</option>
                        {uniqueAppellations.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number" placeholder="Mill. min" min={1900} max={2030}
                        value={vintageMin}
                        onChange={(e) => setVintageMin(e.target.value ? Number(e.target.value) : '')}
                        className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-700 dark:text-stone-300 outline-none"
                    />
                    <span className="text-stone-400 text-xs">—</span>
                    <input
                        type="number" placeholder="Mill. max" min={1900} max={2030}
                        value={vintageMax}
                        onChange={(e) => setVintageMax(e.target.value ? Number(e.target.value) : '')}
                        className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-700 dark:text-stone-300 outline-none"
                    />
                </div>
                {activeFilterCount > 0 && (
                    <button
                        onClick={() => { setRegionFilter(''); setAppellationFilter(''); setVintageMin(''); setVintageMax(''); }}
                        className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 uppercase tracking-wider"
                    >
                        <RotateCcw size={10} /> Réinitialiser
                    </button>
                )}
            </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 text-sm bg-white dark:bg-stone-900 p-1 rounded-lg border border-stone-200 dark:border-stone-800 overflow-x-auto no-scrollbar shadow-sm">
           {['ALL', 'RED', 'WHITE', 'ROSE', 'SPARKLING', 'OTHER'].map((t) => (
             <button
               key={t}
               onClick={() => setTypeFilter(t)}
               className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap text-xs font-medium tracking-wide ${
                   typeFilter === t 
                   ? 'bg-stone-800 text-white dark:bg-stone-700 shadow-md'
                   : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
                }`}
             >
               {filterLabels[t]}
             </button>
           ))}
           
           <button
             onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
             className={`px-3 py-1.5 rounded-full transition-all whitespace-nowrap text-xs font-medium tracking-wide flex items-center gap-1.5 ${
               showFavoritesOnly 
                 ? 'bg-red-600 text-white dark:bg-red-600 shadow-md'
                 : 'bg-stone-100 dark:bg-stone-800 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-red-600 dark:hover:text-red-400'
             }`}
           >
             FAVORIS
             {favoriteCount > 0 && (
               <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                 showFavoritesOnly 
                   ? 'bg-red-700 text-white'
                   : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400'
               }`}>
                 {favoriteCount}
               </span>
             )}
           </button>
        </div>
      </div>

      <div className="grid gap-6">
        {filteredWines.map(wine => (
          <WineCard 
            key={wine.id} 
            wine={wine} 
            onConsume={handleConsume} 
            onClick={handleCardClick}
            onFavoriteToggle={() => handleToggleFavorite(wine.id)}
          />
        ))}
        {filteredWines.length === 0 && (
          <div className="text-center py-20 text-stone-500 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col items-center gap-2">
            <Search size={32} className="opacity-50" />
            <p>Aucun vin trouvé pour cette recherche.</p>
          </div>
        )}
      </div>

      {/* Consumption BottomSheet */}
      <BottomSheet
        isOpen={!!consumingWine}
        onClose={() => setConsumingWine(null)}
        title="Consommer"
        subtitle={consumingWine?.name}
      >
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">Sélectionnez la bouteille que vous avez ouverte.</p>
        <div className="space-y-2">
          {consumingWine?.bottles.filter(b => !b.isConsumed).map((bottle, idx) => {
            const locationLabel = formatBottleLocation(bottle.location, racks);
            return (
              <button
                key={bottle.id}
                onClick={() => confirmConsumption(bottle.id)}
                className="w-full text-left p-3 rounded-xl bg-stone-50 dark:bg-stone-950 hover:bg-wine-50 dark:hover:bg-wine-900/20 border border-stone-200 dark:border-stone-800 hover:border-wine-300 dark:hover:border-wine-500/50 flex justify-between items-center group transition-all"
              >
                <div>
                  <span className="text-stone-700 dark:text-stone-300 text-sm font-medium">Bouteille #{idx + 1}</span>
                  <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                    <MapPin size={10} /> {locationLabel}
                  </div>
                  {bottle.purchasePrice && (
                    <div className="text-xs text-stone-400 mt-0.5">{bottle.purchasePrice}€</div>
                  )}
                </div>
                <Droplet size={16} className="text-stone-400 group-hover:text-wine-500 transition-colors" />
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Toast */}
      {toast && <Toast {...toast} onClose={hideToast} />}
    </div>
  );
};