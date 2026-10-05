// Cockpit-style sommelier page.
// Onglets pilotés par ?outil= : « Accord » (défaut, SommelierV2 + colonne de
// contexte, compatible ?q= / ?mode=PAIRING&q=) puis un onglet par outil avancé
// (pages/SommelierTools.tsx).

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { getDrinkBeforeAlerts } from '../services/storageService';
import { SommelierV2 } from '../components/SommelierV2';
import { MonoLabel, Card, Tabs } from '../components/cockpit/primitives';
import { SOMMELIER_TOOLS, SommelierToolKey, SommelierToolPanel, isSommelierToolKey } from './SommelierTools';

type TabKey = 'accord' | SommelierToolKey;

const TAB_ITEMS: { key: TabKey; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: 'accord', label: 'Accord', icon: Sparkles },
  ...SOMMELIER_TOOLS.map(t => ({ key: t.key as TabKey, label: t.label, icon: t.icon })),
];

interface ProactivePrompt {
  ctx: string;
  q: string;
  show: () => boolean;
}

const formatNow = () => {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const d = new Date();
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
};

export const CockpitSommelier: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const outil = searchParams.get('outil');
  const tab: TabKey = isSommelierToolKey(outil) ? outil : 'accord';
  const setTab = (k: TabKey) => setSearchParams(k === 'accord' ? {} : { outil: k });
  const { wines } = useWines();
  const [drinkBefore, setDrinkBefore] = useState<any[]>([]);
  const [now, setNow] = useState(formatNow());

  useEffect(() => {
    getDrinkBeforeAlerts(2).then(r => setDrinkBefore(r?.alerts || [])).catch(() => {});
    const t = setInterval(() => setNow(formatNow()), 60000);
    return () => clearInterval(t);
  }, []);

  const totalBottles = wines.reduce((s, w) => s + (w.inventoryCount || 0), 0);
  const inPeak = drinkBefore.filter(a => a.peak?.status === 'À Boire').length;

  // Proactive suggestions adaptés au contexte temporel et a la cave
  const prompts = useMemo<ProactivePrompt[]>(() => {
    const d = new Date();
    const day = d.getDay(); // 0 = dimanche
    const hour = d.getHours();
    const all: ProactivePrompt[] = [
      {
        ctx: `${['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][day]} soir · ${hour}h`,
        q: hour < 18
          ? "Que boire au déjeuner aujourd'hui, sans faire trop honneur ?"
          : "Quelque chose de simple ce soir, sans grand cérémonial.",
        show: () => true,
      },
      {
        ctx: 'Pic imminent',
        q: 'Quel vin de la cave est sur le point de passer son pic ?',
        show: () => drinkBefore.length > 0,
      },
      {
        ctx: 'Vendredi · invités',
        q: "Vendredi, on reçoit des amis. Un rouge qui claque mais pas trop snob.",
        show: () => day === 5 || day === 4,
      },
      {
        ctx: 'Saison',
        q: hour < 18 && (d.getMonth() >= 4 && d.getMonth() <= 8)
          ? 'Quelque chose de frais pour cet après-midi.'
          : "Réconfort d'hiver, plutôt rond et gourmand.",
        show: () => true,
      },
    ];
    return all.filter(p => p.show());
  }, [drinkBefore]);

  const initialDish = searchParams.get('q') || '';

  const activeTool = SOMMELIER_TOOLS.find(t => t.key === tab);

  return (
    <div>
      {/* ───── Page header ───── */}
      <div className="mb-4">
        <MonoLabel>VINOFLOW · CONSEIL</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Sommelier</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">
          {activeTool ? activeTool.subtitle : '3 perspectives · Sûr · Personnel · Audacieux'}
        </div>
      </div>

      <Tabs<TabKey>
        items={TAB_ITEMS}
        value={tab}
        onChange={setTab}
        aria-label="Outils du sommelier"
        className="mb-4"
      />

      {tab === 'accord' ? (
        <div className="grid grid-cols-12 gap-4">
          {/* ───── Main pane: Sommelier V2 (en premier sur mobile) ───── */}
          <main className="col-span-12 lg:col-span-9 lg:order-2 min-w-0">
            <Card className="p-4 md:p-6">
              <SommelierV2 inventory={wines} initialDish={initialDish} key={initialDish} />
            </Card>
          </main>

          {/* ───── Sidebar context + proactive prompts ───── */}
          <aside className="col-span-12 lg:col-span-3 lg:order-1 space-y-4">
            <Card className="p-4">
              <MonoLabel>◌ Contexte</MonoLabel>
              <div className="mt-3 space-y-2 text-[12px]">
                <ContextRow label="Date" value={now} />
                <ContextRow label="Cave" value={`${totalBottles} btl`} />
                <ContextRow label="En pic ce mois" value={`${inPeak} vins`} accent={inPeak > 0} />
                <ContextRow label="En fin de fenêtre" value={`${drinkBefore.length} vins`} accent={drinkBefore.length > 0} />
              </div>
            </Card>

            <Card className="p-4">
              <MonoLabel>◌ Suggestions proactives</MonoLabel>
              <div className="mt-3 space-y-1.5">
                {prompts.map((p, i) => (
                  <Link
                    key={i}
                    to={`/sommelier?q=${encodeURIComponent(p.q)}`}
                    className="block w-full text-left p-2 rounded hover:bg-stone-50 transition group"
                  >
                    <div className="mono text-[9px] tracking-widest text-stone-500 group-hover:text-wine-700 mb-0.5 uppercase">
                      {p.ctx}
                    </div>
                    <div className="text-[12.5px] text-stone-800 leading-snug">{p.q}</div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <MonoLabel>◌ Modes avancés</MonoLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SOMMELIER_TOOLS.map(t => (
                  <Link
                    key={t.key}
                    to={`/sommelier?outil=${t.key}`}
                    className="inline-flex items-center gap-1 h-9 md:h-7 px-2.5 rounded-full border border-stone-200 bg-white text-xs text-stone-700 hover:bg-stone-50 hover:text-wine-700"
                  >
                    <t.icon className="w-3 h-3" /> {t.label}
                  </Link>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      ) : (
        <Card className="p-4 md:p-6 max-w-3xl">
          <SommelierToolPanel tool={tab as SommelierToolKey} wines={wines} key={tab} />
        </Card>
      )}
    </div>
  );
};

const ContextRow: React.FC<{ label: string; value: React.ReactNode; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex justify-between items-baseline gap-2">
    <span className="text-stone-500">{label}</span>
    <span className={accent ? 'text-wine-700 font-medium' : 'text-stone-800'}>
      {value}
    </span>
  </div>
);
