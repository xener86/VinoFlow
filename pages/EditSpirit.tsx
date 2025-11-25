import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSpiritById, saveSpirit } from '../services/storageService';
import { Spirit, SpiritType } from '../types';
import { Save, ArrowLeft } from 'lucide-react';

export const EditSpirit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [spirit, setSpirit] = useState<Spirit | null>(null);

  useEffect(() => {
    if (id) {
        const s = getSpiritById(id);
        if (s) setSpirit(s);
        else navigate('/bar');
    }
  }, [id, navigate]);

  const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      if (spirit) {
          saveSpirit(spirit);
          navigate(`/spirit/${spirit.id}`);
      }
  };

  if (!spirit) return null;

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => navigate(-1)} className="p-2 bg-white dark:bg-stone-900 rounded-full text-stone-400 hover:text-stone-800 dark:hover:text-white border border-stone-200 dark:border-stone-800 shadow-sm">
                <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-serif text-stone-900 dark:text-white">Éditer le Spiritueux</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
            
            {/* Identity */}
            <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200">Identité</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-xs text-stone-500 uppercase">Nom</label>
                        <input 
                            type="text" 
                            value={spirit.name}
                            onChange={e => setSpirit({...spirit, name: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Distillerie</label>
                        <input 
                            type="text" 
                            value={spirit.distillery}
                            onChange={e => setSpirit({...spirit, distillery: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Catégorie</label>
                        <select 
                            value={spirit.category}
                            onChange={e => setSpirit({...spirit, category: e.target.value as SpiritType})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                        >
                            {Object.values(SpiritType).map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Région</label>
                        <input 
                            type="text" 
                            value={spirit.region || ''}
                            onChange={e => setSpirit({...spirit, region: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Pays</label>
                        <input 
                            type="text" 
                            value={spirit.country || ''}
                            onChange={e => setSpirit({...spirit, country: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Âge</label>
                        <input 
                            type="text" 
                            value={spirit.age || ''}
                            onChange={e => setSpirit({...spirit, age: e.target.value})}
                            placeholder="ex: 16 Year"
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">ABV (%)</label>
                        <input 
                            type="number" 
                            step="0.1"
                            value={spirit.abv}
                            onChange={e => setSpirit({...spirit, abv: Number(e.target.value)})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Details */}
            <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200">Détails</h3>
                
                <div>
                    <label className="text-xs text-stone-500 uppercase">Description</label>
                    <textarea 
                        value={spirit.description}
                        onChange={e => setSpirit({...spirit, description: e.target.value})}
                        rows={3}
                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none resize-none"
                    />
                </div>

                <div>
                    <label className="text-xs text-stone-500 uppercase">Notes de Dégustation</label>
                    <textarea 
                        value={spirit.tastingNotes}
                        onChange={e => setSpirit({...spirit, tastingNotes: e.target.value})}
                        rows={3}
                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none resize-none"
                    />
                </div>

                <div>
                    <label className="text-xs text-stone-500 uppercase">Profil Aromatique (séparés par virgule)</label>
                    <input 
                        type="text" 
                        value={spirit.aromaProfile.join(', ')}
                        onChange={e => setSpirit({...spirit, aromaProfile: e.target.value.split(',').map(s => s.trim())})}
                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-amber-500 outline-none"
                    />
                </div>
            </div>

            <button 
                type="submit" 
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30"
            >
                <Save size={20} /> Enregistrer les modifications
            </button>
        </form>
    </div>
  );
};