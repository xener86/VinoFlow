import React, { useState, useEffect } from 'react';
import { getSpirits, getCocktails, saveSpirit, saveCocktail, deleteSpirit } from '../services/storageService';
import { Spirit, SpiritType, CocktailRecipe } from '../types';
import { searchCocktailsByName } from '../services/cocktailDbService';
import { createCustomCocktail, enrichSpiritData } from '../services/geminiService';
import { Search, Plus, GlassWater, Zap, CheckCircle2, PartyPopper, ArrowRight, Loader2, X, AlertCircle, MessageSquare, Gem, Martini, Wine, Coffee, Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Bar: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'STOCK' | 'COCKTAILS'>('STOCK');
  const [spirits, setSpirits] = useState<Spirit[]>([]);
  const [cocktails, setCocktails] = useState<CocktailRecipe[]>([]);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<CocktailRecipe[]>([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  // Add Spirit State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSpiritName, setNewSpiritName] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);

  // Party Mode State
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [selectedPartyCocktails, setSelectedPartyCocktails] = useState<CocktailRecipe[]>([]);
  const [guestCount, setGuestCount] = useState(4);
  const [partyIngredients, setPartyIngredients] = useState<Record<string, number>>({});

  // AI Chat State
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatQuery, setChatQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = () => {
      setSpirits(getSpirits());
      setCocktails(getCocktails());
  };

  const getCategoryIcon = (category: SpiritType) => {
    switch (category) {
        case SpiritType.GIN:
        case SpiritType.VODKA:
        case SpiritType.VERMOUTH:
        case SpiritType.TEQUILA:
            return Martini;
        case SpiritType.COGNAC:
        case SpiritType.RUM:
            return Wine;
        case SpiritType.LIQUEUR:
        case SpiritType.BITTER:
            return Coffee;
        case SpiritType.WHISKY:
        default:
            return GlassWater;
    }
  };

  // --- Handlers ---

  const handleAddSpirit = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!newSpiritName) return;

      setIsEnriching(true);
      try {
          const data = await enrichSpiritData(newSpiritName);
          
          const newSpirit: Spirit = {
              id: crypto.randomUUID(),
              name: newSpiritName,
              category: data?.category || SpiritType.OTHER,
              distillery: data?.distillery || 'Inconnue',
              abv: data?.abv || 40,
              format: data?.format || 700,
              description: data?.description || 'Ajouté manuellement',
              producerHistory: data?.producerHistory || '',
              tastingNotes: data?.tastingNotes || '',
              aromaProfile: data?.aromaProfile || [],
              suggestedCocktails: data?.suggestedCocktails || [],
              culinaryPairings: data?.culinaryPairings || [],
              enrichedByAI: !!data,
              addedAt: new Date().toISOString(),
              isOpened: false,
              inventoryLevel: 100,
              isLuxury: false
          };

          saveSpirit(newSpirit);
          loadData();
          setShowAddModal(false);
          setNewSpiritName('');
      } catch (error) {
          console.error("Error adding spirit:", error);
          alert("Erreur lors de l'ajout. Veuillez réessayer.");
      } finally {
          setIsEnriching(false);
      }
  };

  const handleDeleteSpirit = (id: string) => {
      if (window.confirm("Supprimer définitivement cette bouteille ?")) {
          deleteSpirit(id);
          loadData();
      }
  };

  const handleSearchCocktails = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!searchQuery) return;
      
      setIsSearchingApi(true);
      const results = await searchCocktailsByName(searchQuery);
      setApiResults(results);
      setIsSearchingApi(false);
  };

  const handleImportRecipe = (recipe: CocktailRecipe) => {
      saveCocktail({ ...recipe, isFavorite: true });
      loadData();
      alert("Recette importée !");
  };

  const handleAICreate = async () => {
      if(chatQuery) {
          setIsSearchingApi(true);
          const availableIngredients = spirits.filter(s => !s.isLuxury).map(s => s.name);
          const recipe = await createCustomCocktail(availableIngredients, chatQuery);
          setIsSearchingApi(false);
          
          if(recipe) {
              const fullRecipe: CocktailRecipe = {
                  id: crypto.randomUUID(),
                  name: recipe.name || 'Creation IA',
                  category: 'MODERN',
                  ingredients: [],
                  instructions: [],
                  glassType: 'Coupe',
                  difficulty: 'Medium',
                  prepTime: 5,
                  tags: ['AI'],
                  source: 'AI',
                  isFavorite: true,
                  ...recipe as any
              };
              saveCocktail(fullRecipe);
              loadData();
              setShowAIChat(false);
              setChatQuery('');
              alert("Recette créée par l'IA !");
          }
      }
  };

  const handleCalculateParty = () => {
      const totals: Record<string, number> = {};
      selectedPartyCocktails.forEach(c => {
          c.ingredients.forEach(ing => {
              if(!ing.optional) {
                  const key = `${ing.name} (${ing.unit})`;
                  totals[key] = (totals[key] || 0) + (ing.amount * guestCount);
              }
          });
      });
      setPartyIngredients(totals);
  };

  const canMakeCocktail = (recipe: CocktailRecipe): boolean => {
      const requiredSpirits = recipe.ingredients.filter(i => i.amount > 10);
      return requiredSpirits.every(req => 
          spirits.some(s => s.name.toLowerCase().includes(req.name.toLowerCase()) || 
          s.category.toLowerCase().includes(req.name.toLowerCase()))
      );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Bar</h2>
            <p className="text-stone-500 dark:text-stone-400 text-xs">Mixologie & Spiritueux</p>
        </div>
        <button 
            onClick={() => setShowPartyModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg shadow-indigo-900/50 transition-colors"
            title="Mode Party"
        >
            <PartyPopper size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-stone-100 dark:bg-stone-900 p-1 rounded-xl border border-stone-200 dark:border-stone-800">
          <button onClick={() => setActiveTab('STOCK')} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${activeTab === 'STOCK' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}>Mon Bar</button>
          <button onClick={() => setActiveTab('COCKTAILS')} className={`flex-1 py-2 text-sm rounded-lg transition-colors ${activeTab === 'COCKTAILS' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}>Cocktails</button>
      </div>

      {/* --- TAB: STOCK --- */}
      {activeTab === 'STOCK' && (
          <div className="space-y-4">
               <button 
                onClick={() => setShowAddModal(true)}
                className="w-full py-3 border border-dashed border-stone-400 dark:border-stone-700 text-stone-500 dark:text-stone-400 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-stone-800 dark:hover:text-stone-300 transition-colors flex items-center justify-center gap-2 bg-stone-50 dark:bg-transparent"
               >
                   <Plus size={18} /> Ajouter une bouteille
               </button>

               <div className="grid gap-4">
                  {spirits.map(spirit => {
                      const SpiritIcon = getCategoryIcon(spirit.category);
                      return (
                      <div 
                        key={spirit.id} 
                        className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex gap-4 items-start hover:border-stone-400 dark:hover:border-stone-700 transition-all relative group shadow-sm"
                      >
                          <div className="w-16 h-16 bg-stone-100 dark:bg-stone-950 rounded-lg flex items-center justify-center border border-stone-200 dark:border-stone-800 text-stone-600 relative">
                              <SpiritIcon size={24} />
                              {spirit.isLuxury && <div className="absolute -top-2 -left-2 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-200 p-1 rounded-full border border-purple-200 dark:border-purple-500 shadow-sm"><Gem size={10} /></div>}
                          </div>
                          <div className="flex-1">
                              <div className="flex justify-between items-start">
                                  <h3 className="text-lg font-serif text-stone-900 dark:text-white">{spirit.name}</h3>
                                  <span className="text-[10px] bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">{spirit.category}</span>
                              </div>
                              <p className="text-xs text-stone-500 mb-2">{spirit.distillery} • {spirit.age} • {spirit.abv}%</p>
                              
                              <div className="w-full h-1.5 bg-stone-100 dark:bg-stone-950 rounded-full overflow-hidden mb-2">
                                  <div 
                                    className={`h-full rounded-full ${spirit.inventoryLevel < 20 ? 'bg-red-500' : 'bg-amber-500'}`} 
                                    style={{width: `${spirit.inventoryLevel}%`}} 
                                  />
                              </div>

                              <div className="flex flex-wrap gap-1">
                                  {spirit.aromaProfile.slice(0,3).map((a,i) => (
                                      <span key={i} className="text-[9px] bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 px-1.5 py-0.5 rounded">{a}</span>
                                  ))}
                              </div>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                              <button 
                                  onClick={() => navigate(`/spirit/${spirit.id}`)}
                                  className="p-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-lg transition-colors"
                                  title="Voir les détails"
                              >
                                  <Eye size={16} className="text-stone-600 dark:text-stone-400" />
                              </button>
                              <button 
                                  onClick={() => handleDeleteSpirit(spirit.id)}
                                  className="p-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                                  title="Supprimer"
                              >
                                  <Trash2 size={16} className="text-red-600 dark:text-red-400" />
                              </button>
                          </div>
                      </div>
                  )})}
                  {spirits.length === 0 && (
                      <p className="text-center text-stone-500 text-sm py-10">Votre bar est vide.</p>
                  )}
               </div>
          </div>
      )}

      {/* --- TAB: COCKTAILS --- */}
      {activeTab === 'COCKTAILS' && (
          <div className="space-y-6">
              <form onSubmit={handleSearchCocktails} className="relative">
                  <Search className="absolute left-3 top-3 text-stone-400" size={18} />
                  <input 
                      type="text"
                      placeholder="Recette, ingrédient..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl py-2.5 pl-10 pr-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
              </form>
              
              <button onClick={() => setShowAIChat(true)} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-900 dark:to-purple-900 text-white py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/20">
                  <MessageSquare size={18} /> Discuter avec le Barman (IA)
              </button>

              {!searchQuery && (
                  <div>
                      <h3 className="text-stone-500 dark:text-stone-400 text-xs font-bold uppercase mb-3">Faisable avec mon stock</h3>
                      <div className="grid gap-3">
                          {cocktails.filter(c => canMakeCocktail(c)).map(c => (
                              <div key={c.id} className="bg-white dark:bg-stone-900/80 p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex items-center gap-4 shadow-sm">
                                  <div className="w-12 h-12 bg-stone-100 dark:bg-stone-950 rounded-lg flex items-center justify-center overflow-hidden">
                                     {c.imageUrl ? <img src={c.imageUrl} className="w-full h-full object-cover" /> : <GlassWater className="text-stone-400"/>}
                                  </div>
                                  <div>
                                      <h4 className="text-stone-900 dark:text-white font-serif">{c.name}</h4>
                                      <p className="text-xs text-stone-500">{c.ingredients.length} ingrédients</p>
                                  </div>
                                  <div className="ml-auto text-green-600 dark:text-green-500 text-xs flex items-center gap-1">
                                      <CheckCircle2 size={12} /> Prêt
                                  </div>
                              </div>
                          ))}
                          {cocktails.length === 0 && (
                              <p className="text-sm text-stone-500 italic">Aucune recette locale trouvée.</p>
                          )}
                      </div>
                  </div>
              )}

              {(apiResults.length > 0 || isSearchingApi) && (
                  <div>
                      <h3 className="text-stone-500 dark:text-stone-400 text-xs font-bold uppercase mb-3">Résultats web</h3>
                      {isSearchingApi ? (
                          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-500"/></div>
                      ) : (
                          <div className="grid gap-3">
                              {apiResults.map(c => (
                                  <div key={c.id} className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                                      <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-4">
                                              <div className="w-12 h-12 bg-stone-100 dark:bg-stone-950 rounded-lg flex items-center justify-center overflow-hidden">
                                                 {c.imageUrl ? <img src={c.imageUrl} className="w-full h-full object-cover" /> : <GlassWater className="text-stone-400"/>}
                                              </div>
                                              <div>
                                                  <h4 className="text-stone-900 dark:text-white font-serif">{c.name}</h4>
                                                  <p className="text-xs text-stone-500">{c.category}</p>
                                              </div>
                                          </div>
                                          <button onClick={() => handleImportRecipe(c)} className="text-xs bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-900 dark:text-white px-3 py-1.5 rounded-lg transition-colors">
                                              Importer
                                          </button>
                                      </div>
                                      <div className="text-xs text-stone-500 pl-16">
                                          {c.ingredients.map(i => i.name).join(', ')}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
          </div>
      )}

      {/* --- ADD SPIRIT MODAL --- */}
      {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/20 dark:bg-black/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up">
                  <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-white"><X size={20} /></button>
                  <h3 className="text-xl font-serif text-stone-900 dark:text-white mb-1">Ajouter au Bar</h3>
                  <p className="text-xs text-stone-500 mb-6">L'IA remplira automatiquement les détails.</p>
                  
                  <form onSubmit={handleAddSpirit} className="space-y-4">
                      <div>
                          <label className="text-sm text-stone-500 dark:text-stone-400 block mb-2">Nom du Spiritueux</label>
                          <input 
                            autoFocus
                            type="text" 
                            value={newSpiritName}
                            onChange={(e) => setNewSpiritName(e.target.value)}
                            placeholder="ex: Diplomatico Reserva"
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                      </div>
                      <button 
                        type="submit" 
                        disabled={!newSpiritName || isEnriching}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                      >
                          {isEnriching ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                          {isEnriching ? "Analyse en cours..." : "Ajouter"}
                      </button>
                  </form>
              </div>
          </div>
      )}
      
      {/* --- AI CHAT MODAL --- */}
      {showAIChat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/20 dark:bg-black/80 backdrop-blur-sm" onClick={() => setShowAIChat(false)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-indigo-500/50 w-full max-w-md rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up">
                  <button onClick={() => setShowAIChat(false)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-white"><X size={20} /></button>
                  
                  <div className="flex items-center gap-3 mb-4 text-indigo-600 dark:text-indigo-400">
                      <MessageSquare size={24} />
                      <h3 className="text-xl font-serif text-stone-900 dark:text-white">Le Barman Virtuel</h3>
                  </div>
                  
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
                      Demandez n'importe quel cocktail. Je me baserai sur votre stock (en excluant les bouteilles de luxe) pour créer une recette unique.
                  </p>

                  <textarea 
                    autoFocus
                    value={chatQuery}
                    onChange={(e) => setChatQuery(e.target.value)}
                    placeholder="Ex: Je veux un cocktail frais à base de Gin et de concombre..."
                    className="w-full h-32 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl p-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none mb-4"
                  />

                  <div className="flex items-center gap-2 text-[10px] text-purple-600 dark:text-purple-400 mb-4 bg-purple-50 dark:bg-purple-900/10 p-2 rounded-lg border border-purple-200 dark:border-purple-900/30">
                      <Gem size={12} />
                      <span>{spirits.filter(s => s.isLuxury).length} bouteilles de prestige ignorées.</span>
                  </div>

                  <button 
                    onClick={handleAICreate}
                    disabled={!chatQuery || isSearchingApi}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                  >
                      {isSearchingApi ? <Loader2 className="animate-spin" /> : <Zap size={20} />}
                      {isSearchingApi ? "Création en cours..." : "Générer la Recette"}
                  </button>
              </div>
          </div>
      )}

      {/* --- PARTY MODAL --- */}
      {showPartyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/20 dark:bg-black/80 backdrop-blur-sm" onClick={() => setShowPartyModal(false)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-indigo-500/30 w-full max-w-md rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                          <PartyPopper size={20} />
                      </div>
                      <h3 className="text-xl font-serif text-stone-900 dark:text-white">Mode Party</h3>
                  </div>

                  <div className="space-y-6">
                      <div>
                          <label className="text-sm text-stone-500 dark:text-stone-400">Nombre d'invités</label>
                          <div className="flex items-center gap-4 mt-2">
                              <input 
                                type="range" min="1" max="50" 
                                value={guestCount} 
                                onChange={(e) => setGuestCount(Number(e.target.value))}
                                className="flex-1 accent-indigo-500"
                              />
                              <span className="text-2xl font-bold text-stone-900 dark:text-white w-12 text-center">{guestCount}</span>
                          </div>
                      </div>

                      <div>
                          <label className="text-sm text-stone-500 dark:text-stone-400 mb-2 block">Sélectionnez les cocktails</label>
                          <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                              {cocktails.map(c => {
                                  const isSelected = selectedPartyCocktails.some(sel => sel.id === c.id);
                                  return (
                                      <div 
                                        key={c.id} 
                                        onClick={() => {
                                            if(isSelected) setSelectedPartyCocktails(prev => prev.filter(x => x.id !== c.id));
                                            else setSelectedPartyCocktails(prev => [...prev, c]);
                                        }}
                                        className={`p-3 rounded-lg border cursor-pointer flex justify-between items-center transition-all ${
                                            isSelected 
                                            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-900 dark:text-indigo-100' 
                                            : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-200'
                                        }`}
                                      >
                                          <span className="text-sm">{c.name}</span>
                                          {isSelected && <CheckCircle2 size={16} className="text-indigo-600 dark:text-indigo-400" />}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>

                      <button 
                        onClick={handleCalculateParty}
                        disabled={selectedPartyCocktails.length === 0}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2"
                      >
                          Calculer les besoins <ArrowRight size={18} />
                      </button>

                      {Object.keys(partyIngredients).length > 0 && (
                          <div className="bg-stone-50 dark:bg-stone-950 p-4 rounded-xl border border-stone-200 dark:border-stone-800 animate-fade-in">
                              <h4 className="text-stone-900 dark:text-white font-bold mb-3 flex items-center gap-2"><AlertCircle size={16} className="text-indigo-500"/> Ingrédients Nécessaires</h4>
                              <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-400">
                                  {Object.entries(partyIngredients).map(([name, amount]) => (
                                      <li key={name} className="flex justify-between border-b border-stone-200 dark:border-stone-800/50 pb-1">
                                          <span>{name}</span>
                                          <span className="text-stone-900 dark:text-white font-mono">{amount}</span>
                                      </li>
                                  ))}
                              </ul>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};