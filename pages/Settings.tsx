import React, { useState, useEffect, useRef } from 'react';
import { exportFullData, importFullData, findOrphanedBottles, cleanupGhostBottles, getInventory, previewCsvImport, applyCsvImport } from '../services/storageService';
import { useAIConfig } from '../hooks/useAIConfig';
import { AIConfig, Bottle, CsvImportPlan } from '../types';
import { CsvImportPreview } from '../components/cockpit/CsvImportPreview';
import { exportWinesToCsv } from '../utils/exportCsv';
import { decodeCsvBytes } from '../utils/decodeCsv';
import { Download, Upload, Server, Check, Loader2, Trash2, Search, AlertTriangle, FileSpreadsheet, Sparkles, KeyRound } from 'lucide-react';
import { customAuth } from '../services/customAuth';
import { useAuth } from '../contexts/AuthContext';
import { getAvailableAIProviders, enrichAromaProfilesBatch, auditWines } from '../services/storageService';
import { useToast, useConfirm } from '../components/cockpit/feedback';
import { Badge, Button, Card, EmptyState, Input, MonoLabel, Skeleton, WineLink } from '../components/cockpit/primitives';

const PASSWORD_MIN_LENGTH = 10;

const errMsg = (e: unknown, fallback = 'erreur inconnue') => (e instanceof Error && e.message ? e.message : fallback);

// ────────────────────────────────────────────
// Section — carte avec en-tête mono (défini hors du composant de page pour ne
// pas remonter les formulaires à chaque rendu).
// ────────────────────────────────────────────
const Section: React.FC<{ label: string; title: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, title, hint, children }) => (
  <Card className="p-4 md:p-5">
    <MonoLabel>◌ {label}</MonoLabel>
    <h2 className="serif text-lg text-stone-900 leading-tight mt-1">{title}</h2>
    {hint && <p className="text-sm text-stone-500 mt-1 leading-relaxed">{hint}</p>}
    <div className="mt-4">{children}</div>
  </Card>
);

const Notice: React.FC<{ tone?: 'success' | 'warning' | 'info'; children: React.ReactNode }> = ({ tone = 'info', children }) => {
  const styles = {
    success: 'border-emerald-200 bg-emerald-50/60 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50/60 text-amber-900',
    info: 'border-stone-200 bg-stone-50 text-stone-700',
  }[tone];
  const Icon = tone === 'success' ? Check : tone === 'warning' ? AlertTriangle : null;
  return (
    <div className={`flex gap-2 rounded-md border px-3 py-2.5 text-sm leading-relaxed ${styles}`}>
      {Icon && <Icon className="w-4 h-4 shrink-0 mt-0.5" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
};

// ────────────────────────────────────────────
// Mot de passe
// ────────────────────────────────────────────
const ChangePasswordForm: React.FC = () => {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await customAuth.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      toast.success('Mot de passe modifié. Les autres appareils ont été déconnectés.');
    } catch (err) {
      toast.error(errMsg(err, 'Échec du changement de mot de passe.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input label="Mot de passe actuel" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Nouveau mot de passe" hint={`${PASSWORD_MIN_LENGTH} caractères minimum`} type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        <Input label="Confirmation" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required error={mismatch ? 'Ne correspond pas' : undefined} />
      </div>
      <Button type="submit" disabled={busy || mismatch}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        Changer mon mot de passe
      </Button>
    </form>
  );
};

const KEY_FIELDS: { key: keyof AIConfig['keys']; label: string; placeholder: string }[] = [
  { key: 'gemini', label: 'Clé API Google Gemini', placeholder: 'AIza…' },
  { key: 'claude', label: 'Clé API Claude (Anthropic)', placeholder: 'sk-ant-…' },
];

export const Settings: React.FC = () => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const { config, loading, saveConfig } = useAIConfig();
  const { user } = useAuth();
  const [localConfig, setLocalConfig] = useState<AIConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [csvImport, setCsvImport] = useState<{ name: string; content: string; plan: CsvImportPlan } | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Nettoyage
  const [isScanning, setIsScanning] = useState(false);
  const [orphanedBottles, setOrphanedBottles] = useState<Bottle[] | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  // Fournisseurs IA côté serveur
  const [backendProviders, setBackendProviders] = useState<{ providers: { gemini?: boolean; claude?: boolean }; defaults: any } | null>(null);
  useEffect(() => {
    getAvailableAIProviders().then(setBackendProviders).catch(() => {});
  }, []);

  // Enrichissement / audit
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ queued: number; engine: string } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{ count: number; wines: any[] } | null>(null);

  useEffect(() => {
    if (config) setLocalConfig(config);
  }, [config]);

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const r = await enrichAromaProfilesBatch({ onlyMissing: true, limit: 50 });
      setEnrichResult(r);
      toast.success(r.queued > 0 ? `${r.queued} vin(s) mis en file d’enrichissement` : 'Aucun vin à enrichir');
    } catch (e) {
      toast.error('Échec de l’enrichissement : ' + errMsg(e));
    } finally {
      setEnriching(false);
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    try {
      setAuditResult(await auditWines());
    } catch (e) {
      toast.error('Échec de l’audit : ' + errMsg(e));
    } finally {
      setAuditing(false);
    }
  };

  const handleScanGhosts = async () => {
    setIsScanning(true);
    try {
      setOrphanedBottles(await findOrphanedBottles());
    } catch (e) {
      toast.error('Échec de l’analyse : ' + errMsg(e));
    } finally {
      setIsScanning(false);
    }
  };

  const handleCleanup = async () => {
    const n = orphanedBottles?.length || 0;
    if (!(await confirmAction({ title: `Supprimer ${n} bouteille(s) orpheline(s) ?`, message: 'Cette action est irréversible.', confirmLabel: 'Supprimer', danger: true }))) return;
    setIsCleaning(true);
    try {
      const result = await cleanupGhostBottles();
      setOrphanedBottles(null);
      toast.success(`${result.cleaned}/${result.orphaned} bouteille(s) nettoyée(s).`);
    } catch (e) {
      toast.error('Le nettoyage a échoué : ' + errMsg(e));
    } finally {
      setIsCleaning(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!localConfig) return;
    setSavingConfig(true);
    const success = await saveConfig(localConfig);
    setSavingConfig(false);
    if (success) toast.success('Configuration enregistrée');
    else toast.error('La configuration n’a pas pu être enregistrée.');
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const json = await exportFullData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vinoflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Sauvegarde téléchargée');
    } catch (e) {
      toast.error("Une erreur est survenue lors de l'export : " + errMsg(e));
    } finally {
      setIsExporting(false);
    }
  };

  const handleCsvExport = async () => {
    setIsExportingCsv(true);
    try {
      const wines = await getInventory();
      const withStock = wines.filter(w => w.inventoryCount > 0);
      exportWinesToCsv(withStock);
      toast.success(`${withStock.length} vin(s) exporté(s) en CSV`);
    } catch (e) {
      toast.error("L'export CSV a échoué : " + errMsg(e));
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de resélectionner le même fichier
    if (!file) return;
    const ok = await confirmAction({
      title: 'Restaurer cette sauvegarde ?',
      message: <>Les éléments de <strong>{file.name}</strong> sont ajoutés ou remplacent ceux qui ont le même identifiant. Rien n’est supprimé, et réimporter le même fichier ne crée pas de doublon.</>,
      confirmLabel: 'Restaurer',
    });
    if (!ok) return;
    setImporting(true);
    try {
      const content = await file.text();
      const result = await importFullData(content);
      if (result.ok) {
        const total = Object.values(result.imported || {}).reduce((n, c) => n + c.inserted + c.updated, 0);
        toast.success(`Restauration terminée : ${total} élément(s). Rechargement…`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error(`Restauration impossible : ${result.error}`);
      }
    } catch (err) {
      toast.error("Erreur lors de l'import : " + errMsg(err));
    } finally {
      setImporting(false);
    }
  };

  const runCsvPreview = async (name: string, content: string) => {
    const res = await previewCsvImport(content);
    if (res.ok && res.plan) setCsvImport({ name, content, plan: res.plan });
    else { setCsvImport(null); toast.error(`Import CSV impossible : ${res.error}`); }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de resélectionner le même fichier
    if (!file) return;
    setCsvBusy(true);
    try {
      await runCsvPreview(file.name, decodeCsvBytes(await file.arrayBuffer()));
    } finally {
      setCsvBusy(false);
    }
  };

  const handleCsvApply = async () => {
    if (!csvImport) return;
    setCsvBusy(true);
    try {
      const res = await applyCsvImport(csvImport.content, csvImport.plan.planHash);
      if (res.ok && res.applied) {
        const a = res.applied;
        setCsvImport(null);
        toast.success(`Import appliqué : ${a.updated} vin(s) modifié(s), ${a.peaks} apogée(s), ${a.pricedBottles} prix, ${a.created} nouveau(x) vin(s). Rechargement…`);
        setTimeout(() => window.location.reload(), 1500);
      } else if (res.status === 409) {
        toast.info('La cave a changé entre-temps : aperçu mis à jour.');
        await runCsvPreview(csvImport.name, csvImport.content);
      } else {
        toast.error(`Import CSV impossible : ${res.error}`);
      }
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <MonoLabel>VINOFLOW · RÉGLAGES</MonoLabel>
        <h1 className="text-2xl text-stone-900 font-medium leading-tight mt-1">Paramètres</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">Compte, intelligence artificielle, enrichissement et données</div>
      </div>

      <div className="space-y-4">
        {/* ───── Compte ───── */}
        <Section
          label="Compte"
          title="Mon compte"
          hint={<>Connecté en tant que <strong className="text-stone-800 break-all">{user?.email}</strong>. La cave est partagée par tous les comptes du foyer.</>}
        >
          <ChangePasswordForm />
        </Section>

        {/* ───── IA ───── */}
        <Section label="Intelligence artificielle" title="Fournisseurs et clés">
          {loading || !localConfig ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : (
            <div className="space-y-5">
              {backendProviders && (
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <MonoLabel>Serveur</MonoLabel>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={backendProviders.providers.claude ? 'success' : 'neutral'}>
                      Claude · {backendProviders.providers.claude ? 'configuré' : 'ANTHROPIC_API_KEY manquante'}
                    </Badge>
                    <Badge tone={backendProviders.providers.gemini ? 'success' : 'neutral'}>
                      Gemini · {backendProviders.providers.gemini ? 'configuré' : 'GEMINI_API_KEY manquante'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">
                    Ces clés se règlent dans le fichier <code className="mono">.env</code> du serveur ; ce sont elles que toutes les fonctions IA utilisent en priorité.
                  </p>
                </div>
              )}

              <Notice tone="warning">
                Clés de secours : toutes les fonctions IA s'exécutent sur le serveur, qui n'utilise ces clés que s'il n'a pas les siennes. Elles sont stockées dans ce navigateur (localStorage).
                Elles sont lisibles par tout script injecté dans la page : préférez les variables d'environnement du serveur et des clés avec un plafond de dépenses.
              </Notice>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {KEY_FIELDS.map(f => (
                  <Input
                    key={f.key}
                    label={f.label}
                    type="password"
                    autoComplete="off"
                    value={localConfig.keys[f.key] || ''}
                    onChange={e => setLocalConfig({ ...localConfig, keys: { ...localConfig.keys, [f.key]: e.target.value } })}
                    placeholder={f.placeholder}
                  />
                ))}
              </div>

              <Button onClick={handleSaveConfig} disabled={savingConfig}>
                {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                Enregistrer la configuration
              </Button>
            </div>
          )}
        </Section>

        {/* ───── Enrichissement ───── */}
        <Section
          label="Sommelier"
          title="Enrichissement de la cave"
          hint="Recherche sur le web le profil aromatique et la fenêtre d'apogée des vins qui n'en ont pas encore, avec les sources citées. Chaque fiche indique sur quoi elle repose (cette cuvée et ce millésime, un autre millésime, le producteur, l'appellation ou une règle générique), puis est revérifiée automatiquement."
        >
          <div className="space-y-3">
            <Button onClick={handleEnrich} disabled={enriching}>
              {enriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Enrichir les vins sans profil
            </Button>
            {enrichResult && (
              <Notice tone="success">
                {enrichResult.queued} vin(s) mis en file{enrichResult.engine ? <> · moteur <span className="mono text-xs">{enrichResult.engine}</span></> : null}.
                Comptez 1 à 2 minutes par vin ; les fiches se mettent à jour au fil de l'eau.
              </Notice>
            )}
          </div>

          <div className="border-t border-stone-100 mt-5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <MonoLabel>Audit</MonoLabel>
                <p className="text-sm text-stone-500 mt-0.5">Profils absents, faibles ou anciens.</p>
              </div>
              <Button variant="outline" onClick={handleAudit} disabled={auditing}>
                {auditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Auditer
              </Button>
            </div>
            {auditResult && (
              auditResult.count === 0 ? (
                <EmptyState title="Aucun profil suspect" hint="Toutes les fiches sont solides" className="!py-6" />
              ) : (
                <div className="mt-3">
                  <div className="text-sm text-stone-700 mb-1">
                    <strong>{auditResult.count}</strong> vin(s) à revoir{auditResult.wines.length > 10 ? ' · 10 premiers' : ''}
                  </div>
                  <ul className="divide-y divide-stone-100 border-y border-stone-100">
                    {auditResult.wines.slice(0, 10).map(w => (
                      <li key={w.id} className="flex items-center justify-between gap-3 py-2 min-h-[44px]">
                        <WineLink id={w.id} className="text-sm text-stone-900 min-w-0 truncate">
                          {w.name} {w.vintage || ''}
                          {w.producer && <span className="text-stone-500"> · {w.producer}</span>}
                        </WineLink>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <Badge tone={w.aromaProfile?.length ? 'neutral' : 'warning'}>
                            {w.aromaProfile?.length ? `${w.aromaProfile.length} arômes` : 'sans profil'}
                          </Badge>
                          {w.aromaConfidence && <Badge tone={w.aromaConfidence === 'LOW' ? 'warning' : 'neutral'}>{w.aromaConfidence}</Badge>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>
        </Section>

        {/* ───── Nettoyage ───── */}
        <Section
          label="Maintenance"
          title="Nettoyage de la cave"
          hint="Détecte les bouteilles orphelines (vin parent supprimé) ou les données de test restantes."
        >
          <div className="space-y-3">
            <Button variant="outline" onClick={handleScanGhosts} disabled={isScanning}>
              {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {isScanning ? 'Analyse en cours…' : 'Scanner les anomalies'}
            </Button>

            {orphanedBottles !== null && orphanedBottles.length === 0 && (
              <Notice tone="success">Aucune anomalie détectée. La cave est propre.</Notice>
            )}

            {orphanedBottles !== null && orphanedBottles.length > 0 && (
              <div className="space-y-3">
                <Notice tone="warning"><strong>{orphanedBottles.length}</strong> bouteille(s) orpheline(s) détectée(s).</Notice>
                <Button variant="danger" onClick={handleCleanup} disabled={isCleaning}>
                  {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {isCleaning ? 'Nettoyage…' : `Supprimer ${orphanedBottles.length} bouteille(s)`}
                </Button>
              </div>
            )}
          </div>
        </Section>

        {/* ───── Données ───── */}
        <Section label="Données" title="Sauvegarde et export">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Sauvegarde (JSON)
            </Button>
            <Button variant="outline" onClick={handleCsvExport} disabled={isExportingCsv}>
              {isExportingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Export (CSV)
            </Button>
            <Button variant="outline" onClick={() => csvInput.current?.click()} disabled={csvBusy}>
              {csvBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importer un CSV modifié
            </Button>
            <input ref={csvInput} type="file" accept=".csv,text/csv" onChange={handleCsvImport} className="hidden" />
            <Button variant="danger" onClick={() => importInput.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Restaurer…
            </Button>
            <input ref={importInput} type="file" accept=".json,application/json" onChange={handleImport} className="hidden" />
          </div>
          <p className="mt-3 text-xs text-stone-500">
            La sauvegarde JSON contient toute la cave. Le CSV liste les vins en stock : modifie-le dans Excel ou Numbers puis réimporte-le.
            Une cellule vide ne change rien, « - » efface ; une ligne sans identifiant crée un vin. Un aperçu s’affiche avant toute modification.
          </p>
          <CsvImportPreview
            fileName={csvImport?.name ?? ''}
            plan={csvImport?.plan ?? null}
            applying={csvBusy}
            onApply={handleCsvApply}
            onClose={() => setCsvImport(null)}
          />
        </Section>
      </div>
    </div>
  );
};
