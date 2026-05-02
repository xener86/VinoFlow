import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Wine, Utensils, Layers, Eye, GitCompareArrows, BookOpen,
  Camera, Loader2, Check, RefreshCw, ArrowLeft,
} from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { CellarWine } from '../types';
import {
  sommelierReversePair,
  sommelierMenu,
  sommelierVertical,
  sommelierBlind,
  sommelierCompare,
  sommelierExplain,
  extractWineFromImage,
} from '../services/storageService';

type Tool =
  | 'REVERSE'
  | 'MENU'
  | 'VERTICAL'
  | 'BLIND'
  | 'COMPARE'
  | 'EXPLAIN'
  | 'OCR';

interface ToolCard {
  id: Tool;
  title: string;
  subtitle: string;
  icon: React.FC<any>;
  color: string;
}

const TOOLS: ToolCard[] = [
  { id: 'REVERSE', title: 'Pairing inversé', subtitle: 'Voici un vin → quoi cuisiner', icon: Wine, color: 'wine' },
  { id: 'MENU', title: 'Menu complet', subtitle: 'Entrée → plat → dessert avec progression', icon: Utensils, color: 'amber' },
  { id: 'VERTICAL', title: 'Verticale', subtitle: 'Plusieurs millésimes du même domaine', icon: Layers, color: 'indigo' },
  { id: 'BLIND', title: 'Mode aveugle', subtitle: "L'app cache, vous dégustez, on révèle", icon: Eye, color: 'stone' },
  { id: 'COMPARE', title: 'Decision assistant', subtitle: 'J\'hésite entre 2 vins pour ce plat', icon: GitCompareArrows, color: 'green' },
  { id: 'EXPLAIN', title: 'Explique-moi', subtitle: 'Pourquoi cet accord fonctionne', icon: BookOpen, color: 'wine' },
  { id: 'OCR', title: 'Scanner étiquette', subtitle: 'Photo → ajout automatique', icon: Camera, color: 'cyan' },
];

const COLORS: Record<string, string> = {
  wine:   'bg-wine-50 dark:bg-wine-900/20 text-wine-700 dark:text-wine-400 border-wine-100 dark:border-wine-900/40',
  amber:  'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/40',
  indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40',
  stone:  'bg-stone-100 dark:bg-stone-900/40 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-800',
  green:  'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-100 dark:border-green-900/40',
  cyan:   'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-100 dark:border-cyan-900/40',
};

export const SommelierTools: React.FC = () => {
  const navigate = useNavigate();
  const { wines } = useWines();
  const [active, setActive] = useState<Tool | null>(null);

  return (
    <div className="max-w-4xl mx-auto pb-10 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="text-indigo-500" size={20} />
        <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Boîte à outils du sommelier</h2>
      </div>
      <p className="text-stone-500 text-sm mb-8">7 modes d'accord et d'analyse, au-delà du pairing classique.</p>

      {!active && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              onClick={() => setActive(tool.id)}
              className={`text-left p-5 rounded-2xl border ${COLORS[tool.color]} hover:shadow-lg transition-all group`}
            >
              <div className="flex items-start justify-between mb-3">
                <tool.icon size={22} />
              </div>
              <h3 className="font-serif text-lg text-stone-900 dark:text-white mb-1">{tool.title}</h3>
              <p className="text-sm opacity-80">{tool.subtitle}</p>
            </button>
          ))}
        </div>
      )}

      {active && (
        <div>
          <button onClick={() => setActive(null)} className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white mb-4">
            <ArrowLeft size={14} /> Retour
          </button>
          <div className="bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl p-6">
            {active === 'REVERSE'  && <ReverseTool wines={wines} />}
            {active === 'MENU'     && <MenuTool />}
            {active === 'VERTICAL' && <VerticalTool wines={wines} />}
            {active === 'BLIND'    && <BlindTool />}
            {active === 'COMPARE'  && <CompareTool wines={wines} />}
            {active === 'EXPLAIN'  && <ExplainTool wines={wines} />}
            {active === 'OCR'      && <OcrTool onAdded={(id) => navigate(`/wine/${id}`)} />}
          </div>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Reverse pairing
// ──────────────────────────────────────────
const ReverseTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const [wineId, setWineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!wineId) return;
    setLoading(true);
    try { setResult(await sommelierReversePair(wineId)); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Voici un vin, qu'est-ce que je cuisine ?</h3>
      <WineSelect wines={wines} value={wineId} onChange={setWineId} />
      <button onClick={run} disabled={!wineId || loading} className="bg-wine-600 hover:bg-wine-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        Suggérer 5 plats
      </button>
      {result?.suggestions && (
        <ul className="space-y-3 mt-4">
          {result.suggestions.map((s: any, i: number) => (
            <li key={i} className="bg-stone-50 dark:bg-stone-950 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase font-bold text-wine-600">{s.type}</span>
              </div>
              <div className="font-medium">{s.dish}</div>
              <div className="text-sm text-stone-500 italic mt-1">{s.reason}</div>
            </li>
          ))}
        </ul>
      )}
      {result?.global_advice && (
        <div className="text-sm text-stone-500 italic">💡 {result.global_advice}</div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Menu complet
// ──────────────────────────────────────────
const MenuTool: React.FC = () => {
  const [dishes, setDishes] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    const filtered = dishes.filter(d => d.trim());
    if (filtered.length === 0) return;
    setLoading(true);
    try { setResult(await sommelierMenu(filtered)); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Menu complet — accord par plat</h3>
      <p className="text-sm text-stone-500">Renseignez 1 à 3 plats. L'app accordera chacun en gardant la cohérence du repas.</p>
      {dishes.map((d, i) => (
        <input
          key={i}
          type="text"
          value={d}
          onChange={e => setDishes(ds => ds.map((x, j) => j === i ? e.target.value : x))}
          placeholder={['Entrée (ex: foie gras)', 'Plat (ex: agneau de pré-salé)', 'Dessert (ex: tarte aux figues)'][i]}
          className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3"
        />
      ))}
      <button onClick={run} disabled={loading} className="bg-wine-600 hover:bg-wine-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <Utensils size={16} />}
        Construire le menu
      </button>
      {result?.courses && (
        <div className="space-y-4 mt-4">
          {result.courses.map((c: any, i: number) => (
            <div key={i} className="border-l-4 border-wine-500 pl-4">
              <div className="text-xs uppercase text-stone-500 font-bold">Service {i + 1}</div>
              <div className="font-medium mb-2">{c.dish}</div>
              {c.picks?.safe ? (
                <div className="text-sm text-stone-700 dark:text-stone-300">→ {c.picks.safe.reason}</div>
              ) : <div className="text-sm text-stone-400 italic">Pas d'accord trouvé</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Verticale
// ──────────────────────────────────────────
const VerticalTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const producers = Array.from(new Set(wines.map(w => w.producer).filter(Boolean))).sort();
  const [producer, setProducer] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!producer) return;
    setLoading(true);
    try { setResult(await sommelierVertical(producer)); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Verticale — plusieurs millésimes du même domaine</h3>
      <select
        value={producer}
        onChange={e => setProducer(e.target.value)}
        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3"
      >
        <option value="">Choisissez un producteur...</option>
        {producers.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <button onClick={run} disabled={!producer || loading} className="bg-wine-600 hover:bg-wine-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <Layers size={16} />}
        Construire la verticale
      </button>
      {result?.wines && result.wines.length > 0 && (
        <ol className="space-y-2 mt-4">
          {result.wines.map((w: any, i: number) => (
            <li key={w.id} className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-950 rounded-lg">
              <span className="w-7 h-7 rounded-full bg-wine-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
              <div className="flex-1">
                <div className="font-medium">{w.cuvee || w.name} <span className="text-stone-500">{w.vintage}</span></div>
                <div className="text-xs text-stone-500">{w.peak?.status}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {result?.note && <p className="text-sm text-stone-500 italic">{result.note}</p>}
    </div>
  );
};

// ──────────────────────────────────────────
// Mode aveugle
// ──────────────────────────────────────────
const BlindTool: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tasting, setTasting] = useState<any>(null);
  const [revealed, setRevealed] = useState(false);

  const start = async () => {
    setLoading(true); setRevealed(false);
    try { setTasting(await sommelierBlind()); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Mode aveugle — entraînez votre palais</h3>
      <p className="text-sm text-stone-500">L'app pioche un vin au hasard de votre cave. À vous de deviner.</p>
      <button onClick={start} disabled={loading} className="bg-wine-600 hover:bg-wine-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
        {tasting ? 'Nouveau vin' : 'Démarrer'}
      </button>
      {tasting && (
        <div className="space-y-4 mt-4">
          <div className="bg-stone-50 dark:bg-stone-950 rounded-lg p-4 space-y-2">
            <div className="text-xs uppercase text-stone-500 font-bold">Indices</div>
            <div className="text-sm">Type: <strong>{tasting.blind_clues.type}</strong></div>
            {tasting.blind_clues.country && <div className="text-sm">Pays: <strong>{tasting.blind_clues.country}</strong></div>}
            {tasting.blind_clues.vintage_range && <div className="text-sm">Décennie: <strong>{tasting.blind_clues.vintage_range[0]}s</strong></div>}
            {tasting.blind_clues.sensory_profile && (
              <div className="text-sm text-stone-500">
                Corps {tasting.blind_clues.sensory_profile.body}/100 ·
                Acidité {tasting.blind_clues.sensory_profile.acidity}/100 ·
                Tanin {tasting.blind_clues.sensory_profile.tannin}/100
              </div>
            )}
          </div>
          {!revealed ? (
            <button onClick={() => setRevealed(true)} className="bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 px-5 py-2 rounded-lg flex items-center gap-2">
              <Eye size={16} /> Révéler
            </button>
          ) : (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="text-xs uppercase font-bold text-green-700 mb-1">C'était</div>
              <div className="text-lg font-serif">{tasting.reveal.producer} - {tasting.reveal.cuvee || tasting.reveal.name} {tasting.reveal.vintage}</div>
              <div className="text-sm text-stone-500">{tasting.reveal.appellation || tasting.reveal.region}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Decision assistant
// ──────────────────────────────────────────
const CompareTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const [dish, setDish] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!dish || !a || !b) return;
    setLoading(true);
    try { setResult(await sommelierCompare(dish, a, b)); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Decision assistant — A ou B ?</h3>
      <input
        type="text" value={dish} onChange={e => setDish(e.target.value)}
        placeholder="Plat (ex: gigot d'agneau aux herbes)"
        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3"
      />
      <div className="grid grid-cols-2 gap-3">
        <WineSelect wines={wines} value={a} onChange={setA} placeholder="Vin A" />
        <WineSelect wines={wines} value={b} onChange={setB} placeholder="Vin B" />
      </div>
      <button onClick={run} disabled={!dish || !a || !b || loading} className="bg-wine-600 hover:bg-wine-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <GitCompareArrows size={16} />}
        Comparer
      </button>
      {result && (
        <div className="space-y-3 mt-4">
          <div className={`p-4 rounded-xl ${result.winner === 'A' ? 'bg-green-50 dark:bg-green-900/20 border border-green-300' : result.winner === 'B' ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-300' : 'bg-stone-50 dark:bg-stone-950'}`}>
            <div className="text-xs uppercase font-bold mb-2">
              Gagnant : {result.winner === 'tie' ? 'Match nul' : `Vin ${result.winner}`}
            </div>
            <p className="text-sm">{result.reasoning}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="font-bold mb-1 text-green-600">A — Forces</div>
              <p className="text-stone-700 dark:text-stone-300">{result.wine_a_strengths}</p>
              <div className="font-bold mt-2 mb-1 text-orange-600">A — Faiblesses</div>
              <p className="text-stone-700 dark:text-stone-300">{result.wine_a_weaknesses}</p>
            </div>
            <div>
              <div className="font-bold mb-1 text-green-600">B — Forces</div>
              <p className="text-stone-700 dark:text-stone-300">{result.wine_b_strengths}</p>
              <div className="font-bold mt-2 mb-1 text-orange-600">B — Faiblesses</div>
              <p className="text-stone-700 dark:text-stone-300">{result.wine_b_weaknesses}</p>
            </div>
          </div>
          {result.advice && <div className="text-sm text-stone-500 italic">💡 {result.advice}</div>}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Explique-moi
// ──────────────────────────────────────────
const ExplainTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const [dish, setDish] = useState('');
  const [wineId, setWineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    if (!dish || !wineId) return;
    setLoading(true);
    try {
      const r = await sommelierExplain(dish, wineId);
      setResult(r.explanation);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Explique-moi cet accord</h3>
      <p className="text-sm text-stone-500">Le sommelier détaille en 4 paragraphes le mécanisme et les axes d'accord.</p>
      <input type="text" value={dish} onChange={e => setDish(e.target.value)} placeholder="Plat" className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3" />
      <WineSelect wines={wines} value={wineId} onChange={setWineId} />
      <button onClick={run} disabled={!dish || !wineId || loading} className="bg-wine-600 hover:bg-wine-700 text-white px-5 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        {loading ? <Loader2 className="animate-spin" size={16} /> : <BookOpen size={16} />}
        Expliquer
      </button>
      {result && (
        <div className="bg-stone-50 dark:bg-stone-950 rounded-xl p-4 mt-4 prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
          {result}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// OCR
// ──────────────────────────────────────────
const OcrTool: React.FC<{ onAdded: (id: string) => void }> = ({ onAdded }) => {
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(',')[1];
        const result = await extractWineFromImage(base64, file.type);
        setExtracted(result);
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Scanner une étiquette</h3>
      <p className="text-sm text-stone-500">Prenez une photo de l'étiquette, l'IA en extrait les infos.</p>
      <label className="block bg-stone-50 dark:bg-stone-950 border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl p-8 text-center cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-900">
        <input type="file" accept="image/*" capture="environment" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
        <Camera className="mx-auto mb-2 text-stone-500" size={32} />
        <div className="text-sm text-stone-500">Cliquez pour choisir une photo</div>
      </label>
      {loading && <div className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="animate-spin" size={16} /> Analyse de l'étiquette...</div>}
      {extracted && (
        <div className="bg-stone-50 dark:bg-stone-950 rounded-xl p-4 space-y-2">
          <div className="font-medium">Détecté :</div>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(extracted, null, 2)}</pre>
          <p className="text-xs text-stone-500 italic">Copiez ces infos dans le formulaire d'ajout pour créer le vin.</p>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Wine selector
// ──────────────────────────────────────────
const WineSelect: React.FC<{ wines: CellarWine[]; value: string; onChange: (id: string) => void; placeholder?: string }> = ({ wines, value, onChange, placeholder = 'Choisissez un vin...' }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3"
  >
    <option value="">{placeholder}</option>
    {wines.filter(w => w.inventoryCount > 0).map(w => (
      <option key={w.id} value={w.id}>
        {w.producer ? `${w.producer} - ` : ''}{w.name} {w.vintage || ''}
      </option>
    ))}
  </select>
);
