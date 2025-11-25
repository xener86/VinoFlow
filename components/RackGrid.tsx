import React from 'react';
import { CellarWine, Rack, Bottle, BottleLocation } from '../types';
import { PackagePlus, Trash2, Edit3 } from 'lucide-react';

interface SelectedBottleState {
  wine: CellarWine;
  bottleId: string;
  location: BottleLocation;
}

interface OptimizationSuggestion {
  bottleId: string;
  reason: string;
}

interface RackGridProps {
  rack: Rack;
  inventory: CellarWine[];
  isArchitectMode: boolean;
  heatmapMode: boolean;
  searchQuery: string;
  moveSource: SelectedBottleState | null;
  selectedBottle: SelectedBottleState | null;
  dragSourceId: string | null;
  suggestions: OptimizationSuggestion[];
  onSlotClick: (rackId: string, x: number, y: number, rackName: string) => void;
  onDragStart: (e: React.DragEvent, bottleId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, rackId: string, x: number, y: number) => void;
  onFill: (rack: Rack) => void;
  onEdit: (rack: Rack) => void;
  onDelete: (id: string) => void;
}

export const RackGrid: React.FC<RackGridProps> = ({ 
  rack, 
  inventory, 
  isArchitectMode, 
  heatmapMode, 
  searchQuery, 
  moveSource, 
  selectedBottle, 
  dragSourceId, 
  suggestions,
  onSlotClick, 
  onDragStart, 
  onDragOver, 
  onDrop, 
  onFill, 
  onEdit, 
  onDelete 
}) => {
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

  const isRackEmpty = !inventory.some(w => 
    w.bottles.some(b => 
      typeof b.location !== 'string' && 
      b.location.rackId === rack.id && 
      !b.isConsumed
    )
  );

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(rack.id);
  };

  return (
    <div className={`p-4 rounded-2xl border shadow-md overflow-x-auto min-h-[300px] relative transition-colors ${
      rack.type === 'BOX' 
        ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50' 
        : 'bg-white dark:bg-stone-900/50 border-stone-200 dark:border-stone-800'
    }`}>
      
      {/* Tool Header inside Rack */}
      <div className="mb-4 flex justify-between items-center border-b border-stone-200 dark:border-white/5 pb-2">
        <div className="text-xs text-stone-500 flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded font-bold ${
            rack.type === 'BOX' 
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' 
              : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200'
          }`}>
            {rack.type === 'BOX' ? 'CAISSE' : 'ÉTAGÈRE'}
          </span>
          <span className="font-serif text-stone-700 dark:text-stone-300">{rack.name}</span>
        </div>
        
        <div className="flex gap-2">
          {isRackEmpty && rack.type === 'BOX' && (
            <button 
              onClick={() => onFill(rack)} 
              className="bg-amber-100 dark:bg-amber-700/30 border border-amber-200 dark:border-amber-600/50 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:text-amber-200 text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
            >
              <PackagePlus size={14} /> Remplir
            </button>
          )}
          {isArchitectMode && (
            <>
              <button 
                onClick={() => onEdit(rack)} 
                className="bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-white text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Edit3 size={12} />
              </button>
              <button 
                onClick={handleDeleteClick}
                type="button"
                className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:text-red-300 text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 size={12} /> Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      {/* THE GRID */}
      <div 
        className="grid gap-2 mx-auto select-none"
        style={{
          gridTemplateColumns: `repeat(${rack.width}, minmax(40px, 48px))`,
          width: 'fit-content'
        }}
      >
        {Array.from({ length: rack.height }).map((_, y) => (
          <React.Fragment key={y}>
            {Array.from({ length: rack.width }).map((_, x) => {
              const cellData = getBottleDataAt(rack.id, x, y);
              const isOptimized = cellData && suggestions.find(s => s.bottleId === cellData.bottle.id);
              
              // Visual Style Determination
              let bgClass = rack.type === 'BOX' 
                ? "bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30" 
                : "bg-stone-100 border-stone-200 dark:bg-stone-950/80 dark:border-stone-800";
              let content: React.ReactNode = (
                <span className="text-[9px] text-stone-400 dark:text-stone-700 font-mono">
                  {String.fromCharCode(65 + y)}{x + 1}
                </span>
              );

              if (cellData) {
                const { wine, bottle } = cellData;
                const isMatch = searchQuery && (
                  wine.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  wine.vintage.toString().includes(searchQuery)
                );
                
                if (heatmapMode) {
                  if (wine.isFavorite) {
                    bgClass = `bg-purple-500 border-purple-700 text-white`;
                  } else {
                    const age = new Date().getFullYear() - wine.vintage;
                    const intensity = Math.min(900, Math.max(100, Math.floor(age / 2) * 100));
                    bgClass = `bg-amber-${intensity} border-amber-900 text-white`;
                  }
                } else {
                  if (wine.type === 'RED') {
                    bgClass = "bg-red-100 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-900 dark:text-red-400";
                  } else if (wine.type === 'WHITE') {
                    bgClass = "bg-yellow-100 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-900 dark:text-yellow-400";
                  } else {
                    bgClass = "bg-pink-100 border-pink-200 text-pink-800 dark:bg-pink-950 dark:border-pink-900 dark:text-pink-400";
                  }
                }

                if (searchQuery && !isMatch) bgClass += " opacity-20 grayscale";
                if (searchQuery && isMatch) bgClass += " ring-2 ring-green-500 scale-105 z-10 shadow-lg shadow-green-900/50";
                if (isOptimized) bgClass += " ring-2 ring-purple-500 animate-pulse";
                if (moveSource?.bottleId === bottle.id) bgClass += " ring-2 ring-blue-500 opacity-50";
                if (selectedBottle?.bottleId === bottle.id) bgClass += " ring-2 ring-blue-500 scale-105 z-10";

                content = (
                  <span className={`text-[10px] font-bold ${heatmapMode ? 'text-white' : 'text-stone-900 dark:text-white'}`}>
                    {wine.vintage === 0 ? 'NM' : wine.vintage}
                  </span>
                );

                return (
                  <div 
                    key={`${x}-${y}`}
                    draggable={!moveSource} 
                    onDragStart={(e) => onDragStart(e, bottle.id)}
                    onClick={() => onSlotClick(rack.id, x, y, rack.name)}
                    title={isOptimized ? isOptimized.reason : `${wine.name} (${wine.vintage})`}
                    className={`aspect-square rounded-xl border flex items-center justify-center relative transition-all duration-200 cursor-grab active:cursor-grabbing ${bgClass}`}
                  >
                    {content}
                  </div>
                );
              } else {
                // Empty Slot Logic
                if (moveSource) {
                  bgClass = "bg-blue-100 border-blue-300 dark:bg-blue-900/20 dark:border-blue-500/30 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800/50 hover:border-blue-400 animate-pulse";
                  content = <div className="w-2 h-2 bg-blue-500/50 rounded-full" />;
                } else if (dragSourceId) {
                  bgClass = "bg-stone-100 dark:bg-stone-800/50 border-stone-400 dark:border-stone-600 border-dashed";
                } else {
                  bgClass += " cursor-pointer hover:border-stone-300 dark:hover:border-white/20";
                }
                
                return (
                  <div 
                    key={`${x}-${y}`}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, rack.id, x, y)}
                    onClick={() => onSlotClick(rack.id, x, y, rack.name)}
                    className={`aspect-square rounded-xl border flex items-center justify-center relative transition-all duration-200 ${bgClass}`}
                  >
                    {content}
                  </div>
                );
              }
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
