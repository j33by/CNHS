import { db } from './db.js';

/** Writes one activity-log line. Returns the log id (0 if it could not be written). */
export async function logAction(req, action, entity = '', id = null, details = '', dbx = db) {
  const a = req?.actor || {};
  try {
    const r = await dbx.one(
      'insert into logs(user_id,actor_type,actor_id,username,action,entity,entity_id,details,ip,user_agent) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',
      [a.type === 'admin' ? a.id : null, a.type || null, a.id || null, a.uname || '-', action, entity, id, String(details).slice(0, 1000), (req?.ip || '').slice(0, 45), String(req?.headers?.['user-agent'] || '').slice(0, 255)]);
    return r.id;
  } catch (e) { console.error('log failed', e.message); return 0; }
}
