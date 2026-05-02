import React, { useState, useEffect } from 'react';
import { exportFullData, importFullData, findOrphanedBottles, cleanupGhostBottles, getInventory, getRacks } from '../services/storageService';
import { useAIConfig } from '../hooks/useAIConfig'; // ✅ Hook Async
import { AIConfig, AIProvider, Bottle } from '../types';
import { exportWinesToCsv } from '../utils/exportCsv';
import { Download, Upload, Server, Cpu, Check, Loader2, Trash2, Search, AlertTriangle, FileSpreadsheet, Sparkles, Wand2 } from 'lucide-react';
import { getAvailableAIProviders, enrichAromaProfilesBatch, auditWines } from '../services/storageService';

export const Settings: React.FC = () => {
  // ✅ Utilisation du Hook
  const { config, loading, saveConfig } = useAIConfig();
  const [localConfig, setLocalConfig] = useState<AIConfig | null>(null);
  
  const [importStatus, setImportStatus] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [saved, setSaved] = useState(false);

  // Cleanup state
  const [isScanning, setIsScanning] = useState(false);
  const [orphanedBottles, setOrphanedBottles] = useState<Bottle[] | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ orphaned: number; cleaned: number } | null>(null);

  // Backend AI providers status
  const [backendProviders, setBackendProviders] = useState<{ providers: any; defaults: any } | null>(null);
  useEffect(() => {
      getAvailableAIProviders().then(setBackendProviders).catch(() => {});
  }, []);

  // Phase 3 - Batch enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ enriched: number; failed: number; processed: number } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{ count: number; wines: any[] } | null>(null);

  const handleEnrich = async (useConsensus: boolean) => {
      setEnriching(true);
      setEnrichResult(null);
      try {
          const r = await enrichAromaProfilesBatch({ onlyMissing: true, useConsensus, limit: 50 });
          setEnrichResult(r);
      } catch (e: any) {
          alert('Échec : ' + (e.message || 'erreur'));
      } finally {
          setEnriching(false);
      }
  };

  const handleAudit = async () => {
      setAuditing(true);
      try {
          const r = await auditWines();
          setAuditResult(r);
      } finally {
          setAuditing(false);
      }
  };

  // Synchronisation de l'état local une fois la config chargée
  useEffect(() => {
      if (config) {
          setLocalConfig(config);
      }
  }, [config]);

  const handleScanGhosts = async () => {
      setIsScanning(true);
      setCleanupResult(null);
      try {
          const orphaned = await findOrphanedBottles();
          setOrphanedBottles(orphaned);
      } catch (e) {
          console.error('Scan failed', e);
      } finally {
          setIsScanning(false);
      }
  };

  const handleCleanup = async () => {
      if (!window.confirm(`Supprimer ${orphanedBottles?.length || 0} bouteille(s) orpheline(s) ? Cette action est irréversible.`)) return;
      setIsCleaning(true);
      try {
          const result = await cleanupGhostBottles();
          setCleanupResult(result);
          setOrphanedBottles(null);
      } catch (e) {
          console.error('Cleanup failed', e);
      } finally {
          setIsCleaning(false);
      }
  };

  const handleSaveConfig = async () => {
      if (!localConfig) return;
      const success = await saveConfig(localConfig); // ✅ Sauvegarde Async
      if (success) {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
      }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
        const json = await exportFullData(); // ✅ Export Async
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vinoflow-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (error) {
        console.error("Export failed", error);
        alert("Une erreur est survenue lors de l'exportation.");
    } finally {
        setIsExporting(false);
    }
  };

  const handleCsvExport = async () => {
    setIsExportingCsv(true);
    try {
        const [wines, racks] = await Promise.all([getInventory(), getRacks()]);
        const withStock = wines.filter(w => w.inventoryCount > 0);
        exportWinesToCsv(withStock, racks);
    } catch (error) {
        console.error("CSV Export failed", error);
    } finally {
        setIsExportingCsv(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const content = event.target?.result as string;
        setImportStatus('Importation en cours...');
        try {
            const success = await importFullData(content); // ✅ Import Async
            if(success) {
                setImportStatus('Succès ! Rechargez la page.');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                setImportStatus('Erreur : Fichier invalide.');
            }
        } catch (error) {
            setImportStatus("Erreur lors de l'importation.");
        }
    };
    reader.readAsText(file);
  };

  const Section = ({ title, icon: Icon, children }: any) => (
      <div className="bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-stone-500 dark:text-stone-300 border-b border-stone-200 dark:border-stone-800 pb-2">
              <Icon size={18} />
              <h3 className="font-serif text-lg text-stone-900 dark:text-white">{title}</h3>
          </div>
          {children}
      </div>
  );

  if (loading || !localConfig) {
      return (
          <div className="flex justify-center items-center h-[50vh]">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
      );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 animate-fade-in">
        <h2 className="text-3xl font-serif text-stone-900 dark:text-white mb-6">Paramètres</h2>

        <Section title="Intelligence Artificielle" icon={Cpu}>
             <div className="space-y-6">
                 {backendProviders && (
                     <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-900/50 rounded-lg p-3 text-xs text-indigo-900 dark:text-indigo-200">
                         <div className="flex items-center gap-2 font-bold mb-2">
                             <Sparkles size={12} /> Sommelier v2 — Providers backend
                         </div>
                         <div className="space-y-1">
                             <div className="flex items-center gap-2">
                                 <span className={backendProviders.providers.gemini ? 'text-green-600' : 'text-stone-400'}>●</span>
                                 Gemini : {backendProviders.providers.gemini ? 'configuré' : 'GEMINI_API_KEY manquante'}
                             </div>
                             <div className="flex items-center gap-2">
                                 <span className={backendProviders.providers.claude ? 'text-green-600' : 'text-stone-400'}>●</span>
                                 Claude : {backendProviders.providers.claude ? 'configuré' : 'ANTHROPIC_API_KEY manquante'}
                             </div>
                         </div>
                         <p className="mt-2 text-[10px] opacity-70">
                             Configurez ces clés dans le fichier <code>.env</code> du backend pour activer le sommelier v2 (decomposition + 3 propositions).
                         </p>
                     </div>
                 )}

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                     {(['GEMINI', 'OPENAI', 'MISTRAL', 'CLAUDE'] as AIProvider[]).map(p => (
                         <button
                            key={p}
                            onClick={() => setLocalConfig({...localConfig, provider: p})}
                            className={`py-3 rounded-lg text-sm font-bold border transition-all ${
                                localConfig.provider === p
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
                            }`}
                         >
                             {p === 'GEMINI' ? 'Google Gemini' : p === 'OPENAI' ? 'OpenAI' : p === 'MISTRAL' ? 'Mistral AI' : 'Claude'}
                         </button>
                     ))}
                 </div>

                 <div className="space-y-4">
                     <div>
                         <label className="text-xs uppercase text-stone-500 font-bold mb-1 block">Clé API Google Gemini</label>
                         <input 
                            type="password"
                            value={localConfig.keys.gemini}
                            onChange={(e) => setLocalConfig({...localConfig, keys: {...localConfig.keys, gemini: e.target.value}})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:border-indigo-500 outline-none"
                            placeholder="sk-..."
                         />
                     </div>
                     <div>
                         <label className="text-xs uppercase text-stone-500 font-bold mb-1 block">Clé API OpenAI (GPT-4o)</label>
                         <input 
                            type="password"
                            value={localConfig.keys.openai}
                            onChange={(e) => setLocalConfig({...localConfig, keys: {...localConfig.keys, openai: e.target.value}})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:border-indigo-500 outline-none"
                            placeholder="sk-..."
                         />
                     </div>
                     <div>
                         <label className="text-xs uppercase text-stone-500 font-bold mb-1 block">Clé API Mistral (La Plateforme)</label>
                         <input
                            type="password"
                            value={localConfig.keys.mistral}
                            onChange={(e) => setLocalConfig({...localConfig, keys: {...localConfig.keys, mistral: e.target.value}})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:border-indigo-500 outline-none"
                            placeholder="key..."
                         />
                     </div>
                     <div>
                         <label className="text-xs uppercase text-stone-500 font-bold mb-1 block">Clé API Claude (Anthropic)</label>
                         <input
                            type="password"
                            value={localConfig.keys.claude || ''}
                            onChange={(e) => setLocalConfig({...localConfig, keys: {...localConfig.keys, claude: e.target.value}})}
                            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-stone-900 dark:text-white focus:border-indigo-500 outline-none"
                            placeholder="sk-ant-..."
                         />
                     </div>
                 </div>

                 <button 
                    onClick={handleSaveConfig}
                    className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-stone-900 dark:bg-white text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200"
                 >
                     {saved ? <Check size={18}/> : <Server size={18}/>}
                     {saved ? 'Configuration Enregistrée' : 'Sauvegarder les Clés'}
                 </button>
             </div>
        </Section>

        <Section title="Sommelier — Enrichissement de la cave" icon={Wand2}>
            <div className="space-y-4">
                <p className="text-sm text-stone-500 dark:text-stone-400">
                    Génère le profil aromatique IA des vins qui n'en ont pas encore (ou avec un profil pauvre). Recommandé après l'import d'une cave existante.
                </p>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => handleEnrich(false)}
                        disabled={enriching}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        {enriching ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                        Enrichir (rapide)
                    </button>
                    <button
                        onClick={() => handleEnrich(true)}
                        disabled={enriching}
                        className="bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-900 dark:text-white py-3 px-5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                        title="Croise Gemini + Claude pour augmenter la confiance (plus lent, plus coûteux)"
                    >
                        Enrichir avec consensus 2 IA
                    </button>
                </div>
                {enrichResult && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 rounded-lg text-sm text-green-700 dark:text-green-300">
                        ✓ {enrichResult.enriched} vins enrichis sur {enrichResult.processed} traités. {enrichResult.failed > 0 && ` ${enrichResult.failed} échecs.`}
                    </div>
                )}

                <div className="border-t border-stone-200 dark:border-stone-800 pt-4">
                    <p className="text-sm text-stone-500 dark:text-stone-400 mb-2">
                        Audit des profils faibles ou suspects.
                    </p>
                    <button
                        onClick={handleAudit}
                        disabled={auditing}
                        className="bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-900 dark:text-white py-2 px-4 rounded-lg flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                        {auditing ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
                        Auditer
                    </button>
                    {auditResult && (
                        <div className="mt-3 text-sm">
                            <div className="font-bold mb-2">{auditResult.count} vins suspects</div>
                            {auditResult.wines.slice(0, 10).map(w => (
                                <div key={w.id} className="flex items-center justify-between py-1 border-b border-stone-100 dark:border-stone-800 text-xs">
                                    <span>{w.name} {w.vintage}</span>
                                    <span className="text-stone-500">
                                        {w.aromaProfile ? `${w.aromaProfile.length} arômes` : 'pas de profil'} · {w.aromaConfidence || '?'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Section>

        <Section title="Nettoyage de la Cave" icon={Trash2}>
            <div className="space-y-4">
                <p className="text-sm text-stone-500 dark:text-stone-400">
                    Détectez et supprimez les bouteilles orphelines (vin parent supprimé) ou les données de test restantes.
                </p>

                <button
                    onClick={handleScanGhosts}
                    disabled={isScanning}
                    className="w-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-stone-200 dark:border-stone-700 disabled:opacity-50"
                >
                    {isScanning ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                    {isScanning ? 'Analyse en cours...' : 'Scanner les anomalies'}
                </button>

                {orphanedBottles !== null && orphanedBottles.length === 0 && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
                        <Check size={18} /> Aucune anomalie détectée. Votre cave est propre !
                    </div>
                )}

                {orphanedBottles !== null && orphanedBottles.length > 0 && (
                    <div className="space-y-3">
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg text-yellow-700 dark:text-yellow-300 text-sm flex items-center gap-2">
                            <AlertTriangle size={18} />
                            <span><strong>{orphanedBottles.length}</strong> bouteille(s) orpheline(s) détectée(s)</span>
                        </div>
                        <button
                            onClick={handleCleanup}
                            disabled={isCleaning}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-bold"
                        >
                            {isCleaning ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                            {isCleaning ? 'Nettoyage...' : `Supprimer ${orphanedBottles.length} bouteille(s)`}
                        </button>
                    </div>
                )}

                {cleanupResult && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg text-green-700 dark:text-green-300 text-sm flex items-center gap-2">
                        <Check size={18} /> {cleanupResult.cleaned}/{cleanupResult.orphaned} bouteille(s) nettoyée(s) avec succès.
                    </div>
                )}
            </div>
        </Section>

        <Section title="Gestion des Données" icon={Server}>
            <div className="flex flex-col gap-4">
                <div className="flex gap-3 flex-wrap">
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex-1 min-w-[140px] bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-stone-200 dark:border-stone-700 disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 className="animate-spin" size={18}/> : <Download size={18} />}
                        {isExporting ? 'Export...' : 'Sauvegarde (JSON)'}
                    </button>
                    <button
                        onClick={handleCsvExport}
                        disabled={isExportingCsv}
                        className="flex-1 min-w-[140px] bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-green-200 dark:border-green-900/50 disabled:opacity-50"
                    >
                        {isExportingCsv ? <Loader2 className="animate-spin" size={18}/> : <FileSpreadsheet size={18} />}
                        {isExportingCsv ? 'Export...' : 'Export (CSV)'}
                    </button>
                    <label className="flex-1 min-w-[140px] bg-wine-50 dark:bg-wine-900/20 hover:bg-wine-100 dark:hover:bg-wine-900/40 text-wine-600 dark:text-wine-400 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-wine-100 dark:border-wine-900/50 cursor-pointer">
                        <Upload size={18} /> Restaurer
                        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </label>
                </div>
                {importStatus && <p className="text-center text-sm font-bold text-wine-600 dark:text-wine-400 mt-2">{importStatus}</p>}
            </div>
        </Section>
    </div>
  );
};