import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { customAuth } from '../services/customAuth'; // ✅ Nouveau service d'auth
import { saveSupabaseConfig } from '../services/supabase'; // Pour compatibilité AuthContext
import { useAuth } from '../contexts/AuthContext';
import { Wine, Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Auto-configuration au montage pour satisfaire AuthContext
  useEffect(() => {
    // On sauvegarde une config "fictive" ou par défaut pour que isConfigured passe à true
    // car customAuth gère maintenant la connexion en interne avec ses propres clés.
    // Cela évite de rester bloqué sur l'écran de config si le contexte vérifie le localStorage.
    if (!localStorage.getItem('vf_supabase_url')) {
        saveSupabaseConfig('https://vinoflow-auth.auto', 'auto-configured');
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // ✅ Utilisation de customAuth pour la connexion
        await customAuth.signIn(email, password);
        await refreshUser(); // Rafraîchir le contexte utilisateur
        navigate('/'); // Redirection vers le Dashboard
      } else {
        // ✅ Utilisation de customAuth pour l'inscription
        await customAuth.signUp(email, password);
        await refreshUser();
        alert("Compte créé avec succès !");
        navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Une erreur est survenue lors de l'authentification.");
    } finally {
      setLoading(false);
    }
  };

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
               <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-300 p-3 rounded-lg text-sm flex items-center gap-2 animate-pulse">
                   <AlertCircle size={16} />
                   {error}
               </div>
           )}

           <button 
             type="submit" 
             disabled={loading}
             className="w-full bg-wine-600 hover:bg-wine-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-wine-500/30 dark:shadow-wine-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {loading ? (
               <>
                 <Loader2 className="animate-spin" size={20} />
                 <span>Connexion...</span>
               </>
             ) : (
               isLogin ? 'Se Connecter' : 'S\'inscrire'
             )}
           </button>
        </form>

        <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-stone-500 hover:text-stone-800 dark:hover:text-white text-sm transition-colors"
            >
                {isLogin ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
            </button>
        </div>
      </div>
    </div>
  );
};