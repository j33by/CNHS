import { admin } from './admin1.js';
import { db, tx } from '../db.js';
import { config, ATT, ROLES } from '../config.js';
import { needModule as M, hashPw, can } from '../auth.js';
import { HttpError, bad, wrap, str, int, uniqInts, validDate, person, tempPw, todayStr, strongPw, sendCsv } from '../util.js';
import { logAction } from '../log.js';
import { allocateId, unnumberedCounts } from '../ids.js';
import { logDelete, tFlag } from '../trash.js';
import { curYear, gradeRows, classStudents, gradesSave, policyFor, classAbsences, standingOf, reportCard, honorLabel, annCreate } from '../domain.js';
import { notify, emitData, allStudents, allTeachers, staffUsers } from '../realtime.js';
import { ok, pageOf, annDetail, annAct, logsList, logsRestore, pubFind, pubSave, pubDelete, pubList, pubCount } from './common.js';
import { articleView, upload, uploadHandler } from '../pub.js';
import { imgBase } from '../storage.js';

/* ---------------- grades ---------------- */
admin.get('/grades', M('grades'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.query.y, cy?.id || 0), sec = int(req.query.sec), sub = int(req.query.sub), term = int(req.query.term);
  const released = await db.col('select term from term_release where school_year_id=$1 order by term', [y]);
  const out = { ok: true, released, year: y };
  if (sec) {
    const s = await db.one('select * from sections where id=$1', [sec]);
    const subs = await db.rows("select s.id,s.code||' - '||s.name n from section_subjects ss join subjects s on s.id=ss.subject_id where ss.section_id=$1 and s.is_deleted=false order by s.name", [sec]);
    out.subjects = subs;
    if (s && subs.length) {
      const sid = subs.some((x) => x.id === sub) ? sub : subs[0].id, tm = term >= 1 && term <= 4 ? term : s.grading_term;
      const g = await db.map('select student_id,grade from grades where subject_id=$1 and school_year_id=$2 and term=$3', [sid, s.school_year_id, tm]);
      out.subject = sid; out.term = tm;
      out.students = (await classStudents(sec)).map((x) => ({ id: x.id, student_no: x.student_no, name: person(x), grade: g[x.id] ?? null }));
    }
  }
  res.json(out);
}));
admin.post('/grades/release', M('grades'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.body.y, cy?.id || 0), t = int(req.body.term), on = !!req.body.on;
  if (t < 1 || t > 4) throw bad('Invalid term.');
  if (on) await db.q('insert into term_release(school_year_id,term) values($1,$2) on conflict do nothing', [y, t]); else await db.q('delete from term_release where school_year_id=$1 and term=$2', [y, t]);
  await logAction(req, on ? 'release_grades' : 'hide_grades', 'school_year', y, `Term ${t}`);
  const studs = await db.col("select id from students where school_year_id=$1 and is_deleted=false and status in ('enrolled','dropped') and portal_hash is not null", [y]);
  if (on) await notify('student', studs, { kind: 'grades', title: `Term ${t} grades are released`, body: 'Open My grades to see them.', data: { term: t } });
  emitData('student', studs, 'grades'); emitData('teacher', await allTeachers(), 'grades');
  ok(req, res, { message: `Term ${t}` + (on ? ' grades are now visible to students.' : ' grades are hidden from students.') });
}));
admin.post('/grades/save', M('grades'), wrap(async (req, res) => {
  const msg = await gradesSave(req, int(req.body.sec), int(req.body.sub), int(req.body.term), req.body.g || {}); ok(req, res, { message: msg });
}));

/* ---------------- attendance (read-only) ---------------- */
admin.get('/attendance', M('attendance'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.query.y, cy?.id || 0), sec = int(req.query.sec), sub = int(req.query.sub);
  let date = str(req.query.date, 10); if (!validDate(date)) date = todayStr();
  let month = str(req.query.month, 7); if (!/^\d{4}-\d{2}$/.test(month)) month = date.slice(0, 7);
  if (!sec) return res.json({ ok: true, date, month });
  const subs = await db.rows("select s.id,s.code||' - '||s.name n from section_subjects ss join subjects s on s.id=ss.subject_id where ss.section_id=$1 order by s.name", [sec]);
  const rows = sub
    ? await db.rows("select s.first_name,s.middle_name,s.last_name,s.suffix,a.status,a.remarks,a.marked_by from students s left join class_attendance a on a.student_id=s.id and a.subject_id=$1 and a.att_date=$2 where s.section_id=$3 and s.is_deleted=false and s.status='enrolled' order by s.last_name,s.first_name", [sub, date, sec])
    : await db.rows("select s.first_name,s.middle_name,s.last_name,s.suffix,a.status,a.remarks,a.marked_by from students s left join attendance a on a.student_id=s.id and a.att_date=$1 where s.section_id=$2 and s.is_deleted=false and s.status='enrolled' order by s.last_name,s.first_name", [date, sec]);
  const watch = []; const stu = Object.fromEntries((await classStudents(sec)).map((x) => [x.id, x]));
  for (const sb of subs) { const pol = await policyFor(sec, sb.id, y); for (const [sid, n] of Object.entries(await classAbsences(sec, sb.id, y))) { const st = standingOf(n, pol.free); if (st !== 'ok' && stu[sid]) watch.push({ student: person(stu[sid]), subject: sb.n.split(' - ')[0], absences: n, free: pol.free, standing: st }); } }
  const from = month + '-01', to = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).toISOString().slice(0, 10);
  const summary = await db.rows("select s.first_name,s.middle_name,s.last_name,s.suffix,count(*) filter (where a.status='P')::int p,count(*) filter (where a.status='A')::int a,count(*) filter (where a.status='L')::int l,count(*) filter (where a.status='E')::int e from students s left join attendance a on a.student_id=s.id and a.att_date between $1 and $2 where s.section_id=$3 and s.is_deleted=false and s.status='enrolled' group by s.id order by s.last_name,s.first_name", [from, to, sec]);
  res.json({ ok: true, date, month, subjects: subs, rows: rows.map((r) => ({ name: person(r), status: r.status, remarks: r.remarks, marked_by: r.marked_by })), watch, summary: summary.map((r) => ({ name: person(r), p: r.p, a: r.a, l: r.l, e: r.e })) });
}));

/* ---------------- reports ---------------- */
admin.get('/reports', M('reports'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.query.y, cy?.id || 0), sec = int(req.query.sec);
  if (!sec) return res.json({ ok: true, list: [] });
  const nsub = Number(await db.val('select count(*) from section_subjects where section_id=$1', [sec])), list = [];
  for (const s of await db.rows("select * from students where section_id=$1 and is_deleted=false and status='enrolled'", [sec])) {
    const g = await gradeRows(s.id, sec, y, false), fins = g.rows.map((x) => x.final).filter((x) => x !== null), complete = nsub > 0 && fins.length === nsub;
    list.push({ id: s.id, name: person(s), avg: g.avg, complete, honor: complete ? honorLabel(g.avg, Math.min(...fins) >= config.PASSING_GRADE) : '' });
  }
  list.sort((a, b) => (b.complete - a.complete) || ((b.avg ?? -1) - (a.avg ?? -1)) || a.name.localeCompare(b.name));
  let rank = 0, prev = null; list.forEach((x, i) => { if (x.complete) { if (x.avg !== prev) rank = i + 1; prev = x.avg; x.rank = rank; } else x.rank = null; });
  res.json({ ok: true, list });
}));
admin.get('/reports/card/:id', M('reports'), wrap(async (req, res) => {
  const cy = await curYear(), c = await reportCard(int(req.params.id), int(req.query.y, cy?.id || 0), false);
  if (!c) throw new HttpError(404, 'Student not found.'); res.json({ ok: true, card: c });
}));
admin.get('/reports/cards', M('reports'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.query.y, cy?.id || 0), cards = [];
  for (const id of await db.col("select id from students where section_id=$1 and is_deleted=false and status='enrolled' order by last_name,first_name", [int(req.query.sec)])) cards.push(await reportCard(id, y, false));
  res.json({ ok: true, cards });
}));
admin.get('/reports/csv/students', M('reports'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.query.y, cy?.id || 0), label = await db.val('select label from school_years where id=$1', [y]);
  const rows = [['Student ID', 'LRN', 'Last name', 'First name', 'Middle name', 'Sex', 'Birthdate', 'Grade', 'Section', 'Status', 'Guardian', 'Guardian contact', 'Address']];
  for (const r of await db.rows('select s.*,sc.name sec from students s left join sections sc on sc.id=s.section_id where s.school_year_id=$1 and s.is_deleted=false order by s.grade_level,sc.name,s.last_name,s.first_name', [y])) rows.push([r.student_no, r.lrn, r.last_name, r.first_name, r.middle_name, r.sex, r.birthdate, r.grade_level, r.sec, r.status, r.guardian_name, r.guardian_contact, r.address]);
  await logAction(req, 'export', 'student', null, 'Student list CSV, S.Y. ' + label); sendCsv(res, `students_${label}.csv`, rows);
}));
admin.get('/reports/csv/grades', M('reports'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.query.y, cy?.id || 0), sec = int(req.query.sec);
  const subs = await db.rows('select s.id,s.code from section_subjects ss join subjects s on s.id=ss.subject_id where ss.section_id=$1 order by s.name', [sec]);
  const head = ['Student ID', 'LRN', 'Student']; for (const c of subs) for (let t = 1; t <= 4; t++) head.push(`${c.code} T${t}`);
  const rows = [head];
  for (const s of await db.rows("select id,lrn,student_no,first_name,middle_name,last_name,suffix from students where section_id=$1 and is_deleted=false and status='enrolled' order by last_name,first_name", [sec])) {
    const g = await gradeRows(s.id, sec, y, false), row = [s.student_no, s.lrn, person(s)];
    for (const c of subs) { const r = g.rows.find((x) => x.subjectId === c.id); for (let t = 1; t <= 4; t++) row.push(r?.t[t] ?? ''); }
    rows.push(row);
  }
  await logAction(req, 'export', 'section', sec, 'Grades CSV'); sendCsv(res, `grades_section_${sec}.csv`, rows);
}));

/* ---------------- notices ---------------- */
const AUD = { all: 'Everyone', students: 'Students', teachers: 'Teachers', staff: 'Staff only' };
admin.get('/notices', M('notices'), wrap(async (req, res) => res.json({ ok: true, audiences: AUD, rows: await db.rows('select n.id,n.title,n.body,n.audience,n.is_public,n.created_at,u.full_name from notices n left join users u on u.id=n.posted_by where n.is_deleted=false order by n.id desc limit 200') })));
admin.post('/notices', M('notices'), wrap(async (req, res) => {
  const id = int(req.body.id), t = str(req.body.title, 160), b = str(req.body.body, 5000), au = str(req.body.audience, 10) || 'all', pub = !!req.body.is_public && au === 'all';
  if (!t || !b || !AUD[au]) throw bad('Title, message and audience are required.');
  let nid = id;
  if (id) await db.q('update notices set title=$1,body=$2,audience=$3,is_public=$4 where id=$5 and is_deleted=false', [t, b, au, pub, id]);
  else nid = (await db.one('insert into notices(title,body,audience,is_public,posted_by) values($1,$2,$3,$4,$5) returning id', [t, b, au, pub, req.actor.id])).id;
  await logAction(req, id ? 'update' : 'create', 'notice', nid, t + (pub ? ' [public]' : ''));
  if (!id) {
    const n = { kind: 'notice', title: t, body: b.slice(0, 140), data: { id: nid } };
    if (au === 'all' || au === 'students') { const s = await allStudents(); await notify('student', s, n); emitData('student', s, 'feed'); }
    if (au === 'all' || au === 'teachers' || au === 'staff') { const tt = await allTeachers(); if (au !== 'staff') { await notify('teacher', tt, n); emitData('teacher', tt, 'notices'); } }
    if (au === 'staff') await notify('admin', (await staffUsers()).filter((x) => x !== req.actor.id), n);
  }
  ok(req, res, { message: 'Notice saved.' });
}));
admin.post('/notices/:id/delete', M('notices'), wrap(async (req, res) => {
  const id = int(req.params.id), n = await db.one('select title from notices where id=$1 and is_deleted=false', [id]);
  if (n) { await logDelete(req, 'delete', 'notice', id, 'Marked as deleted', 'Notice: ' + n.title, [tFlag('notices', id, { is_deleted: false, deleted_at: null })], 'Notice removed: ' + n.title.slice(0, 60)); await db.q('update notices set is_deleted=true, deleted_at=now() where id=$1', [id]); }
  ok(req, res, { message: 'Notice removed.' });
}));

/* ---------------- announcements ---------------- */
admin.get('/announcements', M('announcements'), wrap(async (req, res) => {
  const rows = await db.rows("select a.id,a.title,a.author_name,a.author_type,a.audience_label,a.allow_reactions,a.allow_comments,a.created_at,(select count(*) from announcement_reactions r where r.announcement_id=a.id)::int rx,(select count(*) from announcement_comments c where c.announcement_id=a.id and c.is_deleted=false)::int cm from announcements a where a.is_deleted=false order by a.id desc limit 150");
  res.json({ ok: true, rows });
}));
admin.get('/announcements/:id', M('announcements'), wrap(async (req, res) => {
  const a = await db.one('select * from announcements where id=$1 and is_deleted=false', [int(req.params.id)]); if (!a) throw new HttpError(404, 'Announcement not found.');
  res.json({ ok: true, announcement: await annDetail(a) });
}));
admin.post('/announcements', M('announcements'), wrap(async (req, res) => {
  const t = str(req.body.title, 160), b = str(req.body.body, 5000), mode = req.body.mode === 'selected' ? 'selected' : 'all';
  if (!t || !b) throw bad('Enter a title and a message.');
  let ids = [], label = 'All students';
  if (mode === 'selected') { ids = uniqInts(req.body.section_ids); if (!ids.length) throw bad('Choose at least one section.'); label = ids.length + ' selected section(s)'; }
  const id = await annCreate(req, 'admin', req.actor.id, req.actor.name, t, b, mode === 'all' ? 'all' : 'sections', label, ids, !!req.body.allow_reactions, !!req.body.allow_comments);
  ok(req, res, { id, message: 'Announcement posted.' });
}));
admin.post('/announcements/:id/:act', M('announcements'), wrap(async (req, res) => {
  const a = await db.one('select * from announcements where id=$1 and is_deleted=false', [int(req.params.id)]); if (!a) throw new HttpError(404, 'Announcement not found.');
  const r = await annAct(req, a, req.params.act, req.body, 'admin', req.actor.id, req.actor.name); ok(req, res, { message: r, deleted: r === 'deleted' });
}));

/* ---------------- publications ---------------- */
admin.post('/pub/upload', M('publications'), (req, res, next) => upload(req, res, (e) => (e ? next(new HttpError(400, 'That file is too large (6 MB max).')) : next())), uploadHandler('admin'));
admin.get('/pub/articles', M('publications'), wrap(async (req, res) => {
  const st = str(req.query.st, 10), w = ['is_deleted=false'], p = []; if (['draft', 'published'].includes(st)) { p.push(st); w.push('status=$1'); }
  res.json({ ok: true, imgBase: imgBase(), rows: await db.rows(`select id,slug,title,excerpt,cover,status,author_type,author_name,published_at,updated_at,created_at from pub_articles where ${w.join(' and ')} order by coalesce(published_at,created_at) desc,id desc limit 200`, p) });
}));
admin.get('/pub/articles/:id', M('publications'), wrap(async (req, res) => {
  const a = await pubFind(int(req.params.id), 'admin', req.actor.id); if (!a) throw new HttpError(404, 'Article not found.');
  res.json({ ok: true, article: articleView(a), imgBase: imgBase() });
}));
admin.post('/pub/articles', M('publications'), wrap(async (req, res) => ok(req, res, await pubSave(req, 'admin', req.actor.id, req.actor.name))));
admin.post('/pub/articles/:id/delete', M('publications'), wrap(async (req, res) => { await pubDelete(req, int(req.params.id), 'admin', req.actor.id); ok(req, res, { message: 'Article deleted.' }); }));
admin.get('/pub/writers', M('publications'), wrap(async (req, res) => res.json({ ok: true,
  writers: await db.rows('select teacher_id,teacher_no,full_name,assigned_by,created_at from pub_writers order by full_name'),
  candidates: await db.rows("select id,teacher_no,first_name,last_name from teachers where is_deleted=false and status='active' and id not in (select teacher_id from pub_writers) order by last_name,first_name") })));
admin.post('/pub/writers', M('publications'), wrap(async (req, res) => {
  const t = await db.one("select * from teachers where id=$1 and is_deleted=false and status='active'", [int(req.body.teacher_id)]); if (!t) throw bad('Teacher not found.');
  await db.q('insert into pub_writers(teacher_id,teacher_no,full_name,assigned_by) values($1,$2,$3,$4) on conflict do nothing', [t.id, t.teacher_no, `${t.first_name} ${t.last_name}`, req.actor.uname]);
  await logAction(req, 'create', 'pub_writer', t.id, `${t.first_name} ${t.last_name} can publish`);
  await notify('teacher', [t.id], { kind: 'assignment', title: 'You can now publish articles', body: 'Open Publications in your portal.', data: {} }); emitData('teacher', [t.id], 'classes');
  ok(req, res, { message: 'Writer assigned.' });
}));
admin.post('/pub/writers/:id/delete', M('publications'), wrap(async (req, res) => {
  const id = int(req.params.id), w = await db.one('select * from pub_writers where teacher_id=$1', [id]);
  if (w) { const { created_at, ...row } = w; await logDelete(req, 'delete', 'pub_writer', id, 'Writer removed: ' + w.full_name, 'Faculty writer: ' + w.full_name, [{ t: 'rows', table: 'pub_writers', guard: null, rows: [row] }], 'Writer removed: ' + w.full_name); await db.q('delete from pub_writers where teacher_id=$1', [id]); emitData('teacher', [id], 'classes'); }
  ok(req, res, { message: 'Writer removed.' });
}));

/* ---------------- staff users ---------------- */
admin.get('/users', M('users'), wrap(async (req, res) => res.json({ ok: true, roles: ROLES, rows: await db.rows('select id,username,full_name,role,active,last_login from users order by username') })));
admin.post('/users', M('users'), wrap(async (req, res) => {
  const u = str(req.body.username, 50), n = str(req.body.full_name, 120), ro = str(req.body.role, 12), p = String(req.body.password || '');
  if (!/^[A-Za-z0-9_.-]{4,50}$/.test(u) || !n || !ROLES[ro]) throw bad('Enter a username (4-50 letters, numbers, . _ -), full name and role.');
  if (!strongPw(p)) throw bad('Password needs 12+ characters with upper, lower, number and symbol.');
  if (Number(await db.val('select count(*) from users where username=$1', [u]))) throw bad('Username already exists.');
  const r = await db.one('insert into users(username,full_name,pass_hash,role) values($1,$2,$3,$4) returning id', [u, n, await hashPw(p), ro]);
  await logAction(req, 'create', 'user', r.id, `${u} as ${ro}`); ok(req, res, { message: 'User created.' });
}));
admin.post('/users/:id/update', M('users'), wrap(async (req, res) => {
  const id = int(req.params.id), t = await db.one('select * from users where id=$1', [id]); if (!t) throw new HttpError(404, 'User not found.');
  const ro = str(req.body.role, 12), ac = !!req.body.active;
  if (!ROLES[ro]) throw bad('Invalid role.');
  if (id === req.actor.id && (ro !== 'admin' || !ac)) throw bad('You cannot demote or deactivate your own account.');
  if (t.role === 'admin' && (ro !== 'admin' || !ac) && !Number(await db.val("select count(*) from users where role='admin' and active=true and id<>$1", [id]))) throw bad('At least one active administrator is required.');
  await db.q('update users set role=$1,active=$2 where id=$3', [ro, ac, id]);
  if (!ac) await db.q("update sessions set revoked=true where actor_type='admin' and actor_id=$1", [id]);
  await logAction(req, 'update', 'user', id, `${t.username} role=${ro} active=${ac}`); ok(req, res, { message: 'User updated.' });
}));
admin.post('/users/:id/reset', M('users'), wrap(async (req, res) => {
  const id = int(req.params.id), t = await db.one('select * from users where id=$1', [id]); if (!t) throw new HttpError(404, 'User not found.');
  const pw = tempPw() + '@' + (10 + Math.floor(Math.random() * 90)) + tempPw();
  await db.q('update users set pass_hash=$1 where id=$2', [await hashPw(pw), id]); await db.q("update sessions set revoked=true where actor_type='admin' and actor_id=$1", [id]);
  await logAction(req, 'reset_password', 'user', id, t.username);
  ok(req, res, { cred: { name: t.full_name, label: 'Username', id: t.username, pw, note: 'Shown once. Ask them to change it under Account.' } });
}));

/* ---------------- activity logs + restore ---------------- */
admin.get('/logs', M('logs'), wrap(async (req, res) => res.json({ ok: true, ...(await logsList(req, 'admin')) })));
admin.post('/logs/restore', wrap(async (req, res) => { const m = await logsRestore(req, 'admin'); emitData('admin', [req.actor.id], 'people'); ok(req, res, { message: m }); }));

/* ---------------- ID migration (for records imported from the old system) ---------------- */
admin.get('/migrate', M('migrate'), wrap(async (req, res) => res.json({ ok: true, pending: await unnumberedCounts() })));
admin.post('/migrate', M('migrate'), wrap(async (req, res) => {
  let s = 0, t = 0;
  for (const r of await db.rows('select id,school_year_id from students where student_no is null order by id')) { await allocateId('student', r.school_year_id, async (no, x) => x.q('update students set student_no=$1 where id=$2', [no, r.id])); s++; }
  for (const r of await db.rows("select id,teacher_no from teachers where teacher_no !~ '^T-[0-9]{5}$' order by id")) { await allocateId('teacher', null, async (no, x) => x.q('update teachers set legacy_no=$1, teacher_no=$2 where id=$3', [r.teacher_no, no, r.id])); t++; }
  await logAction(req, 'migrate_ids', 'system', null, `Numbered ${s} student(s) and ${t} teacher(s)`); ok(req, res, { message: `Numbered ${s} student(s) and ${t} teacher(s).` });
}));
