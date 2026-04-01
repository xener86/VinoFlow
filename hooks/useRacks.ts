import { useState, useEffect, useCallback } from 'react';
import { getRacks } from '../services/storageService';
import { Rack } from '../types';

export const useRacks = () => {
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRacks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRacks();
      setRacks(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Erreur chargement racks:", err);
      setError("Impossible de charger les rangements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRacks();
  }, [fetchRacks]);

  return { racks, loading, error, refresh: fetchRacks };
};