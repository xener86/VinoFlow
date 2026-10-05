import React, { useState } from 'react';
import { useConfirm } from './feedback';
import { getTonight } from '../../services/storageService';

const ForDinnerCheck: React.FC<{ dish: string; onChange: (v: boolean) => void }> = ({ dish, onChange }) => {
  const [checked, setChecked] = useState(true);
  return (
    <label className="flex items-center gap-2 text-sm text-stone-800">
      <input
        type="checkbox"
        className="h-4 w-4 accent-wine-700"
        checked={checked}
        onChange={(e) => { setChecked(e.target.checked); onChange(e.target.checked); }}
      />
      Pour le dîner : <span className="serif-it">{dish}</span>
    </label>
  );
};

/** Confirmation d'ouverture ; propose de rattacher la bouteille au dîner MenuFlow du jour. */
export const useOpenBottleConfirm = () => {
  const confirm = useConfirm();
  return async (wineName: string): Promise<{ forDinner: boolean | null } | null> => {
    let dish: string | null = null;
    try {
      const tonight = await getTonight({ remote: false }); // base seule : pas d'attente si MenuFlow ne répond pas
      dish = tonight.configured && tonight.dinner ? tonight.dinner.title : null;
    } catch {
      dish = null;
    }
    const choice = { forDinner: true };
    const ok = await confirm({
      title: `Ouvrir une bouteille de ${wineName} ?`,
      message: (
        <div className="space-y-3">
          <p>Elle sera retirée du stock et notée dans le journal.</p>
          {dish && <ForDinnerCheck dish={dish} onChange={(v) => { choice.forDinner = v; }} />}
        </div>
      ),
      confirmLabel: 'Ouvrir',
    });
    if (!ok) return null;
    return { forDinner: dish ? choice.forDinner : null };
  };
};
