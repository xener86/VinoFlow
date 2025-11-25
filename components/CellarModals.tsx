import React, { useState } from 'react';
import { X, Droplet, Move, Eye, Gift, MapPin, Plus, PackagePlus, AlertCircle } from 'lucide-react';
import { CellarWine, Rack, BottleLocation } from '../types';
import { useNavigate } from 'react-router-dom';

// --- Modal de base ---
interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export const BaseModal: React.FC<BaseModalProps> = ({ isOpen, onClose, children, className = '' }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div 
        className="absolute inset-0 bg-stone-900/20 dark:bg-black/80 backdrop-blur-sm" 
        onClick={onClose} 
      />
      <div className={`bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-sm rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up ${className}`}>
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-white"
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
};

// --- Modal d'action bouteille ---
interface BottleActionModalProps {
  bottle: {
    wine: CellarWine;
    bottleId: string;
    location: BottleLocation;
  } | null;
  rackName: string;
  onClose: () => void;
  onConsume: () => void;
  onMove: () => void;
}

export const BottleActionModal: React.FC<BottleActionModalProps> = ({
  bottle,
  rackName,
  onClose,
  onConsume,
  onMove
}) => {
  const navigate = useNavigate();
  
  if (!bottle) return null;
  
  return (
    <BaseModal isOpen={!!bottle} onClose={onClose}>
      <div className="text-center mb-6">
        <h3 className="text-2xl font-serif text-stone-900 dark:text-white mb-1">
          {bottle.wine.name}
        </h3>
        <p className="text-stone-500 dark:text-stone-400">
          {bottle.wine.producer} • {bottle.wine.vintage}
        </p>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
          {rackName} • {String.fromCharCode(65 + bottle.location.y)}{bottle.location.x + 1}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={onConsume} 
          className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors"
        >
          <Droplet size={24} className="text-wine-600 dark:text-wine-500" /> 
          <span className="text-sm">Boire</span>
        </button>
        <button 
          onClick={onMove} 
          className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors"
        >
          <Move size={24} className="text-blue-600 dark:text-blue-500" /> 
          <span className="text-sm">Déplacer</span>
        </button>
        <button 
          onClick={() => navigate(`/wine/${bottle.wine.id}`)} 
          className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2 transition-colors"
        >
          <Eye size={24} className="text-emerald-600 dark:text-emerald-500" /> 
          <span className="text-sm">Fiche</span>
        </button>
        <button 
          className="bg-stone-100 dark:bg-stone-800 opacity-50 cursor-not-allowed text-stone-800 dark:text-stone-200 p-4 rounded-xl flex flex-col items-center gap-2"
        >
          <Gift size={24} className="text-purple-600 dark:text-purple-500" /> 
          <span className="text-sm">Offrir</span>
        </button>
      </div>
    </BaseModal>
  );
};

// --- Modal ajout rack ---
interface AddRackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (rack: { name: string; width: number; height: number; type: 'SHELF' | 'BOX' }) => void;
}

export const AddRackModal: React.FC<AddRackModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [width, setWidth] = useState(6);
  const [height, setHeight] = useState(6);
  const [type, setType] = useState<'SHELF' | 'BOX'>('SHELF');

  const handleCreate = () => {
    if (name) {
      onCreate({ name, width, height, type });
      setName('');
      setWidth(6);
      setHeight(6);
      setType('SHELF');
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-4">Architecture</h3>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-stone-500 uppercase">Type de Rangement</label>
          <div className="flex gap-2 mt-1 mb-4">
            <button 
              onClick={() => setType('SHELF')} 
              className={`flex-1 py-2 text-sm rounded border transition-all ${
                type === 'SHELF' 
                  ? 'bg-stone-800 border-stone-500 text-white' 
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500'
              }`}
            >
              Étagère
            </button>
            <button 
              onClick={() => setType('BOX')} 
              className={`flex-1 py-2 text-sm rounded border transition-all ${
                type === 'BOX' 
                  ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-500 text-amber-800 dark:text-amber-200' 
                  : 'bg-white dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500'
              }`}
            >
              Caisse
            </button>
          </div>
        </div>

        {type === 'BOX' && (
          <div className="flex gap-2 mb-2">
            <button 
              onClick={() => { setWidth(3); setHeight(2); setName("Caisse de 6"); }} 
              className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 py-2 text-xs text-stone-500 rounded hover:bg-stone-100 dark:hover:text-white"
            >
              6 Bouteilles
            </button>
            <button 
              onClick={() => { setWidth(4); setHeight(3); setName("Caisse de 12"); }} 
              className="flex-1 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 py-2 text-xs text-stone-500 rounded hover:bg-stone-100 dark:hover:text-white"
            >
              12 Bouteilles
            </button>
          </div>
        )}

        <div>
          <label className="text-xs text-stone-500 uppercase">Nom</label>
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" 
            placeholder="ex: Étagère Salon" 
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-stone-500 uppercase">Largeur (Col)</label>
            <input 
              type="number" 
              value={width} 
              onChange={e => setWidth(Number(e.target.value))} 
              className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" 
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-stone-500 uppercase">Hauteur (Lig)</label>
            <input 
              type="number" 
              value={height} 
              onChange={e => setHeight(Number(e.target.value))} 
              className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" 
            />
          </div>
        </div>
        
        <button 
          onClick={handleCreate} 
          className="w-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 font-bold py-3 rounded-lg mt-2 hover:bg-stone-800 dark:hover:bg-stone-200"
        >
          Créer
        </button>
      </div>
    </BaseModal>
  );
};

// --- Modal édition rack ---
interface EditRackModalProps {
  rack: Rack | null;
  onClose: () => void;
  onSave: (id: string, name: string) => void;
}

export const EditRackModal: React.FC<EditRackModalProps> = ({ rack, onClose, onSave }) => {
  const [name, setName] = useState(rack?.name || '');

  React.useEffect(() => {
    if (rack) setName(rack.name);
  }, [rack]);

  if (!rack) return null;

  return (
    <BaseModal isOpen={!!rack} onClose={onClose}>
      <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-4">Modifier le Rangement</h3>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-stone-500 uppercase">Nom</label>
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded p-2 text-stone-800 dark:text-white" 
          />
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Annuler
          </button>
          <button 
            onClick={() => onSave(rack.id, name)} 
            className="flex-1 bg-stone-900 dark:bg-white text-white dark:text-stone-900 font-bold py-3 rounded-lg hover:bg-stone-800 dark:hover:bg-stone-200"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

// --- Modal remplissage caisse ---
interface FillRackModalProps {
  rack: Rack | null;
  inventory: CellarWine[];
  onClose: () => void;
  onFill: (wine: CellarWine) => void;
}

export const FillRackModal: React.FC<FillRackModalProps> = ({ rack, inventory, onClose, onFill }) => {
  if (!rack) return null;

  return (
    <BaseModal isOpen={!!rack} onClose={onClose} className="border-amber-200 dark:border-amber-900/50">
      <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-4 flex items-center gap-2">
        <PackagePlus className="text-amber-500" /> Remplir {rack.name}
      </h3>
      <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
        {inventory.map(w => (
          <button 
            key={w.id} 
            onClick={() => onFill(w)} 
            className="w-full text-left p-3 rounded-lg bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 flex justify-between items-center border border-stone-200 dark:border-stone-800"
          >
            <div>
              <div className="text-stone-800 dark:text-white text-sm">{w.name}</div>
              <div className="text-stone-500 text-xs">{w.vintage}</div>
            </div>
            <Plus size={16} className="text-amber-500" />
          </button>
        ))}
      </div>
      <button onClick={onClose} className="w-full py-2 text-stone-500">Annuler</button>
    </BaseModal>
  );
};

// --- Modal emplacement vide ---
interface EmptySlotModalProps {
  slot: { rackId: string; x: number; y: number; rackName: string } | null;
  inventory: CellarWine[];
  onClose: () => void;
  onAddExisting: (wine: CellarWine) => void;
}

export const EmptySlotModal: React.FC<EmptySlotModalProps> = ({ slot, inventory, onClose, onAddExisting }) => {
  const navigate = useNavigate();
  
  if (!slot) return null;

  return (
    <BaseModal isOpen={!!slot} onClose={onClose}>
      <h3 className="text-xl font-serif text-stone-800 dark:text-white mb-2">Ajouter une bouteille</h3>
      <p className="text-stone-500 text-xs mb-4">
        {slot.rackName} • {String.fromCharCode(65 + slot.y)}{slot.x + 1}
      </p>
      
      <div className="grid gap-3">
        <button 
          onClick={() => navigate('/add')}
          className="bg-wine-600 hover:bg-wine-700 text-white p-3 rounded-xl flex items-center gap-3 transition-colors"
        >
          <div className="bg-wine-800 p-2 rounded-lg"><Plus size={18} /></div>
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
                onClick={() => onAddExisting(w)}
                className="w-full text-left p-2 rounded-lg bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 flex justify-between items-center border border-stone-200 dark:border-stone-800"
              >
                <div>
                  <div className="text-stone-800 dark:text-white text-xs">{w.name}</div>
                  <div className="text-stone-500 text-[10px]">{w.vintage}</div>
                </div>
                <Plus size={14} className="text-stone-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={onClose} className="w-full py-2 mt-4 text-stone-500">Annuler</button>
    </BaseModal>
  );
};
