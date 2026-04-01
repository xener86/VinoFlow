import React, { useState } from 'react';
import { CellarWine } from '../types';
import { Heart, Loader2, Sparkles, Star, X } from 'lucide-react';

export interface TastingFormData {
  visual: number;
  visualNotes: string;
  nose: string[];
  body: number;
  acidity: number;
  tannin: number;
  finish: number;
  rating: number;
  pairedWith?: string;
  pairingQuality?: number;
  pairingSuggestion?: string;
  notes: string;
}

interface TastingQuestionnaireCompactProps {
  wine: CellarWine;
  initialData?: Partial<TastingFormData>;
  onComplete: (data: TastingFormData) => void;
  onCancel: () => void;
  onToggleFavorite: (wineId: string) => void;
  isLoadingQuestionnaire?: boolean;
  aiQuestionnaire?: any;
}

export const TastingQuestionnaireCompact: React.FC<TastingQuestionnaireCompactProps> = ({
  wine,
  initialData,
  onComplete,
  onCancel,
  onToggleFavorite,
  isLoadingQuestionnaire = false,
  aiQuestionnaire = null
}) => {
  const [formData, setFormData] = useState<TastingFormData>({
    visual: initialData?.visual || 50,
    visualNotes: initialData?.visualNotes || '',
    nose: initialData?.nose || [],
    body: initialData?.body || 50,
    acidity: initialData?.acidity || 50,
    tannin: initialData?.tannin || 50,
    finish: initialData?.finish || 2,
    rating: initialData?.rating || 0,
    pairedWith: initialData?.pairedWith || '',
    pairingQuality: initialData?.pairingQuality || 0,
    pairingSuggestion: initialData?.pairingSuggestion || '',
    notes: initialData?.notes || ''
  });

  const getVisualDescription = (wineType: string, intensity: number): string => {
    if (wineType === 'RED') {
      if (intensity > 70) return 'Rubis profond / Grenat';
      if (intensity > 40) return 'Rubis / Cerise';
      return 'Rouge clair / Tuilé';
    }
    if (wineType === 'WHITE') {
      if (intensity > 70) return 'Or / Ambré';
      if (intensity > 40) return 'Jaune paille / Doré';
      return 'Pâle / Verdâtre';
    }
    if (wineType === 'ROSE') {
      if (intensity > 70) return 'Saumon soutenu';
      if (intensity > 40) return 'Rose vif';
      return 'Pétale de rose';
    }
    return 'Observation visuelle';
  };

  const handleVisualChange = (value: number) => {
    setFormData(prev => ({
      ...prev,
      visual: value,
      visualNotes: getVisualDescription(wine.type, value)
    }));
  };

  const handleSave = () => {
    if (formData.rating === 0) {
      alert('Veuillez sélectionner une note globale');
      return;
    }
    onComplete(formData);
  };

  return (
    <div className="space-y-4">
      {/* Wine Header compact */}
      <div className="bg-gradient-to-r from-wine-50 to-white dark:from-wine-900/20 dark:to-stone-900 p-3 rounded-lg border border-wine-100 dark:border-wine-900/30">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-serif text-base text-stone-900 dark:text-white">{wine.name}</h4>
              {isLoadingQuestionnaire && (
                <Loader2 size={12} className="animate-spin text-wine-600" />
              )}
            </div>
            {wine.cuvee && <p className="text-wine-600 dark:text-wine-400 text-xs italic">{wine.cuvee}</p>}
            <p className="text-[10px] text-stone-500">{wine.producer} • {wine.vintage}</p>
            {aiQuestionnaire?.tastingTips && (
              <p className="text-[10px] text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1">
                <Sparkles size={10} className="text-wine-600" />
                {aiQuestionnaire.tastingTips}
              </p>
            )}
          </div>
          <button
            onClick={() => onToggleFavorite(wine.id)}
            className={`p-1.5 rounded-full transition-colors ${
              wine.isFavorite 
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-400 hover:text-red-600'
            }`}
          >
            <Heart size={14} className={wine.isFavorite ? 'fill-current' : ''} />
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
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={formData.body} 
            onChange={(e) => setFormData({...formData, body: Number(e.target.value)})}
            className="w-full accent-wine-600 h-1" 
          />
        </div>
        <div>
          <label className="text-[10px] text-stone-500 mb-1 block">Acidité {formData.acidity}%</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={formData.acidity} 
            onChange={(e) => setFormData({...formData, acidity: Number(e.target.value)})}
            className="w-full accent-wine-600 h-1" 
          />
        </div>
        <div>
          <label className="text-[10px] text-stone-500 mb-1 block">Tanins {formData.tannin}%</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={formData.tannin} 
            onChange={(e) => setFormData({...formData, tannin: Number(e.target.value)})}
            className="w-full accent-wine-600 h-1" 
          />
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
                if (newRating === 5 && wine && !wine.isFavorite) {
                  onToggleFavorite(wine.id);
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

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-sm"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={formData.rating === 0}
          className="flex-1 bg-wine-600 hover:bg-wine-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-bold transition-colors text-sm"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
};