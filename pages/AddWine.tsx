import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { enrichWineData } from '../services/geminiService';
import { saveWine, getInventory, addBottleAtLocation, addBottles, findNextAvailableSlot } from '../services/storageService';
import { Wine, CellarWine, BottleLocation } from '../types';
import { FlavorRadar } from '../components/FlavorRadar';
import { Search, Loader2, Save, FileSpreadsheet, Keyboard, Camera, Plus, MapPin, PackagePlus, ArrowRight, AlertTriangle, Edit3, Video, Upload, X } from 'lucide-react';

export const AddWine: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Rack location from CellarMap empty-cell flow
  const rackLocation: BottleLocation | undefined = (() => {
    const rId = searchParams.get('rackId'), rX = searchParams.get('rackX'), rY = searchParams.get('rackY');
    return rId && rX !== null && rY !== null ? { rackId: rId, x: Number(rX), y: Number(rY) } : undefined;
  })();
  const rackName = searchParams.get('rackName');

  const [activeTab, setActiveTab] = useState<'NEW' | 'EXISTING'>('NEW');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Wine State
  const [mode, setMode] = useState<'MANUAL' | 'CSV' | 'SCAN'>('MANUAL');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');
  const [vintage, setVintage] = useState<number>(new Date().getFullYear());
  const [hint, setHint] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [appellation, setAppellation] = useState('');

  // Edit State (Step 3)
  const [enrichedWine, setEnrichedWine] = useState<Partial<Wine> | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Wine>>({});
  
  const [count, setCount] = useState(1);
  const [purchasePrice, setPurchasePrice] = useState<number | undefined>(undefined);
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [scanImageBack, setScanImageBack] = useState<string | null>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  // Webcam State
  const [showScanChoice, setShowScanChoice] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Existing Wine State (Quick Add)
  const [existingWines, setExistingWines] = useState<CellarWine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExisting, setSelectedExisting] = useState<CellarWine | null>(null);
  const [quickAddCount, setQuickAddCount] = useState(1);
  const [autoPlace, setAutoPlace] = useState(true);
  const [suggestedLocations, setSuggestedLocations] = useState<string[]>([]);

  // Cleanup webcam on unmount
  useEffect(() => {
      return () => {
          if (streamRef.current) {
              streamRef.current.getTracks().forEach(t => t.stop());
          }
      };
  }, []);

  // Prefill from wishlist
  useEffect(() => {
    if (searchParams.get('prefill') === 'true') {
      const prefillName = searchParams.get('name');
      const prefillVintage = searchParams.get('vintage');
      const prefillProducer = searchParams.get('producer');
      const prefillType = searchParams.get('type');
      if (prefillName) setName(prefillName);
      if (prefillVintage) setVintage(Number(prefillVintage));
      if (prefillProducer) setHint(prefillProducer);
      if (prefillType) setSelectedType(prefillType);
    }
  }, []);

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

  const compressImage = (dataUrl: string, maxSize = 1600, quality = 0.8): Promise<string> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              let { width, height } = img;
              if (width > maxSize || height > maxSize) {
                  if (width > height) {
                      height = Math.round(height * maxSize / width);
                      width = maxSize;
                  } else {
                      width = Math.round(width * maxSize / height);
                      height = maxSize;
                  }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d')!;
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => resolve(dataUrl); // fallback to original
          img.src = dataUrl;
      });
  };

  const handleScanClick = () => {
      setMode('SCAN');
      setShowScanChoice(true);
  };

  const handleScanFromFile = () => {
      setShowScanChoice(false);
      fileInputRef.current?.click();
  };

  const startWebcam = async () => {
      setShowScanChoice(false);
      setShowWebcam(true);
      try {
          const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
          });
          streamRef.current = stream;
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
          }
      } catch (err) {
          console.error('Webcam error:', err);
          alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
          stopWebcam();
      }
  };

  const stopWebcam = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
      }
      setShowWebcam(false);
  };

  const captureWebcam = () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setScanImage(dataUrl);
      stopWebcam();
      setStep(2);
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
      });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const raw = await readFileAsDataUrl(file);
      const compressed = await compressImage(raw);
      setScanImage(compressed);
      setStep(2);
  };

  const handleBackFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const raw = await readFileAsDataUrl(file);
      const compressed = await compressImage(raw);
      setScanImageBack(compressed);
  };

  const handleStartScan = async () => {
      if (!scanImage) return;
      setIsLoading(true);

      try {
          // Ensure image is compressed (re-compress if needed)
          const compressed = await compressImage(scanImage, 1280, 0.75);
          const base64 = compressed.split(',')[1];

          if (!base64 || base64.length < 100) {
              throw new Error("Image invalide ou vide");
          }

          console.log(`Scan: sending ${Math.round(base64.length / 1024)}KB image to AI`);
          const result = await enrichWineData("", 0, "", base64);

          if (result) {
              setEnrichedWine(result);
              setEditFormData(result);
              setName(result.name || "Vin Inconnu");
              setVintage(result.vintage || new Date().getFullYear());
              setStep(3);
          } else {
              alert("L'IA n'a pas pu identifier ce vin. Essayez avec une photo plus nette ou la saisie manuelle.");
              setStep(1);
          }
      } catch (err: any) {
          console.error("Scan error:", err);
          const msg = err?.message || String(err);
          if (msg.includes('API') || msg.includes('key') || msg.includes('401') || msg.includes('403')) {
              alert("Erreur de configuration IA. Vérifiez votre clé API dans les Paramètres.");
          } else if (msg.includes('size') || msg.includes('too large') || msg.includes('413')) {
              alert("Image trop volumineuse. Essayez avec une photo moins détaillée.");
          } else {
              alert(`Erreur d'analyse : ${msg}`);
          }
          setStep(1);
      } finally {
          setIsLoading(false);
      }
  };

  const handleEnrich = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStep(2);

    // Build enriched hint with type and appellation context
    const typeLabels: Record<string, string> = { RED: 'rouge', WHITE: 'blanc', ROSE: 'rosé', SPARKLING: 'pétillant', DESSERT: 'dessert', FORTIFIED: 'fortifié' };
    const parts = [hint];
    if (selectedType) parts.push(`Type: vin ${typeLabels[selectedType] || selectedType}`);
    if (appellation) parts.push(`Appellation: ${appellation}`);
    const enrichedHint = parts.filter(Boolean).join('. ');

    try {
      const result = await enrichWineData(name, vintage, enrichedHint);
      if (result) {
        // Pre-fill with user-provided type/appellation if AI didn't override
        const merged = { ...result };
        if (selectedType && !result.type) merged.type = selectedType as any;
        if (appellation && !result.appellation) merged.appellation = appellation;
        setEnrichedWine(merged);
        setEditFormData(merged);
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

    await saveWine(newWine, rackLocation ? 1 : count, purchasePrice, rackLocation);
    navigate('/');
  };

  // ✅ Correction : handleQuickAdd asynchrone
  const handleQuickAdd = async () => {
      if (!selectedExisting) return;

      for(let i=0; i<quickAddCount; i++) {
          if (autoPlace) {
              const slot = await findNextAvailableSlot();
              if (slot) {
                  await addBottleAtLocation(selectedExisting.id, slot.location, selectedExisting.name, selectedExisting.vintage, purchasePrice);
              } else {
                  await addBottles(selectedExisting.id, 1, 'Non trié', selectedExisting.name, selectedExisting.vintage, purchasePrice);
              }
          } else {
              await addBottles(selectedExisting.id, 1, 'Non trié', selectedExisting.name, selectedExisting.vintage, purchasePrice);
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
      <canvas ref={canvasRef} className="hidden" />

      {/* Scan Choice Modal */}
      {showScanChoice && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
              <div className="absolute inset-0 bg-stone-900/30 dark:bg-black/70 backdrop-blur-sm" onClick={() => setShowScanChoice(false)} />
              <div className="bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-700 w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl p-6 pb-10 sm:pb-6 relative z-10 shadow-2xl animate-slide-up">
                  <div className="w-10 h-1 bg-stone-300 dark:bg-stone-600 rounded-full mx-auto mb-4 sm:hidden" />
                  <h3 className="text-lg font-serif text-stone-900 dark:text-white mb-4 text-center">Scanner une étiquette</h3>
                  <div className="grid grid-cols-2 gap-3">
                      <button
                          onClick={handleScanFromFile}
                          className="flex flex-col items-center gap-3 p-5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                          <Upload size={28} className="text-wine-600" />
                          <div className="text-center">
                              <div className="text-sm font-medium text-stone-800 dark:text-white">Photo / Fichier</div>
                              <div className="text-[10px] text-stone-500 mt-0.5">Galerie ou appareil photo</div>
                          </div>
                      </button>
                      <button
                          onClick={startWebcam}
                          className="flex flex-col items-center gap-3 p-5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                          <Video size={28} className="text-indigo-600" />
                          <div className="text-center">
                              <div className="text-sm font-medium text-stone-800 dark:text-white">Webcam</div>
                              <div className="text-[10px] text-stone-500 mt-0.5">Capture en direct</div>
                          </div>
                      </button>
                  </div>
                  <button onClick={() => setShowScanChoice(false)} className="w-full py-2 mt-4 text-stone-500 text-sm">Annuler</button>
              </div>
          </div>
      )}

      {/* Webcam Capture Modal */}
      {showWebcam && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col">
              <div className="flex items-center justify-between p-4 bg-black/80">
                  <h3 className="text-white font-medium">Visez l'étiquette</h3>
                  <button onClick={stopWebcam} className="text-white/70 hover:text-white p-1">
                      <X size={24} />
                  </button>
              </div>
              <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                  <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                  />
                  {/* Viewfinder overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-[75%] max-w-sm aspect-[3/4] border-2 border-white/40 rounded-2xl">
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-white rounded-tl-xl" />
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-white rounded-tr-xl" />
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-white rounded-bl-xl" />
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-white rounded-br-xl" />
                      </div>
                  </div>
              </div>
              <div className="p-6 pb-24 bg-black/80 flex justify-center">
                  <button
                      onClick={captureWebcam}
                      className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center bg-white/20 hover:bg-white/30 active:bg-white/50 transition-colors"
                  >
                      <div className="w-14 h-14 rounded-full bg-white" />
                  </button>
              </div>
          </div>
      )}

      {/* Rack location banner */}
      {rackLocation && (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 mb-4">
          <MapPin size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-800 dark:text-emerald-300">
            Emplacement : <strong>{rackName || 'Rack'}</strong> • {String.fromCharCode(65 + rackLocation.y)}{rackLocation.x + 1}
          </span>
        </div>
      )}

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

              {/* Type / Couleur (optionnel, aide l'IA) */}
              <div>
                <label className="block text-sm font-medium text-stone-500 dark:text-stone-400 mb-2">Couleur / Type <span className="text-stone-400 dark:text-stone-600 font-normal">(optionnel)</span></label>
                <div className="grid grid-cols-3 gap-1.5">
                    {([
                        { value: 'RED', label: 'Rouge', color: 'bg-red-800 border-red-600 text-white' },
                        { value: 'WHITE', label: 'Blanc', color: 'bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200' },
                        { value: 'ROSE', label: 'Rosé', color: 'bg-pink-200 border-pink-400 text-pink-800 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-200' },
                        { value: 'SPARKLING', label: 'Pétillant', color: 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200' },
                        { value: 'DESSERT', label: 'Dessert', color: 'bg-orange-200 border-orange-400 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-200' },
                        { value: 'FORTIFIED', label: 'Fortifié', color: 'bg-stone-700 border-stone-500 text-white' },
                    ]).map(t => (
                        <button
                            key={t.value}
                            type="button"
                            onClick={() => setSelectedType(selectedType === t.value ? '' : t.value)}
                            className={`py-2 px-2 rounded-lg border text-xs font-medium transition-all ${
                                selectedType === t.value
                                ? `${t.color} ring-2 ring-offset-1 ring-wine-500 shadow-sm`
                                : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500 hover:border-stone-400'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-500 dark:text-stone-400 mb-2">Appellation <span className="text-stone-400 dark:text-stone-600 font-normal">(optionnel)</span></label>
                <input
                  type="text"
                  value={appellation}
                  onChange={(e) => setAppellation(e.target.value)}
                  placeholder="ex: Chablis Premier Cru, Saint-Émilion..."
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-4 py-3 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 focus:border-transparent outline-none transition-all placeholder-stone-400 dark:placeholder-stone-700"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-wine-600 hover:bg-wine-700 text-white font-medium py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-wine-500/20 dark:shadow-wine-900/20"
              >
                <Search size={20} /> Identifier & Enrichir
              </button>
            </form>
          )}

          {/* STEP 2: PREVIEW + LOADING */}
          {step === 2 && mode === 'SCAN' && !isLoading && scanImage && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-serif text-stone-900 dark:text-white text-center">Aperçu de l'étiquette</h3>

              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                      <p className="text-xs text-stone-500 uppercase font-bold text-center">Face</p>
                      <div className="relative rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 aspect-[3/4]">
                          <img src={scanImage} alt="Étiquette face" className="w-full h-full object-cover" />
                      </div>
                      <button onClick={() => { setScanImage(null); fileInputRef.current?.click(); }} className="w-full text-xs text-stone-500 hover:text-wine-600 py-1">Reprendre</button>
                  </div>
                  <div className="space-y-2">
                      <p className="text-xs text-stone-500 uppercase font-bold text-center">Dos (optionnel)</p>
                      {scanImageBack ? (
                          <>
                              <div className="relative rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 aspect-[3/4]">
                                  <img src={scanImageBack} alt="Étiquette dos" className="w-full h-full object-cover" />
                              </div>
                              <button onClick={() => setScanImageBack(null)} className="w-full text-xs text-stone-500 hover:text-wine-600 py-1">Supprimer</button>
                          </>
                      ) : (
                          <button
                              onClick={() => backFileInputRef.current?.click()}
                              className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-700 flex flex-col items-center justify-center gap-2 text-stone-400 hover:text-stone-600 hover:border-stone-500 transition-colors"
                          >
                              <Camera size={24} />
                              <span className="text-xs">Ajouter le dos</span>
                          </button>
                      )}
                  </div>
              </div>
              <input type="file" accept="image/*" capture="environment" ref={backFileInputRef} onChange={handleBackFileChange} className="hidden" />

              <div className="flex gap-3">
                  <button onClick={() => { setStep(1); setScanImage(null); setScanImageBack(null); }} className="flex-1 py-3 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-500 hover:text-stone-800 dark:hover:text-white transition-colors">
                      Annuler
                  </button>
                  <button onClick={handleStartScan} className="flex-1 bg-wine-600 hover:bg-wine-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-wine-900/30 transition-all">
                      <Search size={18} /> Analyser
                  </button>
              </div>
            </div>
          )}

          {step === 2 && isLoading && (
            <div className="space-y-6 animate-fade-in">
              {mode === 'SCAN' && scanImage && (
                  <div className="relative rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 max-w-xs mx-auto aspect-[3/4]">
                      <img src={scanImage} alt="Scanning..." className="w-full h-full object-cover opacity-70" />
                      <div className="absolute inset-0 bg-gradient-to-b from-wine-500/10 to-transparent" />
                      <div className="absolute left-0 right-0 h-0.5 bg-wine-500 shadow-[0_0_8px_rgba(224,36,36,0.8)] animate-scan-line" />
                  </div>
              )}
              <div className="flex flex-col items-center justify-center py-8 text-stone-400 space-y-4">
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
            </div>
          )}

          {/* STEP 3: REVIEW & CONFIRM */}
          {step === 3 && enrichedWine && (
            <div className="space-y-6 animate-fade-in-up">
              
              {/* Confidence Indicator */}
              {(() => {
                  const confidence = enrichedWine.aiConfidence || 'MEDIUM';
                  const styles = {
                      HIGH: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-300', label: 'Confiance élevée', icon: '✓' },
                      MEDIUM: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-700/50', text: 'text-yellow-700 dark:text-yellow-200', label: 'Confiance moyenne — vérifiez la Cuvée et la Parcelle', icon: '⚠' },
                      LOW: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-700/50', text: 'text-red-700 dark:text-red-200', label: 'Confiance faible — vérification manuelle recommandée', icon: '✗' },
                  };
                  const s = styles[confidence as keyof typeof styles] || styles.MEDIUM;
                  return (
                      <div className={`${s.bg} border ${s.border} p-4 rounded-xl flex items-center gap-3 ${s.text}`}>
                          <span className="text-lg">{s.icon}</span>
                          <div className="text-sm flex-1">
                              <strong>{confidence === 'HIGH' ? 'Données fiables' : 'Vérification requise'} :</strong> {s.label}
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${confidence === 'HIGH' ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200' : confidence === 'LOW' ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200' : 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200'}`}>
                              {confidence}
                          </span>
                      </div>
                  );
              })()}

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

                              {/* Type / Couleur */}
                              <div className="pt-3">
                                  <label className="text-[10px] uppercase text-stone-500 mb-2 block">Type / Couleur</label>
                                  <div className="grid grid-cols-3 gap-1.5">
                                      {([
                                          { value: 'RED' as const, label: 'Rouge', color: 'bg-red-800 border-red-600 text-white' },
                                          { value: 'WHITE' as const, label: 'Blanc', color: 'bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200' },
                                          { value: 'ROSE' as const, label: 'Rosé', color: 'bg-pink-200 border-pink-400 text-pink-800 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-200' },
                                          { value: 'SPARKLING' as const, label: 'Pétillant', color: 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200' },
                                          { value: 'DESSERT' as const, label: 'Dessert', color: 'bg-orange-200 border-orange-400 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-200' },
                                          { value: 'FORTIFIED' as const, label: 'Fortifié', color: 'bg-stone-700 border-stone-500 text-white' },
                                      ]).map(t => (
                                          <button
                                              key={t.value}
                                              type="button"
                                              onClick={() => setEditFormData({...editFormData, type: t.value})}
                                              className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all ${
                                                  editFormData.type === t.value
                                                  ? `${t.color} ring-2 ring-offset-1 ring-wine-500 shadow-sm`
                                                  : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500 hover:border-stone-400'
                                              }`}
                                          >
                                              {t.label}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              {/* Appellation */}
                              <div className="pt-2">
                                  <label className="text-[10px] uppercase text-stone-500">Appellation</label>
                                  <input
                                      type="text"
                                      value={editFormData.appellation || ''}
                                      onChange={(e) => setEditFormData({...editFormData, appellation: e.target.value})}
                                      placeholder="ex: Chablis Premier Cru"
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
                <div className="flex items-center gap-4 flex-wrap">
                    {rackLocation ? (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                        <MapPin size={14} />
                        <span>1 bouteille → {rackName || 'Rack'} {String.fromCharCode(65 + rackLocation.y)}{rackLocation.x + 1}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label className="text-stone-500 dark:text-stone-400 text-sm">Quantité :</label>
                        <div className="flex items-center bg-stone-100 dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800">
                          <button onClick={() => setCount(Math.max(1, count - 1))} className="px-4 py-2 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300">-</button>
                          <span className="px-4 font-bold text-stone-900 dark:text-white w-12 text-center">{count}</span>
                          <button onClick={() => setCount(count + 1)} className="px-4 py-2 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300">+</button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-stone-500 dark:text-stone-400 text-sm">Prix/btl :</label>
                      <div className="flex items-center bg-stone-100 dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={purchasePrice ?? ''}
                          onChange={(e) => setPurchasePrice(e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="--"
                          className="w-16 px-3 py-2 bg-transparent text-stone-900 dark:text-white text-center outline-none text-sm"
                        />
                        <span className="pr-3 text-stone-400 text-sm">{'\u20AC'}</span>
                      </div>
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

                        <div className="flex items-center justify-between">
                            <label className="text-stone-600 dark:text-stone-300">Prix par bouteille</label>
                            <div className="flex items-center bg-stone-100 dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={purchasePrice ?? ''}
                                  onChange={(e) => setPurchasePrice(e.target.value ? Number(e.target.value) : undefined)}
                                  placeholder="--"
                                  className="w-20 px-3 py-2 bg-transparent text-stone-900 dark:text-white text-center outline-none text-sm"
                                />
                                <span className="pr-3 text-stone-400 text-sm">{'\u20AC'}</span>
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