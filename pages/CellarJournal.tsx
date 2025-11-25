import React, { useState, useEffect } from 'react';
import { getInventory, getRacks } from '../services/storageService';
import { BookOpen, TrendingUp, TrendingDown, Calendar, Filter, Download, Wine, Package, MapPin, Droplet, Gift } from 'lucide-react';

interface JournalEntry {
    id: string;
    date: string;
    type: 'IN' | 'OUT' | 'MOVE' | 'GIFT' | 'NOTE';
    wineId?: string;
    wineName: string;
    wineVintage?: number;
    quantity?: number;
    fromLocation?: string;
    toLocation?: string;
    recipient?: string;
    occasion?: string;
    note?: string;
    userId: string;
}

type FilterType = 'ALL' | 'IN' | 'OUT' | 'MOVE' | 'GIFT' | 'NOTE';

export const CellarJournal: React.FC = () => {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [filter, setFilter] = useState<FilterType>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<'7' | '30' | '90' | 'ALL'>('ALL');

    useEffect(() => {
        loadJournal();
    }, []);

    const loadJournal = () => {
        const stored = localStorage.getItem('vf_cellar_journal');
        const journal: JournalEntry[] = stored ? JSON.parse(stored) : [];
        setEntries(journal.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    };

    const filterEntries = () => {
        let filtered = entries;

        // Filter by type
        if (filter !== 'ALL') {
            filtered = filtered.filter(e => e.type === filter);
        }

        // Filter by search query
        if (searchQuery) {
            filtered = filtered.filter(e => 
                e.wineName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                e.recipient?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                e.note?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Filter by date range
        if (dateRange !== 'ALL') {
            const days = parseInt(dateRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            filtered = filtered.filter(e => new Date(e.date) >= cutoffDate);
        }

        return filtered;
    };

    const exportJournal = () => {
        const dataStr = JSON.stringify(entries, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `journal-cave-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getEntryIcon = (type: string) => {
        switch (type) {
            case 'IN': return <Package className="text-green-600 dark:text-green-500" size={20} />;
            case 'OUT': return <Droplet className="text-red-600 dark:text-red-500" size={20} />;
            case 'MOVE': return <MapPin className="text-blue-600 dark:text-blue-500" size={20} />;
            case 'GIFT': return <Gift className="text-purple-600 dark:text-purple-500" size={20} />;
            case 'NOTE': return <BookOpen className="text-amber-600 dark:text-amber-500" size={20} />;
            default: return <Wine className="text-stone-600 dark:text-stone-500" size={20} />;
        }
    };

    const getEntryColor = (type: string) => {
        switch (type) {
            case 'IN': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/50';
            case 'OUT': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50';
            case 'MOVE': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50';
            case 'GIFT': return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-900/50';
            case 'NOTE': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50';
            default: return 'bg-stone-50 dark:bg-stone-900/20 border-stone-200 dark:border-stone-800';
        }
    };

    const getEntryDescription = (entry: JournalEntry) => {
        switch (entry.type) {
            case 'IN':
                return `Ajout de ${entry.quantity} bouteille${entry.quantity! > 1 ? 's' : ''} ${entry.toLocation ? `en ${entry.toLocation}` : ''}`;
            case 'OUT':
                return `Consommation d'une bouteille${entry.fromLocation ? ` depuis ${entry.fromLocation}` : ''}`;
            case 'MOVE':
                return `Déplacement de ${entry.fromLocation} vers ${entry.toLocation}`;
            case 'GIFT':
                return `Offert à ${entry.recipient}${entry.occasion ? ` pour ${entry.occasion}` : ''}`;
            case 'NOTE':
                return entry.note || 'Note ajoutée';
            default:
                return 'Action inconnue';
        }
    };

    const stats = {
        total: entries.length,
        in: entries.filter(e => e.type === 'IN').reduce((sum, e) => sum + (e.quantity || 0), 0),
        out: entries.filter(e => e.type === 'OUT').length,
        gifts: entries.filter(e => e.type === 'GIFT').length,
    };

    const filteredEntries = filterEntries();

    return (
        <div className="pb-24 animate-fade-in space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-serif text-stone-900 dark:text-white">Journal de Cave</h2>
                    <p className="text-stone-500 text-sm">Historique complet de vos mouvements</p>
                </div>
                <button 
                    onClick={exportJournal}
                    className="bg-stone-900 dark:bg-white text-white dark:text-stone-900 p-3 rounded-full shadow-lg hover:scale-105 transition-transform"
                    title="Exporter le journal"
                >
                    <Download size={20} />
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                            <BookOpen size={20} className="text-stone-600 dark:text-stone-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-stone-900 dark:text-white">{stats.total}</p>
                            <p className="text-xs text-stone-500">Entrées</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                            <TrendingUp size={20} className="text-green-600 dark:text-green-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-stone-900 dark:text-white">{stats.in}</p>
                            <p className="text-xs text-stone-500">Ajouts</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                            <TrendingDown size={20} className="text-red-600 dark:text-red-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-stone-900 dark:text-white">{stats.out}</p>
                            <p className="text-xs text-stone-500">Sorties</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                            <Gift size={20} className="text-purple-600 dark:text-purple-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-stone-900 dark:text-white">{stats.gifts}</p>
                            <p className="text-xs text-stone-500">Offerts</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-stone-900 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-stone-500">
                    <Filter size={16} />
                    <span className="text-sm font-bold">Filtres</span>
                </div>

                {/* Type Filter */}
                <div className="flex flex-wrap gap-2">
                    {(['ALL', 'IN', 'OUT', 'MOVE', 'GIFT', 'NOTE'] as FilterType[]).map(type => (
                        <button
                            key={type}
                            onClick={() => setFilter(type)}
                            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                                filter === type
                                ? 'bg-wine-600 text-white shadow-md'
                                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                            }`}
                        >
                            {type === 'ALL' ? 'Tout' : 
                             type === 'IN' ? 'Entrées' :
                             type === 'OUT' ? 'Sorties' :
                             type === 'MOVE' ? 'Déplacements' :
                             type === 'GIFT' ? 'Cadeaux' : 'Notes'}
                        </button>
                    ))}
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-wrap gap-2">
                    {(['7', '30', '90', 'ALL'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                                dateRange === range
                                ? 'bg-stone-800 dark:bg-white text-white dark:text-stone-900 shadow-md'
                                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                            }`}
                        >
                            {range === 'ALL' ? 'Tout' : `${range}j`}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative">
                    <Wine className="absolute left-3 top-3 text-stone-400" size={18} />
                    <input
                        type="text"
                        placeholder="Rechercher un vin, destinataire..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg py-2.5 pl-10 pr-4 text-stone-900 dark:text-white focus:ring-2 focus:ring-wine-500 outline-none"
                    />
                </div>
            </div>

            {/* Journal Entries */}
            <div className="space-y-3">
                {filteredEntries.length === 0 ? (
                    <div className="text-center py-20 text-stone-500">
                        <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Aucune entrée trouvée.</p>
                        <p className="text-sm">Modifiez vos filtres ou ajoutez des activités.</p>
                    </div>
                ) : (
                    filteredEntries.map(entry => (
                        <div 
                            key={entry.id}
                            className={`p-4 rounded-xl border shadow-sm transition-all hover:shadow-md ${getEntryColor(entry.type)}`}
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-white dark:bg-stone-900 flex items-center justify-center shadow-sm">
                                    {getEntryIcon(entry.type)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-serif text-lg text-stone-900 dark:text-white">
                                            {entry.wineName} {entry.wineVintage && `(${entry.wineVintage})`}
                                        </h4>
                                        <span className="text-xs text-stone-500 flex items-center gap-1">
                                            <Calendar size={12} />
                                            {new Date(entry.date).toLocaleDateString('fr-FR', { 
                                                day: '2-digit', 
                                                month: 'short', 
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-stone-700 dark:text-stone-300">
                                        {getEntryDescription(entry)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};