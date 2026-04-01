import { useState, useEffect, useCallback } from 'react';
import { getTastingNotes } from '../services/storageService';
import { TastingNote } from '../components/TastingNoteEditor';

export const useTastingNotes = () => {
  const [notes, setNotes] = useState<TastingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTastingNotes();
      // Tri par date décroissante
      const sorted = Array.isArray(data) 
        ? data.sort((a: TastingNote, b: TastingNote) => new Date(b.date).getTime() - new Date(a.date).getTime())
        : [];
      setNotes(sorted);
      setError(null);
    } catch (err) {
      console.error("Erreur chargement notes de dégustation:", err);
      setError("Impossible de charger les notes.");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  return { notes, loading, error, refresh: fetchNotes };
};