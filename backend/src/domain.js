import { db, tx } from './db.js';
import { config, ATT } from './config.js';
import { logAction } from './log.js';
import { tRows, trashAdd } from './trash.js';
import { notify, emitData } from './realtime.js';
import { HttpError, validDate, todayStr, dowOf, round2, person } from './util.js';

const { PASSING_GRADE } = config;
export const curYear = () => db.one('select * from school_years order by is_current desc, start_date desc limit 1');
export const gradeLabel = (s) => 'Grade ' + s.grade_level + ' - ' + s.name;

/* ---------- grades ---------- */
export async function gradeRows(stid, secId, yid, releasedOnly, dbx = db) {
  const sub = new Map();
  if (secId) for (const r of await dbx.rows('select s.id,s.code,s.name from section_subjects ss join subjects s on s.id=ss.subject_id where ss.section_id=$1 and s.is_deleted=false order by s.name', [secId])) sub.set(r.id, { subjectId: r.id, code: r.code, name: r.name, t: {} });
  let sql = 'select g.subject_id,g.term,g.grade,s.code,s.name from grades g join subjects s on s.id=g.subject_id where g.student_id=$1 and g.school_year_id=$2';
  if (releasedOnly) sql += ' and g.term in (select term from term_release where school_year_id=g.school_year_id)';
  for (const g of await dbx.rows(sql, [stid, yid])) {
    if (!sub.has(g.subject_id)) sub.set(g.subject_id, { subjectId: g.subject_id, code: g.code, name: g.name, t: {} });
    sub.get(g.subject_id).t[g.term] = g.grade;
  }
  const fin = [], rows = [];
  for (const s of sub.values()) {
    const ts = Object.values(s.t);
    s.final = ts.length === 4 ? Math.round(ts.reduce((a, b) => a + b, 0) / 4) : null;
    if (s.final !== null) fin.push(s.final);
    rows.push(s);
  }
  return { rows, avg: fin.length ? round2(fin.reduce((a, b) => a + b, 0) / fin.length) : null, passing: PASSING_GRADE };
}
export const honorLabel = (avg, noFail) => (!noFail ? '' : avg >= 98 ? 'With Highest Honors' : avg >= 95 ? 'With High Honors' : avg >= 90 ? 'With Honors' : '');

export async function classStudents(secId, dbx = db) {
  return dbx.rows("select id,lrn,student_no,first_name,middle_name,last_name,suffix,sex from students where section_id=$1 and is_deleted=false and status='enrolled' order by sex desc,last_name,first_name", [secId]);
}

/** Saves a whole class's term grades. g = { studentId: "raw" }. Throws HttpError on bad input. Returns the message. */
export async function gradesSave(req, secId, subId, term, g, notifyFn = null) {
  const sec = await db.one('select * from sections where id=$1 and is_deleted=false', [secId]);
  if (!sec || term < 1 || term > 4 || !Number(await db.val('select count(*) from section_subjects where section_id=$1 and subject_id=$2', [secId, subId]))) throw new HttpError(400, 'Invalid section, subject or term.');
  const studs = await db.map("select id, coalesce(student_no,'#'||id) from students where section_id=$1 and is_deleted=false and status='enrolled'", [secId]);
  const ex = await db.map('select student_id,grade from grades where subject_id=$1 and school_year_id=$2 and term=$3', [subId, sec.school_year_id, term]);
  const badIds = [], ops = [], log = [];
  for (const [sid, lrn] of Object.entries(studs)) {
    const raw = String(g?.[sid] ?? '').trim();
    if (raw === '') { if (ex[sid] !== undefined) { ops.push(['del', +sid]); log.push(`${lrn}:${ex[sid]}->blank`); } continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) { badIds.push(lrn); continue; }
    const v = round2(n);
    if (ex[sid] === undefined || ex[sid] !== v) { ops.push(['set', +sid, v]); log.push(`${lrn}:${ex[sid] ?? 'new'}->${v}`); }
  }
  if (badIds.length) throw new HttpError(400, 'Grades must be numbers from 0 to 100. Nothing was saved. Check student ID: ' + badIds.join(', '));
  const by = req.actor.type === 'admin' ? req.actor.id : null;
  const gone = [];
  await tx(async (t) => {
    for (const o of ops) {
      if (o[0] === 'del') {
        const gr = await t.one('select * from grades where student_id=$1 and subject_id=$2 and school_year_id=$3 and term=$4', [o[1], subId, sec.school_year_id, term]);
        if (gr) gone.push(gr);
        await t.q('delete from grades where student_id=$1 and subject_id=$2 and school_year_id=$3 and term=$4', [o[1], subId, sec.school_year_id, term]);
      } else await t.q('insert into grades(student_id,subject_id,section_id,school_year_id,term,grade,entered_by) values($1,$2,$3,$4,$5,$6,$7) on conflict (student_id,subject_id,school_year_id,term) do update set grade=excluded.grade, section_id=excluded.section_id, entered_by=excluded.entered_by', [o[1], subId, secId, sec.school_year_id, term, o[2], by]);
    }
    if (gone.length) {
      const lid = await logAction(req, 'grades_cleared', 'section', secId, `Subject #${subId} Term ${term}: ${gone.length} grade(s) cleared`, t);
      const tr = await trashAdd(req, 'grades', secId, `${gone.length} cleared grade(s), Term ${term}`, [tRows('grades', gone)], t);
      if (lid) await t.q('update trash set log_id=$1 where id=$2', [lid, tr]);
      req.undo = { id: tr, message: `${gone.length} grade(s) cleared`, seconds: config.UNDO_SECONDS };
    }
  });
  await logAction(req, 'grades', 'section', secId, `Subject #${subId} Term ${term}: ${log.length ? log.join('; ') : 'no changes'}`);
  emitData('student', Object.keys(studs).map(Number), 'grades');
  return `${ops.length} grade change(s) saved.`;
}

/* ---------- attendance ---------- */
export const standingOf = (abs, free) => { free = Math.max(1, free); return abs > free ? 'dropped' : (abs * 5 >= free * 4 ? 'warning' : 'ok'); };
export async function policyFor(secId, subId, yid, dbx = db) {
  const r = await dbx.one('select free_absences,apply_to_record from class_policy where section_id=$1 and subject_id=$2 and school_year_id=$3', [secId, subId, yid]);
  return { free: r?.free_absences ?? 10, apply: r?.apply_to_record ? 1 : 0, set: !!r };
}
export async function classAbsences(secId, subId, yid, dbx = db) {
  const o = {}; for (const r of await dbx.rows("select student_id,count(*)::int n from class_attendance where section_id=$1 and subject_id=$2 and school_year_id=$3 and status='A' group by student_id", [secId, subId, yid])) o[r.student_id] = r.n; return o;
}
function checkAttDate(date) {
  if (!validDate(date) || date > todayStr()) throw new HttpError(400, 'Choose a valid date that is not in the future.');
  if (dowOf(date) > 5) throw new HttpError(400, 'Classes are held Monday to Friday. Pick a weekday.');
}
/** Homeroom attendance for a section/day. items = [{student_id,status,remarks}] */
export async function attSave(req, secId, date, items, by) {
  checkAttDate(date);
  const sec = await db.one('select school_year_id from sections where id=$1 and is_deleted=false', [secId]);
  if (!sec) throw new HttpError(400, 'Section not found.');
  const studs = new Set(await db.col("select id from students where section_id=$1 and is_deleted=false and status='enrolled'", [secId]));
  let n = 0; const absent = [];
  const prev = await db.map('select student_id,status from attendance where section_id=$1 and att_date=$2', [secId, date]);
  await tx(async (t) => {
    for (const it of items || []) {
      const sid = Number(it.student_id), st = String(it.status || '');
      if (!studs.has(sid) || !ATT[st]) continue;
      await t.q('insert into attendance(student_id,section_id,school_year_id,att_date,status,remarks,marked_by) values($1,$2,$3,$4,$5,$6,$7) on conflict (student_id,att_date) do update set status=excluded.status, remarks=excluded.remarks, section_id=excluded.section_id, marked_by=excluded.marked_by',
        [sid, secId, sec.school_year_id, date, st, String(it.remarks || '').trim().slice(0, 120) || null, by.slice(0, 60)]);
      n++;
      if ((st === 'A' || st === 'L') && prev[sid] !== st) absent.push([sid, st]);
    }
  });
  await logAction(req, 'attendance', 'section', secId, `${date}: ${n} student(s) saved`);
  for (const st of ['A', 'L']) {
    const ids = absent.filter((x) => x[1] === st).map((x) => x[0]);
    if (ids.length) await notify('student', ids, { kind: 'attendance', title: st === 'A' ? 'Marked absent' : 'Marked late', body: `Homeroom attendance for ${date}.`, data: { date, status: st } });
  }
  emitData('student', [...studs], 'attendance');
  return `Attendance for ${date} saved (${n} students).`;
}
/** Subject attendance for one class/day, then the absence-limit rules. */
export async function cattSave(req, secId, subId, date, items, by) {
  checkAttDate(date);
  const sec = await db.one('select school_year_id from sections where id=$1 and is_deleted=false', [secId]);
  if (!sec || !Number(await db.val('select count(*) from section_subjects where section_id=$1 and subject_id=$2', [secId, subId]))) throw new HttpError(400, 'Class not found.');
  const yid = sec.school_year_id, studs = new Set((await classStudents(secId)).map((s) => s.id));
  const before = await classAbsences(secId, subId, yid), pol = await policyFor(secId, subId, yid);
  let n = 0;
  await tx(async (t) => {
    for (const it of items || []) {
      const sid = Number(it.student_id), st = String(it.status || '');
      if (!studs.has(sid) || !ATT[st]) continue;
      await t.q('insert into class_attendance(student_id,section_id,subject_id,school_year_id,att_date,status,remarks,marked_by) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict (student_id,subject_id,att_date) do update set status=excluded.status, remarks=excluded.remarks, section_id=excluded.section_id, marked_by=excluded.marked_by',
        [sid, secId, subId, yid, date, st, String(it.remarks || '').trim().slice(0, 120) || null, by.slice(0, 60)]);
      n++;
    }
  });
  await logAction(req, 'class_attendance', 'section', secId, `Subject #${subId} ${date}: ${n} student(s)`);
  const dropped = await applyStanding(req, secId, subId, yid);
  await notifyStanding(req, secId, subId, yid, before, pol.free);
  emitData('student', [...studs], 'attendance');
  return `Attendance for ${date} saved (${n} students).` + (dropped ? ` ${dropped} student(s) exceeded the absence limit and were marked Dropped in the student record.` : '');
}
/** Tell a student (and the subject teacher) when absences cross into Warning or Dropped. */
export async function notifyStanding(req, secId, subId, yid, before, free) {
  const now = await classAbsences(secId, subId, yid), code = await db.val('select code from subjects where id=$1', [subId]);
  const tIds = await db.col('select teacher_id from section_subjects where section_id=$1 and subject_id=$2 and teacher_id is not null', [secId, subId]);
  const names = await db.map('select id, last_name||\', \'||first_name from students where id = any($1::int[])', [Object.keys(now).map(Number)]);
  for (const [sid, a] of Object.entries(now)) {
    const was = standingOf(before[sid] || 0, free), is = standingOf(a, free);
    if (is === was || is === 'ok') continue;
    const dropped = is === 'dropped';
    await notify('student', [+sid], { kind: 'standing', title: dropped ? `Absence limit exceeded in ${code}` : `Absence warning in ${code}`, body: `${a} of ${free} allowed absences used.`, data: { subject: code, absences: a, free, standing: is } });
    if (tIds.length) await notify('teacher', tIds, { kind: 'standing', title: dropped ? `${names[sid]} is over the absence limit` : `${names[sid]} is on absence warning`, body: `${code}: ${a} of ${free} allowed absences.`, data: { subject: code, student: +sid } });
  }
}
export async function applyStanding(req, secId, subId, yid) {
  const pol = await policyFor(secId, subId, yid); if (!pol.apply) return 0;
  const code = await db.val('select code from subjects where id=$1', [subId]); let n = 0;
  for (const [sid, a] of Object.entries(await classAbsences(secId, subId, yid))) {
    if (standingOf(a, pol.free) !== 'dropped') continue;
    const c = await db.q("update students set status='dropped', status_date=$1, status_reason=$2 where id=$3 and status='enrolled' and is_deleted=false", [todayStr(), `Exceeded allowed absences in ${code} (${a} of ${pol.free})`, +sid]);
    if (c.rowCount) { n++; await logAction(req, 'auto_drop', 'student', +sid, `Marked dropped: ${a} absences in ${code}, limit ${pol.free}`); }
  }
  if (n) emitData('admin', await db.col('select id from users where active=true'), 'people');
  return n;
}

/* ---------- class record ---------- */
export const recColumns = (secId, subId, yid, term, dbx = db) => dbx.rows('select * from record_columns where section_id=$1 and subject_id=$2 and school_year_id=$3 and term=$4 and is_deleted=false order by col_date,id', [secId, subId, yid, term]);
export async function recScores(colIds, dbx = db) {
  const o = {}; if (!colIds.length) return o;
  for (const r of await dbx.rows('select column_id,student_id,score from record_scores where column_id = any($1::int[])', [colIds])) (o[r.column_id] ||= {})[r.student_id] = r.score;
  return o;
}
export function recPercent(cols, scores, sid) {
  let num = 0, den = 0;
  for (const c of cols) { const v = scores[c.id]?.[sid]; if (v === undefined || v === null) continue; num += (v / c.max_score * 100) * c.weight; den += c.weight; }
  return den > 0 ? num / den : null;
}
export const transmute = (p) => (p >= 60 ? 75 + (p - 60) * 25 / 40 : 60 + p * 15 / 60);

/* ---------- teacher helpers ---------- */
export async function teacherClasses(tid, yid) {
  const rows = await db.rows('select ss.section_id,ss.subject_id,sc.grade_level,sc.name sec,sc.grading_term,s.code,s.name from section_subjects ss join sections sc on sc.id=ss.section_id and sc.is_deleted=false and sc.school_year_id=$1 join subjects s on s.id=ss.subject_id and s.is_deleted=false where ss.teacher_id=$2 order by sc.grade_level,sc.name,s.name', [yid, tid]);
  return rows.map((x) => ({ ...x, key: x.section_id + ':' + x.subject_id, label: `Grade ${x.grade_level} - ${x.sec} / ${x.code} ${x.name}` }));
}
export const teacherSections = (tid, yid) => db.rows('select id,grade_level,name,adviser_id from sections where school_year_id=$1 and is_deleted=false and (adviser_id=$2 or id in (select section_id from section_subjects where teacher_id=$2)) order by grade_level,name', [yid, tid]);

/* ---------- schedules ---------- */
export const schedRows = (where, p) => db.rows(`select sch.id,sch.section_id,sch.subject_id,sch.day_of_week,sch.start_time,sch.end_time,sch.room,s.code,s.name,sc.name sec,sc.grade_level,t.first_name tf,t.last_name tl from schedules sch join subjects s on s.id=sch.subject_id join sections sc on sc.id=sch.section_id and sc.is_deleted=false left join section_subjects ss on ss.section_id=sch.section_id and ss.subject_id=sch.subject_id left join teachers t on t.id=ss.teacher_id where ${where} order by sch.day_of_week,sch.start_time`, p);

/* ---------- report card (data; the apps draw it) ---------- */
export async function reportCard(stid, yid, released) {
  const r = await db.one('select * from students where id=$1 and is_deleted=false', [stid]); if (!r) return null;
  const secId = yid === r.school_year_id ? (r.section_id || null) : (await db.val('select section_id from grades where student_id=$1 and school_year_id=$2 limit 1', [stid, yid]) || null);
  const sec = secId ? await db.one('select sc.name,sc.grade_level,t.first_name tf,t.last_name tl from sections sc left join teachers t on t.id=sc.adviser_id where sc.id=$1', [secId]) : null;
  const yl = await db.val('select label from school_years where id=$1', [yid]);
  const g = await gradeRows(stid, secId, yid, released);
  const at = await db.map('select status,count(*)::int from attendance where student_id=$1 and school_year_id=$2 group by status', [stid, yid]);
  const fins = g.rows.map((x) => x.final).filter((x) => x !== null);
  const complete = g.rows.length > 0 && fins.length === g.rows.length;
  return {
    name: person(r), studentNo: r.student_no, lrn: r.lrn, sex: r.sex, birthdate: r.birthdate, gradeLevel: sec ? sec.grade_level : r.grade_level, section: sec?.name || null,
    adviser: sec?.tl ? `${sec.tl}, ${sec.tf}` : '', schoolYear: yl, grades: g, attendance: { P: at.P || 0, L: at.L || 0, E: at.E || 0, A: at.A || 0 },
    honor: complete && g.avg !== null ? honorLabel(g.avg, Math.min(...fins) >= PASSING_GRADE) : '',
  };
}

/* ---------- announcements ---------- */
export async function annCreate(req, type, aid, name, title, body, audience, label, secIds, react, comm) {
  const id = await tx(async (t) => {
    const a = await t.one('insert into announcements(author_type,author_id,author_name,title,body,audience,audience_label,allow_reactions,allow_comments) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id', [type, aid, name.slice(0, 120), title, body, audience, label.slice(0, 160), !!react, !!comm]);
    if (audience === 'sections') for (const s of [...new Set(secIds.map(Number))]) await t.q('insert into announcement_targets(announcement_id,section_id) values($1,$2)', [a.id, s]);
    return a.id;
  });
  await logAction(req, 'announce', 'announcement', id, `${title} [${label}]`);
  const rec = audience === 'all' ? await db.col("select id from students where is_deleted=false and status='enrolled' and portal_hash is not null") : await db.col("select id from students where section_id = any($1::int[]) and is_deleted=false and status='enrolled' and portal_hash is not null", [secIds]);
  await notify('student', rec, { kind: 'announcement', title, body: body.slice(0, 140), data: { id, by: name } });
  emitData('student', rec, 'feed');
  return id;
}
