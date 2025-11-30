import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWineHistory, addBottles, giftBottle, toggleFavorite } from '../services/storageService';
import { generateTastingQuestionnaire } from '../services/geminiService'; // Import direct si disponible, sinon conserver la fonction locale
import { useWines } from '../hooks/useWines'; // ✅ Hook Async
import { useRacks } from '../hooks/useRacks'; // ✅ Hook Async
import { useTastingNotes } from '../hooks/useTastingNotes'; // ✅ Hook Async
import { saveTastingNote, deleteTastingNote } from '../services/storageService';
import { CellarWine, TimelineEvent } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { TastingQuestionnaireCompact, TastingFormData } from '../components/TastingQuestionnaireCompact';
import { TastingNoteEditor, TastingNote } from '../components/TastingNoteEditor';
import { ArrowLeft, MapPin, Calendar, Clock, BookOpen, ChefHat, Sparkles, Plus, Edit, Gift, Wine as WineIcon, X, Loader2 } from 'lucide-react';

// Fonction helper pour les paramètres API (si nécessaire localement)
const getApiSettings = () => {
    const stored = localStorage.getItem('vf_api_settings');
    return stored ? JSON.parse(stored) : { provider: 'gemini', apiKey: '' };
};

// Fonction locale si le service n'est pas encore mis à jour pour l'export
const localGenerateTastingQuestionnaire = async (wineData: CellarWine) => {
    // ... (Logique IA conservée, ou appel au service geminiService si disponible)
    // Pour simplifier ici, on suppose que vous utilisez l'import ou la fonction existante
    return null; // Placeholder si service non dispo
};

export const WineDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // ✅ Utilisation des Hooks pour les données globales
  const { wines, loading: loadingWines, refresh: refreshWines } = useWines();
  const { racks, loading: loadingRacks } = useRacks();
  const { notes: allTastingNotes, loading: loadingNotes, refresh: refreshNotes } = useTastingNotes();

  // États locaux
  const [history, setHistory] = useState<TimelineEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'TASTING' | 'STORY' | 'CELLAR'>('TASTING');
  
  // États Formulaire Dégustation
  const [showTastingForm, setShowTastingForm] = useState(false);
  const [editingNote, setEditingNote] = useState<TastingNote | null>(null);
  const [isLoadingQuestionnaire, setIsLoadingQuestionnaire] = useState(false);
  const [aiQuestionnaire, setAiQuestionnaire] = useState<any>(null);
  const [initialFormData, setInitialFormData] = useState<Partial<TastingFormData> | undefined>(undefined);
  
  // État Modal Cadeau
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState('');
  const [giftOccasion, setGiftOccasion] = useState('');

  // ✅ Dérivation du vin courant depuis le hook
  const wine = useMemo(() => wines.find(w => w.id === id) || null, [wines, id]);

  // ✅ Dérivation des notes de ce vin
  const wineNotes = useMemo(() => {
      if (!id || !allTastingNotes) return [];
      return allTastingNotes.filter(n => n.wineId === id);
  }, [allTastingNotes, id]);

  // ✅ Chargement de l'historique (qui reste une fonction spécifique)
  useEffect(() => {
    const loadHistory = async () => {
        if (!id) return;
        setLoadingHistory(true);
        try {
            const data = await getWineHistory(id); // Appel Async
            setHistory(data);
        } catch (e) {
            console.error("Error loading history", e);
        } finally {
            setLoadingHistory(false);
        }
    };
    loadHistory();
  }, [id, wine]); // Recharger si le vin change (ex: stock)

  // Redirection si vin introuvable après chargement
  useEffect(() => {
      if (!loadingWines && !wine && id) {
          navigate('/'); // ou page 404
      }
  }, [loadingWines, wine, id, navigate]);

  // --- Handlers ---

  const getRackName = (rackId: string) => {
      return racks.find(r => r.id === rackId)?.name || 'Rack Inconnu';
  };

  const getRowLabel = (index: number) => {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      return letters[index] || "?";
  };

  const handleStartTasting = async () => {
    if (!wine) return;
    setIsLoadingQuestionnaire(true);
    setShowTastingForm(true);
    setEditingNote(null);
    
    // Appel IA (Simulé ou réel via service)
    // const questionnaire = await generateTastingQuestionnaire(wine); 
    // setAiQuestionnaire(questionnaire);
    
    // Valeurs par défaut
    setInitialFormData({
        visual: 50,
        visualNotes: 'Observation visuelle',
        nose: wine.aromaProfile?.slice(0, 3) || [],
        body: wine.sensoryProfile?.body || 50,
        acidity: wine.sensoryProfile?.acidity || 50,
        tannin: wine.sensoryProfile?.tannin || 50,
        finish: 2,
        rating: 0,
        pairedWith: '',
        pairingQuality: 0,
        pairingSuggestion: '',
        notes: ''
    });
    
    setIsLoadingQuestionnaire(false);
  };

  const handleTastingComplete = async (formData: TastingFormData) => {
    if (!wine) return;

    let noteToSave: TastingNote;

    if (editingNote) {
      noteToSave = { ...editingNote, ...formData, date: new Date().toISOString() };
    } else {
      noteToSave = {
        id: crypto.randomUUID(),
        wineId: wine.id,
        wineName: wine.name,
        wineVintage: wine.vintage,
        date: new Date().toISOString(),
        ...formData
      };
    }

    await saveTastingNote(noteToSave); // ✅ Async
    await refreshNotes(); // Refresh global

    setShowTastingForm(false);
    setEditingNote(null);
    setInitialFormData(undefined);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (window.confirm("Supprimer cette note ?")) {
        await deleteTastingNote(noteId); // ✅ Async
        refreshNotes();
    }
  };

  const handleEditNote = (note: TastingNote) => {
    setEditingNote(note);
    setInitialFormData({ ...note });
    setShowTastingForm(true);
  };

  const handleAddStock = async () => {
      if (wine && window.confirm(`Ajouter une bouteille de ${wine.name} au stock ?`)) {
          await addBottles(wine.id, 1); // ✅ Async
          refreshWines(); // Refresh stock
      }
  };

  const handleGiftBottle = async () => {
      if (!wine || !giftRecipient) return;
      
      const availableBottle = wine.bottles.find(b => !b.isConsumed);
      if (availableBottle) {
          await giftBottle(wine.id, availableBottle.id, giftRecipient, giftOccasion); // ✅ Async
          setShowGiftModal(false);
          setGiftRecipient('');
          setGiftOccasion('');
          refreshWines(); // Refresh stock
          alert(`Bouteille offerte à ${giftRecipient} !`);
      } else {
          alert("Aucune bouteille disponible en stock.");
      }
  };

  const handleToggleFavorite = async () => {
      if (wine) {
          await toggleFavorite(wine.id); // ✅ Async
          refreshWines();
      }
  };

  // Loading State
  if (loadingWines || !wine) {
      return (
          <div className="flex justify-center items-center h-screen bg-stone-50 dark:bg-stone-950">
              <Loader2 className="animate-spin text-wine-600" size={32} />
          </div>
      );
  }

  const typeColor = wine.type === 'RED' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50' : 
                    wine.type === 'WHITE' ? 'text-yellow-600 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-100 dark:border-yellow-900/50' : 
                    'text-pink-600 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/30 border border-pink-100 dark:border-pink-900/50';

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
              onClick={() => navigate(`/wine/${wine.id}/edit`)}
              className="p-2 text-stone-400 hover:text-stone-800 dark:hover:text-white bg-white/80 dark:bg-stone-900/50 rounded-full backdrop-blur-sm shadow-sm border border-stone-200 dark:border-stone-800"
            >
              <Edit size={20} />
            </button>
        </div>
        
        <div className="pt-10 flex flex-col items-center text-center">
            <div className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-4 ${typeColor}`}>
                {wine.type === 'RED' ? 'ROUGE' : wine.type === 'WHITE' ? 'BLANC' : wine.type === 'ROSE' ? 'ROSÉ' : wine.type === 'SPARKLING' ? 'PÉTILLANT' : wine.type}
            </div>
            <h1 className="text-4xl font-serif text-stone-900 dark:text-white mb-2 leading-tight">{wine.name}</h1>
            {wine.cuvee && <p className="text-2xl font-serif text-wine-600 dark:text-wine-400 mb-2 italic">{wine.cuvee}</p>}
            <p className="text-stone-600 dark:text-stone-400 text-lg">{wine.producer} • {wine.vintage}</p>
            <p className="text-stone-500 text-sm">
                {wine.region}, {wine.country} {wine.parcel ? `• ${wine.parcel}` : ''}
            </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-stone-100 dark:bg-stone-900 rounded-xl mb-6 border border-stone-200 dark:border-stone-800">
        <button 
          onClick={() => setActiveTab('TASTING')}
          className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'TASTING' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
        >
          Dégustation
        </button>
        <button 
          onClick={() => setActiveTab('STORY')}
          className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'STORY' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
        >
          Récit
        </button>
        <button 
          onClick={() => setActiveTab('CELLAR')}
          className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'CELLAR' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
        >
          Cave & Vie
        </button>
      </div>

      {/* Content */}
      <div className="space-y-6">
        
        {/* TAB: TASTING */}
        {activeTab === 'TASTING' && (
          <div className="space-y-6 animate-fade-in">
             <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-wine-600 dark:text-wine-400">
                    <Sparkles size={18} />
                    <h3 className="font-serif text-lg text-stone-900 dark:text-white">Profil Sensoriel</h3>
                </div>
                <p className="text-stone-600 dark:text-stone-300 italic text-lg leading-relaxed mb-6">
                  "{wine.sensoryDescription}"
                </p>
                <div className="flex flex-col md:flex-row gap-8 items-center">
                    <div className="w-full md:w-1/2 bg-stone-50 dark:bg-stone-950/50 rounded-xl p-4 border border-stone-100 dark:border-stone-800">
                       <FlavorRadar data={wine.sensoryProfile} />
                    </div>
                    <div className="w-full md:w-1/2 flex flex-wrap gap-2 content-start">
                        {wine.aromaProfile?.map((aroma, i) => (
                          <span key={i} className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg text-sm border border-stone-200 dark:border-stone-700">
                            {aroma}
                          </span>
                        ))}
                    </div>
                </div>
             </div>

             <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-orange-500 dark:text-orange-400">
                    <ChefHat size={18} />
                    <h3 className="font-serif text-lg text-stone-900 dark:text-white">Accords Mets-Vins</h3>
                </div>
                <ul className="space-y-3">
                   {wine.suggestedFoodPairings?.map((pair, i) => (
                     <li key={i} className="flex items-start gap-3 text-stone-700 dark:text-stone-300">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500/50"></span>
                        {pair}
                     </li>
                   ))}
                </ul>
             </div>

             {/* Fiches de Dégustation */}
             <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2 text-wine-600 dark:text-wine-400">
                   <Sparkles size={18} />
                   <h3 className="font-serif text-lg text-stone-900 dark:text-white">
                     Mes Dégustations ({wineNotes.length})
                   </h3>
                 </div>
                 {!showTastingForm && (
                   <button
                     onClick={handleStartTasting}
                     className="text-xs px-3 py-1.5 bg-wine-600 hover:bg-wine-700 text-white rounded-lg flex items-center gap-1 font-medium transition-colors"
                   >
                     <Plus size={14} />
                     Ajouter une fiche
                   </button>
                 )}
               </div>

               {/* Questionnaire Form */}
               {showTastingForm && (
                 <div className="mb-6 animate-fade-in">
                   <div className="flex items-center justify-between mb-4">
                     <h4 className="font-semibold text-stone-900 dark:text-white">
                       {editingNote ? 'Modifier la dégustation' : 'Nouvelle dégustation'}
                     </h4>
                     <button
                       onClick={() => {
                         setShowTastingForm(false);
                         setEditingNote(null);
                         setInitialFormData(undefined);
                       }}
                       className="p-1 hover:bg-stone-200 dark:hover:bg-stone-800 rounded transition-colors"
                     >
                       <X size={20} className="text-stone-500" />
                     </button>
                   </div>
                   <TastingQuestionnaireCompact
                     wine={wine}
                     initialData={initialFormData}
                     onComplete={handleTastingComplete}
                     onCancel={() => {
                       setShowTastingForm(false);
                       setEditingNote(null);
                       setInitialFormData(undefined);
                     }}
                     onToggleFavorite={handleToggleFavorite}
                     isLoadingQuestionnaire={isLoadingQuestionnaire}
                     aiQuestionnaire={aiQuestionnaire}
                   />
                 </div>
               )}

               {/* List of Tasting Notes */}
               {!showTastingForm && (
                 <div className="space-y-4">
                   {wineNotes.length > 0 ? (
                     wineNotes.map(note => (
                       <TastingNoteEditor
                         key={note.id}
                         note={note}
                         onEdit={handleEditNote}
                         onDelete={handleDeleteNote}
                         showActions={true}
                       />
                     ))
                   ) : (
                     <div className="text-center py-8 text-stone-500">
                       <Sparkles size={32} className="mx-auto mb-3 opacity-50" />
                       <p className="text-sm">Aucune dégustation enregistrée pour ce vin.</p>
                       <p className="text-xs text-stone-400 mt-2">Cliquez sur "Ajouter une fiche" pour commencer.</p>
                     </div>
                   )}
                 </div>
               )}
             </div>
          </div>
        )}

        {/* TAB: STORY */}
        {activeTab === 'STORY' && (
           <div className="space-y-6 animate-fade-in">
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 relative overflow-hidden shadow-sm">
                 <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                    <BookOpen size={120} />
                 </div>
                 <div className="relative z-10">
                    <h3 className="font-serif text-xl text-stone-900 dark:text-white mb-4">L'Histoire du Domaine</h3>
                    <div className="prose prose-invert prose-stone max-w-none">
                       <p className="text-stone-700 dark:text-stone-300 leading-relaxed">
                         {wine.producerHistory}
                       </p>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <span className="text-xs text-stone-500 uppercase font-bold">Cépages</span>
                    <p className="text-stone-800 dark:text-stone-200 mt-1">{wine.grapeVarieties.join(', ')}</p>
                 </div>
                 <div className="bg-white dark:bg-stone-900/50 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <span className="text-xs text-stone-500 uppercase font-bold">Format</span>
                    <p className="text-stone-800 dark:text-stone-200 mt-1">{wine.format}</p>
                 </div>
              </div>
           </div>
        )}

        {/* TAB: CELLAR */}
        {activeTab === 'CELLAR' && (
           <div className="space-y-6 animate-fade-in">
              {/* Stats Bar */}
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-wine-600 dark:text-wine-500">
                              <WineIcon size={20} />
                          </div>
                          <div>
                              <p className="text-2xl font-bold text-stone-900 dark:text-white">{wine.inventoryCount}</p>
                              <p className="text-xs text-stone-500">En Stock</p>
                          </div>
                      </div>
                      <button onClick={handleAddStock} className="p-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-full transition-colors border border-stone-200 dark:border-stone-700">
                          <Plus size={16} className="text-stone-600 dark:text-stone-300" />
                      </button>
                  </div>
                  <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 flex items-center gap-4 shadow-sm">
                      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-green-600 dark:text-green-500">
                          <Calendar size={20} />
                      </div>
                      <div>
                          <p className="text-lg font-bold text-stone-900 dark:text-white">2025-2030</p>
                          <p className="text-xs text-stone-500">Apogée</p>
                      </div>
                  </div>
              </div>

              {/* Location */}
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-stone-400">
                      <MapPin size={18} />
                      <h3 className="font-serif text-lg text-stone-900 dark:text-white">Emplacement</h3>
                  </div>
                  {!loadingRacks && wine.bottles.filter(b => !b.isConsumed).length > 0 ? (
                      <div className="space-y-2">
                          {wine.bottles.filter(b => !b.isConsumed).map((b, i) => {
                              let locationLabel = "Non trié";
                              if (typeof b.location !== 'string') {
                                  const rackName = getRackName(b.location.rackId);
                                  locationLabel = `${rackName} [${getRowLabel(b.location.y)}${b.location.x + 1}]`;
                              } else {
                                  locationLabel = b.location;
                              }
                              
                              return (
                                  <div key={b.id} className="flex justify-between items-center text-sm bg-stone-50 dark:bg-stone-950 p-3 rounded-lg border border-stone-200 dark:border-stone-800">
                                      <span className="text-stone-700 dark:text-stone-300">Bouteille #{i + 1}</span>
                                      <span className="text-wine-600 dark:text-wine-400 font-mono text-xs">
                                          {locationLabel}
                                      </span>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (
                      <p className="text-stone-500 italic">Rupture de stock ou chargement...</p>
                  )}
              </div>

              {/* Timeline */}
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-2 mb-6 text-stone-400">
                      <Clock size={18} />
                      <h3 className="font-serif text-lg text-stone-900 dark:text-white">Historique</h3>
                  </div>
                  {loadingHistory ? (
                      <div className="flex justify-center py-4"><Loader2 className="animate-spin text-stone-400" /></div>
                  ) : history.length > 0 ? (
                      <div className="relative border-l border-stone-200 dark:border-stone-800 ml-3 space-y-6">
                          {history.map((event, i) => (
                              <div key={i} className="relative pl-6">
                                  <div className={`absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border border-white dark:border-stone-900 ${
                                      event.type === 'IN' ? 'bg-green-500' : 
                                      event.type === 'OUT' ? 'bg-red-500' : 
                                      event.type === 'GIFT' ? 'bg-purple-500' :
                                      event.type === 'MOVE' ? 'bg-blue-500' : 'bg-stone-500'
                                  }`} />
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <p className="text-stone-800 dark:text-stone-200 text-sm font-medium">{event.description}</p>
                                          <p className="text-stone-500 text-xs">par {event.user}</p>
                                      </div>
                                      <span className="text-xs text-stone-600 font-mono">
                                          {new Date(event.date).toLocaleDateString('fr-FR')}
                                      </span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <p className="text-stone-500 italic text-sm">Aucun historique disponible.</p>
                  )}
              </div>

              {/* Gift Section */}
              {wine.inventoryCount > 0 && (
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-6 rounded-2xl border border-purple-200 dark:border-purple-900/50 shadow-sm">
                      <div className="flex items-center gap-2 mb-4 text-purple-600 dark:text-purple-400">
                          <Gift size={18} />
                          <h3 className="font-serif text-lg text-stone-900 dark:text-white">Offrir une Bouteille</h3>
                      </div>
                      <p className="text-stone-600 dark:text-stone-400 text-sm mb-4">
                          Gardez une trace des bouteilles offertes à vos proches.
                      </p>
                      <button 
                        onClick={() => setShowGiftModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors"
                      >
                          <Gift size={16} /> Offrir
                      </button>
                  </div>
              )}
           </div>
        )}

      </div>

      {/* Gift Modal */}
      {showGiftModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80 backdrop-blur-sm" onClick={() => setShowGiftModal(false)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up">
                  <h3 className="text-xl font-serif text-stone-900 dark:text-white mb-4">Offrir une Bouteille</h3>
                  <p className="text-sm text-stone-500 mb-4">{wine.name} {wine.vintage}</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-sm text-stone-600 dark:text-stone-400 block mb-2">À qui ?</label>
                          <input 
                            type="text"
                            value={giftRecipient}
                            onChange={(e) => setGiftRecipient(e.target.value)}
                            placeholder="ex: Marie Dupont"
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                          />
                      </div>
                      <div>
                          <label className="text-sm text-stone-600 dark:text-stone-400 block mb-2">Pour quelle occasion ?</label>
                          <input 
                            type="text"
                            value={giftOccasion}
                            onChange={(e) => setGiftOccasion(e.target.value)}
                            placeholder="ex: Anniversaire, Mariage..."
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                          />
                      </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                      <button 
                        onClick={() => setShowGiftModal(false)}
                        className="flex-1 py-3 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                          Annuler
                      </button>
                      <button 
                        onClick={handleGiftBottle}
                        disabled={!giftRecipient}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-3 rounded-lg font-bold transition-colors"
                      >
                          Confirmer
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};