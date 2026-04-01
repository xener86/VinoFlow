import React, { useState } from 'react';
import { Star, Sparkles, Eye, Wind, Droplets, Wine, Award } from 'lucide-react';

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

interface TastingQuestionnaireProps {
  initialData?: Partial<TastingFormData>;
  onComplete: (data: TastingFormData) => void;
  onCancel?: () => void;
  submitButtonText?: string;
}

const NOSE_OPTIONS = [
  'Fruits rouges', 'Fruits noirs', 'Fruits jaunes', 'Agrumes',
  'Floral', 'Épicé', 'Boisé', 'Vanille', 'Toast', 'Fumé',
  'Minéral', 'Terreux', 'Herbacé', 'Végétal',
  'Miel', 'Beurre', 'Noisette', 'Amande',
  'Fruits exotiques', 'Fruits blancs', 'Confiture', 'Chocolat'
];

export const TastingQuestionnaire: React.FC<TastingQuestionnaireProps> = ({
  initialData,
  onComplete,
  onCancel,
  submitButtonText = 'Enregistrer la dégustation'
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Form state
  const [visual, setVisual] = useState(initialData?.visual || 5);
  const [visualNotes, setVisualNotes] = useState(initialData?.visualNotes || '');
  const [selectedNose, setSelectedNose] = useState<string[]>(initialData?.nose || []);
  const [body, setBody] = useState(initialData?.body || 50);
  const [acidity, setAcidity] = useState(initialData?.acidity || 50);
  const [tannin, setTannin] = useState(initialData?.tannin || 50);
  const [finish, setFinish] = useState(initialData?.finish || 2);
  const [rating, setRating] = useState(initialData?.rating || 3);
  const [pairedWith, setPairedWith] = useState(initialData?.pairedWith || '');
  const [pairingQuality, setPairingQuality] = useState(initialData?.pairingQuality || 3);
  const [pairingSuggestion, setPairingSuggestion] = useState(initialData?.pairingSuggestion || '');
  const [notes, setNotes] = useState(initialData?.notes || '');

  const toggleNose = (impression: string) => {
    if (selectedNose.includes(impression)) {
      setSelectedNose(selectedNose.filter(i => i !== impression));
    } else {
      setSelectedNose([...selectedNose, impression]);
    }
  };

  const handleSubmit = () => {
    const formData: TastingFormData = {
      visual,
      visualNotes,
      nose: selectedNose,
      body,
      acidity,
      tannin,
      finish,
      rating,
      pairedWith: pairedWith || undefined,
      pairingQuality: pairedWith ? pairingQuality : undefined,
      pairingSuggestion: pairingSuggestion || undefined,
      notes
    };
    onComplete(formData);
  };

  const getFinishLabel = (level: number): string => {
    if (level === 1) return 'Courte';
    if (level === 2) return 'Moyenne';
    return 'Longue';
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3, 4].map(step => (
        <div key={step} className="flex items-center">
          <div 
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              currentStep === step 
                ? 'bg-wine-600 text-white scale-110' 
                : currentStep > step 
                ? 'bg-green-500 text-white' 
                : 'bg-stone-200 dark:bg-stone-700 text-stone-500'
            }`}
          >
            {currentStep > step ? '✓' : step}
          </div>
          {step < 4 && (
            <div className={`w-12 h-1 ${currentStep > step ? 'bg-green-500' : 'bg-stone-200 dark:bg-stone-700'}`} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg animate-fade-in">
      <div className="p-6">
        {renderStepIndicator()}

        {/* STEP 1: VISUAL */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-wine-600 dark:text-wine-400 mb-4">
              <Eye size={24} />
              <h3 className="text-2xl font-serif text-stone-900 dark:text-white">Analyse Visuelle</h3>
            </div>

            <div>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">
                Intensité de la couleur
              </label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-stone-500 dark:text-stone-400 w-16">Pâle</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={visual}
                  onChange={(e) => setVisual(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gradient-to-r from-pink-200 via-red-400 to-red-900 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-stone-500 dark:text-stone-400 w-16 text-right">Profonde</span>
                <div className="w-12 text-center font-bold text-wine-600 dark:text-wine-400">{visual}/10</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-2">
                Observations visuelles
              </label>
              <input
                type="text"
                value={visualNotes}
                onChange={(e) => setVisualNotes(e.target.value)}
                placeholder="ex: Rubis brillant, reflets grenat..."
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500"
              />
            </div>
          </div>
        )}

        {/* STEP 2: NOSE */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-wine-600 dark:text-wine-400 mb-4">
              <Wind size={24} />
              <h3 className="text-2xl font-serif text-stone-900 dark:text-white">Analyse Olfactive</h3>
            </div>

            <div>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">
                Sélectionnez les impressions perçues
              </label>
              <div className="flex flex-wrap gap-2">
                {NOSE_OPTIONS.map(impression => (
                  <button
                    key={impression}
                    onClick={() => toggleNose(impression)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedNose.includes(impression)
                        ? 'bg-wine-600 text-white border-2 border-wine-700 shadow-md scale-105'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {impression}
                  </button>
                ))}
              </div>
              {selectedNose.length > 0 && (
                <p className="text-sm text-stone-500 mt-3">
                  {selectedNose.length} impression{selectedNose.length > 1 ? 's' : ''} sélectionnée{selectedNose.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: STRUCTURE */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-wine-600 dark:text-wine-400 mb-4">
              <Droplets size={24} />
              <h3 className="text-2xl font-serif text-stone-900 dark:text-white">Structure en Bouche</h3>
            </div>

            <div className="space-y-6">
              {/* Body */}
              <div>
                <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">
                  Corps
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-stone-500 dark:text-stone-400 w-16">Léger</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={body}
                    onChange={(e) => setBody(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-stone-500 dark:text-stone-400 w-16 text-right">Corsé</span>
                  <div className="w-12 text-center font-bold text-wine-600 dark:text-wine-400">{body}%</div>
                </div>
              </div>

              {/* Acidity */}
              <div>
                <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">
                  Acidité
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-stone-500 dark:text-stone-400 w-16">Faible</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={acidity}
                    onChange={(e) => setAcidity(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-stone-500 dark:text-stone-400 w-16 text-right">Vive</span>
                  <div className="w-12 text-center font-bold text-wine-600 dark:text-wine-400">{acidity}%</div>
                </div>
              </div>

              {/* Tannin */}
              <div>
                <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">
                  Tanins
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-stone-500 dark:text-stone-400 w-16">Soyeux</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={tannin}
                    onChange={(e) => setTannin(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-stone-500 dark:text-stone-400 w-16 text-right">Puissants</span>
                  <div className="w-12 text-center font-bold text-wine-600 dark:text-wine-400">{tannin}%</div>
                </div>
              </div>

              {/* Finish */}
              <div>
                <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">
                  Longueur en bouche
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map(level => (
                    <button
                      key={level}
                      onClick={() => setFinish(level)}
                      className={`py-3 px-4 rounded-lg font-medium transition-all ${
                        finish === level
                          ? 'bg-wine-600 text-white border-2 border-wine-700 shadow-md'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700'
                      }`}
                    >
                      {getFinishLabel(level)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: RATING & NOTES */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 text-wine-600 dark:text-wine-400 mb-4">
              <Award size={24} />
              <h3 className="text-2xl font-serif text-stone-900 dark:text-white">Appréciation Globale</h3>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-3">
                Note générale
              </label>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      size={40}
                      className={star <= rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-700'}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Food Pairing */}
            <div className="pt-6 border-t border-stone-200 dark:border-stone-800">
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-2">
                Accord dégusté (optionnel)
              </label>
              <input
                type="text"
                value={pairedWith}
                onChange={(e) => setPairedWith(e.target.value)}
                placeholder="ex: Magret de canard aux cerises"
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500 mb-3"
              />

              {pairedWith && (
                <>
                  <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-2">
                    Qualité de l'accord
                  </label>
                  <div className="flex justify-center gap-2 mb-3">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onClick={() => setPairingQuality(star)}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          size={32}
                          className={star <= pairingQuality ? 'fill-orange-500 text-orange-500' : 'text-stone-300 dark:text-stone-700'}
                        />
                      </button>
                    ))}
                  </div>

                  <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-2">
                    Suggestion d'accord (optionnel)
                  </label>
                  <input
                    type="text"
                    value={pairingSuggestion}
                    onChange={(e) => setPairingSuggestion(e.target.value)}
                    placeholder="Idée pour un prochain accord..."
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500"
                  />
                </>
              )}
            </div>

            {/* Personal Notes */}
            <div>
              <label className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-2">
                Notes personnelles
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Vos impressions, le contexte de la dégustation..."
                rows={4}
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500 resize-none"
              />
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3 mt-8">
          {currentStep > 1 && (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="flex-1 py-3 rounded-lg border-2 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium transition-colors"
            >
              Précédent
            </button>
          )}
          
          {currentStep === 1 && onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-lg border-2 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium transition-colors"
            >
              Annuler
            </button>
          )}

          {currentStep < 4 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="flex-1 bg-wine-600 hover:bg-wine-700 text-white py-3 rounded-lg font-bold transition-colors"
            >
              Suivant
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold transition-colors shadow-lg"
            >
              {submitButtonText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};