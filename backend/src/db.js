import pg from 'pg';

const { Pool } = pg;

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
