import React, { useState, useEffect } from 'react';
import { getInventory, saveWine, toggleFavorite } from '../services/storageService';
import { CellarWine } from '../types';
import { FileText, Plus, Calendar, Star, Heart, Utensils, Wine as WineIcon, ChevronRight, X, Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Récupérer les paramètres API depuis les settings
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

// Service IA pour générer des questionnaires personnalisés
const generateTastingQuestionnaire = async (wine: CellarWine) => {
    try {
        const settings = getApiSettings();
        
        let apiUrl = '';
        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        let body: any = {};

        if (settings.provider === 'anthropic') {
            apiUrl = 'https://api.anthropic.com/v1/messages';
            body = {
                model: settings.model || 'claude-sonnet-4-20250514',
                max_tokens: 2000,
                messages: [{
                    role: 'user',
                    content: `Tu es un sommelier expert. Génère un questionnaire de dégustation personnalisé pour ce vin :

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
- Ne mets RIEN d'autre que le JSON dans ta réponse`
                }]
            };
        } else if (settings.provider === 'openai') {
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
            body = {
                model: settings.openaiModel || 'gpt-4',
                messages: [{
                    role: 'user',
                    content: `Tu es un sommelier expert. Génère un questionnaire de dégustation personnalisé pour ce vin :

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
- Ne mets RIEN d'autre que le JSON dans ta réponse`
                }],
                temperature: 0.7
            };
        } else if (settings.provider === 'mistral') {
            apiUrl = 'https://api.mistral.ai/v1/chat/completions';
            headers['Authorization'] = `Bearer ${settings.apiKey}`;
            body = {
                model: 'mistral-large-latest',
                messages: [{
                    role: 'user',
                    content: `Tu es un sommelier expert. Génère un questionnaire de dégustation personnalisé pour ce vin :

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
- Ne mets RIEN d'autre que le JSON dans ta réponse`
                }]
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

interface TastingNote {
    id: string;
    wineId: string;
    wineName: string;
    wineVintage: number;
    date: string;
    
    // Évaluation Sensorielle
    visual: number; // 0-100 (intensité couleur)
    visualNotes: string;
    nose: string[]; // Tags sélectionnés
    
    // Structure (Jauges)
    body: number; // 0-100
    acidity: number; // 0-100
    tannin: number; // 0-100
    
    // Finale
    finish: number; // 1-3 (courte/moyenne/longue)
    
    // Note globale
    rating: number; // 1-5
    
    // Accord mets-vins
    pairedWith?: string;
    pairingQuality?: number; // 1-5
    pairingSuggestion?: string;
    
    // Notes libres
    notes: string;
}

export const TastingNotes: React.FC = () => {
    const navigate = useNavigate();
    const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
    const [winesToTaste, setWinesToTaste] = useState<CellarWine[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedWine, setSelectedWine] = useState<CellarWine | null>(null);
    const [isLoadingQuestionnaire, setIsLoadingQuestionnaire] = useState(false);
    const [aiQuestionnaire, setAiQuestionnaire] = useState<any>(null);

    // Form State
    const [formData, setFormData] = useState({
        visual: 50,
        visualNotes: '',
        nose: [] as string[],
        body: 50,
        acidity: 50,
        tannin: 50,
        finish: 2,
        rating: 0,
        pairedWith: '',
        pairingQuality: 0,
        pairingSuggestion: '',
        notes: ''
    });

    // Suggestions de pairings
    const getPairingSuggestions = (): string[] => {
        if (aiQuestionnaire?.pairingSuggestions?.length) {
            return aiQuestionnaire.pairingSuggestions;
        }
        return [
            'Viande rouge',
            'Viande blanche',
            'Poisson',
            'Fruits de mer',
            'Fromage',
            'Charcuterie',
            'Pâtes',
            'Risotto',
            'Légumes grillés',
            'Apéritif seul'
        ];
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        const stored = localStorage.getItem('vf_tasting_notes');
        let notes: TastingNote[] = stored ? JSON.parse(stored) : [];
        
        // Migration: convertir les anciennes notes si nécessaire
        notes = notes.map(note => {
            // Si nose est une string, la convertir en array
            if (typeof note.nose === 'string') {
                return {
                    ...note,
                    nose: note.nose ? [note.nose] : []
                };
            }
            // Si nose n'existe pas, initialiser à []
            if (!note.nose) {
                return {
                    ...note,
                    nose: []
                };
            }
            return note;
        });
        
        // Sauvegarder les données migrées
        if (stored) {
            localStorage.setItem('vf_tasting_notes', JSON.stringify(notes));
        }
        
        setTastingNotes(notes);

        const inventory = getInventory();
        const tastedWineIds = notes.map((n: TastingNote) => n.wineId);
        const needsTasting = inventory.filter(w => !tastedWineIds.includes(w.id) && w.inventoryCount > 0);
        setWinesToTaste(needsTasting);
    };

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
        
        // Générer le questionnaire personnalisé via IA
        const questionnaire = await generateTastingQuestionnaire(wine);
        setAiQuestionnaire(questionnaire);
        
        if (questionnaire) {
            // Pré-remplir avec les données IA
            setFormData({
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
            setFormData({
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

    const toggleNoseTag = (aroma: string) => {
        setFormData(prev => ({
            ...prev,
            nose: prev.nose.includes(aroma)
                ? prev.nose.filter(a => a !== aroma)
                : [...prev.nose, aroma]
        }));
    };

    const handleVisualChange = (value: number) => {
        setFormData(prev => ({
            ...prev,
            visual: value,
            visualNotes: selectedWine ? getVisualDescription(selectedWine, value) : ''
        }));
    };

    const handleSaveTasting = () => {
        if (!selectedWine || formData.rating === 0) {
            alert('Veuillez sélectionner une note globale');
            return;
        }

        const newNote: TastingNote = {
            id: crypto.randomUUID(),
            wineId: selectedWine.id,
            wineName: `${selectedWine.name} ${selectedWine.cuvee || ''}`.trim(),
            wineVintage: selectedWine.vintage,
            date: new Date().toISOString(),
            ...formData
        };

        const updated = [...tastingNotes, newNote];
        localStorage.setItem('vf_tasting_notes', JSON.stringify(updated));
        
        setShowAddModal(false);
        setSelectedWine(null);
        setAiQuestionnaire(null);
        setFormData({
            visual: 50,
            visualNotes: '',
            nose: [],
            body: 50,
            acidity: 50,
            tannin: 50,
            finish: 2,
            rating: 0,
            pairedWith: '',
            pairingQuality: 0,
            pairingSuggestion: '',
            notes: ''
        });
        loadData();
    };

    const handleToggleFavorite = (wineId: string) => {
        toggleFavorite(wineId);
        loadData();
    };

    const getFinishLabel = (level: number): string => {
        if (level === 1) return 'Courte';
        if (level === 2) return 'Moyenne';
        return 'Longue';
    };

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

            {/* Wines to Taste Alert */}
            {winesToTaste.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                        <FileText className="text-amber-600 dark:text-amber-400" size={24} />
                        <div>
                            <p className="font-bold text-amber-900 dark:text-amber-200">
                                {winesToTaste.length} vin{winesToTaste.length > 1 ? 's' : ''} à déguster
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
                {tastingNotes.length === 0 ? (
                    <div className="text-center py-20 text-stone-500">
                        <FileText size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Aucune fiche de dégustation pour le moment.</p>
                        <p className="text-sm">Créez votre première note !</p>
                    </div>
                ) : (
                    tastingNotes.map(note => (
                        <div 
                            key={note.id} 
                            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-lg font-serif text-stone-900 dark:text-white">{note.wineName}</h3>
                                    <p className="text-xs text-stone-500 flex items-center gap-2">
                                        <Calendar size={12} />
                                        {new Date(note.date).toLocaleDateString('fr-FR')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Star 
                                            key={i} 
                                            size={16} 
                                            className={i < note.rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-700'} 
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Visuel</span>
                                    <p className="text-stone-700 dark:text-stone-300">{note.visualNotes}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Nez</span>
                                    <p className="text-stone-700 dark:text-stone-300">
                                        {Array.isArray(note.nose) ? note.nose.join(', ') : note.nose}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Structure</span>
                                    <p className="text-stone-700 dark:text-stone-300 text-xs">
                                        Corps {note.body}% • Acidité {note.acidity}% • Tanins {note.tannin}%
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Finale</span>
                                    <p className="text-stone-700 dark:text-stone-300">{getFinishLabel(note.finish)}</p>
                                </div>
                            </div>

                            {note.pairedWith && (
                                <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Utensils size={14} className="text-wine-600 dark:text-wine-500" />
                                        <span className="text-xs font-bold text-stone-500 uppercase">Accord</span>
                                    </div>
                                    <p className="text-sm text-stone-700 dark:text-stone-300">
                                        {note.pairedWith}
                                    </p>
                                    {note.pairingSuggestion && (
                                        <p className="text-xs text-stone-500 mt-1 italic">
                                            💡 {note.pairingSuggestion}
                                        </p>
                                    )}
                                </div>
                            )}

                            {note.notes && (
                                <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800">
                                    <p className="text-sm italic text-stone-600 dark:text-stone-400">"{note.notes}"</p>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add Tasting Note Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
                    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-2xl rounded-2xl p-4 relative z-10 shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
                        <button onClick={() => {
                            setShowAddModal(false);
                            setSelectedWine(null);
                            setAiQuestionnaire(null);
                        }} className="absolute top-3 right-3 text-stone-400 hover:text-stone-600 dark:hover:text-white z-10">
                            <X size={18} />
                        </button>
                        
                        <h3 className="text-xl font-serif text-stone-900 dark:text-white mb-1">Nouvelle Dégustation</h3>
                        <p className="text-[10px] text-stone-500 mb-4">Questionnaire rapide</p>

                        {!selectedWine ? (
                            <div className="space-y-2">
                                <p className="text-sm text-stone-500 mb-4">Sélectionnez un vin à déguster :</p>
                                {winesToTaste.map(wine => (
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
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Wine Header compact */}
                                <div className="bg-gradient-to-r from-wine-50 to-white dark:from-wine-900/20 dark:to-stone-900 p-3 rounded-lg border border-wine-100 dark:border-wine-900/30">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-serif text-base text-stone-900 dark:text-white">{selectedWine.name}</h4>
                                                {isLoadingQuestionnaire && (
                                                    <Loader2 size={12} className="animate-spin text-wine-600" />
                                                )}
                                            </div>
                                            {selectedWine.cuvee && <p className="text-wine-600 dark:text-wine-400 text-xs italic">{selectedWine.cuvee}</p>}
                                            <p className="text-[10px] text-stone-500">{selectedWine.producer} • {selectedWine.vintage}</p>
                                            {aiQuestionnaire?.tastingTips && (
                                                <p className="text-[10px] text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1">
                                                    <Sparkles size={10} className="text-wine-600" />
                                                    {aiQuestionnaire.tastingTips}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleToggleFavorite(selectedWine.id)}
                                            className={`p-1.5 rounded-full transition-colors ${
                                                selectedWine.isFavorite 
                                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                                    : 'bg-stone-100 dark:bg-stone-800 text-stone-400 hover:text-red-600'
                                            }`}
                                        >
                                            <Heart size={14} className={selectedWine.isFavorite ? 'fill-current' : ''} />
                                        </button>
                                    </div>
                                </div>

                                {/* Formulaire ultra-compact en grille */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Visuel */}
                                    <div className="col-span-2">
                                        <label className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-1 block flex items-center gap-1">
                                            🎨 <span>{formData.visualNotes}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={formData.visual}
                                            onChange={(e) => handleVisualChange(Number(e.target.value))}
                                            className="w-full accent-wine-600 h-1.5"
                                        />
                                    </div>

                                    {/* Structure en mini-jauges */}
                                    <div>
                                        <label className="text-[10px] text-stone-500 mb-1 block">Corps {formData.body}%</label>
                                        <input type="range" min="0" max="100" value={formData.body} 
                                            onChange={(e) => setFormData({...formData, body: Number(e.target.value)})}
                                            className="w-full accent-wine-600 h-1" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-stone-500 mb-1 block">Acidité {formData.acidity}%</label>
                                        <input type="range" min="0" max="100" value={formData.acidity} 
                                            onChange={(e) => setFormData({...formData, acidity: Number(e.target.value)})}
                                            className="w-full accent-wine-600 h-1" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-stone-500 mb-1 block">Tanins {formData.tannin}%</label>
                                        <input type="range" min="0" max="100" value={formData.tannin} 
                                            onChange={(e) => setFormData({...formData, tannin: Number(e.target.value)})}
                                            className="w-full accent-wine-600 h-1" />
                                    </div>
                                    
                                    {/* Finale - Jauge */}
                                    <div>
                                        <label className="text-[10px] text-stone-500 mb-1 block">Longueur en bouche</label>
                                        <input
                                            type="range"
                                            min="1"
                                            max="3"
                                            value={formData.finish}
                                            onChange={(e) => setFormData({...formData, finish: Number(e.target.value)})}
                                            className="w-full accent-wine-600 h-1"
                                        />
                                        <div className="flex justify-between text-[9px] text-stone-400 mt-0.5">
                                            <span>Courte</span>
                                            <span>Moyenne</span>
                                            <span>Longue</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Note Globale - Compacte */}
                                <div className="bg-stone-50 dark:bg-stone-950 rounded-lg p-3">
                                    <label className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-2 block text-center">
                                        ⭐ Note
                                    </label>
                                    <div className="flex gap-1 justify-center">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => {
                                                    const newRating = i + 1;
                                                    setFormData({...formData, rating: newRating});
                                                    if (newRating === 5 && selectedWine && !selectedWine.isFavorite) {
                                                        handleToggleFavorite(selectedWine.id);
                                                    }
                                                }}
                                                className="p-1 transition-transform hover:scale-110"
                                            >
                                                <Star 
                                                    size={28} 
                                                    className={i < formData.rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-700'} 
                                                />
                                            </button>
                                        ))}
                                    </div>
                                    {formData.rating === 5 && (
                                        <p className="text-center text-[10px] text-wine-600 dark:text-wine-400 mt-1.5 flex items-center justify-center gap-1">
                                            <Heart size={10} className="fill-current" />
                                            Favori !
                                        </p>
                                    )}
                                </div>

                                {/* Impressions - Textarea compact */}
                                <div>
                                    <label className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-1 block">😊 Impressions</label>
                                    <textarea
                                        value={formData.nose.join('\n')}
                                        onChange={(e) => setFormData({...formData, nose: e.target.value.split('\n').filter(l => l.trim())})}
                                        placeholder="Vos ressentis, émotions..."
                                        rows={2}
                                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-2 text-stone-900 dark:text-white text-xs focus:ring-2 focus:ring-wine-500 outline-none resize-none"
                                    />
                                </div>

                                {/* Accords - 2 inputs côte à côte */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-stone-500 mb-1 block">🍽️ Accord dégusté</label>
                                        <input
                                            type="text"
                                            value={formData.pairedWith}
                                            onChange={(e) => setFormData({...formData, pairedWith: e.target.value})}
                                            placeholder="Ex: Magret"
                                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-2 text-stone-900 dark:text-white text-xs focus:ring-2 focus:ring-wine-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-stone-500 mb-1 block">💡 Accord proposé</label>
                                        <input
                                            type="text"
                                            value={formData.pairingSuggestion}
                                            onChange={(e) => setFormData({...formData, pairingSuggestion: e.target.value})}
                                            placeholder="Ex: Fromage affiné"
                                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-2 text-stone-900 dark:text-white text-xs focus:ring-2 focus:ring-wine-500 outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Notes - Compact */}
                                <div>
                                    <label className="text-[10px] text-stone-500 mb-1 block">📝 Notes</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                        placeholder="Contexte, personnes présentes..."
                                        rows={2}
                                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-2 text-stone-900 dark:text-white text-xs focus:ring-2 focus:ring-wine-500 outline-none resize-none"
                                    />
                                </div>

                                {/* Actions - Sticky au bas du modal */}
                                <div className="sticky bottom-0 bg-white dark:bg-stone-900 pt-3 pb-2 -mx-6 px-6 border-t border-stone-200 dark:border-stone-800 flex gap-2">
                                    <button
                                        onClick={() => setSelectedWine(null)}
                                        className="flex-1 py-2.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-sm"
                                    >
                                        Retour
                                    </button>
                                    <button
                                        onClick={handleSaveTasting}
                                        disabled={formData.rating === 0}
                                        className="flex-1 bg-wine-600 hover:bg-wine-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-bold transition-colors text-sm"
                                    >
                                        Enregistrer
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};