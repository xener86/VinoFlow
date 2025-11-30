import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { enrichWineData } from '../services/geminiService';
import { saveWine, getInventory, addBottleAtLocation, addBottles, findNextAvailableSlot } from '../services/storageService';
import { Wine, CellarWine } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { Search, Loader2, Save, FileSpreadsheet, Keyboard, Camera, Plus, MapPin, PackagePlus, ArrowRight, AlertTriangle, Edit3 } from 'lucide-react';

export const AddWine: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'NEW' | 'EXISTING'>('NEW');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Wine State
  const [mode, setMode] = useState<'MANUAL' | 'CSV' | 'SCAN'>('MANUAL');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');
  const [vintage, setVintage] = useState<number>(new Date().getFullYear());
  const [hint, setHint] = useState('');
  
  // Edit State (Step 3)
  const [enrichedWine, setEnrichedWine] = useState<Partial<Wine> | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Wine>>({});
  
  const [count, setCount] = useState(1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [scanImage, setScanImage] = useState<string | null>(null);

  // Existing Wine State (Quick Add)
  const [existingWines, setExistingWines] = useState<CellarWine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExisting, setSelectedExisting] = useState<CellarWine | null>(null);
  const [quickAddCount, setQuickAddCount] = useState(1);
  const [autoPlace, setAutoPlace] = useState(true);
  const [suggestedLocations, setSuggestedLocations] = useState<string[]>([]);

  // Chargement initial des vins pour l'onglet "Existing"
  useEffect(() => {
    const loadWines = async () => {
        if (activeTab === 'EXISTING') {
            const data = await getInventory();
            setExistingWines(data);
        }
    };
    loadWines();
  }, [activeTab]);

  // ✅ Correction : useEffect asynchrone pour findNextAvailableSlot
  useEffect(() => {
     const fetchLocation = async () => {
         if (activeTab === 'EXISTING' && autoPlace) {
             const locs = [];
             // findNextAvailableSlot est async maintenant
             const next = await findNextAvailableSlot(); 
             if(next) {
                 locs.push(`${next.rackName} [${String.fromCharCode(65+next.location.y)}${next.location.x+1}]`);
             } else {
                 locs.push("Quai de réception (Non trié)");
             }
             setSuggestedLocations(locs);
         }
     };
     fetchLocation();
  }, [quickAddCount, autoPlace, activeTab]);

  const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
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
          setScanImage(base64);
          
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
        alert("Impossible de trouver les données. Veuillez réessayer ou ajouter manuellement.");
        setStep(1);
      }
    } catch (err) {
      console.error(err);
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNew = async () => {
    if (!editFormData.name) return;

    const newWine: Wine = {
      id: crypto.randomUUID(),
      name: editFormData.name || name,
      vintage: editFormData.vintage || vintage,
      ...editFormData as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveWine(newWine, count); // Await
    navigate('/');
  };

  // ✅ Correction : handleQuickAdd asynchrone
  const handleQuickAdd = async () => {
      if (!selectedExisting) return;

      for(let i=0; i<quickAddCount; i++) {
          if (autoPlace) {
              // findNextAvailableSlot est async
              const slot = await findNextAvailableSlot(); 
              if (slot) {
                  await addBottleAtLocation(selectedExisting.id, slot.location); // await
              } else {
                  await addBottles(selectedExisting.id, 1); // await
              }
          } else {
              await addBottles(selectedExisting.id, 1); // await
          }
      }
      alert(`${quickAddCount} bouteilles ajoutées avec succès !`);
      navigate('/');
  };

  const filteredExisting = existingWines.filter(w => 
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      w.producer.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      {/* HEADER TABS */}
      <div className="flex bg-stone-100 dark:bg-stone-900 p-1 rounded-xl border border-stone-200 dark:border-stone-800 mb-8">
          <button 
            onClick={() => setActiveTab('NEW')}
            className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'NEW' ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
          >
            Nouveau Vin
          </button>
          <button 
            onClick={() => setActiveTab('EXISTING')}
            className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'EXISTING' ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-200 shadow-sm' : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'}`}
          >
            <PackagePlus size={16} /> Stock Rapide
          </button>
      </div>

      {/* --- TAB: NEW WINE --- */}
      {activeTab === 'NEW' && (
        <>
          {/* MODE SELECTION */}
          {step === 1 && (
            <div className="grid grid-cols-3 gap-3 mb-8">
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
              
              <button 
                onClick={() => setMode('CSV')}
                className={`flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-xl border transition-all ${
                    mode === 'CSV' 
                    ? 'bg-wine-50 dark:bg-wine-900/20 border-wine-200 dark:border-wine-500 text-wine-700 dark:text-wine-400 shadow-sm' 
                    : 'bg-white dark:bg-stone-900/50 border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                <FileSpreadsheet size={20} />
                <span className="text-xs font-medium">Import CSV</span>
              </button>
            </div>
          )}

          {/* CSV PLACEHOLDER */}
          {step === 1 && mode === 'CSV' && (
            <div className="text-center bg-white dark:bg-stone-900/50 border-2 border-dashed border-stone-300 dark:border-stone-800 rounded-2xl p-10 animate-fade-in">
              <FileSpreadsheet className="mx-auto text-stone-400 dark:text-stone-600 mb-4" size={48} />
              <p className="text-stone-600 dark:text-stone-400 mb-2">Glissez-déposez votre fichier Excel ou CSV ici.</p>
              <p className="text-stone-500 dark:text-stone-600 text-xs mb-6">Colonnes supportées: Nom, Millésime, Producteur, Quantité</p>
              <button className="bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-6 py-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors border border-stone-300 dark:border-stone-700">
                Sélectionner un fichier
              </button>
            </div>
          )}

          {/* STEP 1: INPUT */}
          {step === 1 && mode === 'MANUAL' && (
            <form onSubmit={handleEnrich} className="space-y-6 bg-white dark:bg-stone-900/50 p-8 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-stone-500 dark:text-stone-400 mb-2">Nom du vin</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: Tignanello"
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 focus:border-transparent outline-none transition-all placeholder-stone-400 dark:placeholder-stone-700"
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
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-500 dark:text-stone-400 mb-2">Producteur (Optionnel)</label>
                  <input
                    type="text"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="ex: Antinori"
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 focus:border-transparent outline-none transition-all placeholder-stone-400 dark:placeholder-stone-700"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-wine-600 hover:bg-wine-700 text-white font-medium py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-wine-500/20 dark:shadow-wine-900/20"
              >
                <Search size={20} /> Identifier & Enrichir
              </button>
            </form>
          )}

          {/* STEP 2: LOADING */}
          {step === 2 && isLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-stone-400 space-y-4 animate-pulse">
              <Loader2 size={48} className="animate-spin text-wine-500" />
              <h3 className="text-xl font-serif text-stone-900 dark:text-white">
                  {mode === 'SCAN' ? "Analyse de l'étiquette..." : "Le Sommelier consulte ses archives"}
              </h3>
              <div className="text-sm text-stone-500 dark:text-stone-500 text-center max-w-xs">
                {mode === 'SCAN' 
                 ? "Extraction de la Cuvée, de la Parcelle et des détails techniques..."
                 : "Analyse des conditions du millésime, récupération de l'histoire du terroir et accord des saveurs..."}
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & CONFIRM */}
          {step === 3 && enrichedWine && (
            <div className="space-y-6 animate-fade-in-up">
              
              {/* Alert Confidence */}
              {enrichedWine.aiConfidence !== 'HIGH' && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 p-4 rounded-xl flex items-center gap-3 text-yellow-700 dark:text-yellow-200">
                      <AlertTriangle size={20} />
                      <div className="text-sm">
                          <strong>Vérification requise :</strong> L'IA n'est pas certaine à 100%. Veuillez vérifier notamment la Cuvée et la Parcelle.
                      </div>
                  </div>
              )}

              <div className="bg-white dark:bg-stone-900 border border-wine-200 dark:border-wine-900/30 rounded-2xl overflow-hidden shadow-lg dark:shadow-2xl">
                
                {/* Header Editable */}
                <div className="bg-gradient-to-r from-wine-50 to-white dark:from-wine-900/40 dark:to-stone-900 p-6 border-b border-stone-200 dark:border-stone-800">
                    <div className="space-y-4">
                      <div className="flex items-start gap-2">
                          <Edit3 size={16} className="text-stone-400 dark:text-stone-500 mt-2" />
                          <div className="flex-1 space-y-3">
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="col-span-2">
                                      <label className="text-[10px] uppercase text-stone-500">Nom du Domaine / Vin</label>
                                      <input 
                                          type="text" 
                                          value={editFormData.name} 
                                          onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                                          className="bg-transparent text-2xl font-serif text-stone-900 dark:text-white w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none pb-1"
                                      />
                                  </div>
                                  <div>
                                      <label className="text-[10px] uppercase text-stone-500">Cuvée (ex: Orgasme)</label>
                                      <input 
                                          type="text" 
                                          value={editFormData.cuvee || ''} 
                                          onChange={(e) => setEditFormData({...editFormData, cuvee: e.target.value})}
                                          placeholder="Cuvée..."
                                          className="bg-transparent text-wine-700 dark:text-wine-300 text-lg font-serif w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none"
                                      />
                                  </div>
                                  <div>
                                      <label className="text-[10px] uppercase text-stone-500">Parcelle / Climat</label>
                                      <input 
                                          type="text" 
                                          value={editFormData.parcel || ''} 
                                          onChange={(e) => setEditFormData({...editFormData, parcel: e.target.value})}
                                          placeholder="Lieu-dit..."
                                          className="bg-transparent text-stone-600 dark:text-stone-300 text-sm w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none mt-1"
                                      />
                                  </div>
                              </div>
                              
                              <div className="flex gap-4 pt-2">
                                  <div className="flex-1">
                                      <label className="text-[10px] uppercase text-stone-500">Producteur</label>
                                      <input 
                                          type="text" 
                                          value={editFormData.producer} 
                                          onChange={(e) => setEditFormData({...editFormData, producer: e.target.value})}
                                          className="bg-transparent text-stone-500 dark:text-stone-400 text-sm w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none"
                                      />
                                  </div>
                                  <div className="w-20">
                                      <label className="text-[10px] uppercase text-stone-500">Millésime</label>
                                      <input 
                                          type="number" 
                                          value={editFormData.vintage} 
                                          onChange={(e) => setEditFormData({...editFormData, vintage: Number(e.target.value)})}
                                          className="bg-transparent text-stone-500 dark:text-stone-400 text-sm w-full border-b border-dashed border-stone-300 dark:border-stone-600 focus:border-wine-500 outline-none"
                                      />
                                  </div>
                              </div>
                          </div>
                      </div>
                    </div>
                </div>
                
                <div className="p-6 grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2">Expérience Sensorielle</h4>
                        <textarea
                            value={editFormData.sensoryDescription}
                            onChange={(e) => setEditFormData({...editFormData, sensoryDescription: e.target.value})}
                            className="w-full bg-stone-50 dark:bg-stone-950/50 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-600 dark:text-stone-300 text-sm italic h-24 resize-none focus:border-wine-500 outline-none"
                        />
                      </div>
                      
                      <div>
                        <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2">Cépages</h4>
                        <input
                            value={editFormData.grapeVarieties?.join(', ')}
                            onChange={(e) => setEditFormData({...editFormData, grapeVarieties: e.target.value.split(',').map(s => s.trim())})}
                            className="w-full bg-stone-50 dark:bg-stone-950/50 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-600 dark:text-stone-300 text-sm focus:border-wine-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-stone-50 dark:bg-stone-950/50 rounded-xl p-4 border border-stone-100 dark:border-stone-800/50">
                            <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2 text-center">Structure (Estimée)</h4>
                            {enrichedWine.sensoryProfile && (
                                <FlavorRadar data={enrichedWine.sensoryProfile as any} />
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
                    className="flex-1 md:flex-none px-6 py-3 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-white hover:border-stone-400 dark:hover:border-stone-500 transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    onClick={handleSaveNew}
                    className="flex-1 md:flex-none bg-wine-600 hover:bg-wine-700 text-white px-8 py-3 rounded-xl flex items-center justify-center gap-2 font-medium shadow-lg shadow-wine-900/30 transition-all"
                  >
                    <Save size={18} /> Valider & Ajouter
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- TAB: EXISTING WINE (QUICK ADD) --- */}
      {activeTab === 'EXISTING' && (
        <div className="animate-fade-in space-y-6">
            <div className="text-center mb-6">
                <h2 className="text-3xl font-serif text-stone-900 dark:text-stone-100 mb-1">Stock Rapide</h2>
                <p className="text-stone-500">Ajoutez des bouteilles existantes en un clic.</p>
            </div>

            {/* Selection Phase */}
            {!selectedExisting && (
                <>
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-stone-400" size={18} />
                        <input 
                            type="text"
                            placeholder="Rechercher un vin existant..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl py-3 pl-10 pr-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        {filteredExisting.map(wine => (
                            <button 
                                key={wine.id}
                                onClick={() => setSelectedExisting(wine)}
                                className="w-full text-left p-4 rounded-xl bg-white dark:bg-stone-900/50 hover:bg-stone-50 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 flex justify-between items-center group transition-all shadow-sm"
                            >
                                <div>
                                    <h4 className="text-stone-900 dark:text-white font-medium">{wine.name} {wine.cuvee ? `- ${wine.cuvee}` : ''}</h4>
                                    <p className="text-xs text-stone-500">{wine.producer} • {wine.vintage}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs bg-stone-100 dark:bg-stone-950 px-2 py-1 rounded text-stone-500 dark:text-stone-400">{wine.inventoryCount} en stock</span>
                                    <Plus className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* Confirmation Phase */}
            {selectedExisting && (
                <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-xl dark:shadow-2xl animate-fade-in-up">
                    <div className="flex justify-between items-start mb-6 border-b border-stone-200 dark:border-stone-800 pb-4">
                        <div>
                             <h3 className="text-xl font-serif text-stone-900 dark:text-white">{selectedExisting.name}</h3>
                             {selectedExisting.cuvee && <p className="text-wine-600 dark:text-wine-400 text-sm italic">Cuvée {selectedExisting.cuvee}</p>}
                             <p className="text-stone-500 dark:text-stone-400 text-sm">{selectedExisting.vintage} • {selectedExisting.producer}</p>
                        </div>
                        <button onClick={() => setSelectedExisting(null)} className="text-stone-400 hover:text-stone-600 dark:hover:text-white text-sm">Changer</button>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <label className="text-stone-600 dark:text-stone-300">Quantité à ajouter</label>
                            <div className="flex items-center bg-stone-100 dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800">
                                <button onClick={() => setQuickAddCount(Math.max(1, quickAddCount - 1))} className="px-4 py-2 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300">-</button>
                                <span className="px-4 font-bold text-stone-900 dark:text-white w-12 text-center">{quickAddCount}</span>
                                <button onClick={() => setQuickAddCount(quickAddCount + 1)} className="px-4 py-2 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300">+</button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between bg-stone-50 dark:bg-stone-950/50 p-3 rounded-lg border border-stone-200 dark:border-stone-800">
                             <div className="flex items-center gap-3">
                                 <MapPin className={autoPlace ? "text-green-500" : "text-stone-400"} size={20} />
                                 <div>
                                     <p className="text-sm text-stone-700 dark:text-stone-200">Rangement Automatique</p>
                                     <p className="text-xs text-stone-500">Suggérer l'étagère la plus vide</p>
                                 </div>
                             </div>
                             <button 
                                onClick={() => setAutoPlace(!autoPlace)}
                                className={`w-12 h-6 rounded-full transition-colors relative ${autoPlace ? 'bg-green-600' : 'bg-stone-300 dark:bg-stone-700'}`}
                             >
                                 <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoPlace ? 'left-7' : 'left-1'}`} />
                             </button>
                        </div>
                        
                        {autoPlace && suggestedLocations.length > 0 && (
                            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 p-3 rounded-lg flex items-center gap-3 text-sm text-green-700 dark:text-green-300">
                                <ArrowRight size={16} />
                                <span>Destination : <span className="font-bold">{suggestedLocations[0]}</span> {quickAddCount > 1 ? ` et suivants...` : ''}</span>
                            </div>
                        )}

                        <button 
                            onClick={handleQuickAdd}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2"
                        >
                            <PackagePlus size={20} /> Ajouter au Stock
                        </button>
                    </div>
                </div>
            )}
        </div>
      )}
    </div>
  );
};