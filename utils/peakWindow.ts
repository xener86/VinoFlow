export interface PeakWindowResult {
  status: 'Garde' | 'À Boire' | 'Boire Vite' | 'Apogée passée';
  peakStart: number;
  peakEnd: number;
  source?: 'AI' | 'USER' | 'COMMUNITY' | 'NAIVE';
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface WineLike {
  vintage?: number | null;
  type?: string | null;
  peakStart?: number | null;
  peakEnd?: number | null;
  peakSource?: string | null;
  peakConfidence?: string | null;
}

const computeStatus = (peakStart: number, peakEnd: number): PeakWindowResult['status'] => {
  const currentYear = new Date().getFullYear();
  if (currentYear > peakEnd + 2) return 'Apogée passée';
  if (currentYear > peakEnd) return 'Boire Vite';
  if (currentYear >= peakStart) return 'À Boire';
  return 'Garde';
};

/**
 * Get peak window for a wine.
 * Priority: stored AI/USER peak > naive vintage+type formula.
 *
 * Two call signatures supported for backward compatibility:
 *   getPeakWindow(wine)               — preferred: uses stored peak if any
 *   getPeakWindow(vintage, type)      — legacy: naive formula only
 */
export function getPeakWindow(wineOrVintage: WineLike | number, type?: string): PeakWindowResult {
  if (typeof wineOrVintage === 'object') {
    const wine = wineOrVintage;
    if (wine.peakStart != null && wine.peakEnd != null) {
      return {
        status: computeStatus(wine.peakStart, wine.peakEnd),
        peakStart: wine.peakStart,
        peakEnd: wine.peakEnd,
        source: (wine.peakSource as any) || 'AI',
        confidence: (wine.peakConfidence as any) || 'MEDIUM',
      };
    }
    if (!wine.vintage || !wine.type) {
      return { status: 'Garde', peakStart: 0, peakEnd: 0, source: 'NAIVE' };
    }
    return naivePeak(wine.vintage, wine.type);
  }
  return naivePeak(wineOrVintage, type || '');
}

const naivePeak = (vintage: number, type: string): PeakWindowResult => {
  let peakStart = vintage;
  if (type === 'RED') peakStart += 5;
  else if (type === 'WHITE') peakStart += 2;
  else peakStart += 1;
  const peakEnd = peakStart + 5;
  return {
    status: computeStatus(peakStart, peakEnd),
    peakStart,
    peakEnd,
    source: 'NAIVE',
  };
};

export const getPeakBadgeStyles = (status: string): { bg: string; text: string } => {
  switch (status) {
    case 'À Boire':
      return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' };
    case 'Boire Vite':
      return { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' };
    case 'Apogée passée':
      return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' };
    case 'Garde':
    default:
      return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' };
  }
};
