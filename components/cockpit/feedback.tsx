// Feedback utilisateur Cockpit : toasts (succès / erreur / info) et boîte de
// confirmation, à la place des alert() / confirm() natifs.
//
//   const toast = useToast();      toast.success('Bouteille ouverte');
//   const confirm = useConfirm();  if (await confirm({ title, message, danger: true })) …

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; message: string; action?: { label: string; onClick: () => void } }
interface ToastApi {
  success: (message: string, action?: ToastItem['action']) => void;
  error: (message: string, action?: ToastItem['action']) => void;
  info: (message: string, action?: ToastItem['action']) => void;
}

interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

const ToastContext = createContext<ToastApi | null>(null);
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

const TONE_STYLES: Record<ToastTone, { box: string; icon: React.ReactNode }> = {
  success: { box: 'border-emerald-200', icon: <Check className="w-4 h-4 text-emerald-600" /> },
  error: { box: 'border-wine-200', icon: <AlertTriangle className="w-4 h-4 text-wine-700" /> },
  info: { box: 'border-stone-200', icon: <Info className="w-4 h-4 text-stone-500" /> },
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: ToastTone, message: string, action?: ToastItem['action']) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, message, action }]);
    setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
  }, [dismiss]);

  const api = useRef<ToastApi>({
    success: (m, a) => push('success', m, a),
    error: (m, a) => push('error', m, a),
    info: (m, a) => push('info', m, a),
  }).current;

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const close = (value: boolean) => { pending?.resolve(value); setPending(null); };

  return (
    <ToastContext.Provider value={api}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        {/* Toasts : au-dessus de la barre de navigation mobile */}
        <div className="fixed z-[70] bottom-24 md:bottom-6 right-4 left-4 md:left-auto md:w-96 flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`pointer-events-auto flex items-start gap-3 rounded-md border bg-white shadow-lg px-4 py-3 text-sm text-stone-800 animate-fade-in-up ${TONE_STYLES[t.tone].box}`}>
              <span className="mt-0.5 shrink-0">{TONE_STYLES[t.tone].icon}</span>
              <span className="flex-1 leading-snug">{t.message}</span>
              {t.action && (
                <button onClick={() => { t.action!.onClick(); dismiss(t.id); }} className="mono text-[10px] tracking-widest text-wine-700 hover:text-wine-800 uppercase shrink-0 self-center">
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} aria-label="Fermer" className="shrink-0 -mr-1 p-1 text-stone-400 hover:text-stone-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {pending && <ConfirmDialog {...pending} onClose={close} />}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
};

const ConfirmDialog: React.FC<ConfirmOptions & { onClose: (v: boolean) => void }> = ({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger, onClose }) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-stone-900/40 p-4" onClick={() => onClose(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-md bg-white border border-stone-200 shadow-xl p-5">
        <h2 id="confirm-title" className="serif text-lg text-stone-900">{title}</h2>
        {message && <div className="mt-2 text-sm text-stone-600 leading-relaxed">{message}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => onClose(false)} className="h-11 md:h-9 px-4 rounded-md border border-stone-300 bg-white hover:bg-stone-50 text-sm text-stone-700">{cancelLabel}</button>
          <button ref={confirmRef} onClick={() => onClose(true)} className={`h-11 md:h-9 px-4 rounded-md text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${danger ? 'bg-wine-700 hover:bg-wine-800 focus-visible:ring-wine-600' : 'bg-stone-900 hover:bg-stone-800 focus-visible:ring-stone-600'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans <FeedbackProvider>');
  return ctx;
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm doit être utilisé dans <FeedbackProvider>');
  return ctx;
};
