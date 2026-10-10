// Vue publique d'un partage. Fonction pure : elle NE COPIE QUE la liste
// blanche ci-dessous. Tout ce qui n'est pas nommé ici (prix, cote, bouteilles,
// emplacements, apogée, identifiants, occasion, convives…) ne sort jamais.

// La dégustation express range sa phrase dans un JSON { phrase, dish,
// occasion, … } ; les autres notes sont du texte brut.
export const tastingComment = (generalNotes) => {
  if (typeof generalNotes !== 'string') return null;
  let text = generalNotes;
  try {
    const parsed = JSON.parse(generalNotes);
    if (parsed && typeof parsed === 'object') text = typeof parsed.phrase === 'string' ? parsed.phrase : '';
  } catch {
    // texte libre
  }
  text = text.trim();
  return text || null;
};

const toIso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const publicTastings = (rows) =>
  rows
    .map((t) => ({ date: toIso(t.date), rating: t.overall_rating ?? null, comment: tastingComment(t.general_notes) }))
    .filter((t) => t.rating !== null || t.comment !== null)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

const publicWine = (wine, position, dish, tastings) => ({
  position,
  dish: dish ?? null,
  name: wine.name,
  cuvee: wine.cuvee ?? null,
  producer: wine.producer ?? null,
  vintage: wine.vintage ?? null,
  type: wine.type ?? null,
  appellation: wine.appellation ?? null,
  region: wine.region ?? null,
  country: wine.country ?? null,
  grapeVarieties: wine.grape_varieties ?? [],
  sensoryDescription: wine.sensory_description ?? null,
  aromaProfile: wine.aroma_profile ?? [],
  suggestedFoodPairings: wine.suggested_food_pairings ?? [],
  tastings: publicTastings(tastings),
});

export const toPublicShare = (share, items, wines, tastings) => {
  const byId = new Map(wines.map((w) => [w.id, w]));
  const ordered = [...items]
    .sort((a, b) => a.position - b.position)
    .filter((item) => byId.has(item.wine_id)); // vin supprimé entre-temps
  const isDinner = share.kind === 'DINNER';
  return {
    kind: share.kind,
    title: isDinner ? share.title ?? null : null,
    date: isDinner ? share.dinner_date ?? null : null,
    wines: ordered.map((item, i) =>
      publicWine(byId.get(item.wine_id), i + 1, item.dish, tastings.filter((t) => t.wine_id === item.wine_id))),
  };
};
