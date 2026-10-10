// Partage d'un lien : feuille native (téléphone) si disponible, sinon copie
// dans le presse-papiers. Non testé (dépend du navigateur) : garder minuscule.
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export const shareLink = async (url: string, title: string): Promise<ShareOutcome> => {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      // L'utilisateur a fermé la feuille : rien à dire.
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Autre refus (contexte non sécurisé, type non géré) : on copie.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};
