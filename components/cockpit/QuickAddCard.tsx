import React, { useRef } from 'react';
import { Camera, Minus, Plus, Star, Trash2, Type as TypeIcon } from 'lucide-react';
import type { CellarWine, WineType } from '../../types';
import { confirmLine, lineProblem, toManual, wineOf, withNewPhoto, type Destination, type DraftLine, type WineDraft } from '../../utils/quickAddQueue';
import { loadLabelImage } from '../../utils/labelImage';
import { Badge, Button, Card, Input } from './primitives';

const STATUS: Record<DraftLine['status'], { label: string; tone: 'urgent' | 'warning' | 'neutral' | 'success' }> = {
  PENDING: { label: 'En attente de réseau', tone: 'neutral' },
  READING: { label: 'Lecture…', tone: 'neutral' },
  READY: { label: 'Prêt', tone: 'success' },
  REVIEW: { label: 'À vérifier', tone: 'warning' },
  FAILED: { label: 'Échec', tone: 'urgent' },
};
const TYPES: { k: WineType; l: string }[] = [
  { k: 'RED' as WineType, l: 'Rouge' }, { k: 'WHITE' as WineType, l: 'Blanc' }, { k: 'ROSE' as WineType, l: 'Rosé' },
  { k: 'SPARKLING' as WineType, l: 'Bulles' }, { k: 'DESSERT' as WineType, l: 'Moelleux' }, { k: 'FORTIFIED' as WineType, l: 'Muté' },
];
const DESTINATIONS: { k: Destination; l: string }[] = [{ k: 'CELLAR', l: 'Cave' }, { k: 'WISHLIST', l: 'Envie' }, { k: 'TASTING', l: 'Dégustation' }];

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

interface Props {
  line: DraftLine;
  wines: CellarWine[];
  onChange: (change: Partial<DraftLine> | ((l: DraftLine) => DraftLine)) => void;
  onEdit: (patch: Partial<WineDraft>) => void;
  onRemove: () => void;
}

// Une photo de la rafale : état de lecture, vin lu (modifiable), destination.
export const QuickAddCard: React.FC<Props> = ({ line, wines, onChange, onEdit, onRemove }) => {
  const retake = useRef<HTMLInputElement>(null);
  const wine = wineOf(line);
  const status = STATUS[line.status];
  const match = line.matchWineId ? wines.find(w => w.id === line.matchWineId) : null;
  const problem = lineProblem(line);
  const edit = onEdit;

  const onRetake = async (file: File) => {
    const img = await loadLabelImage(file);
    onChange(l => withNewPhoto(l, img.base64));
  };

  return (
    <Card className="p-3">
      <div className="flex gap-3">
        {line.photo
          ? <img src={`data:image/jpeg;base64,${line.photo}`} alt="Étiquette" className="w-16 h-20 rounded object-cover border border-stone-200 shrink-0" />
          : <div className="w-16 h-20 rounded border border-dashed border-stone-300 shrink-0 flex items-center justify-center text-stone-400"><TypeIcon className="w-5 h-5" /></div>}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={status.tone}>{status.label.toUpperCase()}</Badge>
            {line.error && <span className="text-xs text-wine-700 truncate">{line.error}</span>}
            <button onClick={onRemove} aria-label="Supprimer la ligne" className="ml-auto h-9 w-9 inline-flex items-center justify-center rounded text-stone-400 hover:text-wine-700"><Trash2 className="w-4 h-4" /></button>
          </div>

          {(line.status === 'FAILED' || line.status === 'PENDING') && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => retake.current?.click()}><Camera className="w-3.5 h-3.5" /> Reprendre la photo</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(toManual)}>Saisir le texte</Button>
              <input ref={retake} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && onRetake(e.target.files[0])} />
            </div>
          )}

          {line.status !== 'PENDING' && line.status !== 'READING' && line.status !== 'FAILED' && (
            <>
              <Input aria-label="Nom" placeholder="Nom du vin" value={wine.name} onChange={e => edit({ name: e.target.value })} />
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <Input aria-label="Producteur" placeholder="Producteur" value={wine.producer} onChange={e => edit({ producer: e.target.value })} />
                <Input aria-label="Millésime" placeholder="Millésime" inputMode="numeric" value={wine.vintage ?? ''} onChange={e => edit({ vintage: toNumber(e.target.value) })} />
              </div>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Couleur">
                {TYPES.map(t => (
                  <button key={t.k} role="radio" aria-checked={wine.type === t.k} onClick={() => edit({ type: t.k })}
                    className={`h-9 md:h-7 px-2.5 rounded border text-xs ${wine.type === t.k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300'}`}>{t.l}</button>
                ))}
              </div>
              <details>
                <summary className="text-xs text-stone-500 cursor-pointer">Cuvée, appellation</summary>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input aria-label="Cuvée" placeholder="Cuvée" value={wine.cuvee} onChange={e => edit({ cuvee: e.target.value })} />
                  <Input aria-label="Appellation" placeholder="Appellation" value={wine.appellation} onChange={e => edit({ appellation: e.target.value })} />
                </div>
              </details>

              {match && !line.forceNew && line.destination !== 'WISHLIST' && (
                <div className="text-xs text-stone-600 bg-stone-50 rounded px-2 py-1.5">
                  Déjà en cave · {match.name} {match.vintage} ({match.inventoryCount} btl) ·{' '}
                  <button className="underline" onClick={() => onChange({ forceNew: true, matchWineId: null })}>Ce n’est pas lui</button>
                </div>
              )}

              <div className="flex gap-1" role="radiogroup" aria-label="Destination">
                {DESTINATIONS.map(d => (
                  <button key={d.k} role="radio" aria-checked={line.destination === d.k} onClick={() => onChange({ destination: d.k })}
                    className={`flex-1 h-9 rounded border text-sm ${line.destination === d.k ? 'bg-wine-700 text-white border-wine-700' : 'bg-white text-stone-700 border-stone-300'}`}>{d.l}</button>
                ))}
              </div>

              {line.destination === 'CELLAR' && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-md p-1">
                    <button onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })} aria-label="Une bouteille de moins" className="w-9 h-9 rounded hover:bg-stone-200 inline-flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                    <span className="w-8 text-center tabular-nums">{line.quantity}</span>
                    <button onClick={() => onChange({ quantity: Math.min(99, line.quantity + 1) })} aria-label="Une bouteille de plus" className="w-9 h-9 rounded hover:bg-stone-200 inline-flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                  </div>
                  <Input aria-label="Prix unitaire (€)" placeholder="Prix €" inputMode="decimal" value={line.price ?? ''} onChange={e => onChange({ price: toNumber(e.target.value) })} />
                </div>
              )}
              {line.destination === 'WISHLIST' && (
                <Input aria-label="Prix estimé (€)" placeholder="Prix estimé €" inputMode="decimal" value={line.estimatedPrice ?? ''} onChange={e => onChange({ estimatedPrice: toNumber(e.target.value) })} />
              )}
              {line.destination === 'TASTING' && (
                <div className="space-y-2">
                  <div className="flex gap-1" role="radiogroup" aria-label="Note">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} role="radio" aria-checked={line.rating === n} aria-label={`${n} étoile(s)`} onClick={() => onChange({ rating: n })} className="h-9 w-9 inline-flex items-center justify-center">
                        <Star className={`w-5 h-5 ${line.rating && n <= line.rating ? 'fill-amber-400 text-amber-500' : 'text-stone-300'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea aria-label="Commentaire" placeholder="Commentaire" rows={2} value={line.comment} onChange={e => onChange({ comment: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-stone-300 text-sm" />
                </div>
              )}

              {line.status === 'REVIEW' && (
                <Button size="sm" onClick={() => onChange(confirmLine)} disabled={!wine.name.trim()}>Valider</Button>
              )}
              {problem && line.status === 'READY' && <div className="text-xs text-wine-700">{problem}</div>}
            </>
          )}
        </div>
      </div>
    </Card>
  );
};
