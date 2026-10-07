import type { DraftLine, DraftMeta } from './quickAddQueue';

// Brouillon de rafale gardé sur le téléphone (IndexedDB) : on peut fermer
// l'app et reprendre. Sans IndexedDB (navigation privée), repli en mémoire.

export interface DraftStore {
  kind: 'idb' | 'memory';
  list(): Promise<DraftLine[]>;
  put(line: DraftLine): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  getMeta(): Promise<DraftMeta | null>;
  putMeta(meta: DraftMeta): Promise<void>;
}

const byCreation = (a: DraftLine, b: DraftLine) => a.createdAt - b.createdAt;

/** Lignes relues : une lecture interrompue par la fermeture de l'app repart en attente. */
export const normalizeLoaded = (lines: DraftLine[]): DraftLine[] =>
  lines.map(l => (l.status === 'READING' ? { ...l, status: 'PENDING' as const } : l)).sort(byCreation);

export const createMemoryStore = (): DraftStore => {
  const lines = new Map<string, DraftLine>();
  let meta: DraftMeta | null = null;
  return {
    kind: 'memory',
    list: async () => [...lines.values()].map(l => structuredClone(l)).sort(byCreation),
    put: async (line) => { lines.set(line.id, structuredClone(line)); },
    delete: async (id) => { lines.delete(id); },
    clear: async () => { lines.clear(); meta = null; },
    getMeta: async () => (meta ? { ...meta } : null),
    putMeta: async (m) => { meta = { ...m }; },
  };
};

const DB_NAME = 'vinoflow-quick-add';
const LINES = 'lines';
const META = 'meta';

const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(LINES, { keyPath: 'id' });
    req.result.createObjectStore(META);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbStore = (db: IDBDatabase): DraftStore => {
  const store = (name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  return {
    kind: 'idb',
    list: async () => ((await request(store(LINES, 'readonly').getAll())) as DraftLine[]).sort(byCreation),
    put: async (line) => { await request(store(LINES, 'readwrite').put(line)); },
    delete: async (id) => { await request(store(LINES, 'readwrite').delete(id)); },
    clear: async () => {
      await request(store(LINES, 'readwrite').clear());
      await request(store(META, 'readwrite').clear());
    },
    getMeta: async () => ((await request(store(META, 'readonly').get('meta'))) as DraftMeta | undefined) ?? null,
    putMeta: async (meta) => { await request(store(META, 'readwrite').put(meta, 'meta')); },
  };
};

export const openDraftStore = async (): Promise<DraftStore> => {
  try {
    if (typeof indexedDB === 'undefined') return createMemoryStore();
    return idbStore(await openDb());
  } catch {
    return createMemoryStore();
  }
};
