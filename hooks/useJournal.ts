import { useState, useEffect, useCallback } from 'react';
import { getCellarJournal } from '../services/storageService';
import { JournalEntry } from '../types';

export type { JournalEntry };

export const useJournal = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJournal = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCellarJournal();

      const sorted = Array.isArray(data)
        ? data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
