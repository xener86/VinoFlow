import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWines } from '../hooks/useWines';
import { useRacks } from '../hooks/useRacks';
import { getPeakWindow, getPeakBadgeStyles, PeakWindowResult } from '../utils/peakWindow';
import { exportWinesToCsv } from '../utils/exportCsv';
import { CellarWine } from '../types';
import { Clock, AlertTriangle, Wine, Droplet, Loader2, ArrowRight, MapPin, Grape, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface WineWithPeak extends CellarWine {
  peak: PeakWindowResult;
}

const DrinkNowCard: React.FC<{ wine: WineWithPeak; onClick: () => void }> = ({ wine, onClick }) => {
  const styles = getPeakBadgeStyles(wine.peak.status);
  const isUrgent = wine.peak.status === 'Boire Vite';
  const currentYear = new Date().getFullYear();
  const yearsLeft = wine.peak.peakEnd - currentYear;

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-stone-900 border shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer ${
        isUrgent
          ? 'border-red-200 dark:border-red-900/50 hover:border-red-300'
          : 'border-green-200 dark:border-green-900/50 hover:border-green-300'
      }`}
    >
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${
        isUrgent ? 'from-red-50 dark:from-red-900/20' : 'from-green-50 dark:from-green-900/20'
      } to-transparent rounded-bl-full -mr-6 -mt-6 pointer-events-none`} />

      <div className="p-4 relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase ${styles.bg} ${styles.text}`}>
                {wine.peak.status}
              </span>
              <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase border
                ${wine.type === 'RED' ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/50 dark:text-red-400 dark:border-red-900/50' :
                  wine.type === 'WHITE' ? 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-950/50 dark:text-yellow-200 dark:border-yellow-900/50' :
                  wine.type === 'ROSE' ? 'bg-pink-50 text-pink-700 border-pink-100 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-900/50' :
                  'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/50'}`}
              >
                {wine.type === 'RED' ? 'Rouge' : wine.type === 'WHITE' ? 'Blanc' : wine.type === 'ROSE' ? 'Rosé' : wine.type}
              </span>
              {isUrgent && (
                <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
                  {yearsLeft < 0 ? `${Math.abs(yearsLeft)} an(s) passé` : 'Dernière année'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-serif text-stone-800 dark:text-stone-100 leading-tight truncate">{wine.name}</h3>
            {wine.cuvee && <p className="text-sm font-serif text-wine-700 dark:text-wine-400 italic truncate">{wine.cuvee}</p>}
            <p className="text-stone-500 dark:text-stone-400 text-sm">{wine.producer} • {wine.vintage}</p>

            <div className="flex items-center gap-3 mt-2 text-xs text-stone-500 dark:text-stone-500">
              <span className="flex items-center gap-1"><MapPin size={10} /> {wine.region}</span>
              <span className="flex items-center gap-1"><Grape size={10} /> {wine.grapeVarieties.slice(0, 2).join(', ')}</span>
            </div>

            <div className="mt-2 text-xs text-stone-400 dark:text-stone-600">
              Fenêtre idéale : {wine.peak.peakStart} — {wine.peak.peakEnd}
            </div>
          </div>

          <div className="text-center flex-shrink-0">
            <div className={`rounded-lg p-2 border min-w-[56px] ${
              isUrgent
                ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/50'
                : 'bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/50'
            }`}>
              <span className={`block text-2xl font-bold ${isUrgent ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {wine.inventoryCount}
              </span>
              <span className="text-[9px] uppercase text-stone-500 dark:text-stone-400 tracking-wider">btl</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DrinkNow: React.FC = () => {
  const { wines, loading } = useWines();
  const { racks } = useRacks();
  const navigate = useNavigate();
  const [showGarde, setShowGarde] = useState(false);

  const winesWithPeak: WineWithPeak[] = wines
    .filter(w => w.inventoryCount > 0)
    .map(w => ({
      ...w,
      peak: getPeakWindow(w as any)
    }));

  const boireVite = winesWithPeak
    .filter(w => w.peak.status === 'Boire Vite')
    .sort((a, b) => a.peak.peakEnd - b.peak.peakEnd);

  const aBoire = winesWithPeak
    .filter(w => w.peak.status === 'À Boire')
    .sort((a, b) => a.peak.peakEnd - b.peak.peakEnd);

  const enGarde = winesWithPeak
    .filter(w => w.peak.status === 'Garde')
    .sort((a, b) => a.peak.peakStart - b.peak.peakStart);

  const totalDrinkNow = boireVite.length + aBoire.length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-wine-600" size={48} />
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif text-stone-800 dark:text-white flex items-center gap-3">
            <Clock className="text-green-600 dark:text-green-400" size={28} />
            À Boire
          </h2>
          <p className="text-stone-500 dark:text-stone-400 text-sm mt-1">
            {totalDrinkNow} vin{totalDrinkNow > 1 ? 's' : ''} à leur apogée dans votre cave
          </p>
        </div>
        <button
          onClick={() => exportWinesToCsv(wines.filter(w => w.inventoryCount > 0), racks)}
          className="flex items-center gap-2 text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-3 py-2 rounded-lg transition-colors"
          title="Exporter CSV"
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {/* Boire Vite Section */}
      {boireVite.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="text-lg font-serif text-red-700 dark:text-red-400">
              Boire Vite
            </h3>
            <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {boireVite.length}
            </span>
          </div>
          <div className="grid gap-3">
            {boireVite.map(wine => (
              <DrinkNowCard
                key={wine.id}
                wine={wine}
                onClick={() => navigate(`/wine/${wine.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* À Boire Section */}
      {aBoire.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wine size={16} className="text-green-600 dark:text-green-400" />
            <h3 className="text-lg font-serif text-green-700 dark:text-green-400">
              À Boire
            </h3>
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-2 py-0.5 rounded-full">
              {aBoire.length}
            </span>
          </div>
          <div className="grid gap-3">
            {aBoire.map(wine => (
              <DrinkNowCard
                key={wine.id}
                wine={wine}
                onClick={() => navigate(`/wine/${wine.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {totalDrinkNow === 0 && (
        <div className="text-center py-20 text-stone-500 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col items-center gap-3">
          <Clock size={48} className="opacity-30" />
          <p className="text-lg font-serif">Tous vos vins sont en garde</p>
          <p className="text-sm">Revenez plus tard, vos vins ont besoin de temps !</p>
        </div>
      )}

      {/* En Garde Section (collapsible) */}
      {enGarde.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowGarde(!showGarde)}
            className="flex items-center gap-2 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
          >
            {showGarde ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="text-sm font-medium">En Garde ({enGarde.length} vins)</span>
          </button>

          {showGarde && (
            <div className="grid gap-2 animate-slide-up">
              {enGarde.map(wine => (
                <div
                  key={wine.id}
                  onClick={() => navigate(`/wine/${wine.id}`)}
                  className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl cursor-pointer hover:border-stone-300 dark:hover:border-stone-700 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-700 dark:text-stone-300 truncate">{wine.name}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-500">{wine.producer} • {wine.vintage} • À partir de {wine.peak.peakStart}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-stone-400 dark:text-stone-600">{wine.inventoryCount} btl</span>
                    <ArrowRight size={14} className="text-stone-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
