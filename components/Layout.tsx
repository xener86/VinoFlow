
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wine, PlusCircle, Sparkles, Settings as SettingsIcon, BarChart3, Map, GlassWater, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { signOut } from '../services/supabase';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
      await signOut();
      navigate('/login');
  };

  const toggleTheme = () => {
      if (theme === 'dark') setTheme('light');
      else if (theme === 'light') setTheme('system');
      else setTheme('dark');
  };

  const ThemeIcon = () => {
      if (theme === 'dark') return <Moon size={18} />;
      if (theme === 'light') return <Sun size={18} />;
      return <Monitor size={18} />;
  };

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => (
    <Link 
      to={to} 
      className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
        isActive(to) 
        ? 'text-wine-700 dark:text-wine-500' 
        : 'text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300'
      }`}
    >
      <Icon size={22} strokeWidth={isActive(to) ? 2.5 : 2} />
      <span className="text-[9px] font-medium tracking-wide uppercase">{label}</span>
    </Link>
  );

  return (
    <div className="flex flex-col h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans overflow-hidden transition-colors duration-300">
      {/* Top Header */}
      <header className="h-16 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between px-6 bg-white/80 dark:bg-stone-900/50 backdrop-blur-md z-10">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-full bg-wine-100 dark:bg-wine-900 flex items-center justify-center text-wine-700 dark:text-wine-400 group-hover:scale-110 transition-transform shadow-sm">
            <Wine size={18} />
          </div>
          <h1 className="text-xl font-serif tracking-wide text-stone-800 dark:text-stone-100">
            <span className="font-bold">Vino</span><span className="italic font-normal text-wine-700 dark:text-wine-500">Flow</span>
          </h1>
        </Link>
        <div className="flex gap-2 items-center">
             <button 
                onClick={toggleTheme}
                className="p-2 rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200 transition-colors"
                title="Changer de thème"
             >
                 <ThemeIcon />
             </button>
             
             <Link to="/analytics" className={`p-2 rounded-full transition-colors ${isActive('/analytics') ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
                <BarChart3 size={20} />
             </Link>
             
             <Link to="/settings" className={`p-2 rounded-full transition-colors ${isActive('/settings') ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'}`}>
                <SettingsIcon size={20} />
             </Link>
             
             <button onClick={handleLogout} className="p-2 rounded-full text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ml-1 transition-colors" title="Déconnexion">
                 <LogOut size={18} />
             </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 scroll-smooth">
        <div className="max-w-4xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="h-20 border-t border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-xl fixed bottom-0 w-full z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none">
        <div className="grid grid-cols-5 h-full max-w-4xl mx-auto">
          <NavItem to="/" icon={Wine} label="Cave" />
          <NavItem to="/map" icon={Map} label="Plan" />
          <NavItem to="/add" icon={PlusCircle} label="Ajout" />
          <NavItem to="/bar" icon={GlassWater} label="Bar" />
          <NavItem to="/sommelier" icon={Sparkles} label="Sommelier" />
        </div>
      </nav>
    </div>
  );
};
