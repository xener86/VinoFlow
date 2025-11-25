import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { enrichWineData } from '../services/geminiService';
import { saveWine } from '../services/storageService';
import { Wine, WineType } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { Search, Loader2, Save, Camera, Keyboard, AlertTriangle, Edit3 } from 'lucide-react';

export const AddWine: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'MANUAL' | 'SCAN'>('MANUAL');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');
  const [vintage, setVintage] = useState<number>(new Date().getFullYear());
  const [hint, setHint] = useState('');
  const [enrichedWine, setEnrichedWine] = useState<Partial<Wine> | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Wine>>({});
  const [count, setCount] = useState(1);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleScanClick = () => {
    setMode('SCAN');
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStep(2);
    
    try {
      const base64 = await fileToBase64(file);
      const result = await enrichWineData("", 0, "", base64);
      
      if (result) {
        setEnrichedWine(result);
        setEditFormData(result);
        setName(result.name || "Vin Inconnu");
        setVintage(result.vintage || new Date().getFullYear());
        setStep(3);
      } else {
        alert("Analyse échouée. Essayez la saisie manuelle.");
        setStep(1);
      }
    } catch (err) {
      console.error("Scan error", err);
      alert("Erreur lors du traitement de l'image.");
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnrich = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStep(2);

    try {
      const result = await enrichWineData(name, vintage, hint);
      if (result) {
        setEnrichedWine(result);
        setEditFormData(result);
        setStep(3);
      } else {
        alert("Impossible de trouver les données. Réessayez.");
        setStep(1);
      }
    } catch (err) {
      console.error(err);
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNew = () => {
    if (!editFormData.name) return;

    const newWine: Wine = {
      id: crypto.randomUUID(),
      name: editFormData.name || name,
      vintage: editFormData.vintage || vintage,
      producer: editFormData.producer || '',
      region: editFormData.region || '',
      country: editFormData.country || '',
      type: (editFormData.type as WineType) || WineType.RED,
      grapeVarieties: editFormData.grapeVarieties || [],
      format: editFormData.format || '750ml',
      personalNotes: [],
      sensoryDescription: editFormData.sensoryDescription || '',
      suggestedFoodPairings: editFormData.suggestedFoodPairings || [],
      enrichedByAI: true,
      sensoryProfile: editFormData.sensoryProfile || {
        body: 50, acidity: 50, tannin: 50, sweetness: 10, alcohol: 50, flavors: []
      },
      cuvee: editFormData.cuvee,
      parcel: editFormData.parcel,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveWine(newWine, count);
    navigate('/');
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={fileInputRef} 
        onChange={handleFileChange}
        className="hidden" 
      />

      <h2 className="text-3xl font-serif text-stone-900 dark:text-white mb-6">Ajouter un Vin</h2>

      {/* MODE SELECTION */}
      {step === 1 && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-8">
            <button 
              onClick={handleScanClick}
              className={`flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-xl border transition-all ${
                mode === 'SCAN' 
                  ? 'bg-wine-50 dark:bg-wine-900/20 border-wine-200 dark:border-wine-500 text-wine-700 dark:text-wine-400 shadow-sm' 
                  : 'bg-white dark:bg-stone-900/50 border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
              }`}
            >
              <Camera size={20} />
              <span className="text-xs font-medium">Scan Étiquette</span>
            </button>

            <button 
              onClick={() => setMode('MANUAL')}
              className={`flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-xl border transition-all ${
                mode === 'MANUAL' 
                  ? 'bg-wine-50 dark:bg-wine-900/20 border-wine-200 dark:border-wine-500 text-wine-700 dark:text-wine-400 shadow-sm' 
                  : 'bg-white dark:bg-stone-900/50 border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
              }`}
            >
              <Keyboard size={20} />
              <span className="text-xs font-medium">Saisie Manuelle</span>
            </button>
          </div>

          {mode === 'MANUAL' && (
            <form onSubmit={handleEnrich} className="space-y-6 bg-white dark:bg-stone-900/50 p-8 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
              <div>
                <label className="block text-sm font-medium text-stone-500 dark:text-stone-400 mb-2">Nom du vin</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Tignanello"
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-500 dark:text-stone-400 mb-2">Millésime</label>
                  <input
                    required
                    type="number"
                    value={vintage}
                    onChange={(e) => setVintage(Number(e.target.value))}
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-500 dark:text-stone-400 mb-2">Producteur</label>
                  <input
                    type="text"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="ex: Antinori"
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-wine-600 hover:bg-wine-700 text-white font-medium py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-wine-500/20"
              >
                <Search size={20} /> Identifier & Enrichir
              </button>
            </form>
          )}
        </>
      )}

      {/* STEP 2: LOADING */}
      {step === 2 && isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-stone-400 space-y-4 animate-pulse">
          <Loader2 size={48} className="animate-spin text-wine-500" />
          <h3 className="text-xl font-serif text-stone-900 dark:text-white">
            {mode === 'SCAN' ? "Analyse de l'étiquette..." : "Le Sommelier consulte ses archives"}
          </h3>
        </div>
      )}

      {/* STEP 3: REVIEW & CONFIRM */}
      {step === 3 && enrichedWine && (
        <div className="space-y-6 animate-fade-in-up">
          {enrichedWine.aiConfidence !== 'HIGH' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 p-4 rounded-xl flex items-center gap-3 text-yellow-700 dark:text-yellow-200">
              <AlertTriangle size={20} />
              <div className="text-sm">
                <strong>Vérification requise :</strong> L'IA n'est pas certaine à 100%.
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-stone-900 border border-wine-200 dark:border-wine-900/30 rounded-2xl overflow-hidden shadow-lg">
            <div className="bg-gradient-to-r from-wine-50 to-white dark:from-wine-900/40 dark:to-stone-900 p-6 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-start gap-2">
                <Edit3 size={16} className="text-stone-400 dark:text-stone-500 mt-2" />
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-[10px] uppercase text-stone-500">Nom</label>
                    <input 
                      type="text" 
                      value={editFormData.name} 
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      className="bg-transparent text-2xl font-serif text-stone-900 dark:text-white w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none pb-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase text-stone-500">Producteur</label>
                      <input 
                        type="text" 
                        value={editFormData.producer} 
                        onChange={(e) => setEditFormData({ ...editFormData, producer: e.target.value })}
                        className="bg-transparent text-stone-500 dark:text-stone-400 text-sm w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-stone-500">Millésime</label>
                      <input 
                        type="number" 
                        value={editFormData.vintage} 
                        onChange={(e) => setEditFormData({ ...editFormData, vintage: Number(e.target.value) })}
                        className="bg-transparent text-stone-500 dark:text-stone-400 text-sm w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2">Description</h4>
                  <textarea
                    value={editFormData.sensoryDescription}
                    onChange={(e) => setEditFormData({ ...editFormData, sensoryDescription: e.target.value })}
                    className="w-full bg-stone-50 dark:bg-stone-950/50 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-600 dark:text-stone-300 text-sm italic h-24 resize-none focus:border-wine-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="bg-stone-50 dark:bg-stone-950/50 rounded-xl p-4 border border-stone-100 dark:border-stone-800/50">
                  <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2 text-center">Structure</h4>
                  {enrichedWine.sensoryProfile && (
                    <FlavorRadar data={enrichedWine.sensoryProfile} />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <label className="text-stone-500 dark:text-stone-400 text-sm">Quantité :</label>
              <div className="flex items-center bg-stone-100 dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800">
                <button onClick={() => setCount(Math.max(1, count - 1))} className="px-4 py-2 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300">-</button>
                <span className="px-4 font-bold text-stone-900 dark:text-white w-12 text-center">{count}</span>
                <button onClick={() => setCount(count + 1)} className="px-4 py-2 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300">+</button>
              </div>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button 
                onClick={() => setStep(1)}
                className="flex-1 md:flex-none px-6 py-3 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button 
                onClick={handleSaveNew}
                className="flex-1 md:flex-none bg-wine-600 hover:bg-wine-700 text-white px-8 py-3 rounded-xl flex items-center justify-center gap-2 font-medium shadow-lg shadow-wine-900/30 transition-all"
              >
                <Save size={18} /> Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
