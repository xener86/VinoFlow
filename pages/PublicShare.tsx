// Page publique /p/:token — sans compte, hors CockpitLayout, mobile d'abord.
// Rendu React uniquement (texte échappé) ; aucune donnée HTML injectée.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublicShare, PublicShareError } from '../services/storageService';
import type { PublicShare as PublicShareData, PublicShareWine } from '../types';
import { formatLongDate, formatShortDate, stars, typeDotClass, typeLabel } from '../utils/shareView';

type State =
  | { status: 'loading' }
  | { status: 'gone' }
  | { status: 'error' }
  | { status: 'ok'; data: PublicShareData };

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-cream-50 text-stone-900">
    <main className="max-w-2xl mx-auto px-4 py-8 md:py-12">{children}</main>
    <footer className="max-w-2xl mx-auto px-4 pb-10 text-center">
      <span className="mono text-[10px] tracking-widest text-stone-400 uppercase">Partagé depuis VinoFlow</span>
    </footer>
  </div>
);

const Message: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="py-16 text-center">
    <div className="text-4xl mb-4">🍷</div>
    <h1 className="serif text-2xl text-stone-900">{title}</h1>
    {hint && <p className="text-stone-500 text-sm mt-2">{hint}</p>}
  </div>
);

const WineBlock: React.FC<{ wine: PublicShareWine; numbered: boolean }> = ({ wine, numbered }) => (
  <article className="bg-white rounded-lg border border-stone-200 p-5 md:p-6">
    {numbered && (
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="mono text-[11px] tracking-widest text-wine-700">N° {wine.position}</span>
        {wine.dish && <span className="text-sm text-stone-600 italic text-right">Servi avec {wine.dish}</span>}
      </div>
    )}
    <div className="flex items-center gap-2 mb-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${typeDotClass(wine.type)}`} aria-hidden="true" />
      <span className="mono text-[10px] tracking-widest text-stone-500 uppercase">
        {[typeLabel(wine.type), wine.appellation].filter(Boolean).join(' · ')}
      </span>
    </div>
    <h2 className="serif text-2xl text-stone-900 leading-tight">{wine.name}</h2>
    {wine.cuvee && <div className="serif-it text-lg text-wine-700">{wine.cuvee}</div>}
    <div className="text-stone-600 text-sm mt-1">
      {[wine.producer, wine.vintage ? String(wine.vintage) : null, wine.region, wine.country].filter(Boolean).join(' · ')}
    </div>

    {wine.grapeVarieties.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-3">
        {wine.grapeVarieties.map((g, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-wine-50 text-wine-800">{g}</span>
        ))}
      </div>
    )}

    {wine.sensoryDescription && (
      <p className="text-stone-700 italic leading-relaxed text-sm mt-4">« {wine.sensoryDescription} »</p>
    )}

    {wine.aromaProfile.length > 0 && (
      <div className="mt-4">
        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mb-1.5">Arômes</div>
        <div className="flex flex-wrap gap-1.5">
          {wine.aromaProfile.map((a, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">{a}</span>
          ))}
        </div>
      </div>
    )}

    {wine.suggestedFoodPairings.length > 0 && (
      <div className="mt-4">
        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mb-1.5">Accords</div>
        <ul className="space-y-1 text-sm text-stone-700">
          {wine.suggestedFoodPairings.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-wine-500 flex-shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    )}

    {wine.tastings.length > 0 && (
      <div className="mt-5 pt-4 border-t border-stone-100">
        <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mb-2">Mes dégustations</div>
        <ul className="space-y-2">
          {wine.tastings.map((t, i) => (
            <li key={i} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-wine-700 tracking-wider" aria-label={t.rating !== null ? `${t.rating} sur 5` : undefined}>{stars(t.rating)}</span>
                <span className="mono text-[10px] text-stone-500">{formatShortDate(t.date)}</span>
              </div>
              {t.comment && <p className="text-stone-600 italic mt-0.5">« {t.comment} »</p>}
            </li>
          ))}
        </ul>
      </div>
    )}
  </article>
);

export const PublicShare: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });

  // Non indexée : balise robots posée à l'affichage, retirée en quittant.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    const previousTitle = document.title;
    return () => {
      meta.remove();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchPublicShare(token)
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ok', data });
        document.title = `${data.title ?? data.wines[0]?.name ?? 'Partage'} — VinoFlow`;
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: e instanceof PublicShareError && e.status === 404 ? 'gone' : 'error' });
      });
    return () => { cancelled = true; };
  }, [token]);

  if (state.status === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-600" />
        </div>
      </Shell>
    );
  }
  if (state.status === 'gone') return <Shell><Message title="Ce lien n’est plus actif" hint="La personne qui l’a partagé l’a retiré." /></Shell>;
  if (state.status === 'error') return <Shell><Message title="Impossible de charger la carte, réessaie." /></Shell>;

  const { data } = state;
  const isDinner = data.kind === 'DINNER';
  return (
    <Shell>
      <header className="mb-6 md:mb-8">
        <div className="mono text-[10px] tracking-widest text-wine-700 uppercase">{isDinner ? 'Carte des vins' : 'Fiche vin'}</div>
        {isDinner && <h1 className="serif text-3xl md:text-4xl text-stone-900 leading-tight mt-1">{data.title}</h1>}
        {isDinner && data.date && <div className="text-stone-500 text-sm mt-1 first-letter:uppercase">{formatLongDate(data.date)}</div>}
      </header>
      {data.wines.length === 0 ? (
        <Message title="Cette carte est vide" hint="Les vins qu’elle contenait ne sont plus dans la cave." />
      ) : (
        <div className="space-y-4">
          {data.wines.map((wine) => <WineBlock key={wine.position} wine={wine} numbered={isDinner} />)}
        </div>
      )}
    </Shell>
  );
};
