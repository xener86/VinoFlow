import pg from 'pg';

const { Pool, types } = pg;

// NUMERIC (prix, degré d'alcool, notes) : pg le renvoie en chaîne par défaut
// pour ne pas perdre de précision. Nos valeurs tiennent largement dans un
// double, et le front les attend en number (sinon les sommes concatènent).
const NUMERIC_OID = 1700;
types.setTypeParser(NUMERIC_OID, (value) => (value === null ? null : parseFloat(value)));

// TIMESTAMP sans fuseau (journal.date) : le front y écrit des dates ISO en UTC,
// Postgres en garde l'heure UTC. On les relit donc en UTC, et non dans le
// fuseau du process Node (sinon décalage d'une heure ou deux hors de Docker).
const TIMESTAMP_OID = 1114;
types.setTypeParser(TIMESTAMP_OID, (value) => (value === null ? null : new Date(`${value.replace(' ', 'T')}Z`)));

// PostgreSQL connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};
