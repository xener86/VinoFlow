import React, { useState, useEffect } from 'react';
import { getSommelierRecommendations, getPairingAdvice, planEvening, chatWithSommelier, analyzeCellarForWineFair } from '../services/geminiService';
import { getInventory, getSpirits, getUserTasteProfile } from '../services/storageService';
import { CellarWine, SommelierRecommendation, EveningPlan, UserTasteProfile, CellarGapAnalysis } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { Sparkles, ChefHat, Calendar, Wine, MessageSquare, Utensils, Moon, ArrowRight, Loader2, Send, ShoppingBag, CheckCircle2, TrendingUp, AlertTriangle, Layers } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const Sommelier: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'ADVICE' | 'PAIRING' | 'SHOPPING' | 'CHAT'>('DASHBOARD');
  const [tasteProfile, setTasteProfile] = useState<UserTasteProfile | null>(null);
  
  // Advice State (Unified Tonight/Planner)
  const [adviceMode, setAdviceMode] = useState<'BOTTLE' | 'MENU'>('BOTTLE');
  const [adviceContext, setAdviceContext] = useState({ meal: '', mood: '', occasion: 'Dîner' });
  
  // Results
  const [recommendations, setRecommendations] = useState<{ rec: SommelierRecommendation, wine: CellarWine }[]>([]);
  const [eveningPlan, setEveningPlan] = useState<EveningPlan | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Pairing State
  const [pairingMode, setPairingMode] = useState<'FOOD_TO_WINE' | 'WINE_TO_FOOD'>('FOOD_TO_WINE');
  const [pairingQuery, setPairingQuery] = useState('');
  const [pairingResult, setPairingResult] = useState('');
  const [loadingPairing, setLoadingPairing] = useState(false);

  // Shopping / Wine Fair State
  const [shoppingAnalysis, setShoppingAnalysis] = useState<CellarGapAnalysis | null>(null);
  const [loadingShopping, setLoadingShopping] = useState(false);

  // Chat State
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);

  useEffect(() => {
    setTasteProfile(getUserTasteProfile());
  }, []);

  // Auto-execution from URL params
  useEffect(() => {
      const mode = searchParams.get('mode');
      const q = searchParams.get('q');

      if (mode === 'PAIRING') {
          setActiveTab('PAIRING');
          if (q) {
              setPairingQuery(q);
              setPairingMode('FOOD_TO_WINE');
              executePairing(q, 'FOOD_TO_WINE');
          }
      }
  }, [searchParams]);

  // --- Shared Logic ---
  
  const executePairing = async (query: string, mode: 'FOOD_TO_WINE' | 'WINE_TO_FOOD') => {
      if(!query) return;
      setLoadingPairing(true);
      const inventory = getInventory();
      const result = await getPairingAdvice(query, mode, inventory);
      setPairingResult(result);
      setLoadingPairing(false);
  };

  // --- Handlers ---

  const handleGetAdvice = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoadingAdvice(true);
      setRecommendations([]);
      setEveningPlan(null);
      
      const inventory = getInventory();

      if (adviceMode === 'BOTTLE') {
          // Mode: Just a Bottle (ex-Tonight)
          const recs = await getSommelierRecommendations(inventory, adviceContext);
          const enrichedRecs = recs.map(rec => ({
              rec,
              wine: inventory.find(w => w.id === rec.wineId)!
          })).filter(r => r.wine);
          setRecommendations(enrichedRecs);
      } else {
          // Mode: Full Menu (ex-Planner)
          const spirits = getSpirits();
          const plan = await planEvening(adviceContext, inventory, spirits);
          setEveningPlan(plan);
      }
      setLoadingAdvice(false);
  };

  const handleGetPairing = (e: React.FormEvent) => {
      e.preventDefault();
      executePairing(pairingQuery, pairingMode);
  };

  const handleAnalyzeCellar = async () => {
      setLoadingShopping(true);
      const inventory = getInventory();
      const analysis = await analyzeCellarForWineFair(inventory);
      setShoppingAnalysis(analysis);
      setLoadingShopping(false);
  };

  const handleChat = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!chatInput) return;

      const userMsg = chatInput;
      setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
      setChatInput('');
      setLoadingChat(true);

      const aiMsg = await chatWithSommelier(chatHistory.map(m => ({ role: m.role, text: m.text })), userMsg);
      
      setChatHistory(prev => [...prev, { role: 'assistant', text: aiMsg }]);
      setLoadingChat(false);
  };

  return (
    <div className="pb-24 animate-fade-in space-y-6">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-gradient-to-tr dark:from-indigo-600 dark:to-purple-600 flex items-center justify-center text-indigo-600 dark:text-white shadow-sm dark:shadow-lg border border-indigo-200 dark:border-none">
             <Sparkles size={24} />
          </div>
          <div>
              <h2 className="text-3xl font-serif text-stone-800 dark:text-white">Sommelier IA</h2>
              <p className="text-stone-500 dark:text-stone-400 text-sm">Votre expert personnel en dégustation.</p>
          </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-stone-100 dark:bg-stone-900 p-1 rounded-xl border border-stone-200 dark:border-stone-800 overflow-x-auto no-scrollbar">
          {[
              { id: 'DASHBOARD', label: 'Profil', icon: Sparkles },
              { id: 'ADVICE', label: 'Conseil', icon: Layers },
              { id: 'PAIRING', label: 'Accords', icon: Utensils },
              { id: 'SHOPPING', label: 'Achats', icon: ShoppingBag },
              { id: 'CHAT', label: 'Chat', icon: MessageSquare },
          ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 min-w-[80px] py-3 text-xs font-medium rounded-lg transition-all flex flex-col items-center gap-1 ${
                    activeTab === tab.id ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
                }`}
              >
                  <tab.icon size={18} />
                  {tab.label}
              </button>
          ))}
      </div>

      {/* --- DASHBOARD MODE --- */}
      {activeTab === 'DASHBOARD' && tasteProfile && (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 flex flex-col md:flex-row gap-8 items-center shadow-sm">
                  <div className="w-full md:w-1/2">
                      <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-4">Votre Profil Gustatif</h3>
                      <div className="h-64 bg-stone-50 dark:bg-stone-950/50 rounded-xl p-4 border border-stone-100 dark:border-stone-800/50">
                          <FlavorRadar data={tasteProfile.stylePreferences} />
                      </div>
                  </div>
                  <div className="w-full md:w-1/2 space-y-4">
                      <h4 className="text-sm font-bold uppercase text-stone-500">Cépages Favoris</h4>
                      <div className="flex flex-wrap gap-2">
                          {Object.entries(tasteProfile.favoriteGrapes).map(([grape, score]) => (
                              <span key={grape} className="px-3 py-1 bg-stone-100 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 rounded-full text-xs">
                                  {grape} <span className="text-wine-600 dark:text-wine-500 font-bold ml-1">{score}%</span>
                              </span>
                          ))}
                      </div>

                      <h4 className="text-sm font-bold uppercase text-stone-500 mt-4">Régions de Cœur</h4>
                      <div className="flex flex-wrap gap-2">
                          {Object.entries(tasteProfile.favoriteRegions).map(([region, score]) => (
                              <span key={region} className="px-3 py-1 bg-stone-100 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 rounded-full text-xs">
                                  {region} <span className="text-indigo-600 dark:text-indigo-400 font-bold ml-1">{score}%</span>
                              </span>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- ADVICE MODE (Merged TONIGHT & PLANNER) --- */}
      {activeTab === 'ADVICE' && (
          <div className="space-y-6 animate-fade-in">
              
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-serif text-stone-800 dark:text-white">Organiser votre Moment</h3>
                      <div className="flex bg-stone-100 dark:bg-stone-950 p-1 rounded-lg border border-stone-200 dark:border-stone-800">
                          <button 
                            onClick={() => setAdviceMode('BOTTLE')}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all ${adviceMode === 'BOTTLE' ? 'bg-white dark:bg-wine-900/30 text-wine-700 dark:text-wine-200 shadow-sm border border-stone-200 dark:border-wine-500/30' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
                          >
                              Juste une Bouteille
                          </button>
                          <button 
                            onClick={() => setAdviceMode('MENU')}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all ${adviceMode === 'MENU' ? 'bg-white dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 shadow-sm border border-stone-200 dark:border-indigo-500/30' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
                          >
                              Menu Complet
                          </button>
                      </div>
                  </div>

                  <form onSubmit={handleGetAdvice} className="space-y-4">
                      <div>
                          <label className="text-sm text-stone-500 dark:text-stone-400">Le Repas</label>
                          <input 
                            type="text" 
                            placeholder="ex: Curry de poulet, Pizza, Sushis..."
                            value={adviceContext.meal}
                            onChange={(e) => setAdviceContext({...adviceContext, meal: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-800 dark:text-white mt-1 outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-stone-600"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-sm text-stone-500 dark:text-stone-400">Humeur / Ambiance</label>
                              <input 
                                type="text" 
                                placeholder="ex: Festif, Détendu..."
                                value={adviceContext.mood}
                                onChange={(e) => setAdviceContext({...adviceContext, mood: e.target.value})}
                                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-800 dark:text-white mt-1 outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-stone-600"
                              />
                          </div>
                          <div>
                              <label className="text-sm text-stone-500 dark:text-stone-400">Occasion</label>
                              <select 
                                value={adviceContext.occasion}
                                onChange={(e) => setAdviceContext({...adviceContext, occasion: e.target.value})}
                                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-800 dark:text-white mt-1 outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-stone-600"
                              >
                                  <option>Dîner Quotidien</option>
                                  <option>Dîner Amis</option>
                                  <option>Rendez-vous Romantique</option>
                                  <option>Grande Occasion</option>
                                  <option>Apéro</option>
                              </select>
                          </div>
                      </div>
                      <button 
                        type="submit"
                        disabled={loadingAdvice} 
                        className={`w-full text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg ${
                            adviceMode === 'BOTTLE' ? 'bg-wine-600 hover:bg-wine-700 shadow-wine-900/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-900/20'
                        }`}
                      >
                          {loadingAdvice ? <Loader2 className="animate-spin" /> : (adviceMode === 'BOTTLE' ? <Moon size={20} /> : <Calendar size={20} />)}
                          {loadingAdvice ? "Le Sommelier réfléchit..." : (adviceMode === 'BOTTLE' ? "Trouver la bouteille idéale" : "Générer le Plan de Soirée")}
                      </button>
                  </form>
              </div>

              {/* RESULTS: BOTTLE LIST */}
              {adviceMode === 'BOTTLE' && recommendations.length > 0 && (
                  <div className="space-y-4 animate-fade-in-up">
                      <h3 className="text-stone-500 dark:text-stone-400 text-sm font-bold uppercase tracking-wider">Top Suggestions</h3>
                      {recommendations.map(({rec, wine}) => (
                          <div key={rec.wineId} className="bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl p-5 hover:border-wine-300 dark:hover:border-wine-800/50 transition-colors shadow-sm">
                              <div className="flex justify-between items-start mb-3">
                                  <div>
                                      <h4 className="text-lg font-serif text-stone-800 dark:text-white">{wine.name}</h4>
                                      <p className="text-xs text-stone-500">{wine.vintage} • {wine.region}</p>
                                  </div>
                                  <div className="bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded text-xs font-bold border border-green-200 dark:border-green-900/50">
                                      Match {rec.score}%
                                  </div>
                              </div>
                              <p className="text-stone-600 dark:text-stone-300 italic text-sm mb-3">"{rec.reasoning}"</p>
                              
                              <div className="grid grid-cols-2 gap-2 text-xs text-stone-600 dark:text-stone-500 bg-stone-100 dark:bg-stone-950/50 p-3 rounded-lg mb-3">
                                  <div>🌡️ {rec.servingTemp}</div>
                                  <div>🍷 {rec.decanting ? "Carafer" : "Pas de carafage"}</div>
                                  <div className="col-span-2">🍽️ {rec.foodPairingMatch}</div>
                              </div>

                              <button 
                                onClick={() => navigate(`/wine/${wine.id}`)}
                                className="w-full py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-medium"
                              >
                                  Voir la fiche
                              </button>
                          </div>
                      ))}
                  </div>
              )}

              {/* RESULTS: EVENING PLAN */}
              {adviceMode === 'MENU' && eveningPlan && (
                  <div className="space-y-6 animate-fade-in-up">
                      <div className="flex justify-between items-center">
                          <h3 className="text-2xl font-serif text-stone-800 dark:text-white">{eveningPlan.theme}</h3>
                          <button onClick={() => setEveningPlan(null)} className="text-stone-500 hover:text-stone-800 dark:hover:text-white text-sm">Nouveau</button>
                      </div>

                      <div className="relative border-l-2 border-stone-200 dark:border-stone-800 pl-8 space-y-12 ml-4">
                          {/* APERO */}
                          <div className="relative">
                              <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 border-indigo-500 flex items-center justify-center text-[10px] font-bold text-indigo-500">1</div>
                              <h4 className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-xs mb-2">Apéritif</h4>
                              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-sm">
                                  <h5 className="text-lg text-stone-800 dark:text-white font-serif">{eveningPlan.aperitif.name}</h5>
                                  <p className="text-stone-500 dark:text-stone-400 text-sm mb-2">{eveningPlan.aperitif.description}</p>
                                  {eveningPlan.aperitif.pairingSnack && (
                                      <div className="text-xs text-stone-500 bg-stone-50 dark:bg-stone-950 p-2 rounded">
                                          🍿 Snack : {eveningPlan.aperitif.pairingSnack}
                                      </div>
                                  )}
                              </div>
                          </div>

                          {/* MAIN */}
                          <div className="relative">
                              <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 border-wine-500 flex items-center justify-center text-[10px] font-bold text-wine-500">2</div>
                              <h4 className="text-wine-600 dark:text-wine-400 font-bold uppercase tracking-wider text-xs mb-2">Repas Principal</h4>
                              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-sm">
                                  <div className="mb-3">
                                      <span className="text-xs text-stone-500">Plat</span>
                                      <div className="text-stone-800 dark:text-white font-medium">{eveningPlan.mainCourse.dishName}</div>
                                  </div>
                                  <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
                                      <span className="text-xs text-stone-500">Vin Accordé</span>
                                      <div className="text-xl text-stone-800 dark:text-white font-serif">{eveningPlan.mainCourse.wineName}</div>
                                      <p className="text-stone-500 dark:text-stone-400 text-sm italic mt-1">"{eveningPlan.mainCourse.pairingReason}"</p>
                                  </div>
                              </div>
                          </div>

                          {/* DIGESTIF */}
                          <div className="relative">
                              <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-white dark:bg-stone-900 border-2 border-amber-500 flex items-center justify-center text-[10px] font-bold text-amber-500">3</div>
                              <h4 className="text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider text-xs mb-2">Digestif & Conclusion</h4>
                              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-sm">
                                  <h5 className="text-lg text-stone-800 dark:text-white font-serif">{eveningPlan.digestif.spiritName}</h5>
                                  <p className="text-stone-500 dark:text-stone-400 text-sm">{eveningPlan.digestif.description}</p>
                              </div>
                          </div>
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* --- PAIRING MODE --- */}
      {activeTab === 'PAIRING' && (
          <div className="space-y-6 animate-fade-in">
              <div className="flex bg-stone-100 dark:bg-stone-900 p-1 rounded-xl border border-stone-200 dark:border-stone-800">
                  <button onClick={() => setPairingMode('FOOD_TO_WINE')} className={`flex-1 py-2 text-xs rounded-lg ${pairingMode === 'FOOD_TO_WINE' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500'}`}>Plat → Vin</button>
                  <button onClick={() => setPairingMode('WINE_TO_FOOD')} className={`flex-1 py-2 text-xs rounded-lg ${pairingMode === 'WINE_TO_FOOD' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500'}`}>Vin → Plat</button>
              </div>

              <form onSubmit={handleGetPairing} className="relative">
                  <input 
                      type="text"
                      placeholder={pairingMode === 'FOOD_TO_WINE' ? "Quel plat cuisinez-vous ?" : "Quel vin voulez-vous servir ?"}
                      value={pairingQuery}
                      onChange={(e) => setPairingQuery(e.target.value)}
                      className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 pr-12 text-stone-800 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none"
                  />
                  <button type="submit" disabled={loadingPairing} className="absolute right-2 top-2 p-2 bg-wine-600 text-white rounded-lg hover:bg-wine-700 disabled:opacity-50">
                      {loadingPairing ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                  </button>
              </form>

              {pairingResult && (
                  <div className="bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm">
                      <div className="prose prose-sm max-w-none text-stone-700 dark:text-stone-300">
                          <div className="whitespace-pre-wrap">{pairingResult}</div>
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* --- SHOPPING / WINE FAIR MODE --- */}
      {activeTab === 'SHOPPING' && (
          <div className="space-y-6 animate-fade-in">
              {!shoppingAnalysis ? (
                  <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 text-center shadow-sm">
                      <ShoppingBag className="mx-auto text-green-600 dark:text-green-500 mb-4" size={48} />
                      <h3 className="text-2xl font-serif text-stone-800 dark:text-white mb-2">Foire aux Vins & Achats</h3>
                      <p className="text-stone-500 dark:text-stone-400 text-sm mb-8 max-w-md mx-auto">
                          L'IA analyse la répartition de votre cave (régions, couleurs, millésimes) pour identifier les manques et générer une liste d'achat stratégique pour la prochaine Foire aux Vins.
                      </p>
                      <button 
                        onClick={handleAnalyzeCellar}
                        disabled={loadingShopping}
                        className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-3 mx-auto shadow-lg shadow-green-900/30 transition-all"
                      >
                          {loadingShopping ? <Loader2 className="animate-spin" /> : <TrendingUp size={22} />}
                          Analyser ma Cave & Créer Liste
                      </button>
                  </div>
              ) : (
                  <div className="space-y-6 animate-fade-in-up">
                      <div className="flex justify-between items-center">
                           <h3 className="text-xl font-serif text-stone-800 dark:text-white">Votre Stratégie d'Achat</h3>
                           <button 
                             onClick={() => setShoppingAnalysis(null)}
                             className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-white"
                           >
                               Réinitialiser
                           </button>
                      </div>

                      {/* Analysis Summary */}
                      <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                          <h4 className="text-sm font-bold uppercase text-stone-500 dark:text-stone-400 mb-3 flex items-center gap-2">
                              <TrendingUp size={16} /> Bilan de Cave
                          </h4>
                          <p className="text-stone-700 dark:text-stone-200 text-sm leading-relaxed mb-4">
                              {shoppingAnalysis.generalAnalysis}
                          </p>
                          <div className="flex flex-wrap gap-2">
                              {shoppingAnalysis.gaps.map((gap, i) => (
                                  <span key={i} className="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-900/50 rounded-lg text-xs flex items-center gap-2">
                                      <AlertTriangle size={12} /> {gap}
                                  </span>
                              ))}
                          </div>
                      </div>

                      {/* Shopping List */}
                      <div>
                          <h4 className="text-sm font-bold uppercase text-stone-500 dark:text-stone-400 mb-3 flex items-center gap-2 ml-1">
                              <CheckCircle2 size={16} /> Checklist Foire aux Vins
                          </h4>
                          <div className="grid gap-3">
                              {shoppingAnalysis.suggestions.map((item, i) => (
                                  <div key={i} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4 rounded-xl flex flex-col md:flex-row gap-4 md:items-center relative overflow-hidden shadow-sm">
                                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                          item.priority === 'HIGH' ? 'bg-red-500' : item.priority === 'MEDIUM' ? 'bg-yellow-500' : 'bg-blue-500'
                                      }`} />
                                      
                                      <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                                  item.priority === 'HIGH' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : item.priority === 'MEDIUM' ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                              }`}>
                                                  {item.priority === 'HIGH' ? 'PRIORITAIRE' : item.priority === 'MEDIUM' ? 'CONSEILLÉ' : 'OPTIONNEL'}
                                              </span>
                                              <span className="text-xs text-stone-500 uppercase tracking-wider">{item.type} • {item.region}</span>
                                          </div>
                                          <h5 className="text-stone-800 dark:text-white font-serif text-lg">{item.specificTarget}</h5>
                                          <p className="text-stone-500 dark:text-stone-400 text-xs mt-1">{item.reason}</p>
                                      </div>

                                      <div className="md:text-right">
                                          <div className="text-green-600 dark:text-green-400 font-mono text-sm">{item.budgetRecommendation}</div>
                                          <div className="text-[10px] text-stone-500 dark:text-stone-600">Budget estimé</div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* --- CHAT MODE --- */}
      {activeTab === 'CHAT' && (
          <div className="flex flex-col h-[60vh] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatHistory.length === 0 && (
                      <div className="text-center text-stone-500 mt-10">
                          <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                          <p>Posez-moi une question sur le vin, la conservation ou l'histoire.</p>
                      </div>
                  )}
                  {chatHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                              msg.role === 'user' 
                              ? 'bg-wine-600 text-white rounded-tr-none' 
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-tl-none'
                          }`}>
                              {msg.text}
                          </div>
                      </div>
                  ))}
                  {loadingChat && (
                      <div className="flex justify-start">
                          <div className="bg-stone-100 dark:bg-stone-800 p-3 rounded-xl rounded-tl-none">
                              <Loader2 className="animate-spin text-stone-500" size={16} />
                          </div>
                      </div>
                  )}
              </div>
              <form onSubmit={handleChat} className="p-3 border-t border-stone-200 dark:border-stone-800 flex gap-2">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Posez votre question..."
                    className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 text-stone-800 dark:text-white focus:outline-none focus:border-wine-500"
                  />
                  <button type="submit" disabled={!chatInput || loadingChat} className="p-2 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-white rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50">
                      <Send size={18} />
                  </button>
              </form>
          </div>
      )}

    </div>
  );
};