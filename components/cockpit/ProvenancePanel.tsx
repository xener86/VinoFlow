// Provenance des informations IA d'un vin : niveau atteint par la cascade
// d'enrichissement, sources citées (vérifiées ou non), relance, choix parmi
// des homonymes, annulation d'un enrichissement et correction manuelle.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, AlertTriangle, CircleSlash, ExternalLink, RefreshCw, Pencil, Undo2, Loader2 } from 'lucide-react';
import { Card, MonoLabel, Button, Input } from './primitives';
import { useToast, useConfirm } from './feedback';
import {
  getWineEnrichment, requestWineEnrichment, chooseEnrichmentCandidate, revertWineEnrichment,
} from '../../services/storageService';
import { EnrichmentLevel, EnrichmentSource, WineEnrichment } from '../../types';

export const LEVEL_META: Record<EnrichmentLevel, { short: string; label: string; cls: string }> = {
  EXACT:           { short: 'Sourcé',          label: 'Cette cuvée, ce millésime',               cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  AUTRE_MILLESIME: { short: 'Autre millésime', label: "D'après un autre millésime de la cuvée", cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  PRODUCTEUR:      { short: 'Producteur',      label: "Estimé d'après le style du producteur",   cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  APPELLATION:     { short: 'Appellation',     label: "Estimé d'après l'appellation",            cls: 'bg-orange-50 text-orange-800 ring-orange-200' },
  REGLES:          { short: 'Générique',       label: 'Règle générique',                         cls: 'bg-stone-100 text-stone-600 ring-stone-200' },
};

/** Badge compact du niveau de provenance (renvoie vers le panneau #provenance). */
export const ProvenanceBadge: React.FC<{ basis?: EnrichmentLevel | null; className?: string }> = ({ basis, className = '' }) => {
  const meta = basis ? LEVEL_META[basis] : null;
  return (
    <a
      href="#provenance"
      onClick={(e) => { e.preventDefault(); document.getElementById('provenance')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
      title={meta ? `Provenance : ${meta.label}` : 'Pas encore vérifié sur le web'}
      className={`mono inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] tracking-wider uppercase ring-1 ${meta ? meta.cls : 'bg-stone-50 text-stone-500 ring-stone-200'} ${className}`}
    >
      {meta ? meta.short : 'Non vérifié'}
    </a>
  );
};

const FIELD_LABELS: Record<string, string> = {
  appellation: 'Appellation', region: 'Région', producer: 'Producteur', cuvee: 'Cuvée',
  grapeVarieties: 'Cépages', aromaProfile: 'Arômes', sensoryProfile: 'Profil sensoriel',
  sensoryDescription: 'Description', peakStart: 'Début d’apogée', peakEnd: 'Fin d’apogée',
};

const CHECK_META: Record<NonNullable<EnrichmentSource['check']>, { icon: React.ReactNode; label: string }> = {
  verified:    { icon: <Check className="w-3 h-3 text-emerald-600" />, label: 'Citation retrouvée sur la page' },
  not_found:   { icon: <AlertTriangle className="w-3 h-3 text-amber-600" />, label: 'Citation introuvable sur la page : source ignorée' },
  unreachable: { icon: <CircleSlash className="w-3 h-3 text-stone-400" />, label: 'Page inaccessible au moment de la vérification' },
};

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Les erreurs d'API arrivent sous la forme « API Error: 503 … - {"error":"…"} ».
const apiMessage = (e: unknown, fallback: string) => {
  const m = String((e as Error)?.message || '').match(/\{.*\}$/);
  try { return m ? JSON.parse(m[0]).error || fallback : fallback; } catch { return fallback; }
};

export const ProvenancePanel: React.FC<{ wineId: string; onChanged?: () => void; className?: string }> = ({ wineId, onChanged, className = '' }) => {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [data, setData] = useState<WineEnrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  const load = useCallback(async () => {
    try { setData(await getWineEnrichment(wineId)); } catch { /* panneau masqué si l'API manque */ }
    finally { setLoading(false); }
  }, [wineId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Suivi pendant qu'un enrichissement tourne ou attend son tour (1 à 3 min).
  const pending = !!data && (data.inProgress || !!data.queuePosition);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const next = await getWineEnrichment(wineId).catch(() => null);
      if (!next) return;
      setData(next);
      if (!next.inProgress && !next.queuePosition) {
        if (next.status === 'error') toast.error('La recherche a échoué : ' + (next.error || 'erreur inconnue'));
        else if (next.status === 'needs_review') toast.info('Plusieurs vins correspondent : choisis le bon.');
        else toast.success('Fiche enrichie' + (next.basis ? ` — ${LEVEL_META[next.basis].label.toLowerCase()}` : ''));
        onChanged?.();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [pending, wineId, onChanged, toast]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.info(ok);
      await load();
    } catch (e) {
      toast.error(apiMessage(e, 'Action impossible pour le moment.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async (logId: number, fields: string[]) => {
    const ok = await confirmAction({
      title: 'Annuler cet enrichissement ?',
      message: `Les valeurs précédentes seront restaurées : ${fields.map((f) => FIELD_LABELS[f] || f).join(', ')}.`,
      confirmLabel: 'Restaurer',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await revertWineEnrichment(wineId, logId);
      toast.success('Valeurs précédentes restaurées');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiMessage(e, 'Annulation impossible.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;
  if (!data) return null;

  const meta = data.basis ? LEVEL_META[data.basis] : null;
  const changedFields = (changes: Record<string, any> | null) =>
    Object.keys(changes || {}).filter((k) => FIELD_LABELS[k]);
  const lastRevertable = data.log.find((l) => l.ok && !l.reverted_at && changedFields(l.changes).length > 0);

  return (
    <Card id="provenance" className={`p-6 scroll-mt-20 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <MonoLabel>◌ Provenance des informations</MonoLabel>
          <h3 className="serif-it text-xl text-stone-900 mt-0.5">D’où vient cette fiche ?</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline" size="sm" disabled={busy || pending}
            onClick={() => run(() => requestWineEnrichment(wineId), 'Recherche lancée — compte 1 à 3 minutes.')}
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {pending ? 'Recherche en cours…' : data.basis ? 'Rechercher à nouveau' : 'Rechercher sur le web'}
          </Button>
          <Link to={`/wine/${wineId}/edit`}>
            <Button variant="ghost" size="sm" title="Une valeur saisie à la main n'est plus jamais écrasée par l'IA">
              <Pencil className="w-3.5 h-3.5" />Corriger
            </Button>
          </Link>
        </div>
      </div>

      {/* Niveau atteint */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {meta ? (
          <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ring-1 ${meta.cls}`}>{meta.label}</span>
        ) : (
          <span className="text-stone-500 italic">Pas encore vérifié sur le web : arômes et apogée sont des estimations.</span>
        )}
        {data.enrichedAt && <span className="mono text-[10px] tracking-widest text-stone-500 uppercase">Vérifié le {fmtDate(data.enrichedAt)}</span>}
        {data.nextCheckAt && <span className="mono text-[10px] tracking-widest text-stone-400 uppercase">Prochaine vérif. {fmtDate(data.nextCheckAt)}</span>}
      </div>

      {pending && (
        <div className="mt-3 text-xs text-stone-500" role="status">
          {data.inProgress ? 'Recherche en cours sur le web…' : `En file d’attente (position ${data.queuePosition}).`} La fiche se mettra à jour seule.
        </div>
      )}

      {data.status === 'error' && data.error && !pending && (
        <div className="mt-3 rounded-md bg-wine-50 border border-wine-100 px-3 py-2 text-xs text-wine-800">
          Dernière recherche en échec : {data.error}
        </div>
      )}

      {/* Homonymes à départager */}
      {data.status === 'needs_review' && !pending && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 p-4">
          <div className="text-sm text-stone-800 mb-2">Plusieurs vins portent ce nom. Lequel est dans ta cave ?</div>
          <ul className="space-y-1.5">
            {data.candidates.map((c, i) => (
              <li key={i}>
                <button
                  disabled={busy}
                  onClick={() => run(() => chooseEnrichmentCandidate(wineId, { candidateIndex: i }), 'Choix enregistré, nouvelle recherche lancée.')}
                  className="w-full text-left rounded-md border border-stone-200 bg-white hover:border-wine-300 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-stone-900">{[c.producer, c.cuvee].filter(Boolean).join(' — ') || 'Candidat'}</span>
                  {c.location && <span className="text-stone-500"> · {c.location}</span>}
                  {c.evidence && <span className="block text-xs text-stone-500 mt-0.5">{c.evidence}</span>}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2 items-end"
            onSubmit={(e) => { e.preventDefault(); if (hint.trim()) run(() => chooseEnrichmentCandidate(wineId, { hint }), 'Indice enregistré, nouvelle recherche lancée.'); }}
          >
            <Input wrapperClassName="flex-1" label="Ou précise toi-même" placeholder="ex. Domaine Richard, Chavanay (Rhône)" value={hint} onChange={(e) => setHint(e.target.value)} />
            <Button type="submit" variant="outline" disabled={busy || !hint.trim()}>Valider</Button>
          </form>
        </div>
      )}

      {/* Sources */}
      {data.sources.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.sources.map((s, i) => {
            const check = s.check ? CHECK_META[s.check] : null;
            return (
              <li key={i} className={`rounded-md border px-3 py-2.5 ${s.check === 'not_found' ? 'border-stone-100 bg-stone-50/60 opacity-70' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {check && <span title={check.label} aria-label={check.label} className="shrink-0">{check.icon}</span>}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-stone-800 hover:text-wine-700 hover:underline">
                    {s.title || s.domain || s.url}
                  </a>
                  <ExternalLink className="w-3 h-3 text-stone-400 shrink-0" />
                </div>
                <div className="mono text-[10px] tracking-widest text-stone-400 uppercase mt-0.5">
                  {[s.domain, s.level && LEVEL_META[s.level]?.short, s.vintage].filter(Boolean).join(' · ')}
                </div>
                {s.excerpt && <p className="mt-1.5 text-xs text-stone-600 italic leading-relaxed">« {s.excerpt} »</p>}
              </li>
            );
          })}
        </ul>
      )}

      {/* Historique */}
      {data.log.length > 0 && (
        <details className="mt-4 group">
          <summary className="mono text-[10px] tracking-widest text-stone-500 uppercase cursor-pointer select-none py-1">
            Historique · {data.log.length}
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs">
            {data.log.map((l) => {
              const fields = changedFields(l.changes);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-stone-100 pb-1.5">
                  <span className="mono text-[10px] text-stone-500">{fmtDate(l.created_at)}</span>
                  <span className={l.ok ? 'text-stone-700' : 'text-wine-700'}>
                    {l.ok ? (l.basis ? LEVEL_META[l.basis]?.short : 'Homonymes') : 'Échec'}
                  </span>
                  {fields.length > 0 && <span className="text-stone-500">· {fields.map((f) => FIELD_LABELS[f]).join(', ')}</span>}
                  {l.reverted_at && <span className="mono text-[10px] text-stone-400 uppercase">annulé</span>}
                  {l === lastRevertable && (
                    <button
                      onClick={() => handleRevert(l.id, fields)}
                      disabled={busy}
                      className="ml-auto inline-flex items-center gap-1 text-stone-500 hover:text-wine-700 py-1"
                    >
                      <Undo2 className="w-3 h-3" />Annuler
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </Card>
  );
};
