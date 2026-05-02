import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ShoppingCart, Calendar, TrendingDown, Copy, Loader2, Wine, Clock,
  Wallet, Activity, ChevronRight,
} from 'lucide-react';
import {
  getDrinkBeforeAlerts,
  getPurchaseSuggestions,
  getAgingRecommendations,
  findWineDuplicates,
  getCellarProjection,
  getAnticipationForEvent,
} from '../services/storageService';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const eur = (n: number) => `${fmt(n)} €`;

export const Insights: React.FC = () => {
  const [alerts, setAlerts] = useState<any>(null);
  const [purchases, setPurchases] = useState<any>(null);
  const [aging, setAging] = useState<any>(null);
  const [duplicates, setDuplicates] = useState<any>(null);
  const [projection, setProjection] = useState<any>(null);
  const [eventDate, setEventDate] = useState('');
  const [anticipation, setAnticipation] = useState<any>(null);
  const [loadingAnticipation, setLoadingAnticipation] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDrinkBeforeAlerts(12).catch(() => null),
      getPurchaseSuggestions().catch(() => null),
      getAgingRecommendations().catch(() => null),
      findWineDuplicates().catch(() => null),
      getCellarProjection(5).catch(() => null),
    ]).then(([a, p, ag, d, pr]) => {
      setAlerts(a); setPurchases(p); setAging(ag); setDuplicates(d); setProjection(pr);
      setLoading(false);
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

  // Hero numbers
  const drinkSoonCount = alerts?.count || 0;
  const peakCount = aging?.recommendations?.filter((r: any) => r.phase === 'PEAK').length || 0;
  const monthsOfStock = projection?.monthly_consumption > 0
    ? Math.round((projection.projection?.[0]?.projected_stock + projection.monthly_consumption * 12) / projection.monthly_consumption)
    : null;
  const monthlyConsumption = projection?.monthly_consumption || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-stone-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Chargement des insights...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 animate-fade-in max-w-6xl mx-auto">
      {/* HERO */}
      <div className="bg-gradient-to-br from-wine-600 to-wine-800 dark:from-wine-700 dark:to-wine-900 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-2xl md:text-3xl font-serif mb-1">Tableau de bord</h2>
        <p className="text-wine-100 text-sm mb-4">Vue d'ensemble proactive de votre cave.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <HeroStat icon={AlertTriangle} value={drinkSoonCount} label="à boire dans 12 mois" emphasis={drinkSoonCount > 0} />
          <HeroStat icon={Activity} value={peakCount} label="à leur apogée" emphasis />
          <HeroStat icon={Wine} value={monthlyConsumption} label="bouteilles/mois" />
          <HeroStat icon={Clock} value={monthsOfStock} label="mois de stock" suffix={monthsOfStock ? '' : '∞'} />
        </div>
      </div>

      {/* GRID 2 COLUMNS */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* COL 1 — Garde */}
        <Section title="🍷 Garde" subtitle="État d'âge et fenêtres de consommation">
          <Card icon={<AlertTriangle className="text-orange-500" size={16} />} title="À boire avant" linkTo="/drink-now">
            {alerts?.count > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {alerts.alerts.slice(0, 5).map((a: any) => (
                  <li key={a.wine.id} className="flex items-center justify-between">
                    <Link to={`/wine/${a.wine.id}`} className="hover:text-wine-600 truncate flex-1 mr-2">
                      {a.wine.name} {a.wine.vintage}
                    </Link>
                    <span className="text-xs text-orange-600 dark:text-orange-400 whitespace-nowrap">
                      {a.monthsLeft <= 0 ? 'Apogée passée' : `${a.monthsLeft} mois`}
                    </span>
                  </li>
                ))}
                {alerts.count > 5 && <li className="text-xs text-stone-400 italic">+ {alerts.count - 5} autres</li>}
              </ul>
            ) : <Empty text="Aucun vin en fin de fenêtre" />}
          </Card>

          <Card icon={<Clock className="text-purple-500" size={16} />} title="Phase d'âge">
            {aging?.count > 0 ? (
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {[
                  { phase: 'AGING', label: 'En garde', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
                  { phase: 'PEAK', label: 'Apogée', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
                  { phase: 'PAST', label: 'Passés', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
                ].map(({ phase, label, color }) => {
                  const count = aging.recommendations.filter((r: any) => r.phase === phase).length;
                  return (
                    <div key={phase} className={`rounded-lg p-2 ${color}`}>
                      <div className="text-xl font-bold">{count}</div>
                      <div>{label}</div>
                    </div>
                  );
                })}
              </div>
            ) : <Empty text="Aucune donnée" />}
          </Card>

          <Card icon={<Calendar className="text-indigo-500" size={16} />} title="Anticipation d'occasion">
            <div className="flex gap-2 mb-3">
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1.5 text-sm flex-1"
              />
              <button
                onClick={handleAnticipation}
                disabled={!eventDate || loadingAnticipation}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
              >
                {loadingAnticipation ? <Loader2 className="animate-spin" size={14} /> : 'Suggérer'}
              </button>
            </div>
            {anticipation?.count > 0 && (
              <ul className="space-y-1.5 text-sm">
                {anticipation.suggestions.slice(0, 5).map((s: any) => (
                  <li key={s.wine.id} className="flex items-center gap-2">
                    <Link to={`/wine/${s.wine.id}`} className="hover:text-wine-600 flex-1 truncate">
                      {s.wine.name} {s.wine.vintage}
                    </Link>
                    {s.prestige && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 px-2 py-0.5 rounded-full">★</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>

        {/* COL 2 — Achat */}
        <Section title="🛒 Achat" subtitle="Renouvellement et budget">
          <Card icon={<ShoppingCart className="text-green-500" size={16} />} title="Suggestions d'achat" linkTo="/wishlist">
            {purchases?.count > 0 ? (
              <ul className="space-y-2">
                {purchases.suggestions.map((s: any) => (
                  <li key={s.type} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-500">{s.months_of_stock !== null ? `${s.months_of_stock} mois restants` : 'rare'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.priority === 'HIGH' ? 'bg-red-100 dark:bg-red-900/30 text-red-700' : s.priority === 'MEDIUM' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700' : 'bg-stone-100 dark:bg-stone-800 text-stone-600'}`}>
                        +{s.suggested_purchase}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty text="Pas de manque détecté" />}
          </Card>

          <Card icon={<Wallet className="text-cyan-500" size={16} />} title="Projection sur 5 ans">
            {projection ? (
              <>
                <div className="text-xs text-stone-500 mb-2">
                  Conso actuelle: <strong>{monthlyConsumption} btl/mois</strong>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {projection.projection.map((p: any) => (
                    <div key={p.year_offset} className="bg-stone-50 dark:bg-stone-950 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-stone-500">+{p.year_offset}an</div>
                      <div className="text-sm font-bold">{p.projected_stock}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : <Empty text="Pas assez de données" />}
          </Card>
        </Section>
      </div>

      {/* ANOMALIES */}
      <Section title="⚠️ Anomalies" subtitle="Doublons, profils suspects à corriger">
        <Card icon={<Copy className="text-stone-500" size={16} />} title="Doublons potentiels" linkTo="/settings">
          {duplicates?.count > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {duplicates.groups.slice(0, 5).map((g: any, i: number) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="truncate flex-1">{g.label}</span>
                  <span className="text-xs text-stone-500 whitespace-nowrap ml-2">{g.wines.length} entrées</span>
                </li>
              ))}
            </ul>
          ) : <Empty text="Aucun doublon" />}
        </Card>
      </Section>
    </div>
  );
};

const HeroStat: React.FC<{ icon: React.FC<any>; value: number | null; label: string; emphasis?: boolean; suffix?: string }> = ({ icon: Icon, value, label, emphasis, suffix }) => (
  <div className={`rounded-xl p-3 ${emphasis ? 'bg-white/15' : 'bg-white/8'} backdrop-blur-sm`}>
    <Icon size={14} className="opacity-80 mb-1" />
    <div className="text-2xl md:text-3xl font-bold leading-none">
      {value === null ? '—' : fmt(value)}{suffix || ''}
    </div>
    <div className="text-xs opacity-80 mt-1">{label}</div>
  </div>
);

const Section: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-lg font-serif text-stone-900 dark:text-white">{title}</h3>
      <p className="text-xs text-stone-500">{subtitle}</p>
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Card: React.FC<{ icon: React.ReactNode; title: string; linkTo?: string; children: React.ReactNode }> = ({ icon, title, linkTo, children }) => (
  <div className="bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-white">
        {icon}
        {title}
      </div>
      {linkTo && (
        <Link to={linkTo} className="text-stone-400 hover:text-stone-700 dark:hover:text-white">
          <ChevronRight size={16} />
        </Link>
      )}
    </div>
    {children}
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-xs text-stone-400 italic flex items-center gap-1.5 py-2">
    <Wine size={12} /> {text}
  </div>
);
