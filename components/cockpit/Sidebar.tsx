// Left sidebar of the Cockpit shell.
// Brand, primary nav (3 sections), shortcuts, and a small Pasteur quote.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, List, Sparkles, TrendingUp,
  Heart, BookOpen, Globe, Wand2, Award, Settings as SettingsIcon, LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface NavItemProps {
  to: string;
  icon: React.FC<any>;
  label: string;
  badge?: string | number;
  active?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, badge, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors ${
      active
        ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white ring-1 ring-stone-200 dark:ring-stone-700'
        : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
    }`}
  >
    <Icon className="w-3.5 h-3.5" />
    <span className="flex-1">{label}</span>
    {badge != null && <span className="mono text-[10px] text-stone-500">{badge}</span>}
  </Link>
);

const ShortcutItem: React.FC<{ to: string; icon: React.FC<any>; label: string; badge?: string | number }> = ({ to, icon: Icon, label, badge }) => (
  <Link
    to={to}
    className="flex items-center gap-2.5 px-2 py-1 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
  >
    <Icon className="w-3 h-3" />
    <span className="flex-1">{label}</span>
    {badge != null && <span className="mono text-[10px] text-stone-500">{badge}</span>}
  </Link>
);

interface SidebarProps {
  totalWines?: number;
  insightsCount?: number;
  wishlistCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ totalWines, insightsCount, wishlistCount }) => {
  const location = useLocation();
  const { signOut } = useAuth();
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 py-5 px-3 flex flex-col min-h-[calc(100vh-2.25rem)]">
      {/* Brand */}
      <div className="px-2 mb-6">
        <div className="serif-it text-2xl text-stone-900 dark:text-white leading-none">VinoFlow</div>
        <div className="mono text-[10px] text-stone-500 mt-1 tracking-widest">CELLAR.OS</div>
      </div>

      {/* Primary navigation */}
      <div className="mono text-[10px] text-stone-500 px-2 mb-2 tracking-widest">NAVIGATION</div>
      <nav className="space-y-1">
        <NavItem to="/" icon={LayoutDashboard} label="Tableau de bord" active={isActive('/')} />
        <NavItem to="/cave" icon={List} label="Cave" badge={totalWines} active={isActive('/cave')} />
        <NavItem to="/sommelier" icon={Sparkles} label="Sommelier" active={isActive('/sommelier')} />
        <NavItem to="/insights" icon={TrendingUp} label="Insights" badge={insightsCount} active={isActive('/insights')} />
      </nav>

      {/* Shortcuts */}
      <div className="mono text-[10px] text-stone-500 px-2 mb-2 tracking-widest mt-6">RACCOURCIS</div>
      <nav className="space-y-1">
        <ShortcutItem to="/wishlist" icon={Heart} label="Wishlist" badge={wishlistCount} />
        <ShortcutItem to="/journal" icon={BookOpen} label="Journal" />
        <ShortcutItem to="/regions" icon={Globe} label="Régions" />
        <ShortcutItem to="/sommelier-tools" icon={Wand2} label="Outils sommelier" />
      </nav>

      {/* Spacer to push footer down */}
      <div className="flex-1" />

      {/* Footer: settings + logout + Pasteur */}
      <div className="px-2 pt-5 mt-5 border-t border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/settings" className="text-stone-500 hover:text-stone-900 dark:hover:text-white" title="Paramètres" aria-label="Paramètres">
            <SettingsIcon className="w-4 h-4" />
          </Link>
          <button onClick={() => signOut()} className="text-stone-500 hover:text-wine-700" title="Déconnexion" aria-label="Déconnexion">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="serif-it text-stone-700 dark:text-stone-300 text-sm leading-snug">
          « Le vin est la plus saine et la plus hygiénique des boissons. »
        </div>
        <div className="mono text-[10px] text-stone-400 mt-2 tracking-widest">— L. PASTEUR</div>
      </div>
    </aside>
  );
};
