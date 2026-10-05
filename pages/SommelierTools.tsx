// Outils du sommelier — modes avancés rendus comme onglets de la page
// Sommelier (/sommelier?outil=<clé>). Chaque outil est exporté pour que
// CockpitSommelier les affiche ; `SommelierTools` ne fait plus que rediriger.

import React, { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sparkles, Wine as WineIcon, Utensils, Layers, Eye, GitCompareArrows, BookOpen,
  Camera, RefreshCw, Copy, ArrowRight, Trophy,
} from 'lucide-react';
import { CellarWine, WineType } from '../types';
import {
  sommelierReversePair,
  sommelierMenu,
  sommelierVertical,
  sommelierBlind,
  sommelierCompare,
  sommelierExplain,
  extractWineFromImage,
} from '../services/storageService';
import {
  AiLoading, Badge, Button, EmptyState, Input, MonoLabel, Select, WineLink,
} from '../components/cockpit/primitives';
import { useToast } from '../components/cockpit/feedback';

// ──────────────────────────────────────────
// Catalogue des outils (clé = valeur de ?outil=)
// ──────────────────────────────────────────
export type SommelierToolKey = 'plats' | 'menu' | 'verticale' | 'aveugle' | 'comparer' | 'expliquer' | 'etiquette';

export interface SommelierToolDef {
  key: SommelierToolKey;
  label: string;
  title: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
}

export const SOMMELIER_TOOLS: SommelierToolDef[] = [
  { key: 'plats', label: 'Quoi cuisiner', title: 'Voici un vin, que cuisiner ?', subtitle: 'Cinq plats suggérés pour une bouteille de la cave', icon: WineIcon },
  { key: 'menu', label: 'Menu', title: 'Menu complet', subtitle: "Un vin par plat, en gardant la progression du repas", icon: Utensils },
  { key: 'verticale', label: 'Verticale', title: 'Verticale', subtitle: 'Plusieurs millésimes du même domaine, dans le bon ordre', icon: Layers },
  { key: 'aveugle', label: 'À l’aveugle', title: 'Dégustation à l’aveugle', subtitle: "L'app pioche un vin de la cave, vous devinez", icon: Eye },
  { key: 'comparer', label: 'A ou B', title: 'A ou B ?', subtitle: "J'hésite entre deux vins pour ce plat", icon: GitCompareArrows },
  { key: 'expliquer', label: 'Expliquer', title: 'Explique-moi cet accord', subtitle: "Pourquoi ce vin fonctionne (ou non) avec ce plat", icon: BookOpen },
  { key: 'etiquette', label: 'Étiquette', title: 'Scanner une étiquette', subtitle: "Photo de l'étiquette → fiche pré-remplie", icon: Camera },
];

export const isSommelierToolKey = (k: string | null): k is SommelierToolKey =>
  !!k && SOMMELIER_TOOLS.some(t => t.key === k);

/** Ancienne route /sommelier-tools : redirige vers l'onglet correspondant. */
export const SommelierTools: React.FC = () => {
  const [params] = useSearchParams();
  const outil = params.get('outil');
  return <Navigate to={`/sommelier?outil=${isSommelierToolKey(outil) ? outil : 'plats'}`} replace />;
};

/** Rend l'outil demandé. */
export const SommelierToolPanel: React.FC<{ tool: SommelierToolKey; wines: CellarWine[] }> = ({ tool, wines }) => {
  switch (tool) {
    case 'plats': return <ReverseTool wines={wines} />;
    case 'menu': return <MenuTool wines={wines} />;
    case 'verticale': return <VerticalTool wines={wines} />;
    case 'aveugle': return <BlindTool />;
    case 'comparer': return <CompareTool wines={wines} />;
    case 'expliquer': return <ExplainTool wines={wines} />;
    case 'etiquette': return <OcrTool />;
  }
};

// ──────────────────────────────────────────
// Helpers partagés
// ──────────────────────────────────────────
const TYPE_LABELS: Record<WineType, string> = {
  RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Effervescent', DESSERT: 'Liquoreux', FORTIFIED: 'Muté',
};
const typeLabel = (t?: string | null) => (t && (TYPE_LABELS as Record<string, string>)[t]) || t || '—';

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erreur inconnue');

const wineTitle = (w: { name?: string; cuvee?: string | null }) =>
  `${w.name || 'Vin'}${w.cuvee && w.cuvee !== w.name ? ` · ${w.cuvee}` : ''}`;

const wineOptionLabel = (w: CellarWine) =>
  [w.producer, wineTitle(w), w.vintage || null].filter(Boolean).join(' · ');

/** Bloc vin cliquable → fiche. */
const WineBlock: React.FC<{ wine: { id: string; name?: string; cuvee?: string | null; producer?: string; vintage?: number | null }; prefix?: React.ReactNode; className?: string }> = ({ wine, prefix, className = '' }) => (
  <Link
    to={`/wine/${wine.id}`}
    className={`group flex items-center gap-3 -mx-2 px-2 py-1.5 min-h-[44px] rounded hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-wine-600/40 ${className}`}
  >
    {prefix}
    <div className="flex-1 min-w-0">
      <div className="serif text-base text-stone-900 group-hover:text-wine-800 leading-snug break-words">{wineTitle(wine)}</div>
      <div className="text-xs text-stone-500">{[wine.producer, wine.vintage || null].filter(Boolean).join(' · ')}</div>
    </div>
    <span className="mono text-[9px] tracking-widest text-wine-700 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition">FICHE →</span>
  </Link>
);

const ToolIntro: React.FC<{ tool: SommelierToolKey }> = ({ tool }) => {
  const def = SOMMELIER_TOOLS.find(t => t.key === tool)!;
  return (
    <div className="mb-4">
      <MonoLabel>◌ {def.label}</MonoLabel>
      <h2 className="serif text-xl text-stone-900 leading-tight mt-1">{def.title}</h2>
      <p className="text-sm text-stone-500 mt-0.5">{def.subtitle}</p>
    </div>
  );
};

const WineSelect: React.FC<{ wines: CellarWine[]; value: string; onChange: (id: string) => void; label?: string; placeholder?: string; exclude?: string }> = ({ wines, value, onChange, label = 'Vin', placeholder = 'Choisissez un vin…', exclude }) => {
  const options = wines
    .filter(w => w.inventoryCount > 0 && w.id !== exclude)
    .sort((a, b) => wineOptionLabel(a).localeCompare(wineOptionLabel(b), 'fr'));
  return (
    <Select label={label} value={value} onChange={e => onChange(e.target.value)} wrapperClassName="flex-1 min-w-0">
      <option value="">{placeholder}</option>
      {options.map(w => <option key={w.id} value={w.id}>{wineOptionLabel(w)}</option>)}
    </Select>
  );
};

const Advice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-stone-600 italic border-l-2 border-wine-200 pl-3">{children}</p>
);

const NoStock: React.FC = () => {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="Pas assez de bouteilles en cave"
      hint="Ajoutez des vins pour utiliser cet outil"
      action={<Button variant="outline" onClick={() => navigate('/add-wine')}>Ajouter un vin</Button>}
    />
  );
};

// ──────────────────────────────────────────
// Quoi cuisiner (pairing inversé)
// ──────────────────────────────────────────
export const ReverseTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const toast = useToast();
  const [wineId, setWineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const wine = wines.find(w => w.id === wineId);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wineId) return;
    setLoading(true);
    setResult(null);
    try { setResult(await sommelierReversePair(wineId)); }
    catch (err) { toast.error(`Suggestion impossible : ${errMsg(err)}`); }
    finally { setLoading(false); }
  };

  if (!wines.some(w => w.inventoryCount > 0)) return <><ToolIntro tool="plats" /><NoStock /></>;

  return (
    <div>
      <ToolIntro tool="plats" />
      <form onSubmit={run} className="flex flex-col sm:flex-row sm:items-end gap-3">
        <WineSelect wines={wines} value={wineId} onChange={setWineId} label="Bouteille" />
        <Button type="submit" disabled={!wineId || loading} className="shrink-0">
          <Sparkles className="w-4 h-4" /> Suggérer 5 plats
        </Button>
      </form>

      {loading && <AiLoading className="mt-4" />}

      {result?.suggestions?.length > 0 && (
        <div className="mt-5 space-y-3">
          {wine && <WineBlock wine={wine} />}
          <ul className="divide-y divide-stone-100 border-y border-stone-100">
            {result.suggestions.map((s: any, i: number) => (
              <li key={i} className="py-3">
                <Badge tone="neutral" className="uppercase">{s.type}</Badge>
                <div className="serif text-base text-stone-900 mt-1">{s.dish}</div>
                <div className="text-sm text-stone-600 mt-0.5 leading-relaxed">{s.reason}</div>
              </li>
            ))}
          </ul>
          {result.global_advice && <Advice>{result.global_advice}</Advice>}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Menu complet
// ──────────────────────────────────────────
const MENU_PLACEHOLDERS = ['Entrée (ex : foie gras)', 'Plat (ex : agneau de pré-salé)', 'Dessert (ex : tarte aux figues)'];
const MENU_LABELS = ['Entrée', 'Plat', 'Dessert'];
const MENU_PICKS: { key: 'safe' | 'personal' | 'creative'; label: string }[] = [
  { key: 'safe', label: 'Sûr' },
  { key: 'personal', label: 'Personnel' },
  { key: 'creative', label: 'Audacieux' },
];

export const MenuTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const toast = useToast();
  const [dishes, setDishes] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const filled = dishes.filter(d => d.trim());

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (filled.length === 0) return;
    setLoading(true);
    setResult(null);
    try { setResult(await sommelierMenu(filled.map(d => d.trim()))); }
    catch (err) { toast.error(`Menu impossible : ${errMsg(err)}`); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <ToolIntro tool="menu" />
      <form onSubmit={run} className="space-y-3">
        {dishes.map((d, i) => (
          <Input
            key={i}
            label={MENU_LABELS[i]}
            value={d}
            onChange={e => setDishes(ds => ds.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={MENU_PLACEHOLDERS[i]}
          />
        ))}
        <Button type="submit" disabled={filled.length === 0 || loading}>
          <Utensils className="w-4 h-4" /> Construire le menu
        </Button>
      </form>

      {loading && <AiLoading className="mt-4" hint="Un accord par plat : comptez jusqu'à une minute" />}

      {result?.courses && (
        <ol className="mt-5 space-y-4">
          {result.courses.map((c: any, i: number) => {
            const picks = MENU_PICKS
              .map(p => ({ ...p, pick: c.picks?.[p.key], wine: wines.find(w => w.id === c.picks?.[p.key]?.wine_id) }))
              .filter(p => p.pick && p.wine);
            return (
              <li key={i} className="border-l-2 border-wine-600 pl-4">
                <MonoLabel>Service {i + 1}</MonoLabel>
                <div className="serif text-lg text-stone-900 leading-tight mt-0.5">{c.dish}</div>
                {picks.length === 0 ? (
                  <div className="serif-it text-sm text-stone-400 mt-1">Pas d'accord trouvé dans la cave</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {picks.map(p => (
                      <div key={p.key}>
                        <WineBlock wine={p.wine!} prefix={<Badge tone={p.key === 'safe' ? 'urgent' : 'neutral'} className="uppercase shrink-0 w-[72px] justify-center">{p.label}</Badge>} />
                        <p className="text-sm text-stone-600 leading-relaxed">{p.pick.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Verticale
// ──────────────────────────────────────────
export const VerticalTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const toast = useToast();
  // Seuls les producteurs avec au moins 2 millésimes en cave permettent une verticale.
  const producers = (() => {
    const counts = new Map<string, Set<number>>();
    wines.filter(w => w.inventoryCount > 0 && w.producer && w.vintage).forEach(w => {
      if (!counts.has(w.producer)) counts.set(w.producer, new Set());
      counts.get(w.producer)!.add(w.vintage);
    });
    return Array.from(counts.entries()).filter(([, v]) => v.size >= 2).map(([p, v]) => ({ name: p, count: v.size }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  })();
  const [producer, setProducer] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!producer) return;
    setLoading(true);
    setResult(null);
    try { setResult(await sommelierVertical(producer)); }
    catch (err) { toast.error(`Verticale impossible : ${errMsg(err)}`); }
    finally { setLoading(false); }
  };

  if (producers.length === 0) {
    return (
      <div>
        <ToolIntro tool="verticale" />
        <EmptyState title="Aucun domaine avec plusieurs millésimes" hint="Il faut au moins deux millésimes d'un même producteur en cave" />
      </div>
    );
  }

  return (
    <div>
      <ToolIntro tool="verticale" />
      <form onSubmit={run} className="flex flex-col sm:flex-row sm:items-end gap-3">
        <Select label="Producteur" value={producer} onChange={e => { setProducer(e.target.value); setResult(null); }} wrapperClassName="flex-1 min-w-0">
          <option value="">Choisissez un producteur…</option>
          {producers.map(p => <option key={p.name} value={p.name}>{p.name} ({p.count} millésimes)</option>)}
        </Select>
        <Button type="submit" disabled={!producer || loading} className="shrink-0">
          <Layers className="w-4 h-4" /> Construire la verticale
        </Button>
      </form>

      {result?.wines?.length > 0 && (
        <ol className="mt-5 space-y-1">
          {result.wines.map((w: any, i: number) => (
            <li key={w.id}>
              <WineBlock
                wine={{ ...w, producer: result.producer }}
                prefix={<span className="w-7 h-7 rounded-full bg-wine-700 text-white mono text-xs flex items-center justify-center shrink-0">{i + 1}</span>}
              />
              {w.peak?.status && <div className="pl-10 -mt-1 mb-1"><Badge tone={w.peak.status === 'À Boire' ? 'success' : w.peak.status === 'Garde' ? 'neutral' : 'warning'}>{w.peak.status}</Badge></div>}
            </li>
          ))}
        </ol>
      )}
      {result?.note && <div className="mt-4"><Advice>{result.note}</Advice></div>}
    </div>
  );
};

// ──────────────────────────────────────────
// À l'aveugle
// ──────────────────────────────────────────
export const BlindTool: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [tasting, setTasting] = useState<any>(null);
  const [revealed, setRevealed] = useState(false);

  const start = async () => {
    setLoading(true);
    setRevealed(false);
    try { setTasting(await sommelierBlind()); }
    catch (err) { toast.error(`Impossible de tirer un vin : ${errMsg(err)}`); }
    finally { setLoading(false); }
  };

  const clues = tasting?.blind_clues;
  const sp = clues?.sensory_profile;

  return (
    <div>
      <ToolIntro tool="aveugle" />
      <Button onClick={start} disabled={loading} variant={tasting ? 'outline' : 'default'}>
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {tasting ? 'Un autre vin' : 'Tirer un vin'}
      </Button>

      {clues && (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
            <MonoLabel>Indices</MonoLabel>
            <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Clue label="Couleur" value={typeLabel(clues.type)} />
              {clues.country && <Clue label="Pays" value={clues.country} />}
              {clues.vintage_range && <Clue label="Décennie" value={`Années ${clues.vintage_range[0]}`} />}
            </dl>
            {sp && (
              <div className="mt-3 space-y-1.5">
                {([['Corps', sp.body], ['Acidité', sp.acidity], ['Tanins', sp.tannin]] as [string, number | undefined][])
                  .filter(([, v]) => v != null)
                  .map(([l, v]) => (
                    <div key={l} className="flex items-center gap-3 text-xs">
                      <span className="w-14 text-stone-500">{l}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-wine-600" style={{ width: `${Math.max(0, Math.min(100, v!))}%` }} /></div>
                      <span className="mono text-[10px] text-stone-500 w-8 text-right">{v}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {!revealed ? (
            <Button variant="subtle" onClick={() => setRevealed(true)}>
              <Eye className="w-4 h-4" /> Révéler
            </Button>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-4 animate-fade-in">
              <MonoLabel className="text-emerald-700">C'était</MonoLabel>
              <WineBlock wine={tasting.reveal} className="mt-1" />
              {(tasting.reveal.appellation || tasting.reveal.region) && (
                <div className="text-xs text-stone-500">{tasting.reveal.appellation || tasting.reveal.region}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Clue: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="mono text-[10px] tracking-widest text-stone-500 uppercase">{label}</dt>
    <dd className="text-stone-900 mt-0.5">{value}</dd>
  </div>
);

// ──────────────────────────────────────────
// A ou B
// ──────────────────────────────────────────
export const CompareTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const toast = useToast();
  const [dish, setDish] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [asked, setAsked] = useState<{ a: string; b: string } | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dish.trim() || !a || !b) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await sommelierCompare(dish.trim(), a, b));
      setAsked({ a, b });
    } catch (err) { toast.error(`Comparaison impossible : ${errMsg(err)}`); }
    finally { setLoading(false); }
  };

  if (wines.filter(w => w.inventoryCount > 0).length < 2) return <><ToolIntro tool="comparer" /><NoStock /></>;

  const wa = asked && wines.find(w => w.id === asked.a);
  const wb = asked && wines.find(w => w.id === asked.b);
  const winner = result?.winner === 'A' ? wa : result?.winner === 'B' ? wb : null;

  return (
    <div>
      <ToolIntro tool="comparer" />
      <form onSubmit={run} className="space-y-3">
        <Input label="Plat" value={dish} onChange={e => setDish(e.target.value)} placeholder="ex : gigot d'agneau aux herbes" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <WineSelect wines={wines} value={a} onChange={setA} label="Vin A" exclude={b} />
          <WineSelect wines={wines} value={b} onChange={setB} label="Vin B" exclude={a} />
        </div>
        <Button type="submit" disabled={!dish.trim() || !a || !b || loading}>
          <GitCompareArrows className="w-4 h-4" /> Comparer
        </Button>
      </form>

      {loading && <AiLoading className="mt-4" />}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-wine-100 bg-wine-50/40 p-4">
            <div className="flex items-center gap-2 text-wine-700">
              <Trophy className="w-4 h-4" />
              <MonoLabel className="text-wine-700">{result.winner === 'tie' ? 'Match nul' : `Vin ${result.winner} retenu`}</MonoLabel>
            </div>
            {winner && <WineBlock wine={winner} className="mt-1" />}
            <p className="text-sm text-stone-700 leading-relaxed mt-1">{result.reasoning}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([['A', wa, result.wine_a_strengths, result.wine_a_weaknesses], ['B', wb, result.wine_b_strengths, result.wine_b_weaknesses]] as const).map(([k, w, s, f]) => (
              <div key={k} className={`rounded-md border p-4 ${result.winner === k ? 'border-wine-200' : 'border-stone-200'}`}>
                <MonoLabel>Vin {k}</MonoLabel>
                {w && <WineBlock wine={w} />}
                <div className="mt-2 text-sm">
                  <div className="mono text-[10px] tracking-widest uppercase text-emerald-700">Forces</div>
                  <p className="text-stone-700 leading-relaxed">{s}</p>
                  <div className="mono text-[10px] tracking-widest uppercase text-amber-700 mt-2">Faiblesses</div>
                  <p className="text-stone-700 leading-relaxed">{f}</p>
                </div>
              </div>
            ))}
          </div>
          {result.advice && <Advice>{result.advice}</Advice>}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Explique-moi
// ──────────────────────────────────────────
export const ExplainTool: React.FC<{ wines: CellarWine[] }> = ({ wines }) => {
  const toast = useToast();
  const [dish, setDish] = useState('');
  const [wineId, setWineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; wineId: string } | null>(null);
  const explained = result && wines.find(w => w.id === result.wineId);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dish.trim() || !wineId) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await sommelierExplain(dish.trim(), wineId);
      setResult({ text: r.explanation, wineId });
    } catch (err) { toast.error(`Explication impossible : ${errMsg(err)}`); }
    finally { setLoading(false); }
  };

  if (!wines.some(w => w.inventoryCount > 0)) return <><ToolIntro tool="expliquer" /><NoStock /></>;

  return (
    <div>
      <ToolIntro tool="expliquer" />
      <form onSubmit={run} className="space-y-3">
        <Input label="Plat" value={dish} onChange={e => setDish(e.target.value)} placeholder="ex : saint-jacques au beurre blanc" />
        <WineSelect wines={wines} value={wineId} onChange={setWineId} />
        <Button type="submit" disabled={!dish.trim() || !wineId || loading}>
          <BookOpen className="w-4 h-4" /> Expliquer
        </Button>
      </form>

      {loading && <AiLoading className="mt-4" />}

      {result && (
        <div className="mt-5">
          {explained && <WineBlock wine={explained} />}
          <div className="mt-2 text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">{result.text}</div>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────
// Scanner une étiquette
// ──────────────────────────────────────────
interface OcrResult {
  producer: string | null;
  name: string | null;
  cuvee: string | null;
  vintage: number | null;
  region: string | null;
  appellation: string | null;
  country: string | null;
  type: WineType | null;
  abv: number | null;
  format: string | null;
  grape_varieties: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  notes: string | null;
}

const CONFIDENCE: Record<OcrResult['confidence'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  HIGH: { label: 'Lecture fiable', tone: 'success' },
  MEDIUM: { label: 'Lecture partielle', tone: 'neutral' },
  LOW: { label: 'Lecture incertaine', tone: 'warning' },
};

/** Réduit la photo (≤ 1600 px, JPEG) pour alléger l'envoi. */
const loadImage = (file: File): Promise<{ base64: string; mimeType: string; preview: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve({ base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg', preview: dataUrl });
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale >= 1) return resolve({ base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg', preview: dataUrl });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve({ base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg', preview: dataUrl });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: out.split(',')[1], mimeType: 'image/jpeg', preview: out });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

/** Texte libre attendu par la page d'ajout (« Pommard 1er Cru Rugiens 2018 »). */
const ocrToAddText = (r: OcrResult) => {
  const parts = [r.producer, r.appellation && r.appellation !== r.name ? r.appellation : null, r.name, r.cuvee && r.cuvee !== r.name ? r.cuvee : null, r.vintage];
  const seen = new Set<string>();
  return parts.filter(p => {
    if (p == null || p === '') return false;
    const k = String(p).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(' ');
};

export const OcrTool: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<OcrResult | null>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setExtracted(null);
    try {
      const img = await loadImage(file);
      setPreview(img.preview);
      setExtracted(await extractWineFromImage(img.base64, img.mimeType));
    } catch (err) {
      toast.error(`Lecture de l'étiquette impossible : ${errMsg(err)}`);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const addText = extracted ? ocrToAddText(extracted) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addText);
      toast.success('Texte copié : collez-le dans le champ d’ajout');
    } catch {
      toast.error('Copie impossible : sélectionnez le texte manuellement');
    }
  };

  const fields: [string, React.ReactNode][] = extracted ? ([
    ['Producteur', extracted.producer],
    ['Vin', extracted.name],
    ['Cuvée', extracted.cuvee],
    ['Millésime', extracted.vintage],
    ['Appellation', extracted.appellation],
    ['Région', extracted.region],
    ['Pays', extracted.country],
    ['Couleur', extracted.type ? typeLabel(extracted.type) : null],
    ['Degré', extracted.abv != null ? `${String(extracted.abv).replace('.', ',')} %` : null],
    ['Format', extracted.format],
  ] as [string, React.ReactNode][]).filter(([, v]) => v != null && v !== '') : [];

  return (
    <div>
      <ToolIntro tool="etiquette" />
      <label className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center cursor-pointer hover:bg-stone-100 hover:border-wine-300 transition-colors focus-within:ring-2 focus-within:ring-wine-600/40 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="sr-only"
          disabled={loading}
        />
        <Camera className="w-7 h-7 text-stone-500" />
        <span className="text-sm text-stone-700">{extracted ? 'Scanner une autre étiquette' : 'Prendre ou choisir une photo'}</span>
        <span className="mono text-[10px] tracking-widest text-stone-400 uppercase">Étiquette de face, bien éclairée</span>
      </label>

      {loading && <AiLoading className="mt-4" label="Lecture de l'étiquette…" hint="Quelques secondes" />}

      {extracted && !loading && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4">
          {preview && <img src={preview} alt="Étiquette scannée" className="w-28 sm:w-full rounded-md border border-stone-200 object-cover" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <MonoLabel>Détecté</MonoLabel>
              <Badge tone={CONFIDENCE[extracted.confidence]?.tone || 'neutral'}>{CONFIDENCE[extracted.confidence]?.label || extracted.confidence}</Badge>
            </div>
            {fields.length === 0 ? (
              <div className="serif-it text-stone-400 mt-2">Rien de lisible sur cette photo.</div>
            ) : (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {fields.map(([l, v]) => <Clue key={l} label={l} value={v} />)}
              </dl>
            )}
            {extracted.grape_varieties?.length > 0 && (
              <div className="mt-3">
                <div className="mono text-[10px] tracking-widest text-stone-500 uppercase">Cépages</div>
                <div className="flex flex-wrap gap-1 mt-1">{extracted.grape_varieties.map(g => <Badge key={g}>{g}</Badge>)}</div>
              </div>
            )}
            {extracted.notes && <p className="mt-3 text-sm text-stone-600 italic">{extracted.notes}</p>}

            {addText && (
              <div className="mt-4 rounded-md border border-stone-200 p-3">
                <MonoLabel>À coller dans « Ajouter un vin »</MonoLabel>
                <div className="serif text-base text-stone-900 mt-1 select-all break-words">{addText}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={copy}><Copy className="w-4 h-4" /> Copier</Button>
                  <Button onClick={() => navigate('/add-wine', { state: { text: addText, prefill: { producer: extracted.producer || undefined, type: extracted.type || undefined, vintage: extracted.vintage || undefined } } })}>Créer la fiche <ArrowRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
