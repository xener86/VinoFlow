import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInventory, getRacks, consumeSpecificBottle, moveBottle, saveRack, deleteRack, fillRackWithWine, addBottleAtLocation, updateRack, reorderRack, giftBottle } from '../services/storageService';
import { CellarWine, Rack, BottleLocation } from '../types';
import { Search, Droplet, Gift, Move, X, Eye, PencilRuler, Plus, Wand2, Box, PackagePlus, Inbox, ChevronRight } from 'lucide-react';
import { optimizeCellarStorage } from '../services/geminiService';
import { RackGrid } from '../components/RackGrid';

interface SelectedBottleState {
    wine: CellarWine;
    bottleId: string;
    location: BottleLocation;
}

interface OptimizationSuggestion {
    bottleId: string;
    reason: string;
}

interface EmptySlotTarget {
    rackId: string;
    x: number;
    y: number;
    rackName: string;
}

const wineTypeLabels: Record<string, string> = {
  'RED': 'ROUGE',
  'WHITE': 'BLANC',
  'ROSE': 'ROSÉ',
  'SPARKLING': 'PÉTILLANT',
  'DESSERT': 'DESSERT',
  'FORTIFIED': 'FORTIFIÉ'
};

const getRowLabel = (index: number) => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return letters[index] || "?";
};

export const CellarMap: React.FC = () => {
  const navigate = useNavigate();
  const [racks, setRacks] = useState<Rack[]>([]);
  const [inventory, setInventory] = useState<CellarWine[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  
  // Advanced Features State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBottle, setSelectedBottle] = useState<SelectedBottleState | null>(null);
  const [moveSource, setMoveSource] = useState<SelectedBottleState | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  
  // Architect Mode State
  const [isArchitectMode, setIsArchitectMode] = useState(false);
  const [showAddRackModal, setShowAddRackModal] = useState(false);
  const [createRackName, setCreateRackName] = useState('');
  const [newRackW, setNewRackW] = useState(6); // Default 6
  const [newRackH, setNewRackH] = useState(9); // Default 9
  const [newRackType, setNewRackType] = useState<'SHELF' | 'BOX'>('SHELF');

  // Edit Rack State
  const [editingRack, setEditingRack] = useState<Rack | null>(null);
  const [editRackName, setEditRackName] = useState('');
  
  // Quick Fill / Empty Slot Action State
  const [fillTargetRack, setFillTargetRack] = useState<Rack | null>(null);
  const [emptySlotTarget, setEmptySlotTarget] = useState<EmptySlotTarget | null>(null);
  const [showUnsortedDock, setShowUnsortedDock] = useState(true);

  // Optimization State
  const [optimizing, setOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const loadedRacks = getRacks();
    setRacks(loadedRacks);
    setInventory(getInventory());
    
    // Default selection logic
    if (loadedRacks.length > 0 && !selectedTabId) {
        const firstShelf = loadedRacks.find(r => r.type !== 'BOX');
        if (firstShelf) setSelectedTabId(firstShelf.id);
        else setSelectedTabId('VIEW_ALL_BOXES');
    } else if (loadedRacks.length > 0 && selectedTabId && !loadedRacks.find(r => r.id === selectedTabId) && selectedTabId !== 'VIEW_ALL_BOXES') {
        setSelectedTabId('VIEW_ALL_BOXES');
    }
  };

  const getMatchesForRack = (rackId: string): number => {
      if (!searchQuery) return 0;
      let count = 0;
      inventory.forEach(w => {
          const isMatch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) || w.vintage.toString().includes(searchQuery);
          if (isMatch) {
              w.bottles.forEach(b => {
                  if (typeof b.location !== 'string' && b.location.rackId === rackId && !b.isConsumed) {
                      count++;
                  }
              });
          }
      });
      return count;
  };

  const unsortedBottles = inventory.flatMap(w => w.bottles.filter(b => b.location === 'Non trié' && !b.isConsumed).map(b => ({ ...b, wineName: w.name, wineVintage: w.vintage, wineType: w.type })));

  // --- Interactions ---

  const handleSlotClick = (rackId: string, x: number, y: number, rackName: string) => {
    // Check if slot occupied
    let occupied = false;
    let targetBottle: any = null;
    
    for (const w of inventory) {
        const b = w.bottles.find(b => {
            if (typeof b.location === 'string') return false;
            return b.location.rackId === rackId && b.location.x === x && b.location.y === y && !b.isConsumed;
        });
        if (b) {
            occupied = true;
            targetBottle = { wine: w, bottle: b };
            break;
        }
    }

    if (moveSource) {
       if (occupied) {
           alert("Emplacement déjà occupé.");
           return;
       }
        moveBottle(moveSource.bottleId, { rackId, x, y });
        setMoveSource(null);
        loadData();
        return;
     }

    if (occupied && targetBottle) {
        setSelectedBottle({
            wine: targetBottle.wine,
            bottleId: targetBottle.bottle.id,
            location: { rackId, x, y }
        });
    } else {
        setEmptySlotTarget({ rackId, x, y, rackName });
    }
  };

  const handleDragStart = (e: React.DragEvent, bottleId: string) => {
      setDragSourceId(bottleId);
      e.dataTransfer.setData("bottleId", bottleId);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); 
      e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, rackId: string, x: number, y: number) => {
      e.preventDefault();
      const bottleId = e.dataTransfer.getData("bottleId");
      if (bottleId) {
          // Check occupancy
          let occupied = false;
          for (const w of inventory) {
              if(w.bottles.some(b => typeof b.location !== 'string' && b.location.rackId === rackId && b.location.x === x && b.location.y === y && !b.isConsumed && b.id !== bottleId)) {
                  occupied = true;
                  break;
              }
          }
          if (occupied) return;

            moveBottle(bottleId, { rackId, x, y });
            setDragSourceId(null);
            loadData();
        }
    };

  const handleDropToDock = (e: React.DragEvent) => {
      e.preventDefault();
      const bottleId = e.dataTransfer.getData("bottleId");
      if (bottleId) {
          moveBottle(bottleId, 'Non trié');
          setDragSourceId(null);
          loadData();
      }
  };

  const handleConsume = () => {
        if (selectedBottle && window.confirm(`Boire ${selectedBottle.wine.name} ?`)) {
            consumeSpecificBottle(selectedBottle.wine.id, selectedBottle.bottleId);
            setSelectedBottle(null);
            loadData();
        }
  };

  const handleStartMove = () => {
      setMoveSource(selectedBottle);
      setSelectedBottle(null);
  };

  const handleGift = () => {
        if (!selectedBottle) return;
        const recipient = window.prompt('Nom et prénom du destinataire ?');
        if (!recipient) return;
        const occasion = window.prompt("Occasion (ex: anniversaire, merci, ...)") || 'Cadeau';
        giftBottle(selectedBottle.wine.id, selectedBottle.bottleId, recipient, occasion);
        alert(`Bouteille offerte à ${recipient}`);
        setSelectedBottle(null);
        loadData();
  };

  // --- Architect Logic ---
  const handleCreateRack = () => {
      const newRack: Rack = {
          id: crypto.randomUUID(),
          name: createRackName,
          width: newRackW,
          height: newRackH,
          type: newRackType
      };
      saveRack(newRack);
      setRacks(getRacks());
      setShowAddRackModal(false);
      
      if (newRack.type === 'BOX') {
          setSelectedTabId('VIEW_ALL_BOXES');
      } else {
          setSelectedTabId(newRack.id);
      }
  };

  const handleDeleteRack = (id: string) => {
      if(window.confirm("Supprimer ce rangement ? Les bouteilles seront marquées 'Non triées'.")) {
          deleteRack(id);
          const updatedRacks = getRacks();
          setRacks(updatedRacks);
          loadData(); 
          
          if (selectedTabId === id) {
              setSelectedTabId('VIEW_ALL_BOXES');
          }
      }
  };

  const handleEditRack = (rack: Rack) => {
      setEditingRack(rack);
      setEditRackName(rack.name);
  };

  const handleSaveRackEdit = () => {
      if (editingRack && editRackName) {
          updateRack(editingRack.id, { name: editRackName });
          setEditingRack(null);
          loadData();
      }
  };

  const handleReorderRack = (id: string, direction: 'left' | 'right') => {
      reorderRack(id, direction);
      loadData();
  };
  
  const handleQuickFill = (rack: Rack) => {
      setFillTargetRack(rack);
  };
  
  const confirmQuickFill = (wine: CellarWine) => {
        if(fillTargetRack && window.confirm(`Remplir ${fillTargetRack.name} avec ${wine.name} ?`)) {
            fillRackWithWine(fillTargetRack.id, wine.id);
            setFillTargetRack(null);
            loadData();
        }
  };

  const handleAddExistingToSlot = (wine: CellarWine) => {
      if(emptySlotTarget) {
          addBottleAtLocation(wine.id, { rackId: emptySlotTarget.rackId, x: emptySlotTarget.x, y: emptySlotTarget.y });
          setEmptySlotTarget(null);
          loadData();
      }
  };

  const handleOptimize = async () => {
      setOptimizing(true);
      setSuggestions([]);
      
      const boxWines: {id: string, name: string}[] = [];
      const shelfWines: {id: string, name: string}[] = [];

      inventory.forEach(w => {
          w.bottles.forEach(b => {
             const rack = racks.find(r => typeof b.location !== 'string' && r.id === b.location.rackId);
             if(rack) {
                 if(rack.type === 'BOX') boxWines.push({ id: b.id, name: w.name });
                 else shelfWines.push({ id: b.id, name: w.name });
             }
          });
      });

      const results = await optimizeCellarStorage(boxWines, shelfWines);
      setSuggestions(results);
      setOptimizing(false);
  };

  const handleBoxPreset = (w: number, h: number, name: string) => {
      setNewRackW(w);
      setNewRackH(h);
      setCreateRackName(name);
  };

  const shelves = racks.filter(r => r.type !== 'BOX');
  const boxes = racks.filter(r => r.type === 'BOX');
  const boxesMatchCount = boxes.reduce((acc, box) => acc + getMatchesForRack(box.id), 0);

  return (
    <div className="space-y-6 animate-fade-in pb-24 relative min-h-screen">
      
      {/* HEADER & TOOLBAR */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <h2 className="text-3xl font-serif text-stone-800 dark:text-white">Plan de Cave</h2>
            
            <div className="flex gap-2">
                 <button 
                    onClick={() => setIsArchitectMode(!isArchitectMode)}
                    className={`p-2 rounded-full border transition-all ${isArchitectMode ? 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900 dark:border-indigo-500 dark:text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-white text-stone-500 border-stone-200 dark:bg-stone-900 dark:border-stone-700 dark:text-stone-400'}`}
                    title="Mode Architecte"
                >
                    <PencilRuler size={20} />
                </button>
                <button 
                    onClick={handleOptimize}
                    disabled={optimizing}
                    className={`p-2 rounded-full border transition-all ${suggestions.length > 0 ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:border-purple-500 dark:text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-white text-stone-500 border-stone-200 dark:bg-stone-900 dark:border-stone-700 dark:text-stone-400'}`}
                    title="Optimisation IA"
                >
                    <Wand2 size={20} className={optimizing ? "animate-spin" : ""} />
                </button>
            </div>
        </div>

        {/* Global Search */}
        <div className="relative">
            <Search className="absolute left-3 top-3 text-stone-400" size={18} />
            <input 
                type="text"
                placeholder="Chercher dans toute la cave..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl py-2.5 pl-10 pr-4 text-stone-800 dark:text-white focus:ring-2 focus:ring-wine-600 outline-none"
            />
        </div>

        {/* RACK NAVIGATOR (Tabs) */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {/* Shelf Tabs */}
            {shelves.map(rack => {
                const matchCount = getMatchesForRack(rack.id);
                const isSelected = selectedTabId === rack.id;
                
                return (
                    <button
                        key={rack.id}
                        onClick={() => setSelectedTabId(rack.id)}
                        className={`relative px-4 py-2 text-xs font-medium rounded-t-lg border-t border-x whitespace-nowrap flex items-center gap-2 transition-all ${
                            isSelected 
                            ? 'bg-white dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white z-10 shadow-sm' 
                            : 'bg-stone-100 dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-900/80'
                        }`}
                        style={{marginBottom: -1}} 
                    >
                        {rack.name}
                        {matchCount > 0 && (
                            <span className="bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                                {matchCount}
                            </span>
                        )}
                    </button>
                )
            })}

            {/* Boxes Tab */}
            {boxes.length > 0 && (
                <button
                    onClick={() => setSelectedTabId('VIEW_ALL_BOXES')}
                    className={`relative px-4 py-2 text-xs font-medium rounded-t-lg border-t border-x whitespace-nowrap flex items-center gap-2 transition-all ${
                        selectedTabId === 'VIEW_ALL_BOXES'
                        ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-100 dark:border-amber-800 text-amber-800 dark:text-amber-100 z-10 shadow-sm' 
                        : 'bg-stone-100 dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-900/80'
                    }`}
                    style={{marginBottom: -1}}
                >
                    <Box size={14} className="text-amber-500" />
                    Mes Caisses ({boxes.length})
                    {boxesMatchCount > 0 && (
                        <span className="bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                            {boxesMatchCount}
                        </span>
                    )}
                </button>
            )}

            {isArchitectMode && (
                <button 
                  onClick={() => setShowAddRackModal(true)}
                  className="px-3 py-1.5 text-xs rounded-full border border-dashed border-stone-400 dark:border-stone-600 text-stone-500 hover:text-stone-800 dark:hover:text-white hover:border-stone-500 dark:hover:border-stone-400"
                >
                    <Plus size={14} />
                </button>
            )}
        </div>
      </div>

      {/* UNSORTED BOTTLES DOCK */}
      {unsortedBottles.length > 0 && (
        <div className={`fixed bottom-24 right-4 z-40 transition-transform duration-300 ${showUnsortedDock ? 'translate-x-0' : 'translate-x-full'}`}>
           <div
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl p-4 w-64 max-h-[40vh] overflow-y-auto flex flex-col gap-2 relative"
            onDragOver={handleDragOver}
            onDrop={handleDropToDock}
           >
               <button 
                onClick={() => setShowUnsortedDock(false)}
                className="absolute -left-8 top-0 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-2 rounded-l-lg text-stone-400 hover:text-stone-800 dark:hover:text-white"
               >
                   <ChevronRight size={16} />
               </button>
               <div className="flex items-center gap-2 text-stone-700 dark:text-stone-300 mb-2 border-b border-stone-200 dark:border-stone-800 pb-2">
                   <Inbox size={16} className="text-wine-600 dark:text-wine-400" />
                   <span className="text-sm font-bold">Quai de Réception</span>
                   <span className="text-xs bg-stone-100 dark:bg-stone-800 px-2 rounded-full ml-auto">{unsortedBottles.length}</span>
               </div>
               <p className="text-[10px] text-stone-500 italic">Glissez ces bouteilles vers les étagères pour les ranger.</p>
               {unsortedBottles.map((b, i) => (
                   <div
                    key={b.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, b.id)}
                    title={`${b.wineName} • ${b.wineVintage}`}
                    className="bg-stone-50 dark:bg-stone-950 p-2 rounded border border-stone-200 dark:border-stone-800 cursor-grab hover:border-stone-400 dark:hover:border-stone-600 active:cursor-grabbing"
                   >
                       <div className="text-xs text-stone-800 dark:text-white truncate">{b.wineName}</div>
                       <div className="text-[10px] text-stone-500">{b.wineVintage} • {wineTypeLabels[b.wineType] || b.wineType}</div>
                   </div>
               ))}
           </div>
        </div>
      )}
      {!showUnsortedDock && unsortedBottles.length > 0 && (
         <button 
            onClick={() => setShowUnsortedDock(true)}
            className="fixed bottom-24 right-0 z-40 bg-wine-600 text-white p-3 rounded-l-xl shadow-lg hover:bg-wine-500 transition-colors"
         >
             <Inbox size={20} />
             <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full">{unsortedBottles.length}</span>
         </button>
      )}

      {/* VIEW CONTENT */}
      <div className={`grid gap-6 ${selectedTabId === 'VIEW_ALL_BOXES' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
          {(() => {
              if (selectedTabId === 'VIEW_ALL_BOXES') {
                  return boxes.map(box => (
                      <RackGrid 
                        key={box.id}
                        rack={box}
                        inventory={inventory}
                        isArchitectMode={isArchitectMode}
                        searchQuery={searchQuery}
                        moveSource={moveSource}
                        selectedBottle={selectedBottle}
                        dragSourceId={dragSourceId}
                        suggestions={suggestions}
                        onSlotClick={handleSlotClick}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onFill={handleQuickFill}
                        onEdit={handleEditRack}
                        onDelete={handleDeleteRack}
                        onReorder={handleReorderRack}
                      />
                  ));
              } else {
                  const rack = racks.find(r => r.id === selectedTabId);
                  if (!rack) return (
                      <div className="text-center py-20 text-stone-500">
                          <p>Sélectionnez ou créez un rangement.</p>
                      </div>
                  );
                  return (
                      <RackGrid 
                        rack={rack}
                        inventory={inventory}
                        isArchitectMode={isArchitectMode}
                        searchQuery={searchQuery}
                        moveSource={moveSource}
                        selectedBottle={selectedBottle}
                        dragSourceId={dragSourceId}
                        suggestions={suggestions}
                        onSlotClick={handleSlotClick}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onFill={handleQuickFill}
                        onEdit={handleEditRack}
                        onDelete={handleDeleteRack}
                        onReorder={handleReorderRack}
                      />
                  );
              }
          })()}
      </div>

      {/* BOTTLE ACTION MODAL */}
      {selectedBottle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/20 dark:bg-black/80 backdrop-blur-sm" onClick={() => setSelectedBottle(null)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up">
                  <button onClick={() => setSelectedBottle(null)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-white"><X size={20} /></button>
                  
                  <div className="text-center mb-6">
                      <h3 className="text-2xl font-serif text-stone-900 dark:text-white mb-1">{selectedBottle.wine.name}</h3>
                      <p className="text-stone-500 dark:text-stone-400">{selectedBottle.wine.producer} • {selectedBottle.wine.vintage}</p>
                      <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                          {racks.find(r => r.id === selectedBottle.location.rackId)?.name} • {getRowLabel(selectedBottle.location.y)}{selectedBottle.location.x+1}
                      </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <button onClick={handleConsume} className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                          <Droplet size={24} className="text-wine-600 dark:text-wine-500" /> <span className="text-sm">Boire</span>
                      </button>
                      <button onClick={handleStartMove} className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                          <Move size={24} className="text-blue-600 dark:text-blue-500" /> <span className="text-sm">Déplacer</span>
                      </button>
                      <button onClick={() => navigate(`/wine/${selectedBottle.wine.id}`)} className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                          <Eye size={24} className="text-emerald-600 dark:text-emerald-500" /> <span className="text-sm">Fiche</span>
                      </button>
                      <button onClick={handleGift} className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors">
                          <Gift size={24} className="text-purple-600 dark:text-purple-500" /> <span className="text-sm">Offrir</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* QUICK FILL MODAL (CRATES) */}
      {fillTargetRack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80" onClick={() => setFillTargetRack(null)} />
              <div className="bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-900/50 w-full max-w-sm rounded-2xl p-6 relative z-10">
                  <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-4 flex items-center gap-2">
                      <PackagePlus className="text-amber-500" /> Remplir {fillTargetRack.name}
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                      {inventory.map(w => (
                          <button key={w.id} onClick={() => confirmQuickFill(w)} className="w-full text-left p-3 rounded-lg bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 flex justify-between items-center border border-stone-200 dark:border-stone-800">
                              <div>
                                  <div className="text-stone-800 dark:text-white text-sm">{w.name}</div>
                                  <div className="text-stone-500 text-xs">{w.vintage}</div>
                              </div>
                              <Plus size={16} className="text-amber-500"/>
                          </button>
                      ))}
                  </div>
                  <button onClick={() => setFillTargetRack(null)} className="w-full py-2 text-stone-500">Annuler</button>
              </div>
          </div>
      )}

      {/* EMPTY SLOT MODAL */}
      {emptySlotTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80" onClick={() => setEmptySlotTarget(null)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10">
                  <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-2">Ajouter une bouteille</h3>
                  <p className="text-stone-500 text-xs mb-4">
                      {emptySlotTarget.rackName} • {getRowLabel(emptySlotTarget.y)}{emptySlotTarget.x+1}
                  </p>
                  
                  <div className="grid gap-3">
                      <button 
                        onClick={() => navigate('/add')}
                        className="bg-wine-600 hover:bg-wine-700 text-white p-3 rounded-xl flex items-center gap-3 transition-colors"
                      >
                          <div className="bg-wine-800 p-2 rounded-lg"><Plus size={18}/></div>
                          <div className="text-left">
                              <div className="text-sm font-bold">Nouveau Vin</div>
                              <div className="text-[10px] text-wine-200">Créer une fiche vin complète</div>
                          </div>
                      </button>
                      
                      <div className="border-t border-stone-200 dark:border-stone-800 my-1 pt-2">
                          <p className="text-xs text-stone-500 mb-2 uppercase font-bold">Ou placer un vin existant</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                              {inventory.map(w => (
                                  <button 
                                    key={w.id} 
                                    onClick={() => handleAddExistingToSlot(w)}
                                    className="w-full text-left p-2 rounded-lg bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 flex justify-between items-center border border-stone-200 dark:border-stone-800"
                                  >
                                      <div>
                                          <div className="text-stone-800 dark:text-white text-xs">{w.name}</div>
                                          <div className="text-stone-500 text-[10px]">{w.vintage}</div>
                                      </div>
                                      <Plus size={14} className="text-stone-400"/>
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
                  <button onClick={() => setEmptySlotTarget(null)} className="w-full py-2 mt-4 text-stone-500">Annuler</button>
              </div>
          </div>
      )}

      {/* ADD RACK MODAL */}
      {showAddRackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80" onClick={() => setShowAddRackModal(false)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10">
                  <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-4">Architecture</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs text-stone-500 uppercase">Type de Rangement</label>
                          <div className="flex gap-2 mt-1 mb-4">
                              <button onClick={() => setNewRackType('SHELF')} className={`flex-1 py-2 text-sm rounded border transition-all ${newRackType === 'SHELF' ? 'bg-stone-800 border-stone-500 text-white' : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500'}`}>Étagère</button>
                              <button onClick={() => setNewRackType('BOX')} className={`flex-1 py-2 text-sm rounded border transition-all ${newRackType === 'BOX' ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-500 text-amber-800 dark:text-amber-200' : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500'}`}>Caisse</button>
                          </div>
                      </div>

                      {/* Presets for Boxes */}
                      {newRackType === 'BOX' && (
                          <div className="flex gap-2 mb-2">
                              <button onClick={() => handleBoxPreset(3, 2, "Caisse de 6")} className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 py-2 text-xs text-stone-500 rounded hover:bg-stone-100 dark:hover:text-white">6 Bouteilles</button>
                              <button onClick={() => handleBoxPreset(4, 3, "Caisse de 12")} className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 py-2 text-xs text-stone-500 rounded hover:bg-stone-100 dark:hover:text-white">12 Bouteilles</button>
                          </div>
                      )}

                      <div>
                          <label className="text-xs text-stone-500 uppercase">Nom</label>
                          <input type="text" value={createRackName} onChange={e => setCreateRackName(e.target.value)} className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" placeholder="ex: Étagère Salon" />
                      </div>
                      <div className="flex gap-4">
                          <div className="flex-1">
                              <label className="text-xs text-stone-500 uppercase">Largeur (Col)</label>
                              <input type="number" value={newRackW} onChange={e => setNewRackW(parseInt(e.target.value) || 0)} className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" />
                          </div>
                          <div className="flex-1">
                              <label className="text-xs text-stone-500 uppercase">Hauteur (Lig)</label>
                              <input type="number" value={newRackH} onChange={e => setNewRackH(parseInt(e.target.value) || 0)} className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" />
                          </div>
                      </div>
                      
                      <button onClick={handleCreateRack} className="w-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 font-bold py-3 rounded-lg mt-2 hover:bg-stone-800 dark:hover:bg-stone-200">Créer</button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT RACK MODAL */}
      {editingRack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80" onClick={() => setEditingRack(null)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10">
                  <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-4">Modifier le Rangement</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs text-stone-500 uppercase">Nom</label>
                          <input type="text" value={editRackName} onChange={e => setEditRackName(e.target.value)} className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" />
                      </div>
                      
                      <div className="flex gap-2">
                          <button onClick={() => setEditingRack(null)} className="flex-1 py-3 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">Annuler</button>
                          <button onClick={handleSaveRackEdit} className="flex-1 bg-stone-900 dark:bg-white text-white dark:text-stone-900 font-bold py-3 rounded-lg hover:bg-stone-800 dark:hover:bg-stone-200">Enregistrer</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};