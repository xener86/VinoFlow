import React, { useEffect, useState } from 'react';
import { GlassWater, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { Button, Card, MonoLabel, WineLink } from './primitives';
import { useToast } from './feedback';
import { useOpenBottleConfirm } from './openBottle';
import { consumeSpecificBottle, getBottles, getTonight, resuggestTonight } from '../../services/storageService';
import { TonightResponse } from '../../types';

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'erreur inconnue');
const label = (w: { wine: string; vintage: number | null }) => (w.vintage ? `${w.wine} ${w.vintage}` : w.wine);

/** Dîner MenuFlow du jour et vin conseillé dans la cave (absent si MenuFlow n'est pas relié). */
export const TonightCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const toast = useToast();
  const confirmOpen = useOpenBottleConfirm();
  const [tonight, setTonight] = useState<TonightResponse | null>(null);
  const [busy, setBusy] = useState<'resuggest' | 'open' | null>(null);

  useEffect(() => { getTonight().then(setTonight).catch(() => setTonight(null)); }, []);
  if (!tonight || !tonight.configured || !tonight.dinner) return null;
  const { dinner, suggested, opened } = tonight;

  const another = async () => {
    setBusy('resuggest');
    try { setTonight(await resuggestTonight()); } catch (e) { toast.error('Pas d’autre idée pour l’instant : ' + errMsg(e)); } finally { setBusy(null); }
  };

  const open = async () => {
    if (!suggested) return;
    const choice = await confirmOpen(suggested.wine);
    if (!choice) return;
    setBusy('open');
    try {
      const bottle = (await getBottles()).find((b) => b.wineId === suggested.wineId && !b.isConsumed);
      if (!bottle) throw new Error('plus de bouteille en stock');
      await consumeSpecificBottle(suggested.wineId, bottle.id, suggested.wine, suggested.vintage ?? undefined, choice.forDinner);
      toast.success('Bouteille ouverte — santé !');
      setTonight(await getTonight());
    } catch (e) {
      toast.error('La bouteille n’a pas pu être ouverte : ' + errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className={`p-4 md:p-5 ${className}`}>
      <MonoLabel>◌ CE SOIR · MENUFLOW</MonoLabel>
      <h2 className="serif-it text-xl text-stone-900 leading-tight mt-1">{dinner.title}</h2>
      {opened.length > 0 ? (
        <p className="text-sm text-stone-600 mt-2">Ouvert ce soir : {opened.map(label).join(', ')}</p>
      ) : suggested ? (
        <div className="mt-3 space-y-1">
          <WineLink id={suggested.wineId} className="serif-it text-lg text-wine-800">{label(suggested)}</WineLink>
          {suggested.location && <p className="text-xs text-stone-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{suggested.location}</p>}
          {suggested.reason && <p className="text-sm text-stone-600 leading-relaxed">{suggested.reason}</p>}
        </div>
      ) : (
        <p className="text-sm text-stone-500 mt-2">Pas encore de vin conseillé pour ce plat.</p>
      )}
      {opened.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggested && (
            <Button size="sm" onClick={open} disabled={busy !== null}>
              {busy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GlassWater className="w-4 h-4" />} Ouvrir cette bouteille
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={another} disabled={busy !== null}>
            {busy === 'resuggest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {suggested ? 'Une autre idée' : 'Proposer un vin'}
          </Button>
        </div>
      )}
    </Card>
  );
};
