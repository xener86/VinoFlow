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
