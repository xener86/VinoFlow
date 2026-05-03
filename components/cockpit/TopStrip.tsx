// Thin status strip at the very top of every Cockpit page.
// Shows brand, sync status, and date/version.

import React, { useEffect, useState } from 'react';

const formatDate = () => {
  const days = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
  const months = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUI', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];
  const d = new Date();
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const PulseDot: React.FC = () => (
  <span className="relative inline-flex h-1.5 w-1.5 mr-1.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wine-600 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wine-700"></span>
  </span>
);

export const TopStrip: React.FC = () => {
  const [now, setNow] = useState(formatDate());
  useEffect(() => {
    const t = setInterval(() => setNow(formatDate()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-7 h-9 flex items-center justify-between mono text-[10px] text-stone-500 dark:text-stone-400">
      <div className="flex items-center gap-4">
        <span className="text-wine-700 dark:text-wine-500 font-medium tracking-widest">VINOFLOW</span>
        <span className="flex items-center"><PulseDot />LOCAL</span>
      </div>
      <div className="hidden md:block">{now}</div>
      <div className="flex items-center gap-3">
        <span className="text-emerald-700 dark:text-emerald-400">SYNC ✓</span>
        <span>v2.0.0</span>
      </div>
    </div>
  );
};
