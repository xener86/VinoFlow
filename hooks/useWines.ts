import { useState, useEffect, useCallback } from 'react';
import { getInventory } from '../services/storageService';
import { CellarWine } from '../types';

export const useWines = () => {
  const [wines, setWines] = useState<CellarWine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWines = useCallback(async () => {
    setLoading(true);
    try {
      // On attend la résolution de la Promise ici
      const data = await getInventory();
      // On s'assure que c'est bien un tableau pour éviter le crash .filter
      setWines(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Erreur chargement vins:", err);
      setError("Impossible de charger la cave.");
      setWines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement initial
  useEffect(() => {
    fetchWines();
  }, [fetchWines]);

  return { wines, loading, error, refresh: fetchWines };
};