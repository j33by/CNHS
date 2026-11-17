// Calls every read endpoint (and a few writes) and fails on any 5xx. Run after smoke.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://localhost:3000', API = BASE + '/api/v1';
const call = async (m, p, t, b) => { const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.text(); let j; try { j = JSON.parse(x); } catch { j = { text: x }; } return { status: r.status, ...j }; };
test('no endpoint answers 500', async () => {
  const a = (await call('POST', '/auth/login', null, { role: 'admin', id: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || 'Str0ng!Passw0rd#' })).token;
  const lk = await call('GET', '/admin/lookups', a), y = lk.currentYearId;
  const T = (await call('GET', '/admin/teachers?q=Reyes', a)).rows[0], S = (await call('GET', '/admin/students?q=Cruz', a)).rows[0];
  const sec = (await call('GET', `/admin/sections?y=${y}`, a)).rows[0], sub = (await call('GET', '/admin/subjects', a)).rows[0];
  const t = (await call('POST', `/admin/teachers/${T.id}/portal-reset`, a)).cred, s = (await call('POST', `/admin/students/${S.id}/portal-reset`, a)).cred;
  // fresh temp passwords must be changed first
  const ch = async (role, id, pw, np) => { const l = await call('POST', '/auth/login', null, { role, id, password: pw }); await call('POST', '/auth/password', l.token, { current: pw, new: np, confirm: np }); return (await call('POST', '/auth/login', null, { role, id, password: np })).token; };
  const tt = await ch('teacher', t.id, t.pw, 'Teacher!Pass2026y'), st = await ch('student', s.id, s.pw, 'orangetree2026y');
  const pick = (await call('GET', '/teacher/lessons', tt)).classes[0]?.key || '';
  const gets = [
    [a, `/admin/dashboard`], [a, `/admin/years`], [a, `/admin/students`], [a, `/admin/students?q=a&g=7&st=enrolled&y=${y}`], [a, `/admin/students/${S.id}`], [a, `/admin/teachers`], [a, `/admin/teachers/${T.id}`], [a, `/admin/subjects`], [a, `/admin/subjects/${sub.id}`], [a, `/admin/subjects-teachers?subject=${sub.id}`],
    [a, `/admin/sections?y=${y}`], [a, `/admin/sections/${sec.id}`], [a, `/admin/schedule?sec=${sec.id}`], [a, `/admin/grades?y=${y}&sec=${sec.id}`], [a, `/admin/attendance?y=${y}&sec=${sec.id}`], [a, `/admin/attendance?y=${y}&sec=${sec.id}&sub=${sub.id}`],
    [a, `/admin/reports?y=${y}&sec=${sec.id}`], [a, `/admin/reports/card/${S.id}?y=${y}`], [a, `/admin/reports/cards?y=${y}&sec=${sec.id}`], [a, `/admin/reports/csv/students?y=${y}`], [a, `/admin/reports/csv/grades?y=${y}&sec=${sec.id}`],
    [a, '/admin/notices'], [a, '/admin/announcements'], [a, '/admin/pub/articles'], [a, '/admin/pub/writers'], [a, '/admin/users'], [a, '/admin/logs'], [a, '/admin/logs?show=restorable&u=adm&act=login&from=2026-01-01&to=2027-01-01'], [a, '/admin/migrate'], [a, '/notifications'], [a, '/auth/me'],
    [tt, '/teacher/home'], [tt, '/teacher/sections'], [tt, `/teacher/sections/${(await call('GET', '/teacher/sections', tt)).rows[0]?.id}`], [tt, '/teacher/schedule'], [tt, `/teacher/lessons?pick=${pick}`], [tt, `/teacher/record?pick=${pick}&term=1`], [tt, `/teacher/record/csv?pick=${pick}&term=1`], [tt, `/teacher/grades?pick=${pick}`],
    [tt, `/teacher/cattendance?pick=${pick}`], [tt, '/teacher/standing'], [tt, '/teacher/standing?csv=1'], [tt, '/teacher/homeroom'], [tt, '/teacher/announcements'], [tt, '/teacher/notices'], [tt, '/teacher/profile'], [tt, '/teacher/pub/read'], [tt, '/teacher/pub/articles'], [tt, '/teacher/logs'], [tt, '/auth/me'],
    [st, '/student/home'], [st, '/student/grades'], [st, '/student/grades?card=1'], [st, '/student/attendance'], [st, '/student/schedule'], [st, '/student/profile'], [st, '/student/feed'], [st, '/student/feed?f=publication'], [st, '/auth/me'], [null, '/public/publications'], [null, '/public/health'],
  ];
  const bad = []; for (const [tok, p] of gets) { const r = await call('GET', p, tok); if (r.status >= 500 || r.status === 404) bad.push(p + ' -> ' + r.status + ' ' + (r.error || '')); }
  // a few writes
  const w = [['POST', `/admin/schedule/${sec.id}/add`, a, { subject_id: sub.id, day: 2, start: '08:00', end: '09:00', room: 'R' + Date.now() % 1000 }], ['POST', '/admin/notices', a, { title: 'Hello', body: 'World', audience: 'all', is_public: true }], ['POST', '/admin/announcements', a, { title: 'A', body: 'B', mode: 'all' }], ['POST', '/admin/users', a, { username: 'reg' + Date.now() % 100000, full_name: 'Reg', role: 'registrar', password: 'Regis!trar2026pass' }], ['POST', '/admin/migrate', a, {}], ['POST', '/notifications/read', tt, {}]];
  for (const [m, p, tok, b] of w) { const r = await call(m, p, tok, b); if (r.status >= 500 || r.status === 404) bad.push(m + ' ' + p + ' -> ' + r.status + ' ' + (r.error || '')); }
  assert.deepEqual(bad, []);
  const home = await fetch(BASE + '/'); assert.match(await home.text(), /Hello/);
});
