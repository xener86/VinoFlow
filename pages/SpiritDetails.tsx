
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSpiritById, saveSpirit, toggleSpiritLuxury } from '../services/storageService';
import { Spirit } from '../types';
import { ArrowLeft, GlassWater, MapPin, BookOpen, PartyPopper, Flame, Gem, Ban } from 'lucide-react';

export const SpiritDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [spirit, setSpirit] = useState<Spirit | null>(null);
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'STORY' | 'MIXOLOGY'>('PROFILE');

  useEffect(() => {
    if (id) {
        loadData(id);
    }
  }, [id, navigate]);

  const loadData = (sid: string) => {
      const s = getSpiritById(sid);
      if (s) setSpirit(s);
      else navigate('/bar');
  }

  const handleLevelChange = (newLevel: number) => {
      if (spirit) {
          const updated = { ...spirit, inventoryLevel: newLevel };
          setSpirit(updated);
          saveSpirit(updated);
      }
  };
  
  const handleToggleLuxury = () => {
      if(spirit) {
          toggleSpiritLuxury(spirit.id);
          loadData(spirit.id);
      }
  }

  if (!spirit) return null;

  return (
    <div className="pb-24 animate-fade-in">
        {/* Header */}
        <div className="relative mb-6">
            <button 
                onClick={() => navigate('/bar')} 
                className="absolute top-0 left-0 p-2 text-stone-400 hover:text-stone-800 dark:hover:text-white bg-white/80 dark:bg-stone-900/50 rounded-full backdrop-blur-sm z-10 border border-stone-200 dark:border-stone-800"
            >
                <ArrowLeft size={24} />
            </button>
            
            <div className="pt-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-white dark:bg-stone-900 rounded-2xl flex items-center justify-center text-amber-500 mb-4 shadow-lg border border-stone-200 dark:border-stone-800">
                    <GlassWater size={32} />
                </div>
                <h1 className="text-3xl font-serif text-stone-900 dark:text-white mb-2 leading-tight">{spirit.name}</h1>
                <p className="text-stone-500 dark:text-stone-400 text-lg">{spirit.distillery} {spirit.age ? `• ${spirit.age}` : ''}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-stone-500">
                    <span className="bg-stone-100 dark:bg-stone-900 px-2 py-1 rounded border border-stone-200 dark:border-stone-800">{spirit.category}</span>
                    <span>{spirit.abv}% ABV</span>
                    <span>{spirit.format}ml</span>
                </div>
                
                {/* Luxury Toggle */}
                <button 
                    onClick={handleToggleLuxury}
                    className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                        spirit.isLuxury 
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/50' 
                        : 'bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                >
                    {spirit.isLuxury ? <Gem size={14} /> : <Ban size={14} />}
                    {spirit.isLuxury ? "Bouteille de Prestige / Dégustation Seule" : "Disponible pour Cocktails"}
                </button>
            </div>
        </div>

        {/* Level Slider */}
        <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 mb-8 shadow-sm">
            <div className="flex justify-between text-xs text-stone-500 mb-2">
                <span>Niveau Bouteille</span>
                <span>{spirit.inventoryLevel}%</span>
            </div>
            <input 
                type="range" 
                min="0" max="100" 
                value={spirit.inventoryLevel} 
                onChange={(e) => handleLevelChange(Number(e.target.value))}
                className="w-full accent-amber-500"
            />
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-stone-100 dark:bg-stone-900 rounded-xl mb-6 border border-stone-200 dark:border-stone-800">
            <button 
                onClick={() => setActiveTab('PROFILE')}
                className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'PROFILE' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
            >
                Profil
            </button>
            <button 
                onClick={() => setActiveTab('STORY')}
                className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'STORY' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
            >
                Histoire
            </button>
            <button 
                onClick={() => setActiveTab('MIXOLOGY')}
                className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'MIXOLOGY' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
            >
                Mixologie
            </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
            {activeTab === 'PROFILE' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 text-amber-500">
                            <Flame size={18} />
                            <h3 className="font-serif text-lg text-stone-900 dark:text-white">Dégustation</h3>
                        </div>
                        <p className="text-stone-600 dark:text-stone-300 italic text-lg leading-relaxed mb-6">
                            "{spirit.description}"
                        </p>
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2">Notes</h4>
                                <p className="text-sm text-stone-700 dark:text-stone-300">{spirit.tastingNotes}</p>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2">Arômes</h4>
                                <div className="flex flex-wrap gap-2">
                                    {spirit.aromaProfile.map((aroma, i) => (
                                        <span key={i} className="px-3 py-1 bg-amber-50 dark:bg-stone-950 text-amber-700 dark:text-amber-500/80 rounded-lg text-xs border border-amber-100 dark:border-stone-800">
                                            {aroma}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'STORY' && (
                <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2 mb-4 text-stone-400">
                        <BookOpen size={18} />
                        <h3 className="font-serif text-lg text-stone-900 dark:text-white">La Distillerie</h3>
                    </div>
                    <div className="prose prose-invert prose-stone max-w-none">
                        <p className="text-stone-700 dark:text-stone-300 leading-relaxed">
                            {spirit.producerHistory}
                        </p>
                    </div>
                    {(spirit.region || spirit.country) && (
                        <div className="mt-6 flex items-center gap-2 text-stone-500 text-sm">
                            <MapPin size={14} />
                            {spirit.region}, {spirit.country}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'MIXOLOGY' && (
                <div className="space-y-6 animate-fade-in">
                     <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 text-purple-500">
                            <PartyPopper size={18} />
                            <h3 className="font-serif text-lg text-stone-900 dark:text-white">Cocktails Suggérés</h3>
                        </div>
                        <ul className="space-y-3">
                            {spirit.suggestedCocktails.map((c, i) => (
                                <li key={i} className="flex items-center gap-3 text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-950/50 p-3 rounded-lg border border-stone-100 dark:border-stone-800">
                                    <GlassWater size={16} className="text-stone-400" />
                                    {c}
                                </li>
                            ))}
                        </ul>
                     </div>

                     <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                        <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-3">Accords Gourmands</h4>
                        <div className="flex flex-wrap gap-2">
                            {spirit.culinaryPairings.map((p, i) => (
                                <span key={i} className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-sm">
                                    {p}
                                </span>
                            ))}
                        </div>
                     </div>
                </div>
            )}
        </div>
    </div>
  );
};
