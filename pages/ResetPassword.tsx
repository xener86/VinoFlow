import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customAuth } from '../services/customAuth';
import { Wine, Lock, Loader2, AlertCircle } from 'lucide-react';

const MIN_LENGTH = 10;

// Le jeton arrive dans le fragment (#token=…) : jamais envoyé au serveur web
// ni dans le Referer. On le lit une fois puis on l'efface de la barre d'adresse.
const readToken = (): string => {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
  const fromQuery = new URLSearchParams(window.location.search).get('token');
  return fromHash || fromQuery || '';
};

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [token] = useState(readToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? '' : 'Lien invalide : jeton manquant.');

  useEffect(() => {
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await customAuth.resetPassword(token, password);
      navigate('/login?reset=1', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Échec de la réinitialisation.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full bg-stone-50 border border-stone-200 rounded-xl py-3 pl-10 pr-4 text-stone-900 focus:ring-2 focus:ring-wine-500 outline-none transition-all';

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-wine-50 rounded-full flex items-center justify-center text-wine-600 mx-auto mb-4 border border-wine-100">
            <Wine size={32} />
          </div>
          <h1 className="text-3xl font-serif text-stone-900 mb-2">Nouveau mot de passe</h1>
          <p className="text-stone-500">Au moins {MIN_LENGTH} caractères.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-stone-400" size={18} />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nouveau mot de passe"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              disabled={!token}
              className={inputClass}
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-stone-400" size={18} />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Confirmer le mot de passe"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              disabled={!token}
              className={inputClass}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-wine-600 hover:bg-wine-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Enregistrer'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-stone-500 hover:text-stone-800 text-sm transition-colors">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
};
