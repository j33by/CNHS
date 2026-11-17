import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const url = process.env.DATABASE_URL; if (!url) { console.error('Set DATABASE_URL first.'); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false } });
await c.connect();
await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
const done = new Set((await c.query('select name from schema_migrations')).rows.map((r) => r.name));
for (const f of fs.readdirSync('migrations').filter((x) => x.endsWith('.sql')).sort()) {
  const name = f.replace('.sql', ''); if (done.has(name)) { console.log('skip', name); continue; }
  console.log('apply', name); await c.query('begin'); try { await c.query(fs.readFileSync(path.join('migrations', f), 'utf8')); await c.query('insert into schema_migrations(name) values($1) on conflict do nothing', [name]); await c.query('commit'); } catch (e) { await c.query('rollback'); console.error(e.message); process.exit(1); }
}
await c.end(); console.log('Database is up to date.');
