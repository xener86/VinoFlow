// Cockpit design system — atomic primitives.
// Ported from design-protos/proto/ui.jsx, typed in TypeScript.
// Use these instead of raw Tailwind for consistency across the app.

import React, { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';

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
  danger:  'border border-wine-200 bg-white hover:bg-wine-50 text-wine-700',
};

// Cibles tactiles plus hautes sur mobile (usage « à la cave »).
const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 md:h-7 px-2.5 text-xs',
  md: 'h-10 md:h-9 px-3.5 text-sm',
  lg: 'h-11 px-5 text-base',
  icon: 'h-10 w-10 md:h-9 md:w-9',
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

// ────────────────────────────────────────────
// Field — libellé + champ (input, select, textarea)
// ────────────────────────────────────────────
const FIELD_BASE = 'w-full rounded-md border border-stone-300 bg-white text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-wine-600 focus:ring-2 focus:ring-wine-600/30 disabled:bg-stone-50 disabled:text-stone-400';

interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: (id: string, describedBy?: string) => React.ReactNode;
}

/** Enveloppe générique : `<Field label="Nom">{(id) => <input id={id} … />}</Field>` */
export const Field: React.FC<FieldProps> = ({ label, hint, error, className = '', children }) => {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mono block text-[10px] tracking-widest text-stone-500 uppercase mb-1.5">{label}</label>}
      {children(id, descId)}
      {(hint || error) && (
        <div id={descId} className={`mt-1 text-xs ${error ? 'text-wine-700' : 'text-stone-500'}`}>{error || hint}</div>
      )}
    </div>
  );
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; wrapperClassName?: string };
export const Input: React.FC<InputProps> = ({ label, hint, error, wrapperClassName, className = '', ...rest }) => (
  <Field label={label} hint={hint} error={error} className={wrapperClassName}>
    {(id, desc) => <input id={id} aria-describedby={desc} aria-invalid={error ? true : undefined} className={`${FIELD_BASE} h-11 md:h-9 px-3 ${className}`} {...rest} />}
  </Field>
);

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: React.ReactNode; hint?: React.ReactNode; wrapperClassName?: string };
export const Select: React.FC<SelectProps> = ({ label, hint, wrapperClassName, className = '', children, ...rest }) => (
  <Field label={label} hint={hint} className={wrapperClassName}>
    {(id, desc) => <select id={id} aria-describedby={desc} className={`${FIELD_BASE} h-11 md:h-9 px-2 ${className}`} {...rest}>{children}</select>}
  </Field>
);

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: React.ReactNode; hint?: React.ReactNode; wrapperClassName?: string };
export const Textarea: React.FC<TextareaProps> = ({ label, hint, wrapperClassName, className = '', ...rest }) => (
  <Field label={label} hint={hint} className={wrapperClassName}>
    {(id, desc) => <textarea id={id} aria-describedby={desc} className={`${FIELD_BASE} px-3 py-2 ${className}`} {...rest} />}
  </Field>
);

// ────────────────────────────────────────────
// Tabs — onglets segmentés
// ────────────────────────────────────────────
interface TabItem<K extends string> { key: K; label: React.ReactNode; icon?: React.FC<{ className?: string }>; count?: number }
interface TabsProps<K extends string> {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  className?: string;
  'aria-label'?: string;
}

export function Tabs<K extends string>({ items, value, onChange, className = '', ...rest }: TabsProps<K>) {
  return (
    <div role="tablist" aria-label={rest['aria-label']} className={`inline-flex max-w-full overflow-x-auto no-scrollbar items-center gap-1 rounded-md bg-stone-100 p-1 ${className}`}>
      {items.map(({ key, label, icon: Icon, count }) => {
        const active = key === value;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`shrink-0 inline-flex items-center gap-2 h-10 md:h-9 px-3.5 rounded text-sm transition-colors ${
              active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
            {count != null && <span className="mono text-[10px] text-stone-400">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────
// Modal — panneau centré (bas d'écran sur mobile)
// ────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const MODAL_SIZES = { sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-3xl' };

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, subtitle, footer, size = 'md', children }) => {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-stone-900/40 md:p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${MODAL_SIZES[size]} max-h-[92vh] flex flex-col rounded-t-xl md:rounded-md bg-white border border-stone-200 shadow-xl outline-none animate-slide-up md:animate-fade-in-up`}
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-stone-100">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="serif text-lg text-stone-900 leading-tight">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-stone-500">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Fermer" className="-mr-2 h-10 w-10 md:h-8 md:w-8 inline-flex items-center justify-center rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-stone-100 flex justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// EmptyState — rien à afficher
// ────────────────────────────────────────────
export const EmptyState: React.FC<{ title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ title, hint, action, className = '' }) => (
  <div className={`px-6 py-12 text-center ${className}`}>
    <div className="serif-it text-lg text-stone-400">{title}</div>
    {hint && <div className="mono text-[10px] tracking-widest text-stone-400 mt-2 uppercase">{hint}</div>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

// ────────────────────────────────────────────
// AiLoading — état de chargement des appels IA (souvent 5 à 30 s)
// ────────────────────────────────────────────
export const AiLoading: React.FC<{ label?: string; hint?: string; className?: string }> = ({ label = 'Le sommelier réfléchit…', hint = 'Cela peut prendre une vingtaine de secondes', className = '' }) => (
  <div role="status" aria-live="polite" className={`flex items-center gap-3 rounded-md border border-wine-100 bg-wine-50/50 px-4 py-3 ${className}`}>
    <Loader2 className="w-4 h-4 text-wine-700 animate-spin shrink-0" />
    <div>
      <div className="text-sm text-stone-800">{label}</div>
      {hint && <div className="mono text-[10px] tracking-widest text-stone-500 uppercase mt-0.5">{hint}</div>}
    </div>
  </div>
);

// ────────────────────────────────────────────
// WineLink — tout vin affiché mène à sa fiche
// ────────────────────────────────────────────
export const WineLink: React.FC<{ id: string; className?: string; children: React.ReactNode; title?: string }> = ({ id, className = '', children, title }) => (
  <Link to={`/wine/${id}`} title={title} className={`hover:text-wine-700 hover:underline underline-offset-2 decoration-wine-300 ${className}`}>
    {children}
  </Link>
);
