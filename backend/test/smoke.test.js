// End-to-end smoke test. Needs a running server and an empty database with one admin:
//   BASE=http://localhost:3000 ADMIN_USER=admin ADMIN_PASS=... node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://localhost:3000', API = BASE + '/api/v1';
const A_USER = process.env.ADMIN_USER || 'admin', A_PASS = process.env.ADMIN_PASS || 'Str0ng!Passw0rd#';
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || ''; const j = ct.includes('json') ? await r.json() : await r.text();
  return { status: r.status, ...(typeof j === 'object' ? j : { text: j }) };
};
const S = {};
test('admin signs in', async () => {
  const r = await call('POST', '/auth/login', null, { role: 'admin', id: A_USER, password: A_PASS }); assert.equal(r.ok, true); S.a = r.token;
  assert.equal((await call('POST', '/auth/login', null, { role: 'admin', id: A_USER, password: 'wrong' })).status, 401);
});
test('setup: year, teacher, student, subject, section', async () => {
  const label = '2026-2027'; let r = await call('POST', '/admin/years', S.a, { label, start_date: '2026-06-01', end_date: '2027-03-31' });
  if (r.status === 200) { const ys = (await call('GET', '/admin/years', S.a)).rows; await call('POST', `/admin/years/${ys[0].id}/current`, S.a); }
  const lk = await call('GET', '/admin/lookups', S.a); S.y = lk.currentYearId; assert.ok(S.y);
  r = await call('POST', '/admin/teachers', S.a, { first_name: 'Ana', last_name: 'Reyes', birthdate: '1985-05-05', address: 'Calape', contact_no: '09171234567' });
  assert.equal(r.ok, true); assert.match(r.issued.no, /^T-\d{5}$/); S.tid = r.id; S.tno = r.issued.no;
  r = await call('POST', '/admin/students', S.a, { lrn: String(Date.now()).padEnd(12, '0').slice(0, 12), first_name: 'Juan', last_name: 'Cruz', sex: 'M', birthdate: '2012-01-02', address: 'Calape', grade_level: 7, school_year_id: S.y, guardian_name: 'Maria Cruz', guardian_contact: '09170000000', emergency_name: 'Maria Cruz', emergency_contact: '09170000000', emergency_relation: 'Mother' });
  assert.equal(r.ok, true); assert.match(r.issued.no, /^202627-\d{5}$/); S.sid = r.id; S.sno = r.issued.no;
  r = await call('POST', '/admin/subjects', S.a, { code: 'MATH7' + (Date.now() % 1000), name: 'Mathematics 7', grade_level: 7, teachers: [S.tid] }); assert.equal(r.ok, true); S.sub = r.id;
  r = await call('POST', '/admin/sections', S.a, { y: S.y, grade: 7, count: 1, term: 1, names: [(S.secName = 'Sampaguita' + Date.now())] }); assert.equal(r.ok, true);
  S.sec = (await call('GET', `/admin/sections?y=${S.y}`, S.a)).rows.find((x) => x.name === S.secName).id;
  assert.equal((await call('POST', `/admin/sections/${S.sec}/addsub`, S.a, { subject_id: S.sub })).ok, true);
  assert.equal((await call('POST', `/admin/sections/${S.sec}/add`, S.a, { student_ids: [S.sid] })).ok, true);
  assert.equal((await call('POST', `/admin/sections/${S.sec}/update`, S.a, { name: (await call('GET', `/admin/sections/${S.sec}`, S.a)).section.name, term: 1, adviser_id: S.tid })).ok, true);
});
test('portal accounts + forced password change', async () => {
  let r = await call('POST', `/admin/teachers/${S.tid}/portal-reset`, S.a); S.tpw = r.cred.pw; assert.equal(r.cred.id, S.tno);
  r = await call('POST', `/admin/students/${S.sid}/portal-reset`, S.a); S.spw = r.cred.pw;
  r = await call('POST', '/auth/login', null, { role: 'teacher', id: S.tno, password: S.tpw, device: 'mobile' }); assert.equal(r.ok, true); S.t = r.token;
  assert.equal((await call('GET', '/teacher/home', S.t)).code, 'MUST_CHANGE');
  r = await call('POST', '/auth/password', S.t, { current: S.tpw, new: 'Teacher!Pass2026x', confirm: 'Teacher!Pass2026x' }); assert.equal(r.ok, true);
  r = await call('POST', '/auth/login', null, { role: 'teacher', id: S.tno, password: 'Teacher!Pass2026x', device: 'mobile' }); S.t = r.token;
  r = await call('POST', '/auth/login', null, { role: 'student', id: S.sno, password: S.spw, device: 'mobile' }); S.s = r.token;
  assert.equal((await call('POST', '/auth/password', S.s, { current: S.spw, new: 'bluebird2026x', confirm: 'bluebird2026x' })).ok, true);
  S.s = (await call('POST', '/auth/login', null, { role: 'student', id: S.sno, password: 'bluebird2026x', device: 'mobile' })).token;
});
test('teacher: grades, attendance; realtime push reaches the student', async () => {
  await call('POST', '/admin/grades/release', S.a, { y: S.y, term: 1, on: false });
  const msgs = []; const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); await new Promise((res) => ws.on('open', res));
  ws.on('message', (m) => msgs.push(JSON.parse(m))); ws.send(JSON.stringify({ type: 'auth', token: S.s })); await new Promise((r) => setTimeout(r, 400));
  assert.ok(msgs.some((m) => m.type === 'ready'));
  const home = await call('GET', '/teacher/home', S.t); assert.equal(home.classes, 1);
  const pick = `${S.sec}:${S.sub}`;
  let r = await call('POST', '/teacher/grades/save', S.t, { pick, term: 1, g: { [S.sid]: '88.5' } }); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await call('POST', '/teacher/grades/save', S.t, { pick, term: 1, g: { [S.sid]: '120' } })).status, 400);
  r = await call('POST', '/teacher/homeroom/save', S.t, { sec: S.sec, date: '2026-11-13', items: [{ student_id: S.sid, status: 'A', remarks: 'sick' }] }); assert.equal(r.ok, true, JSON.stringify(r));
  r = await call('POST', '/teacher/cattendance/policy', S.t, { pick, free: 1, apply: true }); assert.equal(r.ok, true);
  for (const d of ['2026-11-12', '2026-11-13']) r = await call('POST', '/teacher/cattendance/save', S.t, { pick, date: d, items: [{ student_id: S.sid, status: 'A' }] });
  assert.match(r.message, /Dropped/);
  assert.equal((await call('GET', '/student/grades', S.s)).grades.rows[0].t[1], undefined, 'grades hidden until released');
  await call('POST', '/admin/grades/release', S.a, { y: S.y, term: 1, on: true }); await new Promise((r2) => setTimeout(r2, 300));
  assert.equal((await call('GET', '/student/grades', S.s)).grades.rows[0].t[1], 88.5);
  assert.ok(msgs.some((m) => m.type === 'notification' && /Term 1/.test(m.n.title)), 'live notification arrived');
  assert.ok(msgs.some((m) => m.type === 'notification' && /Marked absent/.test(m.n.title)));
  ws.close();
});
test('record, announcement, feed, restore', async () => {
  const pick = `${S.sec}:${S.sub}`;
  let r = await call('POST', '/teacher/record/addcol', S.t, { pick, term: 2, title: 'Quiz 1', col_date: '2026-11-10', max_score: 20, weight: 1 }); assert.equal(r.ok, true);
  r = await call('GET', `/teacher/record?pick=${pick}&term=2`, S.t); assert.equal(r.columns.length, 1);
  r = await call('POST', '/teacher/announcements', S.t, { title: 'Exam week', body: 'Bring pencils', mode: 'advisory', allow_reactions: true, allow_comments: true }); assert.equal(r.ok, true); S.ann = r.id;
  r = await call('GET', '/student/feed', S.s); assert.ok(r.items.some((i) => i.title === 'Exam week'));
  assert.equal((await call('POST', '/student/feed/react', S.s, { aid: S.ann, reaction: 'like' })).mine, 'like');
  assert.equal((await call('POST', '/student/feed/comment', S.s, { aid: S.ann, body: 'Thanks!' })).ok, true);
  r = await call('POST', `/teacher/announcements/${S.ann}/delete`, S.t, {}); assert.ok(r.undo, 'delete returns an undo');
  assert.equal((await call('POST', '/teacher/logs/restore', S.t, { id: r.undo.id })).ok, true);
  assert.ok((await call('GET', '/student/feed', S.s)).items.some((i) => i.title === 'Exam week'), 'restored');
});
test('publications: writer, editor save, public website', async () => {
  assert.equal((await call('POST', '/teacher/pub/articles', S.t, { title: 'x', blocks: [] })).status, 403);
  assert.equal((await call('POST', '/admin/pub/writers', S.a, { teacher_id: S.tid })).ok, true);
  const r = await call('POST', '/teacher/pub/articles', S.t, { title: 'Our Intramurals', status: 'published', blocks: [{ type: 'h1', text: 'Hello <script>alert(1)</script>' }, { type: 'text', text: 'Great day.\n\nSecond paragraph.' }, { type: 'link', label: 'Bad', url: 'javascript:alert(1)' }] });
  assert.equal(r.ok, true, JSON.stringify(r)); const slug = r.article.slug;
  const html = await (await fetch(`${BASE}/publication/${slug}`)).text();
  assert.match(html, /Our Intramurals/); assert.doesNotMatch(html, /<script>alert/); assert.doesNotMatch(html, /javascript:/);
  assert.match(await (await fetch(`${BASE}/publications`)).text(), /Our Intramurals/);
  assert.match(await (await fetch(BASE + '/')).text(), /Calape National High School/);
  assert.equal((await call('POST', '/student/pub/react', S.s, { pid: r.id, reaction: 'love' })).mine, 'love');
});
test('security: wrong role, bad token, logout', async () => {
  assert.equal((await call('GET', '/admin/students', S.t)).status, 403);
  assert.equal((await call('GET', '/admin/students', 'nope')).status, 401);
  assert.equal((await call('POST', '/auth/logout', S.s)).ok, true);
  assert.equal((await call('GET', '/student/home', S.s)).status, 401);
});
