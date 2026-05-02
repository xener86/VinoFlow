import React, { useState, useRef } from 'react';
import { Sparkles, Loader2, ThumbsUp, ThumbsDown, Shield, Heart, Flame, RefreshCw, Wine, Thermometer, Clock, Mic, MicOff } from 'lucide-react';
import { sommelierPair, sommelierFeedback } from '../services/storageService';
import { CellarWine } from '../types';

interface Pick {
  wine_id: string;
  reason: string;
  service_temp_c: number | null;
  decant_minutes: number;
}

interface PairingResult {
  criteria: any;
  candidates: Array<{ wine_id: string; score: number; breakdown: any }>;
  picks: {
    safe: Pick | null;
    personal: Pick | null;
    creative: Pick | null;
    global_advice: string;
  };
  fromCache: 'level1' | 'level2' | null;
  cave_size: number;
  cave_after_filter: number;
}

interface Props {
  inventory: CellarWine[];
}

export const SommelierV2: React.FC<Props> = ({ inventory }) => {
  const [dish, setDish] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PairingResult | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'UP' | 'DOWN'>>({});
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Phase 13.2 — Voice input via Web Speech API
  const toggleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Reconnaissance vocale non supportée par ce navigateur');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setDish(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  const wineById = (id: string) => inventory.find(w => w.id === id);

  const handlePair = async (skipCache = false) => {
    if (!dish.trim()) return;
    setLoading(true);
    setError(null);
    setFeedbackGiven({});
    try {
      const res = await sommelierPair(dish, {}, skipCache);
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (category: 'SAFE' | 'PERSONAL' | 'CREATIVE', wineId: string, rating: 'UP' | 'DOWN') => {
    setFeedbackGiven(prev => ({ ...prev, [category]: rating }));
    try {
      await sommelierFeedback({
        wineId,
        dish,
        rating,
        category,
        criteria: result?.criteria,
      });
    } catch (e) {
      console.error('Feedback failed:', e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-stone-900 dark:text-white">
        <Sparkles className="text-indigo-500" size={20} />
        <h3 className="text-lg font-serif">Sommelier v2 — Accord en 3 perspectives</h3>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); handlePair(false); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={dish}
          onChange={e => setDish(e.target.value)}
          placeholder="Décrivez votre plat (ex: curry de poulet aux noix de cajou)"
          className="flex-1 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-wine-500 outline-none"
        />
        <button
          type="button"
          onClick={toggleVoiceInput}
          aria-label={listening ? 'Arrêter la dictée' : 'Dicter le plat'}
          title="Dicter à voix haute"
          className={`px-3 rounded-xl flex items-center transition-colors ${listening ? 'bg-red-600 text-white animate-pulse' : 'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'}`}
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          type="submit"
          disabled={loading || !dish.trim()}
          className="bg-wine-600 hover:bg-wine-700 text-white px-5 rounded-xl font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          Trouver
        </button>
      </form>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>
              Cave: {result.cave_size} vins → {result.cave_after_filter} après filtres → top {result.candidates.length}
              {result.fromCache && ` · cache (${result.fromCache})`}
            </span>
            <button onClick={() => handlePair(true)} className="flex items-center gap-1 hover:text-wine-600">
              <RefreshCw size={12} /> Régénérer
            </button>
          </div>

          {result.criteria?.rationale && (
            <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-3 text-sm text-stone-700 dark:text-stone-300 italic">
              {result.criteria.rationale}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            <PickCard
              category="SAFE"
              icon={<Shield size={14} />}
              color="bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-700"
              accentColor="text-stone-700 dark:text-stone-300"
              title="Sûr"
              subtitle="L'accord classique"
              pick={result.picks.safe}
              wine={result.picks.safe ? wineById(result.picks.safe.wine_id) : undefined}
              feedback={feedbackGiven.SAFE}
              onFeedback={(rating) => result.picks.safe && handleFeedback('SAFE', result.picks.safe.wine_id, rating)}
            />
            <PickCard
              category="PERSONAL"
              icon={<Heart size={14} />}
              color="bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-900/50"
              accentColor="text-pink-700 dark:text-pink-300"
              title="Personnel"
              subtitle="Selon vos goûts"
              pick={result.picks.personal}
              wine={result.picks.personal ? wineById(result.picks.personal.wine_id) : undefined}
              feedback={feedbackGiven.PERSONAL}
              onFeedback={(rating) => result.picks.personal && handleFeedback('PERSONAL', result.picks.personal.wine_id, rating)}
            />
            <PickCard
              category="CREATIVE"
              icon={<Flame size={14} />}
              color="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-900/50"
              accentColor="text-indigo-700 dark:text-indigo-300"
              title="Audacieux"
              subtitle="L'option originale"
              pick={result.picks.creative}
              wine={result.picks.creative ? wineById(result.picks.creative.wine_id) : undefined}
              feedback={feedbackGiven.CREATIVE}
              onFeedback={(rating) => result.picks.creative && handleFeedback('CREATIVE', result.picks.creative.wine_id, rating)}
            />
          </div>

          {result.picks.global_advice && (
            <div className="text-sm text-stone-600 dark:text-stone-400 italic px-2">
              💡 {result.picks.global_advice}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PickCard: React.FC<{
  category: 'SAFE' | 'PERSONAL' | 'CREATIVE';
  icon: React.ReactNode;
  color: string;
  accentColor: string;
  title: string;
  subtitle: string;
  pick: Pick | null;
  wine: CellarWine | undefined;
  feedback: 'UP' | 'DOWN' | undefined;
  onFeedback: (rating: 'UP' | 'DOWN') => void;
}> = ({ icon, color, accentColor, title, subtitle, pick, wine, feedback, onFeedback }) => (
  <div className={`border-2 rounded-xl p-4 ${color} flex flex-col`}>
    <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider mb-1">
      <span className={accentColor}>{icon}</span>
      <span className={accentColor}>{title}</span>
    </div>
    <div className="text-xs text-stone-500 mb-3">{subtitle}</div>

    {pick && wine ? (
      <>
        <div className="mb-2">
          <div className="font-serif text-base text-stone-900 dark:text-white">
            {wine.name} {wine.cuvee && `· ${wine.cuvee}`}
          </div>
          <div className="text-xs text-stone-500">
            {wine.producer && `${wine.producer} · `}{wine.vintage}
          </div>
        </div>
        <p className="text-xs text-stone-700 dark:text-stone-300 mb-3 flex-1">{pick.reason}</p>

        {(pick.service_temp_c || pick.decant_minutes > 0) && (
          <div className="flex gap-3 text-xs text-stone-500 mb-3">
            {pick.service_temp_c && (
              <span className="flex items-center gap-1"><Thermometer size={10} /> {pick.service_temp_c}°C</span>
            )}
            {pick.decant_minutes > 0 && (
              <span className="flex items-center gap-1"><Clock size={10} /> {pick.decant_minutes} min</span>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
          <button
            onClick={() => onFeedback('UP')}
            disabled={feedback !== undefined}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${feedback === 'UP' ? 'bg-green-600 text-white' : 'hover:bg-green-100 dark:hover:bg-green-900/30 text-stone-600 dark:text-stone-400'} disabled:cursor-not-allowed`}
            aria-label="J'aime cet accord"
          >
            <ThumbsUp size={12} />
          </button>
          <button
            onClick={() => onFeedback('DOWN')}
            disabled={feedback !== undefined}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${feedback === 'DOWN' ? 'bg-red-600 text-white' : 'hover:bg-red-100 dark:hover:bg-red-900/30 text-stone-600 dark:text-stone-400'} disabled:cursor-not-allowed`}
            aria-label="Je n'aime pas cet accord"
          >
            <ThumbsDown size={12} />
          </button>
          {feedback && (
            <span className="text-xs text-stone-500 italic ml-1">Merci !</span>
          )}
        </div>
      </>
    ) : (
      <div className="text-sm text-stone-400 italic flex-1 flex items-center justify-center text-center">
        <Wine size={16} className="mb-1" />
        <br />
        Pas de proposition pour cette catégorie
      </div>
    )}
  </div>
);
