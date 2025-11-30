import { useState, useEffect, useCallback } from 'react';
import { getCellarJournal } from '../services/storageService';

// Définition de l'interface complète pour le journal
export interface JournalEntry {
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

export const useJournal = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJournal = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCellarJournal();
      // On force le typage ici car l'API retourne bien la structure complète
      // même si la signature de getCellarJournal est simplifiée
      const fullData = data as unknown as JournalEntry[];
      
      const sorted = Array.isArray(fullData) 
        ? fullData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) 
        : [];
      setEntries(sorted);
      setError(null);
    } catch (err) {
      console.error("Erreur chargement journal:", err);
      setError("Impossible de charger l'historique.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJournal();
  }, [fetchJournal]);

  return { entries, loading, error, refresh: fetchJournal };
};