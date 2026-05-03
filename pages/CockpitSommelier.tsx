// Cockpit-style sommelier page.
// Left sidebar: ambient context (date, weather, cave, peak count) + proactive prompts.
// Right pane: the existing SommelierV2 component (3-perspective pairing).

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useWines } from '../hooks/useWines';
import { getDrinkBeforeAlerts } from '../services/storageService';
import { SommelierV2 } from '../components/SommelierV2';
import { MonoLabel, Card } from '../components/cockpit/primitives';

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
  const [searchParams] = useSearchParams();
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

  return (
    <div>
      {/* ───── Page header ───── */}
      <div className="mb-5">
        <MonoLabel>VINOFLOW · CONSEIL</MonoLabel>
        <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Sommelier</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">3 perspectives · Safe · Personnel · Audacieux</div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ───── Sidebar context + proactive prompts ───── */}
        <aside className="col-span-12 lg:col-span-3 space-y-4">
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
                <a
                  key={i}
                  href={`?mode=PAIRING&q=${encodeURIComponent(p.q)}`}
                  className="block w-full text-left p-2 rounded hover:bg-stone-50 dark:hover:bg-stone-800/50 transition group"
                >
                  <div className="mono text-[9px] tracking-widest text-stone-500 group-hover:text-wine-700 mb-0.5 uppercase">
                    {p.ctx}
                  </div>
                  <div className="text-[12.5px] text-stone-800 dark:text-stone-200 leading-snug">{p.q}</div>
                </a>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <MonoLabel>◌ Modes avancés</MonoLabel>
            <div className="mt-3 text-[12.5px] text-stone-700 dark:text-stone-300">
              Verticale, mode aveugle, decision assistant, OCR étiquette…
            </div>
            <a href="/sommelier-tools" className="mt-3 inline-flex items-center gap-1 mono text-[10px] tracking-widest text-wine-700 hover:text-wine-800">
              <Sparkles className="w-3 h-3" /> BOÎTE À OUTILS →
            </a>
          </Card>
        </aside>

        {/* ───── Main pane: Sommelier V2 ───── */}
        <main className="col-span-12 lg:col-span-9">
          <Card className="p-6">
            <SommelierV2 inventory={wines} key={initialDish} />
          </Card>
        </main>
      </div>
    </div>
  );
};

const ContextRow: React.FC<{ label: string; value: React.ReactNode; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex justify-between items-baseline gap-2">
    <span className="text-stone-500">{label}</span>
    <span className={accent ? 'text-wine-700 dark:text-wine-500 font-medium' : 'text-stone-800 dark:text-stone-200'}>
      {value}
    </span>
  </div>
);
