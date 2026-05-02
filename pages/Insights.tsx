import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShoppingCart, Calendar, TrendingDown, Copy, Loader2, Wine, Clock } from 'lucide-react';
import {
  getDrinkBeforeAlerts,
  getPurchaseSuggestions,
  getAgingRecommendations,
  findWineDuplicates,
  getCellarProjection,
  getAnticipationForEvent,
} from '../services/storageService';

export const Insights: React.FC = () => {
  const [alerts, setAlerts] = useState<any>(null);
  const [purchases, setPurchases] = useState<any>(null);
  const [aging, setAging] = useState<any>(null);
  const [duplicates, setDuplicates] = useState<any>(null);
  const [projection, setProjection] = useState<any>(null);
  const [eventDate, setEventDate] = useState('');
  const [anticipation, setAnticipation] = useState<any>(null);
  const [loadingAnticipation, setLoadingAnticipation] = useState(false);

  useEffect(() => {
    Promise.all([
      getDrinkBeforeAlerts(12).catch(() => null),
      getPurchaseSuggestions().catch(() => null),
      getAgingRecommendations().catch(() => null),
      findWineDuplicates().catch(() => null),
      getCellarProjection(5).catch(() => null),
    ]).then(([a, p, ag, d, pr]) => {
      setAlerts(a); setPurchases(p); setAging(ag); setDuplicates(d); setProjection(pr);
    });
  }, []);

  const handleAnticipation = async () => {
    if (!eventDate) return;
    setLoadingAnticipation(true);
    try {
      const r = await getAnticipationForEvent(eventDate, 5);
      setAnticipation(r);
    } finally {
      setLoadingAnticipation(false);
    }
  };

  return (
    <div className="space-y-6 pb-10 animate-fade-in max-w-5xl mx-auto">
      <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Insights de la cave</h2>
      <p className="text-stone-500 text-sm">Vue proactive sur votre cave, basée sur votre consommation et vos millésimes.</p>

      {/* Alertes "À boire avant" */}
      <Card icon={<AlertTriangle className="text-orange-500" size={18} />} title="À boire avant" subtitle="Vins en fin de fenêtre de garde">
        {alerts?.count > 0 ? (
          <ul className="space-y-2">
            {alerts.alerts.slice(0, 8).map((a: any) => (
              <li key={a.wine.id} className="flex items-center justify-between gap-3 py-2 border-b border-stone-100 dark:border-stone-800 last:border-b-0">
                <Link to={`/wine/${a.wine.id}`} className="flex-1 hover:text-wine-600">
                  <div className="font-medium text-stone-900 dark:text-white">{a.wine.name} {a.wine.vintage}</div>
                  <div className="text-xs text-stone-500">{a.wine.producer} · {a.wine.region}</div>
                </Link>
                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  {a.monthsLeft <= 0 ? 'Apogée dépassée' : `${a.monthsLeft} mois restants`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Tous vos vins sont dans leur fenêtre" />
        )}
      </Card>

      {/* Anticipation occasion */}
      <Card icon={<Calendar className="text-indigo-500" size={18} />} title="Anticipation d'une occasion" subtitle="Quels vins sortir pour un événement">
        <div className="flex gap-2 mb-3">
          <input
            type="date"
            value={eventDate}
            onChange={e => setEventDate(e.target.value)}
            className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={handleAnticipation}
            disabled={!eventDate || loadingAnticipation}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loadingAnticipation ? <Loader2 className="animate-spin" size={14} /> : 'Suggérer'}
          </button>
        </div>
        {anticipation?.count > 0 && (
          <ul className="space-y-2">
            {anticipation.suggestions.map((s: any) => (
              <li key={s.wine.id} className="flex items-center justify-between gap-3 py-2 border-b border-stone-100 dark:border-stone-800 last:border-b-0">
                <Link to={`/wine/${s.wine.id}`} className="flex-1 hover:text-wine-600">
                  <div className="font-medium">{s.wine.name} {s.wine.vintage}</div>
                  <div className="text-xs text-stone-500">{s.wine.producer}</div>
                </Link>
                {s.prestige && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">★ Prestige</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Suggestions d'achat */}
      <Card icon={<ShoppingCart className="text-green-500" size={18} />} title="Suggestions d'achat" subtitle="Catégories à renouveler selon votre consommation">
        {purchases?.count > 0 ? (
          <ul className="space-y-3">
            {purchases.suggestions.map((s: any) => (
              <li key={s.type} className="flex items-center justify-between bg-stone-50 dark:bg-stone-950 rounded-lg p-3">
                <div>
                  <div className="font-medium">{s.type}</div>
                  <div className="text-xs text-stone-500">
                    Stock: {s.current_stock} · Conso: {s.monthly_rate}/mois · Reste {s.months_of_stock ?? '∞'} mois
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${s.priority === 'HIGH' ? 'text-red-600' : s.priority === 'MEDIUM' ? 'text-orange-600' : 'text-stone-600'}`}>
                    +{s.suggested_purchase}
                  </div>
                  <div className="text-[10px] uppercase text-stone-400">{s.priority}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Pas de manque détecté pour l'instant" />
        )}
      </Card>

      {/* Aging recommendations */}
      <Card icon={<Clock className="text-purple-500" size={18} />} title="Recommandations d'âge" subtitle="État de garde par bouteille">
        {aging?.count > 0 ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            {['AGING', 'PEAK', 'PAST'].map(phase => {
              const count = aging.recommendations.filter((r: any) => r.phase === phase).length;
              const labels: any = { AGING: 'En garde', PEAK: 'À leur apogée', PAST: 'Passés' };
              const colors: any = { AGING: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400', PEAK: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400', PAST: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' };
              return (
                <div key={phase} className={`rounded-lg p-3 ${colors[phase]}`}>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs">{labels[phase]}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty text="Aucune donnée disponible" />
        )}
      </Card>

      {/* Duplicates */}
      <Card icon={<Copy className="text-stone-500" size={18} />} title="Doublons" subtitle="Bouteilles potentiellement dupliquées">
        {duplicates?.count > 0 ? (
          <ul className="space-y-2">
            {duplicates.groups.slice(0, 5).map((g: any, i: number) => (
              <li key={i} className="flex items-center justify-between py-2 border-b border-stone-100 dark:border-stone-800 last:border-b-0">
                <span className="text-sm">{g.label}</span>
                <span className="text-xs text-stone-500">{g.wines.length} entrées · {g.wines.reduce((s: number, w: any) => s + (w.inventoryCount || 0), 0)} bouteilles</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="Aucun doublon détecté" />
        )}
      </Card>

      {/* Projection */}
      <Card icon={<TrendingDown className="text-cyan-500" size={18} />} title="Projection sur 5 ans" subtitle="Évolution de la cave selon votre consommation actuelle">
        {projection ? (
          <div>
            <div className="text-sm text-stone-600 dark:text-stone-400 mb-3">
              Consommation actuelle: <span className="font-bold text-stone-900 dark:text-white">{projection.monthly_consumption} bouteilles/mois</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {projection.projection.map((p: any) => (
                <div key={p.year_offset} className="bg-stone-50 dark:bg-stone-950 rounded-lg p-3 text-center">
                  <div className="text-xs text-stone-500">+{p.year_offset} an{p.year_offset > 1 ? 's' : ''}</div>
                  <div className="text-xl font-bold text-stone-900 dark:text-white">{p.projected_stock}</div>
                  <div className="text-[10px] text-stone-500">btl</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty text="Pas assez de données pour projeter" />
        )}
      </Card>
    </div>
  );
};

const Card: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }> = ({ icon, title, subtitle, children }) => (
  <div className="bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm">
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <h3 className="font-serif text-lg text-stone-900 dark:text-white">{title}</h3>
    </div>
    <p className="text-xs text-stone-500 mb-4">{subtitle}</p>
    {children}
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-sm text-stone-400 italic text-center py-4 flex items-center justify-center gap-2">
    <Wine size={14} /> {text}
  </div>
);
