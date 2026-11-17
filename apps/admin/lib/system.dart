import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';

/* ================= Notices ================= */
class NoticesPage extends StatefulWidget { const NoticesPage({super.key}); @override State<NoticesPage> createState() => _NoticesState(); }
class _NoticesState extends State<NoticesPage> {
  final title = TextEditingController(), body = TextEditingController(); String aud = 'all'; bool pub = false; int? editing;
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(load: () => s.api.get('/admin/notices'), builder: (c, d, reload) { final au = mapOf(d['audiences']).map((k, v) => MapEntry(k, '$v'));
      final form = Panel(title: editing == null ? 'Post a notice' : 'Edit notice', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Fld('Title', title, maxLength: 160, req: true), Fld('Message', body, maxLines: 5, maxLength: 5000, req: true), Drop<String>('Audience', aud, au, (v) => setState(() => aud = v ?? 'all')),
        if (aud == 'all') Check('Also show on the public website', pub, (v) => setState(() => pub = v)), const Text('Students and teachers are notified on their phones and computers right away.'), const SizedBox(height: 10),
        Wrapx([Btn(editing == null ? 'Post notice' : 'Save changes', () async { final r = await act(c, () => s.api.post('/admin/notices', {'id': editing, 'title': title.text, 'body': body.text, 'audience': aud, 'is_public': pub})); if (r != null) { setState(() { title.clear(); body.clear(); editing = null; pub = false; }); reload(); } }, pri: true), if (editing != null) Btn('Cancel', () => setState(() { editing = null; title.clear(); body.clear(); }))])]));
      final list = Panel(title: 'Notices', flush: true, child: DataTbl(['Date', 'Title', 'Audience', 'Website', ''], [for (final r in rowsOf(d['rows'])) [fmtDate(r['created_at']), '${r['title']}', '${au['${r['audience']}']}', r['is_public'] == true ? 'Yes' : 'No', Wrapx([Btn('Edit', () => setState(() { editing = asInt(r['id']); title.text = '${r['title']}'; body.text = '${r['body']}'; aud = '${r['audience']}'; pub = r['is_public'] == true; }), small: true),
        Btn('Delete', () async { if (await confirm(c, 'Remove this notice?', yes: 'Delete', danger: true)) { await act(c, () => s.api.post('/admin/notices/${r['id']}/delete', {})); reload(); } }, small: true, danger: true)])]], emptyText: 'No notices yet.'));
      return PageBody([isWide(c) ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: list), const SizedBox(width: 16), Expanded(flex: 2, child: form)]) : Column(children: [form, list])]); }); }
}

/* ================= Faculty writers ================= */
class WritersPage extends StatefulWidget { const WritersPage({super.key}); @override State<WritersPage> createState() => _WritersState(); }
class _WritersState extends State<WritersPage> {
  int pick = 0;
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(load: () => s.api.get('/admin/pub/writers'), builder: (c, d, reload) { final cand = rowsOf(d['candidates']);
      return PageBody([Panel(title: 'Assign a teacher to publish', child: Wrapx([SizedBox(width: 320, child: Drop<int>('Teacher', pick, {0: 'Choose...', for (final t in cand) asInt(t['id']): '${t['last_name']}, ${t['first_name']} (${t['teacher_no']})'}, (v) => setState(() => pick = v ?? 0))), Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('Assign', pick == 0 ? null : () async { await act(c, () => s.api.post('/admin/pub/writers', {'teacher_id': pick})); setState(() => pick = 0); reload(); }, pri: true))])),
        Panel(title: 'Faculty writers', flush: true, child: DataTbl(['Teacher', 'ID', 'Assigned by', ''], [for (final w in rowsOf(d['writers'])) ['${w['full_name']}', '${w['teacher_no']}', '${w['assigned_by']}', Btn('Remove', () async { if (await confirm(c, 'Remove ${w['full_name']} as a writer? Their articles stay published.', yes: 'Remove', danger: true)) { await act(c, () => s.api.post('/admin/pub/writers/${w['teacher_id']}/delete', {})); reload(); } }, small: true, danger: true)]], emptyText: 'No writers assigned yet. Administrators can always publish.'))]); }); }
}

/* ================= Staff users ================= */
class UsersPage extends StatefulWidget { const UsersPage({super.key}); @override State<UsersPage> createState() => _UsersState(); }
class _UsersState extends State<UsersPage> {
  final un = TextEditingController(), fn = TextEditingController(), pw = TextEditingController(); String role = 'registrar';
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(load: () => s.api.get('/admin/users'), builder: (c, d, reload) { final roles = mapOf(d['roles']).map((k, v) => MapEntry(k, '$v'));
      final form = Panel(title: 'Add staff user', child: Column(children: [Fld('Username', un, req: true), Fld('Full name', fn, req: true), Drop<String>('Role', role, roles, (v) => setState(() => role = v ?? 'registrar')), Fld('Temporary password', pw, obscure: true, help: '12+ characters with upper, lower, number and symbol.'),
        Btn('Create user', () async { final r = await act(c, () => s.api.post('/admin/users', {'username': un.text, 'full_name': fn.text, 'role': role, 'password': pw.text})); if (r != null) { un.clear(); fn.clear(); pw.clear(); reload(); } }, pri: true, wide: true)]));
      final list = Panel(title: 'Staff accounts', flush: true, child: DataTbl(['Username', 'Name', 'Role', 'Status', 'Last sign-in', ''], [for (final u in rowsOf(d['rows'])) ['${u['username']}', '${u['full_name']}', '${roles['${u['role']}']}', u['active'] == true ? const TagChip('Active', kind: 'active') : const TagChip('Disabled', kind: 'dropped'), u['last_login'] == null ? 'Never' : fmtDT(u['last_login']),
        Wrapx([Btn(u['active'] == true ? 'Disable' : 'Enable', () async { await act(c, () => s.api.post('/admin/users/${u['id']}/update', {'role': u['role'], 'active': u['active'] != true})); reload(); }, small: true), Btn('Reset password', () async { if (await confirm(c, 'Reset the password for ${u['username']}?', yes: 'Reset')) await act(c, () => s.api.post('/admin/users/${u['id']}/reset', {})); }, small: true)])]]));
      return PageBody([isWide(c) ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: list), const SizedBox(width: 16), SizedBox(width: 340, child: form)]) : Column(children: [form, list])]); }); }
}

/* ================= ID migration ================= */
class MigratePage extends StatelessWidget { const MigratePage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(load: () => s.api.get('/admin/migrate'), builder: (c, d, reload) { final p = mapOf(d['pending']), n = asInt(p['students']) + asInt(p['teachers']);
      return PageBody([Panel(title: 'ID number migration', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Gives every record imported from the old system a new-style ID (students: school year + 5 digits, teachers: T-12345). Old teacher numbers are kept as legacy numbers. New records get their ID automatically, so this is only needed after importing old data.', style: sans(14.5)), const SizedBox(height: 14),
        AlertBox(n == 0 ? 'Every student and teacher already has a new-style ID.' : '${p['students']} student(s) and ${p['teachers']} teacher(s) need numbering.', kind: n == 0 ? 'ok' : 'warn'), if (n > 0) Btn('Number them now', () async { await act(c, () => s.api.post('/admin/migrate', {})); reload(); }, pri: true)]))]); }); }
}
