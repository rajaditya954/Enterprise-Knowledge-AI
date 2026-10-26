import pg from 'pg';
import pgvector from 'pgvector/pg';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

pool.on('connect', async (client) => {
  await pgvector.registerType(client);
});

/**
 * Run a single query against the pool.
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug({ query: text.substring(0, 80), duration, rows: result.rowCount }, 'db query');
  return result;
}

/**
 * Acquire a client for transactional work.
 */
export async function getClient() {
  const client = await pool.connect();
  await pgvector.registerType(client);
  return client;
}

/**
 * Run a callback inside a transaction. Auto commits on success, rolls back on error.
 */
export async function withTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gracefully shut down the pool.
 */
export async function closePool() {
  await pool.end();
}

export default pool;
