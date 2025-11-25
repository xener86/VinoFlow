import React, { useState, useEffect } from 'react';
import { getInventory } from '../services/storageService';
import { CellarWine } from '../types';
import { FileText, Plus, Calendar, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TastingNote {
    id: string;
    wineId: string;
    wineName: string;
    date: string;
    visual: string;
    nose: string;
    palate: string;
    finish: string;
    rating: number;
    notes: string;
}

export const TastingNotes: React.FC = () => {
    const navigate = useNavigate();
    const [tastingNotes, setTastingNotes] = useState<TastingNote[]>([]);
    const [winesToTaste, setWinesToTaste] = useState<CellarWine[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedWine, setSelectedWine] = useState<CellarWine | null>(null);

    // New tasting note form
    const [formData, setFormData] = useState({
        visual: '',
        nose: '',
        palate: '',
        finish: '',
        rating: 0,
        notes: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        // Load tasting notes from localStorage
        const stored = localStorage.getItem('vf_tasting_notes');
        setTastingNotes(stored ? JSON.parse(stored) : []);

        // Get wines that need tasting (wines without tasting notes)
        const inventory = getInventory();
        const notes = stored ? JSON.parse(stored) : [];
        const tastedWineIds = notes.map((n: TastingNote) => n.wineId);
        const needsTasting = inventory.filter(w => !tastedWineIds.includes(w.id) && w.inventoryCount > 0);
        setWinesToTaste(needsTasting);
    };

    const handleSaveTasting = () => {
        if (!selectedWine) return;

        const newNote: TastingNote = {
            id: crypto.randomUUID(),
            wineId: selectedWine.id,
            wineName: `${selectedWine.name} ${selectedWine.vintage}`,
            date: new Date().toISOString(),
            ...formData
        };

        const updated = [...tastingNotes, newNote];
        localStorage.setItem('vf_tasting_notes', JSON.stringify(updated));
        
        setShowAddModal(false);
        setSelectedWine(null);
        setFormData({ visual: '', nose: '', palate: '', finish: '', rating: 0, notes: '' });
        loadData();
    };

    return (
        <div className="pb-24 animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Fiches de Dégustation</h2>
                    <p className="text-stone-500 text-sm">Vos notes et impressions</p>
                </div>
                <button 
                    onClick={() => setShowAddModal(true)}
                    className="bg-wine-600 hover:bg-wine-700 text-white p-3 rounded-full shadow-lg"
                >
                    <Plus size={20} />
                </button>
            </div>

            {/* Wines to Taste Alert */}
            {winesToTaste.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                        <FileText className="text-amber-600 dark:text-amber-400" size={24} />
                        <div>
                            <p className="font-bold text-amber-900 dark:text-amber-200">
                                {winesToTaste.length} vin{winesToTaste.length > 1 ? 's' : ''} à déguster
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                Créez vos premières impressions
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tasting Notes List */}
            <div className="space-y-4">
                {tastingNotes.length === 0 ? (
                    <div className="text-center py-20 text-stone-500">
                        <FileText size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Aucune fiche de dégustation pour le moment.</p>
                        <p className="text-sm">Créez votre première note !</p>
                    </div>
                ) : (
                    tastingNotes.map(note => (
                        <div 
                            key={note.id} 
                            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-lg font-serif text-stone-900 dark:text-white">{note.wineName}</h3>
                                    <p className="text-xs text-stone-500 flex items-center gap-2">
                                        <Calendar size={12} />
                                        {new Date(note.date).toLocaleDateString('fr-FR')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Star 
                                            key={i} 
                                            size={16} 
                                            className={i < note.rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-700'} 
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Visuel</span>
                                    <p className="text-stone-700 dark:text-stone-300">{note.visual}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Nez</span>
                                    <p className="text-stone-700 dark:text-stone-300">{note.nose}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Bouche</span>
                                    <p className="text-stone-700 dark:text-stone-300">{note.palate}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-stone-500 uppercase">Finale</span>
                                    <p className="text-stone-700 dark:text-stone-300">{note.finish}</p>
                                </div>
                            </div>

                            {note.notes && (
                                <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800">
                                    <p className="text-sm italic text-stone-600 dark:text-stone-400">"{note.notes}"</p>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add Tasting Note Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-stone-900/50 dark:bg-black/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
                    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 w-full max-w-2xl rounded-2xl p-6 relative z-10 shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
                        <h3 className="text-2xl font-serif text-stone-900 dark:text-white mb-6">Nouvelle Fiche de Dégustation</h3>

                        {!selectedWine ? (
                            <div className="space-y-2">
                                <p className="text-sm text-stone-500 mb-4">Sélectionnez un vin à déguster :</p>
                                {winesToTaste.map(wine => (
                                    <button
                                        key={wine.id}
                                        onClick={() => setSelectedWine(wine)}
                                        className="w-full text-left p-4 rounded-lg bg-stone-50 dark:bg-stone-950 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 transition-colors"
                                    >
                                        <h4 className="font-serif text-stone-900 dark:text-white">{wine.name}</h4>
                                        <p className="text-xs text-stone-500">{wine.producer} • {wine.vintage}</p>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-stone-50 dark:bg-stone-950 p-4 rounded-lg border border-stone-200 dark:border-stone-800 mb-6">
                                    <h4 className="font-serif text-lg text-stone-900 dark:text-white">{selectedWine.name}</h4>
                                    <p className="text-sm text-stone-500">{selectedWine.producer} • {selectedWine.vintage}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-stone-500 uppercase block mb-2">Visuel</label>
                                        <input
                                            type="text"
                                            placeholder="Robe, intensité, limpidité..."
                                            value={formData.visual}
                                            onChange={e => setFormData({...formData, visual: e.target.value})}
                                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-stone-500 uppercase block mb-2">Nez</label>
                                        <input
                                            type="text"
                                            placeholder="Arômes dominants..."
                                            value={formData.nose}
                                            onChange={e => setFormData({...formData, nose: e.target.value})}
                                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-stone-500 uppercase block mb-2">Bouche</label>
                                        <input
                                            type="text"
                                            placeholder="Attaque, milieu, équilibre..."
                                            value={formData.palate}
                                            onChange={e => setFormData({...formData, palate: e.target.value})}
                                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-stone-500 uppercase block mb-2">Finale</label>
                                        <input
                                            type="text"
                                            placeholder="Longueur, persistance..."
                                            value={formData.finish}
                                            onChange={e => setFormData({...formData, finish: e.target.value})}
                                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-stone-500 uppercase block mb-2">Note Globale</label>
                                    <div className="flex gap-2">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => setFormData({...formData, rating: i + 1})}
                                                className="p-2"
                                            >
                                                <Star 
                                                    size={32} 
                                                    className={i < formData.rating ? 'fill-amber-500 text-amber-500' : 'text-stone-300 dark:text-stone-700'} 
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-stone-500 uppercase block mb-2">Notes Personnelles</label>
                                    <textarea
                                        placeholder="Vos impressions, contexte de dégustation..."
                                        value={formData.notes}
                                        onChange={e => setFormData({...formData, notes: e.target.value})}
                                        rows={3}
                                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white outline-none focus:ring-2 focus:ring-wine-500 resize-none"
                                    />
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => {
                                            setShowAddModal(false);
                                            setSelectedWine(null);
                                        }}
                                        className="flex-1 py-3 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        onClick={handleSaveTasting}
                                        className="flex-1 bg-wine-600 hover:bg-wine-700 text-white py-3 rounded-lg font-bold transition-colors"
                                    >
                                        Enregistrer
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};