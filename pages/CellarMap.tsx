import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInventory, getRacks, consumeSpecificBottle, moveBottle, saveRack, deleteRack, fillRackWithWine, addBottleAtLocation, updateRack, reorderRack } from '../services/storageService';
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
  const [newRackType, setNewRackType] = useState<'SHELF' | 'BOX'>('BOX'); // BOX par défaut
  const [newRackW, setNewRackW] = useState(3); // 3x2 = 6 par défaut
  const [newRackH, setNewRackH] = useState(2);
  const [createRackName, setCreateRackName] = useState('Caisse de 6');
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
       const success = moveBottle(moveSource.bottleId, { rackId, x, y });
       if (success) {
           setMoveSource(null);
           loadData();
       }
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

  const handleConsumeBottle = () => {
      if (selectedBottle) {
          consumeSpecificBottle(selectedBottle.wine.id, selectedBottle.bottleId);
          setSelectedBottle(null);
          loadData();
      }
  };

  const handleMoveStart = () => {
      if (selectedBottle) {
          setMoveSource(selectedBottle);
          setSelectedBottle(null);
      }
  };

  const handleAddExistingToSlot = (wine: CellarWine) => {
      if (emptySlotTarget) {
          addBottleAtLocation(wine.id, {
              rackId: emptySlotTarget.rackId,
              x: emptySlotTarget.x,
              y: emptySlotTarget.y
          });
          setEmptySlotTarget(null);
          loadData();
      }
  };

  const handleCreateRack = () => {
      const newRack: Rack = {
          id: crypto.randomUUID(),
          name: createRackName || `${newRackType === 'BOX' ? 'Caisse' : 'Étagère'} ${racks.length + 1}`,
          width: newRackW,
          height: newRackH,
          type: newRackType
      };
      saveRack(newRack);
      setShowAddRackModal(false);
      loadData();
      setSelectedTabId(newRack.id);
  };

  const handleDeleteRack = (rackId: string) => {
      if (window.confirm("Supprimer ce rangement ? Les bouteilles seront déplacées vers 'Non trié'.")) {
          deleteRack(rackId);
          setSelectedTabId(null);
          loadData();
      }
  };

  const handleStartEdit = (rack: Rack) => {
      setEditingRack(rack);
      setEditRackName(rack.name);
  };

  const handleSaveRackEdit = () => {
      if (editingRack) {
          updateRack(editingRack.id, { name: editRackName });
          setEditingRack(null);
          loadData();
      }
  };

  const handleFillRack = () => {
      if (fillTargetRack) {
          const wineId = prompt("Entrez l'ID du vin à utiliser pour le remplissage:");
          if (wineId) {
              fillRackWithWine(fillTargetRack.id, wineId);
              setFillTargetRack(null);
              loadData();
          }
      }
  };

  const handleOptimize = async () => {
      setOptimizing(true);
      try {
          const result = await optimizeCellarStorage(inventory, racks);
          setSuggestions(result.suggestions || []);
      } catch (err) {
          console.error('Optimization failed', err);
      } finally {
          setOptimizing(false);
      }
  };

  const selectedRack = racks.find(r => r.id === selectedTabId);
  const boxRacks = racks.filter(r => r.type === 'BOX');

  return (
    <div className="pb-32 max-w-7xl mx-auto overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-serif text-stone-900 dark:text-white">Plan de Cave</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setIsArchitectMode(!isArchitectMode)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              isArchitectMode 
                ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900' 
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
            }`}
          >
            <PencilRuler size={18} />
            {isArchitectMode ? 'Fermer' : 'Architecte'}
          </button>
          {isArchitectMode && (
            <button
              onClick={() => setShowAddRackModal(true)}
              className="px-4 py-2 rounded-lg bg-wine-600 text-white flex items-center gap-2 hover:bg-wine-700 transition-colors"
            >
              <Plus size={18} />
              Ajouter
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher un vin..."
            className="w-full bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl pl-10 pr-4 py-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {racks.filter(r => r.type === 'SHELF').map(rack => (
          <button
            key={rack.id}
            onClick={() => setSelectedTabId(rack.id)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedTabId === rack.id
                ? 'bg-stone-900 dark:bg-white text-white dark:text-stone-900'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
            }`}
          >
            {rack.name}
            {searchQuery && getMatchesForRack(rack.id) > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-wine-500 text-white text-xs">
                {getMatchesForRack(rack.id)}
              </span>
            )}
          </button>
        ))}
        {boxRacks.length > 0 && (
          <button
            onClick={() => setSelectedTabId('VIEW_ALL_BOXES')}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedTabId === 'VIEW_ALL_BOXES'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
            }`}
          >
            <Box size={16} className="inline mr-2" />
            Caisses ({boxRacks.length})
          </button>
        )}
      </div>

      {/* Rack View */}
      {selectedRack && selectedRack.type === 'SHELF' && (
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif text-stone-900 dark:text-white">{selectedRack.name}</h2>
            {isArchitectMode && (
              <div className="flex gap-2">
                <button
                  onClick={() => reorderRack(selectedRack.id, 'left')}
                  className="p-2 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  ←
                </button>
                <button
                  onClick={() => reorderRack(selectedRack.id, 'right')}
                  className="p-2 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  →
                </button>
                <button
                  onClick={() => handleStartEdit(selectedRack)}
                  className="p-2 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
                >
                  <PencilRuler size={16} />
                </button>
                <button
                  onClick={() => handleDeleteRack(selectedRack.id)}
                  className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
          <RackGrid
            rack={selectedRack}
            inventory={inventory}
            onSlotClick={handleSlotClick}
            searchQuery={searchQuery}
            moveSource={moveSource}
          />
        </div>
      )}

      {/* Boxes View */}
      {selectedTabId === 'VIEW_ALL_BOXES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boxRacks.map(rack => (
            <div key={rack.id} className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl border-2 border-amber-200 dark:border-amber-900/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-lg text-amber-900 dark:text-amber-200">{rack.name}</h3>
                {isArchitectMode && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleStartEdit(rack)}
                      className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                    >
                      <PencilRuler size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteRack(rack.id)}
                      className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
              <RackGrid
                rack={rack}
                inventory={inventory}
                onSlotClick={handleSlotClick}
                searchQuery={searchQuery}
                moveSource={moveSource}
              />
            </div>
          ))}
        </div>
      )}

      {/* Unsorted Dock */}
      {showUnsortedDock && unsortedBottles.length > 0 && (
        <div className="fixed bottom-24 left-0 right-0 bg-stone-100/95 dark:bg-stone-900/95 backdrop-blur-xl border-t border-stone-200 dark:border-stone-800 p-4 z-40">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Inbox size={18} className="text-stone-500" />
                <h3 className="font-medium text-stone-900 dark:text-white">Non triés ({unsortedBottles.length})</h3>
              </div>
              <button onClick={() => setShowUnsortedDock(false)} className="text-stone-500 hover:text-stone-700 dark:hover:text-stone-300">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {unsortedBottles.map((b: any) => (
                <div
                  key={b.id}
                  className="flex-shrink-0 bg-white dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700 p-3 min-w-[120px]"
                >
                  <div className="text-xs font-medium text-stone-900 dark:text-white truncate">{b.wineName}</div>
                  <div className="text-[10px] text-stone-500">{b.wineVintage}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SELECTED BOTTLE MODAL */}
      {selectedBottle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80 backdrop-blur-sm" onClick={() => setSelectedBottle(null)} />
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl">
                  <h3 className="text-xl font-serif text-stone-900 dark:text-white mb-2">{selectedBottle.wine.name}</h3>
                  <p className="text-stone-500 text-sm mb-4">{selectedBottle.wine.vintage}</p>
                  
                  <div className="space-y-2">
                      <button onClick={() => navigate(`/wine/${selectedBottle.wine.id}`)} className="w-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-900 dark:text-white p-3 rounded-xl flex items-center gap-3 transition-colors">
                          <Eye size={18} />
                          <span>Voir la Fiche</span>
                      </button>
                      <button onClick={handleMoveStart} className="w-full bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-900 dark:text-blue-200 p-3 rounded-xl flex items-center gap-3 transition-colors">
                          <Move size={18} />
                          <span>Déplacer</span>
                      </button>
                      <button onClick={handleConsumeBottle} className="w-full bg-wine-100 dark:bg-wine-900/30 hover:bg-wine-200 dark:hover:bg-wine-900/50 text-wine-900 dark:text-wine-200 p-3 rounded-xl flex items-center gap-3 transition-colors">
                          <Droplet size={18} />
                          <span>Consommer</span>
                      </button>
                  </div>
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
                        onClick={() => navigate('/add-wine')}
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
                        <button onClick={() => setNewRackType('BOX')} className={`flex-1 py-2 text-sm rounded border transition-all ${newRackType === 'BOX' ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-500 text-amber-800 dark:text-amber-200' : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500'}`}>Caisse</button>
                        <button onClick={() => setNewRackType('SHELF')} className={`flex-1 py-2 text-sm rounded border transition-all ${newRackType === 'SHELF' ? 'bg-stone-800 border-stone-500 text-white' : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500'}`}>Étagère</button>
                    </div>
                </div>

                {newRackType === 'BOX' ? (
                    <>
                        <div>
                            <label className="text-xs text-stone-500 uppercase mb-2 block">Taille de la Caisse</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => {
                                        setNewRackW(3);
                                        setNewRackH(2);
                                        setCreateRackName("Caisse de 6");
                                    }} 
                                    className={`p-4 rounded-xl border-2 transition-all ${newRackW === 3 && newRackH === 2 ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-700'}`}
                                >
                                    <div className="text-2xl font-bold text-stone-900 dark:text-white">6</div>
                                    <div className="text-xs text-stone-500">Bouteilles</div>
                                    <div className="text-[10px] text-stone-400 mt-1">3×2</div>
                                </button>
                                <button 
                                    onClick={() => {
                                        setNewRackW(4);
                                        setNewRackH(3);
                                        setCreateRackName("Caisse de 12");
                                    }} 
                                    className={`p-4 rounded-xl border-2 transition-all ${newRackW === 4 && newRackH === 3 ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-700'}`}
                                >
                                    <div className="text-2xl font-bold text-stone-900 dark:text-white">12</div>
                                    <div className="text-xs text-stone-500">Bouteilles</div>
                                    <div className="text-[10px] text-stone-400 mt-1">4×3</div>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-stone-500 uppercase">Nom</label>
                            <input type="text" value={createRackName} onChange={e => setCreateRackName(e.target.value)} className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" placeholder="ex: Margaux 2015" />
                        </div>
                    </>
                ) : (
                    <>
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
                    </>
                )}
                
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