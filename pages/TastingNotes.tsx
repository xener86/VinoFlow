import React, { useState, useMemo } from 'react';
import { useWines } from '../hooks/useWines'; // ✅ Hook Async
import { useTastingNotes } from '../hooks/useTastingNotes'; // ✅ Hook Async
import { saveTastingNote, deleteTastingNote, toggleFavorite } from '../services/storageService'; // ✅ Fonctions Async du service
import { CellarWine } from '../types';
import { FileText, Plus, Calendar, ChevronRight, X, Search, Loader2 } from 'lucide-react';
import { TastingQuestionnaireCompact, TastingFormData } from '../components/TastingQuestionnaireCompact';
import { TastingNoteEditor, TastingNote } from '../components/TastingNoteEditor';

// Récupérer les paramètres API (reste local pour l'instant ou via un hook de settings si dispo)
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

const normalizeText = (text: string): string => {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
};

// Service IA (inchangé, déjà async)
const generateTastingQuestionnaire = async (wine: CellarWine) => {
    try {
        const settings = getApiSettings();
        
        let apiUrl = '';
        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        let body: any = {};

        const prompt = `Tu es un sommelier expert. Génère un questionnaire de dégustation personnalisé pour ce vin :

VIN : ${wine.name} ${wine.cuvee || ''}
PRODUCTEUR : ${wine.producer}
RÉGION : ${wine.region}
MILLÉSIME : ${wine.vintage}
COULEUR : ${wine.type}
${wine.aromaProfile?.length ? `PROFIL AROMATIQUE : ${wine.aromaProfile.join(', ')}` : ''}

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
        
        const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        return JSON.parse(jsonContent);
    } catch (error) {
        console.error('Erreur génération questionnaire IA:', error);
        return null;
    }
};

export const TastingNotes: React.FC = () => {
    // ✅ Utilisation des Hooks
    const { wines: inventory, loading: loadingWines, refresh: refreshWines } = useWines();
    const { notes: tastingNotes, loading: loadingNotes, refresh: refreshNotes } = useTastingNotes();

    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedWine, setSelectedWine] = useState<CellarWine | null>(null);
    const [isLoadingQuestionnaire, setIsLoadingQuestionnaire] = useState(false);
    const [aiQuestionnaire, setAiQuestionnaire] = useState<any>(null);
    const [initialFormData, setInitialFormData] = useState<Partial<TastingFormData> | undefined>(undefined);
    const [editingNote, setEditingNote] = useState<TastingNote | null>(null);
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Calcul des vins à déguster (ceux en stock sans note récente)
    const winesToTaste = useMemo(() => {
        if (!inventory || !tastingNotes) return [];
        const tastedWineIds = tastingNotes.map((n) => n.wineId);
        // On pourrait affiner la logique "récente" ici si besoin
        return inventory.filter(w => !tastedWineIds.includes(w.id) && w.inventoryCount > 0);
    }, [inventory, tastingNotes]);

    const getVisualDefault = (wine: CellarWine): number => {
        const visualMap: Record<string, number> = {
            'RED': 75,
            'WHITE': 40,
            'ROSE': 50,
            'SPARKLING': 30
        };
        return visualMap[wine.type] || 50;
    };

    const getVisualDescription = (wine: CellarWine, intensity: number): string => {
        if (wine.type === 'RED') {
            if (intensity > 70) return 'Rubis profond / Grenat';
            if (intensity > 40) return 'Rubis / Cerise';
            return 'Rouge clair / Tuilé';
        }
        if (wine.type === 'WHITE') {
            if (intensity > 70) return 'Or / Ambré';
            if (intensity > 40) return 'Jaune paille / Doré';
            return 'Pâle / Verdâtre';
        }
        if (wine.type === 'ROSE') {
            if (intensity > 70) return 'Saumon soutenu';
            if (intensity > 40) return 'Rose vif';
            return 'Pétale de rose';
        }
        return 'Observation visuelle';
    };

    const handleSelectWine = async (wine: CellarWine) => {
        setSelectedWine(wine);
        setIsLoadingQuestionnaire(true);
        setEditingNote(null);
        
        const questionnaire = await generateTastingQuestionnaire(wine);
        setAiQuestionnaire(questionnaire);
        
        const defaultVisual = getVisualDefault(wine);
        
        if (questionnaire) {
            setInitialFormData({
                visual: questionnaire.visualIntensity || defaultVisual,
                visualNotes: questionnaire.visualDescription || getVisualDescription(wine, questionnaire.visualIntensity || defaultVisual),
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
            setInitialFormData({
                visual: defaultVisual,
                visualNotes: getVisualDescription(wine, defaultVisual),
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

    const handleEditNote = (note: TastingNote) => {
        const wine = winesToTaste.find(w => w.id === note.wineId) || inventory.find(w => w.id === note.wineId);
        if (wine) {
            setSelectedWine(wine);
            setEditingNote(note);
            setAiQuestionnaire(null);
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
            setShowAddModal(true);
        }
    };

    // ✅ Sauvegarde Asynchrone
    const handleSaveTasting = async (formData: TastingFormData) => {
        if (!selectedWine) return;

        let noteToSave: TastingNote;

        if (editingNote) {
            noteToSave = { ...editingNote, ...formData, date: new Date().toISOString() };
        } else {
            noteToSave = {
                id: crypto.randomUUID(), // ou laisser le backend générer l'ID
                wineId: selectedWine.id,
                wineName: `${selectedWine.name} ${selectedWine.cuvee || ''}`.trim(),
                wineVintage: selectedWine.vintage,
                date: new Date().toISOString(),
                ...formData
            };
        }

        await saveTastingNote(noteToSave); // Await
        
        setShowAddModal(false);
        setSelectedWine(null);
        setEditingNote(null);
        setAiQuestionnaire(null);
        setInitialFormData(undefined);
        refreshNotes(); // Refresh hook
    };

    // ✅ Suppression Asynchrone
    const handleDeleteNote = async (noteId: string) => {
        if (window.confirm("Supprimer cette note de dégustation ?")) {
            await deleteTastingNote(noteId); // Await
            refreshNotes(); // Refresh hook
        }
    };

    // ✅ Favoris Asynchrone
    const handleToggleFavorite = async (wineId: string) => {
        await toggleFavorite(wineId); // Await
        refreshWines(); // Refresh wines
        // Mettre à jour le vin sélectionné localement si nécessaire
        if (selectedWine && selectedWine.id === wineId) {
             // Astuce : on peut laisser le refreshWines propager la mise à jour ou mettre à jour localement
             setSelectedWine(prev => prev ? { ...prev, isFavorite: !prev.isFavorite } : null);
        }
    };

    // Filtrage des vins à déguster
    const filteredWinesToTaste = winesToTaste.filter(w => {
        let matchesType = false;
        if (typeFilter === 'ALL') matchesType = true;
        else if (typeFilter === 'OTHER') matchesType = !['RED', 'WHITE', 'ROSE', 'SPARKLING'].includes(w.type);
        else matchesType = w.type === typeFilter;
        
        const matchesFavorites = !showFavoritesOnly || w.isFavorite;
        const normalizedQuery = normalizeText(searchQuery);
        const matchesSearch = 
            normalizeText(w.name).includes(normalizedQuery) ||
            normalizeText(w.producer).includes(normalizedQuery) ||
            normalizeText(w.region).includes(normalizedQuery) ||
            w.vintage.toString().includes(normalizedQuery);

        return matchesType && matchesFavorites && matchesSearch;
    });

    // Filtrage des notes
    const filteredTastingNotes = tastingNotes.filter(note => {
        const wine = inventory.find(w => w.id === note.wineId);
        // Si le vin n'est plus dans l'inventaire, on affiche quand même la note (historique) ?
        // Ici on filtre pour correspondre aux filtres UI, donc on a besoin des infos du vin
        // Si vin supprimé, on peut baser le filtrage sur les infos dans la note elle-même si dispo, 
        // ou l'exclure si on veut être strict.
        
        // Pour simplifier et éviter le crash si wine est undefined :
        const wineType = wine?.type || 'OTHER';
        const isFav = wine?.isFavorite || false;
        const producer = wine?.producer || '';
        const region = wine?.region || '';

        let matchesType = false;
        if (typeFilter === 'ALL') matchesType = true;
        else if (typeFilter === 'OTHER') matchesType = !['RED', 'WHITE', 'ROSE', 'SPARKLING'].includes(wineType);
        else matchesType = wineType === typeFilter;
        
        const matchesFavorites = !showFavoritesOnly || isFav;
        const normalizedQuery = normalizeText(searchQuery);
        
        const matchesSearch = 
            normalizeText(note.wineName).includes(normalizedQuery) ||
            normalizeText(producer).includes(normalizedQuery) ||
            normalizeText(region).includes(normalizedQuery) ||
            (note.wineVintage && note.wineVintage.toString().includes(normalizedQuery));

        return matchesType && matchesFavorites && matchesSearch;
    });

    const filterLabels: Record<string, string> = {
        'ALL': 'TOUS', 'RED': 'ROUGE', 'WHITE': 'BLANC', 'ROSE': 'ROSÉ', 'SPARKLING': 'BULLES', 'OTHER': 'AUTRES'
    };

    const favoriteCount = winesToTaste.filter(w => w.isFavorite).length;

    // Loader global
    if (loadingWines || loadingNotes) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <Loader2 className="animate-spin text-wine-600" size={32} />
            </div>
        );
    }

    return (
        <div className="pb-24 animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Fiches de Dégustation</h2>
                    <p className="text-stone-500 text-sm">Évaluations sensorielles</p>
                </div>
                <button 
                    onClick={() => setShowAddModal(true)}
                    className="bg-wine-600 hover:bg-wine-700 text-white p-3 rounded-full shadow-lg"
                >
                    <Plus size={20} />
                </button>
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

            {/* Wines to Taste Alert */}
            {filteredWinesToTaste.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                        <FileText className="text-amber-600 dark:text-amber-400" size={24} />
                        <div>
                            <p className="font-bold text-amber-900 dark:text-amber-200">
                                {filteredWinesToTaste.length} vin{filteredWinesToTaste.length > 1 ? 's' : ''} à déguster
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                Créez vos premières impressions
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tasting Notes List */}
            <div className="space-y-4">
                {filteredTastingNotes.length === 0 && tastingNotes.length > 0 && (
                    <div className="text-center py-20 text-stone-500 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col items-center gap-2">
                        <Search size={32} className="opacity-50" />
                        <p>Aucune fiche de dégustation trouvée pour cette recherche.</p>
                    </div>
                )}
                {tastingNotes.length === 0 && (
                    <div className="text-center py-20 text-stone-500">
                        <FileText size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Aucune fiche de dégustation pour le moment.</p>
                        <p className="text-sm">Créez votre première note !</p>
                    </div>
                )}
                {filteredTastingNotes.map(note => (
                    <div key={note.id} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="text-lg font-serif text-stone-900 dark:text-white">{note.wineName}</h3>
                            <div className="flex items-center gap-2 text-xs text-stone-500">
                                <Calendar size={12} />
                                {new Date(note.date).toLocaleDateString('fr-FR')}
                            </div>
                        </div>
                        <TastingNoteEditor
                            note={note}
                            onEdit={handleEditNote}
                            onDelete={handleDeleteNote}
                            showActions={true}
                        />
                    </div>
                ))}
            </div>

            {/* Add/Edit Tasting Note Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80 backdrop-blur-sm" onClick={() => {
                        setShowAddModal(false);
                        setSelectedWine(null);
                        setEditingNote(null);
                        setAiQuestionnaire(null);
                        setInitialFormData(undefined);
                    }} />
                    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-2xl rounded-2xl p-4 relative z-10 shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
                        <button onClick={() => {
                            setShowAddModal(false);
                            setSelectedWine(null);
                            setEditingNote(null);
                            setAiQuestionnaire(null);
                            setInitialFormData(undefined);
                        }} className="absolute top-3 right-3 text-stone-400 hover:text-stone-600 dark:hover:text-white z-10">
                            <X size={18} />
                        </button>
                        
                        <h3 className="text-xl font-serif text-stone-900 dark:text-white mb-1">
                            {editingNote ? 'Modifier la Dégustation' : 'Nouvelle Dégustation'}
                        </h3>
                        <p className="text-[10px] text-stone-500 mb-4">Questionnaire rapide</p>

                        {!selectedWine ? (
                            <div className="space-y-2">
                                <p className="text-sm text-stone-500 mb-4">Sélectionnez un vin à déguster :</p>
                                {filteredWinesToTaste.map(wine => (
                                    <button
                                        key={wine.id}
                                        onClick={() => handleSelectWine(wine)}
                                        className="w-full text-left p-4 rounded-lg bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 transition-all flex justify-between items-center group"
                                    >
                                        <div>
                                            <h4 className="font-serif text-stone-900 dark:text-white">{wine.name} {wine.cuvee}</h4>
                                            <p className="text-xs text-stone-500">{wine.producer} • {wine.vintage}</p>
                                        </div>
                                        <ChevronRight className="text-stone-400 group-hover:text-wine-600 transition-colors" size={20} />
                                    </button>
                                ))}
                                {filteredWinesToTaste.length === 0 && (
                                    <div className="text-center py-10 text-stone-500 dark:text-stone-600">
                                        <Search size={32} className="mx-auto mb-4 opacity-50" />
                                        <p>Aucun vin trouvé pour cette recherche.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <TastingQuestionnaireCompact
                                wine={selectedWine}
                                initialData={initialFormData}
                                onComplete={handleSaveTasting}
                                onCancel={() => {
                                    setSelectedWine(null);
                                    setEditingNote(null);
                                    setAiQuestionnaire(null);
                                    setInitialFormData(undefined);
                                }}
                                onToggleFavorite={handleToggleFavorite}
                                isLoadingQuestionnaire={isLoadingQuestionnaire}
                                aiQuestionnaire={aiQuestionnaire}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};