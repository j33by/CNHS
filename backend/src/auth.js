import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { db } from './db.js';
import { config, ROLES, ROLE_MODULES } from './config.js';
import { HttpError, wrap, str, strongPw, studentPwProblem, bad } from './util.js';
import { normStudentNo, normTeacherNo } from './ids.js';
import { createSession, verifyToken, revokeSession, revokeActorSessions } from './session.js';
import { logAction } from './log.js';
import { closeSession } from './realtime.js';
import crypto from 'node:crypto';

const DUMMY = bcrypt.hashSync('not-a-real-password', 10);
/** Real hash or a dummy one, so "unknown ID" and "wrong password" take the same time. */
export async function checkPassword(pw, hash) { const ok = await bcrypt.compare(pw, hash || DUMMY); return ok && !!hash; }
export const hashPw = (pw) => bcrypt.hash(pw, 11);

// 3 limits over 15 minutes: per address, per account, per address+account.
async function throttle(req, key) {
  if (Math.random() < 0.04) await db.q("delete from login_attempts where created_at < now() - interval '1 day'");
  const w = "created_at > now() - interval '15 minutes'", ip = req.ip || '';
  const [a, b, c] = await Promise.all([
    db.val(`select count(*) from login_attempts where ip=$1 and ${w}`, [ip]),
    db.val(`select count(*) from login_attempts where username=$1 and ${w}`, [key]),
    db.val(`select count(*) from login_attempts where ip=$1 and username=$2 and ${w}`, [ip, key]),
  ]);
  return (Number(a) >= 20 || Number(b) >= 12 || Number(c) >= 5) ? 'Too many failed attempts. Please wait 15 minutes and try again.' : null;
}
const throttleFail = async (req, key) => { await db.q('insert into login_attempts(ip,username) values($1,$2)', [req.ip || '', key]); await new Promise((r) => setTimeout(r, 250 + Math.random() * 300)); };

export const can = (role, mod) => { const a = ROLE_MODULES[role] || []; return a.includes('*') || a.includes(mod); };
/** A minimal request-like object for logging (spreading a real request would lose req.ip). */
const lreq = (req, actor) => ({ ip: req.ip, headers: req.headers, actor });

/** Guard: signed-in actor of one type. opts.module = admin module name, opts.pwPage = allowed while a temporary password is still set. */
export function auth(type, opts = {}) {
  return wrap(async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const s = m && await verifyToken(m[1]);
    if (!s) throw new HttpError(401, 'Your session ended. Please sign in again.', { code: 'SESSION_EXPIRED' });
    if (s.actor_type !== type) throw new HttpError(403, 'This account cannot use that part of the system.');
    let row, actor;
    if (type === 'admin') {
      row = await db.one('select id,username,full_name,role from users where id=$1 and active=true', [s.actor_id]);
      if (row) actor = { type, id: row.id, role: row.role, uname: row.username, name: row.full_name };
    } else if (type === 'teacher') {
      row = await db.one("select * from teachers where id=$1 and is_deleted=false and status='active'", [s.actor_id]);
      if (row && row.portal_hash) actor = { type, id: row.id, uname: 'Teacher ' + row.teacher_no, name: row.first_name + ' ' + row.last_name };
    } else {
      row = await db.one('select * from students where id=$1 and is_deleted=false', [s.actor_id]);
      if (row && row.portal_hash && row.student_no) actor = { type, id: row.id, uname: 'Student ' + row.student_no, name: row.first_name + ' ' + row.last_name };
    }
    if (!actor) { await revokeSession(s.id); throw new HttpError(401, 'Your session ended. Please sign in again.', { code: 'SESSION_EXPIRED' }); }
    if (opts.module && !can(actor.role, opts.module)) throw new HttpError(403, 'Your role does not have access to this module.');
    if (type !== 'admin' && row.portal_must_change && !opts.pwPage) throw new HttpError(403, 'Set your own password to continue.', { code: 'MUST_CHANGE' });
    req.actor = actor; req.me = row; req.sid = s.id; req.device = s.device;
    next();
  });
}
export const needModule = (mod) => (req, res, next) => (can(req.actor.role, mod) ? next() : next(new HttpError(403, 'Your role does not have access to this module.')));

export const authRouter = Router();
authRouter.post('/login', wrap(async (req, res) => {
  const role = str(req.body.role, 10), raw = str(req.body.id, 50), pw = String(req.body.password || ''), device = req.body.device === 'mobile' ? 'mobile' : 'desktop';
  if (!['admin', 'teacher', 'student'].includes(role)) throw bad('Choose how you sign in.');
  let no = null, key;
  if (role === 'admin') key = 'A' + raw.toLowerCase().slice(0, 48);
  else if (role === 'teacher') { no = normTeacherNo(raw); key = no ? 'T' + no : 'T?' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12); }
  else { no = normStudentNo(raw); key = no ? 'S' + no : 'S?' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12); }
  const blocked = await throttle(req, key); if (blocked) throw new HttpError(429, blocked);
  let r = null;
  if (role === 'admin') r = await db.one('select id,pass_hash as h from users where username=$1 and active=true', [raw]);
  else if (role === 'teacher') r = no && await db.one("select id,portal_hash as h from teachers where teacher_no=$1 and is_deleted=false and status='active' and portal_hash is not null", [no]);
  else r = no && await db.one('select id,portal_hash as h from students where student_no=$1 and is_deleted=false and portal_hash is not null', [no]);
  const ok = await checkPassword(pw, r?.h);
  if (r && ok) {
    await db.q('delete from login_attempts where username=$1', [key]);
    const s = await createSession(role, r.id, device, req);
    const fake = lreq(req, { type: role, id: r.id, uname: role === 'admin' ? raw : (role === 'teacher' ? 'Teacher ' : 'Student ') + no });
    if (role === 'admin') await db.q('update users set last_login=now() where id=$1', [r.id]);
    else await db.q(`update ${role === 'teacher' ? 'teachers' : 'students'} set portal_last_login=now() where id=$1`, [r.id]);
    await logAction(fake, role === 'admin' ? 'login' : role + '_login', role === 'admin' ? 'user' : role, r.id);
    return res.json({ ok: true, token: s.token, role, device: s.device });
  }
  await throttleFail(req, key);
  const label = role === 'admin' ? raw : (role === 'teacher' ? 'Teacher ' : 'Student ') + raw.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12);
  await logAction(lreq(req, { uname: label.slice(0, 50) }), role === 'admin' ? 'login_failed' : role + '_login_failed', role === 'admin' ? 'user' : role, null, 'Failed sign-in for "' + label + '"');
  throw new HttpError(401, { admin: 'Username or password is incorrect.', teacher: 'Teacher ID or password is incorrect.', student: 'Student ID or password is incorrect. Ask the registrar if you do not have a password yet.' }[role]);
}));

const anyAuth = wrap(async (req, res, next) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  const s = m && await verifyToken(m[1]);
  if (!s) throw new HttpError(401, 'Your session ended. Please sign in again.', { code: 'SESSION_EXPIRED' });
  req.s = s; next();
});
authRouter.post('/logout', anyAuth, wrap(async (req, res) => { await revokeSession(req.s.id); closeSession(req.s.id); res.json({ ok: true }); }));

authRouter.get('/me', anyAuth, wrap(async (req, res) => {
  const { actor_type: t, actor_id: id } = req.s; let me;
  if (t === 'admin') {
    const u = await db.one('select id,username,full_name,role from users where id=$1 and active=true', [id]);
    if (!u) throw new HttpError(401, 'Your session ended.', { code: 'SESSION_EXPIRED' });
    me = { type: t, id, name: u.full_name, username: u.username, role: u.role, roleLabel: ROLES[u.role], modules: ROLE_MODULES[u.role], mustChange: false };
  } else if (t === 'teacher') {
    const u = await db.one("select * from teachers where id=$1 and is_deleted=false and status='active'", [id]);
    if (!u) throw new HttpError(401, 'Your session ended.', { code: 'SESSION_EXPIRED' });
    const w = await db.val('select count(*) from pub_writers where teacher_id=$1', [id]);
    me = { type: t, id, name: u.first_name + ' ' + u.last_name, firstName: u.first_name, teacherNo: u.teacher_no, mustChange: u.portal_must_change, isWriter: Number(w) > 0 };
  } else {
    const u = await db.one('select * from students where id=$1 and is_deleted=false', [id]);
    if (!u) throw new HttpError(401, 'Your session ended.', { code: 'SESSION_EXPIRED' });
    me = { type: t, id, name: u.first_name + ' ' + u.last_name, firstName: u.first_name, studentNo: u.student_no, gradeLevel: u.grade_level, mustChange: u.portal_must_change, lrn: u.lrn, last_name: u.last_name };
  }
  const unread = Number(await db.val('select count(*) from notifications where recipient_type=$1 and recipient_id=$2 and read_at is null', [t, id]));
  const year = await db.one('select * from school_years order by is_current desc, start_date desc limit 1');
  res.json({ ok: true, me, unread, year });
}));

/** Change own password. Admin: strong password. Teacher: strong password. Student: 10+ chars, letters+numbers, nothing guessable. */
authRouter.post('/password', anyAuth, wrap(async (req, res) => {
  const { actor_type: t, actor_id: id } = req.s, cur = String(req.body.current || ''), n = String(req.body.new || ''), c = String(req.body.confirm || '');
  const tbl = { admin: 'users', teacher: 'teachers', student: 'students' }[t], col = t === 'admin' ? 'pass_hash' : 'portal_hash';
  const u = await db.one(`select * from ${tbl} where id=$1`, [id]);
  if (!(await bcrypt.compare(cur, u[col] || DUMMY)) || !u[col]) throw bad('Current password is incorrect.');
  if (n !== c) throw bad('New passwords do not match.');
  if (t === 'student') { if (n === cur) throw bad('Choose a password different from the current one.'); const why = studentPwProblem(n, u); if (why) throw bad(why); }
  else if (!strongPw(n) || n === cur) throw bad('Use 12+ characters with upper, lower, number and symbol, different from the old one.');
  const h = await hashPw(n);
  await db.q(t === 'admin' ? 'update users set pass_hash=$1 where id=$2' : `update ${tbl} set portal_hash=$1, portal_must_change=false where id=$2`, [h, id]);
  await revokeActorSessions(t, id, req.s.id);
  const uname = t === 'admin' ? u.username : (t === 'teacher' ? 'Teacher ' + u.teacher_no : 'Student ' + u.student_no);
  await logAction(lreq(req, { type: t, id, uname }), t === 'admin' ? 'password' : t + '_password', t === 'admin' ? 'user' : t, id, 'Changed own password');
  res.json({ ok: true, message: 'Password changed.' });
}));

// Notification inbox (all three kinds of user)
export const notifRouter = Router();
notifRouter.use(anyAuth);
notifRouter.get('/', wrap(async (req, res) => {
  const after = Number(req.query.after || 0), { actor_type: t, actor_id: id } = req.s;
  const rows = after
    ? await db.rows('select id,kind,title,body,data,created_at,read_at from notifications where recipient_type=$1 and recipient_id=$2 and id>$3 order by id asc limit 100', [t, id, after])
    : await db.rows('select id,kind,title,body,data,created_at,read_at from notifications where recipient_type=$1 and recipient_id=$2 order by id desc limit 60', [t, id]);
  const unread = Number(await db.val('select count(*) from notifications where recipient_type=$1 and recipient_id=$2 and read_at is null', [t, id]));
  res.json({ ok: true, items: rows, unread });
}));
notifRouter.post('/read', wrap(async (req, res) => {
  const { actor_type: t, actor_id: id } = req.s, ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : null;
  if (ids) await db.q('update notifications set read_at=now() where recipient_type=$1 and recipient_id=$2 and id=any($3::bigint[]) and read_at is null', [t, id, ids]);
  else await db.q('update notifications set read_at=now() where recipient_type=$1 and recipient_id=$2 and read_at is null', [t, id]);
  res.json({ ok: true });
}));
