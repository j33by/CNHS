// Replaces the old setup page: creates the first administrator.  Usage: ADMIN_USER=... ADMIN_NAME="..." ADMIN_PASS=... npm run create-admin
import bcrypt from 'bcryptjs';
import pg from 'pg';
const { ADMIN_USER: u, ADMIN_NAME: n, ADMIN_PASS: p, DATABASE_URL: url } = process.env;
if (!u || !n || !p || !url) { console.error('Set ADMIN_USER, ADMIN_NAME, ADMIN_PASS and DATABASE_URL.'); process.exit(1); }
if (p.length < 12 || !/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) { console.error('Password needs 12+ characters with upper, lower, number and symbol.'); process.exit(1); }
const c = new pg.Client({ connectionString: url, ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false } }); await c.connect();
await c.query("insert into users(username,full_name,pass_hash,role) values($1,$2,$3,'admin')", [u, n, await bcrypt.hash(p, 11)]);
console.log('Administrator created:', u); await c.end();
