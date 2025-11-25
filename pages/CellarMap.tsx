import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getInventory, getRacks, consumeBottle, moveBottle, saveRack, 
  deleteRack, fillRackWithWine, addBottleAtLocation, updateRack 
} from '../services/storageService';
import { optimizeCellarStorage } from '../services/geminiService';
import { CellarWine, Rack, BottleLocation, Bottle } from '../types';
import { RackGrid } from '../components/RackGrid';
import { 
  BottleActionModal, AddRackModal, EditRackModal, 
  FillRackModal, EmptySlotModal 
} from '../components/CellarModals';
import { 
  LayoutGrid, Search, PencilRuler, Plus, Wand2, Flame, Palette, 
  Box, Inbox, ChevronRight 
} from 'lucide-react';

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

export const CellarMap: React.FC = () => {
  const navigate = useNavigate();
  const [racks, setRacks] = useState<Rack[]>([]);
  const [inventory, setInventory] = useState<CellarWine[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  
  // Feature states
  const [searchQuery, setSearchQuery] = useState('');
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [selectedBottle, setSelectedBottle] = useState<SelectedBottleState | null>(null);
  const [moveSource, setMoveSource] = useState<SelectedBottleState | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  
  // Architect Mode
  const [isArchitectMode, setIsArchitectMode] = useState(false);
  const [showAddRackModal, setShowAddRackModal] = useState(false);
  const [editingRack, setEditingRack] = useState<Rack | null>(null);
  
  // Quick Fill / Empty Slot
  const [fillTargetRack, setFillTargetRack] = useState<Rack | null>(null);
  const [emptySlotTarget, setEmptySlotTarget] = useState<EmptySlotTarget | null>(null);
  const [showUnsortedDock, setShowUnsortedDock] = useState(true);

  // Optimization
  const [optimizing, setOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);

  const loadData = useCallback(() => {
    const loadedRacks = getRacks();
    setRacks(loadedRacks);
    setInventory(getInventory());
    
    if (loadedRacks.length > 0 && !selectedTabId) {
      const firstShelf = loadedRacks.find(r => r.type !== 'BOX');
      if (firstShelf) setSelectedTabId(firstShelf.id);
      else setSelectedTabId('VIEW_ALL_BOXES');
    }
  }, [selectedTabId]);

  useEffect(() => {
    loadData();
  }, []);

  // Recalculate when racks change
  useEffect(() => {
    if (racks.length > 0 && selectedTabId && selectedTabId !== 'VIEW_ALL_BOXES') {
      const rackExists = racks.find(r => r.id === selectedTabId);
      if (!rackExists) {
        const firstShelf = racks.find(r => r.type !== 'BOX');
        setSelectedTabId(firstShelf?.id || 'VIEW_ALL_BOXES');
      }
    }
  }, [racks, selectedTabId]);

  const getBottleDataAt = (rackId: string, x: number, y: number): { wine: CellarWine; bottle: Bottle } | null => {
    for (const wine of inventory) {
      const bottle = wine.bottles.find(b => {
        if (typeof b.location === 'string') return false;
        const loc = b.location as BottleLocation;
        return loc.rackId === rackId && loc.x === x && loc.y === y && !b.isConsumed;
      });
      if (bottle) return { wine, bottle };
    }
    return null;
  };

  const getMatchesForRack = (rackId: string): number => {
    if (!searchQuery) return 0;
    let count = 0;
    inventory.forEach(w => {
      const isMatch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      w.vintage.toString().includes(searchQuery);
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

  const unsortedBottles = inventory.flatMap(w => 
    w.bottles
      .filter(b => b.location === 'Non trié' && !b.isConsumed)
      .map(b => ({ 
        ...b, 
        wineName: w.name, 
        wineVintage: w.vintage, 
        wineType: w.type 
      }))
  );

  // --- Handlers ---

  const handleSlotClick = (rackId: string, x: number, y: number, rackName: string) => {
    const data = getBottleDataAt(rackId, x, y);

    if (moveSource) {
      if (data) {
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

    if (data) {
      setSelectedBottle({
        wine: data.wine,
        bottleId: data.bottle.id,
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
      const data = getBottleDataAt(rackId, x, y);
      if (data) return;

      const success = moveBottle(bottleId, { rackId, x, y });
      if (success) {
        setDragSourceId(null);
        loadData();
      }
    }
  };

  const handleConsume = () => {
    if (selectedBottle && window.confirm(`Boire ${selectedBottle.wine.name} ?`)) {
      consumeBottle(selectedBottle.wine.id);
      setSelectedBottle(null);
      loadData();
    }
  };

  const handleStartMove = () => {
    setMoveSource(selectedBottle);
    setSelectedBottle(null);
  };

  // --- Architect Logic ---
  
  const handleCreateRack = (rackData: { name: string; width: number; height: number; type: 'SHELF' | 'BOX' }) => {
    const newRack: Rack = {
      id: crypto.randomUUID(),
      name: rackData.name,
      width: rackData.width,
      height: rackData.height,
      type: rackData.type
    };
    saveRack(newRack);
    
    // Reload racks and update selection
    const updatedRacks = getRacks();
    setRacks(updatedRacks);
    setInventory(getInventory());
    setShowAddRackModal(false);
    
    if (newRack.type === 'BOX') {
      setSelectedTabId('VIEW_ALL_BOXES');
    } else {
      setSelectedTabId(newRack.id);
    }
  };

  const handleDeleteRack = (id: string) => {
    if (window.confirm("Supprimer ce rangement ? Les bouteilles seront marquées 'Non triées'.")) {
      // Delete the rack
      deleteRack(id);
      
      // Reload data
      const updatedRacks = getRacks();
      const updatedInventory = getInventory();
      
      setRacks(updatedRacks);
      setInventory(updatedInventory);
      
      // Update selection if we deleted the current tab
      if (selectedTabId === id) {
        const firstShelf = updatedRacks.find(r => r.type !== 'BOX');
        if (firstShelf) {
          setSelectedTabId(firstShelf.id);
        } else if (updatedRacks.length > 0) {
          setSelectedTabId('VIEW_ALL_BOXES');
        } else {
          setSelectedTabId(null);
        }
      }
    }
  };

  const handleEditRack = (rack: Rack) => {
    setEditingRack(rack);
  };

  const handleSaveRackEdit = (id: string, name: string) => {
    if (name) {
      updateRack(id, { name });
      setEditingRack(null);
      loadData();
    }
  };
  
  const handleQuickFill = (rack: Rack) => {
    setFillTargetRack(rack);
  };
  
  const confirmQuickFill = (wine: CellarWine) => {
    if (fillTargetRack && window.confirm(`Remplir ${fillTargetRack.name} avec ${wine.name} ?`)) {
      fillRackWithWine(fillTargetRack.id, wine.id, fillTargetRack.width, fillTargetRack.height);
      setFillTargetRack(null);
      loadData();
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

  const handleOptimize = async () => {
    setOptimizing(true);
    setSuggestions([]);
    
    const boxWines: { id: string; name: string }[] = [];
    const shelfWines: { id: string; name: string }[] = [];

    inventory.forEach(w => {
      w.bottles.forEach(b => {
        const rack = racks.find(r => typeof b.location !== 'string' && r.id === b.location.rackId);
        if (rack) {
          if (rack.type === 'BOX') boxWines.push({ id: b.id, name: w.name });
          else shelfWines.push({ id: b.id, name: w.name });
        }
      });
    });

    const results = await optimizeCellarStorage(boxWines, shelfWines);
    setSuggestions(results);
    setOptimizing(false);
  };

  // Grouped racks
  const shelves = racks.filter(r => r.type !== 'BOX');
  const boxes = racks.filter(r => r.type === 'BOX');
  const boxesMatchCount = boxes.reduce((acc, box) => acc + getMatchesForRack(box.id), 0);

  const getRackNameById = (rackId: string) => {
    return racks.find(r => r.id === rackId)?.name || 'Inconnu';
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24 relative min-h-screen">
      
      {/* HEADER & TOOLBAR */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-serif text-stone-800 dark:text-white">Plan de Cave</h2>
          
          <div className="flex gap-2">
            <button 
              onClick={() => setIsArchitectMode(!isArchitectMode)}
              className={`p-2 rounded-full border transition-all ${
                isArchitectMode 
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900 dark:border-indigo-500 dark:text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
                  : 'bg-white text-stone-500 border-stone-200 dark:bg-stone-900 dark:border-stone-700 dark:text-stone-400'
              }`}
              title="Mode Architecte"
            >
              <PencilRuler size={20} />
            </button>
            <button 
              onClick={handleOptimize}
              disabled={optimizing}
              className={`p-2 rounded-full border transition-all ${
                suggestions.length > 0 
                  ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:border-purple-500 dark:text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.5)]' 
                  : 'bg-white text-stone-500 border-stone-200 dark:bg-stone-900 dark:border-stone-700 dark:text-stone-400'
              }`}
              title="Optimisation IA"
            >
              <Wand2 size={20} className={optimizing ? "animate-spin" : ""} />
            </button>
            <button 
              onClick={() => setHeatmapMode(!heatmapMode)}
              className={`p-2 rounded-full border transition-all ${
                heatmapMode 
                  ? 'bg-orange-100 text-orange-600 border-orange-300 dark:bg-orange-900/50 dark:border-orange-500 dark:text-orange-400' 
                  : 'bg-white text-stone-500 border-stone-200 dark:bg-stone-900 dark:border-stone-700 dark:text-stone-400'
              }`}
              title="Vue Heatmap"
            >
              {heatmapMode ? <Flame size={20} /> : <Palette size={20} />}
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

        {/* Heatmap Legend */}
        {heatmapMode && (
          <div className="flex items-center justify-center gap-4 text-[10px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-2 rounded-lg">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div> Favoris
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-amber-100 rounded-full"></div> Jeune
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-amber-900 rounded-full"></div> Vieux
            </div>
          </div>
        )}

        {/* RACK NAVIGATOR (Tabs) */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
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
                style={{ marginBottom: -1 }} 
              >
                {rack.name}
                {matchCount > 0 && (
                  <span className="bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                    {matchCount}
                  </span>
                )}
              </button>
            );
          })}

          {boxes.length > 0 && (
            <button
              onClick={() => setSelectedTabId('VIEW_ALL_BOXES')}
              className={`relative px-4 py-2 text-xs font-medium rounded-t-lg border-t border-x whitespace-nowrap flex items-center gap-2 transition-all ${
                selectedTabId === 'VIEW_ALL_BOXES'
                  ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-100 dark:border-amber-800 text-amber-800 dark:text-amber-100 z-10 shadow-sm' 
                  : 'bg-stone-100 dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-900/80'
              }`}
              style={{ marginBottom: -1 }}
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
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl p-4 w-64 max-h-[40vh] overflow-y-auto flex flex-col gap-2 relative">
            <button 
              onClick={() => setShowUnsortedDock(false)}
              className="absolute -left-8 top-0 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 p-2 rounded-l-lg text-stone-400 hover:text-stone-800 dark:hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
            <div className="flex items-center gap-2 text-stone-700 dark:text-stone-300 mb-2 border-b border-stone-200 dark:border-stone-800 pb-2">
              <Inbox size={16} className="text-wine-600 dark:text-wine-400" />
              <span className="text-sm font-bold">Quai de Réception</span>
              <span className="text-xs bg-stone-100 dark:bg-stone-800 px-2 rounded-full ml-auto">
                {unsortedBottles.length}
              </span>
            </div>
            <p className="text-[10px] text-stone-500 italic">
              Glissez ces bouteilles vers les étagères pour les ranger.
            </p>
            {unsortedBottles.map((b) => (
              <div 
                key={b.id}
                draggable
                onDragStart={(e) => handleDragStart(e, b.id)}
                className="bg-stone-50 dark:bg-stone-950 p-2 rounded border border-stone-200 dark:border-stone-800 cursor-grab hover:border-stone-400 dark:hover:border-stone-600 active:cursor-grabbing"
              >
                <div className="text-xs text-stone-800 dark:text-white truncate">{b.wineName}</div>
                <div className="text-[10px] text-stone-500">
                  {b.wineVintage} • {wineTypeLabels[b.wineType] || b.wineType}
                </div>
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
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full">
            {unsortedBottles.length}
          </span>
        </button>
      )}

      {/* VIEW CONTENT */}
      {selectedTabId === 'VIEW_ALL_BOXES' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boxes.map(box => (
            <RackGrid 
              key={box.id} 
              rack={box} 
              inventory={inventory}
              isArchitectMode={isArchitectMode}
              heatmapMode={heatmapMode}
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
            />
          ))}
        </div>
      ) : (
        <div>
          {(() => {
            const rack = racks.find(r => r.id === selectedTabId);
            if (rack) {
              return (
                <RackGrid 
                  rack={rack} 
                  inventory={inventory}
                  isArchitectMode={isArchitectMode}
                  heatmapMode={heatmapMode}
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
                />
              );
            }
            if (racks.length === 0) {
              return (
                <div className="text-center py-20 text-stone-500">
                  <LayoutGrid size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Créez un rangement pour commencer.</p>
                  <button 
                    onClick={() => setShowAddRackModal(true)} 
                    className="mt-4 text-wine-600 dark:text-wine-400 underline"
                  >
                    Créer maintenant
                  </button>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* MODALS */}
      <BottleActionModal
        bottle={selectedBottle}
        rackName={selectedBottle ? getRackNameById(selectedBottle.location.rackId) : ''}
        onClose={() => setSelectedBottle(null)}
        onConsume={handleConsume}
        onMove={handleStartMove}
      />

      <AddRackModal
        isOpen={showAddRackModal}
        onClose={() => setShowAddRackModal(false)}
        onCreate={handleCreateRack}
      />

      <EditRackModal
        rack={editingRack}
        onClose={() => setEditingRack(null)}
        onSave={handleSaveRackEdit}
      />

      <FillRackModal
        rack={fillTargetRack}
        inventory={inventory}
        onClose={() => setFillTargetRack(null)}
        onFill={confirmQuickFill}
      />

      <EmptySlotModal
        slot={emptySlotTarget}
        inventory={inventory}
        onClose={() => setEmptySlotTarget(null)}
        onAddExisting={handleAddExistingToSlot}
      />
    </div>
  );
};
