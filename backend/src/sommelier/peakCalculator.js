// Statut d'une fenêtre d'apogée stockée. Le calcul des fenêtres se fait dans
// enrichment/ (cascade sourcée, repli enrichment/rules.js).

/**
 * Determine the current status from a peak window.
 */
export const peakStatus = (peakStart, peakEnd) => {
  const currentYear = new Date().getFullYear();
  if (currentYear < peakStart) return 'Garde';
  if (currentYear > peakEnd) return 'Apogée passée';
  // Within the peak window — flag end-of-window
  if (peakEnd - currentYear <= 1) return 'Boire Vite';
  return 'À Boire';
};
