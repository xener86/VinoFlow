// Page publique d'un partage (fiche vin ou carte de dîner) : sans compte,
// sans menu ni lien vers le reste de l'app, en lecture seule.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublicShare } from '../services/storageService';
import type { PublicShare as PublicShareData, PublicShareWine } from '../types';
import { frenchDate, stars, typeLabel } from '../utils/shareView';

const DOT: Record<string, string> = {
  RED: 'bg-wine-700', WHITE: 'bg-amber-300', ROSE: 'bg-pink-400', SPARKLING: 'bg-cyan-400', DESSERT: 'bg-amber-500', FORTIFIED: 'bg-orange-700',
};

const Line: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (items.length ? (
  <div className="mt-2 text-[13px] text-stone-700"><span className="mono text-[10px] tracking-widest uppercase text-stone-500 mr-2">{label}</span>{items.join(', ')}</div>
) : null);

const WineBlock: React.FC<{ wine: PublicShareWine; numbered: boolean }> = ({ wine, numbered }) => (
  <article className="bg-white border border-stone-200 rounded-md p-4">
    <div className="flex items-start gap-3">
      {numbered && <span className="mono text-xs text-stone-400 pt-1">{String(wine.position).padStart(2, '0')}</span>}
      <div className="min-w-0 flex-1">
        {wine.dish && <div className="text-xs text-wine-700 mb-1">Servi avec {wine.dish}</div>}
        <h2 className="serif-it text-xl text-stone-900 leading-tight">{[wine.name, wine.cuvee].filter(Boolean).join(' · ')}</h2>
        <div className="mono text-[11px] tracking-widest text-stone-500 uppercase mt-1">
          {[wine.producer, wine.vintage].filter(Boolean).join(' · ')}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[13px] text-stone-600">
          {wine.type && <span className={`w-2.5 h-2.5 rounded-full ${DOT[wine.type] || 'bg-stone-400'}`} aria-hidden />}
          <span>{[typeLabel(wine.type), wine.appellation, wine.region, wine.country].filter(Boolean).join(' · ')}</span>
        </div>
        {wine.sensoryDescription && <p className="mt-3 text-sm text-stone-700 leading-relaxed">{wine.sensoryDescription}</p>}
        <Line label="Cépages" items={wine.grapeVarieties} />
        <Line label="Arômes" items={wine.aromaProfile} />
        <Line label="Accords" items={wine.suggestedFoodPairings} />
        {wine.tastings.length > 0 && (
          <ul className="mt-3 space-y-2 border-t border-stone-100 pt-3">
            {wine.tastings.map((t, i) => (
              <li key={i} className="text-sm">
                <span className="text-amber-500" aria-label={t.rating != null ? `${t.rating} sur 5` : undefined}>{stars(t.rating)}</span>
                {t.date && <span className="ml-2 text-xs text-stone-400">{frenchDate(t.date)}</span>}
                {t.comment && <p className="text-stone-700 mt-0.5">{t.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </article>
);

export const PublicShare: React.FC = () => {
  const { token = '' } = useParams();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'gone' } | { status: 'error' } | { status: 'ok'; share: PublicShareData }>({ status: 'loading' });

  // Pas d'indexation par les moteurs de recherche.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPublicShare(token).then(r => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (state.status === 'ok') document.title = state.share.title || state.share.wines[0]?.name || 'VinoFlow';
  }, [state]);

  return (
    <div className="min-h-screen bg-stone-50">
      <main className="max-w-[640px] mx-auto px-4 py-8">
        {state.status === 'loading' && <div className="text-center text-stone-500 py-20">Chargement…</div>}
        {state.status === 'gone' && <div className="text-center text-stone-600 py-20 serif-it text-lg">Ce lien n’est plus actif.</div>}
        {state.status === 'error' && <div className="text-center text-stone-600 py-20">Impossible de charger la carte, réessaie.</div>}
        {state.status === 'ok' && (
          <>
            {state.share.kind === 'DINNER' && (
              <header className="mb-6 text-center">
                <div className="mono text-[10px] tracking-widest uppercase text-stone-500">Carte des vins</div>
                <h1 className="serif text-3xl text-stone-900 mt-1">{state.share.title}</h1>
                {state.share.date && <div className="text-sm text-stone-500 mt-1">{frenchDate(state.share.date)}</div>}
              </header>
            )}
            <div className="space-y-3">
              {state.share.wines.map(w => <WineBlock key={w.position} wine={w} numbered={state.share.kind === 'DINNER'} />)}
            </div>
            <footer className="mt-8 text-center mono text-[10px] tracking-widest uppercase text-stone-400">Partagé depuis VinoFlow</footer>
          </>
        )}
      </main>
    </div>
  );
};
