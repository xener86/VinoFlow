// Profil aromatique issu des notes de dégustation de l'utilisateur.
// L'enrichissement par recherche web est dans enrichment/ (cascade sourcée).

/**
 * Convert palate/nose tasting notes into aroma updates.
 * Used for the "tasting → aroma" feedback loop (Phase 3.3).
 *
 * Aromas mentioned across multiple tasting notes get higher weight.
 * Returns a deduplicated list of aromas inferred from tastings.
 */
export const aromasFromTastingNotes = (tastingNotes) => {
  if (!Array.isArray(tastingNotes) || tastingNotes.length === 0) return [];

  const counter = {};
  for (const note of tastingNotes) {
    const sources = [
      note.noseNotes,
      note.nose_notes,
      note.palateNotes,
      note.palate_notes,
    ].filter(Boolean);

    for (const src of sources) {
      // Tolerant extraction: arrays of strings, or {aromas: [...]}, or text
      const list = Array.isArray(src)
        ? src
        : Array.isArray(src?.aromas) ? src.aromas
        : typeof src === 'object' ? Object.values(src).flat().filter(v => typeof v === 'string')
        : typeof src === 'string' ? src.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
        : [];

      for (const item of list) {
        const key = String(item).toLowerCase().trim();
        if (key.length > 0 && key.length < 40) {
          counter[key] = (counter[key] || 0) + 1;
        }
      }
    }
  }

  // Keep aromas that appear at least once, sorted by frequency
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .map(([aroma]) => aroma);
};
