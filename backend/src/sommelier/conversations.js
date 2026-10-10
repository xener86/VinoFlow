// Discussions avec le sommelier : persistance (propres au compte).
import { pool, withTransaction } from '../db.js';

const rowMessage = (r) => ({
  id: r.id,
  role: r.role,
  content: r.content,
  wineIds: Array.isArray(r.wine_ids) ? r.wine_ids : [],
  revisedDish: r.revised_dish ?? null,
  engine: r.engine ?? null,
  createdAt: r.created_at,
});

/** Résumé de l'accord conservé avec la conversation (ce que le navigateur a reçu de /sommelier/pair). */
export const compactPairing = (p) => ({
  picks: p?.picks || { safe: null, personal: null, creative: null, global_advice: '', alternatives: [] },
  rationale: p?.criteria?.rationale || p?.rationale || null,
  cave_size: p?.cave_size ?? null,
});

export const listConversations = async (userId, limit = 20) => {
  const { rows } = await pool.query(`
    SELECT c.id, c.dish, c.updated_at,
           (SELECT count(*)::int FROM sommelier_messages m WHERE m.conversation_id = c.id) AS message_count,
           (SELECT m.content FROM sommelier_messages m WHERE m.conversation_id = c.id ORDER BY m.seq DESC LIMIT 1) AS last_message
      FROM sommelier_conversations c
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC
     LIMIT $2`, [userId, limit]);
  return rows.map((r) => ({
    id: r.id,
    dish: r.dish,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
    lastMessage: r.last_message ? String(r.last_message).slice(0, 160) : null,
  }));
};

export const getConversation = async (userId, id, db = pool) => {
  const c = await db.query('SELECT * FROM sommelier_conversations WHERE id = $1 AND user_id = $2', [id, userId]);
  if (c.rows.length === 0) return null;
  const m = await db.query('SELECT * FROM sommelier_messages WHERE conversation_id = $1 ORDER BY seq', [id]);
  const row = c.rows[0];
  return { id: row.id, dish: row.dish, pairing: row.pairing, createdAt: row.created_at, updatedAt: row.updated_at, messages: m.rows.map(rowMessage) };
};

export const deleteConversation = async (userId, id) =>
  (await pool.query('DELETE FROM sommelier_conversations WHERE id = $1 AND user_id = $2', [id, userId])).rowCount > 0;

/**
 * Un tour : lit la conversation (ou prépare la nouvelle), appelle le moteur
 * HORS transaction (plusieurs secondes : on ne retient pas de connexion du
 * pool), puis enregistre conversation éventuelle + question + réponse en une
 * courte transaction. Rien n'est conservé si `answer` échoue. null si la
 * conversation n'existe pas pour ce compte.
 */
export const runTurn = async ({ userId, conversationId, dish, pairing, message, answer }) => {
  let conv;
  if (conversationId) {
    conv = await getConversation(userId, conversationId);
    if (!conv) return null;
  } else {
    conv = { id: null, dish, pairing: compactPairing(pairing), messages: [] };
  }
  const reply = await answer({ dish: conv.dish, pairing: conv.pairing, messages: conv.messages, question: message });
  return withTransaction(async (db) => {
    let id = conv.id;
    if (!id) {
      const ins = await db.query(
        'INSERT INTO sommelier_conversations (user_id, dish, pairing) VALUES ($1, $2, $3) RETURNING id',
        [userId, conv.dish, JSON.stringify(conv.pairing)]
      );
      id = ins.rows[0].id;
    }
    await db.query('INSERT INTO sommelier_messages (conversation_id, role, content) VALUES ($1, $2, $3)', [id, 'user', message]);
    const saved = await db.query(
      `INSERT INTO sommelier_messages (conversation_id, role, content, wine_ids, revised_dish, engine)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, 'assistant', reply.reply, JSON.stringify(reply.wineIds || []), reply.revisedDish ?? null, reply.engine ?? null]
    );
    await db.query('UPDATE sommelier_conversations SET updated_at = now() WHERE id = $1', [id]);
    return { conversationId: id, message: rowMessage(saved.rows[0]) };
  });
};
