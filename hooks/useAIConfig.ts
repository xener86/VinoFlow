import { useState, useEffect, useCallback } from 'react';
import { getAIConfig, saveAIConfig } from '../services/storageService';
import { AIConfig } from '../types';

export const useAIConfig = () => {
  const [config, setConfig] = useState<AIConfig>({ 
    provider: 'GEMINI', 
    keys: { gemini: '', openai: '', mistral: '' } 
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAIConfig(); // Appel async
      setConfig(data);
      setError(null);
    } catch (err) {
      console.error("Error loading AI config:", err);
      setError("Erreur chargement configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfig = async (newConfig: AIConfig) => {
    try {
      await saveAIConfig(newConfig); // Appel async
      setConfig(newConfig);
      return true;
    } catch (err) {
      console.error("Error saving AI config:", err);
      return false;
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, error, saveConfig, refresh: fetchConfig };
};