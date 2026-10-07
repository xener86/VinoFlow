import { useCallback, useEffect, useRef, useState } from 'react';
import type { CellarWine } from '../types';
import { readLabel } from '../services/storageService';
import { autoMatch } from '../utils/findExisting';
import { openDraftStore, normalizeLoaded, type DraftStore } from '../utils/quickAddDraft';
import { markReading, newLine, nextState, nextWakeUp, pickNext, wineOf, type DraftLine, type DraftMeta } from '../utils/quickAddQueue';

const newMeta = (): DraftMeta => ({ batchId: crypto.randomUUID(), occasion: '' });

/** Brouillon de rafale + lecture des photos, une à la fois, dès que le réseau le permet. */
export const useQuickAddQueue = (wines: CellarWine[]) => {
  const [store, setStore] = useState<DraftStore | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [meta, setMeta] = useState<DraftMeta>(newMeta);
  const [tick, setTick] = useState(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const winesRef = useRef(wines);
  winesRef.current = wines;
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    openDraftStore().then(async (s) => {
      const loaded = normalizeLoaded(await s.list());
      const savedMeta = await s.getMeta();
      if (!alive) return;
      setStore(s);
      setLines(loaded);
      if (savedMeta) setMeta(savedMeta);
      else await s.putMeta(meta);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (line: DraftLine) => {
    setLines(ls => (ls.some(l => l.id === line.id) ? ls.map(l => (l.id === line.id ? line : l)) : [...ls, line]));
    await store?.put(line);
  }, [store]);

  // Lecteur : une photo à la fois ; réveil programmé à la prochaine échéance.
  useEffect(() => {
    if (!store || busy.current) return;
    const now = Date.now();
    const next = pickNext(lines, now);
    if (!next) {
      const wake = nextWakeUp(lines, now);
      if (wake == null) return;
      const timer = setTimeout(() => setTick(t => t + 1), wake - now);
      return () => clearTimeout(timer);
    }
    busy.current = true;
    (async () => {
      await save(markReading(next));
      const outcome = await readLabel(next.photo as string);
      const current = linesRef.current.find(l => l.id === next.id);
      if (current) {
        let updated = nextState(current, outcome, Date.now());
        if (outcome.kind === 'ok' && !updated.matchWineId && !updated.forceNew) {
          const match = autoMatch(winesRef.current, wineOf(updated));
          if (match) updated = { ...updated, matchWineId: match.id };
        }
        await save(updated);
      }
      busy.current = false;
      setTick(t => t + 1);
    })();
  }, [store, lines, tick, save]);

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

  const remove = useCallback(async (id: string) => {
    setLines(ls => ls.filter(l => l.id !== id));
    await store?.delete(id);
  }, [store]);

  const setOccasion = useCallback(async (occasion: string) => {
    const next = { ...meta, occasion };
    setMeta(next);
    await store?.putMeta(next);
  }, [meta, store]);

  const clearAll = useCallback(async () => {
    const fresh = newMeta();
    setLines([]);
    setMeta(fresh);
    await store?.clear();
    await store?.putMeta(fresh);
  }, [store]);

  return { ready: !!store, persistent: store?.kind === 'idb', lines, meta, addPhoto, update, remove, setOccasion, clearAll };
};
