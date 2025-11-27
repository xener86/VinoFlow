import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWineById, getWineHistory, addBottles, getRacks, giftBottle, toggleFavorite } from '../services/storageService';
import { CellarWine, TimelineEvent } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { TastingQuestionnaireCompact, TastingFormData } from '../components/TastingQuestionnaireCompact';
import { TastingNoteEditor, TastingNote } from '../components/TastingNoteEditor';
import { ArrowLeft, MapPin, Calendar, Clock, BookOpen, ChefHat, Sparkles, Plus, Edit, Gift, Wine as WineIcon, X } from 'lucide-react';

export const WineDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wine, setWine] = useState<CellarWine | null>(null);
  const [history, setHistory] = useState<TimelineEvent[]>([]);
  const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
  const [activeTab, setActiveTab] = useState<'TASTING' | 'STORY' | 'CELLAR'>('TASTING');
  
  // Tasting questionnaire state
  const [showTastingForm, setShowTastingForm] = useState(false);
  const [editingNote, setEditingNote] = useState<TastingNote | null>(null);
  const [isLoadingQuestionnaire, setIsLoadingQuestionnaire] = useState(false);
  const [aiQuestionnaire, setAiQuestionnaire] = useState<any>(null);
  const [initialFormData, setInitialFormData] = useState<Partial<TastingFormData> | undefined>(undefined);
  
  // Gift Modal State
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState('');
  const [giftOccasion, setGiftOccasion] = useState('');

  useEffect(() => {
    if (id) {
      loadWineData(id);
      loadTastingNotes(id);
    }
  }, [id, navigate]);

  const loadWineData = (wineId: string) => {
      const w = getWineById(wineId);
      if (w) {
        setWine(w);
        setHistory(getWineHistory(wineId));
      } else {
        navigate('/');
      }
  }

  const loadTastingNotes = (wineId: string) => {
    const stored = localStorage.getItem('vf_tasting_notes');
    if (stored) {
      const allNotes: TastingNote[] = JSON.parse(stored);
      const wineNotes = allNotes.filter(note => note.wineId === wineId);
      // Trier par date décroissante (plus récent en premier)
      wineNotes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTastingNotes(wineNotes);
    }
  };

  const getApiSettings = () => {
    const stored = localStorage.getItem('vf_api_settings');
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      provider: 'anthropic',
      apiKey: '',
      model: 'claude-sonnet-4-20250514',
      openaiModel: 'gpt-4'
    };
  };

  const getVisualDefault = (wineData: CellarWine): number => {
    const visualMap: Record<string, number> = {
      'RED': 75,
      'WHITE': 40,
      'ROSE': 50,
      'SPARKLING': 30
    };
    return visualMap[wineData.type] || 50;
  };

  const getVisualDescription = (wineData: CellarWine, intensity: number): string => {
    if (wineData.type === 'RED') {
      if (intensity > 70) return 'Rubis profond / Grenat';
      if (intensity > 40) return 'Rubis / Cerise';
      return 'Rouge clair / Tuilé';
    }
    if (wineData.type === 'WHITE') {
      if (intensity > 70) return 'Or / Ambré';
      if (intensity > 40) return 'Jaune paille / Doré';
      return 'Pâle / Verdâtre';
    }
    if (wineData.type === 'ROSE') {
      if (intensity > 70) return 'Saumon soutenu';
      if (intensity > 40) return 'Rose vif';
      return 'Pétale de rose';
    }
    return 'Observation visuelle';
  };

  const generateTastingQuestionnaire = async (wineData: CellarWine) => {
    try {
      const settings = getApiSettings();
      
      let apiUrl = '';
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      let body: any = {};

      const prompt = `Tu es un sommelier expert. Génère un questionnaire de dégustation personnalisé pour ce vin :

VIN : ${wineData.name} ${wineData.cuvee || ''}
PRODUCTEUR : ${wineData.producer}
RÉGION : ${wineData.region}
MILLÉSIME : ${wineData.vintage}
COULEUR : ${wineData.type}
${wineData.aromaProfile?.length ? `PROFIL AROMATIQUE : ${wineData.aromaProfile.join(', ')}` : ''}

Réponds UNIQUEMENT avec un objet JSON valide (sans backticks ni texte) :
{
  "visualIntensity": 50-80 (nombre selon couleur type),
  "visualDescription": "Description couleur précise (ex: Rubis profond, Or brillant, Rose saumon)",
  "bodyDefault": 40-80 (selon région/millésime),
  "acidityDefault": 30-70 (selon type/région),
  "tanninDefault": 20-80 (selon couleur/âge),
  "tastingTips": "1 conseil court de dégustation (température, aération...)",
  "pairingSuggestions": ["5 accords mets-vins précis pour ce vin"]
}

IMPORTANT : 
- Adapte les valeurs au profil EXACT du vin (pas de valeurs génériques)
- Les pairingSuggestions doivent être des plats précis
- Ne mets RIEN d'autre que le JSON dans ta réponse`;

      if (settings.provider === 'anthropic') {
        apiUrl = 'https://api.anthropic.com/v1/messages';
        body = {
          model: settings.model || 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        };
      } else if (settings.provider === 'openai') {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
        body = {
          model: settings.openaiModel || 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        };
      } else if (settings.provider === 'mistral') {
        apiUrl = 'https://api.mistral.ai/v1/chat/completions';
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
        body = {
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: prompt }]
        };
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      let content = '';
      if (settings.provider === 'anthropic') {
        content = data.content[0].text.trim();
      } else if (settings.provider === 'openai' || settings.provider === 'mistral') {
        content = data.choices[0].message.content.trim();
      }
      
      // Nettoyer les backticks markdown si présents
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      return JSON.parse(jsonContent);
    } catch (error) {
      console.error('Erreur génération questionnaire IA:', error);
      return null;
    }
  };

  const handleStartTasting = async () => {
    if (!wine) return;
    
    setIsLoadingQuestionnaire(true);
    setShowTastingForm(true);
    setEditingNote(null);
    
    // Générer le questionnaire personnalisé via IA
    const questionnaire = await generateTastingQuestionnaire(wine);
    setAiQuestionnaire(questionnaire);
    
    if (questionnaire) {
      // Pré-remplir avec les données IA
      setInitialFormData({
        visual: questionnaire.visualIntensity || getVisualDefault(wine),
        visualNotes: questionnaire.visualDescription || getVisualDescription(wine, questionnaire.visualIntensity || getVisualDefault(wine)),
        nose: [],
        body: questionnaire.bodyDefault || wine.sensoryProfile?.body || 50,
        acidity: questionnaire.acidityDefault || wine.sensoryProfile?.acidity || 50,
        tannin: questionnaire.tanninDefault || wine.sensoryProfile?.tannin || 50,
        finish: 2,
        rating: 0,
        pairedWith: '',
        pairingQuality: 0,
        pairingSuggestion: '',
        notes: ''
      });
    } else {
      // Fallback si l'IA échoue
      setInitialFormData({
        visual: getVisualDefault(wine),
        visualNotes: getVisualDescription(wine, getVisualDefault(wine)),
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
    }
    
    setIsLoadingQuestionnaire(false);
  };

  const handleTastingComplete = (formData: TastingFormData) => {
    if (!wine) return;

    const stored = localStorage.getItem('vf_tasting_notes');
    const allNotes: TastingNote[] = stored ? JSON.parse(stored) : [];

    if (editingNote) {
      // Update existing note
      const updatedNotes = allNotes.map(note => 
        note.id === editingNote.id 
          ? { ...note, ...formData, date: new Date().toISOString() }
          : note
      );
      localStorage.setItem('vf_tasting_notes', JSON.stringify(updatedNotes));
      setEditingNote(null);
    } else {
      // Create new note
      const newNote: TastingNote = {
        id: `tasting_${Date.now()}`,
        wineId: wine.id,
        wineName: wine.name,
        wineVintage: wine.vintage,
        date: new Date().toISOString(),
        ...formData
      };
      allNotes.push(newNote);
      localStorage.setItem('vf_tasting_notes', JSON.stringify(allNotes));
    }

    setShowTastingForm(false);
    setAiQuestionnaire(null);
    setInitialFormData(undefined);
    loadTastingNotes(wine.id);
  };

  const handleToggleFavorite = (wineId: string) => {
    toggleFavorite(wineId);
    if (wine && wine.id === wineId) {
      loadWineData(wineId);
    }
  };

  const handleDeleteNote = (noteId: string) => {
    const stored = localStorage.getItem('vf_tasting_notes');
    if (stored) {
      const allNotes: TastingNote[] = JSON.parse(stored);
      const updatedNotes = allNotes.filter(note => note.id !== noteId);
      localStorage.setItem('vf_tasting_notes', JSON.stringify(updatedNotes));
      if (wine) loadTastingNotes(wine.id);
    }
  };

  const handleEditNote = (note: TastingNote) => {
    setEditingNote(note);
    setInitialFormData({
      visual: note.visual,
      visualNotes: note.visualNotes,
      nose: note.nose,
      body: note.body,
      acidity: note.acidity,
      tannin: note.tannin,
      finish: note.finish,
      rating: note.rating,
      pairedWith: note.pairedWith,
      pairingQuality: note.pairingQuality,
      pairingSuggestion: note.pairingSuggestion,
      notes: note.notes
    });
    setAiQuestionnaire(null);
    setShowTastingForm(true);
  };

  const handleAddStock = () => {
      if (wine && wine.id) {
          if(window.confirm(`Ajouter une bouteille de ${wine.name} au stock ?`)) {
              addBottles(wine.id, 1);
              loadWineData(wine.id);
          }
      }
  }

  const handleGiftBottle = () => {
      if (!wine || !giftRecipient) return;
      
      // Find first available bottle
      const availableBottle = wine.bottles.find(b => !b.isConsumed);
      if (availableBottle) {
          giftBottle(wine.id, availableBottle.id, giftRecipient, giftOccasion);
          setShowGiftModal(false);
          setGiftRecipient('');
          setGiftOccasion('');
          loadWineData(wine.id);
          alert(`Bouteille offerte à ${giftRecipient} !`);
      } else {
          alert("Aucune bouteille disponible en stock.");
      }
  };

  const getRackName = (rackId: string) => {
      const racks = getRacks();
      return racks.find(r => r.id === rackId)?.name || 'Rack Inconnu';
  };

  const getRowLabel = (index: number) => {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      return letters[index] || "?";
  };

  if (!wine) return null;

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
                     Mes Dégustations ({tastingNotes.length})
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
               {showTastingForm && wine && (
                 <div className="mb-6 animate-fade-in">
                   <div className="flex items-center justify-between mb-4">
                     <h4 className="font-semibold text-stone-900 dark:text-white">
                       {editingNote ? 'Modifier la dégustation' : 'Nouvelle dégustation'}
                     </h4>
                     <button
                       onClick={() => {
                         setShowTastingForm(false);
                         setEditingNote(null);
                         setAiQuestionnaire(null);
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
                       setAiQuestionnaire(null);
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
                   {tastingNotes.length > 0 ? (
                     tastingNotes.map(note => (
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
                  {wine.bottles.filter(b => !b.isConsumed).length > 0 ? (
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
                      <p className="text-stone-500 italic">Rupture de stock</p>
                  )}
              </div>

              {/* Timeline */}
              <div className="bg-white dark:bg-stone-900/50 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
                  <div className="flex items-center gap-2 mb-6 text-stone-400">
                      <Clock size={18} />
                      <h3 className="font-serif text-lg text-stone-900 dark:text-white">Historique</h3>
                  </div>
                  {history.length > 0 ? (
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