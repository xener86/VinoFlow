import { useCallback, useEffect, useRef, useState } from 'react';
import type { CellarWine } from '../types';
import { readLabel } from '../services/storageService';
import { autoMatch } from '../utils/findExisting';
import { openDraftStore, normalizeLoaded, type DraftStore } from '../utils/quickAddDraft';
import {
  afterSave, applyReadResult, editWine, makeRunner, markReading, newLine, nextWakeUp, pickNext, rematch, wineOf,
  type DraftLine, type DraftMeta, type WineDraft,
} from '../utils/quickAddQueue';

const newMeta = (occasion = ''): DraftMeta => ({ batchId: crypto.randomUUID(), occasion });
const upsert = (lines: DraftLine[], line: DraftLine) =>
  (lines.some(l => l.id === line.id) ? lines.map(l => (l.id === line.id ? line : l)) : [...lines, line]);

/** Brouillon de rafale + lecture des photos, une à la fois, dès que le réseau le permet. */
export const useQuickAddQueue = (wines: CellarWine[]) => {
  const [store, setStore] = useState<DraftStore | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [meta, setMeta] = useState<DraftMeta>(() => newMeta());
  const [tick, setTick] = useState(0);
  const [runner] = useState(makeRunner);
  // Copie synchrone des lignes : le lecteur relit l'état courant après chaque attente.
  const linesRef = useRef(lines);
  const winesRef = useRef(wines);
  winesRef.current = wines;

  const commit = useCallback((next: DraftLine[]) => {
    linesRef.current = next;
    setLines(next);
  }, []);

  useEffect(() => {
    let alive = true;
    openDraftStore().then(async (s) => {
      const loaded = normalizeLoaded(await s.list());
      const savedMeta = await s.getMeta();
      if (!alive) return;
      setStore(s);
      commit(loaded);
      if (savedMeta) setMeta(savedMeta);
      else await s.putMeta(meta);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (line: DraftLine) => {
    commit(upsert(linesRef.current, line));
    await store?.put(line);
  }, [store, commit]);

  // Lecteur : une photo à la fois ; réveil programmé à la prochaine échéance.
  useEffect(() => {
    if (!store || runner.busy) return;
    const now = Date.now();
    const next = pickNext(lines, now);
    if (!next) {
      const wake = nextWakeUp(lines, now);
      if (wake == null) return;
      const timer = setTimeout(() => setTick(t => t + 1), wake - now);
      return () => clearTimeout(timer);
    }
    runner.run(async () => {
      const reading = markReading(next);
      await save(reading);
      const outcome = await readLabel(next.photo as string);
      const current = linesRef.current.find(l => l.id === next.id);
      let updated = current ? applyReadResult(current, reading, outcome, Date.now()) : null;
      if (!updated) return; // ligne supprimée, photo reprise ou saisie manuelle entre-temps
      if (outcome.kind === 'ok' && !updated.matchWineId && !updated.forceNew) {
        const match = autoMatch(winesRef.current, wineOf(updated));
        if (match) updated = { ...updated, matchWineId: match.id };
      }
      await save(updated);
    })
      .catch(error => console.error('Rafale : lecture interrompue', error))
      .finally(() => setTick(t => t + 1));
  }, [store, lines, tick, save, runner]);

  // Cave chargée (ou rechargée) après les lectures : on rapproche les lignes restées sans vin.
  useEffect(() => {
    if (!store) return;
    rematch(linesRef.current, wines).forEach(line => { save(line); });
  }, [wines, store, save]);

  useEffect(() => {
    const wake = () => setTick(t => t + 1);
    window.addEventListener('online', wake);
    return () => window.removeEventListener('online', wake);
  }, []);

  const addPhoto = useCallback((photo: string | null) => save(newLine(crypto.randomUUID(), photo, Date.now())), [save]);

  const update = useCallback(async (id: string, change: Partial<DraftLine> | ((line: DraftLine) => DraftLine)) => {
    const current = linesRef.current.find(l => l.id === id);
    if (!current) return;
    await save(typeof change === 'function' ? change(current) : { ...current, ...change });
  }, [save]);

  /** Correction du vin : le rapprochement avec la cave est refait si besoin. */
  const editLine = useCallback((id: string, patch: Partial<WineDraft>) => update(id, l => editWine(l, patch, winesRef.current)), [update]);

  const remove = useCallback(async (id: string) => {
    commit(linesRef.current.filter(l => l.id !== id));
    await store?.delete(id);
  }, [store, commit]);

  const setOccasion = useCallback(async (occasion: string) => {
    const next = { ...meta, occasion };
    setMeta(next);
    await store?.putMeta(next);
  }, [meta, store]);

  /** Après un enregistrement : retire les lignes enregistrées, garde les autres sous une nouvelle rafale. */
  const finishSave = useCallback(async (result: { lines: { clientId: string }[] }) => {
    const remaining = afterSave(linesRef.current, result);
    commit(remaining);
    for (const l of result.lines) await store?.delete(l.clientId);
    const fresh = newMeta(meta.occasion);
    setMeta(fresh);
    await store?.putMeta(fresh);
    return remaining.length;
  }, [store, meta, commit]);

  const clearAll = useCallback(async () => {
    const fresh = newMeta();
    commit([]);
    setMeta(fresh);
    await store?.clear();
    await store?.putMeta(fresh);
  }, [store, commit]);

  return { ready: !!store, persistent: store?.kind === 'idb', lines, meta, addPhoto, update, editLine, remove, setOccasion, finishSave, clearAll };
};
