import pg from 'pg';
import { config } from './config.js';

// Return dates as plain 'YYYY-MM-DD' strings (no timezone shifting), numerics and bigints as numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

let pool;
export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
      max: 8,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (e) => console.error('pg pool error', e.message));
  }
  return pool;
}
const wrap = (c) => ({
  c,
  async q(sql, p = []) { return (await c.query(sql, p)); },
  async rows(sql, p = []) { return (await c.query(sql, p)).rows; },
  async one(sql, p = []) { return (await c.query(sql, p)).rows[0] || null; },
  async val(sql, p = []) { const r = (await c.query(sql, p)).rows[0]; return r ? Object.values(r)[0] : null; },
  async col(sql, p = []) { return (await c.query(sql, p)).rows.map((r) => Object.values(r)[0]); },
  async map(sql, p = []) { const o = {}; for (const r of (await c.query(sql, p)).rows) { const v = Object.values(r); o[v[0]] = v[1]; } return o; },
});
export const db = wrap({ query: (s, p) => getPool().query(s, p) });
/** Run fn inside a transaction. fn receives a db-like object bound to one connection. */
export async function tx(fn) {
  const c = await getPool().connect();
  try {
    await c.query('begin');
    const r = await fn(wrap(c));
    await c.query('commit');
    return r;
  } catch (e) {
    try { await c.query('rollback'); } catch { /* ignore */ }
    throw e;
  } finally { c.release(); }
}
export const inList = (arr, start = 1) => arr.map((_, i) => '$' + (i + start)).join(',');
