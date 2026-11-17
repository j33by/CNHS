import { Router } from 'express';
import { db } from '../db.js';
import { config, STU_STATUS, REACTIONS } from '../config.js';
import { auth } from '../auth.js';
import { HttpError, bad, wrap, str, int, person } from '../util.js';
import { logAction } from '../log.js';
import { gradeRows, policyFor, classAbsences, standingOf, schedRows, reportCard } from '../domain.js';
import { notify, emitData } from '../realtime.js';
import { ok, pubReactionData, pubReact, pubList } from './common.js';
import { articleView } from '../pub.js';
import { imgBase } from '../storage.js';

export const student = Router();
student.use(auth('student'));
const me = async (req) => db.one('select s.*,sc.name sec,t.first_name tf,t.last_name tl from students s left join sections sc on sc.id=s.section_id and sc.is_deleted=false left join teachers t on t.id=sc.adviser_id where s.id=$1', [req.actor.id]);

student.get('/home', wrap(async (req, res) => {
  const r = await me(req), g = await gradeRows(r.id, r.section_id || null, r.school_year_id, true);
  const year = await db.val('select label from school_years where id=$1', [r.school_year_id]);
  const nc = Number(await db.val("select count(*) from notices where is_deleted=false and audience in ('all','students') and created_at > now() - interval '30 days'"));
  const subjects = r.section_id ? await db.rows('select s.code,s.name,t.first_name,t.last_name from section_subjects ss join subjects s on s.id=ss.subject_id and s.is_deleted=false left join teachers t on t.id=ss.teacher_id where ss.section_id=$1 order by s.name', [r.section_id]) : [];
  res.json({ ok: true, firstName: r.first_name, gradeLevel: r.grade_level, section: r.sec, year, avg: g.avg, noticeCount: nc, status: STU_STATUS[r.status], subjects: subjects.map((x) => ({ code: x.code, name: x.name, teacher: x.last_name ? `${x.last_name}, ${x.first_name}` : '-' })), adviser: r.tl ? `${r.tl}, ${r.tf}` : null,
    notices: await db.rows("select title,created_at from notices where is_deleted=false and audience in ('all','students') order by id desc limit 4") });
}));
student.get('/grades', wrap(async (req, res) => {
  const r = await me(req), yrs = await db.rows('select sy.id,sy.label from school_years sy where sy.id=$1 or sy.id in (select school_year_id from grades where student_id=$2) order by sy.start_date desc', [r.school_year_id, r.id]);
  const yid = yrs.some((y) => y.id === int(req.query.y)) ? int(req.query.y) : r.school_year_id, released = await db.col('select term from term_release where school_year_id=$1 order by term', [yid]);
  const g = await gradeRows(r.id, yid === r.school_year_id && r.section_id ? r.section_id : null, yid, true);
  res.json({ ok: true, years: yrs, year: yid, name: person(r), released, grades: g, card: req.query.card && released.length ? await reportCard(r.id, yid, true) : null });
}));
student.get('/attendance', wrap(async (req, res) => {
  const r = await me(req), yid = r.school_year_id, c = await db.map('select status,count(*)::int from attendance where student_id=$1 and school_year_id=$2 group by status', [r.id, yid]);
  const tot = Object.values(c).reduce((a, b) => a + b, 0), pres = (c.P || 0) + (c.L || 0) + (c.E || 0);
  const standing = [];
  if (r.section_id) for (const sb of await db.rows('select s.id,s.code,s.name from section_subjects ss join subjects s on s.id=ss.subject_id and s.is_deleted=false where ss.section_id=$1 order by s.name', [r.section_id])) { const pol = await policyFor(r.section_id, sb.id, yid), n = (await classAbsences(r.section_id, sb.id, yid))[r.id] || 0; standing.push({ subject: `${sb.code} ${sb.name}`, n, free: pol.free, standing: standingOf(n, pol.free) }); }
  res.json({ ok: true, counts: { P: c.P || 0, A: c.A || 0, L: c.L || 0, E: c.E || 0 }, rate: tot ? Math.round(pres / tot * 100) : null, recent: await db.rows("select att_date,status,remarks from attendance where student_id=$1 and school_year_id=$2 and status<>'P' order by att_date desc limit 60", [r.id, yid]), standing });
}));
student.get('/schedule', wrap(async (req, res) => { const r = await me(req); res.json({ ok: true, section: r.sec ? `Grade ${r.grade_level} - ${r.sec}` : null, rows: r.section_id ? await schedRows('sch.section_id=$1', [r.section_id]) : [] }); }));
student.get('/profile', wrap(async (req, res) => {
  const r = await me(req);
  res.json({ ok: true, profile: { student_no: r.student_no, lrn: r.lrn, name: person(r), sex: r.sex, birthdate: r.birthdate, address: r.address, grade_level: r.grade_level, section: r.sec, adviser: r.tl ? `${r.tl}, ${r.tf}` : null, guardian_name: r.guardian_name, guardian_contact: r.guardian_contact, emergency_name: r.emergency_name, emergency_relation: r.emergency_relation, emergency_contact: r.emergency_contact, status: STU_STATUS[r.status] } });
}));

/* ----- feed: notices + class notices + announcements + publications ----- */
const FILTERS = ['all', 'admin', 'teacher', 'announcement', 'notice', 'publication'];
student.get('/feed', wrap(async (req, res) => {
  const r = await me(req), sid = r.id; let f = str(req.query.f, 14); if (!FILTERS.includes(f)) f = 'all'; const pg = Math.max(1, int(req.query.p, 1)), per = 12, items = [];
  for (const n of await db.rows("select id,title,body,created_at from notices where is_deleted=false and audience in ('all','students') order by id desc limit 100")) items.push({ kind: 'notice', src: 'admin', by: 'School administration', title: n.title, body: n.body, at: n.created_at, key: 'n' + n.id });
  if (r.section_id) for (const n of await db.rows("select n.id,n.title,n.body,n.created_at,t.first_name||' '||t.last_name nm from class_notices n join teachers t on t.id=n.teacher_id where n.section_id=$1 and n.is_deleted=false order by n.id desc limit 50", [r.section_id])) items.push({ kind: 'notice', src: 'teacher', by: n.nm, title: n.title, body: n.body, at: n.created_at, key: 'c' + n.id });
  const anns = await db.rows("select * from announcements where is_deleted=false and (audience='all' or id in (select announcement_id from announcement_targets where section_id=$1)) order by id desc limit 100", [r.section_id || 0]);
  const ids = anns.map((a) => a.id), rx = {}, mine = {}, cms = {};
  if (ids.length) {
    for (const x of await db.rows('select announcement_id,reaction,count(*)::int n from announcement_reactions where announcement_id = any($1::int[]) group by 1,2', [ids])) (rx[x.announcement_id] ||= {})[x.reaction] = x.n;
    for (const x of await db.rows('select announcement_id,reaction from announcement_reactions where student_id=$1 and announcement_id = any($2::int[])', [sid, ids])) mine[x.announcement_id] = x.reaction;
    for (const x of await db.rows("select c.id,c.announcement_id,c.author_type,c.author_id,c.body,c.created_at,case when c.author_type='student' then st.first_name||' '||st.last_name else c.author_name end author from announcement_comments c left join students st on c.author_type='student' and st.id=c.author_id where c.announcement_id = any($1::int[]) and c.is_deleted=false order by c.id", [ids])) (cms[x.announcement_id] ||= []).push({ id: x.id, author: x.author, author_type: x.author_type, body: x.body, at: x.created_at, own: x.author_type === 'student' && x.author_id === sid });
  }
  for (const a of anns) items.push({ kind: 'announcement', src: a.author_type, by: a.author_name, title: a.title, body: a.body, at: a.created_at, key: 'a' + a.id, aid: a.id, allowReactions: a.allow_reactions, allowComments: a.allow_comments, counts: rx[a.id] || {}, mine: mine[a.id] || null, comments: cms[a.id] || [] });
  const pubs = await pubList(60); const pr = await pubReactionData(pubs.map((p) => p.id), 'student', sid);
  for (const p of pubs) items.push({ kind: 'publication', src: p.author_type, by: p.author_name, title: p.title, body: p.excerpt, at: p.published_at || p.created_at, key: 'p' + p.id, pid: p.id, slug: p.slug, cover: p.cover, counts: pr.counts[p.id] || {}, mine: pr.mine[p.id] || null });
  const shown = items.filter((i) => f === 'all' || (f === 'admin' || f === 'teacher' ? i.src === f : i.kind === f)).sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ ok: true, imgBase: imgBase(), total: shown.length, page: pg, per, items: shown.slice((pg - 1) * per, pg * per) });
}));
async function visibleAnn(req, aid) {
  const r = await me(req), a = await db.one('select * from announcements where id=$1 and is_deleted=false', [aid]);
  if (!a || !(a.audience === 'all' || (r.section_id && Number(await db.val('select count(*) from announcement_targets where announcement_id=$1 and section_id=$2', [aid, r.section_id]))))) throw bad('That post is not available.');
  return a;
}
student.post('/feed/react', wrap(async (req, res) => {
  const aid = int(req.body.aid), rx = str(req.body.reaction, 10), a = await visibleAnn(req, aid);
  if (!a.allow_reactions || !REACTIONS[rx]) throw bad('Reactions are turned off for this post.');
  const cur = await db.val('select reaction from announcement_reactions where announcement_id=$1 and student_id=$2', [aid, req.actor.id]);
  if (cur === rx) await db.q('delete from announcement_reactions where announcement_id=$1 and student_id=$2', [aid, req.actor.id]);
  else await db.q('insert into announcement_reactions(announcement_id,student_id,reaction) values($1,$2,$3) on conflict (announcement_id,student_id) do update set reaction=excluded.reaction', [aid, req.actor.id, rx]);
  const counts = await db.map('select reaction,count(*)::int from announcement_reactions where announcement_id=$1 group by reaction', [aid]);
  emitData(a.author_type, [a.author_id], 'announcements'); ok(req, res, { counts, mine: cur === rx ? null : rx });
}));
student.post('/feed/comment', wrap(async (req, res) => {
  const aid = int(req.body.aid), b = str(req.body.body, 500), a = await visibleAnn(req, aid);
  if (!a.allow_comments) throw bad('Comments are turned off for this post.'); if (!b) throw bad('Write a comment first.');
  if (Number(await db.val("select count(*) from announcement_comments where announcement_id=$1 and author_type='student' and author_id=$2 and is_deleted=false", [aid, req.actor.id])) >= 30) throw bad('You have reached the comment limit for this post.');
  await db.q("insert into announcement_comments(announcement_id,author_type,author_id,body) values($1,'student',$2,$3)", [aid, req.actor.id, b]); await logAction(req, 'comment', 'announcement', aid);
  await notify(a.author_type, [a.author_id], { kind: 'comment', title: `${req.actor.name} commented`, body: `${a.title}: ${b.slice(0, 100)}`, data: { id: aid } }); emitData(a.author_type, [a.author_id], 'announcements');
  ok(req, res, { message: 'Comment posted.' });
}));
student.post('/feed/delcomment', wrap(async (req, res) => { await db.q("update announcement_comments set is_deleted=true where id=$1 and announcement_id=$2 and author_type='student' and author_id=$3", [int(req.body.cid), int(req.body.aid), req.actor.id]); ok(req, res, { message: 'Comment removed.' }); }));
student.post('/pub/react', wrap(async (req, res) => ok(req, res, await pubReact('student', req.actor.id, int(req.body.pid), str(req.body.reaction, 10)))));
student.get('/pub/read/:slug', wrap(async (req, res) => {
  const a = await db.one("select * from pub_articles where slug=$1 and status='published' and is_deleted=false", [str(req.params.slug, 90)]); if (!a) throw new HttpError(404, 'Article not found.');
  const { counts, mine } = await pubReactionData([a.id], 'student', req.actor.id);
  res.json({ ok: true, imgBase: imgBase(), article: articleView(a), counts: counts[a.id] || {}, mine: mine[a.id] || null, more: await pubList(3, 0, a.id) });
}));
