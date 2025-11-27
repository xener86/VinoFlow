import React from 'react';
import { CellarWine, Rack, Bottle, BottleLocation } from '../types';

interface SelectedBottleState {
    wine: CellarWine;
    bottleId: string;
    location: BottleLocation;
}

interface RackGridProps {
    rack: Rack;
    inventory: CellarWine[];
    searchQuery?: string;
    moveSource?: SelectedBottleState | null;
    isArchitectMode?: boolean;
    suggestions?: any[];
    selectedBottle?: SelectedBottleState | null;
    dragSourceId?: string | null;
    onSlotClick: (rackId: string, x: number, y: number, rackName: string) => void;
    onDragStart?: (e: React.DragEvent, bottleId: string) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent, rackId: string, x: number, y: number) => void;
    onFill?: (rack: Rack) => void;
    onEdit?: (rack: Rack) => void;
    onDelete?: (id: string) => void;
    onReorder?: (id: string, direction: 'left' | 'right') => void;
}

export const RackGrid: React.FC<RackGridProps> = ({
    rack,
    inventory,
    searchQuery = '',
    moveSource = null,
    dragSourceId = null,
    onSlotClick,
    onDragStart,
    onDragOver,
    onDrop
}) => {
    
    // Vérification de sécurité
    if (!inventory || !rack) {
        return <div className="p-4">Chargement...</div>;
    }

    // Helper to find bottle at specific coordinates
    const getBottleDataAt = (x: number, y: number): { wine: CellarWine, bottle: Bottle } | null => {
        for (const wine of inventory) {
          const bottle = wine.bottles?.find(b => {
            if (typeof b.location === 'string') return false;
            const loc = b.location as BottleLocation;
            return loc.rackId === rack.id && loc.x === x && loc.y === y && !b.isConsumed;
          });
          if (bottle) return { wine, bottle };
        }
        return null;
    };

    // Styling based on type
    const containerClass = rack.type === 'BOX' 
        ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50' 
        : 'bg-white dark:bg-stone-900/50 border-stone-200 dark:border-stone-800';

    return (
      <div className={`p-4 rounded-2xl border shadow-sm overflow-x-auto min-h-[200px] relative transition-colors ${containerClass}`}>
         
         {/* Grid */}
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
                       const cellData = getBottleDataAt(x, y);
                       
                       let bgClass = rack.type === 'BOX' 
                        ? "bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/30" 
                        : "bg-stone-100 border-stone-200 dark:bg-stone-950/80 dark:border-stone-800";
                       
                       let content = <span className="text-[9px] text-stone-400 dark:text-stone-700 font-mono">{String.fromCharCode(65+y)}{x+1}</span>;

                       if (cellData) {
                           const { wine, bottle } = cellData;
                           const isMatch = searchQuery && (wine.name.toLowerCase().includes(searchQuery.toLowerCase()) || wine.vintage.toString().includes(searchQuery));
                           
                           // Standard Colors
                           if (wine.type === 'RED') bgClass = "bg-red-100 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-900 dark:text-red-400";
                           else if (wine.type === 'WHITE') bgClass = "bg-yellow-100 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-900 dark:text-yellow-400";
                           else if (wine.type === 'ROSE') bgClass = "bg-pink-100 border-pink-200 text-pink-800 dark:bg-pink-950 dark:border-pink-900 dark:text-pink-400";
                           
                           // Highlights
                           if (wine.isFavorite) bgClass += " ring-2 ring-purple-400 dark:ring-purple-500";
                           if (searchQuery && !isMatch) bgClass += " opacity-20 grayscale";
                           if (searchQuery && isMatch) bgClass += " ring-2 ring-green-500 scale-105 z-10 shadow-lg";
                           if (moveSource?.bottleId === bottle.id) bgClass += " ring-2 ring-blue-500 opacity-50";

                           content = <span className="text-[10px] font-bold">{wine.vintage === 0 ? 'NM' : wine.vintage}</span>;

                           const isDragging = dragSourceId === bottle.id;
                           const draggableClass = isDragging ? 'opacity-50' : 'cursor-grab active:cursor-grabbing';

                           return (
                              <div
                                   key={`${x}-${y}`}
                                   onClick={() => onSlotClick(rack.id, x, y, rack.name)}
                                   draggable
                                   onDragStart={(e) => onDragStart?.(e, bottle.id)}
                                   onDragOver={onDragOver}
                                   onDrop={(e) => onDrop?.(e, rack.id, x, y)}
                                   title={`${wine.name} (${wine.vintage})`}
                                   className={`aspect-square rounded-xl border flex items-center justify-center relative transition-all duration-200 hover:scale-105 ${bgClass} ${draggableClass}`}
                               >
                                   {content}
                                   {wine.isFavorite && <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full shadow-sm" />}
                               </div>
                           );
                       } else {
                           // Empty Slot Logic
                           if (moveSource) {
                               bgClass = "bg-blue-100 border-blue-300 dark:bg-blue-900/20 dark:border-blue-500/30 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800/50 hover:border-blue-400 animate-pulse";
                               content = <div className="w-2 h-2 bg-blue-500/50 rounded-full" />
                           } else {
                               bgClass += " cursor-pointer hover:border-stone-400 dark:hover:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800/30";
                           }
                           
                           return (
                               <div 
                                   key={`${x}-${y}`}
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