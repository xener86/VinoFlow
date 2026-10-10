// Réponse publique d'un partage : uniquement les champs autorisés (liste
// blanche). Jamais d'identifiant, de prix, de bouteille, d'emplacement,
// d'apogée, d'occasion ni de convive.

const text = (value) => {
  if (value == null) return null;
  const t = String(value).trim();
  return t ? t : null;
};
const list = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/** Dégustations publiques : note et commentaire, les plus récentes d'abord ; les vides sont ignorées. */
export const toPublicTastings = (rows) => rows
  .filter((t) => t.overall_rating != null || text(t.general_notes))
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .map((t) => ({ date: day(t.date), rating: t.overall_rating == null ? null : Number(t.overall_rating), comment: text(t.general_notes) }));

export const toPublicShare = (share, items) => ({
  kind: share.kind,
  title: share.kind === 'DINNER' ? text(share.title) : null,
  date: share.kind === 'DINNER' ? share.dinner_date || null : null,
  wines: items.map((item, index) => {
    const w = item.wine;
    return {
      position: index + 1,
      dish: text(item.dish),
      name: text(w.name),
      cuvee: text(w.cuvee),
      producer: text(w.producer),
      vintage: w.vintage ?? null,
      type: w.type ?? null,
      appellation: text(w.appellation),
      region: text(w.region),
      country: text(w.country),
      grapeVarieties: list(w.grape_varieties),
      sensoryDescription: text(w.sensory_description),
      aromaProfile: list(w.aroma_profile),
      suggestedFoodPairings: list(w.suggested_food_pairings),
      tastings: toPublicTastings(item.tastings || []),
    };
  }),
});
