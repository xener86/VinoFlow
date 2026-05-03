// Cockpit Add Wine — free text + AI enrichment.
// The user types what's on the label (e.g. "Pommard 1er Cru Rugiens 2018"),
// the AI extracts and enriches name, region, grape varieties, sensory profile,
// peak window, etc. The user confirms quantity, location, price and saves.

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Check, AlertCircle } from 'lucide-react';
import { saveWine } from '../services/storageService';
import { enrichWineData } from '../services/geminiService';
import { useRacks } from '../hooks/useRacks';
import { Wine, WineType } from '../types';
import { Card, MonoLabel, Button, Skeleton, Badge } from '../components/cockpit/primitives';

const EXAMPLES = [
  'Pommard 1er Cru Rugiens 2018',
  'Sancerre Caillottes 2020',
  'Chablis Vaudésir 2019',
  'Côte-Rôtie La Landonne 2014',
];

// Parse "Wine name 2018" → name + vintage
const parseFreeText = (text: string): { name: string; vintage: number } => {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*?)\s+(19|20)(\d{2})\s*$/);
  if (match) {
    return { name: match[1].trim(), vintage: parseInt(match[2] + match[3]) };
  }
  return { name: trimmed, vintage: new Date().getFullYear() };
};

export const CockpitAddWine: React.FC = () => {
  const navigate = useNavigate();
  const { racks } = useRacks();

  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [analysis, setAnalysis] = useState<Partial<Wine> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // User overrides
  const [qty, setQty] = useState(1);
  const [loc, setLoc] = useState<string>('LIMBO');
  const [price, setPrice] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Debounced AI analysis when text changes
  useEffect(() => {
    if (!text.trim() || text.trim().length < 5) {
      setAnalysis(null);
      setError(null);
      return;
    }
    const timer = setTimeout(async () => {
      setThinking(true);
      setError(null);
      try {
        const { name, vintage } = parseFreeText(text);
        const result = await enrichWineData(name, vintage, text);
        if (result) {
          setAnalysis({ ...result, name: result.name || name, vintage: result.vintage || vintage });
        } else {
          setError("L'IA n'a pas pu identifier ce vin.");
          setAnalysis(null);
        }
      } catch (e: any) {
        setError(e.message || 'Erreur IA');
        setAnalysis(null);
      } finally {
        setThinking(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [text]);

  const handleSave = async () => {
    if (!analysis) return;
    setSaving(true);
    try {
      const wine: Wine = {
        id: crypto.randomUUID(),
        name: analysis.name || '',
        producer: analysis.producer || '',
        vintage: analysis.vintage || new Date().getFullYear(),
        region: analysis.region || '',
        country: analysis.country || 'France',
        type: (analysis.type || 'RED') as WineType,
        grapeVarieties: analysis.grapeVarieties || [],
        format: analysis.format || '750ml',
        sensoryDescription: analysis.sensoryDescription || '',
        aromaProfile: analysis.aromaProfile || [],
        tastingNotes: analysis.tastingNotes || '',
        suggestedFoodPairings: analysis.suggestedFoodPairings || [],
        producerHistory: analysis.producerHistory || '',
        enrichedByAI: true,
        aiConfidence: analysis.aiConfidence || 'MEDIUM',
        isFavorite: false,
        sensoryProfile: analysis.sensoryProfile || { body: 50, acidity: 50, tannin: 50, sweetness: 0, alcohol: 50, flavors: [] },
        cuvee: analysis.cuvee,
        appellation: analysis.appellation,
        personalNotes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const purchasePrice = price ? parseFloat(price) : undefined;
      // location is a string (rack id or 'Non trié'); the underlying API
      // accepts both formats but the TS signature wants BottleLocation.
      const wineId = await saveWine(wine, qty, purchasePrice, undefined as any);
      // For now we always drop wines in 'Non trié' from this page; user
      // will move them via the Plan once UI is ready.
      navigate(`/wine/${wineId}`);
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  const racksList = useMemo(() => racks || [], [racks]);

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-5">
        <MonoLabel>VINOFLOW · INVENTAIRE</MonoLabel>
        <h1 className="text-2xl text-stone-900 dark:text-white font-medium leading-tight mt-1">Ajouter un vin</h1>
        <div className="text-[12px] text-stone-500 mt-0.5">Tape une étiquette, l'IA fait le reste.</div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* ───── Left: free text + form ───── */}
        <div className="col-span-12 md:col-span-7 space-y-4">
          <Card className="p-6">
            <MonoLabel>◌ Saisie libre</MonoLabel>
            <h2 className="serif text-xl text-stone-900 dark:text-white mt-1 mb-1.5">Tape ce que tu vois sur l'étiquette</h2>
            <p className="text-[12.5px] text-stone-600 dark:text-stone-400 mb-4">
              L'IA complète région, cépage, fenêtre de garde et profil sensoriel.
            </p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="ex. Pommard 1er Cru Rugiens 2018"
              rows={2}
              autoFocus
              className="w-full px-4 py-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-base outline-none focus:ring-2 focus:ring-wine-600/40 focus:border-wine-600 serif-it text-stone-900 dark:text-white"
            />
            {!text && (
              <div className="mt-3">
                <div className="mono text-[9px] tracking-widest text-stone-400 mb-2">EXEMPLES</div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map(e => (
                    <button
                      key={e}
                      onClick={() => setText(e)}
                      className="text-[11.5px] px-2.5 py-1 rounded-full border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500 transition"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Quantité</div>
                <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-md p-1 w-fit">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-lg">−</button>
                  <span className="serif text-2xl text-stone-900 dark:text-white w-10 text-center tabular-nums">{qty}</span>
                  <button onClick={() => setQty(q => q + 1)} className="w-8 h-8 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-lg">+</button>
                </div>
              </div>
              <div>
                <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Emplacement</div>
                <select
                  value={loc}
                  onChange={e => setLoc(e.target.value)}
                  className="h-10 px-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm w-full outline-none focus:ring-2 focus:ring-wine-600/40 text-stone-700 dark:text-stone-300"
                >
                  <option value="LIMBO">⏳ Zone d'attente (placer plus tard)</option>
                  {racksList.map(r => (
                    <option key={r.id} value={r.id}>{r.name} · {r.type}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Prix d'achat (€)</div>
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="—"
                  className="h-10 px-3 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm w-full outline-none focus:ring-2 focus:ring-wine-600/40 text-stone-700 dark:text-stone-300"
                />
              </div>
            </div>
          </Card>

          <Button
            size="lg"
            disabled={!analysis || thinking || saving}
            onClick={handleSave}
            className="w-full"
          >
            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : null}
            {saving ? 'Sauvegarde…' : !analysis ? (text ? 'Analyse en cours…' : 'Tape un vin pour commencer') : `Ajouter ${qty} × ${analysis.name || 'ce vin'}`}
          </Button>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 p-3 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
        </div>

        {/* ───── Right: AI preview ───── */}
        <div className="col-span-12 md:col-span-5">
          <Card className="p-6 sticky top-5">
            <div className="flex items-center justify-between mb-4">
              <MonoLabel>◌ Analyse IA</MonoLabel>
              {analysis && !thinking && (
                <Badge tone={analysis.aiConfidence === 'HIGH' ? 'success' : analysis.aiConfidence === 'LOW' ? 'urgent' : 'warning'}>
                  {analysis.aiConfidence || 'MEDIUM'}
                </Badge>
              )}
            </div>

            {!analysis && !thinking && (
              <div className="text-[13px] text-stone-500 italic py-8 text-center">
                <div className="serif-it text-2xl text-stone-300 dark:text-stone-700 mb-2">« en attente »</div>
                L'analyse apparaît ici dès que tu tapes.
              </div>
            )}

            {thinking && (
              <div className="space-y-2.5 py-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="pt-2 grid grid-cols-2 gap-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              </div>
            )}

            {analysis && !thinking && (
              <div>
                <div className="serif-it text-2xl text-stone-900 dark:text-white leading-tight">{analysis.name}</div>
                <div className="mono text-[11px] tracking-widest text-stone-500 mt-1">
                  {analysis.vintage || '????'} · {analysis.appellation || analysis.region || '?'}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-[12.5px]">
                  <Field label="Région" value={analysis.region} />
                  <Field label="Type" value={analysis.type} />
                  <Field label="Producteur" value={analysis.producer} />
                  <Field label="Cépages" value={analysis.grapeVarieties?.join(', ')} />
                </div>

                {analysis.aromaProfile && analysis.aromaProfile.length > 0 && (
                  <div className="mt-5">
                    <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-2">Arômes détectés</div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.aromaProfile.slice(0, 8).map(a => (
                        <span key={a} className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.suggestedFoodPairings && analysis.suggestedFoodPairings.length > 0 && (
                  <div className="mt-4">
                    <div className="mono text-[10px] tracking-widest uppercase text-stone-500 mb-1.5">Accords suggérés</div>
                    <div className="text-[12px] text-stone-700 dark:text-stone-300">
                      {analysis.suggestedFoodPairings.slice(0, 3).join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-stone-50 dark:bg-stone-800/40 rounded-md p-2">
    <div className="mono text-[9px] tracking-widest uppercase text-stone-500">{label}</div>
    <div className="text-stone-900 dark:text-white text-[13px] mt-0.5 truncate">{value || <span className="text-stone-400">—</span>}</div>
  </div>
);
