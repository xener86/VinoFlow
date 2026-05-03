// Peak drinking window logic.
//
// Two sources of truth, in priority order:
//   1. The wine's stored peak_start/peak_end (computed by AI via peakCalculator
//      or set manually by USER) — authoritative, takes wine prestige into account
//   2. The naive vintage+type formula — fallback for wines without an AI peak

export const getPeakWindow = (vintageOrWine, type) => {
  // Overload: accept a full wine object as first arg
  if (typeof vintageOrWine === 'object' && vintageOrWine !== null) {
    const wine = vintageOrWine;
    const peakStart = wine.peakStart ?? wine.peak_start;
    const peakEnd = wine.peakEnd ?? wine.peak_end;
    if (peakStart && peakEnd) {
      return computeStatus(peakStart, peakEnd);
    }
    return naiveWindow(wine.vintage, wine.type);
  }
  // Legacy signature: (vintage, type)
  return naiveWindow(vintageOrWine, type);
};

const naiveWindow = (vintage, type) => {
  if (!vintage || !type) return null;
  let peakStart = vintage;
  if (type === 'RED') peakStart += 5;
  else if (type === 'WHITE') peakStart += 2;
  else peakStart += 1;
  const peakEnd = peakStart + 5;
  return computeStatus(peakStart, peakEnd);
};

const computeStatus = (peakStart, peakEnd) => {
  const currentYear = new Date().getFullYear();
  let status = 'Garde';
  if (currentYear > peakEnd) status = 'Boire Vite';
  else if (currentYear >= peakStart) status = 'À Boire';
  // "Apogée passée" if more than 2 years past peak end
  if (currentYear > peakEnd + 2) status = 'Apogée passée';
  return { status, peakStart, peakEnd };
};
