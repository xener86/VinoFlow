export interface PeakWindowResult {
  status: 'Garde' | 'À Boire' | 'Boire Vite';
  peakStart: number;
  peakEnd: number;
}

export const getPeakWindow = (vintage: number, type: string): PeakWindowResult => {
  const currentYear = new Date().getFullYear();
  let peakStart = vintage;

  if (type === 'RED') peakStart += 5;
  else if (type === 'WHITE') peakStart += 2;
  else peakStart += 1;

  const peakEnd = peakStart + 5;

  let status: PeakWindowResult['status'] = 'Garde';
  if (currentYear > peakEnd) status = 'Boire Vite';
  else if (currentYear >= peakStart) status = 'À Boire';

  return { status, peakStart, peakEnd };
};

export const getPeakBadgeStyles = (status: string): { bg: string; text: string } => {
  switch (status) {
    case 'À Boire':
      return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' };
    case 'Boire Vite':
      return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' };
    case 'Garde':
    default:
      return { bg: 'bg-stone-100 dark:bg-stone-800', text: 'text-stone-500 dark:text-stone-400' };
  }
};
