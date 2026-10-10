import { describe, it, expect, vi, beforeEach } from 'vitest';

// L'appel IA (plusieurs secondes) ne doit pas se faire à l'intérieur de la
// transaction : il ne doit retenir aucune connexion du pool pendant ce temps.
const events = [];
const query = vi.fn(async (sql) => {
  if (/SELECT \* FROM sommelier_conversations/.test(sql)) return { rows: [{ id: 'c1', user_id: 'u1', dish: 'Huîtres', pairing: { picks: {} } }] };
  if (/SELECT \* FROM sommelier_messages/.test(sql)) return { rows: [] };
  if (/INSERT INTO sommelier_messages[\s\S]*RETURNING/.test(sql)) return { rows: [{ id: 'm2', role: 'assistant', content: 'r', wine_ids: ['w1'], revised_dish: null, engine: 'claude', created_at: 'now' }] };
  if (/INSERT INTO sommelier_conversations/.test(sql)) return { rows: [{ id: 'c-new', user_id: 'u1', dish: 'Plat', pairing: { picks: {} } }] };
  return { rows: [], rowCount: 1 };
});
vi.mock('../../src/db.js', () => ({
  pool: { query: (...a) => query(...a) },
  withTransaction: vi.fn(async (fn) => { events.push('tx-begin'); const r = await fn({ query: (...a) => query(...a) }); events.push('tx-end'); return r; }),
}));
const { runTurn } = await import('../../src/sommelier/conversations.js');

beforeEach(() => { events.length = 0; query.mockClear(); });

describe('runTurn', () => {
  it('appelle le moteur avant d’ouvrir la transaction, sur une conversation existante', async () => {
    const answer = vi.fn(async () => { events.push('answer'); return { reply: 'r', wineIds: ['w1'], revisedDish: null, engine: 'claude' }; });
    const r = await runTurn({ userId: 'u1', conversationId: 'c1', message: 'q', answer });
    expect(events).toEqual(['answer', 'tx-begin', 'tx-end']);
    expect(answer).toHaveBeenCalledWith({ dish: 'Huîtres', pairing: { picks: {} }, messages: [], question: 'q' });
    expect(r).toEqual({ conversationId: 'c1', message: expect.objectContaining({ id: 'm2', role: 'assistant', wineIds: ['w1'] }) });
  });

  it('nouvelle conversation : rien n’est écrit si le moteur échoue', async () => {
    const answer = vi.fn(async () => { throw new Error('boom'); });
    await expect(runTurn({ userId: 'u1', dish: 'Plat', pairing: { picks: {} }, message: 'q', answer })).rejects.toThrow('boom');
    expect(events).toEqual([]);
    expect(query.mock.calls.some(([sql]) => /INSERT/.test(sql))).toBe(false);
  });

  it('conversation inconnue → null sans appel du moteur', async () => {
    query.mockImplementationOnce(async () => ({ rows: [] }));
    const answer = vi.fn();
    expect(await runTurn({ userId: 'u1', conversationId: 'zz', message: 'q', answer })).toBeNull();
    expect(answer).not.toHaveBeenCalled();
  });
});
