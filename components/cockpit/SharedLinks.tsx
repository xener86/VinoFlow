// Réglages → liens partagés : copier, modifier (carte de dîner), révoquer.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ListPlus, Loader2, Pencil, Wine as WineIcon, Utensils } from 'lucide-react';
import { listShares, revokeShare } from '../../services/storageService';
import type { ShareSummary } from '../../types';
import { absoluteUrl, frenchDate } from '../../utils/shareView';
import { shareOrCopy } from '../../utils/shareLink';
import { Badge, Button } from './primitives';
import { useConfirm, useToast } from './feedback';

const titleOf = (s: ShareSummary) => (s.kind === 'DINNER' ? s.title || 'Carte de dîner' : [s.wineName, s.wineVintage].filter(Boolean).join(' '));

export const SharedLinks: React.FC = () => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [shares, setShares] = useState<ShareSummary[] | null>(null);

  const load = useCallback(() => {
    listShares().then(setShares).catch(() => setShares([]));
  }, []);
  useEffect(load, [load]);

  const copy = async (s: ShareSummary) => {
    const url = absoluteUrl(`/p/${s.token}`);
    const result = await shareOrCopy({ title: titleOf(s), url });
    if (result === 'copied') toast.success('Lien copié');
    else if (result === 'failed') toast.info(url);
  };

  const revoke = async (s: ShareSummary) => {
    const ok = await confirmAction({
      title: 'Révoquer ce lien ?',
      message: <>Les personnes qui ont <strong>{titleOf(s)}</strong> ne pourront plus l’ouvrir. C’est définitif : il faudra créer un nouveau lien.</>,
      confirmLabel: 'Révoquer',
    });
    if (!ok) return;
    try {
      await revokeShare(s.id);
      toast.success('Lien révoqué');
      load();
    } catch (e) {
      toast.error(`Révocation impossible : ${e instanceof Error ? e.message : ''}`);
    }
  };

  if (shares === null) return <Loader2 className="w-4 h-4 animate-spin text-stone-400" />;

  return (
    <div className="space-y-3">
      <Link to="/partages/diner"><Button variant="outline"><ListPlus className="w-4 h-4" />Nouvelle carte de dîner</Button></Link>
      {shares.length === 0 ? (
        <p className="text-sm text-stone-500">Aucun lien partagé. Partage une fiche depuis la page d’un vin, ou compose une carte de dîner.</p>
      ) : (
        <ul className="divide-y divide-stone-100 border-y border-stone-100">
          {shares.map(s => (
            <li key={s.id} className={`py-2.5 flex items-center gap-3 ${s.revokedAt ? 'opacity-50' : ''}`}>
              {s.kind === 'DINNER' ? <Utensils className="w-4 h-4 text-stone-400 shrink-0" /> : <WineIcon className="w-4 h-4 text-stone-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-900 truncate">{titleOf(s)}</div>
                <div className="text-xs text-stone-500">
                  {s.kind === 'DINNER' ? `${s.itemCount} vin(s)${s.dinnerDate ? ` · ${frenchDate(s.dinnerDate)}` : ''} · ` : ''}
                  ouvert {s.viewCount} fois
                </div>
              </div>
              {s.revokedAt ? <Badge>RÉVOQUÉ</Badge> : (
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => copy(s)} aria-label="Copier le lien"><Copy className="w-3.5 h-3.5" /></Button>
                  {s.kind === 'DINNER' && <Link to={`/partages/diner/${s.id}`}><Button size="sm" variant="ghost" aria-label="Modifier"><Pencil className="w-3.5 h-3.5" /></Button></Link>}
                  <Button size="sm" variant="danger" onClick={() => revoke(s)}>Révoquer</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
