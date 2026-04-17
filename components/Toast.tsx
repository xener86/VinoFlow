import React, { useState, useEffect, useCallback } from 'react';
import { X, Undo2, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

interface ToastData {
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  onUndo?: () => void;
}

interface ToastProps extends ToastData {
  duration?: number;
  onClose: () => void;
}

const iconMap = {
  success: CheckCircle,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

const bgMap = {
  success: 'bg-green-600 dark:bg-green-700',
  info: 'bg-stone-800 dark:bg-stone-700',
  warning: 'bg-amber-600 dark:bg-amber-700',
  error: 'bg-red-600 dark:bg-red-700',
};

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = 5000, onUndo, onClose }) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setExiting(true);
      closeTimer = setTimeout(onClose, 300);
    }, duration);
    return () => {
      clearTimeout(timer);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [duration, onClose]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(onClose, 300);
  };

  const handleUndo = () => {
    if (onUndo) onUndo();
    handleClose();
  };

  const Icon = iconMap[type];

  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] ${bgMap[type]} text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-[90vw] transition-all duration-300 ${
        exiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0 animate-fade-in-up'
      }`}
    >
      <Icon size={16} className="flex-shrink-0 opacity-80" />
      <span className="text-sm font-medium flex-1">{message}</span>
      {onUndo && (
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 text-xs font-bold bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
        >
          <Undo2 size={12} /> Annuler
        </button>
      )}
      <button onClick={handleClose} className="text-white/50 hover:text-white flex-shrink-0 transition-colors">
        <X size={16} />
      </button>
    </div>
  );
};

/**
 * Hook for managing toast notifications.
 * Usage:
 *   const { toast, showToast, hideToast } = useToast();
 *   showToast('Bouteille consommée !', 'success', undoFn);
 *   {toast && <Toast {...toast} onClose={hideToast} />}
 */
export const useToast = () => {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback((
    message: string,
    type: ToastData['type'] = 'info',
    onUndo?: () => void
  ) => {
    setToast({ message, type, onUndo });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
};
