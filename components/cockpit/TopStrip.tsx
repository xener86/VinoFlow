// Thin status strip at the very top of every Cockpit page.
// Marque, état de la connexion au serveur, date et version.

import React, { useEffect, useState } from 'react';

const formatDate = () => {
  const days = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
  const months = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUI', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];
  const d = new Date();
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

declare const __APP_VERSION__: string;

const useOnline = () => {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
};

export const TopStrip: React.FC = () => {
  const [now, setNow] = useState(formatDate());
  const online = useOnline();
  useEffect(() => {
    const t = setInterval(() => setNow(formatDate()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="border-b border-stone-200 bg-white px-4 md:px-7 h-9 flex items-center justify-between mono text-[10px] text-stone-500">
      <div className="flex items-center gap-4">
        <span className="text-wine-700 font-medium tracking-widest">VINOFLOW</span>
      </div>
      <div className="hidden md:block">{now}</div>
      <div className="flex items-center gap-3">
        <span className={`flex items-center gap-1.5 ${online ? 'text-emerald-700' : 'text-wine-700'}`} title={online ? 'Connecté au serveur' : 'Hors ligne : les modifications ne seront pas enregistrées'}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-600' : 'bg-wine-700 animate-pulse'}`} />
          {online ? 'EN LIGNE' : 'HORS LIGNE'}
        </span>
        <span>v{__APP_VERSION__}</span>
      </div>
    </div>
  );
};
