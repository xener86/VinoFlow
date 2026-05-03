// Bottom navigation for mobile (visible only on small screens).
// 5 primary tabs aligned with the desktop sidebar.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, List, Plus, Sparkles, TrendingUp } from 'lucide-react';

interface TabProps {
  to: string;
  icon: React.FC<any>;
  label: string;
  active: boolean;
  highlight?: boolean;
}

const Tab: React.FC<TabProps> = ({ to, icon: Icon, label, active, highlight }) => (
  <Link
    to={to}
    className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 ${
      highlight
        ? 'text-white'
        : active
          ? 'text-wine-700 dark:text-wine-500'
          : 'text-stone-500 dark:text-stone-400'
    }`}
  >
    <span
      className={`flex items-center justify-center ${
        highlight
          ? 'bg-wine-700 hover:bg-wine-800 w-10 h-10 rounded-full text-white shadow-md -mt-4 mb-0.5'
          : ''
      }`}
    >
      <Icon className={`${highlight ? 'w-5 h-5' : 'w-5 h-5'}`} />
    </span>
    <span className="text-[10px] mono tracking-widest">{label}</span>
  </Link>
);

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-2 flex items-center pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
    >
      <Tab to="/" icon={LayoutDashboard} label="ACCUEIL" active={isActive('/')} />
      <Tab to="/cave" icon={List} label="CAVE" active={isActive('/cave')} />
      <Tab to="/add-wine" icon={Plus} label="" active={false} highlight />
      <Tab to="/sommelier" icon={Sparkles} label="SOMM." active={isActive('/sommelier')} />
      <Tab to="/insights" icon={TrendingUp} label="INSIGHTS" active={isActive('/insights')} />
    </nav>
  );
};
