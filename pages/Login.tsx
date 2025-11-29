import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail, saveSupabaseConfig } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Wine, Lock, Mail, Server, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { isConfigured, refreshUser } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Config Form State
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
        await refreshUser(); // Rafraîchit l'utilisateur dans le contexte
      } else {
        await signUpWithEmail(email, password);
        await refreshUser(); // Rafraîchit l'utilisateur dans le contexte
        alert("Compte créé avec succès !");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !key) {
      setError("URL et Clé requises");
      return;
    }
    saveSupabaseConfig(url, key);
    window.location.reload(); // Force reload to init client in Context
  };

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4">
         <div className="bg-white dark:bg-stone-900 p-8 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-md animate-fade-in">
             <div className="flex flex-col items-center mb-6">
                 <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3">
                     <Server size={24} />
                 </div>
                 <h2 className="text-2xl font-serif text-stone-900 dark:text-white">Configuration Système</h2>
                 <p className="text-stone-500 text-sm text-center mt-2">
                     Connectez VinoFlow à votre serveur d'authentification.
                 </p>
             </div>

             <form onSubmit={handleConfig} className="space-y-4">
                 <div>
                     <label className="text-xs uppercase text-stone-500 font-bold">URL d'authentification</label>
                     <input 
                       type="text" 
                       value={url}
                       onChange={e => setUrl(e.target.value)}
                       placeholder="https://supabase-auth.lauziere17.com"
                       className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white mt-1 focus:border-indigo-500 outline-none"
                     />
                 </div>
                 <div>
                     <label className="text-xs uppercase text-stone-500 font-bold">Clé API</label>
                     <input 
                       type="password" 
                       value={key}
                       onChange={e => setKey(e.target.value)}
                       placeholder="eyJh..."
                       className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white mt-1 focus:border-indigo-500 outline-none"
                     />
                 </div>
                 {error && <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-900/50">{error}</div>}
                 
                 <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all">
                     Connecter
                 </button>
                 <p className="text-xs text-stone-500 text-center mt-4">
                     Ces informations sont stockées localement dans votre navigateur.
                 </p>
             </form>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-wine-100 dark:bg-wine-900/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-100 dark:bg-indigo-900/10 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-white dark:bg-stone-900 p-8 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
           <div className="w-16 h-16 bg-wine-50 dark:bg-wine-900/20 rounded-full flex items-center justify-center text-wine-600 dark:text-wine-500 mx-auto mb-4 border border-wine-100 dark:border-wine-500/20">
              <Wine size={32} />
           </div>
           <h1 className="text-3xl font-serif text-stone-900 dark:text-white mb-2">VinoFlow</h1>
           <p className="text-stone-500 dark:text-stone-400">Votre sommelier personnel intelligent.</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
           <div className="space-y-1">
               <div className="relative">
                   <Mail className="absolute left-3 top-3.5 text-stone-400" size={18} />
                   <input 
                     type="email" 
                     value={email}
                     onChange={e => setEmail(e.target.value)}
                     placeholder="Email"
                     required
                     className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl py-3 pl-10 pr-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none transition-all"
                   />
               </div>
           </div>
           <div className="space-y-1">
               <div className="relative">
                   <Lock className="absolute left-3 top-3.5 text-stone-400" size={18} />
                   <input 
                     type="password" 
                     value={password}
                     onChange={e => setPassword(e.target.value)}
                     placeholder="Mot de passe"
                     required
                     minLength={6}
                     className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl py-3 pl-10 pr-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none transition-all"
                   />
               </div>
           </div>

           {error && (
               <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-300 p-3 rounded-lg text-sm flex items-center gap-2">
                   <AlertCircle size={16} />
                   {error}
               </div>
           )}

           <button 
             type="submit" 
             disabled={loading}
             className="w-full bg-wine-600 hover:bg-wine-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-wine-500/30 dark:shadow-wine-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? 'Se Connecter' : 'S\'inscrire')}
           </button>
        </form>

        <div className="mt-6 text-center">
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-stone-500 hover:text-stone-800 dark:hover:text-white text-sm transition-colors"
            >
                {isLogin ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
            </button>
        </div>
      </div>
    </div>
  );
};