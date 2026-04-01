import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, title, subtitle, children }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsAnimating(true));
      });
      // Lock body scroll
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;
    if (diff > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${diff}px)`;
    }
  };

  const handleTouchEnd = () => {
    const diff = currentY.current - startY.current;
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    if (diff > 100) {
      onClose();
    }
    startY.current = 0;
    currentY.current = 0;
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-stone-900 rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab">
          <div className="w-10 h-1 bg-stone-300 dark:bg-stone-700 rounded-full" />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div className="px-6 pb-3 flex items-start justify-between">
            <div>
              {title && <h3 className="text-xl font-serif text-stone-900 dark:text-white">{title}</h3>}
              {subtitle && <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-white transition-colors -mt-1"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-6 pb-8 overflow-y-auto max-h-[calc(85vh-80px)]" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
