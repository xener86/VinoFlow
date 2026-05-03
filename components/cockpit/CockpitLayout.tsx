// Main shell of the new Cockpit design.
// Wraps every protected page with the top status strip, the left sidebar,
// and the page header with breadcrumb / search / quick add.

import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { useWines } from '../../hooks/useWines';
import { useWishlist } from '../../hooks/useWishlist';
import { TopStrip } from './TopStrip';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { BottomNav } from './BottomNav';

interface CockpitLayoutProps {
  children?: React.ReactNode;
}

export const CockpitLayout: React.FC<CockpitLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const { wines } = useWines();
  const { items: wishlist } = useWishlist();
  const totalBottles = wines.reduce((sum, w) => sum + w.inventoryCount, 0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K to open the command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="min-h-screen bg-cream-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <TopStrip />
      <div className="flex">
        {/* Sidebar visible only on md+ screens (tablet/desktop) */}
        <div className="hidden md:block">
          <Sidebar
            totalWines={totalBottles}
            wishlistCount={wishlist?.length ?? 0}
          />
        </div>
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {/* Top bar: search + quick add (page title comes from each page) */}
          <div className="px-4 md:px-7 py-3 md:py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center gap-2 md:gap-3 sticky top-0 z-30">
            {/* Mobile brand */}
            <Link to="/" className="md:hidden serif-it text-xl text-stone-900 dark:text-white mr-1">VinoFlow</Link>
            <div className="flex-1" />
            <button
              onClick={() => setPaletteOpen(true)}
              className="h-9 px-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300"
              aria-label="Recherche universelle"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Cherche</span>
              <span className="hidden md:inline mono text-[10px] text-stone-500 px-1.5 py-0.5 rounded border border-stone-300 dark:border-stone-700 ml-1.5">⌘K</span>
            </button>
            <Link
              to="/add-wine"
              className="hidden md:flex h-9 px-3.5 rounded-md bg-wine-700 hover:bg-wine-800 text-white text-sm font-medium items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter
            </Link>
          </div>

          {/* Page content */}
          <div className="p-4 md:p-5">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>

      <BottomNav />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
};
