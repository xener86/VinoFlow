import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ThumbsUp, ThumbsDown, Shield, Heart, Flame, RefreshCw, Wine, Thermometer, Clock, Mic, MicOff, Check, Circle, GlassWater, MapPin } from 'lucide-react';
import { sommelierPair, sommelierFeedback, consumeSpecificBottle, getSommelierConversation, SommelierChatMessage } from '../services/storageService';
import { SommelierChat } from './SommelierChat';
import { useToast, useConfirm } from './cockpit/feedback';
import { MonoLabel, WineLink } from './cockpit/primitives';
import { CellarWine } from '../types';

interface Pick {
  wine_id: string;
  reason: string;
  service_temp_c: number | null;
  decant_minutes: number;
}

interface Alternative {
  wine_id: string;
  reason: string;
}

interface PairingResult {
  criteria: any;
  candidates: Array<{ wine_id: string; score: number; breakdown: any }>;
  picks: {
    safe: Pick | null;
    personal: Pick | null;
    creative: Pick | null;
    global_advice: string;
    // Autres accords argumentés (0 à 5) ; absent sur les résultats en cache antérieurs.
    alternatives?: Alternative[];
  };
  fromCache: 'level1' | 'level2' | null;
  cave_size: number;
  cave_after_filter: number;
}

interface Props {
  inventory: CellarWine[];
  initialDish?: string;     // Pre-fill the prompt and auto-run on mount (used by /?q=…)
  initialConversationId?: string; // Reprise d'une discussion enregistrée (/sommelier?discussion=…)
  onConversationCreated?: () => void; // Une discussion vient d'être enregistrée (liste latérale à rafraîchir)
}

interface ChatState {
  conversationId?: string;
  messages: SommelierChatMessage[];
}

export const SommelierV2: React.FC<Props> = ({ inventory, initialDish = '', initialConversationId, onConversationCreated }) => {
  const [dish, setDish] = useState(initialDish);
  // Plat pour lequel `result` a été calculé (le champ peut être modifié sans relancer l'accord).
  const [pairedDish, setPairedDish] = useState(initialDish);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PairingResult | null>(null);
  // Discussion sous les résultats : remontée (clé) à chaque nouvel accord.
  const [chat, setChat] = useState<ChatState | null>(null);
  const [chatKey, setChatKey] = useState(0);
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

  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  // Bouteilles ouvertes depuis ces cartes (le stock affiché suit sans recharger la cave)
  const [openedCount, setOpenedCount] = useState<Record<string, number>>({});

  const handleOpenBottle = async (wine: CellarWine) => {
    const remaining = (wine.bottles || []).filter(b => !b.isConsumed).slice(openedCount[wine.id] || 0);
    const bottle = remaining[0];
    if (!bottle) return;
    const label = [wine.name, wine.vintage].filter(Boolean).join(' ');
    const ok = await confirm({
      title: `Ouvrir ${label} ?`,
      message: `La bouteille sera retirée du stock (il en restera ${remaining.length - 1}) et notée au journal.`,
      confirmLabel: 'Ouvrir la bouteille',
    });
    if (!ok) return;
    try {
      await consumeSpecificBottle(wine.id, bottle.id, wine.name, wine.vintage);
      setOpenedCount(c => ({ ...c, [wine.id]: (c[wine.id] || 0) + 1 }));
      toast.success(`${label} : bonne dégustation !`, { label: 'Noter', onClick: () => navigate(`/tasting/${wine.id}`) });
    } catch (e: any) {
      toast.error(`Impossible d'ouvrir la bouteille : ${e.message || 'erreur'}`);
    }
  };

  const [progressStep, setProgressStep] = useState<number>(0);

  // Auto-run when arriving from the dashboard with ?q=... in the URL.
  // We rely on `key={initialDish}` upstream so a new query forces a remount.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!initialDish || !initialDish.trim()) return;
    autoRanRef.current = true;
    // Defer one tick so state from `useState(initialDish)` is committed.
    setTimeout(() => handlePair(false), 0);
  }, [initialDish]);

  // Reprise d'une discussion : plat, accord d'origine et fil restitués.
  useEffect(() => {
    if (!initialConversationId) return;
    let cancelled = false;
    setLoading(true);
    getSommelierConversation(initialConversationId)
      .then(c => {
        if (cancelled) return;
        setDish(c.dish);
        setPairedDish(c.dish);
        setResult({
          criteria: { rationale: c.pairing?.rationale || null },
          candidates: [],
          picks: c.pairing?.picks || { safe: null, personal: null, creative: null, global_advice: '', alternatives: [] },
          fromCache: null,
          cave_size: c.pairing?.cave_size ?? 0,
          cave_after_filter: 0,
        });
        setChat({ conversationId: c.id, messages: c.messages });
        setChatKey(k => k + 1);
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Discussion introuvable'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialConversationId]);

  const handlePair = async (skipCache = false, dishOverride?: string) => {
    const query = (dishOverride ?? dish).trim();
    if (!query) return;
    if (dishOverride !== undefined) setDish(dishOverride);
    setLoading(true);
    setError(null);
    setFeedbackGiven({});
    setProgressStep(0);

    // Simulated progression (LLM doesn't stream natively here, so we fake it
    // with timed steps to give the user a sense of activity)
    const tick = setInterval(() => {
      setProgressStep(s => Math.min(s + 1, 2));
    }, 3000);

    try {
      const res = await sommelierPair(query, {}, skipCache);
      setProgressStep(3);
      setPairedDish(query);
      setResult(res);
      setChat(null);
      setChatKey(k => k + 1);
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue');
    } finally {
      clearInterval(tick);
      setLoading(false);
    }
  };

  const handleFeedback = async (category: 'SAFE' | 'PERSONAL' | 'CREATIVE' | 'ALTERNATIVE', wineId: string, rating: 'UP' | 'DOWN') => {
    setFeedbackGiven(prev => ({ ...prev, [category === 'ALTERNATIVE' ? `ALT:${wineId}` : category]: rating }));
    try {
      await sommelierFeedback({
        wineId,
        dish: pairedDish,
        rating,
        category,
        criteria: result?.criteria,
      });
    } catch (e) {
      console.error('Feedback failed:', e);
    }
  };

  // Alternatives dont le vin est encore connu de la cave (résultats en cache : liste absente = vide)
  const alternatives = (result?.picks.alternatives ?? [])
    .map(alt => ({ alt, wine: wineById(alt.wine_id) }))
    .filter((x): x is { alt: Alternative; wine: CellarWine } => Boolean(x.wine));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-stone-900">
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
          className="flex-1 min-w-0 bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-wine-500 outline-none"
        />
        <button
          type="button"
          onClick={toggleVoiceInput}
          aria-label={listening ? 'Arrêter la dictée' : 'Dicter le plat'}
          title="Dicter à voix haute"
          className={`px-3 rounded-xl flex items-center transition-colors ${listening ? 'bg-red-600 text-white animate-pulse' : 'bg-stone-100 hover:bg-stone-200 text-stone-700'}`}
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          type="submit"
          disabled={loading || !dish.trim()}
          aria-label="Trouver un accord"
          className="bg-wine-600 hover:bg-wine-700 text-white px-3.5 sm:px-5 rounded-xl font-medium flex items-center gap-2 disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          <span className="hidden sm:inline">Trouver</span>
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && !result && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-3">
          <ProgressStep
            done={progressStep >= 1}
            inProgress={progressStep === 0}
            label="Analyse du plat"
            sublabel="Décomposition (protéine, sauce, cuisson, intensité)"
          />
          <ProgressStep
            done={progressStep >= 2}
            inProgress={progressStep === 1}
            label="Recherche dans votre cave"
            sublabel="Pré-filtrage et calcul des scores"
          />
          <ProgressStep
            done={progressStep >= 3}
            inProgress={progressStep === 2}
            label="Sélection finale"
            sublabel="Propositions argumentées"
          />
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>
              {result.candidates.length > 0
                ? <>Cave: {result.cave_size} vins → {result.cave_after_filter} après filtres → top {result.candidates.length}{result.fromCache && ` · cache (${result.fromCache})`}</>
                : <>Accord d'origine de la discussion</>}
            </span>
            <button onClick={() => handlePair(true)} className="flex items-center gap-1 hover:text-wine-600">
              <RefreshCw size={12} /> Régénérer
            </button>
          </div>

          {result.criteria?.rationale && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm text-stone-700 italic">
              {result.criteria.rationale}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            {PICK_SLOTS.map(({ key, category, icon, title, subtitle }) => {
              const pick = result.picks[key];
              return (
                <PickCard
                  key={key}
                  icon={icon}
                  title={title}
                  subtitle={subtitle}
                  pick={pick}
                  wine={pick ? wineById(pick.wine_id) : undefined}
                  opened={pick ? openedCount[pick.wine_id] || 0 : 0}
                  feedback={feedbackGiven[category]}
                  onFeedback={(rating) => pick && handleFeedback(category, pick.wine_id, rating)}
                  onOpenBottle={handleOpenBottle}
                />
              );
            })}
          </div>

          {result.picks.global_advice && (
            <div className="text-sm text-stone-600 italic px-2">
              💡 {result.picks.global_advice}
            </div>
          )}

          {alternatives.length > 0 && (
            <div className="pt-2">
              <MonoLabel>◌ Autres accords possibles</MonoLabel>
              <ul className="mt-2 divide-y divide-stone-100 border border-stone-200 rounded-md bg-white">
                {alternatives.map(({ alt, wine }) => {
                  const stock = Math.max(0, inStockBottles(wine).length - (openedCount[wine.id] || 0));
                  const fb = feedbackGiven[`ALT:${wine.id}`];
                  return (
                    <li key={alt.wine_id} className="p-3 flex flex-col sm:flex-row sm:items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <WineLink id={wine.id} className="serif text-[15px] text-stone-900">
                          {wine.name}{wine.cuvee && wine.cuvee !== wine.name ? ` · ${wine.cuvee}` : ''}
                        </WineLink>
                        <div className="text-xs text-stone-500">
                          {[wine.producer, wine.vintage || null].filter(Boolean).join(' · ')} · {stock} btl
                        </div>
                        <p className="text-xs text-stone-700 mt-1 leading-relaxed">{alt.reason}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenBottle(wine)}
                          disabled={stock === 0}
                          title={stock === 0 ? 'Plus de bouteille en stock' : `${stock} bouteille(s) en stock`}
                          className="h-9 px-3 rounded-md bg-wine-700 hover:bg-wine-800 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <GlassWater size={14} /> Ouvrir
                        </button>
                        <button
                          onClick={() => handleFeedback('ALTERNATIVE', wine.id, 'UP')}
                          disabled={fb !== undefined}
                          aria-label="J'aime cet accord"
                          className={`h-9 w-9 inline-flex items-center justify-center rounded transition-colors ${fb === 'UP' ? 'bg-emerald-600 text-white' : 'hover:bg-emerald-50 text-stone-600'} disabled:cursor-not-allowed`}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          onClick={() => handleFeedback('ALTERNATIVE', wine.id, 'DOWN')}
                          disabled={fb !== undefined}
                          aria-label="Je n'aime pas cet accord"
                          className={`h-9 w-9 inline-flex items-center justify-center rounded transition-colors ${fb === 'DOWN' ? 'bg-wine-700 text-white' : 'hover:bg-wine-50 text-stone-600'} disabled:cursor-not-allowed`}
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <SommelierChat
            key={chatKey}
            dish={pairedDish}
            pairing={result}
            inventory={inventory}
            conversationId={chat?.conversationId}
            initialMessages={chat?.messages}
            openedCount={openedCount}
            onOpenBottle={handleOpenBottle}
            onRevise={(d) => handlePair(true, d)}
            onConversationCreated={onConversationCreated}
          />
        </div>
      )}
    </div>
  );
};

const ProgressStep: React.FC<{ done: boolean; inProgress: boolean; label: string; sublabel: string }> = ({ done, inProgress, label, sublabel }) => (
  <div className="flex items-start gap-3">
    <div className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center ${done ? 'bg-green-600 text-white' : inProgress ? 'bg-wine-100 text-wine-600' : 'bg-stone-200 text-stone-400'}`}>
      {done ? <Check size={12} /> : inProgress ? <Loader2 className="animate-spin" size={12} /> : <Circle size={8} />}
    </div>
    <div className="flex-1">
      <div className={`text-sm font-medium ${done || inProgress ? 'text-stone-900' : 'text-stone-400'}`}>{label}</div>
      <div className="text-xs text-stone-500">{sublabel}</div>
    </div>
  </div>
);

const PICK_SLOTS: { key: 'safe' | 'personal' | 'creative'; category: 'SAFE' | 'PERSONAL' | 'CREATIVE'; icon: React.ReactNode; title: string; subtitle: string }[] = [
  { key: 'safe', category: 'SAFE', icon: <Shield size={14} />, title: 'Sûr', subtitle: "L'accord classique" },
  { key: 'personal', category: 'PERSONAL', icon: <Heart size={14} />, title: 'Personnel', subtitle: 'Selon vos goûts' },
  { key: 'creative', category: 'CREATIVE', icon: <Flame size={14} />, title: 'Audacieux', subtitle: "L'option originale" },
];

const inStockBottles = (wine: CellarWine) => (wine.bottles || []).filter(b => !b.isConsumed);
const hasRackLocation = (wine: CellarWine) =>
  inStockBottles(wine).some(b => typeof b.location === 'object' && b.location !== null && 'rackId' in b.location);

const PickCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  pick: Pick | null;
  wine: CellarWine | undefined;
  opened: number;
  feedback: 'UP' | 'DOWN' | undefined;
  onFeedback: (rating: 'UP' | 'DOWN') => void;
  onOpenBottle: (wine: CellarWine) => void;
}> = ({ icon, title, subtitle, pick, wine, opened, feedback, onFeedback, onOpenBottle }) => {
  const stock = wine ? Math.max(0, inStockBottles(wine).length - opened) : 0;
  return (
    <div className="border border-stone-200 bg-white rounded-md p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-0.5 text-wine-700">
        {icon}
        <span className="mono text-[10px] tracking-widest uppercase">{title}</span>
      </div>
      <div className="text-xs text-stone-500 mb-3">{subtitle}</div>

      {pick && wine ? (
        <>
          <Link
            to={`/wine/${wine.id}`}
            className="group block -mx-2 px-2 py-1.5 rounded hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-wine-600/40 mb-2"
          >
            <div className="serif text-base text-stone-900 group-hover:text-wine-800 leading-snug">
              {wine.name}{wine.cuvee && wine.cuvee !== wine.name ? ` · ${wine.cuvee}` : ''}
            </div>
            <div className="text-xs text-stone-500 flex items-center gap-1">
              <span>{[wine.producer, wine.vintage || null].filter(Boolean).join(' · ')}</span>
              <span className="mono text-[9px] tracking-widest text-wine-700 opacity-0 group-hover:opacity-100 transition ml-auto">FICHE →</span>
            </div>
          </Link>
          <p className="text-xs text-stone-700 mb-3 flex-1 leading-relaxed">{pick.reason}</p>

          {(pick.service_temp_c || pick.decant_minutes > 0) && (
            <div className="flex gap-3 text-xs text-stone-500 mb-3">
              {pick.service_temp_c && (
                <span className="flex items-center gap-1"><Thermometer size={12} /> {pick.service_temp_c} °C</span>
              )}
              {pick.decant_minutes > 0 && (
                <span className="flex items-center gap-1"><Clock size={12} /> carafe {pick.decant_minutes} min</span>
              )}
            </div>
          )}

          {/* Actions rapides */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => onOpenBottle(wine)}
              disabled={stock === 0}
              title={stock === 0 ? 'Plus de bouteille en stock' : `${stock} bouteille(s) en stock`}
              className="h-11 md:h-9 rounded-md bg-wine-700 hover:bg-wine-800 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
            >
              <GlassWater size={14} /> Ouvrir{stock > 0 ? ` (${stock})` : ''}
            </button>
            {hasRackLocation(wine) ? (
              <Link
                to={`/plan?wine=${wine.id}`}
                className="h-11 md:h-9 rounded-md border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium inline-flex items-center justify-center gap-1.5"
              >
                <MapPin size={14} /> Emplacement
              </Link>
            ) : (
              <span
                title="Aucune bouteille rangée dans un casier"
                className="h-11 md:h-9 rounded-md border border-dashed border-stone-200 text-stone-400 text-xs inline-flex items-center justify-center gap-1.5"
              >
                <MapPin size={14} /> Non rangée
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 pt-2 border-t border-stone-100">
            <span className="text-[11px] text-stone-500 mr-1">Cet accord ?</span>
            <button
              onClick={() => onFeedback('UP')}
              disabled={feedback !== undefined}
              className={`h-9 w-9 inline-flex items-center justify-center rounded transition-colors ${feedback === 'UP' ? 'bg-emerald-600 text-white' : 'hover:bg-emerald-50 text-stone-600'} disabled:cursor-not-allowed`}
              aria-label="J'aime cet accord"
            >
              <ThumbsUp size={14} />
            </button>
            <button
              onClick={() => onFeedback('DOWN')}
              disabled={feedback !== undefined}
              className={`h-9 w-9 inline-flex items-center justify-center rounded transition-colors ${feedback === 'DOWN' ? 'bg-wine-700 text-white' : 'hover:bg-wine-50 text-stone-600'} disabled:cursor-not-allowed`}
              aria-label="Je n'aime pas cet accord"
            >
              <ThumbsDown size={14} />
            </button>
            {feedback && <span className="text-xs text-stone-500 italic ml-1">Merci !</span>}
          </div>
        </>
      ) : (
        <div className="text-sm text-stone-400 italic flex-1 flex flex-col items-center justify-center text-center gap-1 py-6">
          <Wine size={16} />
          Pas de proposition pour cette catégorie
        </div>
      )}
    </div>
  );
};
