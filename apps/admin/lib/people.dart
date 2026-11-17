import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';
import 'common.dart';

/* ================= Dashboard ================= */
class DashboardPage extends StatelessWidget {
  final void Function(int hub, int page) go; const DashboardPage(this.go, {super.key});
  @override Widget build(BuildContext c) {
    final s = Scope.read(c), mods = ((s.me?['modules'] as List?) ?? []).cast<String>(), all = mods.contains('*');
    bool can(String m) => all || mods.contains(m);
    return Live(topics: const ['people', 'grades', 'attendance'], load: () => s.api.get('/admin/dashboard'), builder: (c, d, reload) {
      final h = DateTime.now().hour, hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening', byG = rowsOf(d['byGrade']), mx = byG.fold<int>(1, (m, r) => asInt(r['learners']) > m ? asInt(r['learners']) : m), at = mapOf(d['attendanceToday']);
      final pend = mapOf(d['pending']), pn = asInt(pend['students']) + asInt(pend['teachers']);
      return PageBody([
        Hello('$hello, ${'${s.me?['name']}'.split(' ').first}.', actions: [if (can('students')) Btn('Enroll student', () async { await openPage(c, const StudentFormPage()); reload(); }, pri: true, icon: Icons.add), if (can('teachers')) Btn('Add teacher', () async { await openPage(c, const TeacherFormPage()); reload(); }, icon: Icons.add)]),
        if (can('migrate') && pn > 0) AlertBox('$pn record(s) have no new-style ID number yet. Students and teachers cannot sign in until they are numbered. Open System > ID migration.', kind: 'warn'),
        Stats([StatData('${d['enrolled']}', 'Enrolled students', sub: 'S.Y. ${mapOf(d['year'])['label'] ?? '-'}'), StatData('${d['teachers']}', 'Active teachers'), StatData('${d['sections']}', 'Sections'), StatData('${d['subjects']}', 'Subjects'), StatData('${d['noSection']}', 'Not in a section', sub: asInt(d['noSection']) > 0 ? 'Needs attention' : 'All placed', warn: asInt(d['noSection']) > 0)]),
        LayoutBuilder(builder: (c, k) { final enr = Panel(title: 'Enrollment by grade', flush: true, child: DataTbl(['Grade', 'Learners', 'In a section', 'Dropped'], [for (final r in byG) ['Grade ${r['grade']}', Row(mainAxisSize: MainAxisSize.min, children: [SizedBox(width: 110, child: LinearProgressIndicator(value: asInt(r['learners']) / mx, color: C.indigo, backgroundColor: C.paper3, minHeight: 8)), const SizedBox(width: 8), Text('${r['learners']}')]), '${r['inSection']}', '${r['dropped']}']]));
          final rec = Panel(title: 'Recent activity', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final l in rowsOf(d['recent'])) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text.rich(TextSpan(children: [TextSpan(text: '${l['username']} ', style: sans(14, w: 700)), TextSpan(text: '${l['action']}'.replaceAll('_', ' '), style: sans(14)), TextSpan(text: '  ${l['entity']}\n', style: sans(14, color: C.muted)), TextSpan(text: fmtDT(l['created_at']), style: sans(12, color: C.muted))])))]));
          return k.maxWidth > 800 ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: enr), const SizedBox(width: 16), Expanded(flex: 2, child: rec)]) : Column(children: [enr, rec]); }),
        Panel(title: 'Homeroom attendance today', child: at.isEmpty ? const Empty('Nothing recorded yet today.') : Wrapx([for (final e in {'P': 'Present', 'A': 'Absent', 'L': 'Late', 'E': 'Excused'}.entries) Chip(label: Text('${at[e.key] ?? 0} ${e.value}', style: sans(14, w: 600)), backgroundColor: C.paper2)])),
      ]);
    });
  }
}

/* ================= Students ================= */
class StudentsPage extends StatefulWidget { const StudentsPage({super.key}); @override State<StudentsPage> createState() => _StudentsState(); }
class _StudentsState extends State<StudentsPage> {
  final q = TextEditingController(); int g = 0, y = 0, page = 1, del = 0, tick = 0; String st = ''; List<Map<String, dynamic>> years = [];
  @override void initState() { super.initState(); Scope.read(context).api.get('/admin/lookups').then((r) { if (mounted) setState(() => years = rowsOf(r['years'])); }); }
  @override Widget build(BuildContext c) {
    final s = Scope.read(c);
    return Live(reloadKey: '$tick-$page', topics: const ['people'], load: () => s.api.get('/admin/students', {'q': q.text, 'g': g, 'st': st, 'y': y, 'del': del, 'p': page}), builder: (c, d, reload) => PageBody([
      FilterBar([Fld('Search ID, LRN or name', q, onSubmit: (_) => setState(() { page = 1; tick++; })), Drop<int>('Grade', g, {0: 'All', ...gradeNames}, (v) => g = v ?? 0), Drop<String>('Status', st, {'': 'All', ...stuStatus}, (v) => st = v ?? ''),
        Drop<int>('School year', y, {0: 'All', for (final r in years) asInt(r['id']): '${r['label']}'}, (v) => y = v ?? 0), Drop<int>('Records', del, const {0: 'Active', 1: 'Marked deleted'}, (v) => del = v ?? 0),
        Btn('Filter', () => setState(() { page = 1; tick++; })), Btn('Enroll student', () async { await openPage(c, const StudentFormPage()); reload(); }, pri: true, icon: Icons.add)]),
      Panel(flush: true, child: DataTbl(['Student ID', 'Name', 'LRN', 'Grade', 'Section', 'S.Y.', 'Status', 'Guardian contact', ''], [for (final r in rowsOf(d['rows'])) [Text('${r['student_no'] ?? '-'}', style: mono), '${r['name']}', Text('${r['lrn']}', style: mono), '${r['grade_level']}', '${r['sec'] ?? '-'}', '${r['year'] ?? ''}', statusTag('${r['status']}', labels: stuStatus), '${r['guardian_contact']}',
        Btn('View', () async { await openPage(c, StudentViewPage(asInt(r['id']))); reload(); }, small: true)]], emptyText: 'No students match. Use "Enroll student" to add one.')),
      Text('${d['total']} record(s)', style: sans(12.5, color: C.muted)), const SizedBox(height: 8), Pager(asInt(d['total']), asInt(d['per']), page, (p) => setState(() => page = p))]));
  }
}
class StudentFormPage extends StatefulWidget { final int? id; const StudentFormPage({super.key, this.id}); @override State<StudentFormPage> createState() => _StudentFormState(); }
class _StudentFormState extends State<StudentFormPage> {
  final f = {for (final k in ['lrn', 'last_name', 'first_name', 'middle_name', 'suffix', 'birthdate', 'address', 'guardian_name', 'guardian_contact', 'emergency_name', 'emergency_relation', 'emergency_contact']) k: TextEditingController()};
  String sex = ''; int grade = 0, year = 0; List<Map<String, dynamic>> years = []; bool ready = false, busy = false; String? idNo;
  @override void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final s = Scope.read(context);
    try {
      final l = await s.api.get('/admin/lookups'); years = rowsOf(l['years']); year = asInt(l['currentYearId']);
      if (widget.id != null) { final r = mapOf((await s.api.get('/admin/students/${widget.id}'))['student']); for (final e in f.entries) e.value.text = '${r[e.key] ?? ''}'; sex = '${r['sex']}'; grade = asInt(r['grade_level']); year = asInt(r['school_year_id']); idNo = r['student_no'] as String?; }
    } catch (_) {}
    if (mounted) setState(() => ready = true);
  }
  Future<void> save() async {
    final s = Scope.read(context); setState(() => busy = true);
    final body = {for (final e in f.entries) e.key: e.value.text, 'sex': sex, 'grade_level': grade, 'school_year_id': year};
    final r = await act(context, () => widget.id == null ? s.api.post('/admin/students', body) : s.api.put('/admin/students/${widget.id}', body));
    if (mounted) setState(() => busy = false);
    if (r != null && mounted) { final nav = Navigator.of(context); if (r['issued'] != null) { nav.pushReplacement(MaterialPageRoute(builder: (_) => Scaffold(backgroundColor: C.paper, body: StudentViewPage(asInt(r['id']))))); showIssued(nav.context, mapOf(r['issued'])); } else { nav.pop(); } }
  }
  @override Widget build(BuildContext c) {
    if (!ready) return const Center(child: CircularProgressIndicator(color: C.indigo));
    return PageBody([const Back('Students'), Panel(title: widget.id == null ? 'Enroll student' : 'Edit student', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(margin: const EdgeInsets.only(bottom: 14), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: C.paper2, borderRadius: BorderRadius.circular(8)), child: Wrap(spacing: 12, crossAxisAlignment: WrapCrossAlignment.center, children: [Text('Student ID', style: sans(13, color: C.muted)), Text(idNo ?? 'Assigned on save', style: mono.copyWith(fontSize: 18, fontWeight: FontWeight.w700, color: idNo == null ? C.muted : C.indigo)), Text(idNo != null ? 'Fixed once issued.' : 'School year + 5 digits, created automatically. It cannot be duplicated.', style: sans(12.5, color: C.muted))])),
      FormGrid([Fld('LRN (12 digits)', f['lrn']!, req: true, maxLength: 12, keyboard: TextInputType.number, help: 'Learner Reference Number from the birth record or previous school.'), const SizedBox.shrink(),
        Fld('Last name', f['last_name']!, req: true), Fld('First name', f['first_name']!, req: true), Fld('Middle name', f['middle_name']!), Fld('Suffix', f['suffix']!),
        Drop<String>('Sex', sex, const {'': 'Select', 'M': 'Male', 'F': 'Female'}, (v) => setState(() => sex = v ?? ''), req: true), DateFld('Date of birth', f['birthdate']!, req: true, last: DateTime.now()),
        Drop<int>('Grade level', grade, {0: 'Select', ...gradeNames}, (v) => setState(() => grade = v ?? 0), req: true), Drop<int>('School year', year, {for (final r in years) asInt(r['id']): '${r['label']}'}, (v) => setState(() => year = v ?? 0), req: true),
        FullRow(Fld('Home address', f['address']!, req: true)), Fld('Parent / guardian name', f['guardian_name']!, req: true), Fld('Parent / guardian contact no.', f['guardian_contact']!, req: true, keyboard: TextInputType.phone),
        Fld('Emergency contact person', f['emergency_name']!, req: true), Fld('Relationship', f['emergency_relation']!, req: true), Fld('Emergency contact no.', f['emergency_contact']!, req: true, keyboard: TextInputType.phone)]),
      Wrapx([Btn('Cancel', () => Navigator.of(c).pop()), Btn(busy ? 'Saving...' : 'Save student', busy ? null : save, pri: true)])]))]);
  }
}
class StudentViewPage extends StatefulWidget { final int id; const StudentViewPage(this.id, {super.key}); @override State<StudentViewPage> createState() => _StudentViewState(); }
class _StudentViewState extends State<StudentViewPage> {
  String status = 'enrolled'; final dt = TextEditingController(text: todayStr()), reason = TextEditingController(), school = TextEditingController(); bool init = false;
  @override Widget build(BuildContext c) {
    final s = Scope.read(c), base = '/admin/students/${widget.id}';
    return Live(topics: const ['people'], load: () => s.api.get(base), builder: (c, d, reload) {
      final r = mapOf(d['student']), pr = mapOf(d['portal']), del = r['is_deleted'] == true; if (!init) { status = '${r['status']}'; init = true; }
      return PageBody([const Back('Students'),
        LayoutBuilder(builder: (c, k) { final info = Panel(title: '${r['name']}', trailing: Wrapx([if (del) const TagChip('Marked deleted', kind: 'dropped'), if (!del) Btn('Edit', () async { await openPage(c, StudentFormPage(id: widget.id)); reload(); }, small: true),
            del ? Btn('Restore', () async { await act(c, () => s.api.post('$base/restore', {})); reload(); }, small: true) : Btn('Delete', () async { if (await confirm(c, 'Mark this student as deleted? The record stays in the database and can be restored.', yes: 'Delete', danger: true)) { final x = await act(c, () => s.api.post('$base/delete', {})); if (x != null && c.mounted) Navigator.of(c).pop(); } }, small: true, danger: true)]),
          child: KV({'Student ID': '${r['student_no'] ?? 'Not issued yet'}', 'LRN': '${r['lrn']}', 'Name': '${r['name']}', 'Sex': r['sex'] == 'M' ? 'Male' : 'Female', 'Date of birth': '${r['birthdate']}', 'Address': '${r['address']}', 'Grade / school year': 'Grade ${r['grade_level']} / ${r['year']}', 'Section': '${r['sec'] ?? 'Not assigned'}',
            'Parent / guardian': '${r['guardian_name']} (${r['guardian_contact']})', 'Emergency contact': '${r['emergency_name']}, ${r['emergency_relation']} (${r['emergency_contact']})', 'Status': '${stuStatus[r['status']]}${r['status_date'] != null ? ' since ${r['status_date']}' : ''}', 'Reason': '${r['status_reason'] ?? '-'}', 'Transferred to': '${r['transfer_school'] ?? '-'}'}));
          final side = Column(children: [if (!del) Panel(title: 'Change status', child: Column(children: [Drop<String>('Status', status, stuStatus, (v) => setState(() => status = v ?? status)), DateFld('Effective date', dt), Fld('Reason / remarks', reason), Fld('Receiving school (for transfers)', school),
              Btn('Update status', () async { await act(c, () => s.api.post('$base/status', {'status': status, 'status_date': dt.text, 'status_reason': reason.text, 'transfer_school': school.text})); reload(); }, pri: true, wide: true)])),
            Panel(title: 'Record history', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [if (rowsOf(d['history']).isEmpty) const Text('No history yet.'), for (final l in rowsOf(d['history'])) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text.rich(TextSpan(children: [TextSpan(text: '${l['action']}', style: sans(14, w: 700)), TextSpan(text: ' by ${l['username']}\n'), TextSpan(text: '${fmtDT(l['created_at'])} - ${l['details']}', style: sans(12, color: C.muted))])))]))]);
          return k.maxWidth > 900 ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: info), const SizedBox(width: 16), SizedBox(width: 340, child: side)]) : Column(children: [info, side]); }),
        Panel(title: 'Grades, S.Y. ${r['year']}', child: GradeTable(mapOf(d['grades']), released: d['released'] as List)),
        if (!del) Panel(title: 'Student portal', trailing: Btn(pr['has'] == true ? 'Reset password' : 'Create account', () async { if (await confirm(c, 'Create or reset this student\'s portal password?', yes: 'Continue')) { await act(c, () => s.api.post('$base/portal-reset', {})); reload(); } }, small: true),
          child: Text(pr['has'] == true ? 'Account active. Last sign-in: ${pr['portal_last_login'] == null ? 'never' : fmtDT(pr['portal_last_login'])}${pr['portal_must_change'] == true ? ' (temporary password not yet changed)' : ''}' : 'No portal account yet. Students sign in to the Student app with their Student ID.', style: sans(14.5))),
      ]);
    });
  }
}

/* ================= Teachers ================= */
class TeachersPage extends StatefulWidget { const TeachersPage({super.key}); @override State<TeachersPage> createState() => _TeachersState(); }
class _TeachersState extends State<TeachersPage> {
  final q = TextEditingController(); String st = ''; int del = 0, page = 1, tick = 0;
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: '$tick-$page', topics: const ['people'], load: () => s.api.get('/admin/teachers', {'q': q.text, 'st': st, 'del': del, 'p': page}), builder: (c, d, reload) => PageBody([
      FilterBar([Fld('Search ID or name', q, onSubmit: (_) => setState(() { page = 1; tick++; })), Drop<String>('Status', st, {'': 'All', ...tchStatus}, (v) => st = v ?? ''), Drop<int>('Records', del, const {0: 'Active', 1: 'Removed'}, (v) => del = v ?? 0), Btn('Filter', () => setState(() { page = 1; tick++; })), Btn('Add teacher', () async { await openPage(c, const TeacherFormPage()); reload(); }, pri: true, icon: Icons.add)]),
      Panel(flush: true, child: DataTbl(['Teacher ID', 'Name', 'Contact', 'Subjects', 'Status', 'Portal', ''], [for (final r in rowsOf(d['rows'])) [Text('${r['teacher_no']}', style: mono), '${r['name']}', '${r['contact_no']}', '${r['subjects']}', statusTag('${r['status']}', labels: tchStatus), r['has_portal'] == true ? 'Yes' : 'No', Btn('View', () async { await openPage(c, TeacherViewPage(asInt(r['id']))); reload(); }, small: true)]], emptyText: 'No teachers match.')),
      Text('${d['total']} record(s)', style: sans(12.5, color: C.muted)), const SizedBox(height: 8), Pager(asInt(d['total']), asInt(d['per']), page, (p) => setState(() => page = p))])); }
}
class TeacherFormPage extends StatefulWidget { final int? id; const TeacherFormPage({super.key, this.id}); @override State<TeacherFormPage> createState() => _TeacherFormState(); }
class _TeacherFormState extends State<TeacherFormPage> {
  final f = {for (final k in ['last_name', 'first_name', 'birthdate', 'contact_no', 'spouse', 'address']) k: TextEditingController()}; bool ready = false, busy = false; String? no;
  @override void initState() { super.initState(); () async { if (widget.id != null) { try { final r = mapOf((await Scope.read(context).api.get('/admin/teachers/${widget.id}'))['teacher']); for (final e in f.entries) e.value.text = '${r[e.key] ?? ''}'; no = r['teacher_no'] as String?; } catch (_) {} } if (mounted) setState(() => ready = true); }(); }
  Future<void> save() async { final s = Scope.read(context); setState(() => busy = true); final body = {for (final e in f.entries) e.key: e.value.text};
    final r = await act(context, () => widget.id == null ? s.api.post('/admin/teachers', body) : s.api.put('/admin/teachers/${widget.id}', body)); if (mounted) setState(() => busy = false);
    if (r != null && mounted) { final nav = Navigator.of(context); if (r['issued'] != null) { nav.pushReplacement(MaterialPageRoute(builder: (_) => Scaffold(backgroundColor: C.paper, body: TeacherViewPage(asInt(r['id']))))); showIssued(nav.context, mapOf(r['issued'])); } else { nav.pop(); } } }
  @override Widget build(BuildContext c) { if (!ready) return const Center(child: CircularProgressIndicator(color: C.indigo));
    return PageBody([const Back('Teachers'), Panel(title: widget.id == null ? 'Add teacher' : 'Edit teacher', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(margin: const EdgeInsets.only(bottom: 14), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: C.paper2, borderRadius: BorderRadius.circular(8)), child: Wrap(spacing: 12, children: [Text('Teacher ID', style: sans(13, color: C.muted)), Text(no ?? 'Assigned on save', style: mono.copyWith(fontSize: 18, fontWeight: FontWeight.w700, color: no == null ? C.muted : C.indigo)), Text(no != null ? 'Fixed once issued.' : 'Format T-12345, created automatically.', style: sans(12.5, color: C.muted))])),
      FormGrid([Fld('Last name', f['last_name']!, req: true), Fld('First name', f['first_name']!, req: true), DateFld('Birthdate', f['birthdate']!, req: true, last: DateTime.now()), Fld('Contact no.', f['contact_no']!, req: true, keyboard: TextInputType.phone), Fld('Spouse (if any)', f['spouse']!), const SizedBox.shrink(), FullRow(Fld('Address', f['address']!, req: true))]),
      Wrapx([Btn('Cancel', () => Navigator.of(c).pop()), Btn(busy ? 'Saving...' : 'Save teacher', busy ? null : save, pri: true)])]))]); }
}
class TeacherViewPage extends StatefulWidget { final int id; const TeacherViewPage(this.id, {super.key}); @override State<TeacherViewPage> createState() => _TeacherViewState(); }
class _TeacherViewState extends State<TeacherViewPage> {
  String status = 'active'; final dt = TextEditingController(text: todayStr()), reason = TextEditingController(); bool init = false;
  @override Widget build(BuildContext c) { final s = Scope.read(c), base = '/admin/teachers/${widget.id}';
    return Live(topics: const ['people'], load: () => s.api.get(base), builder: (c, d, reload) {
      final r = mapOf(d['teacher']), pr = mapOf(d['portal']), del = r['is_deleted'] == true, subs = rowsOf(d['subjects']); if (!init) { status = '${r['status']}'; init = true; }
      return PageBody([const Back('Teachers'), Panel(title: '${r['name']}', trailing: Wrapx([if (del) const TagChip('Removed', kind: 'dropped'), if (!del) Btn('Edit', () async { await openPage(c, TeacherFormPage(id: widget.id)); reload(); }, small: true),
          del ? Btn('Restore', () async { await act(c, () => s.api.post('$base/restore', {})); reload(); }, small: true) : Btn('Delete', () async { if (await confirm(c, 'Remove this teacher? Adviser and subject assignments are cleared (and can be restored from Activity logs).', yes: 'Delete', danger: true)) { final x = await act(c, () => s.api.post('$base/delete', {})); if (x != null && c.mounted) Navigator.of(c).pop(); } }, small: true, danger: true)]),
        child: KV({'Teacher ID': '${r['teacher_no']}${r['legacy_no'] != null ? ' (was ${r['legacy_no']})' : ''}', 'Name': '${r['name']}', 'Birthdate': '${r['birthdate']}', 'Address': '${r['address']}', 'Contact no.': '${r['contact_no']}', 'Spouse': '${r['spouse'] ?? '-'}', 'Status': '${tchStatus[r['status']]}${r['status_date'] != null ? ' since ${r['status_date']}' : ''}', 'Reason': '${r['status_reason'] ?? '-'}', 'Subjects (${subs.length}/${d['maxSubjects']})': subs.map((x) => '${x['code']} ${x['name']}').join('; '), 'Publishes articles': d['isWriter'] == true ? 'Yes' : 'No'})),
        if (!del) Panel(title: 'Change status', child: Wrapx([SizedBox(width: 200, child: Drop<String>('Status', status, tchStatus, (v) => setState(() => status = v ?? status))), SizedBox(width: 200, child: DateFld('Effective date', dt)), SizedBox(width: 260, child: Fld('Reason / remarks', reason)), Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('Update status', () async { if (status == 'active' || status == 'on_leave' || await confirm(c, 'This clears the teacher\'s adviser and subject assignments. Continue?', yes: 'Continue')) { await act(c, () => s.api.post('$base/status', {'status': status, 'status_date': dt.text, 'status_reason': reason.text})); reload(); } }, pri: true))])),
        if (!del) Panel(title: 'Teacher portal', trailing: Btn(pr['has'] == true ? 'Reset password' : 'Create account', () async { if (await confirm(c, 'Create or reset this teacher\'s portal password?', yes: 'Continue')) { await act(c, () => s.api.post('$base/portal-reset', {})); reload(); } }, small: true),
          child: Text(pr['has'] == true ? 'Account active. Last sign-in: ${pr['portal_last_login'] == null ? 'never' : fmtDT(pr['portal_last_login'])}${pr['portal_must_change'] == true ? ' (temporary password not yet changed)' : ''}' : 'No portal account yet. Teachers sign in to the Teacher app with their Teacher ID.', style: sans(14.5)))]);
    }); }
}
