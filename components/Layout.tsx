import React, { useEffect, useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { Wine, Map, PlusCircle, FileText, GlassWater, BookOpen, BarChart3, Settings, LogOut, Moon, Sun, Monitor, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export const Layout: React.FC = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [tastingCount, setTastingCount] = useState(0);

  useEffect(() => {
    // Calculate wines without tasting notes
    const winesData = localStorage.getItem('vf_wines');
    const wines = winesData ? JSON.parse(winesData) : [];
    const tastingNotes = JSON.parse(localStorage.getItem('vf_tasting_notes') || '[]');
    const winesWithoutNotes = wines.filter((wine: any) => 
      !tastingNotes.some((note: any) => note.wineId === wine.id)
    );
    setTastingCount(winesWithoutNotes.length);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={18} />;
      case 'dark': return <Moon size={18} />;
      case 'system': return <Monitor size={18} />;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-wine-600 to-wine-800 dark:from-wine-500 dark:to-wine-700 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Wine className="text-white" size={22} />
            </div>
            <span className="text-xl font-serif font-bold bg-gradient-to-r from-wine-600 to-wine-800 dark:from-wine-400 dark:to-wine-600 bg-clip-text text-transparent">
              VinoFlow
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Notes Button - Déplacé en haut */}
            <Link
              to="/tasting"
              className={`p-2 rounded-lg transition-colors relative ${
                isActive('/tasting')
                  ? 'bg-wine-100 dark:bg-wine-900/30 text-wine-600 dark:text-wine-400'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="Notes de Dégustation"
            >
              <FileText size={20} />
              {tastingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {tastingCount}
                </span>
              )}
            </Link>

            {/* Journal Button */}
            <Link
              to="/journal"
              className={`p-2 rounded-lg transition-colors ${
                isActive('/journal')
                  ? 'bg-wine-100 dark:bg-wine-900/30 text-wine-600 dark:text-wine-400'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="Journal de Cave"
            >
              <BookOpen size={20} />
            </Link>

            {/* Analytics Button */}
            <Link
              to="/analytics"
              className={`p-2 rounded-lg transition-colors ${
                isActive('/analytics')
                  ? 'bg-wine-100 dark:bg-wine-900/30 text-wine-600 dark:text-wine-400'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="Statistiques"
            >
              <BarChart3 size={20} />
            </Link>

            {/* Theme Toggle */}
            <button
              onClick={cycleTheme}
              className="p-2 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              title={`Thème: ${theme}`}
            >
              {getThemeIcon()}
            </button>

            {/* Settings Button */}
            <Link
              to="/settings"
              className={`p-2 rounded-lg transition-colors ${
                isActive('/settings')
                  ? 'bg-wine-100 dark:bg-wine-900/30 text-wine-600 dark:text-wine-400'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
              title="Paramètres"
            >
              <Settings size={20} />
            </Link>

            {/* Logout Button */}
            <button
              onClick={() => signOut()}
              className="p-2 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Déconnexion"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl border-t border-stone-200 dark:border-stone-800 pb-safe">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-around">
          
          {/* Cave */}
          <Link
            to="/"
            className={`flex flex-col items-center gap-1 transition-colors ${
              isActive('/')
                ? 'text-wine-600 dark:text-wine-400'
                : 'text-stone-500 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <Wine size={24} className={isActive('/') ? 'scale-110' : ''} />
            <span className="text-xs font-medium">Cave</span>
          </Link>

          {/* Plan */}
          <Link
            to="/cellar-map"
            className={`flex flex-col items-center gap-1 transition-colors ${
              isActive('/cellar-map')
                ? 'text-wine-600 dark:text-wine-400'
                : 'text-stone-500 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <Map size={24} className={isActive('/cellar-map') ? 'scale-110' : ''} />
            <span className="text-xs font-medium">Plan</span>
          </Link>

          {/* Add */}
          <Link
            to="/add-wine"
            className="flex flex-col items-center gap-1 -mt-6"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-wine-600 to-wine-800 dark:from-wine-500 dark:to-wine-700 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
              <PlusCircle size={28} className="text-white" />
            </div>
            <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Ajouter</span>
          </Link>

          {/* Sommelier - Déplacé en bas */}
          <Link
            to="/sommelier"
            className={`flex flex-col items-center gap-1 transition-colors ${
              isActive('/sommelier')
                ? 'text-purple-600 dark:text-purple-400'
                : 'text-stone-500 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <Sparkles size={24} className={isActive('/sommelier') ? 'scale-110' : ''} />
            <span className="text-xs font-medium">Sommelier</span>
          </Link>

          {/* Bar */}
          <Link
            to="/bar"
            className={`flex flex-col items-center gap-1 transition-colors ${
              isActive('/bar')
                ? 'text-wine-600 dark:text-wine-400'
                : 'text-stone-500 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <GlassWater size={24} className={isActive('/bar') ? 'scale-110' : ''} />
            <span className="text-xs font-medium">Bar</span>
          </Link>

        </div>
      </nav>
    </div>
  );
};