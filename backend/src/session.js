import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';

export async function createSession(type, id, device, req) {
  const dev = device === 'mobile' ? 'mobile' : 'desktop';
  const s = await db.one('insert into sessions(actor_type,actor_id,device,ip,user_agent) values($1,$2,$3,$4,$5) returning id',
    [type, id, dev, (req.ip || '').slice(0, 45), String(req.headers['user-agent'] || '').slice(0, 255)]);
  const token = jwt.sign({ sid: s.id, t: type, id }, config.jwtSecret, { expiresIn: config.session[dev].absolute });
  return { token, sid: s.id, device: dev };
}
/** Returns the live session row for a token, or null (bad signature, revoked, idle too long, too old). Touches last_seen. */
export async function verifyToken(token) {
  let p; try { p = jwt.verify(token, config.jwtSecret); } catch { return null; }
  const s = await db.one('select * from sessions where id=$1 and revoked=false', [p.sid]);
  if (!s || s.actor_type !== p.t || s.actor_id !== p.id) return null;
  const pol = config.session[s.device] || config.session.desktop, now = Date.now();
  if (now - new Date(s.last_seen).getTime() > pol.idle * 1000 || now - new Date(s.created_at).getTime() > pol.absolute * 1000) {
    await db.q('update sessions set revoked=true where id=$1', [s.id]); return null;
  }
  if (now - new Date(s.last_seen).getTime() > 30000) await db.q('update sessions set last_seen=now() where id=$1', [s.id]);
  return s;
}
export const revokeSession = (sid) => db.q('update sessions set revoked=true where id=$1', [sid]);
export const revokeActorSessions = (type, id, exceptSid = null) => db.q('update sessions set revoked=true where actor_type=$1 and actor_id=$2 and ($3::uuid is null or id<>$3)', [type, id, exceptSid]);
