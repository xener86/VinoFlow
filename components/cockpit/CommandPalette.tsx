// Command palette ⌘K — universal search across wines, pages, and actions.
// Triggered by Cmd/Ctrl + K from anywhere in the app.

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Sparkles, List, TrendingUp, Plus, Wine as WineIcon, Heart, BookOpen,
  Globe, Settings as SettingsIcon, LayoutDashboard, Wand2,
} from 'lucide-react';
import { useWines } from '../../hooks/useWines';

interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: React.FC<any>;
  group: 'navigation' | 'wines' | 'actions';
  exec: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { wines } = useWines();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build the list of actions
  const actions: PaletteAction[] = useMemo(() => {
    const navActions: PaletteAction[] = [
      { id: 'nav:home', label: 'Tableau de bord', icon: LayoutDashboard, group: 'navigation', exec: () => navigate('/') },
      { id: 'nav:cave', label: 'Cave', icon: List, group: 'navigation', exec: () => navigate('/cave') },
      { id: 'nav:somm', label: 'Sommelier', icon: Sparkles, group: 'navigation', exec: () => navigate('/sommelier') },
      { id: 'nav:insights', label: 'Insights', icon: TrendingUp, group: 'navigation', exec: () => navigate('/insights') },
      { id: 'nav:tools', label: 'Outils sommelier', icon: Wand2, group: 'navigation', exec: () => navigate('/sommelier-tools') },
      { id: 'nav:wishlist', label: 'Wishlist', icon: Heart, group: 'navigation', exec: () => navigate('/wishlist') },
      { id: 'nav:journal', label: 'Journal', icon: BookOpen, group: 'navigation', exec: () => navigate('/journal') },
      { id: 'nav:regions', label: 'Régions', icon: Globe, group: 'navigation', exec: () => navigate('/regions') },
      { id: 'nav:settings', label: 'Paramètres', icon: SettingsIcon, group: 'navigation', exec: () => navigate('/settings') },
    ];

    const fastActions: PaletteAction[] = [
      { id: 'act:add', label: 'Ajouter un vin', icon: Plus, group: 'actions', exec: () => navigate('/add-wine'), hint: 'Saisie libre + IA' },
      { id: 'act:taste', label: 'Noter une dégustation', icon: WineIcon, group: 'actions', exec: () => navigate('/tasting'), hint: 'Express en 40s' },
    ];

    const wineActions: PaletteAction[] = wines
      .filter(w => (w.inventoryCount || 0) > 0)
      .map(w => ({
        id: `wine:${w.id}`,
        label: `${w.name}${w.vintage ? ' · ' + w.vintage : ''}`,
        hint: [w.producer, w.region, `×${w.inventoryCount}`].filter(Boolean).join(' · '),
        icon: WineIcon,
        group: 'wines',
        exec: () => navigate(`/wine/${w.id}`),
      }));

    return [...navActions, ...fastActions, ...wineActions];
  }, [wines, navigate]);

  // Fuzzy filter
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      // Show 9 nav + 2 fast + 8 first wines
      return [
        ...actions.filter(a => a.group === 'navigation'),
        ...actions.filter(a => a.group === 'actions'),
        ...actions.filter(a => a.group === 'wines').slice(0, 8),
      ];
    }
    return actions.filter(a => {
      const haystack = `${a.label} ${a.hint || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [actions, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) {
        item.exec();
        onClose();
      }
    }
  };

  if (!open) return null;

  // Group filtered results
  const grouped = filtered.reduce((acc: Record<string, PaletteAction[]>, a) => {
    if (!acc[a.group]) acc[a.group] = [];
    acc[a.group].push(a);
    return acc;
  }, {});

  const GROUP_LABELS: Record<string, string> = {
    navigation: 'Navigation',
    actions: 'Actions',
    wines: 'Vins',
  };

  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-start justify-center pt-[20vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-stone-900 rounded-lg shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-stone-200 dark:border-stone-800">
          <Search className="w-4 h-4 text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Tape un nom de vin, une page, une action…"
            className="flex-1 bg-transparent outline-none text-sm text-stone-900 dark:text-white placeholder:text-stone-400"
          />
          <kbd className="mono text-[10px] text-stone-500 px-1.5 py-0.5 rounded border border-stone-300 dark:border-stone-700">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="text-center text-stone-500 italic py-8 text-sm">Aucun résultat.</div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 pt-3 pb-1 mono text-[10px] tracking-widest uppercase text-stone-500">
                  {GROUP_LABELS[group]}
                </div>
                {items.map(item => {
                  const idx = runningIdx++;
                  const isActive = idx === activeIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { item.exec(); onClose(); }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        isActive ? 'bg-wine-50 dark:bg-wine-900/20 text-wine-800 dark:text-wine-300' : 'text-stone-800 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-wine-700' : 'text-stone-400'}`} />
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {item.hint && <span className="text-xs text-stone-500 truncate max-w-[40%]">{item.hint}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-200 dark:border-stone-800 px-4 py-2 mono text-[10px] text-stone-500 flex items-center gap-3">
          <span><kbd className="px-1 rounded border border-stone-300 dark:border-stone-700">↑↓</kbd> naviguer</span>
          <span><kbd className="px-1 rounded border border-stone-300 dark:border-stone-700">↵</kbd> ouvrir</span>
          <span><kbd className="px-1 rounded border border-stone-300 dark:border-stone-700">esc</kbd> fermer</span>
        </div>
      </div>
    </div>
  );
};
