import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { updateWine } from '../services/storageService';
import { useWines } from '../hooks/useWines'; // ✅ Import du Hook
import { Wine } from '../types';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';

export const EditWine: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // ✅ Utilisation du Hook pour récupérer l'inventaire
  const { wines, loading, refresh } = useWines();
  
  // État local pour le formulaire
  const [wine, setWine] = useState<Wine | null>(null);

  // ✅ Effet pour trouver le vin une fois les données chargées
  useEffect(() => {
    if (!loading && id) {
        const found = wines.find(w => w.id === id);
        if (found) {
            // On clone pour ne pas muter le cache du hook directement
            setWine({ ...found });
        } else {
            navigate('/');
        }
    }
  }, [id, loading, wines, navigate]);

  // ✅ Sauvegarde Asynchrone
  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (wine) {
          await updateWine(wine.id, wine); // Await de la mise à jour
          await refresh(); // Rafraîchissement des données globales
          navigate(`/wine/${wine.id}`);
      }
  };

  // Loader pendant le chargement
  if (loading || !wine) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
              <Loader2 className="animate-spin text-wine-600" size={32} />
          </div>
      );
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
            <button 
                onClick={() => navigate(-1)} 
                className="p-2 bg-white dark:bg-stone-900 rounded-full text-stone-400 hover:text-stone-800 dark:hover:text-white border border-stone-200 dark:border-stone-800 shadow-sm"
            >
                <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-serif text-stone-900 dark:text-white">Éditer la Fiche</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
            
            {/* Identity */}
            <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200">Identité</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="text-xs text-stone-500 uppercase">Nom (Domaine)</label>
                        <input 
                            type="text" 
                            value={wine.name}
                            onChange={e => setWine({...wine, name: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs text-stone-500 uppercase">Cuvée</label>
                        <input 
                            type="text" 
                            value={wine.cuvee || ''}
                            onChange={e => setWine({...wine, cuvee: e.target.value})}
                            placeholder="ex: Orgasme"
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs text-stone-500 uppercase">Parcelle / Lieu-dit</label>
                        <input 
                            type="text" 
                            value={wine.parcel || ''}
                            onChange={e => setWine({...wine, parcel: e.target.value})}
                            placeholder="ex: Monts de Milieu"
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Producteur</label>
                        <input 
                            type="text" 
                            value={wine.producer}
                            onChange={e => setWine({...wine, producer: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Millésime</label>
                        <input 
                            type="number" 
                            value={wine.vintage}
                            onChange={e => setWine({...wine, vintage: Number(e.target.value)})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Région</label>
                        <input 
                            type="text" 
                            value={wine.region}
                            onChange={e => setWine({...wine, region: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-stone-500 uppercase">Format</label>
                        <input
                            type="text"
                            value={wine.format}
                            onChange={e => setWine({...wine, format: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="text-xs text-stone-500 uppercase">Couleur / Type</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {(['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED'] as const).map(t => {
                                const labels: Record<string, string> = { RED: 'Rouge', WHITE: 'Blanc', ROSE: 'Rosé', SPARKLING: 'Pétillant', DESSERT: 'Dessert', FORTIFIED: 'Fortifié' };
                                const colors: Record<string, string> = { RED: 'bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300', WHITE: 'bg-yellow-50 border-yellow-400 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-600 dark:text-yellow-300', ROSE: 'bg-pink-100 border-pink-400 text-pink-800 dark:bg-pink-900/30 dark:border-pink-600 dark:text-pink-300', SPARKLING: 'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300', DESSERT: 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300', FORTIFIED: 'bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-900/20 dark:border-purple-600 dark:text-purple-300' };
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setWine({...wine, type: t})}
                                        className={`px-3 py-1.5 text-xs rounded border font-medium transition-all ${wine.type === t ? colors[t] + ' ring-2 ring-offset-1 ring-wine-500' : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}`}
                                    >
                                        {labels[t]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Details */}
            <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
                <h3 className="text-lg font-serif text-stone-800 dark:text-stone-200">Détails & IA</h3>
                
                <div>
                    <label className="text-xs text-stone-500 uppercase">Cépages (séparés par virgule)</label>
                    <input 
                        type="text" 
                        value={wine.grapeVarieties.join(', ')}
                        onChange={e => setWine({...wine, grapeVarieties: e.target.value.split(',').map(s => s.trim())})}
                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                    />
                </div>

                <div>
                    <label className="text-xs text-stone-500 uppercase">Description Sensorielle</label>
                    <textarea 
                        value={wine.sensoryDescription}
                        onChange={e => setWine({...wine, sensoryDescription: e.target.value})}
                        rows={4}
                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none resize-none"
                    />
                </div>

                <div>
                    <label className="text-xs text-stone-500 uppercase">Accords Mets-Vins (séparés par virgule)</label>
                    <input 
                        type="text" 
                        value={wine.suggestedFoodPairings.join(', ')}
                        onChange={e => setWine({...wine, suggestedFoodPairings: e.target.value.split(',').map(s => s.trim())})}
                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-3 text-stone-900 dark:text-white focus:border-wine-500 outline-none"
                    />
                </div>
            </div>

            <button 
                type="submit" 
                className="w-full bg-wine-600 hover:bg-wine-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-wine-900/30 fixed bottom-6 left-0 right-0 max-w-2xl mx-auto z-20"
            >
                <Save size={20} /> Enregistrer les modifications
            </button>
        </form>
    </div>
  );
};