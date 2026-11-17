import { db, tx } from '../db.js';
import { config, REACTIONS } from '../config.js';
import { HttpError, bad, str, int, validDate, person } from '../util.js';
import { logAction } from '../log.js';
import { logDelete, tFlag, trashRestore, trashMarkRestored } from '../trash.js';
import { notify, emitData, allStudents, allTeachers } from '../realtime.js';
import { cleanBlocks, plain, slugify, articleView } from '../pub.js';
import { imgBase } from '../storage.js';

export const ok = (req, res, extra = {}) => res.json({ ok: true, ...extra, ...(req.undo ? { undo: req.undo } : {}) });
export const pageOf = (req, per = 25) => { const p = Math.max(1, int(req.query.p, 1)); return { p, per, off: (p - 1) * per }; };
export const like = (s) => '%' + String(s).replace(/[\\%_]/g, '\\$&') + '%';
export const yearsMap = () => db.rows('select id,label,start_date,end_date,is_current from school_years order by start_date desc');

/* ===== announcements: detail + actions (shared by admin and teacher) ===== */
export async function annDetail(a) {
  const id = a.id;
  const tg = a.audience === 'all' ? 'All students' : (await db.col("select 'Grade '||sc.grade_level||' - '||sc.name from announcement_targets t join sections sc on sc.id=t.section_id where t.announcement_id=$1 order by sc.grade_level,sc.name", [id])).join(', ');
  const rx = await db.map('select reaction,count(*)::int from announcement_reactions where announcement_id=$1 group by reaction', [id]);
  const cm = await db.rows("select c.id,c.author_type,c.author_id,c.body,c.created_at,case when c.author_type='student' then st.last_name||', '||st.first_name else c.author_name end as author from announcement_comments c left join students st on c.author_type='student' and st.id=c.author_id where c.announcement_id=$1 and c.is_deleted=false order by c.id", [id]);
  return { ...a, sentTo: tg || 'no sections', reactions: rx, comments: cm };
}
/** toggle / delcomment / reply / delete. Returns 'deleted' when the post is gone. */
export async function annAct(req, a, act, body, type, uid, name) {
  const id = a.id;
  if (act === 'toggle') {
    await db.q('update announcements set allow_reactions=$1, allow_comments=$2 where id=$3', [!!body.allow_reactions, !!body.allow_comments, id]);
    await logAction(req, 'announce_settings', 'announcement', id, 'Reactions/comments setting changed'); return 'Settings saved.';
  }
  if (act === 'delcomment') {
    const cid = int(body.cid), cm = await db.one('select id,body from announcement_comments where id=$1 and announcement_id=$2 and is_deleted=false', [cid, id]);
    if (cm) { await logDelete(req, 'comment_removed', 'announcement', id, `Comment #${cid} removed`, 'Comment: ' + cm.body.slice(0, 60), [tFlag('announcement_comments', cid)], 'Comment removed'); await db.q('update announcement_comments set is_deleted=true where id=$1 and announcement_id=$2', [cid, id]); emitData('student', await db.col('select id from students where is_deleted=false'), 'feed'); }
    return 'Comment removed.';
  }
  if (act === 'reply') {
    const b = str(body.body, 500);
    if (!a.allow_comments) throw bad('Comments are turned off for this announcement.');
    if (!b) throw bad('Write a reply first.');
    await db.q('insert into announcement_comments(announcement_id,author_type,author_id,author_name,body) values($1,$2,$3,$4,$5)', [id, type, uid, name.slice(0, 120), b]);
    emitData('student', await db.col('select id from students where is_deleted=false'), 'feed'); return 'Reply posted.';
  }
  if (act === 'delete') {
    await logDelete(req, 'announce_deleted', 'announcement', id, a.title, 'Announcement: ' + a.title.slice(0, 80), [tFlag('announcements', id)], 'Announcement removed from the student feed');
    await db.q('update announcements set is_deleted=true where id=$1', [id]);
    emitData('student', await db.col('select id from students where is_deleted=false'), 'feed'); return 'deleted';
  }
  throw bad('Unknown action.');
}

/* ===== activity log + restore (admin: everything, teacher: only their own) ===== */
export async function logsList(req, scope) {
  const adm = scope === 'admin', tid = req.actor.id, uname = req.actor.uname;
  const f = { u: str(req.query.u, 50), act: str(req.query.act, 40), e: str(req.query.e, 30), from: str(req.query.from, 10), to: str(req.query.to, 10), show: str(req.query.show, 12) };
  const w = ['1=1'], p = [];
  const push = (cond, val) => { p.push(val); w.push(cond.replace('?', '$' + p.length)); };
  if (!adm) { p.push(tid, uname); w.push(`((l.actor_type='teacher' and l.actor_id=$${p.length - 1}) or (l.actor_type is null and l.username=$${p.length}))`); }
  if (adm && f.u) push('l.username ilike ?', like(f.u));
  if (f.act) push('l.action=?', f.act);
  if (f.e) push('l.entity=?', f.e);
  if (validDate(f.from)) push('l.created_at>=?', f.from + 'T00:00:00+08:00');
  if (validDate(f.to)) push('l.created_at<=?', f.to + 'T23:59:59+08:00');
  if (f.show === 'restorable') w.push('t.id is not null and t.restored_at is null'); else if (f.show === 'restored') w.push('t.restored_at is not null');
  const W = w.join(' and '), { p: pg, per, off } = pageOf(req, 50), J = 'from logs l left join trash t on t.log_id=l.id';
  const total = Number(await db.val(`select count(*) ${J} where ${W}`, p));
  const rows = await db.rows(`select l.id,l.username,l.action,l.entity,l.entity_id,l.details,l.ip,l.created_at,t.id trash_id,t.restored_at,t.restored_by,t.label tlabel ${J} where ${W} order by l.id desc limit ${per} offset ${off}`, p);
  const base = adm ? '1=1' : `t.owner_type='teacher' and t.owner_id=${Number(tid)}`;
  const open = Number(await db.val(`select count(*) from trash t where ${base} and t.restored_at is null`));
  const sc = adm ? '' : " and ((l.actor_type='teacher' and l.actor_id=" + Number(tid) + ") or (l.actor_type is null and l.username=" + "'" + uname.replace(/'/g, "''") + "'))";
  const acts = await db.col(`select distinct l.action from logs l where 1=1${sc} order by 1`);
  const ents = await db.col(`select distinct l.entity from logs l where l.entity<>''${sc} order by 1`);
  return { rows, total, page: pg, per, open, actions: acts, entities: ents };
}
export async function logsRestore(req, scope) {
  const [okk, m] = await trashRestore(req, int(req.body.id), scope === 'teacher' ? ['teacher', req.actor.id] : null);
  if (!okk) throw bad(m);
  return m;
}

/* ===== publications: save / delete / reactions (shared) ===== */
export async function pubFind(id, type, uid) {
  const a = await db.one('select * from pub_articles where id=$1 and is_deleted=false', [id]);
  if (!a) return null;
  if (type === 'teacher' && !(a.author_type === 'teacher' && a.author_id === uid)) return null;
  return a;
}
export async function pubSave(req, type, uid, uname) {
  const id = int(req.body.id), old = id ? await pubFind(id, type, uid) : null;
  if (id && !old) throw bad('Article not found.');
  const title = str(req.body.title, 200); let excerpt = str(req.body.excerpt, 300);
  const cover = /^[a-f0-9]{24}\.(jpg|png|gif|webp)$/.test(req.body.cover || '') ? req.body.cover : null;
  const status = req.body.status === 'published' ? 'published' : 'draft';
  const raw = JSON.stringify(req.body.blocks ?? []);
  if (raw.length > 400000) throw bad('This article is too large. Remove some content or images.');
  const blocks = cleanBlocks(req.body.blocks);
  if (!title) throw bad('Give the article a title.');
  if (status === 'published' && !blocks.length) throw bad('Add at least one element (a heading, text box or image) before publishing.');
  if (!excerpt) excerpt = plain(blocks).slice(0, 200);
  const json = JSON.stringify(blocks); let aid = id, newlyPublished = false;
  if (old) {
    const pub = status === 'published' ? (old.published_at || new Date()) : old.published_at;
    await db.q('update pub_articles set title=$1,excerpt=$2,cover=$3,body=$4,status=$5,published_at=$6 where id=$7', [title, excerpt, cover, json, status, pub, id]);
    newlyPublished = status === 'published' && old.status !== 'published';
    await logAction(req, newlyPublished ? 'publish' : 'update', 'publication', id, `${title} [${status}]`);
  } else {
    const r = await db.one('insert into pub_articles(slug,title,excerpt,cover,body,status,author_type,author_id,author_name,published_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id', [slugify(title), title, excerpt, cover, json, status, type, uid, uname.slice(0, 140), status === 'published' ? new Date() : null]);
    aid = r.id; newlyPublished = status === 'published';
    await logAction(req, status === 'published' ? 'publish' : 'create', 'publication', aid, `${title} [${status}]`);
  }
  if (newlyPublished) {
    const [s, t] = await Promise.all([allStudents(), allTeachers()]);
    await notify('student', s, { kind: 'publication', title: 'New publication: ' + title, body: excerpt.slice(0, 140), data: { id: aid } });
    await notify('teacher', t.filter((x) => !(type === 'teacher' && x === uid)), { kind: 'publication', title: 'New publication: ' + title, body: excerpt.slice(0, 140), data: { id: aid } });
    emitData('student', s, 'feed'); emitData('teacher', t, 'publications');
  }
  const a = await db.one('select * from pub_articles where id=$1', [aid]);
  return { id: aid, message: status === 'published' ? 'Published. Anyone with the link can read it now.' : 'Draft saved. It is not visible to the public yet.', article: articleView(a), imgBase: imgBase() };
}
export async function pubDelete(req, id, type, uid) {
  const a = await pubFind(id, type, uid); if (!a) throw bad('Article not found.');
  await logDelete(req, 'delete', 'publication', id, 'Deleted article: ' + a.title, 'Article: ' + a.title, [tFlag('pub_articles', id, { is_deleted: false, deleted_at: null, deleted_by: null })], 'Article deleted: ' + a.title.slice(0, 60));
  await db.q('update pub_articles set is_deleted=true, deleted_at=now(), deleted_by=$1 where id=$2', [String(req.actor.uname).slice(0, 60), id]);
}
export async function pubReactionData(ids, type, uid) {
  ids = [...new Set(ids.map(Number))]; const counts = {}, mine = {};
  if (!ids.length) return { counts, mine };
  for (const x of await db.rows('select article_id,reaction,count(*)::int n from pub_reactions where article_id = any($1::int[]) group by article_id,reaction', [ids])) (counts[x.article_id] ||= {})[x.reaction] = x.n;
  for (const x of await db.rows('select article_id,reaction from pub_reactions where actor_type=$1 and actor_id=$2 and article_id = any($3::int[])', [type, uid, ids])) mine[x.article_id] = x.reaction;
  return { counts, mine };
}
/** Pressing your current reaction again removes it. */
export async function pubReact(type, uid, pid, rx) {
  if (!REACTIONS[rx] || !Number(await db.val("select count(*) from pub_articles where id=$1 and status='published' and is_deleted=false", [pid]))) throw bad('That article is not available.');
  const cur = await db.val('select reaction from pub_reactions where article_id=$1 and actor_type=$2 and actor_id=$3', [pid, type, uid]);
  if (cur === rx) await db.q('delete from pub_reactions where article_id=$1 and actor_type=$2 and actor_id=$3', [pid, type, uid]);
  else await db.q('insert into pub_reactions(article_id,actor_type,actor_id,reaction) values($1,$2,$3,$4) on conflict (article_id,actor_type,actor_id) do update set reaction=excluded.reaction', [pid, type, uid, rx]);
  const { counts, mine } = await pubReactionData([pid], type, uid);
  return { counts: counts[pid] || {}, mine: mine[pid] || null };
}
export const pubCard = (a) => ({ id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, cover: a.cover, author_name: a.author_name, author_type: a.author_type, published_at: a.published_at || a.created_at });
export const pubList = (n, off = 0, excludeId = 0, search = '') => {
  const p = []; let w = "status='published' and is_deleted=false";
  if (excludeId) { p.push(excludeId); w += ` and id<>$${p.length}`; }
  if (search) { p.push(like(search)); w += ` and (title ilike $${p.length} or excerpt ilike $${p.length})`; }
  return db.rows(`select id,slug,title,excerpt,cover,author_name,author_type,published_at,created_at from pub_articles where ${w} order by published_at desc nulls last,id desc limit ${Number(n)} offset ${Number(off)}`, p);
};
export const pubCount = (search = '') => db.val(`select count(*) from pub_articles where status='published' and is_deleted=false${search ? ' and (title ilike $1 or excerpt ilike $1)' : ''}`, search ? [like(search)] : []).then(Number);
