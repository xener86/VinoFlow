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
  outline: 'border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-200',
  ghost:   'hover:bg-stone-100 text-stone-700 dark:hover:bg-stone-800 dark:text-stone-300',
  subtle:  'bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200',
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
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  neutral: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-900/50',
  rare:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-900/50',
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
    className={`rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${className}`}
    {...rest}
  >
    {children}
  </section>
);

// ────────────────────────────────────────────
// Section labels — mono uppercase
// ────────────────────────────────────────────
export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`mono text-[10px] tracking-[0.18em] uppercase text-stone-500 ${className}`}>{children}</div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 className={`text-[15px] font-medium text-stone-900 dark:text-white mt-0.5 ${className}`}>{children}</h3>
);

// ────────────────────────────────────────────
// MonoLabel — for breadcrumbs, status bars
// ────────────────────────────────────────────
export const MonoLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`mono text-[10px] tracking-widest text-stone-500 uppercase ${className}`}>{children}</span>
);

// ────────────────────────────────────────────
// KPI — large number stat block with sub-info
// ────────────────────────────────────────────
interface KpiProps {
  label: string;
  value: React.ReactNode;
  unit?: string;          // discreet `.X` notation after the value
  hint?: React.ReactNode; // small line below
  trend?: React.ReactNode; // mini chart, sparkline, or progress bar
  className?: string;
}

export const Kpi: React.FC<KpiProps> = ({ label, value, unit, hint, trend, className = '' }) => (
  <div className={`rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 px-5 py-4 ${className}`}>
    <MonoLabel className="mb-1.5">{label}</MonoLabel>
    <div className="flex items-baseline gap-1 mt-1">
      <span className="serif text-4xl text-stone-900 dark:text-white leading-none">{value}</span>
      {unit && <span className="serif text-xl text-stone-400 leading-none">.{unit}</span>}
    </div>
    {hint && <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">{hint}</div>}
    {trend && <div className="mt-2">{trend}</div>}
  </div>
);

// ────────────────────────────────────────────
// PageHeader — breadcrumb + title row
// ────────────────────────────────────────────
interface PageHeaderProps {
  breadcrumb: string[];   // e.g. ["VINOFLOW", "DASHBOARD"]
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ breadcrumb, title, subtitle, rightSlot, className = '' }) => (
  <div className={`flex items-end justify-between gap-4 ${className}`}>
    <div>
      <MonoLabel>{breadcrumb.join(' · ')}</MonoLabel>
      <h1 className="serif text-3xl md:text-4xl text-stone-900 dark:text-white mt-1 leading-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
    </div>
    {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
  </div>
);

// ────────────────────────────────────────────
// Skeleton — loading shimmer
// ────────────────────────────────────────────
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-stone-100 dark:bg-stone-800 rounded ${className}`} />
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
        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700 dark:hover:bg-stone-800'
    } ${className}`}
    {...rest}
  >
    {children}
  </button>
);

// ────────────────────────────────────────────
// PulseDot — live status indicator
// ────────────────────────────────────────────
export const PulseDot: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 ${className}`}>
    <span className="relative flex h-1.5 w-1.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wine-600 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wine-700"></span>
    </span>
    {children && <span className="mono text-[10px] tracking-widest uppercase text-stone-600">{children}</span>}
  </span>
);
