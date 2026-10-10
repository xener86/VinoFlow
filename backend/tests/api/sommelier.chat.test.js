import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
vi.mock('../../src/sommelier/chat.js', async (orig) => ({ ...(await orig()), answerQuestion: vi.fn() }));
const { answerQuestion } = await import('../../src/sommelier/chat.js');
const { hasDb, resetData, bootstrapUser, authed, api, pool, PASSWORD } = await import('./helpers.js');

const pairing = { picks: { safe: null, personal: null, creative: null, global_advice: '', alternatives: [] }, criteria: { rationale: 'r' }, cave_size: 0, candidates: [] };

describe.skipIf(!hasDb)('discussion avec le sommelier', () => {
  let me;
  beforeEach(async () => {
    await resetData();
    me = authed((await bootstrapUser()).access_token);
    answerQuestion.mockReset().mockResolvedValue({ reply: 'Bonne idée.', wineIds: [], revisedDish: null, engine: 'claude' });
  });

  it('crée la conversation au premier message puis l’allonge', async () => {
    const r1 = await me.post('/api/sommelier/chat', { dish: 'Huîtres', pairing, message: 'Pourquoi ?' });
    expect(r1.status).toBe(200);
    expect(r1.body.message).toMatchObject({ role: 'assistant', content: 'Bonne idée.', wineIds: [], revisedDish: null, engine: 'claude' });
    const id = r1.body.conversationId;
    expect(answerQuestion).toHaveBeenCalledWith(expect.objectContaining({ dish: 'Huîtres', question: 'Pourquoi ?', messages: [], inventory: expect.any(Array), pairing: expect.objectContaining({ rationale: 'r' }) }));

    const r2 = await me.post('/api/sommelier/chat', { conversationId: id, message: 'Et un blanc ?' });
    expect(r2.status).toBe(200);
    expect(r2.body.conversationId).toBe(id);
    expect(answerQuestion).toHaveBeenLastCalledWith(expect.objectContaining({
      dish: 'Huîtres', question: 'Et un blanc ?',
      messages: [expect.objectContaining({ role: 'user', content: 'Pourquoi ?' }), expect.objectContaining({ role: 'assistant', content: 'Bonne idée.' })],
    }));

    const get = await me.get(`/api/sommelier/conversations/${id}`);
    expect(get.status).toBe(200);
    expect(get.body.dish).toBe('Huîtres');
    expect(get.body.pairing).toEqual({ picks: pairing.picks, rationale: 'r', cave_size: 0 });
    expect(get.body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

    const list = await me.get('/api/sommelier/conversations');
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.conversations[0]).toMatchObject({ id, dish: 'Huîtres', messageCount: 4, lastMessage: 'Bonne idée.' });
  });

  it('refuse un message vide, trop long, ou sans plat, sans appel IA', async () => {
    expect((await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: '  ' })).status).toBe(400);
    expect((await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: 'a'.repeat(2001) })).status).toBe(400);
    expect((await me.post('/api/sommelier/chat', { message: 'bonjour' })).status).toBe(400);
    expect((await me.post('/api/sommelier/chat', { conversationId: 'pas-un-uuid', message: 'bonjour' })).status).toBe(404);
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it('échec du moteur : rien d’enregistré, 502', async () => {
    answerQuestion.mockRejectedValue(new Error('boom'));
    const r = await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: 'q' });
    expect(r.status).toBe(502);
    expect((await me.get('/api/sommelier/conversations')).body.conversations).toEqual([]);
  });

  it('la conversation d’un autre compte est introuvable ; suppression', async () => {
    const id = (await me.post('/api/sommelier/chat', { dish: 'x', pairing, message: 'q' })).body.conversationId;
    // ALLOW_SIGNUP=false en test : second compte inséré directement, puis connecté.
    await pool.query('INSERT INTO users (email, password_hash, password_changed_at) VALUES ($1, $2, now())', ['autre@test.fr', await bcrypt.hash(PASSWORD, 4)]);
    const login = await api().post('/api/auth/login').send({ email: 'autre@test.fr', password: PASSWORD });
    expect(login.status).toBe(200);
    const other = authed(login.body.access_token);
    expect((await other.get(`/api/sommelier/conversations/${id}`)).status).toBe(404);
    expect((await other.post('/api/sommelier/chat', { conversationId: id, message: 'q' })).status).toBe(404);
    expect((await other.delete(`/api/sommelier/conversations/${id}`)).status).toBe(404);
    expect((await me.delete(`/api/sommelier/conversations/${id}`)).status).toBe(204);
    expect((await me.get(`/api/sommelier/conversations/${id}`)).status).toBe(404);
  });
});
