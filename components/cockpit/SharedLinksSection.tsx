// Réglages → Liens partagés : une ligne par lien (fiche ou dîner), Copier,
// Modifier (dîner actif), Révoquer (définitif, confirmé). Cave partagée :
// tous les comptes voient et révoquent tous les liens.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Pencil, Plus, Ban, Wine as WineIcon, UtensilsCrossed } from 'lucide-react';
import { listShares, revokeShare } from '../../services/storageService';
import type { ShareSummary } from '../../types';
import { formatLongDate, serverMessage, shareUrl } from '../../utils/shareView';
import { copyLink } from '../../utils/shareLink';
import { useConfirm, useToast } from './feedback';
import { Badge, Button, Skeleton } from './primitives';
import { ShareLinkDialog } from './ShareLinkDialog';

const label = (s: ShareSummary) =>
  s.kind === 'WINE'
    ? [s.wineName ?? 'Vin supprimé', s.wineVintage].filter(Boolean).join(' ')
    : s.title ?? 'Carte sans titre';

const detail = (s: ShareSummary) => {
  const parts = [s.kind === 'WINE' ? 'Fiche vin' : `Carte · ${s.itemCount} vin${s.itemCount > 1 ? 's' : ''}`];
  if (s.kind === 'DINNER' && s.dinnerDate) parts.push(formatLongDate(s.dinnerDate));
  parts.push(s.viewCount === 0 ? 'jamais ouvert' : `ouvert ${s.viewCount} fois`);
  return parts.join(' · ');
};

export const SharedLinksSection: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [shares, setShares] = useState<ShareSummary[] | null>(null);
  const [shown, setShown] = useState<ShareSummary | null>(null);

  const load = useCallback(() => {
    listShares().then(setShares).catch(() => { setShares([]); toast.error('Impossible de charger les liens partagés.'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  const copy = async (s: ShareSummary) => {
    if (await copyLink(shareUrl(s.token))) toast.success('Lien copié');
    else toast.error('Impossible de copier le lien.', { label: 'Voir', onClick: () => setShown(s) });
  };

  const revoke = async (s: ShareSummary) => {
    const ok = await confirm({
      title: 'Révoquer ce lien ?',
      message: <>« {label(s)} » affichera « Ce lien n’est plus actif » pour tous ceux qui l’ont reçu. C’est définitif.</>,
      confirmLabel: 'Révoquer',
      danger: true,
    });
    if (!ok) return;
    try {
      await revokeShare(s.id);
      toast.success('Lien révoqué');
      load();
    } catch (e) {
      toast.error(serverMessage(e, 'La révocation a échoué.'));
    }
  };

  return (
    <div>
      <ShareLinkDialog url={shown ? shareUrl(shown.token) : null} title={shown ? label(shown) : ''} onClose={() => setShown(null)} />
      <div className="flex justify-end mb-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/partages/diner')}><Plus className="w-3.5 h-3.5" />Nouvelle carte de dîner</Button>
      </div>
      {shares === null && <Skeleton className="h-16" />}
      {shares && shares.length === 0 && (
        <p className="text-sm text-stone-400 italic">Aucun lien partagé. Depuis une fiche vin, « Partager » crée un lien public ; une carte de dîner réunit plusieurs vins.</p>
      )}
      {shares && shares.length > 0 && (
        <ul className="divide-y divide-stone-100">
          {shares.map((s) => {
            const active = !s.revokedAt;
            return (
              <li key={s.id} className={`py-3 flex flex-col sm:flex-row sm:items-center gap-2 ${active ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {s.kind === 'WINE' ? <WineIcon className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" /> : <UtensilsCrossed className="w-4 h-4 text-stone-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-stone-900 truncate">{label(s)}</span>
                      <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Actif' : 'Révoqué'}</Badge>
                    </div>
                    <div className="text-xs text-stone-500 first-letter:uppercase">{detail(s)}</div>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 sm:ml-auto">
                  {active && <Button variant="ghost" size="sm" onClick={() => copy(s)} title="Copier le lien"><Copy className="w-3.5 h-3.5" />Copier</Button>}
                  {active && s.kind === 'DINNER' && <Button variant="ghost" size="sm" onClick={() => navigate(`/partages/diner/${s.id}`)}><Pencil className="w-3.5 h-3.5" />Modifier</Button>}
                  {active && <Button variant="danger" size="sm" onClick={() => revoke(s)}><Ban className="w-3.5 h-3.5" />Révoquer</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
