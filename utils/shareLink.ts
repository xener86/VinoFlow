/**
 * Partage un lien : feuille de partage du téléphone (iMessage, WhatsApp…) si
 * disponible, sinon copie dans le presse-papiers.
 */
export const shareOrCopy = async ({ title, url }: { title: string; url: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> => {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav?.share) {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (!nav?.clipboard?.writeText) return 'failed';
    await nav.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};

/** Bouton « Copier » : copie directe, sans feuille de partage (qui, sur téléphone, proposerait autre chose qu'une copie). */
export const copyLink = async (url: string): Promise<boolean> => {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  try {
    if (!nav?.clipboard?.writeText) return false;
    await nav.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
};
