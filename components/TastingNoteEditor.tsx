import React from 'react';
import { Star, Calendar, Eye, Droplets, Utensils, Edit2, Trash2 } from 'lucide-react';

export interface TastingNote {
  id: string;
  wineId: string;
  wineName: string;
  wineVintage: number;
  date: string;
  visual: number;
  visualNotes: string;
  nose: string[];
  body: number;
  acidity: number;
  tannin: number;
  finish: number;
  rating: number;
  pairedWith?: string;
  pairingQuality?: number;
  pairingSuggestion?: string;
  notes: string;
}

interface TastingNoteEditorProps {
  note: TastingNote;
  onEdit?: (note: TastingNote) => void;
  onDelete?: (noteId: string) => void;
  showActions?: boolean;
}

export const TastingNoteEditor: React.FC<TastingNoteEditorProps> = ({
  note,
  onEdit,
  onDelete,
  showActions = true
}) => {
  const getFinishLabel = (level: number): string => {
    if (level === 1) return 'Courte';
    if (level === 2) return 'Moyenne';
    return 'Longue';
  };

  return (
    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-stone-500" />
          <span className="text-sm text-stone-600">
            {new Date(note.date).toLocaleDateString('fr-FR', { 
              day: '2-digit', 
              month: 'long', 
              year: 'numeric' 
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star 
                key={i} 
                size={14} 
                className={i < note.rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300'} 
              />
            ))}
          </div>
          {showActions && (onEdit || onDelete) && (
            <div className="flex gap-1 ml-2">
              {onEdit && (
                <button
                  onClick={() => onEdit(note)}
                  className="p-1.5 hover:bg-stone-200 rounded transition-colors"
                  title="Éditer"
                >
                  <Edit2 size={14} className="text-stone-500" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    if (window.confirm('Supprimer cette fiche de dégustation ?')) {
                      onDelete(note.id);
                    }
                  }}
                  className="p-1.5 hover:bg-red-100 rounded transition-colors"
                  title="Supprimer"
                >
                  <Trash2 size={14} className="text-red-500" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Visual & Finish */}
      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Eye size={12} className="text-stone-500" />
            <span className="text-stone-500 font-bold uppercase">Visuel</span>
          </div>
          <p className="text-stone-700">{note.visualNotes}</p>
          <p className="text-stone-500 mt-1">Intensité: {note.visual}/10</p>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Droplets size={12} className="text-stone-500" />
            <span className="text-stone-500 font-bold uppercase">Finale</span>
          </div>
          <p className="text-stone-700">{getFinishLabel(note.finish)}</p>
        </div>
      </div>

      {/* Nose Impressions */}
      {note.nose && note.nose.length > 0 && (
        <div className="mb-3">
          <span className="text-xs text-stone-500 font-bold uppercase block mb-1">Impressions</span>
          <div className="flex flex-wrap gap-1">
            {note.nose.map((impression, i) => (
              <span 
                key={i}
                className="text-xs bg-wine-50 text-wine-700 px-2 py-0.5 rounded border border-wine-200"
              >
                {impression}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Structure */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div className="text-center bg-white p-2 rounded border border-stone-200">
          <div className="text-stone-500 font-bold">Corps</div>
          <div className="text-stone-900 font-bold">{note.body}%</div>
        </div>
        <div className="text-center bg-white p-2 rounded border border-stone-200">
          <div className="text-stone-500 font-bold">Acidité</div>
          <div className="text-stone-900 font-bold">{note.acidity}%</div>
        </div>
        <div className="text-center bg-white p-2 rounded border border-stone-200">
          <div className="text-stone-500 font-bold">Tanins</div>
          <div className="text-stone-900 font-bold">{note.tannin}%</div>
        </div>
      </div>

      {/* Food Pairing */}
      {note.pairedWith && (
        <div className="pt-3 border-t border-stone-200">
          <div className="flex items-center gap-2 mb-1">
            <Utensils size={12} className="text-wine-600" />
            <span className="text-xs font-bold text-stone-500 uppercase">Accord dégusté</span>
            {note.pairingQuality && (
              <div className="flex items-center gap-0.5 ml-auto">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star 
                    key={i} 
                    size={10} 
                    className={i < note.pairingQuality! ? 'fill-orange-500 text-orange-500' : 'text-stone-300'} 
                  />
                ))}
              </div>
            )}
          </div>
          <p className="text-sm text-stone-700">{note.pairedWith}</p>
          {note.pairingSuggestion && (
            <p className="text-xs text-stone-500 mt-1 italic">💡 {note.pairingSuggestion}</p>
          )}
        </div>
      )}

      {/* Personal Notes */}
      {note.notes && (
        <div className="mt-3 pt-3 border-t border-stone-200">
          <p className="text-sm italic text-stone-600">"{note.notes}"</p>
        </div>
      )}
    </div>
  );
};