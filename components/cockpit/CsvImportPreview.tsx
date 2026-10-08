import React, { useMemo } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { CsvImportPlan } from '../../types';
import { groupChanges, summaryTiles } from '../../utils/csvImportSummary';
import { Badge, Button, Card, Modal, MonoLabel } from './primitives';

interface Props {
  fileName: string;
  plan: CsvImportPlan | null;
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
}

// Aperçu d'un import CSV : rien n'est écrit avant « Appliquer ».
export const CsvImportPreview: React.FC<Props> = ({ fileName, plan, applying, onApply, onClose }) => {
  const groups = useMemo(() => (plan ? groupChanges(plan) : []), [plan]);
  if (!plan) return null;
  const nothing = plan.changeCount === 0;

  return (
    <Modal
      open
      onClose={applying ? () => {} : onClose}
      size="lg"
      title="Aperçu de l’import"
      subtitle={fileName}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={applying}>Annuler</Button>
          <Button onClick={onApply} disabled={applying || nothing}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {nothing ? 'Aucun changement' : `Appliquer ${plan.changeCount} changement(s)`}
          </Button>
        </>
      )}
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {summaryTiles(plan).map((t) => (
          <Card key={t.label} className="p-3">
            <MonoLabel>{t.label}</MonoLabel>
            <div className={`text-xl mt-1 ${t.label === 'Erreurs' && t.value > 0 ? 'text-wine-700' : 'text-stone-900'}`}>{t.value}</div>
          </Card>
        ))}
      </div>

      {nothing && plan.errors.length === 0 && (
        <p className="mt-4 text-sm text-stone-600">Aucun changement : le fichier correspond déjà à la cave.</p>
      )}

      {plan.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-wine-200 bg-wine-50/40 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-wine-800"><AlertTriangle className="w-4 h-4" /> Lignes écartées</div>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {plan.errors.map((e) => <li key={`e${e.line}`}><span className="mono text-xs text-stone-500">Ligne {e.line}</span> — {e.message}</li>)}
          </ul>
        </div>
      )}

      {plan.warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
          <div className="text-sm font-medium text-amber-900">À vérifier</div>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {plan.warnings.map((w, i) => <li key={`w${w.line}-${i}`}><span className="mono text-xs text-stone-500">Ligne {w.line}</span> — {w.message}</li>)}
          </ul>
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-4 divide-y divide-stone-100 border-y border-stone-100">
          {groups.map((g) => (
            <details key={g.key} className="py-2 group">
              <summary className="flex items-center gap-2 cursor-pointer text-sm text-stone-800">
                <span className="mono text-[10px] text-stone-400">L{g.line}</span>
                <span className="flex-1 min-w-0 truncate">{g.label}</span>
                {g.isNew ? <Badge tone="success">NOUVEAU</Badge> : <Badge>{g.lines.length}</Badge>}
              </summary>
              <ul className="mt-1.5 ml-7 space-y-0.5 text-[13px] text-stone-600">
                {g.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </details>
          ))}
        </div>
      )}

      {plan.unchanged > 0 && <p className="mt-3 text-xs text-stone-500">{plan.unchanged} ligne(s) sans changement.</p>}
    </Modal>
  );
};
