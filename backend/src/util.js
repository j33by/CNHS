import crypto from 'node:crypto';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (m, extra) => new HttpError(400, m, extra);
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const fmt = (tz, o) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...o });
/** 'YYYY-MM-DD' in the school's time zone. */
export function todayStr(d = new Date()) { return fmt(config.tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
export function dowToday() { const w = new Intl.DateTimeFormat('en-US', { timeZone: config.tz, weekday: 'short' }).format(new Date()); return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(w) + 1; }
export function nowHM() { return new Intl.DateTimeFormat('en-GB', { timeZone: config.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dowOf = (s) => { const d = new Date(s + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
export function validDate(s) { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
export const validPhone = (p) => /^[0-9+\-\s()]{7,20}$/.test(p || '');
/** Trimmed, length-limited string from a request body field. */
export const str = (v, max = 255) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, max);
export const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
export const uniqInts = (a) => [...new Set((Array.isArray(a) ? a : []).map((x) => parseInt(x, 10)).filter(Number.isFinite))];

export function person(r) {
  return String(r.last_name || '').toUpperCase() + ', ' + (r.first_name || '') + (r.middle_name ? ' ' + String(r.middle_name).slice(0, 1) + '.' : '') + (r.suffix ? ' ' + r.suffix : '');
}
export function tempPw() {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let o = '';
  for (let i = 0; i < 12; i++) o += c[crypto.randomInt(0, c.length)];
  return o;
}
const BAD = ['password', 'passw0rd', 'qwerty', 'qwertyuiop', 'letmein', 'welcome', 'admin', 'administrator', 'iloveyou', 'monkey', 'dragon', 'football', 'basketball', 'calape', 'calapenhs', 'cnhs', 'bohol', 'school', 'student', 'teacher', 'abc', 'abcdef', 'changeme', 'default', 'login', 'sunshine', 'princess', 'maganda', 'pilipinas', 'philippines'];
export function commonPw(p) {
  const c = p.replace(/[^a-z0-9]/gi, '').toLowerCase(); const core = c.replace(/^[0-9]+|[0-9]+$/g, '');
  return BAD.includes(c) || BAD.includes(core) || /^(.)\1+$/.test(c) || '0123456789012345678901234567890'.includes(c) || 'abcdefghijklmnopqrstuvwxyz'.includes(c);
}
export const strongPw = (p) => p.length >= 12 && !commonPw(p) && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
export function studentPwProblem(p, r) {
  if (p.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Mix letters and numbers.';
  const l = p.toLowerCase(), digits = p.replace(/\D/g, '');
  if (commonPw(p)) return 'That password is too common. Pick something less guessable.';
  const no = String(r.student_no || '');
  if (no && (digits.includes(no.replace(/\D/g, '').slice(-5)) || l.includes(no.replace('-', '').toLowerCase()))) return 'Do not include your Student ID.';
  if (r.lrn && digits.includes(String(r.lrn))) return 'Do not include your LRN.';
  for (const k of ['first_name', 'last_name']) if (String(r[k] || '').length >= 4 && l.includes(String(r[k]).toLowerCase())) return 'Do not include your name.';
  return null;
}
export const csvCell = (v) => { v = v == null ? '' : String(v); if (v !== '' && '=+-@\t\r'.includes(v[0])) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
export function sendCsv(res, name, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + name.replace(/[^A-Za-z0-9_.-]/g, '_') + '"');
  res.setHeader('Cache-Control', 'no-store');
  res.send('\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}
export const fmtNum = (v) => { const s = Number(v).toFixed(2); return s.replace(/0+$/, '').replace(/\.$/, ''); };
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
