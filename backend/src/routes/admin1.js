import { Router } from 'express';
import { db, tx } from '../db.js';
import { config, GRADES, STU_STATUS, TCH_STATUS, ATT, DAYS } from '../config.js';
import { auth, needModule, hashPw } from '../auth.js';
import { HttpError, bad, wrap, str, int, uniqInts, validDate, validPhone, person, tempPw, todayStr, addDays } from '../util.js';
import { logAction } from '../log.js';
import { allocateId, unnumberedCounts } from '../ids.js';
import { logDelete, tFlag, tSet, tRows, trashMarkRestored } from '../trash.js';
import { curYear, gradeRows, classStudents, schedRows, gradeLabel } from '../domain.js';
import { notify, emitData } from '../realtime.js';
import { ok, pageOf, like, yearsMap } from './common.js';

export const admin = Router();
admin.use(auth('admin'));
const M = needModule;

/* ---------------- lookups used by pickers ---------------- */
admin.get('/lookups', wrap(async (req, res) => {
  const years = await yearsMap(), cy = await curYear();
  const yid = int(req.query.y, cy?.id || 0);
  res.json({ ok: true, years, currentYearId: cy?.id || 0, grades: GRADES,
    sections: await db.rows('select id,grade_level,name,grading_term from sections where school_year_id=$1 and is_deleted=false order by grade_level,name', [yid]),
    teachers: await db.rows("select id,teacher_no,last_name,first_name from teachers where is_deleted=false and status='active' order by last_name,first_name"),
    pending: await unnumberedCounts() });
}));

/* ---------------- dashboard ---------------- */
admin.get('/dashboard', M('index'), wrap(async (req, res) => {
  const y = await curYear(), yid = y?.id || 0, c = (s, p = []) => db.val(s, p).then(Number);
  const enrolled = await c("select count(*) from students where school_year_id=$1 and is_deleted=false and status='enrolled'", [yid]);
  const noSec = await c("select count(*) from students where school_year_id=$1 and is_deleted=false and status='enrolled' and section_id is null", [yid]);
  const by = await db.rows("select grade_level g,count(*)::int n,count(section_id)::int a,count(*) filter (where status='dropped')::int d from students where school_year_id=$1 and is_deleted=false and status in ('enrolled','dropped') group by grade_level", [yid]);
  const byMap = Object.fromEntries(by.map((r) => [r.g, r]));
  res.json({ ok: true, year: y, enrolled, noSection: noSec,
    teachers: await c("select count(*) from teachers where is_deleted=false and status='active'"),
    sections: await c('select count(*) from sections where school_year_id=$1 and is_deleted=false', [yid]),
    subjects: await c('select count(*) from subjects where is_deleted=false'),
    byGrade: GRADES.map((g) => ({ grade: g, learners: byMap[g]?.n || 0, inSection: byMap[g]?.a || 0, dropped: byMap[g]?.d || 0 })),
    recent: await db.rows('select username,action,entity,created_at from logs order by id desc limit 8'),
    attendanceToday: await db.map('select status,count(*)::int from attendance where att_date=$1 group by status', [todayStr()]),
    pending: await unnumberedCounts() });
}));

/* ---------------- school years ---------------- */
admin.get('/years', M('years'), wrap(async (req, res) => res.json({ ok: true, rows: await yearsMap() })));
admin.post('/years', M('years'), wrap(async (req, res) => {
  const l = str(req.body.label, 20), sd = str(req.body.start_date, 10), ed = str(req.body.end_date, 10);
  if (!/^\d{4}-\d{4}$/.test(l) || !validDate(sd) || !validDate(ed) || ed <= sd) throw bad('Use a label like 2026-2027 and valid dates (end after start).');
  if (Number(await db.val('select count(*) from school_years where label=$1', [l]))) throw bad('That school year already exists.');
  const r = await db.one('insert into school_years(label,start_date,end_date) values($1,$2,$3) returning id', [l, sd, ed]);
  await logAction(req, 'create', 'school_year', r.id, l); ok(req, res, { message: 'School year added.' });
}));
admin.post('/years/:id/current', M('years'), wrap(async (req, res) => {
  const id = int(req.params.id);
  if (!Number(await db.val('select count(*) from school_years where id=$1', [id]))) throw bad('School year not found.');
  await db.q('update school_years set is_current=(id=$1)', [id]); await logAction(req, 'set_current', 'school_year', id);
  ok(req, res, { message: 'Current school year changed.' });
}));
admin.post('/years/promote', M('years'), wrap(async (req, res) => {
  const from = int(req.body.from), to = int(req.body.to), ret = !!req.body.retain;
  const ys = await db.map('select id,start_date from school_years where id in ($1,$2)', [from, to]);
  if (from === to || Object.keys(ys).length !== 2 || ys[to] <= ys[from]) throw bad('Choose two different school years; the target must be later.');
  let pro = 0, rt = 0, gr = 0;
  await tx(async (t) => {
    for (const s of await t.rows("select id,grade_level,section_id from students where school_year_id=$1 and is_deleted=false and status='enrolled'", [from])) {
      let retain = false;
      if (ret) { const g = await gradeRows(s.id, s.section_id || null, from, false, t); retain = g.avg !== null && g.avg < config.PASSING_GRADE; }
      if (s.grade_level === 12 && !retain) { await t.q("update students set status='graduated',status_date=$1,status_reason='Completed Grade 12',section_id=null where id=$2", [todayStr(), s.id]); gr++; }
      else { await t.q('update students set grade_level=$1,school_year_id=$2,section_id=null where id=$3', [retain ? s.grade_level : s.grade_level + 1, to, s.id]); retain ? rt++ : pro++; }
    }
  });
  await logAction(req, 'promote', 'school_year', to, `From #${from}: promoted ${pro}, retained ${rt}, graduated ${gr}`);
  emitData('student', await db.col('select id from students where is_deleted=false'), 'profile');
  ok(req, res, { message: `Year-end promotion done: ${pro} promoted, ${rt} retained, ${gr} graduated. Assign the new sections next.` });
}));

/* ---------------- students ---------------- */
const STU_FIELDS = (b) => ({ lrn: str(b.lrn, 12), first_name: str(b.first_name, 60), middle_name: str(b.middle_name, 60) || null, last_name: str(b.last_name, 60), suffix: str(b.suffix, 10) || null,
  sex: str(b.sex, 1), birthdate: str(b.birthdate, 10), address: str(b.address), grade_level: int(b.grade_level), school_year_id: int(b.school_year_id),
  guardian_name: str(b.guardian_name, 120), guardian_contact: str(b.guardian_contact, 20), emergency_name: str(b.emergency_name, 120), emergency_contact: str(b.emergency_contact, 20), emergency_relation: str(b.emergency_relation, 40) });
async function validateStudent(d, sid) {
  const e = [], years = await db.map('select id,label from school_years');
  if (!/^\d{12}$/.test(d.lrn)) e.push('LRN must be exactly 12 digits.');
  for (const [k, l] of [['first_name', 'First name'], ['last_name', 'Last name'], ['address', 'Address'], ['guardian_name', 'Parent/guardian'], ['emergency_name', 'Emergency contact person'], ['emergency_relation', 'Emergency relation']]) if (!d[k]) e.push(`${l} is required.`);
  if (!['M', 'F'].includes(d.sex)) e.push('Select sex.');
  if (!validDate(d.birthdate) || d.birthdate > todayStr()) e.push('Birthdate is invalid.');
  if (!GRADES.includes(d.grade_level)) e.push('Grade level must be 7 to 12.');
  if (!years[d.school_year_id]) e.push('Select a school year.');
  if (!validPhone(d.guardian_contact) || !validPhone(d.emergency_contact)) e.push('Contact numbers are invalid.');
  if (Number(await db.val('select count(*) from students where lrn=$1 and id<>$2', [d.lrn, sid]))) e.push('This LRN already exists (it may be a deleted record).');
  if (e.length) throw bad(e.join(' '));
}
admin.get('/students', M('students'), wrap(async (req, res) => {
  const f = { q: str(req.query.q, 80), g: int(req.query.g), st: str(req.query.st, 12), y: int(req.query.y), del: int(req.query.del) ? true : false };
  const w = ['s.is_deleted=$1'], p = [f.del];
  const add = (c, v) => { p.push(v); w.push(c.replace('?', '$' + p.length)); };
  if (f.q) add('(s.student_no ilike ? or s.lrn ilike ? or s.last_name ilike ? or s.first_name ilike ?)'.replace(/\?/g, () => '?'), like(f.q));
  // the ilike clause above uses the same parameter 4 times
  if (f.q) { const n = p.length; w[w.length - 1] = `(s.student_no ilike $${n} or s.lrn ilike $${n} or s.last_name ilike $${n} or s.first_name ilike $${n})`; }
  if (f.g) add('s.grade_level=?', f.g);
  if (STU_STATUS[f.st]) add('s.status=?', f.st);
  if (f.y) add('s.school_year_id=?', f.y);
  const W = w.join(' and '), { p: pg, per, off } = pageOf(req);
  const total = Number(await db.val(`select count(*) from students s where ${W}`, p));
  const rows = await db.rows(`select s.id,s.student_no,s.lrn,s.first_name,s.middle_name,s.last_name,s.suffix,s.grade_level,s.status,s.guardian_contact,s.is_deleted,s.portal_hash is not null as has_portal,sc.name sec,sy.label as year from students s left join sections sc on sc.id=s.section_id left join school_years sy on sy.id=s.school_year_id where ${W} order by s.last_name,s.first_name limit ${per} offset ${off}`, p);
  res.json({ ok: true, total, page: pg, per, rows: rows.map((r) => ({ ...r, name: person(r) })) });
}));
admin.get('/students/:id', M('students'), wrap(async (req, res) => {
  const id = int(req.params.id);
  const r = await db.one('select s.*,sc.name sec,sy.label as year from students s left join sections sc on sc.id=s.section_id left join school_years sy on sy.id=s.school_year_id where s.id=$1', [id]);
  if (!r) throw new HttpError(404, 'Student not found.');
  delete r.portal_hash;
  const history = await db.rows("select action,username,created_at,details from logs where entity='student' and entity_id=$1 order by id desc limit 15", [id]);
  const grades = await gradeRows(id, r.section_id || null, r.school_year_id, false);
  const released = await db.col('select term from term_release where school_year_id=$1 order by term', [r.school_year_id]);
  const pr = await db.one('select portal_hash is not null as has, portal_last_login, portal_must_change from students where id=$1', [id]);
  res.json({ ok: true, student: { ...r, name: person(r) }, history, grades, released, portal: pr });
}));
admin.post('/students', M('students'), wrap(async (req, res) => {
  const d = STU_FIELDS(req.body); await validateStudent(d, 0);
  let no, sid;
  try {
    [no, sid] = await allocateId('student', d.school_year_id, async (id, t) => {
      const cols = Object.keys(d);
      const r = await t.one(`insert into students(student_no,${cols.join(',')}) values($1,${cols.map((_, i) => '$' + (i + 2)).join(',')}) returning id`, [id, ...cols.map((k) => d[k])]);
      return r.id;
    });
  } catch (e) { if (e.code === '23505') throw bad('This LRN was just enrolled by someone else. Search the student list before adding again.'); throw e; }
  await logAction(req, 'create', 'student', sid, `Enrolled ${d.lrn} with student ID ${no}`);
  emitData('admin', [req.actor.id], 'people');
  ok(req, res, { id: sid, issued: { kind: 'student', no, name: person(d) }, message: 'Student enrolled.' });
}));
admin.put('/students/:id', M('students'), wrap(async (req, res) => {
  const sid = int(req.params.id), d = STU_FIELDS(req.body); await validateStudent(d, sid);
  const old = await db.one('select grade_level,school_year_id from students where id=$1 and is_deleted=false', [sid]);
  if (!old) throw new HttpError(404, 'Student not found.');
  const cols = Object.keys(d), extra = (old.grade_level !== d.grade_level || old.school_year_id !== d.school_year_id) ? ',section_id=null' : '';
  await db.q(`update students set ${cols.map((k, i) => `${k}=$${i + 1}`).join(',')}${extra} where id=$${cols.length + 1}`, [...cols.map((k) => d[k]), sid]);
  await logAction(req, 'update', 'student', sid, 'Updated ' + d.lrn); emitData('student', [sid], 'profile');
  ok(req, res, { id: sid, message: 'Student record updated.' });
}));
admin.post('/students/:id/status', M('students'), wrap(async (req, res) => {
  const sid = int(req.params.id), st = str(req.body.status, 12), dt = str(req.body.status_date, 10), rs = str(req.body.status_reason), sc = str(req.body.transfer_school, 160);
  if (!STU_STATUS[st] || !validDate(dt)) throw bad('Choose a valid status and date.');
  if (st === 'transferred' && !sc) throw bad('Enter the receiving school for a transfer.');
  await db.q(`update students set status=$1,status_date=$2,status_reason=$3,transfer_school=$4${st !== 'enrolled' ? ',section_id=null' : ''} where id=$5 and is_deleted=false`, [st, dt, rs, st === 'transferred' ? sc : null, sid]);
  await logAction(req, 'status', 'student', sid, `Status: ${st} on ${dt}. Reason: ${rs}` + (sc ? ` To: ${sc}` : ''));
  await notify('student', [sid], { kind: 'status', title: 'Your enrollment status changed', body: STU_STATUS[st] + (rs ? ': ' + rs : ''), data: {} }); emitData('student', [sid], 'profile');
  ok(req, res, { message: 'Status updated.' });
}));
async function portalReset(req, res, table, kind) {
  const id = int(req.params.id);
  const r = await db.one(`select * from ${table} where id=$1 and is_deleted=false`, [id]);
  if (!r) throw new HttpError(404, 'Not found.');
  if (kind === 'student' && !r.student_no) throw bad('This student has no ID number yet. Run ID migration first.');
  if (kind === 'teacher' && !/^T-\d{5}$/.test(r.teacher_no)) throw bad('This teacher still has an old ID. Run ID migration first.');
  const pw = tempPw();
  await db.q(`update ${table} set portal_hash=$1, portal_must_change=true where id=$2`, [await hashPw(pw), id]);
  await db.q('update sessions set revoked=true where actor_type=$1 and actor_id=$2', [kind, id]);
  await logAction(req, 'portal_reset', kind, id, 'Portal password set/reset');
  ok(req, res, { cred: { name: person({ ...r, middle_name: '' }), label: kind === 'student' ? 'Student ID (sign-in)' : 'Teacher ID (sign-in)', id: r.student_no || r.teacher_no, pw, note: `Shown once. The ${kind} signs in to the ${kind} app and must choose a new password straight away.` } });
}
admin.post('/students/:id/portal-reset', M('students'), wrap((req, res) => portalReset(req, res, 'students', 'student')));
admin.post('/students/:id/delete', M('students'), wrap(async (req, res) => {
  const sid = int(req.params.id), st = await db.one('select * from students where id=$1 and is_deleted=false', [sid]);
  if (!st) throw new HttpError(404, 'Student not found.');
  const ops = [tFlag('students', sid, { is_deleted: false, deleted_at: null, deleted_by: null })];
  if (st.section_id) ops.push(tSet('students', [sid], { section_id: st.section_id }, 'section_id'));
  await logDelete(req, 'delete', 'student', sid, 'Marked as deleted (record kept)', `Student: ${person(st)} (${st.student_no || st.lrn})`, ops, 'Student removed: ' + person(st));
  await db.q('update students set is_deleted=true, deleted_at=now(), deleted_by=$1, section_id=null where id=$2', [req.actor.id, sid]);
  await db.q("update sessions set revoked=true where actor_type='student' and actor_id=$1", [sid]);
  ok(req, res, { message: 'Student removed.' });
}));
admin.post('/students/:id/restore', M('students'), wrap(async (req, res) => {
  const sid = int(req.params.id); await db.q('update students set is_deleted=false, deleted_at=null, deleted_by=null where id=$1', [sid]);
  await logAction(req, 'restore', 'student', sid, 'Restored'); await trashMarkRestored(req, 'student', sid); ok(req, res, { message: 'Record restored.' });
}));

/* ---------------- teachers ---------------- */
const TCH_FIELDS = (b) => ({ first_name: str(b.first_name, 60), last_name: str(b.last_name, 60), birthdate: str(b.birthdate, 10), address: str(b.address), contact_no: str(b.contact_no, 20), spouse: str(b.spouse, 120) || null });
function validateTeacher(d) {
  const e = [];
  if (!d.first_name || !d.last_name || !d.address) e.push('Name and address are required.');
  if (!validDate(d.birthdate) || d.birthdate > addDays(todayStr(), -365 * 18 - 4)) e.push('Birthdate is invalid.');
  if (!validPhone(d.contact_no)) e.push('Contact number is invalid.');
  if (e.length) throw bad(e.join(' '));
}
admin.get('/teachers', M('teachers'), wrap(async (req, res) => {
  const qq = str(req.query.q, 80), st = str(req.query.st, 12), del = int(req.query.del) ? true : false, w = ['t.is_deleted=$1'], p = [del];
  if (qq) { p.push(like(qq)); w.push(`(t.teacher_no ilike $${p.length} or t.last_name ilike $${p.length} or t.first_name ilike $${p.length})`); }
  if (TCH_STATUS[st]) { p.push(st); w.push(`t.status=$${p.length}`); }
  const { p: pg, per, off } = pageOf(req), W = w.join(' and ');
  const total = Number(await db.val(`select count(*) from teachers t where ${W}`, p));
  const rows = await db.rows(`select t.id,t.teacher_no,t.first_name,t.last_name,t.contact_no,t.status,t.is_deleted,t.portal_hash is not null as has_portal,(select count(*) from subject_teachers x join subjects s on s.id=x.subject_id and s.is_deleted=false where x.teacher_id=t.id)::int subjects from teachers t where ${W} order by t.last_name,t.first_name limit ${per} offset ${off}`, p);
  res.json({ ok: true, total, page: pg, per, rows: rows.map((r) => ({ ...r, name: r.last_name.toUpperCase() + ', ' + r.first_name })) });
}));
admin.get('/teachers/:id', M('teachers'), wrap(async (req, res) => {
  const id = int(req.params.id), r = await db.one('select * from teachers where id=$1', [id]);
  if (!r) throw new HttpError(404, 'Teacher not found.');
  const portal = { has: !!r.portal_hash, portal_last_login: r.portal_last_login, portal_must_change: r.portal_must_change }; delete r.portal_hash;
  const subjects = await db.rows('select s.code,s.name from subjects s join subject_teachers x on x.subject_id=s.id where x.teacher_id=$1 and s.is_deleted=false', [id]);
  res.json({ ok: true, teacher: { ...r, name: person({ ...r, middle_name: '' }) }, subjects, portal, maxSubjects: config.MAX_SUBJECTS_PER_TEACHER, isWriter: !!Number(await db.val('select count(*) from pub_writers where teacher_id=$1', [id])) });
}));
admin.post('/teachers', M('teachers'), wrap(async (req, res) => {
  const d = TCH_FIELDS(req.body); validateTeacher(d);
  const [no, tid] = await allocateId('teacher', null, async (id, t) => { const cols = Object.keys(d); return (await t.one(`insert into teachers(teacher_no,${cols.join(',')}) values($1,${cols.map((_, i) => '$' + (i + 2)).join(',')}) returning id`, [id, ...cols.map((k) => d[k])])).id; });
  await logAction(req, 'create', 'teacher', tid, 'Added with teacher ID ' + no);
  ok(req, res, { id: tid, issued: { kind: 'teacher', no, name: person({ ...d, middle_name: '' }) }, message: 'Teacher added.' });
}));
admin.put('/teachers/:id', M('teachers'), wrap(async (req, res) => {
  const tid = int(req.params.id), d = TCH_FIELDS(req.body); validateTeacher(d); const cols = Object.keys(d);
  await db.q(`update teachers set ${cols.map((k, i) => `${k}=$${i + 1}`).join(',')} where id=$${cols.length + 1} and is_deleted=false`, [...cols.map((k) => d[k]), tid]);
  await logAction(req, 'update', 'teacher', tid, person({ ...d, middle_name: '' })); ok(req, res, { id: tid, message: 'Teacher saved.' });
}));
admin.post('/teachers/:id/status', M('teachers'), wrap(async (req, res) => {
  const tid = int(req.params.id), st = str(req.body.status, 12), dt = str(req.body.status_date, 10), rs = str(req.body.status_reason);
  if (!TCH_STATUS[st] || !validDate(dt)) throw bad('Choose a valid status and date.');
  await db.q('update teachers set status=$1,status_date=$2,status_reason=$3 where id=$4 and is_deleted=false', [st, dt, rs, tid]);
  if (st !== 'active' && st !== 'on_leave') {
    const adv = await db.col('select id from sections where adviser_id=$1', [tid]), sts = await db.rows('select * from subject_teachers where teacher_id=$1', [tid]);
    if (adv.length || sts.length) {
      const tn = await db.one('select teacher_no,first_name,last_name from teachers where id=$1', [tid]), ops = [];
      if (adv.length) ops.push(tSet('sections', adv, { adviser_id: tid }, 'adviser_id')); if (sts.length) ops.push(tRows('subject_teachers', sts));
      await logDelete(req, 'assignments_cleared', 'teacher', tid, `Status ${st} cleared adviser and subject assignments`, `Assignments of ${tn.first_name} ${tn.last_name} (${tn.teacher_no})`, ops, 'Teacher assignments cleared (adviser and subjects)');
    }
    await db.q('update sections set adviser_id=null where adviser_id=$1', [tid]); await db.q('delete from subject_teachers where teacher_id=$1', [tid]);
    await db.q('update section_subjects set teacher_id=null where teacher_id=$1', [tid]);
    await db.q("update sessions set revoked=true where actor_type='teacher' and actor_id=$1", [tid]);
  }
  await logAction(req, 'status', 'teacher', tid, `Status: ${st} on ${dt}. ${rs}`); ok(req, res, { message: 'Status updated.' });
}));
admin.post('/teachers/:id/portal-reset', M('teachers'), wrap((req, res) => portalReset(req, res, 'teachers', 'teacher')));
admin.post('/teachers/:id/delete', M('teachers'), wrap(async (req, res) => {
  const tid = int(req.params.id), tr = await db.one('select * from teachers where id=$1 and is_deleted=false', [tid]);
  if (!tr) throw new HttpError(404, 'Teacher not found.');
  const ops = [tFlag('teachers', tid, { is_deleted: false, deleted_at: null, deleted_by: null })];
  const adv = await db.col('select id from sections where adviser_id=$1', [tid]); if (adv.length) ops.push(tSet('sections', adv, { adviser_id: tid }, 'adviser_id'));
  const sts = await db.rows('select * from subject_teachers where teacher_id=$1', [tid]); if (sts.length) ops.push(tRows('subject_teachers', sts));
  await logDelete(req, 'delete', 'teacher', tid, 'Marked as deleted (record kept)', `Teacher: ${person({ ...tr, middle_name: '' })} (${tr.teacher_no})`, ops, 'Teacher removed: ' + person({ ...tr, middle_name: '' }));
  await db.q('update teachers set is_deleted=true, deleted_at=now(), deleted_by=$1 where id=$2', [req.actor.id, tid]);
  await db.q('update sections set adviser_id=null where adviser_id=$1', [tid]); await db.q('delete from subject_teachers where teacher_id=$1', [tid]); await db.q('update section_subjects set teacher_id=null where teacher_id=$1', [tid]);
  await db.q("update sessions set revoked=true where actor_type='teacher' and actor_id=$1", [tid]);
  ok(req, res, { message: 'Teacher removed.' });
}));
admin.post('/teachers/:id/restore', M('teachers'), wrap(async (req, res) => {
  const tid = int(req.params.id); await db.q('update teachers set is_deleted=false, deleted_at=null, deleted_by=null where id=$1', [tid]);
  await logAction(req, 'restore', 'teacher', tid, 'Restored'); await trashMarkRestored(req, 'teacher', tid); ok(req, res, { message: 'Teacher restored.' });
}));

/* ---------------- subjects ---------------- */
admin.get('/subjects', M('subjects'), wrap(async (req, res) => {
  const rows = await db.rows("select s.id,s.code,s.name,s.grade_level,coalesce((select string_agg(t.last_name||', '||t.first_name, '; ' order by t.last_name) from subject_teachers x join teachers t on t.id=x.teacher_id where x.subject_id=s.id),'') teachers from subjects s where s.is_deleted=false order by s.code");
  res.json({ ok: true, rows, maxTeachers: config.MAX_TEACHERS_PER_SUBJECT, maxSubjects: config.MAX_SUBJECTS_PER_TEACHER });
}));
admin.get('/subjects/:id', M('subjects'), wrap(async (req, res) => {
  const id = int(req.params.id), s = await db.one('select * from subjects where id=$1 and is_deleted=false', [id]);
  if (!s) throw new HttpError(404, 'Subject not found.');
  res.json({ ok: true, subject: { ...s, teachers: await db.col('select teacher_id from subject_teachers where subject_id=$1', [id]) } });
}));
admin.get('/subjects-teachers', M('subjects'), wrap(async (req, res) => {
  const sid = int(req.query.subject);
  res.json({ ok: true, rows: await db.rows("select t.id,t.last_name,t.first_name,(select count(*) from subject_teachers x join subjects s on s.id=x.subject_id and s.is_deleted=false where x.teacher_id=t.id and x.subject_id<>$1)::int as load from teachers t where t.is_deleted=false and t.status='active' order by t.last_name", [sid]), max: config.MAX_SUBJECTS_PER_TEACHER });
}));
admin.post('/subjects', M('subjects'), wrap((req, res) => saveSubject(req, res, 0)));
admin.put('/subjects/:id', M('subjects'), wrap((req, res) => saveSubject(req, res, int(req.params.id))));
async function saveSubject(req, res, sid) {
  const code = str(req.body.code, 20).toUpperCase(), name = str(req.body.name, 120), g = int(req.body.grade_level) || null, tids = uniqInts(req.body.teachers), e = [];
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) e.push('Subject ID: 2-20 letters, numbers or -.');
  if (!name) e.push('Subject name is required.');
  if (g !== null && !GRADES.includes(g)) e.push('Invalid grade level.');
  if (tids.length > config.MAX_TEACHERS_PER_SUBJECT) e.push(`A subject can have at most ${config.MAX_TEACHERS_PER_SUBJECT} teachers.`);
  if (Number(await db.val('select count(*) from subjects where code=$1 and id<>$2', [code, sid]))) e.push('Subject ID already exists.');
  if (e.length) throw bad(e.join(' '));
  const id = await tx(async (t) => {
    for (const x of tids) {
      const row = await t.one("select last_name from teachers where id=$1 and status='active' and is_deleted=false for update", [x]);
      if (!row) throw bad('A selected teacher is not active.');
      const c = Number(await t.val('select count(*) from subject_teachers x join subjects s on s.id=x.subject_id and s.is_deleted=false where x.teacher_id=$1 and x.subject_id<>$2', [x, sid]));
      if (c >= config.MAX_SUBJECTS_PER_TEACHER) throw bad(`${row.last_name} already handles ${config.MAX_SUBJECTS_PER_TEACHER} subjects.`);
    }
    let id = sid;
    if (sid) await t.q('update subjects set code=$1,name=$2,grade_level=$3 where id=$4 and is_deleted=false', [code, name, g, sid]);
    else id = (await t.one('insert into subjects(code,name,grade_level) values($1,$2,$3) returning id', [code, name, g])).id;
    await t.q('delete from subject_teachers where subject_id=$1', [id]);
    for (const x of tids) await t.q('insert into subject_teachers(subject_id,teacher_id) values($1,$2)', [id, x]);
    return id;
  });
  await logAction(req, sid ? 'update' : 'create', 'subject', id, `${code} ${name}; teachers: ${tids.join(',')}`);
  ok(req, res, { id, message: 'Subject saved.' });
}
admin.post('/subjects/:id/delete', M('subjects'), wrap(async (req, res) => {
  const sid = int(req.params.id), sj = await db.one('select * from subjects where id=$1 and is_deleted=false', [sid]);
  if (!sj) throw new HttpError(404, 'Subject not found.');
  const ops = [tFlag('subjects', sid, { is_deleted: false, deleted_at: null })], sts = await db.rows('select * from subject_teachers where subject_id=$1', [sid]); if (sts.length) ops.push(tRows('subject_teachers', sts));
  await logDelete(req, 'delete', 'subject', sid, 'Marked as deleted (record kept)', `Subject: ${sj.code} ${sj.name}`, ops, `Subject removed: ${sj.code} ${sj.name}`);
  await db.q('update subjects set is_deleted=true, deleted_at=now() where id=$1', [sid]); await db.q('delete from subject_teachers where subject_id=$1', [sid]);
  ok(req, res, { message: 'Subject removed.' });
}));

/* ---------------- sections ---------------- */
admin.get('/sections', M('sections'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.query.y, cy?.id || 0);
  const rows = await db.rows("select s.id,s.grade_level,s.name,s.grading_term,s.adviser_id,t.last_name||', '||t.first_name adviser,(select count(*) from students st where st.section_id=s.id and st.is_deleted=false and st.status='enrolled')::int students,(select count(*) from section_subjects x where x.section_id=s.id)::int subjects from sections s left join teachers t on t.id=s.adviser_id where s.school_year_id=$1 and s.is_deleted=false order by s.grade_level,s.name", [y]);
  res.json({ ok: true, year: y, rows });
}));
admin.post('/sections', M('sections'), wrap(async (req, res) => {
  const cy = await curYear(), y = int(req.body.y, cy?.id || 0), g = int(req.body.grade), n = int(req.body.count), t = int(req.body.term);
  const names = (Array.isArray(req.body.names) ? req.body.names : []).map((x) => str(x, 40));
  let e = '';
  if (!GRADES.includes(g) || n < 1 || n > 20 || t < 1 || t > 4 || names.length !== n || names.includes('')) e = 'Complete every field and name every section.';
  else if (new Set(names.map((x) => x.toLowerCase())).size !== n) e = 'Section names must be unique.';
  else { const ex = await db.col('select lower(name) from sections where school_year_id=$1 and grade_level=$2 and is_deleted=false', [y, g]); if (names.some((x) => ex.includes(x.toLowerCase()))) e = 'A section with one of these names already exists for this grade.'; }
  if (e) throw bad(e);
  for (const nm of names) await db.q('insert into sections(school_year_id,grade_level,name,grading_term) values($1,$2,$3,$4)', [y, g, nm, t]);
  await logAction(req, 'create', 'section', null, `Created ${n} section(s) for Grade ${g}: ${names.join(', ')}`);
  ok(req, res, { message: `${n} section(s) created for Grade ${g}.` });
}));
admin.get('/sections/:id', M('sections'), wrap(async (req, res) => {
  const id = int(req.params.id), sec = await db.one('select s.*,t.first_name tf,t.last_name tl,sy.label as year from sections s left join teachers t on t.id=s.adviser_id left join school_years sy on sy.id=s.school_year_id where s.id=$1 and s.is_deleted=false', [id]);
  if (!sec) throw new HttpError(404, 'Section not found.');
  const yid = sec.school_year_id;
  const tot = Number(await db.val("select count(*) from students where school_year_id=$1 and grade_level=$2 and is_deleted=false and status='enrolled'", [yid, sec.grade_level]));
  const n = Number(await db.val('select count(*) from sections where school_year_id=$1 and grade_level=$2 and is_deleted=false', [yid, sec.grade_level]));
  const idx = Number(await db.val('select count(*) from sections where school_year_id=$1 and grade_level=$2 and is_deleted=false and id<$3', [yid, sec.grade_level, id]));
  const members = await db.rows("select id,student_no,lrn,first_name,middle_name,last_name,suffix,sex,portal_hash is not null has_portal from students where section_id=$1 and is_deleted=false and status='enrolled' order by last_name,first_name", [id]);
  const cands = await db.rows("select id,student_no,first_name,middle_name,last_name,suffix from students where section_id is null and is_deleted=false and status='enrolled' and grade_level=$1 and school_year_id=$2 order by last_name,first_name", [sec.grade_level, yid]);
  const advisers = await db.rows("select id,last_name||', '||first_name n from teachers where is_deleted=false and (status='active' or id=$1) and id not in (select adviser_id from sections where school_year_id=$2 and id<>$3 and is_deleted=false and adviser_id is not null) order by last_name", [sec.adviser_id || 0, yid, id]);
  const subjects = await db.rows("select s.id,s.code,s.name,ss.teacher_id,(select coalesce(json_agg(json_build_object('id',t.id,'name',t.last_name||', '||t.first_name)),'[]'::json) from subject_teachers x join teachers t on t.id=x.teacher_id and t.is_deleted=false where x.subject_id=s.id) options from section_subjects ss join subjects s on s.id=ss.subject_id and s.is_deleted=false where ss.section_id=$1 order by s.name", [id]);
  const addable = await db.rows('select id,code,name from subjects where is_deleted=false and (grade_level is null or grade_level=$1) and id not in (select subject_id from section_subjects where section_id=$2) order by code', [sec.grade_level, id]);
  res.json({ ok: true, section: { ...sec, label: gradeLabel(sec) }, estimate: Math.floor(tot / n) + (idx < tot % n ? 1 : 0), members: members.map((m) => ({ ...m, name: person(m) })), candidates: cands.map((m) => ({ ...m, name: person(m) })), advisers, subjects, addable, cap: config.SECTION_CAP, maxSubjects: config.MAX_SUBJECTS_PER_SECTION });
}));
const secOr404 = async (id) => { const s = await db.one('select * from sections where id=$1 and is_deleted=false', [id]); if (!s) throw new HttpError(404, 'Section not found.'); return s; };
admin.post('/sections/:id/update', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id), sec = await secOr404(sid), nm = str(req.body.name, 40), t = int(req.body.term), ad = int(req.body.adviser_id) || null;
  if (!nm || t < 1 || t > 4) throw bad('Name and grading term are required.');
  if (Number(await db.val('select count(*) from sections where school_year_id=$1 and grade_level=$2 and lower(name)=lower($3) and id<>$4 and is_deleted=false', [sec.school_year_id, sec.grade_level, nm, sid]))) throw bad('Another section already uses that name.');
  if (ad) {
    if (!Number(await db.val("select count(*) from teachers where id=$1 and status='active' and is_deleted=false", [ad]))) throw bad('Adviser must be an active teacher.');
    if (Number(await db.val('select count(*) from sections where adviser_id=$1 and school_year_id=$2 and id<>$3 and is_deleted=false', [ad, sec.school_year_id, sid]))) throw bad('That teacher already advises another section this school year.');
  }
  await db.q('update sections set name=$1,grading_term=$2,adviser_id=$3 where id=$4', [nm, t, ad, sid]);
  await logAction(req, 'update', 'section', sid, `Name=${nm} term=${t} adviser=${ad || 'none'}`);
  if (ad && ad !== sec.adviser_id) await notify('teacher', [ad], { kind: 'assignment', title: 'You are now class adviser', body: `Grade ${sec.grade_level} - ${nm}`, data: { section: sid } });
  emitData('teacher', [ad, sec.adviser_id].filter(Boolean), 'classes'); ok(req, res, { message: 'Section saved.' });
}));
admin.post('/sections/:id/addsub', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id), sec = await secOr404(sid), sub = int(req.body.subject_id);
  await tx(async (t) => {
    await t.q('select id from sections where id=$1 for update', [sid]);
    const cnt = Number(await t.val('select count(*) from section_subjects where section_id=$1', [sid]));
    const okk = Number(await t.val('select count(*) from subjects where id=$1 and is_deleted=false and (grade_level is null or grade_level=$2)', [sub, sec.grade_level]));
    if (cnt >= config.MAX_SUBJECTS_PER_SECTION) throw bad(`A section can have at most ${config.MAX_SUBJECTS_PER_SECTION} subjects.`);
    if (!okk) throw bad('That subject cannot be added to this grade level.');
    const tc = await t.col('select x.teacher_id from subject_teachers x join teachers t on t.id=x.teacher_id and t.is_deleted=false where x.subject_id=$1', [sub]);
    await t.q('insert into section_subjects(section_id,subject_id,teacher_id) values($1,$2,$3) on conflict do nothing', [sid, sub, tc.length === 1 ? tc[0] : null]);
    if (tc.length === 1) await notify('teacher', [tc[0]], { kind: 'assignment', title: 'New class assigned', body: `Grade ${sec.grade_level} - ${sec.name}`, data: { section: sid } }, t);
  });
  await logAction(req, 'add_subject', 'section', sid, `Subject #${sub}`); ok(req, res, { message: 'Subject added to section.' });
}));
admin.post('/sections/:id/subteacher', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id), sub = int(req.body.subject_id), t = int(req.body.teacher_id) || null, sec = await secOr404(sid);
  if (t && !Number(await db.val('select count(*) from subject_teachers where subject_id=$1 and teacher_id=$2', [sub, t]))) throw bad('Teacher is not assigned to that subject.');
  await db.q('update section_subjects set teacher_id=$1 where section_id=$2 and subject_id=$3', [t, sid, sub]);
  await logAction(req, 'subject_teacher', 'section', sid, `Subject #${sub} teacher ${t || 'none'}`);
  if (t) await notify('teacher', [t], { kind: 'assignment', title: 'New class assigned', body: `Grade ${sec.grade_level} - ${sec.name}`, data: { section: sid } });
  emitData('teacher', t ? [t] : [], 'classes'); ok(req, res, { message: 'Subject teacher saved.' });
}));
admin.post('/sections/:id/rmsub', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id), sub = int(req.body.subject_id), sec = await secOr404(sid), rs = await db.one('select * from section_subjects where section_id=$1 and subject_id=$2', [sid, sub]);
  if (rs) {
    const sj = await db.one('select code from subjects where id=$1', [sub]);
    await logDelete(req, 'remove_subject', 'section', sid, `Subject #${sub} (existing grades are kept)`, `Subject ${sj.code} removed from ${sec.name}`, [tRows('section_subjects', [rs])], 'Subject removed from section: ' + sj.code);
    await db.q('delete from section_subjects where section_id=$1 and subject_id=$2', [sid, sub]);
  }
  ok(req, res, { message: 'Subject removed from section.' });
}));
admin.post('/sections/:id/add', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id), sec = await secOr404(sid), ids = uniqInts(req.body.student_ids);
  const cur = Number(await db.val("select count(*) from students where section_id=$1 and is_deleted=false and status='enrolled'", [sid]));
  if (!ids.length) throw bad('Select at least one student.');
  if (cur + ids.length > config.SECTION_CAP) throw bad(`Section capacity is ${config.SECTION_CAP} students.`);
  const r = await db.rows("update students set section_id=$1 where id = any($2::int[]) and section_id is null and is_deleted=false and status='enrolled' and grade_level=$3 and school_year_id=$4 returning id", [sid, ids, sec.grade_level, sec.school_year_id]);
  await logAction(req, 'assign', 'section', sid, `Added ${r.length} student(s)`);
  await notify('student', r.map((x) => x.id), { kind: 'section', title: 'You were placed in a section', body: `Grade ${sec.grade_level} - ${sec.name}`, data: {} }); emitData('student', r.map((x) => x.id), 'profile');
  ok(req, res, { message: `${r.length} student(s) added.` });
}));
admin.post('/sections/:id/remove', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id), sec = await secOr404(sid), st = int(req.body.student_id), stu = await db.one('select * from students where id=$1 and section_id=$2', [st, sid]);
  if (stu) { await logDelete(req, 'unassign', 'section', sid, `Removed student #${st}`, `Student ${person(stu)} taken out of ${sec.name}`, [tSet('students', [st], { section_id: sid }, 'section_id')], 'Student removed from section: ' + person(stu)); await db.q('update students set section_id=null where id=$1 and section_id=$2', [st, sid]); emitData('student', [st], 'profile'); }
  ok(req, res, { message: 'Student removed from section.' });
}));
admin.post('/sections/:id/portal-all', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id); await secOr404(sid);
  const rows = await db.rows("select id,student_no,first_name,middle_name,last_name,suffix from students where section_id=$1 and is_deleted=false and status='enrolled' and portal_hash is null and student_no is not null order by last_name,first_name", [sid]);
  const out = [];
  for (const r of rows) { const pw = tempPw(); await db.q('update students set portal_hash=$1, portal_must_change=true where id=$2', [await hashPw(pw), r.id]); out.push({ student_no: r.student_no, name: person(r), password: pw }); }
  await logAction(req, 'portal_accounts', 'section', sid, `Generated ${rows.length} portal account(s)`); ok(req, res, { rows: out });
}));
admin.post('/sections/:id/delete', M('sections'), wrap(async (req, res) => {
  const sid = int(req.params.id), sec = await secOr404(sid), ids = await db.col('select id from students where section_id=$1', [sid]);
  const ops = [tFlag('sections', sid, { is_deleted: false, deleted_at: null })]; if (ids.length) ops.push(tSet('students', ids, { section_id: sid }, 'section_id'));
  await logDelete(req, 'delete', 'section', sid, 'Marked deleted: ' + sec.name, `Section: Grade ${sec.grade_level} - ${sec.name}`, ops, `Section removed: ${sec.name} (${ids.length} student(s) unassigned)`);
  await db.q('update students set section_id=null where section_id=$1', [sid]); await db.q('update sections set is_deleted=true, deleted_at=now() where id=$1', [sid]);
  ok(req, res, { message: 'Section removed.' });
}));

/* ---------------- schedules ---------------- */
admin.get('/schedule', M('schedule'), wrap(async (req, res) => {
  const sec = int(req.query.sec);
  const subs = sec ? await db.rows("select s.id,s.code||' - '||s.name n from section_subjects ss join subjects s on s.id=ss.subject_id and s.is_deleted=false where ss.section_id=$1 order by s.name", [sec]) : [];
  res.json({ ok: true, rows: sec ? await schedRows('sch.section_id=$1', [sec]) : [], subjects: subs });
}));
admin.post('/schedule/:sec/add', M('schedule'), wrap(async (req, res) => {
  const secId = int(req.params.sec), sub = int(req.body.subject_id), d = int(req.body.day), st = str(req.body.start, 5), en = str(req.body.end, 5), rm = str(req.body.room, 30);
  const sec = await secOr404(secId); let e = '';
  const T = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!Number(await db.val('select count(*) from section_subjects where section_id=$1 and subject_id=$2', [secId, sub]))) e = 'Subject is not in this section.';
  else if (!DAYS[d]) e = 'Choose a weekday.';
  else if (!T.test(st) || !T.test(en) || en <= st || st < '06:00' || en > '18:00') e = 'Times must be between 06:00 and 18:00 and end after start.';
  else {
    if (Number(await db.val('select count(*) from schedules where section_id=$1 and day_of_week=$2 and start_time<$3 and end_time>$4', [secId, d, en, st]))) e = 'This section already has a class at that time.';
    const tid = await db.val('select teacher_id from section_subjects where section_id=$1 and subject_id=$2', [secId, sub]);
    if (!e && tid && Number(await db.val('select count(*) from schedules sch join section_subjects ss on ss.section_id=sch.section_id and ss.subject_id=sch.subject_id where ss.teacher_id=$1 and sch.day_of_week=$2 and sch.start_time<$3 and sch.end_time>$4', [tid, d, en, st]))) e = 'The teacher already has a class at that time.';
    if (!e && rm && Number(await db.val('select count(*) from schedules sch join sections sc on sc.id=sch.section_id and sc.is_deleted=false where sch.room=$1 and sch.day_of_week=$2 and sch.start_time<$3 and sch.end_time>$4', [rm, d, en, st]))) e = 'That room is already used at that time.';
  }
  if (e) throw bad(e);
  await db.q('insert into schedules(section_id,subject_id,day_of_week,start_time,end_time,room) values($1,$2,$3,$4,$5,$6)', [secId, sub, d, st + ':00', en + ':00', rm || null]);
  await logAction(req, 'create', 'schedule', secId, `${DAYS[d]} ${st}-${en} subject #${sub}`); await scheduleChanged(secId, sec);
  ok(req, res, { message: 'Schedule entry added.' });
}));
admin.post('/schedule/:sec/del', M('schedule'), wrap(async (req, res) => {
  const secId = int(req.params.sec), eid = int(req.body.entry), sec = await secOr404(secId);
  const en = await db.one('select sch.*,s.code from schedules sch join subjects s on s.id=sch.subject_id where sch.id=$1 and sch.section_id=$2', [eid, secId]);
  if (en) {
    const { code, ...row } = en, lab = `${DAYS[en.day_of_week]} ${en.start_time.slice(0, 5)}-${en.end_time.slice(0, 5)} ${code}`;
    await logDelete(req, 'delete', 'schedule', secId, 'Removed entry: ' + lab, 'Class period: ' + lab, [tRows('schedules', [row], 'schedule')], 'Class period removed: ' + lab);
    await db.q('delete from schedules where id=$1 and section_id=$2', [eid, secId]); await scheduleChanged(secId, sec);
  }
  ok(req, res, { message: 'Class period removed.' });
}));
async function scheduleChanged(secId, sec) {
  const studs = await db.col("select id from students where section_id=$1 and is_deleted=false and status='enrolled'", [secId]);
  const tchs = await db.col('select distinct teacher_id from section_subjects where section_id=$1 and teacher_id is not null', [secId]);
  await notify('student', studs, { kind: 'schedule', title: 'Your class schedule changed', body: `Grade ${sec.grade_level} - ${sec.name}`, data: {} });
  emitData('student', studs, 'schedule'); emitData('teacher', tchs, 'schedule');
}
