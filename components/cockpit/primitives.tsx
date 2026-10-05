// Cockpit design system — atomic primitives.
// Ported from design-protos/proto/ui.jsx, typed in TypeScript.
// Use these instead of raw Tailwind for consistency across the app.

import React from 'react';

// ────────────────────────────────────────────
// Button
// ────────────────────────────────────────────
type ButtonVariant = 'default' | 'outline' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-wine-600/40';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-wine-700 hover:bg-wine-800 text-white',
  outline: 'border border-stone-300 bg-white hover:bg-stone-50 text-stone-700',
  ghost:   'hover:bg-stone-100 text-stone-700',
  subtle:  'bg-stone-100 hover:bg-stone-200 text-stone-800',
  danger:  'bg-wine-700 hover:bg-wine-800 text-white',
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-11 px-5 text-base',
  icon: 'h-9 w-9',
};

export const Button: React.FC<ButtonProps> = ({ variant = 'default', size = 'md', className = '', children, ...rest }) => (
  <button className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`} {...rest}>
    {children}
  </button>
);

// ────────────────────────────────────────────
// Badge — urgency / status pills
// ────────────────────────────────────────────
type BadgeTone = 'urgent' | 'warning' | 'neutral' | 'success' | 'rare';

interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}

const BADGE_TONES: Record<BadgeTone, string> = {
  urgent:  'bg-wine-700 text-white',
  warning: 'bg-amber-100 text-amber-800',
  neutral: 'bg-stone-100 text-stone-600',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rare:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
};

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className = '', children }) => (
  <span className={`mono inline-flex items-center px-1.5 py-0.5 rounded font-medium text-[10px] ${BADGE_TONES[tone]} ${className}`}>
    {children}
  </span>
);

// ────────────────────────────────────────────
// Card — sober container
// ────────────────────────────────────────────
interface CardProps extends React.HTMLAttributes<HTMLElement> {}

export const Card: React.FC<CardProps> = ({ className = '', children, ...rest }) => (
  <section
    className={`rounded-md border border-stone-200 bg-white ${className}`}
    {...rest}
  >
    {children}
  </section>
);

// ────────────────────────────────────────────
// MonoLabel — for breadcrumbs, status bars
// ────────────────────────────────────────────
export const MonoLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`mono text-[10px] tracking-widest text-stone-500 uppercase ${className}`}>{children}</span>
);

// ────────────────────────────────────────────
// Skeleton — loading shimmer
// ────────────────────────────────────────────
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-stone-100 rounded ${className}`} />
);

// ────────────────────────────────────────────
// Chip — pill button (for filters, prompts)
// ────────────────────────────────────────────
interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Chip: React.FC<ChipProps> = ({ active = false, className = '', children, ...rest }) => (
  <button
    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors border ${
      active
        ? 'bg-wine-700 text-white border-wine-700'
        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
    } ${className}`}
    {...rest}
  >
    {children}
  </button>
);
