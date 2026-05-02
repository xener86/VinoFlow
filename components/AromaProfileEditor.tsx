import React, { useState } from 'react';
import { Sparkles, Check, Edit3, X, Plus } from 'lucide-react';

interface Props {
  initial: string[];
  source?: string | null;
  confidence?: string | null;
  onSave: (aromas: string[], source: 'USER' | 'AI', confidence: 'HIGH' | 'MEDIUM' | 'LOW') => void | Promise<void>;
  onIgnore?: () => void;
  saving?: boolean;
}

/**
 * Editor for the aroma profile of a wine.
 * Shows the AI-detected aromas, lets the user confirm, edit, or ignore.
 */
export const AromaProfileEditor: React.FC<Props> = ({ initial, source, confidence, onSave, onIgnore, saving }) => {
  const [aromas, setAromas] = useState<string[]>(initial || []);
  const [editing, setEditing] = useState(false);
  const [newAroma, setNewAroma] = useState('');

  const isAI = !source || source === 'AI';

  const addAroma = () => {
    const t = newAroma.trim();
    if (t && !aromas.includes(t)) {
      setAromas([...aromas, t]);
      setNewAroma('');
    }
  };

  const removeAroma = (i: number) => {
    setAromas(aromas.filter((_, idx) => idx !== i));
  };

  const handleConfirm = () => onSave(aromas, 'USER', 'HIGH');
  const handleConfirmAI = () => onSave(aromas, 'AI', confidence as any || 'MEDIUM');

  return (
    <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles size={14} className="text-indigo-500" />
        <span className="font-medium text-stone-900 dark:text-white">
          {isAI ? 'Profil aromatique détecté par l\'IA' : 'Profil aromatique'}
        </span>
        {isAI && (
          <span className="text-xs text-stone-500">
            (confiance {String(confidence || '?').toLowerCase()})
          </span>
        )}
      </div>

      {isAI && (
        <p className="text-xs text-stone-600 dark:text-stone-400">
          Vérifie ou modifie les arômes détectés. Ton retour rendra les futures recommandations plus précises.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {aromas.map((aroma, i) => (
          <span key={i} className="inline-flex items-center gap-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-full px-3 py-1 text-xs">
            {aroma}
            {editing && (
              <button onClick={() => removeAroma(i)} className="text-stone-400 hover:text-red-500" aria-label={`Supprimer ${aroma}`}>
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {aromas.length === 0 && (
          <span className="text-xs text-stone-400 italic">Aucun arôme renseigné</span>
        )}
      </div>

      {editing && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newAroma}
            onChange={e => setNewAroma(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAroma())}
            placeholder="Ex: fruits rouges"
            className="flex-1 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-wine-500 outline-none"
          />
          <button onClick={addAroma} className="bg-wine-600 hover:bg-wine-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
            <Plus size={14} /> Ajouter
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
        {!editing ? (
          <>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Check size={14} /> Confirmer
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={saving}
              className="flex items-center gap-1.5 bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-900 dark:text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Edit3 size={14} /> Modifier
            </button>
            {onIgnore && isAI && (
              <button
                onClick={onIgnore}
                disabled={saving}
                className="text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
              >
                Plus tard
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Check size={14} /> Enregistrer
            </button>
            <button
              onClick={() => { setAromas(initial); setEditing(false); }}
              disabled={saving}
              className="bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-900 dark:text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
};
