// Hard pre-filtering rules.
// Eliminates obvious bad pairings BEFORE the matching score, to reduce noise
// for the LLM2 step and improve quality. These are not about preference, just
// about basic compatibility.

const matches = (text, patterns) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return patterns.some(p => lower.includes(p));
};

/**
 * @param {Object} dishDecomposition - from LLM1
 * @param {Array} criteria.wine_profile.avoid - profiles to exclude
 * @returns {Function} predicate(wine) -> boolean (true = keep)
 */
export const buildHardFilter = (criteria) => {
  const decomp = criteria.decomposition || {};
  const avoid = (criteria.wine_profile?.avoid || []).map(s => s.toLowerCase());
  const allowedTypes = criteria.wine_profile?.types || [];

  return (wine) => {
    if (!wine || !wine.type) return false;

    // Type filter (if LLM specified types, restrict to them)
    if (allowedTypes.length > 0 && !allowedTypes.includes(wine.type)) {
      return false;
    }

    const protein = (decomp.protein || '').toLowerCase();
    const sauce = (decomp.sauce || '').toLowerCase();
    const intensity = (decomp.intensity || '').toLowerCase();
    const sensory = wine.sensoryProfile || wine.sensory_profile || {};

    // Rule 1: Raw fish / sushi / oysters → no tannic red
    if (matches(protein, ['poisson cru', 'sushi', 'sashimi', 'huitre', 'huître', 'tartare']) ||
        matches(sauce, ['cru', 'tartare'])) {
      if (wine.type === 'RED' && (sensory.tannin ?? 50) > 60) return false;
    }

    // Rule 2: Chocolate dessert → no dry white or dry red
    if (matches(protein + sauce, ['chocolat', 'cacao'])) {
      if (wine.type === 'WHITE' && (sensory.sweetness ?? 0) < 50) return false;
      if (wine.type === 'RED' && (sensory.sweetness ?? 0) < 30) return false;
    }

    // Rule 3: Spicy / hot dishes → avoid high alcohol
    if (matches(decomp.spices || '', ['piment', 'curry fort', 'wasabi', 'piquant', 'épicé'])) {
      if ((sensory.alcohol ?? 0) > 80) return false;
    }

    // Rule 4: Light salad / steamed fish → no full-bodied tannic red
    if (intensity === 'light' && matches(protein, ['poisson', 'salade', 'légume'])) {
      if (wine.type === 'RED' && (sensory.body ?? 50) > 70 && (sensory.tannin ?? 50) > 60) return false;
    }

    // Rule 5: Big game / red meat in heavy sauce → no light delicate white
    if (intensity === 'rich' && matches(protein, ['agneau', 'bœuf', 'gibier', 'sanglier', 'cerf'])) {
      if (wine.type === 'WHITE' && (sensory.body ?? 50) < 40) return false;
      if (wine.type === 'ROSE' && (sensory.body ?? 50) < 50) return false;
    }

    // Rule 6: Avoid list textual matching (rough)
    for (const term of avoid) {
      if (term.includes('boisé') && (sensory.oak ?? 0) > 70) return false;
      if (term.includes('tannique') && wine.type === 'RED' && (sensory.tannin ?? 50) > 70) return false;
      if (term.includes('sucré') && (sensory.sweetness ?? 0) > 50) return false;
      if (term.includes('alcool') && (sensory.alcohol ?? 0) > 75) return false;
    }

    return true;
  };
};
