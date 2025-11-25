import React, { useState, useEffect } from 'react';
import { exportFullData, importFullData, getAIConfig, saveAIConfig } from '../services/storageService';
import { AIConfig, AIProvider } from '../types';
import { Download, Upload, Server, Cpu, Check } from 'lucide-react';

export const Settings: React.FC = () => {
  const [importStatus, setImportStatus] = useState<string>('');
  const [config, setConfig] = useState<AIConfig>({ 
    provider: 'GEMINI', 
    keys: { gemini: '', openai: '', mistral: '' } 
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(getAIConfig());
  }, []);

  const handleSaveConfig = () => {
    saveAIConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = () => {
    const json = exportFullData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vinoflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (importFullData(content)) {
        setImportStatus('Succès ! Rechargez la page.');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setImportStatus('Erreur : Fichier invalide.');
      }
    };
    reader.readAsText(file);
  };

  const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ 
    title, 
    icon: Icon, 
    children 
  }) => (
    <div className="bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mb-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4 text-stone-500 dark:text-stone-300 border-b border-stone-200 dark:border-stone-800 pb-2">
        <Icon size={18} />
        <h3 className="font-serif text-lg text-stone-900 dark:text-white">{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto pb-20 animate-fade-in">
      <h2 className="text-3xl font-serif text-stone-900 dark:text-white mb-6">Paramètres</h2>

      <Section title="Intelligence Artificielle" icon={Cpu}>
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2">
            {(['GEMINI', 'OPENAI', 'MISTRAL'] as AIProvider[]).map(p => (
              <button
                key={p}
                onClick={() => setConfig({ ...config, provider: p })}
                className={`py-3 rounded-lg text-sm font-bold border transition-all ${
                  config.provider === p 
                    ? 'bg-indigo-600 border-indigo-500 text-white' 
                    : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
                }`}
              >
                {p === 'GEMINI' ? 'Google Gemini' : p === 'OPENAI' ? 'OpenAI' : 'Mistral AI'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-stone-500 font-bold mb-1 block">
                Clé API Google Gemini
              </label>
              <input 
                type="password"
                value={config.keys.gemini}
                onChange={(e) => setConfig({ ...config, keys: { ...config.keys, gemini: e.target.value } })}
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:border-indigo-500 outline-none"
                placeholder="AIza..."
              />
            </div>
            <div>
              <label className="text-xs uppercase text-stone-500 font-bold mb-1 block">
                Clé API OpenAI (GPT-4o)
              </label>
              <input 
                type="password"
                value={config.keys.openai}
                onChange={(e) => setConfig({ ...config, keys: { ...config.keys, openai: e.target.value } })}
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:border-indigo-500 outline-none"
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="text-xs uppercase text-stone-500 font-bold mb-1 block">
                Clé API Mistral
              </label>
              <input 
                type="password"
                value={config.keys.mistral}
                onChange={(e) => setConfig({ ...config, keys: { ...config.keys, mistral: e.target.value } })}
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:border-indigo-500 outline-none"
                placeholder="key..."
              />
            </div>
          </div>

          <button 
            onClick={handleSaveConfig}
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-stone-900 dark:bg-white text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200"
          >
            {saved ? <Check size={18} /> : <Server size={18} />}
            {saved ? 'Configuration Enregistrée' : 'Sauvegarder les Clés'}
          </button>
        </div>
      </Section>

      <Section title="Gestion des Données" icon={Server}>
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <button 
              onClick={handleExport}
              className="flex-1 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-stone-200 dark:border-stone-700"
            >
              <Download size={18} /> Sauvegarde (JSON)
            </button>
            <label className="flex-1 bg-wine-50 dark:bg-wine-900/20 hover:bg-wine-100 dark:hover:bg-wine-900/40 text-wine-600 dark:text-wine-400 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-wine-100 dark:border-wine-900/50 cursor-pointer">
              <Upload size={18} /> Restaurer
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
          {importStatus && (
            <p className="text-center text-sm font-bold text-wine-600 dark:text-wine-400 mt-2">
              {importStatus}
            </p>
          )}
        </div>
      </Section>

      <div className="text-center text-xs text-stone-400 dark:text-stone-600 mt-8">
        <p>VinoFlow v2.0 - Auto-hébergé</p>
        <p className="mt-1">Vos données restent sur votre serveur.</p>
      </div>
    </div>
  );
};
