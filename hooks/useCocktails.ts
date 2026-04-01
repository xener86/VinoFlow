import { useState, useEffect, useCallback } from 'react';
import { getCocktails } from '../services/storageService';
import { CocktailRecipe } from '../types';

export const useCocktails = () => {
  const [cocktails, setCocktails] = useState<CocktailRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCocktails = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCocktails();
      setCocktails(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Erreur chargement cocktails:", err);
      setError("Impossible de charger les recettes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCocktails();
  }, [fetchCocktails]);

  return { cocktails, loading, error, refresh: fetchCocktails };
};