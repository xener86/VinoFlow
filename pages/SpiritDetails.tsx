import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSpirits, saveSpirits } from '../services/storageService';
import { Spirit } from '../types';
import { ArrowLeft, Edit3, Droplets, Star, Shield, Save } from 'lucide-react';

export const SpiritDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [spirit, setSpirit] = useState<Spirit | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Spirit | null>(null);

  useEffect(() => {
    if (id) {
      const spirits = getSpirits();
      const s = spirits.find(sp => sp.id === id);
      if (s) {
        setSpirit(s);
        setEditData(s);
      } else {
        navigate('/bar');
      }
    }
  }, [id, navigate]);

  const handleSave = () => {
    if (!editData) return;
    const spirits = getSpirits();
    const idx = spirits.findIndex(s => s.id === editData.id);
    if (idx !== -1) {
      spirits[idx] = editData;
      saveSpirits(spirits);
      setSpirit(editData);
      setIsEditing(false);
    }
  };

  const handleLevelChange = (level: number) => {
    if (!spirit) return;
    const spirits = getSpirits();
    const idx = spirits.findIndex(s => s.id === spirit.id);
    if (idx !== -1) {
      spirits[idx].level = level;
      saveSpirits(spirits);
      setSpirit({ ...spirit, level });
      if (editData) setEditData({ ...editData, level });
    }
  };

  if (!spirit) return null;

  const levelColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => navigate('/bar')} 
          className="p-2 bg-white dark:bg-stone-900 rounded-full text-stone-400 hover:text-stone-800 dark:hover:text-white border border-stone-200 dark:border-stone-800 shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-stone-900 rounded-full text-stone-500 hover:text-stone-800 dark:hover:text-white border border-stone-200 dark:border-stone-800 shadow-sm text-sm"
        >
          <Edit3 size={16} /> {isEditing ? 'Annuler' : 'Éditer'}
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-lg overflow-hidden">
        {/* Hero */}
        <div className="bg-gradient-to-br from-amber-50 via-white to-stone-50 dark:from-amber-950/20 dark:via-stone-900 dark:to-stone-950 p-8 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-start justify-between">
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editData?.name || ''}
                  onChange={e => setEditData(editData ? { ...editData, name: e.target.value } : null)}
                  className="text-3xl font-serif bg-transparent border-b-2 border-amber-500 text-stone-900 dark:text-white focus:outline-none w-full"
                />
              ) : (
                <h1 className="text-3xl font-serif text-stone-900 dark:text-white">{spirit.name}</h1>
              )}
              <p className="text-lg text-stone-500 dark:text-stone-400 mt-1">{spirit.type}</p>
              {spirit.brand && (
                <p className="text-sm text-stone-400 dark:text-stone-500 mt-2">{spirit.brand}</p>
              )}
            </div>
            {spirit.isPrestige && (
              <div className="flex items-center gap-1 px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-bold">
                <Shield size={12} /> Prestige
              </div>
            )}
          </div>
        </div>

        {/* Level Indicator */}
        <div className="p-6 border-b border-stone-200 dark:border-stone-800">
          <h3 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-4 flex items-center gap-2">
            <Droplets size={14} /> Niveau de la bouteille
          </h3>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => handleLevelChange(level)}
                className={`flex-1 h-8 rounded-lg transition-all ${
                  level <= spirit.level 
                    ? levelColors[spirit.level - 1] 
                    : 'bg-stone-200 dark:bg-stone-800'
                } ${level === spirit.level ? 'ring-2 ring-offset-2 ring-amber-500' : ''}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-stone-400 mt-2">
            <span>Vide</span>
            <span>Pleine</span>
          </div>
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          {isEditing ? (
            <>
              <div>
                <label className="text-xs text-stone-500 uppercase">Marque</label>
                <input
                  type="text"
                  value={editData?.brand || ''}
                  onChange={e => setEditData(editData ? { ...editData, brand: e.target.value } : null)}
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-stone-500 uppercase">Notes</label>
                <textarea
                  value={editData?.notes || ''}
                  onChange={e => setEditData(editData ? { ...editData, notes: e.target.value } : null)}
                  rows={3}
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white mt-1 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editData?.isPrestige || false}
                  onChange={e => setEditData(editData ? { ...editData, isPrestige: e.target.checked } : null)}
                  className="w-4 h-4"
                />
                <label className="text-sm text-stone-600 dark:text-stone-300">Bouteille de prestige (protégée)</label>
              </div>
              <button
                onClick={handleSave}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 mt-4"
              >
                <Save size={18} /> Enregistrer
              </button>
            </>
          ) : (
            <>
              {spirit.notes && (
                <div>
                  <h3 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2">Notes</h3>
                  <p className="text-stone-600 dark:text-stone-300 italic">"{spirit.notes}"</p>
                </div>
              )}
              {spirit.abv && (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <span className="font-bold">{spirit.abv}%</span> vol.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
