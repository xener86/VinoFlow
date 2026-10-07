import { describe, it, expect } from 'vitest';
import { createMemoryStore, normalizeLoaded, openDraftStore } from './quickAddDraft';
import { newLine } from './quickAddQueue';

describe('createMemoryStore', () => {
  it('ajoute, liste dans l’ordre, met à jour, supprime, vide', async () => {
    const s = createMemoryStore();
    await s.put(newLine('b', 'p', 2));
    await s.put(newLine('a', 'p', 1));
    await s.put({ ...newLine('b', 'p', 2), quantity: 6 });
    expect((await s.list()).map((l) => [l.id, l.quantity])).toEqual([['a', 1], ['b', 6]]);
    await s.delete('a');
    expect((await s.list()).map((l) => l.id)).toEqual(['b']);
    await s.putMeta({ batchId: 'B', occasion: 'Salon' });
    expect(await s.getMeta()).toEqual({ batchId: 'B', occasion: 'Salon' });
    await s.clear();
    expect(await s.list()).toEqual([]);
    expect(await s.getMeta()).toBeNull();
  });

  it('copie les objets (comme IndexedDB)', async () => {
    const s = createMemoryStore();
    const l = newLine('a', 'p', 1);
    await s.put(l);
    l.quantity = 9;
    expect((await s.list())[0].quantity).toBe(1);
  });
});

describe('normalizeLoaded', () => {
  it('une lecture interrompue (app fermée) repart en attente', () => {
    const out = normalizeLoaded([{ ...newLine('b', 'p', 2), status: 'READING' }, newLine('a', 'p', 1)]);
    expect(out.map((l) => [l.id, l.status])).toEqual([['a', 'PENDING'], ['b', 'PENDING']]);
  });
});

describe('openDraftStore', () => {
  it('sans IndexedDB (navigation privée, Node) : stockage en mémoire', async () => {
    expect((await openDraftStore()).kind).toBe('memory');
  });
});
