import { Router } from 'express';
import { db, tx } from '../db.js';
import { config } from '../config.js';
import { auth } from '../auth.js';
import { HttpError, bad, wrap, str, int, uniqInts, validDate, person, todayStr, dowToday, sendCsv, fmtNum, round2 } from '../util.js';
import { logAction } from '../log.js';
import { logDelete, tFlag, tRows } from '../trash.js';
import { curYear, teacherClasses, teacherSections, policyFor, classAbsences, standingOf, classStudents, schedRows, recColumns, recScores, recPercent, transmute, gradesSave, attSave, cattSave, applyStanding, annCreate } from '../domain.js';
import { emitData } from '../realtime.js';
import { ok, annDetail, annAct, logsList, logsRestore, pubFind, pubSave, pubDelete, pubReactionData, pubReact, pubList, pubCount, pageOf } from './common.js';
import { articleView, upload, uploadHandler } from '../pub.js';
import { imgBase } from '../storage.js';

export const teacher = Router();
teacher.use(auth('teacher'));
const ctx = async (req) => { const cy = await curYear(); return { yid: cy?.id || 0, year: cy, tid: req.actor.id, my: await teacherClasses(req.actor.id, cy?.id || 0) }; };
const pick = (my, key) => my.find((x) => x.key === key) || my[0] || null;
const writerOnly = wrap(async (req, res, next) => { if (!Number(await db.val('select count(*) from pub_writers where teacher_id=$1', [req.actor.id]))) throw new HttpError(403, 'The administrator has not assigned you to publish articles yet.'); next(); });

teacher.get('/home', wrap(async (req, res) => {
  const { yid, tid, my, year } = await ctx(req), secs = await teacherSections(tid, yid);
  let stu = 0; for (const s of secs) stu += Number(await db.val("select count(*) from students where section_id=$1 and is_deleted=false and status='enrolled'", [s.id]));
  let w = 0, d = 0; const alerts = [];
  for (const c of my) {
    const pol = await policyFor(c.section_id, c.subject_id, yid), stn = Object.fromEntries((await classStudents(c.section_id)).map((s) => [s.id, s]));
    for (const [sid, n] of Object.entries(await classAbsences(c.section_id, c.subject_id, yid))) { const st = standingOf(n, pol.free); if (st === 'ok' || !stn[sid]) continue; st === 'warning' ? w++ : d++; alerts.push({ standing: st, n, free: pol.free, code: c.code, student: person(stn[sid]) }); }
  }
  alerts.sort((a, b) => ((b.standing === 'dropped') - (a.standing === 'dropped')) || b.n - a.n);
  const dow = dowToday();
  const today = dow > 5 ? [] : await schedRows('sc.school_year_id=$1 and sch.day_of_week=$2 and exists (select 1 from section_subjects x where x.section_id=sch.section_id and x.subject_id=sch.subject_id and x.teacher_id=$3)', [yid, dow, tid]);
  res.json({ ok: true, year, sections: secs.length, students: stu, classes: my.length, warnings: w, dropped: d, today, alerts: alerts.slice(0, 8) });
}));

/* ----- sections ----- */
teacher.get('/sections', wrap(async (req, res) => {
  const { yid, tid } = await ctx(req), secs = await teacherSections(tid, yid), out = [];
  for (const s of secs) out.push({ ...s, students: Number(await db.val("select count(*) from students where section_id=$1 and is_deleted=false and status='enrolled'", [s.id])), teaching: await db.col('select s.code from section_subjects ss join subjects s on s.id=ss.subject_id where ss.section_id=$1 and ss.teacher_id=$2 order by s.name', [s.id, tid]), isAdviser: s.adviser_id === tid });
  res.json({ ok: true, rows: out });
}));
teacher.get('/sections/:id', wrap(async (req, res) => {
  const { yid, tid } = await ctx(req), id = int(req.params.id), secs = await teacherSections(tid, yid), sec = secs.find((s) => s.id === id);
  if (!sec) throw new HttpError(404, 'Section not found.');
  const tch = await db.rows('select s.id,s.code,s.name from section_subjects ss join subjects s on s.id=ss.subject_id and s.is_deleted=false where ss.section_id=$1 and ss.teacher_id=$2 order by s.name', [id, tid]);
  const stand = {};
  for (const sb of tch) { const pol = await policyFor(id, sb.id, yid); for (const [sid, n] of Object.entries(await classAbsences(id, sb.id, yid))) { const st = standingOf(n, pol.free); if (st !== 'ok') (stand[sid] ||= []).push({ code: sb.code, standing: st, n, free: pol.free }); } }
  const adv = await db.one('select first_name,last_name from teachers where id=$1', [sec.adviser_id || 0]);
  const students = [];
  for (const s of await classStudents(id)) { const f = await db.one('select guardian_name,guardian_contact,emergency_name,emergency_relation,emergency_contact from students where id=$1', [s.id]); students.push({ id: s.id, student_no: s.student_no, name: person(s), sex: s.sex, ...f, standing: stand[s.id] || [] }); }
  res.json({ ok: true, section: sec, adviser: adv ? `${adv.last_name}, ${adv.first_name}` : 'None', subjects: tch, students });
}));
teacher.get('/schedule', wrap(async (req, res) => {
  const { yid, tid } = await ctx(req), sec = int(req.query.sec);
  const rows = await schedRows(`sc.school_year_id=$1 and ${sec ? 'sch.section_id=$3 and' : ''} exists (select 1 from section_subjects x where x.section_id=sch.section_id and x.subject_id=sch.subject_id and x.teacher_id=$2)`, sec ? [yid, tid, sec] : [yid, tid]);
  res.json({ ok: true, rows });
}));

/* ----- lesson log ----- */
teacher.get('/lessons', wrap(async (req, res) => {
  const { tid, my } = await ctx(req), c = pick(my, str(req.query.pick, 20));
  res.json({ ok: true, classes: my, pick: c?.key || null, rows: c ? await db.rows('select id,log_date,topic,notes from lesson_logs where section_id=$1 and subject_id=$2 and teacher_id=$3 and is_deleted=false order by log_date desc,id desc limit 40', [c.section_id, c.subject_id, tid]) : [] });
}));
teacher.post('/lessons', wrap(async (req, res) => {
  const { tid, my } = await ctx(req), c = pick(my, str(req.body.pick, 20)); if (!c) throw bad('You have no classes assigned.');
  const d = str(req.body.log_date, 10), tp = str(req.body.topic, 160), nt = str(req.body.notes, 3000);
  const max = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  if (!validDate(d) || d > max || !tp) throw bad('Enter a topic and a valid date.');
  await db.q('insert into lesson_logs(teacher_id,section_id,subject_id,log_date,topic,notes) values($1,$2,$3,$4,$5,$6)', [tid, c.section_id, c.subject_id, d, tp, nt || null]);
  await logAction(req, 'lesson_log', 'section', c.section_id, tp); ok(req, res, { message: 'Lesson logged.' });
}));
teacher.post('/lessons/:id/delete', wrap(async (req, res) => {
  const { tid } = await ctx(req), id = int(req.params.id), ll = await db.one('select topic,log_date from lesson_logs where id=$1 and teacher_id=$2 and is_deleted=false', [id, tid]);
  if (ll) { await logDelete(req, 'delete', 'lesson_log', id, 'Lesson removed: ' + ll.topic, `Lesson: ${ll.topic} (${ll.log_date})`, [tFlag('lesson_logs', id)], 'Lesson entry removed: ' + ll.topic.slice(0, 60)); await db.q('update lesson_logs set is_deleted=true where id=$1 and teacher_id=$2', [id, tid]); }
  ok(req, res, { message: 'Lesson removed.' });
}));

/* ----- class record ----- */
async function recordCtx(req, src) {
  const { yid, tid, my } = await ctx(req), c = pick(my, str(src.pick, 20));
  if (!c) throw new HttpError(403, 'You are not assigned to that class.');
  let term = int(src.term, c.grading_term); if (term < 1 || term > 4) term = 1;
  const locked = !!Number(await db.val('select count(*) from term_release where school_year_id=$1 and term=$2', [yid, term]));
  return { yid, tid, my, c, term, locked, secId: c.section_id, subId: c.subject_id };
}
async function recordData(x) {
  const cols = await recColumns(x.secId, x.subId, x.yid, x.term), studs = await classStudents(x.secId), sc = await recScores(cols.map((c) => c.id)), pol = await policyFor(x.secId, x.subId, x.yid), abs = await classAbsences(x.secId, x.subId, x.yid);
  return { cols, studs, sc, pol, abs };
}
teacher.get('/record', wrap(async (req, res) => {
  const x = await recordCtx(req, req.query), { cols, studs, sc, pol, abs } = await recordData(x);
  res.json({ ok: true, classes: x.my, pick: x.c.key, term: x.term, locked: x.locked, label: x.c.label, maxCols: config.MAX_RECORD_COLS, columns: cols,
    students: studs.map((s) => { const p = recPercent(cols, sc, s.id); return { id: s.id, student_no: s.student_no, name: person(s), scores: Object.fromEntries(cols.map((c) => [c.id, sc[c.id]?.[s.id] ?? null])), percent: p === null ? null : round2(p), absences: abs[s.id] || 0, standing: standingOf(abs[s.id] || 0, pol.free) }; }), free: pol.free }); 
}));
teacher.get('/record/csv', wrap(async (req, res) => {
  const x = await recordCtx(req, req.query), { cols, studs, sc } = await recordData(x);
  const rows = [['Student ID', 'Student', ...cols.map((c) => `${c.title} (${c.col_date}) /${fmtNum(c.max_score)}`), 'Percent']];
  for (const s of studs) { const p = recPercent(cols, sc, s.id); rows.push([s.student_no, person(s), ...cols.map((c) => (sc[c.id]?.[s.id] != null ? fmtNum(sc[c.id][s.id]) : '')), p === null ? '' : round2(p)]); }
  await logAction(req, 'export', 'section', x.secId, 'Class record CSV'); sendCsv(res, `class_record_${x.secId}_${x.subId}_T${x.term}.csv`, rows);
}));
const colFields = (b) => ({ ti: str(b.title, 60), d: str(b.col_date, 10), mx: Number(b.max_score || 0), w: Number(b.weight ?? 1) });
teacher.post('/record/addcol', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body), { ti, d, mx, w } = colFields(req.body), n = (await recColumns(x.secId, x.subId, x.yid, x.term)).length;
  if (!ti || !validDate(d)) throw bad('Enter a column title and a valid date.');
  if (!(mx > 0 && mx <= 1000)) throw bad('Highest possible score must be between 1 and 1000.');
  if (!(w > 0 && w <= 10)) throw bad('Weight must be between 0.1 and 10.');
  if (n >= config.MAX_RECORD_COLS) throw bad(`A class record can have at most ${config.MAX_RECORD_COLS} columns per term.`);
  await db.q('insert into record_columns(section_id,subject_id,school_year_id,term,title,col_date,max_score,weight,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [x.secId, x.subId, x.yid, x.term, ti, d, mx, w, x.tid]);
  await logAction(req, 'add_column', 'section', x.secId, `Subject #${x.subId} T${x.term}: ${ti}`); ok(req, res, { message: `Column "${ti}" added.` });
}));
async function colOf(x, id) { const col = (await recColumns(x.secId, x.subId, x.yid, x.term)).find((c) => c.id === id); if (!col) throw bad('Column not found.'); return col; }
teacher.post('/record/col/:id', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body), id = int(req.params.id); await colOf(x, id); const { ti, d, mx, w } = colFields(req.body);
  const top = Number(await db.val('select coalesce(max(score),0) from record_scores where column_id=$1', [id]));
  if (!ti || !validDate(d) || !(mx > 0 && mx <= 1000) || !(w > 0 && w <= 10)) throw bad('Check the title, date, highest score and weight.');
  if (mx < top) throw bad(`Highest possible score cannot be lower than a score already entered (${fmtNum(top)}).`);
  await db.q('update record_columns set title=$1,col_date=$2,max_score=$3,weight=$4 where id=$5', [ti, d, mx, w, id]); await logAction(req, 'edit_column', 'section', x.secId, ti); ok(req, res, { message: 'Column updated.' });
}));
teacher.post('/record/col/:id/delete', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body), id = int(req.params.id), col = await colOf(x, id);
  await logDelete(req, 'delete_column', 'section', x.secId, 'Column: ' + col.title, 'Class record column: ' + col.title, [tFlag('record_columns', id)], 'Column removed: ' + col.title.slice(0, 60));
  await db.q('update record_columns set is_deleted=true where id=$1', [id]); ok(req, res, { message: 'Column removed.' });
}));
teacher.post('/record/scores', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body), { cols, studs, sc } = await recordData(x), ops = [], badL = [], inp = req.body.s || {};
  for (const cl of cols) for (const s of studs) {
    const raw = String(inp[cl.id]?.[s.id] ?? '').trim(), old = sc[cl.id]?.[s.id] ?? null;
    if (raw === '') { if (old !== null) ops.push(['del', cl.id, s.id]); continue; }
    const n = Number(raw); if (!Number.isFinite(n) || n < 0 || n > cl.max_score) { badL.push(`${s.student_no || s.lrn} (${cl.title})`); continue; }
    const v = round2(n); if (old === null || Math.abs(old - v) > 0.001) ops.push(['set', cl.id, s.id, v]);
  }
  if (badL.length) throw bad('Scores must be between 0 and the highest possible score. Nothing was saved. Check: ' + badL.slice(0, 6).join(', '));
  const gone = [];
  await tx(async (t) => {
    for (const o of ops) { if (o[0] === 'del') { const g = await t.one('select * from record_scores where column_id=$1 and student_id=$2', [o[1], o[2]]); if (g) gone.push(g); await t.q('delete from record_scores where column_id=$1 and student_id=$2', [o[1], o[2]]); } else await t.q('insert into record_scores(column_id,student_id,score) values($1,$2,$3) on conflict (column_id,student_id) do update set score=excluded.score', [o[1], o[2], o[3]]); }
    if (gone.length) { const { trashAdd } = await import('../trash.js'); const lid = await logAction(req, 'scores_cleared', 'section', x.secId, `Subject #${x.subId} T${x.term}: ${gone.length} score(s) cleared`, t); const tr = await trashAdd(req, 'record_scores', x.secId, `${gone.length} cleared score(s), Term ${x.term}`, [tRows('record_scores', gone)], t); if (lid) await t.q('update trash set log_id=$1 where id=$2', [lid, tr]); req.undo = { id: tr, message: `${gone.length} score(s) cleared`, seconds: config.UNDO_SECONDS }; }
  });
  await logAction(req, 'record_scores', 'section', x.secId, `Subject #${x.subId} T${x.term}: ${ops.length} change(s)`); ok(req, res, { message: `${ops.length} score change(s) saved.` });
}));
teacher.post('/record/pushgrade', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body); if (x.locked) throw bad(`Term ${x.term} grades are released to students. Ask the registrar to hide the term before editing.`);
  const { cols, studs, sc } = await recordData(x), ex = await db.map('select student_id,grade from grades where subject_id=$1 and school_year_id=$2 and term=$3', [x.subId, x.yid, x.term]), g = {};
  for (const s of studs) { const p = recPercent(cols, sc, s.id); g[s.id] = p === null ? (ex[s.id] !== undefined ? String(ex[s.id]) : '') : String(round2(req.body.transmute ? transmute(p) : p)); }
  const m = await gradesSave(req, x.secId, x.subId, x.term, g); ok(req, res, { message: `Class record copied to Term ${x.term} grades. ${m}` });
}));

/* ----- term grades ----- */
teacher.get('/grades', wrap(async (req, res) => {
  const { yid, my } = await ctx(req), c = pick(my, str(req.query.pick, 20)); if (!c) return res.json({ ok: true, classes: [], students: [] });
  let term = int(req.query.term, c.grading_term); if (term < 1 || term > 4) term = 1;
  const locked = !!Number(await db.val('select count(*) from term_release where school_year_id=$1 and term=$2', [yid, term])), g = await db.map('select student_id,grade from grades where subject_id=$1 and school_year_id=$2 and term=$3', [c.subject_id, yid, term]);
  res.json({ ok: true, classes: my, pick: c.key, term, locked, passing: config.PASSING_GRADE, students: (await classStudents(c.section_id)).map((s) => ({ id: s.id, student_no: s.student_no, name: person(s), grade: g[s.id] ?? null })) });
}));
teacher.post('/grades/save', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body); if (x.locked) throw bad(`Term ${x.term} grades are already released to students. Ask the registrar to hide the term before editing.`);
  ok(req, res, { message: await gradesSave(req, x.secId, x.subId, x.term, req.body.g || {}) });
}));

/* ----- subject attendance ----- */
teacher.get('/cattendance', wrap(async (req, res) => {
  const { yid, my } = await ctx(req), c = pick(my, str(req.query.pick, 20)); if (!c) return res.json({ ok: true, classes: [], students: [] });
  let date = str(req.query.date, 10); if (!validDate(date)) date = todayStr(); let month = str(req.query.month, 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) month = date.slice(0, 7);
  const pol = await policyFor(c.section_id, c.subject_id, yid), abs = await classAbsences(c.section_id, c.subject_id, yid);
  const ex = Object.fromEntries((await db.rows('select student_id,status,remarks from class_attendance where section_id=$1 and subject_id=$2 and att_date=$3', [c.section_id, c.subject_id, date])).map((r) => [r.student_id, r]));
  const to = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).toISOString().slice(0, 10), cells = {}, dates = new Set();
  for (const r of await db.rows('select student_id,att_date,status from class_attendance where section_id=$1 and subject_id=$2 and att_date between $3 and $4', [c.section_id, c.subject_id, month + '-01', to])) { (cells[r.student_id] ||= {})[r.att_date] = r.status; dates.add(r.att_date); }
  res.json({ ok: true, classes: my, pick: c.key, date, month, policy: pol, recorded: !!Object.keys(ex).length, dates: [...dates].sort(), cells,
    students: (await classStudents(c.section_id)).map((s) => ({ id: s.id, name: person(s), status: ex[s.id]?.status || 'P', remarks: ex[s.id]?.remarks || '', absences: abs[s.id] || 0, standing: standingOf(abs[s.id] || 0, pol.free) })) });
}));
teacher.post('/cattendance/save', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body); ok(req, res, { message: await cattSave(req, x.secId, x.subId, str(req.body.date, 10), req.body.items, req.actor.uname) });
}));
teacher.post('/cattendance/policy', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body), free = int(req.body.free), ap = !!req.body.apply; if (free < 1 || free > 100) throw bad('Allowed absences must be between 1 and 100.');
  await db.q('insert into class_policy(section_id,subject_id,school_year_id,free_absences,apply_to_record,updated_by) values($1,$2,$3,$4,$5,$6) on conflict (section_id,subject_id,school_year_id) do update set free_absences=excluded.free_absences, apply_to_record=excluded.apply_to_record, updated_by=excluded.updated_by', [x.secId, x.subId, x.yid, free, ap, req.actor.uname]);
  await logAction(req, 'absence_policy', 'section', x.secId, `Subject #${x.subId} free=${free} apply=${ap}`); const d = await applyStanding(req, x.secId, x.subId, x.yid);
  ok(req, res, { message: 'Absence rule saved.' + (d ? ` ${d} student(s) already over the limit were marked Dropped.` : '') });
}));
teacher.post('/cattendance/deldate', wrap(async (req, res) => {
  const x = await recordCtx(req, req.body), d = str(req.body.date, 10); if (!validDate(d)) throw bad('Date not found.');
  const gone = await db.rows('select * from class_attendance where section_id=$1 and subject_id=$2 and att_date=$3 and school_year_id=$4', [x.secId, x.subId, d, x.yid]);
  if (gone.length) await logDelete(req, 'delete_attendance_date', 'section', x.secId, `Subject #${x.subId} ${d}: ${gone.length} record(s)`, `Attendance of ${x.c.code} on ${d} (${gone.length} students)`, [tRows('class_attendance', gone)], `Attendance for ${d} removed`);
  await db.q('delete from class_attendance where section_id=$1 and subject_id=$2 and att_date=$3 and school_year_id=$4', [x.secId, x.subId, d, x.yid]); ok(req, res, { message: 'Attendance for that date removed.' });
}));
teacher.get('/standing', wrap(async (req, res) => {
  const { yid, my } = await ctx(req), rows = [];
  for (const c of my) { const pol = await policyFor(c.section_id, c.subject_id, yid), abs = await classAbsences(c.section_id, c.subject_id, yid); for (const s of await classStudents(c.section_id)) { const n = abs[s.id] || 0; rows.push({ cls: c.label, student_no: s.student_no, student: person(s), n, free: pol.free, pct: Math.round(n / Math.max(1, pol.free) * 100), standing: standingOf(n, pol.free) }); } }
  if (req.query.csv) { await logAction(req, 'export', 'teacher', req.actor.id, 'Absence watch CSV'); return sendCsv(res, 'absence_watch.csv', [['Class', 'Student ID', 'Student', 'Absences', 'Allowed', 'Used %', 'Standing'], ...rows.map((r) => [r.cls, r.student_no, r.student, r.n, r.free, r.pct, r.standing])]); }
  res.json({ ok: true, rows, warning: rows.filter((r) => r.standing === 'warning').length, dropped: rows.filter((r) => r.standing === 'dropped').length });
}));

/* ----- homeroom attendance (adviser) ----- */
teacher.get('/homeroom', wrap(async (req, res) => {
  const { yid, tid } = await ctx(req), adv = await db.rows('select id,grade_level,name from sections where adviser_id=$1 and school_year_id=$2 and is_deleted=false order by grade_level,name', [tid, yid]);
  if (!adv.length) return res.json({ ok: true, sections: [] });
  const sec = adv.find((a) => a.id === int(req.query.sec)) || adv[0]; let date = str(req.query.date, 10); if (!validDate(date)) date = todayStr();
  const ex = Object.fromEntries((await db.rows('select student_id,status,remarks from attendance where section_id=$1 and att_date=$2', [sec.id, date])).map((r) => [r.student_id, r]));
  res.json({ ok: true, sections: adv, sec: sec.id, date, recorded: !!Object.keys(ex).length, students: (await classStudents(sec.id)).map((s) => ({ id: s.id, name: person(s), status: ex[s.id]?.status || 'P', remarks: ex[s.id]?.remarks || '' })) });
}));
teacher.post('/homeroom/save', wrap(async (req, res) => {
  const { yid, tid } = await ctx(req), sec = int(req.body.sec);
  if (!Number(await db.val('select count(*) from sections where id=$1 and adviser_id=$2 and school_year_id=$3 and is_deleted=false', [sec, tid, yid]))) throw bad('You can only mark attendance for your advisory section.');
  ok(req, res, { message: await attSave(req, sec, str(req.body.date, 10), req.body.items, req.actor.uname) });
}));

/* ----- announcements ----- */
teacher.get('/announcements', wrap(async (req, res) => {
  const { yid, tid } = await ctx(req), secs = await teacherSections(tid, yid);
  res.json({ ok: true, sections: secs, rows: await db.rows("select a.id,a.title,a.audience_label,a.allow_reactions,a.allow_comments,a.created_at,(select count(*) from announcement_reactions r where r.announcement_id=a.id)::int rx,(select count(*) from announcement_comments c where c.announcement_id=a.id and c.is_deleted=false)::int cm from announcements a where a.author_type='teacher' and a.author_id=$1 and a.is_deleted=false order by a.id desc limit 100", [tid]) });
}));
const myAnn = async (req) => { const a = await db.one("select * from announcements where id=$1 and author_type='teacher' and author_id=$2 and is_deleted=false", [int(req.params.id), req.actor.id]); if (!a) throw new HttpError(404, 'Announcement not found.'); return a; };
teacher.get('/announcements/:id', wrap(async (req, res) => res.json({ ok: true, announcement: await annDetail(await myAnn(req)) })));
teacher.post('/announcements', wrap(async (req, res) => {
  const { yid, tid } = await ctx(req), secs = await teacherSections(tid, yid), mine = new Map(secs.map((s) => [s.id, s]));
  const ti = str(req.body.title, 160), b = str(req.body.body, 5000), mode = str(req.body.mode, 10); let ids = [], label = '';
  const lab = (s) => `Grade ${s.grade_level} - ${s.name}`;
  if (mode === 'advisory') for (const s of secs) if (s.adviser_id === tid) { ids.push(s.id); label = 'Advisory: ' + lab(s); }
  if (mode === 'selected') { ids = uniqInts(req.body.section_ids).filter((x) => mine.has(x)); label = ids.length + ' selected section(s)'; }
  if (mode === 'all') { ids = secs.map((s) => s.id); label = `All my sections (${ids.length})`; }
  if (!ti || !b) throw bad('Enter a title and a message.');
  if (!ids.length) throw bad(mode === 'advisory' ? 'You are not an adviser this school year.' : 'Choose at least one section.');
  const id = await annCreate(req, 'teacher', tid, req.actor.name, ti, b, 'sections', label, ids, !!req.body.allow_reactions, !!req.body.allow_comments);
  ok(req, res, { id, message: `Announcement posted to ${ids.length} section(s).` });
}));
teacher.post('/announcements/:id/:act', wrap(async (req, res) => { const a = await myAnn(req); const r = await annAct(req, a, req.params.act, req.body, 'teacher', req.actor.id, req.actor.name); ok(req, res, { message: r, deleted: r === 'deleted' }); }));
teacher.get('/notices', wrap(async (req, res) => res.json({ ok: true, rows: await db.rows("select id,title,body,created_at from notices where is_deleted=false and audience in ('all','teachers','staff') order by id desc limit 100") })));
teacher.get('/profile', wrap(async (req, res) => {
  const t = await db.one('select teacher_no,first_name,last_name,birthdate,address,contact_no,spouse,status from teachers where id=$1', [req.actor.id]);
  res.json({ ok: true, profile: t, subjects: await db.rows('select s.code,s.name from subjects s join subject_teachers x on x.subject_id=s.id where x.teacher_id=$1 and s.is_deleted=false', [req.actor.id]) });
}));

/* ----- publications: read and react (everyone), write (assigned writers) ----- */
teacher.get('/pub/read', wrap(async (req, res) => {
  const { p, per, off } = pageOf(req, 12), q = str(req.query.q, 80), rows = await pubList(per, off, 0, q), { counts, mine } = await pubReactionData(rows.map((r) => r.id), 'teacher', req.actor.id);
  res.json({ ok: true, imgBase: imgBase(), total: await pubCount(q), page: p, per, rows: rows.map((r) => ({ ...r, counts: counts[r.id] || {}, mine: mine[r.id] || null })) });
}));
teacher.get('/pub/read/:slug', wrap(async (req, res) => {
  const a = await db.one("select * from pub_articles where slug=$1 and status='published' and is_deleted=false", [str(req.params.slug, 90)]); if (!a) throw new HttpError(404, 'Article not found.');
  const { counts, mine } = await pubReactionData([a.id], 'teacher', req.actor.id);
  res.json({ ok: true, imgBase: imgBase(), article: articleView(a), counts: counts[a.id] || {}, mine: mine[a.id] || null, more: await pubList(3, 0, a.id) });
}));
teacher.post('/pub/react', wrap(async (req, res) => ok(req, res, await pubReact('teacher', req.actor.id, int(req.body.pid), str(req.body.reaction, 10)))));
teacher.post('/pub/upload', writerOnly, (req, res, next) => upload(req, res, (e) => (e ? next(new HttpError(400, 'That file is too large (6 MB max).')) : next())), uploadHandler('teacher'));
teacher.get('/pub/articles', writerOnly, wrap(async (req, res) => res.json({ ok: true, imgBase: imgBase(), rows: await db.rows("select id,slug,title,excerpt,cover,status,published_at,updated_at,created_at from pub_articles where is_deleted=false and author_type='teacher' and author_id=$1 order by coalesce(published_at,created_at) desc,id desc limit 200", [req.actor.id]) })));
teacher.get('/pub/articles/:id', writerOnly, wrap(async (req, res) => { const a = await pubFind(int(req.params.id), 'teacher', req.actor.id); if (!a) throw new HttpError(404, 'Article not found.'); res.json({ ok: true, article: articleView(a), imgBase: imgBase() }); }));
teacher.post('/pub/articles', writerOnly, wrap(async (req, res) => ok(req, res, await pubSave(req, 'teacher', req.actor.id, req.actor.name))));
teacher.post('/pub/articles/:id/delete', writerOnly, wrap(async (req, res) => { await pubDelete(req, int(req.params.id), 'teacher', req.actor.id); ok(req, res, { message: 'Article deleted.' }); }));

teacher.get('/logs', wrap(async (req, res) => res.json({ ok: true, ...(await logsList(req, 'teacher')) })));
teacher.post('/logs/restore', wrap(async (req, res) => ok(req, res, { message: await logsRestore(req, 'teacher') })));
