import React from 'react';
import { Sparkles, User, Wine, Users, ShieldCheck } from 'lucide-react';

interface Props {
  source?: string | null;       // AI | USER | TASTING | COMMUNITY | CONSENSUS
  confidence?: string | null;   // HIGH | MEDIUM | LOW
  size?: 'sm' | 'md';
}

const labelMap: Record<string, { label: string; Icon: React.FC<any>; bg: string; text: string }> = {
  USER:      { label: 'Verifié',     Icon: ShieldCheck, bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-400' },
  TASTING:   { label: 'Dégusté',     Icon: Wine,        bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  CONSENSUS: { label: 'Consensus',   Icon: Users,       bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-400' },
  COMMUNITY: { label: 'Communauté',  Icon: Users,       bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-400' },
  AI_HIGH:   { label: 'IA - sûre',   Icon: Sparkles,    bg: 'bg-stone-100 dark:bg-stone-800',      text: 'text-stone-700 dark:text-stone-300' },
  AI_MEDIUM: { label: 'IA - moyenne', Icon: Sparkles,   bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  AI_LOW:    { label: 'IA - faible', Icon: Sparkles,    bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  NONE:      { label: 'À vérifier',  Icon: User,        bg: 'bg-stone-100 dark:bg-stone-800',      text: 'text-stone-500 dark:text-stone-400' },
};

const resolveKey = (source?: string | null, confidence?: string | null) => {
  if (!source && !confidence) return 'NONE';
  if (source && source !== 'AI') return source;
  if (confidence === 'HIGH') return 'AI_HIGH';
  if (confidence === 'MEDIUM') return 'AI_MEDIUM';
  if (confidence === 'LOW') return 'AI_LOW';
  return 'NONE';
};

export const AromaConfidenceBadge: React.FC<Props> = ({ source, confidence, size = 'sm' }) => {
  const key = resolveKey(source, confidence);
  const meta = labelMap[key] || labelMap.NONE;
  const { Icon, label, bg, text } = meta;
  const sizeCls = size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-1 gap-1.5';

  return (
    <span className={`inline-flex items-center rounded-full ${bg} ${text} ${sizeCls} font-medium`} title={`Source: ${source || 'aucune'} — Confiance: ${confidence || '?'}`}>
      <Icon size={size === 'sm' ? 10 : 12} />
      {label}
    </span>
  );
};
