import { db, tx } from './db.js';
import { logAction } from './log.js';
import { config } from './config.js';

/* Recycle bin behind the Activity logs (port of trash.php). Every delete first stores the exact instructions to put the data back.
 * Three kinds of operation only, on whitelisted tables only:
 *   flag  UPDATE t SET col=value WHERE id=?       (un-hide a soft-deleted record)
 *   rows  INSERT the saved rows back              (a row that was really deleted)
 *   set   UPDATE t SET ... WHERE id IN (...) [AND col IS NULL]   (re-attach: section, adviser, ...) */
const ALLOWED = ['students', 'teachers', 'sections', 'subjects', 'notices', 'schedules', 'section_subjects', 'subject_teachers', 'grades', 'class_attendance', 'record_scores', 'record_columns', 'lesson_logs', 'announcements', 'announcement_comments', 'pub_articles', 'pub_writers'];
export const tFlag = (table, id, set = { is_deleted: false }) => ({ t: 'flag', table, id, set });
export const tRows = (table, rows, guard = null) => ({ t: 'rows', table, guard, rows: rows.map((r) => { const { id, updated_at, created_at, ...rest } = r; return rest; }) });
export const tSet = (table, ids, set, ifnull = '') => ({ t: 'set', table, ids: ids.map(Number), set, ifnull });
const ident = (c) => { if (!/^[a-z][a-z0-9_]{0,40}$/.test(c)) throw new Error('Stored data is not valid.'); return '"' + c + '"'; };

export const owner = (req) => (req.actor.type === 'teacher' ? ['teacher', req.actor.id] : ['admin', req.actor.id || 0]);

/** Strict on purpose: if the restore data cannot be saved, the delete does not happen. */
export async function trashAdd(req, entity, eid, label, ops, dbx = db) {
  const [ot, oid] = owner(req);
  const r = await dbx.one('insert into trash(entity,entity_id,label,payload,owner_type,owner_id,deleted_by) values($1,$2,$3,$4,$5,$6,$7) returning id',
    [entity, eid, String(label).slice(0, 200), JSON.stringify(ops), ot, oid, String(req.actor.uname || '-').slice(0, 60)]);
  return r.id;
}
/** Store restore data + write the log line + queue the Undo notification (req.undo). Call BEFORE running the delete. */
export async function logDelete(req, action, entity, eid, details, label, ops, message, dbx = db) {
  const tid = await trashAdd(req, entity, eid, label, ops, dbx);
  const lid = await logAction(req, action, entity, eid, details, dbx);
  if (lid) await dbx.q('update trash set log_id=$1 where id=$2', [lid, tid]);
  req.undo = { id: tid, message, seconds: config.UNDO_SECONDS };
  return tid;
}
export async function trashMarkRestored(req, entity, eid) {
  try { await db.q('update trash set restored_at=now(), restored_by=$1 where entity=$2 and entity_id=$3 and restored_at is null', [String(req.actor.uname || '-').slice(0, 60), entity, eid]); } catch (e) { console.error(e.message); }
}
async function apply(t, ops) {
  for (const op of ops) {
    if (!ALLOWED.includes(op.table)) throw new Error('Stored data is not valid.');
    const T = ident(op.table);
    if (op.t === 'flag') {
      const keys = Object.keys(op.set || {}); if (!keys.length) continue;
      await t.q(`update ${T} set ${keys.map((k, i) => ident(k) + '=$' + (i + 1)).join(',')} where id=$${keys.length + 1}`, [...keys.map((k) => op.set[k]), Number(op.id)]);
    } else if (op.t === 'rows') {
      for (const row of op.rows || []) {
        if (op.guard === 'schedule') {
          const c = await t.val('select count(*) from schedules where section_id=$1 and day_of_week=$2 and start_time<$3 and end_time>$4', [row.section_id, row.day_of_week, row.end_time, row.start_time]);
          if (Number(c)) throw new Error('Another class now uses that time slot, so this period could not be put back.');
        }
        const keys = Object.keys(row);
        await t.q(`insert into ${T}(${keys.map(ident).join(',')}) values(${keys.map((_, i) => '$' + (i + 1)).join(',')}) on conflict do nothing`, keys.map((k) => row[k]));
      }
    } else if (op.t === 'set') {
      const ids = (op.ids || []).map(Number); if (!ids.length) continue;
      const keys = Object.keys(op.set || {});
      let sql = `update ${T} set ${keys.map((k, i) => ident(k) + '=$' + (i + 1)).join(',')} where id = any($${keys.length + 1}::int[])`;
      if (op.ifnull) sql += ' and ' + ident(op.ifnull) + ' is null';
      await t.q(sql, [...keys.map((k) => op.set[k]), ids]);
    } else throw new Error('Stored data is not valid.');
  }
}
/** ownerScope = ['teacher', id] limits the restore to that teacher's own deletions. null = administrator (anything). */
export async function trashRestore(req, id, ownerScope = null) {
  const t = await db.one('select * from trash where id=$1', [id]);
  if (!t) return [false, 'That item was not found.'];
  if (ownerScope && (t.owner_type !== ownerScope[0] || t.owner_id !== ownerScope[1])) return [false, 'You can only restore items you deleted yourself.'];
  if (t.restored_at) return [false, 'That item has already been restored.'];
  let ops; try { ops = JSON.parse(t.payload); } catch { ops = null; }
  if (!Array.isArray(ops)) return [false, 'The saved data for this item is damaged.'];
  const claimed = await db.q('update trash set restored_at=now(), restored_by=$1 where id=$2 and restored_at is null', [String(req.actor.uname || '-').slice(0, 60), id]);
  if (!claimed.rowCount) return [false, 'That item has already been restored.'];
  try { await tx((x) => apply(x, ops)); }
  catch (e) {
    await db.q('update trash set restored_at=null, restored_by=null where id=$1', [id]);
    const known = /Stored data|Another class/.test(e.message);
    if (!known) console.error(e.message);
    return [false, known ? e.message : 'It could not be restored. Something it depends on may have been removed.'];
  }
  await logAction(req, 'restore', t.entity, t.entity_id, 'Restored from activity log: ' + t.label);
  return [true, 'Restored: ' + t.label];
}
