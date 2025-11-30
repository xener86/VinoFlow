import { useState, useEffect, useCallback } from 'react';
import { getSpirits } from '../services/storageService';
import { Spirit } from '../types';

export const useSpirits = () => {
  const [spirits, setSpirits] = useState<Spirit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpirits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSpirits();
      setSpirits(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Erreur chargement spiritueux:", err);
      setError("Impossible de charger le bar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpirits();
  }, [fetchSpirits]);

  return { spirits, loading, error, refresh: fetchSpirits };
};