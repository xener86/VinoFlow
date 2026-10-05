import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { customAuth, AuthConfig } from '../services/customAuth';
import { useAuth } from '../contexts/AuthContext';
import { Wine, Lock, Mail, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

type Mode = 'login' | 'signup' | 'forgot';

export const Login: React.FC = () => {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<Mode>('login');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get('expired') === '1'
      ? 'Session expirée — reconnecte-toi pour continuer.'
      : ''
  );
  const [info, setInfo] = useState(
    searchParams.get('reset') === '1'
      ? 'Mot de passe modifié. Tu peux te connecter.'
      : ''
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const minLength = config?.passwordMinLength ?? 10;
  const signupEnabled = config?.signupEnabled ?? false;

  useEffect(() => {
    customAuth.getConfig()
      .then(cfg => {
        setConfig(cfg);
        // Installation neuve : on propose directement de créer le premier compte.
        if (cfg.bootstrap) setMode('signup');
      })
      .catch(() => {});
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (mode === 'forgot') {
        setInfo(await customAuth.forgotPassword(email));
      } else if (mode === 'login') {
        await customAuth.signIn(email, password);
        await refreshUser();
        navigate('/');
      } else {
        await customAuth.signUp(email, password);
        await refreshUser();
        navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Une erreur est survenue lors de l'authentification.");
    } finally {
      setLoading(false);
    }
  };

  const submitLabel = mode === 'login' ? 'Se Connecter' : mode === 'signup' ? "S'inscrire" : 'Envoyer le lien';

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-wine-100 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-indigo-100 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md relative z-10 animate-fade-in-up">
        <div className="text-center mb-8">
           <div className="w-16 h-16 bg-wine-50 rounded-full flex items-center justify-center text-wine-600 mx-auto mb-4 border border-wine-100">
              <Wine size={32} />
           </div>
           <h1 className="text-3xl font-serif text-stone-900 mb-2">VinoFlow</h1>
           <p className="text-stone-500">
             {config?.bootstrap
               ? 'Première installation : créez le compte de la cave.'
               : mode === 'forgot'
                 ? 'Recevez un lien pour choisir un nouveau mot de passe.'
                 : 'Votre sommelier personnel intelligent.'}
           </p>
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
                     autoComplete="email"
                     required
                     className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 pl-10 pr-4 text-stone-900 focus:ring-2 focus:ring-wine-500 outline-none transition-all"
                   />
               </div>
           </div>
           {mode !== 'forgot' && (
           <div className="space-y-1">
               <div className="relative">
                   <Lock className="absolute left-3 top-3.5 text-stone-400" size={18} />
                   <input 
                     type="password" 
                     value={password}
                     onChange={e => setPassword(e.target.value)}
                     placeholder={mode === 'signup' ? `Mot de passe (${minLength} caractères min.)` : 'Mot de passe'}
                     required
                     minLength={mode === 'signup' ? minLength : undefined}
                     autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                     className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 pl-10 pr-4 text-stone-900 focus:ring-2 focus:ring-wine-500 outline-none transition-all"
                   />
               </div>
           </div>
           )}

           {error && (
               <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 animate-pulse">
                   <AlertCircle size={16} />
                   {error}
               </div>
           )}

           {info && (
               <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
                   <CheckCircle2 size={16} />
                   {info}
               </div>
           )}

           <button 
             type="submit" 
             disabled={loading}
             className="w-full bg-wine-600 hover:bg-wine-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-wine-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {loading ? (
               <>
                 <Loader2 className="animate-spin" size={20} />
                 <span>{mode === 'forgot' ? 'Envoi...' : 'Connexion...'}</span>
               </>
             ) : (
               submitLabel
             )}
           </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
            {mode === 'login' && (
              <button onClick={() => switchMode('forgot')} className="text-stone-500 hover:text-stone-800 transition-colors">
                Mot de passe oublié ?
              </button>
            )}
            {mode === 'login' && signupEnabled && (
              <button onClick={() => switchMode('signup')} className="text-stone-500 hover:text-stone-800 transition-colors">
                Pas encore de compte ? Créer un compte
              </button>
            )}
            {mode !== 'login' && !config?.bootstrap && (
              <button onClick={() => switchMode('login')} className="text-stone-500 hover:text-stone-800 transition-colors">
                {mode === 'signup' ? 'Déjà un compte ? Se connecter' : 'Retour à la connexion'}
              </button>
            )}
        </div>
      </div>
    </div>
  );
};