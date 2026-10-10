import type { CellarWine, OcrResult, WineType } from '../types';
import { autoMatch } from './findExisting';

// Rafale d'ajout : une ligne par photo, lue par l'OCR serveur dès que possible.
// Fonctions pures : le hook useQuickAddQueue s'occupe du stockage et du réseau.

export type LineStatus = 'PENDING' | 'READING' | 'READY' | 'REVIEW' | 'FAILED';
export type Destination = 'CELLAR' | 'WISHLIST' | 'TASTING';

export interface WineDraft {
  name: string; producer: string; vintage: number | null; type: WineType | null; cuvee: string;
  appellation: string; region: string; country: string; grapeVarieties: string[]; format: string;
}

export interface DraftLine {
  id: string; createdAt: number; photo: string | null;
  status: LineStatus; attempts: number; serverErrors: number; retryAt: number | null; error: string | null;
  ocr: OcrResult | null; edits: Partial<WineDraft>;
  destination: Destination; quantity: number; price: number | null; estimatedPrice: number | null;
  rating: number | null; comment: string;
  matchWineId: string | null; forceNew: boolean;
}

export interface DraftMeta { batchId: string; occasion: string }

export type ReadOutcome =
  | { kind: 'ok'; ocr: OcrResult }
  | { kind: 'network' }
  | { kind: 'http'; status: number; retryAfter?: number | null; message?: string };

const BASE_DELAY = 30_000;
const MAX_DELAY = 5 * 60_000;
const MAX_SERVER_ERRORS = 5;
const backoff = (attempts: number) => Math.min(MAX_DELAY, BASE_DELAY * 2 ** attempts);

export const newLine = (id: string, photo: string | null, now: number): DraftLine => ({
  id, createdAt: now, photo, status: photo ? 'PENDING' : 'REVIEW', attempts: 0, serverErrors: 0, retryAt: null, error: null,
  ocr: null, edits: {}, destination: 'CELLAR', quantity: 1, price: null, estimatedPrice: null, rating: null, comment: '',
  matchWineId: null, forceNew: false,
});

export const fromOcr = (ocr: OcrResult | null): WineDraft => ({
  name: ocr?.name || '', producer: ocr?.producer || '', vintage: ocr?.vintage ?? null, type: ocr?.type ?? null,
  cuvee: ocr?.cuvee || '', appellation: ocr?.appellation || '', region: ocr?.region || '', country: ocr?.country || '',
  grapeVarieties: ocr?.grape_varieties || [], format: ocr?.format || '',
});

/** Vin de la ligne : la lecture, corrigée par les saisies de l'utilisateur. */
export const wineOf = (line: DraftLine): WineDraft => ({ ...fromOcr(line.ocr), ...line.edits });

export const markReading = (line: DraftLine): DraftLine => ({ ...line, status: 'READING' });

export const nextState = (line: DraftLine, outcome: ReadOutcome, now: number): DraftLine => {
  if (outcome.kind === 'ok') {
    const o = outcome.ocr;
    const sure = o.confidence !== 'LOW' && Boolean(o.name || o.producer);
    return { ...line, ocr: o, status: sure ? 'READY' : 'REVIEW', retryAt: null, error: null, serverErrors: 0 };
  }
  if (outcome.kind === 'network') {
    return { ...line, status: 'PENDING', attempts: line.attempts + 1, retryAt: now + backoff(line.attempts), error: null };
  }
  if (outcome.status === 429) {
    return { ...line, status: 'PENDING', retryAt: now + (outcome.retryAfter ?? 60) * 1000, error: null };
  }
  if (outcome.status >= 500) {
    const serverErrors = line.serverErrors + 1;
    if (serverErrors >= MAX_SERVER_ERRORS) {
      return { ...line, status: 'FAILED', serverErrors, retryAt: null, error: 'Lecture impossible pour le moment' };
    }
    return { ...line, status: 'PENDING', serverErrors, attempts: line.attempts + 1, retryAt: now + backoff(line.attempts), error: null };
  }
  return { ...line, status: 'FAILED', retryAt: null, error: outcome.message || `Erreur ${outcome.status}` };
};

const waiting = (l: DraftLine) => l.status === 'PENDING' && !!l.photo;

/** Prochaine photo à lire : la plus ancienne en attente dont l'échéance est passée. */
export const pickNext = (lines: DraftLine[], now: number): DraftLine | null =>
  lines.filter(l => waiting(l) && (l.retryAt == null || l.retryAt <= now)).sort((a, b) => a.createdAt - b.createdAt)[0] || null;

/** Prochaine échéance de réessai (pour programmer un réveil), ou null. */
export const nextWakeUp = (lines: DraftLine[], now: number): number | null => {
  const times = lines.filter(l => waiting(l) && l.retryAt != null && l.retryAt > now).map(l => l.retryAt as number);
  return times.length ? Math.min(...times) : null;
};

export const withNewPhoto = (line: DraftLine, photo: string): DraftLine =>
  ({ ...line, photo, status: 'PENDING', attempts: 0, serverErrors: 0, retryAt: null, error: null, ocr: null });

/** « Saisir le texte » : on abandonne la photo, la ligne est remplie à la main. */
export const toManual = (line: DraftLine): DraftLine => ({ ...line, photo: null, status: 'REVIEW', retryAt: null, error: null });

export const confirmLine = (line: DraftLine): DraftLine => (line.status === 'REVIEW' ? { ...line, status: 'READY' } : line);

/** Ce qui empêche d'enregistrer la ligne, ou null. */
export const lineProblem = (line: DraftLine): string | null => {
  if (line.status === 'PENDING' || line.status === 'READING') return 'Lecture en attente';
  if (line.status === 'FAILED') return 'Lecture impossible';
  if (line.status === 'REVIEW') return 'À vérifier';
  if (!wineOf(line).name.trim()) return 'Nom manquant';
  if (line.destination === 'CELLAR' && !(Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99)) return 'Quantité invalide';
  if (line.destination === 'TASTING' && !(line.rating != null && line.rating >= 1 && line.rating <= 5)) return 'Note manquante';
  return null;
};

export const summarize = (lines: DraftLine[]) => {
  const s = { lines: lines.length, cellar: 0, bottles: 0, wishlist: 0, tastings: 0, blocking: 0 };
  for (const l of lines) {
    if (lineProblem(l)) s.blocking += 1;
    if (l.destination === 'CELLAR') { s.cellar += 1; s.bottles += l.quantity; }
    else if (l.destination === 'WISHLIST') s.wishlist += 1;
    else s.tastings += 1;
  }
  return s;
};

const opt = (s: string) => s.trim() || undefined;

/** Corps de POST /api/quick-add (les champs undefined disparaissent au JSON). */
export const buildPayload = (meta: DraftMeta, lines: DraftLine[]) => ({
  batchId: meta.batchId,
  occasion: opt(meta.occasion),
  lines: lines.map(l => {
    const w = wineOf(l);
    const wine = {
      name: w.name.trim(), producer: opt(w.producer), vintage: w.vintage ?? undefined, type: w.type ?? undefined,
      cuvee: opt(w.cuvee), appellation: opt(w.appellation), region: opt(w.region), country: opt(w.country),
      grapeVarieties: w.grapeVarieties.length ? w.grapeVarieties : undefined, format: opt(w.format),
    };
    const base = {
      clientId: l.id, destination: l.destination, wine,
      matchWineId: l.forceNew ? undefined : (l.matchWineId ?? undefined),
      forceNew: l.forceNew || undefined,
    };
    if (l.destination === 'CELLAR') return { ...base, quantity: l.quantity, price: l.price ?? undefined };
    if (l.destination === 'WISHLIST') return { ...base, matchWineId: undefined, estimatedPrice: l.estimatedPrice ?? undefined };
    return { ...base, rating: l.rating ?? undefined, comment: opt(l.comment) };
  }),
});

/**
 * Résultat d'une lecture, appliqué seulement si la ligne attend toujours cette
 * lecture-là : une photo reprise ou une saisie manuelle entre-temps l'emporte.
 */
export const applyReadResult = (current: DraftLine, read: DraftLine, outcome: ReadOutcome, now: number): DraftLine | null => {
  if (current.status !== 'READING' || current.photo !== read.photo) return null;
  return nextState(current, outcome, now);
};

/** Lignes restantes après un enregistrement : seules celles envoyées et enregistrées disparaissent. */
export const afterSave = (lines: DraftLine[], result: { lines: { clientId: string }[] }): DraftLine[] => {
  const saved = new Set(result.lines.map(l => l.clientId));
  return lines.filter(l => !saved.has(l.id));
};

const IDENTITY_FIELDS: (keyof WineDraft)[] = ['name', 'producer', 'vintage'];

/** Correction du vin d'une ligne ; si le nom, le producteur ou le millésime change, le rapprochement est refait. */
export const editWine = (line: DraftLine, patch: Partial<WineDraft>, wines: CellarWine[]): DraftLine => {
  const updated = { ...line, edits: { ...line.edits, ...patch } };
  if (line.forceNew || !IDENTITY_FIELDS.some(f => f in patch)) return updated;
  return { ...updated, matchWineId: autoMatch(wines, wineOf(updated))?.id ?? null };
};

/** Lignes lues sans rapprochement (cave pas encore chargée) qui trouvent maintenant leur vin. */
export const rematch = (lines: DraftLine[], wines: CellarWine[]): DraftLine[] =>
  lines
    .filter(l => (l.status === 'READY' || l.status === 'REVIEW') && !l.matchWineId && !l.forceNew)
    .map(l => ({ l, match: autoMatch(wines, wineOf(l)) }))
    .filter(({ match }) => match)
    .map(({ l, match }) => ({ ...l, matchWineId: match!.id }));

/** Une seule lecture à la fois, toujours libérée (même si l'enregistrement local échoue). */
export const makeRunner = () => {
  let busy = false;
  return {
    get busy() { return busy; },
    async run(task: () => Promise<void>): Promise<boolean> {
      if (busy) return false;
      busy = true;
      try {
        await task();
      } finally {
        busy = false;
      }
      return true;
    },
  };
};
