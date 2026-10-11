// Repli d'affichage d'un lien public quand ni la feuille de partage ni le
// presse-papiers ne sont disponibles (Safari après un délai, contexte sans
// permission) : le lien est lisible, sélectionné au focus, copiable à la main.
import React from 'react';
import { Copy } from 'lucide-react';
import { Button, Modal } from './primitives';
import { copyLink } from '../../utils/shareLink';
import { useToast } from './feedback';

export const ShareLinkDialog: React.FC<{ url: string | null; title: string; onClose: () => void }> = ({ url, title, onClose }) => {
  const toast = useToast();
  return (
    <Modal open={Boolean(url)} onClose={onClose} title="Lien public" subtitle={title} size="sm"
      footer={<Button variant="outline" onClick={() => copyLink(url ?? '').then((ok) => (ok ? toast.success('Lien copié') : toast.error('Sélectionne le lien et copie-le.')))}><Copy className="w-4 h-4" />Copier</Button>}>
      <input
        readOnly
        autoFocus
        value={url ?? ''}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Lien public"
        className="w-full rounded-md border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm mono text-stone-700"
      />
      <p className="text-xs text-stone-500 mt-2">Toute personne qui a ce lien peut ouvrir la page, sans compte. Révocable depuis Réglages → Liens partagés.</p>
    </Modal>
  );
};
