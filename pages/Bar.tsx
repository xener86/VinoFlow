// Bar — inventaire des spiritueux + recettes de cocktails (port Cockpit).
// Onglets : Mon bar (stock, niveau restant) / Cocktails (recettes locales,
// recherche TheCocktailDB + import, création par le barman IA, mode soirée).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, Plus, GlassWater, CheckCircle2, PartyPopper, Loader2, Gem, Sparkles, Trash2, Download, Minus,
} from 'lucide-react';
import { saveSpirit, saveCocktail, deleteSpirit, enrichSpirit, createCocktail } from '../services/storageService';
import { Spirit, SpiritType, CocktailRecipe } from '../types';
import { searchCocktailsByName } from '../services/cocktailDbService';
import { useSpirits } from '../hooks/useSpirits';
import { useCocktails } from '../hooks/useCocktails';
import {
  Button, Badge, Card, MonoLabel, Skeleton, Input, Textarea, Tabs, Modal, EmptyState, AiLoading,
} from '../components/cockpit/primitives';
import { useToast, useConfirm } from '../components/cockpit/feedback';
import { spiritLabel, spiritDot, LevelSlider } from '../components/bar/spiritMeta';

type Tab = 'stock' | 'cocktails';

const normalizeCategory = (category: string): string => {
  const normalized = category.toLowerCase();
  if (normalized === 'rhum') return 'rum';
  if (normalized === 'whiskey') return 'whisky';
  return normalized;
};

const COCKTAIL_CATEGORY: Record<string, string> = {
  CLASSIC: 'Classique', MODERN: 'Moderne', TIKI: 'Tiki', SOUR: 'Sour', HIGHBALL: 'Highball', NON_ALCOHOLIC: 'Sans alcool',
};
const DIFFICULTY: Record<string, string> = { Easy: 'Facile', Medium: 'Moyen', Hard: 'Difficile' };

const formatAmount = (n: number) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');

const CocktailThumb: React.FC<{ recipe: CocktailRecipe }> = ({ recipe }) => (
  <div className="w-11 h-11 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center overflow-hidden shrink-0">
    {recipe.imageUrl
      ? <img src={recipe.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
      : <GlassWater className="w-4 h-4 text-stone-400" />}
  </div>
);

export const Bar: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirmAction = useConfirm();

  const { spirits, loading: loadingSpirits, refresh: refreshSpirits } = useSpirits();
  const { cocktails, loading: loadingCocktails, refresh: refreshCocktails } = useCocktails();

  // Les hooks repassent en « loading » à chaque refresh : on n'affiche le
  // squelette qu'au premier chargement pour éviter le clignotement.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!loadingSpirits && !loadingCocktails) setReady(true);
  }, [loadingSpirits, loadingCocktails]);

  const [activeTab, setActiveTab] = useState<Tab>('stock');

  // Recherche
  const [searchQuery, setSearchQuery] = useState('');
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<CocktailRecipe[]>([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  // Ajout de spiritueux
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSpiritName, setNewSpiritName] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);

  // Mode soirée
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [selectedPartyCocktails, setSelectedPartyCocktails] = useState<CocktailRecipe[]>([]);
  const [guestCount, setGuestCount] = useState(4);
  const [partyIngredients, setPartyIngredients] = useState<Record<string, number>>({});

  // Barman IA
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Recette ouverte
  const [viewedRecipe, setViewedRecipe] = useState<CocktailRecipe | null>(null);

  // ── Stock ──────────────────────────────────────────────
  const handleInventoryLevelChange = async (spirit: Spirit, newLevel: number) => {
    const updated = { ...spirit, inventoryLevel: Math.max(0, Math.min(100, newLevel)) };
    try {
      await saveSpirit(updated);
    } catch {
      toast.error(`Le niveau de ${spirit.name} n'a pas pu être enregistré.`);
    }
    refreshSpirits();
  };

  const filteredSpirits = useMemo(() => {
    if (!stockSearchQuery.trim()) return spirits;
    const query = stockSearchQuery.toLowerCase().trim();
    const normalizedQuery = normalizeCategory(query);
    return spirits.filter(spirit => {
      const name = spirit.name.toLowerCase();
      const category = spirit.category.toLowerCase();
      const normalizedCategory = normalizeCategory(category);
      const distillery = (spirit.distillery || '').toLowerCase();
      const label = spiritLabel(spirit.category).toLowerCase();
      return (
        name.includes(query) ||
        category.includes(query) ||
        label.includes(query) ||
        distillery.includes(query) ||
        normalizedCategory.includes(normalizedQuery)
      );
    });
  }, [spirits, stockSearchQuery]);

  const handleAddSpirit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSpiritName.trim();
    if (!name || isEnriching) return;

    setIsEnriching(true);
    try {
      const data = await enrichSpirit(name);
      const newSpirit: Spirit = {
        id: crypto.randomUUID(),
        name,
        category: data?.category || SpiritType.OTHER,
        distillery: data?.distillery || 'Inconnue',
        abv: data?.abv || 40,
        format: data?.format || 700,
        description: data?.description || 'Ajouté manuellement',
        producerHistory: data?.producerHistory || '',
        tastingNotes: data?.tastingNotes || '',
        aromaProfile: data?.aromaProfile || [],
        suggestedCocktails: data?.suggestedCocktails || [],
        culinaryPairings: data?.culinaryPairings || [],
        enrichedByAi: !!data,
        addedAt: new Date().toISOString(),
        isOpened: false,
        inventoryLevel: 100,
        isLuxury: false,
      };

      await saveSpirit(newSpirit);
      refreshSpirits();
      setShowAddModal(false);
      setNewSpiritName('');
      const open = { label: 'Voir', onClick: () => navigate(`/spirit/${newSpirit.id}`) };
      if (data) toast.success(`${name} ajouté au bar.`, open);
      else toast.info(`${name} ajouté sans enrichissement IA — complétez la fiche.`, open);
    } catch (error) {
      console.error('Error adding spirit:', error);
      toast.error("L'ajout a échoué. Veuillez réessayer.");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleDeleteSpirit = async (spirit: Spirit) => {
    const ok = await confirmAction({
      title: `Supprimer ${spirit.name} ?`,
      message: 'La bouteille sera définitivement retirée du bar.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSpirit(spirit.id);
      toast.success(`${spirit.name} supprimé.`);
    } catch {
      toast.error('La suppression a échoué.');
    }
    refreshSpirits();
  };

  // ── Cocktails ──────────────────────────────────────────
  const canMakeCocktail = (recipe: CocktailRecipe): boolean => {
    const requiredSpirits = recipe.ingredients.filter(i => i.amount > 10);
    return requiredSpirits.every(req =>
      spirits.some(s => s.name.toLowerCase().includes(req.name.toLowerCase()) ||
        s.category.toLowerCase().includes(req.name.toLowerCase()))
    );
  };

  const localQuery = searchQuery.trim().toLowerCase();
  const matchingCocktails = useMemo(() => {
    if (!localQuery) return cocktails;
    return cocktails.filter(c =>
      c.name.toLowerCase().includes(localQuery) ||
      c.ingredients.some(i => i.name.toLowerCase().includes(localQuery)));
  }, [cocktails, localQuery]);
  const feasible = matchingCocktails.filter(canMakeCocktail);
  const others = matchingCocktails.filter(c => !canMakeCocktail(c));
  const importedIds = useMemo(() => new Set(cocktails.map(c => c.id)), [cocktails]);

  const handleSearchCocktails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearchingApi(true);
    try {
      const results = await searchCocktailsByName(searchQuery.trim());
      setApiResults(results);
      if (results.length === 0) toast.info(`Aucune recette trouvée sur le web pour « ${searchQuery.trim()} ».`);
    } catch {
      toast.error('La recherche de recettes a échoué.');
    } finally {
      setIsSearchingApi(false);
    }
  };

  const handleImportRecipe = async (recipe: CocktailRecipe) => {
    setImportingId(recipe.id);
    try {
      await saveCocktail({ ...recipe, isFavorite: true });
      refreshCocktails();
      toast.success(`${recipe.name} importé dans vos recettes.`);
    } catch {
      toast.error("L'import de la recette a échoué.");
    } finally {
      setImportingId(null);
    }
  };

  const handleAICreate = async () => {
    if (!chatQuery.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const availableIngredients = spirits.filter(s => !s.isLuxury).map(s => s.name);
      const recipe = await createCocktail(availableIngredients, chatQuery);
      if (!recipe) {
        toast.error("Le barman IA n'a pas pu créer de recette. Réessayez.");
        return;
      }
      const fullRecipe: CocktailRecipe = {
        id: crypto.randomUUID(),
        name: recipe.name || 'Création IA',
        category: 'MODERN',
        ingredients: [],
        instructions: [],
        glassType: 'Coupe',
        difficulty: 'Medium',
        prepTime: 5,
        tags: ['AI'],
        source: 'AI',
        isFavorite: true,
        ...(recipe as any),
      };
      await saveCocktail(fullRecipe);
      refreshCocktails();
      setShowAIChat(false);
      setChatQuery('');
      setViewedRecipe(fullRecipe);
      toast.success(`Recette « ${fullRecipe.name} » créée par l'IA.`);
    } catch (error) {
      console.error('AI cocktail error:', error);
      toast.error("Le barman IA n'a pas pu créer de recette. Réessayez.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCalculateParty = () => {
    const totals: Record<string, number> = {};
    selectedPartyCocktails.forEach(c => {
      c.ingredients.forEach(ing => {
        if (!ing.optional) {
          const key = `${ing.name} (${ing.unit})`;
          totals[key] = (totals[key] || 0) + (ing.amount * guestCount);
        }
      });
    });
    setPartyIngredients(totals);
  };

  const togglePartyCocktail = (c: CocktailRecipe) => {
    setSelectedPartyCocktails(prev =>
      prev.some(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]);
    setPartyIngredients({});
  };

  const luxuryCount = spirits.filter(s => s.isLuxury).length;

  // Gestionnaires de fermeture stables : le Modal relance son effet (focus)
  // à chaque changement de onClose. Pas de fermeture pendant un appel IA.
  const busy = useRef({ enriching: false, generating: false });
  busy.current = { enriching: isEnriching, generating: isGenerating };
  const closeAdd = useCallback(() => { if (!busy.current.enriching) setShowAddModal(false); }, []);
  const closeAI = useCallback(() => { if (!busy.current.generating) setShowAIChat(false); }, []);
  const closeParty = useCallback(() => setShowPartyModal(false), []);
  const closeRecipe = useCallback(() => setViewedRecipe(null), []);

  // Le Modal prend le focus à l'ouverture : on le rend ensuite au champ.
  useEffect(() => {
    if (!showAddModal && !showAIChat) return;
    const t = setTimeout(() => {
      document.querySelector<HTMLElement>(showAddModal ? '#add-spirit-form input' : '#ai-cocktail-form textarea')?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [showAddModal, showAIChat]);

  // ── Rendu ──────────────────────────────────────────────
  const renderCocktailRow = (c: CocktailRecipe, canMake: boolean) => (
    <li key={c.id}>
      <button
        onClick={() => setViewedRecipe(c)}
        className="w-full flex items-center gap-3 px-4 md:px-5 py-3 text-left hover:bg-stone-50 active:bg-stone-50"
      >
        <CocktailThumb recipe={c} />
        <div className="flex-1 min-w-0">
          <div className="serif-it text-stone-900 truncate">{c.name}</div>
          <div className="mono text-[10px] tracking-widest text-stone-500 uppercase truncate">
            {[COCKTAIL_CATEGORY[c.category] || c.category, `${c.ingredients.length} ingrédient${c.ingredients.length > 1 ? 's' : ''}`].join(' · ')}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {c.source === 'AI' && <Badge tone="rare">IA</Badge>}
          {canMake
            ? <Badge tone="success"><CheckCircle2 className="w-3 h-3 mr-1" />PRÊT</Badge>
            : <Badge tone="neutral">INCOMPLET</Badge>}
        </div>
      </button>
    </li>
  );

  return (
    <div className="max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
        <div className="min-w-0">
          <MonoLabel>VINOFLOW · BAR</MonoLabel>
          <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">
            {activeTab === 'stock' ? 'Bar · Spiritueux' : 'Bar · Cocktails'}
          </h1>
          <div className="text-[12px] text-stone-500 mt-0.5">
            {spirits.length} bouteille{spirits.length > 1 ? 's' : ''} · {cocktails.length} recette{cocktails.length > 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowPartyModal(true)}>
            <PartyPopper className="w-4 h-4" />Mode soirée
          </Button>
          {activeTab === 'stock' ? (
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4" />Ajouter
            </Button>
          ) : (
            <Button onClick={() => setShowAIChat(true)}>
              <Sparkles className="w-4 h-4" />Barman IA
            </Button>
          )}
        </div>
      </div>

      <Tabs<Tab>
        aria-label="Sections du bar"
        className="mb-5"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'stock', label: 'Mon bar', count: spirits.length },
          { key: 'cocktails', label: 'Cocktails', count: cocktails.length },
        ]}
      />

      {!ready ? (
        <Card className="p-5 space-y-3" aria-busy="true">
          <Skeleton className="h-9 w-full md:w-72" />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </Card>
      ) : activeTab === 'stock' ? (
        // ── ONGLET STOCK ──
        <Card className="overflow-hidden">
          <header className="px-4 md:px-5 py-4 border-b border-stone-200 flex flex-wrap items-center gap-3 bg-stone-50/40">
            <div className="relative w-full md:w-80">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                placeholder="Filtrer… (nom, type, distillerie)"
                aria-label="Filtrer le bar"
                className="h-10 md:h-9 pl-8 pr-3 rounded-md border border-stone-300 bg-white text-sm w-full outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600"
              />
            </div>
            <div className="flex-1" />
            <span className="mono text-[10px] tracking-widest text-stone-500">{filteredSpirits.length} / {spirits.length}</span>
          </header>

          {filteredSpirits.length === 0 ? (
            stockSearchQuery ? (
              <EmptyState title="Aucun spiritueux ne correspond." hint="Ajuster le filtre" />
            ) : (
              <EmptyState
                title="Votre bar est vide."
                hint="L'IA complète la fiche à partir du nom"
                action={<Button onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4" />Ajouter une bouteille</Button>}
              />
            )
          ) : (
            <>
              {/* Mobile : cartes */}
              <ul className="md:hidden divide-y divide-stone-100">
                {filteredSpirits.map(spirit => (
                  <li key={spirit.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className={`mt-2 w-2.5 h-2.5 rounded-full shrink-0 ${spiritDot(spirit.category)}`} />
                      <Link to={`/spirit/${spirit.id}`} className="flex-1 min-w-0 py-0.5 active:opacity-70">
                        <div className="flex items-center gap-1.5">
                          <span className="serif-it text-stone-900 truncate">{spirit.name}</span>
                          {spirit.isLuxury && <Gem className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Collection prestige" />}
                        </div>
                        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase truncate">
                          {[spiritLabel(spirit.category), spirit.distillery, spirit.age, spirit.abv ? `${spirit.abv}%` : null].filter(Boolean).join(' · ')}
                        </div>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSpirit(spirit)}
                        aria-label={`Supprimer ${spirit.name}`}
                        className="-mr-2 -mt-1 text-stone-400 hover:text-wine-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <LevelSlider
                      className="pl-5"
                      value={spirit.inventoryLevel}
                      label={`Niveau restant de ${spirit.name}`}
                      onCommit={(v) => handleInventoryLevelChange(spirit, v)}
                    />
                  </li>
                ))}
              </ul>

              {/* Desktop : tableau */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left font-normal py-2 pl-5"><MonoLabel>Nom</MonoLabel></th>
                    <th className="text-left font-normal py-2"><MonoLabel>Type</MonoLabel></th>
                    <th className="text-left font-normal py-2"><MonoLabel>Distillerie</MonoLabel></th>
                    <th className="text-right font-normal py-2 pr-4"><MonoLabel>ABV</MonoLabel></th>
                    <th className="text-left font-normal py-2 w-56"><MonoLabel>Niveau restant</MonoLabel></th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredSpirits.map(spirit => (
                    <tr key={spirit.id} className="group hover:bg-stone-50/60">
                      <td className="py-2 pl-5 pr-3">
                        <Link to={`/spirit/${spirit.id}`} className="flex items-center gap-2.5 min-w-0 hover:text-wine-700">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${spiritDot(spirit.category)}`} />
                          <span className="serif-it text-stone-900 group-hover:text-wine-700 truncate">{spirit.name}</span>
                          {spirit.isLuxury && <Gem className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Collection prestige" />}
                        </Link>
                        {spirit.aromaProfile?.length > 0 && (
                          <div className="pl-5 mt-0.5 text-[11px] text-stone-500 truncate">{spirit.aromaProfile.slice(0, 3).join(' · ')}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-stone-600">{spiritLabel(spirit.category)}</td>
                      <td className="py-2 pr-3 text-stone-600">
                        {spirit.distillery}{spirit.age ? <span className="text-stone-400"> · {spirit.age}</span> : null}
                      </td>
                      <td className="py-2 pr-4 text-right mono text-xs text-stone-700">{spirit.abv ? `${spirit.abv}%` : '—'}</td>
                      <td className="py-2 pr-3">
                        <LevelSlider
                          value={spirit.inventoryLevel}
                          label={`Niveau restant de ${spirit.name}`}
                          onCommit={(v) => handleInventoryLevelChange(spirit, v)}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSpirit(spirit)}
                          aria-label={`Supprimer ${spirit.name}`}
                          className="text-stone-400 hover:text-wine-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="px-5 py-2 border-t border-stone-200 mono text-[10px] text-stone-500 flex justify-between bg-stone-50/40">
            <span>{filteredSpirits.length} affichés</span>
            <span>{luxuryCount} PRESTIGE</span>
          </div>
        </Card>
      ) : (
        // ── ONGLET COCKTAILS ──
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <header className="px-4 md:px-5 py-4 border-b border-stone-200 bg-stone-50/40">
              <form onSubmit={handleSearchCocktails} className="flex gap-2">
                <div className="relative flex-1 min-w-0 md:max-w-sm">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Recette, ingrédient…"
                    aria-label="Rechercher une recette"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setApiResults([]); }}
                    className="h-10 md:h-9 pl-8 pr-3 rounded-md border border-stone-300 bg-white text-sm w-full outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600"
                  />
                </div>
                <Button type="submit" variant="outline" disabled={!searchQuery.trim() || isSearchingApi}>
                  {isSearchingApi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="hidden sm:inline">Chercher sur le web</span>
                  <span className="sm:hidden">Web</span>
                </Button>
              </form>
            </header>

            <div className="px-4 md:px-5 pt-4 pb-1 flex items-center justify-between">
              <MonoLabel>Faisable avec mon stock</MonoLabel>
              <span className="mono text-[10px] text-stone-400">{feasible.length}</span>
            </div>
            {feasible.length === 0 ? (
              <div className="px-4 md:px-5 pb-4 text-sm text-stone-500 italic">
                {cocktails.length === 0 ? 'Aucune recette enregistrée pour le moment.' : 'Aucune recette réalisable avec le stock actuel.'}
              </div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {feasible.map(c => renderCocktailRow(c, true))}
              </ul>
            )}

            {others.length > 0 && (
              <>
                <div className="px-4 md:px-5 pt-4 pb-1 flex items-center justify-between border-t border-stone-100">
                  <MonoLabel>Autres recettes</MonoLabel>
                  <span className="mono text-[10px] text-stone-400">{others.length}</span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {others.map(c => renderCocktailRow(c, false))}
                </ul>
              </>
            )}

            {cocktails.length === 0 && (
              <EmptyState
                title="Pas encore de cocktails."
                hint="Cherchez une recette ou demandez au barman IA"
                action={<Button onClick={() => setShowAIChat(true)}><Sparkles className="w-4 h-4" />Créer avec l'IA</Button>}
              />
            )}
          </Card>

          {(apiResults.length > 0 || isSearchingApi) && (
            <Card className="overflow-hidden">
              <div className="px-4 md:px-5 py-3 border-b border-stone-200 flex items-center justify-between">
                <MonoLabel>Résultats web · TheCocktailDB</MonoLabel>
                {!isSearchingApi && <span className="mono text-[10px] text-stone-400">{apiResults.length}</span>}
              </div>
              {isSearchingApi ? (
                <div className="p-4 space-y-3" aria-busy="true">
                  {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {apiResults.map(c => {
                    const imported = importedIds.has(c.id);
                    return (
                      <li key={c.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                        <button onClick={() => setViewedRecipe(c)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                          <CocktailThumb recipe={c} />
                          <div className="min-w-0">
                            <div className="serif-it text-stone-900 truncate">{c.name}</div>
                            <div className="text-xs text-stone-500 truncate">{c.ingredients.map(i => i.name).join(', ')}</div>
                          </div>
                        </button>
                        <Button
                          size="sm"
                          variant={imported ? 'ghost' : 'outline'}
                          disabled={imported || importingId === c.id}
                          onClick={() => handleImportRecipe(c)}
                          className="shrink-0"
                        >
                          {importingId === c.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : imported ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                          {imported ? 'Importée' : 'Importer'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Modale : ajout de spiritueux ── */}
      <Modal
        open={showAddModal}
        onClose={closeAdd}
        title="Ajouter au bar"
        subtitle="L'IA remplit automatiquement les détails à partir du nom."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={isEnriching}>Annuler</Button>
            <Button type="submit" form="add-spirit-form" disabled={!newSpiritName.trim() || isEnriching}>
              {isEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isEnriching ? 'Analyse…' : 'Ajouter'}
            </Button>
          </>
        }
      >
        <form id="add-spirit-form" onSubmit={handleAddSpirit} className="space-y-4">
          <Input
            label="Nom du spiritueux"
            value={newSpiritName}
            onChange={(e) => setNewSpiritName(e.target.value)}
            placeholder="ex : Diplomatico Reserva"
            disabled={isEnriching}
          />
          {isEnriching && <AiLoading label="Analyse du spiritueux…" hint="Catégorie, distillerie, arômes" />}
        </form>
      </Modal>

      {/* ── Modale : barman IA ── */}
      <Modal
        open={showAIChat}
        onClose={closeAI}
        title="Le barman IA"
        subtitle="Une recette inédite à partir de votre stock."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAIChat(false)} disabled={isGenerating}>Annuler</Button>
            <Button onClick={handleAICreate} disabled={!chatQuery.trim() || isGenerating}>
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? 'Création…' : 'Générer la recette'}
            </Button>
          </>
        }
      >
        <div id="ai-cocktail-form" className="space-y-4">
          <Textarea
            label="Votre envie"
            rows={4}
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="ex : un cocktail frais à base de gin et de concombre…"
            disabled={isGenerating}
            className="resize-none"
          />
          <div className="flex items-center gap-2 text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
            <Gem className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              {luxuryCount > 0
                ? `${luxuryCount} bouteille${luxuryCount > 1 ? 's' : ''} de prestige ignorée${luxuryCount > 1 ? 's' : ''}.`
                : 'Toutes vos bouteilles peuvent être utilisées.'}
            </span>
          </div>
          {isGenerating && <AiLoading label="Le barman compose votre cocktail…" />}
        </div>
      </Modal>

      {/* ── Modale : mode soirée ── */}
      <Modal
        open={showPartyModal}
        onClose={closeParty}
        title="Mode soirée"
        subtitle="Quantités à prévoir selon le nombre d'invités."
        footer={
          <Button onClick={handleCalculateParty} disabled={selectedPartyCocktails.length === 0}>
            Calculer les besoins
          </Button>
        }
      >
        <div className="space-y-5">
          <div>
            <MonoLabel className="block mb-1.5">Nombre d'invités</MonoLabel>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Moins d'invités" onClick={() => { setGuestCount(g => Math.max(1, g - 1)); setPartyIngredients({}); }}>
                <Minus className="w-4 h-4" />
              </Button>
              <span className="serif text-2xl text-stone-900 w-12 text-center tabular-nums" aria-live="polite">{guestCount}</span>
              <Button variant="outline" size="icon" aria-label="Plus d'invités" onClick={() => { setGuestCount(g => Math.min(50, g + 1)); setPartyIngredients({}); }}>
                <Plus className="w-4 h-4" />
              </Button>
              <input
                type="range" min={1} max={50}
                value={guestCount}
                aria-label="Nombre d'invités"
                onChange={(e) => { setGuestCount(Number(e.target.value)); setPartyIngredients({}); }}
                className="flex-1 min-w-0 ml-2 accent-wine-700"
              />
            </div>
          </div>

          <div>
            <MonoLabel className="block mb-1.5">Cocktails servis</MonoLabel>
            {cocktails.length === 0 ? (
              <p className="text-sm text-stone-500 italic">Aucune recette enregistrée.</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto rounded-md border border-stone-200 divide-y divide-stone-100">
                {cocktails.map(c => {
                  const isSelected = selectedPartyCocktails.some(sel => sel.id === c.id);
                  return (
                    <li key={c.id}>
                      <button
                        aria-pressed={isSelected}
                        onClick={() => togglePartyCocktail(c)}
                        className={`w-full min-h-11 px-3 py-2 flex items-center justify-between gap-3 text-left text-sm transition-colors ${
                          isSelected ? 'bg-wine-50 text-wine-800' : 'text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <span className="truncate">{c.name}</span>
                        {isSelected
                          ? <CheckCircle2 className="w-4 h-4 text-wine-700 shrink-0" />
                          : <span className="w-4 h-4 rounded-full border border-stone-300 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {Object.keys(partyIngredients).length > 0 && (
            <div className="rounded-md border border-stone-200 bg-stone-50/60 p-4 animate-fade-in">
              <MonoLabel className="block mb-2">Ingrédients nécessaires · {guestCount} invité{guestCount > 1 ? 's' : ''}</MonoLabel>
              <ul className="divide-y divide-stone-200 text-sm">
                {Object.entries(partyIngredients).map(([name, amount]) => (
                  <li key={name} className="flex justify-between gap-3 py-1.5">
                    <span className="text-stone-700 min-w-0 break-words">{name}</span>
                    <span className="mono text-stone-900 shrink-0">{formatAmount(amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Modale : recette ── */}
      <Modal
        open={!!viewedRecipe}
        onClose={closeRecipe}
        title={viewedRecipe?.name ?? ''}
        subtitle={viewedRecipe ? [
          COCKTAIL_CATEGORY[viewedRecipe.category] || viewedRecipe.category,
          viewedRecipe.glassType,
          DIFFICULTY[viewedRecipe.difficulty] || viewedRecipe.difficulty,
          viewedRecipe.prepTime ? `${viewedRecipe.prepTime} min` : null,
        ].filter(Boolean).join(' · ') : undefined}
        footer={viewedRecipe && !importedIds.has(viewedRecipe.id) ? (
          <Button onClick={() => handleImportRecipe(viewedRecipe)} disabled={importingId === viewedRecipe.id}>
            {importingId === viewedRecipe.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Importer
          </Button>
        ) : undefined}
      >
        {viewedRecipe && (
          <div className="space-y-5">
            {viewedRecipe.imageUrl && (
              <img src={viewedRecipe.imageUrl} alt="" className="w-full max-h-56 object-cover rounded-md border border-stone-200" />
            )}
            {(viewedRecipe as any).description && (
              <p className="text-sm text-stone-700 leading-relaxed">{(viewedRecipe as any).description}</p>
            )}
            <div>
              <MonoLabel className="block mb-2">Ingrédients</MonoLabel>
              {viewedRecipe.ingredients.length === 0 ? (
                <p className="text-sm text-stone-500 italic">Aucun ingrédient détaillé.</p>
              ) : (
                <ul className="divide-y divide-stone-100 text-sm">
                  {viewedRecipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5">
                      <span className="text-stone-800 min-w-0 break-words">
                        {ing.name}{ing.optional && <span className="text-stone-400"> (facultatif)</span>}
                      </span>
                      <span className="mono text-xs text-stone-600 shrink-0">{ing.amount ? `${formatAmount(ing.amount)} ${ing.unit}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {viewedRecipe.instructions?.length > 0 && (
              <div>
                <MonoLabel className="block mb-2">Préparation</MonoLabel>
                <ol className="space-y-2 text-sm text-stone-700">
                  {viewedRecipe.instructions.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mono text-[11px] text-wine-700 mt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                      <span className="leading-relaxed">{step.replace(/^\s*\d+[.)]\s*/, '')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
