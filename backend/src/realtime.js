import { WebSocketServer } from 'ws';
import { db } from './db.js';
import { verifyToken } from './session.js';

/* Realtime hub. Every signed-in app opens one WebSocket (/ws) and authenticates with its session token.
 *  - {type:'notification', n}  a push notification (also saved in the `notifications` table, so a device that was offline can catch up)
 *  - {type:'data', topic}      "something changed": open screens reload themselves
 * This replaces Firebase: the Android app keeps this socket alive from a foreground service and shows the notification itself. */
const clients = new Map(); // "type:id" -> Set<ws>
const key = (t, i) => t + ':' + i;

function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function push(type, id, o) { for (const ws of clients.get(key(type, id)) || []) send(ws, o); }

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  wss.on('connection', (ws) => {
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    const timer = setTimeout(() => ws.close(4001, 'auth timeout'), 8000);
    ws.on('message', async (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.type === 'auth' && !ws.sid) {
        const s = await verifyToken(String(m.token || '')).catch(() => null);
        if (!s) { send(ws, { type: 'error', code: 'AUTH' }); return ws.close(4003, 'auth'); }
        clearTimeout(timer);
        ws.sid = s.id; ws.k = key(s.actor_type, s.actor_id);
        if (!clients.has(ws.k)) clients.set(ws.k, new Set());
        clients.get(ws.k).add(ws);
        const unread = Number(await db.val('select count(*) from notifications where recipient_type=$1 and recipient_id=$2 and read_at is null', [s.actor_type, s.actor_id]));
        send(ws, { type: 'ready', unread });
      } else if (m.type === 'ping') send(ws, { type: 'pong' });
    });
    ws.on('close', () => { clearTimeout(timer); if (ws.k) { const set = clients.get(ws.k); set?.delete(ws); if (set && !set.size) clients.delete(ws.k); } });
    ws.on('error', () => {});
  });
  // Keeps proxies (Render) from closing idle sockets and drops dead ones.
  setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch { /* ignore */ } } }, 25000).unref();
  return wss;
}
export function closeSession(sid) { for (const set of clients.values()) for (const ws of set) if (ws.sid === sid) ws.close(4003, 'signed out'); }
export const onlineCount = () => clients.size;

/** Save a notification for each recipient and push it live. recipients = [{type,id}] or ids with a type. */
export async function notify(type, ids, { kind, title, body = '', data = {} }, dbx = db) {
  ids = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!ids.length) return;
  try {
    const rows = await dbx.rows(
      'insert into notifications(recipient_type,recipient_id,kind,title,body,data) select $1, x, $2, $3, $4, $5::jsonb from unnest($6::int[]) x returning id, recipient_id, created_at',
      [type, kind, String(title).slice(0, 160), String(body).slice(0, 500), JSON.stringify(data), ids]);
    for (const r of rows) push(type, r.recipient_id, { type: 'notification', n: { id: r.id, kind, title, body, data, created_at: r.created_at } });
  } catch (e) { console.error('notify failed', e.message); }
}
/** Tell open screens to reload a topic (grades, feed, attendance, schedule, people, ...). */
export function emitData(type, ids, topic) { for (const id of new Set(ids || [])) push(type, id, { type: 'data', topic }); }

// ---- who to tell ----
export const studentsInSections = (secIds) => secIds.length ? db.col("select id from students where section_id = any($1::int[]) and is_deleted=false and status='enrolled' and portal_hash is not null", [secIds]) : [];
export const allStudents = () => db.col("select id from students where is_deleted=false and status in ('enrolled','dropped') and portal_hash is not null");
export const allTeachers = () => db.col("select id from teachers where is_deleted=false and status='active' and portal_hash is not null");
export const staffUsers = () => db.col('select id from users where active=true');
