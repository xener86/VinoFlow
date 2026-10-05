// La dégustation express (CockpitTasting) range sa phrase libre dans un JSON
// stocké dans generalNotes ; les autres notes y mettent du texte brut.
export const tastingPhrase = (generalNotes: string | null | undefined): string => {
  if (!generalNotes) return '';
  try {
    const parsed = JSON.parse(generalNotes);
    if (parsed && typeof parsed === 'object') return typeof parsed.phrase === 'string' ? parsed.phrase : '';
  } catch {
    // texte libre
  }
  return generalNotes;
};
