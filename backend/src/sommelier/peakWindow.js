// Same logic as frontend utils/peakWindow.ts, ported to ESM/JS for backend use.

export const getPeakWindow = (vintage, type) => {
  if (!vintage || !type) return null;
  const currentYear = new Date().getFullYear();
  let peakStart = vintage;

  if (type === 'RED') peakStart += 5;
  else if (type === 'WHITE') peakStart += 2;
  else peakStart += 1;

  const peakEnd = peakStart + 5;

  let status = 'Garde';
  if (currentYear > peakEnd) status = 'Boire Vite';
  else if (currentYear >= peakStart) status = 'À Boire';

  return { status, peakStart, peakEnd };
};
