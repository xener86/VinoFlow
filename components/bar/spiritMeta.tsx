// Bar / Spiritueux — libellés, couleurs et petits composants partagés
// entre la page Bar, la fiche spiritueux et le formulaire d'édition.

import React, { useEffect, useState } from 'react';
import { SpiritType } from '../../types';

export const SPIRIT_LABELS: Record<SpiritType, string> = {
  [SpiritType.WHISKY]: 'Whisky',
  [SpiritType.GIN]: 'Gin',
  [SpiritType.VODKA]: 'Vodka',
  [SpiritType.RUM]: 'Rhum',
  [SpiritType.TEQUILA]: 'Tequila',
  [SpiritType.COGNAC]: 'Cognac',
  [SpiritType.VERMOUTH]: 'Vermouth',
  [SpiritType.LIQUEUR]: 'Liqueur',
  [SpiritType.BITTER]: 'Bitter',
  [SpiritType.OTHER]: 'Autre',
};

export const spiritLabel = (category: string): string =>
  SPIRIT_LABELS[category as SpiritType] ?? category;

/** Pastille de couleur par famille (palette sobre, alignée sur la cave). */
export const spiritDot = (category: string): string => {
  switch (category) {
    case SpiritType.WHISKY: return 'bg-amber-500';
    case SpiritType.GIN: return 'bg-emerald-500';
    case SpiritType.VODKA: return 'bg-sky-400';
    case SpiritType.RUM: return 'bg-orange-700';
    case SpiritType.TEQUILA: return 'bg-yellow-400';
    case SpiritType.COGNAC: return 'bg-wine-800';
    case SpiritType.VERMOUTH: return 'bg-wine-500';
    case SpiritType.LIQUEUR: return 'bg-purple-500';
    case SpiritType.BITTER: return 'bg-stone-800';
    default: return 'bg-stone-400';
  }
};

export const levelTone = (level: number): string => {
  if (level > 50) return 'bg-emerald-500';
  if (level >= 20) return 'bg-amber-400';
  return 'bg-wine-700';
};

export const levelText = (level: number): string => {
  if (level > 50) return 'text-emerald-700';
  if (level >= 20) return 'text-amber-700';
  return 'text-wine-700';
};

/**
 * Curseur du niveau restant dans la bouteille. La valeur est éditée
 * localement et n'est enregistrée qu'au relâchement (souris, doigt, clavier).
 */
export const LevelSlider: React.FC<{
  value: number;
  label: string;
  onCommit: (v: number) => void;
  className?: string;
}> = ({ value, label, onCommit, className = '' }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex-1 min-w-0 h-10 md:h-7 flex items-center">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft}
          aria-label={label}
          aria-valuetext={`${draft} %`}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="peer absolute inset-0 z-10 w-full h-full cursor-pointer opacity-0"
        />
        <div className="relative w-full h-1.5 rounded-full bg-stone-200 pointer-events-none peer-focus-visible:ring-2 peer-focus-visible:ring-wine-600/40 peer-focus-visible:ring-offset-2">
          <div className={`h-full rounded-full ${levelTone(draft)}`} style={{ width: `${draft}%` }} />
          <span
            className="absolute top-1/2 w-3.5 h-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white border border-stone-400 shadow-sm"
            style={{ left: `${draft}%` }}
          />
        </div>
      </div>
      <span className={`mono text-[11px] tabular-nums w-10 text-right ${levelText(draft)}`}>{draft}%</span>
    </div>
  );
};
