import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';

Widget classPick(List<Map<String, dynamic>> my, String? pick, void Function(String) on) => Drop<String>('Class', pick, {for (final x in my) '${x['key']}': '${x['label']}'}, (v) { if (v != null) on(v); });

/* ================= Home ================= */
class HomePage extends StatelessWidget { final void Function(int, int) go; const HomePage(this.go, {super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['attendance', 'classes', 'schedule', 'grades'], load: () => s.api.get('/teacher/home'), builder: (c, d, reload) { final h = DateTime.now().hour, today = rowsOf(d['today']), alerts = rowsOf(d['alerts']);
      return PageBody([Hello('${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${s.me?['firstName']}.'),
        Stats([StatData('${d['sections']}', 'Sections'), StatData('${d['students']}', 'Students'), StatData('${d['classes']}', 'Classes taught'), StatData('${d['warnings']}', 'Absence warnings', warn: asInt(d['warnings']) > 0), StatData('${d['dropped']}', 'Over absence limit', warn: asInt(d['dropped']) > 0)]),
        Panel(title: 'Today\'s classes', child: today.isEmpty ? const Empty('No classes scheduled today.') : ScheduleView(today, showTeacher: false, showSection: true)),
        if (alerts.isNotEmpty) Panel(title: 'Students to watch', flush: true, child: DataTbl(['Student', 'Subject', 'Absences', 'Standing'], [for (final a in alerts) ['${a['student']}', '${a['code']}', '${a['n']} of ${a['free']}', standingTag('${a['standing']}')]]))]); }); }
}

/* ================= My sections ================= */
class SectionsPage extends StatelessWidget { const SectionsPage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['classes'], load: () => s.api.get('/teacher/sections'), builder: (c, d, reload) { final rows = rowsOf(d['rows']);
      return PageBody([if (rows.isEmpty) const Empty('You have no sections yet. The administrator assigns them.'), Wrapx([for (final r in rows) InkWell(onTap: () => openPage(c, SectionDetail(asInt(r['id']))), child: Container(width: 260, padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: C.card, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Grade ${r['grade_level']} - ${r['name']}', style: serif(18)), Text('${r['students']} students', style: sans(13, color: C.muted)), if (r['isAdviser'] == true) const Padding(padding: EdgeInsets.only(top: 4), child: TagChip('Class adviser', kind: 'info')), Text('Teaching: ${(r['teaching'] as List).join(', ')}', style: sans(13))]))) ]) ]); }); }
}
class SectionDetail extends StatelessWidget { final int id; const SectionDetail(this.id, {super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['attendance', 'people'], load: () => s.api.get('/teacher/sections/$id'), builder: (c, d, reload) { final sec = mapOf(d['section']), subs = rowsOf(d['subjects']);
      return PageBody([const Back('My sections'), Panel(title: 'Grade ${sec['grade_level']} - ${sec['name']}', child: KV({'Class adviser': '${d['adviser']}', 'You teach': subs.map((x) => '${x['code']} ${x['name']}').join('; ')})),
        Panel(title: 'Students', flush: true, child: DataTbl(['Student ID', 'Name', 'Parent / guardian', 'Emergency contact', 'Absence watch'], [for (final x in rowsOf(d['students'])) [Text('${x['student_no'] ?? '-'}', style: mono), '${x['name']}', '${x['guardian_name']} (${x['guardian_contact']})', '${x['emergency_name']}, ${x['emergency_relation']} (${x['emergency_contact']})',
          rowsOf(x['standing']).isEmpty ? const TagChip('OK', kind: 'ok') : Wrap(spacing: 4, children: [for (final t in rowsOf(x['standing'])) TagChip('${t['code']} ${t['n']}/${t['free']}', kind: '${t['standing']}')])]]))]); }); }
}
class SchedulePage extends StatelessWidget { const SchedulePage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c); return Live(topics: const ['schedule'], load: () => s.api.get('/teacher/schedule'), builder: (c, d, reload) => PageBody([Panel(title: 'My weekly schedule', child: ScheduleView(rowsOf(d['rows']), showTeacher: false, showSection: true))])); }
}

/* ================= Lesson log ================= */
class LessonsPage extends StatefulWidget { const LessonsPage({super.key}); @override State<LessonsPage> createState() => _LessonsState(); }
class _LessonsState extends State<LessonsPage> {
  String? pick; final date = TextEditingController(text: todayStr()), topic = TextEditingController(), notes = TextEditingController();
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: pick, load: () => s.api.get('/teacher/lessons', {'pick': pick}), builder: (c, d, reload) { final my = rowsOf(d['classes']); pick ??= d['pick'] as String?; if (my.isEmpty) return const Empty('You have no classes assigned yet.');
      return PageBody([FilterBar([classPick(my, pick, (v) => setState(() => pick = v))]),
        Panel(title: 'Log today\'s lesson', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [DateFld('Date', date), Fld('Topic', topic, maxLength: 160, req: true), Fld('Notes (optional)', notes, maxLines: 3), Btn('Save lesson', () async { final r = await act(c, () => s.api.post('/teacher/lessons', {'pick': pick, 'log_date': date.text, 'topic': topic.text, 'notes': notes.text})); if (r != null) { topic.clear(); notes.clear(); reload(); } }, pri: true)])),
        Panel(title: 'Recent lessons', flush: true, child: DataTbl(['Date', 'Topic', 'Notes', ''], [for (final r in rowsOf(d['rows'])) [fmtDate(r['log_date']), '${r['topic']}', '${r['notes'] ?? ''}', Btn('Delete', () async { await act(c, () => s.api.post('/teacher/lessons/${r['id']}/delete', {})); reload(); }, small: true, danger: true)]], emptyText: 'No lessons logged for this class yet.'))]); }); }
}

/* ================= Class record ================= */
class RecordPage extends StatefulWidget { const RecordPage({super.key}); @override State<RecordPage> createState() => _RecordState(); }
class _RecordState extends State<RecordPage> {
  String? pick; int term = 0; final ctl = <String, TextEditingController>{}; String sig = '';
  final ti = TextEditingController(), dt = TextEditingController(text: todayStr()), mx = TextEditingController(text: '20'), wt = TextEditingController(text: '1');
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: '$pick-$term', topics: const ['attendance', 'grades'], load: () => s.api.get('/teacher/record', {'pick': pick, 'term': term == 0 ? null : term}), builder: (c, d, reload) {
      final my = rowsOf(d['classes']); if (my.isEmpty) return const Empty('You have no classes assigned yet.'); pick ??= d['pick'] as String?; final cols = rowsOf(d['columns']), studs = rowsOf(d['students']), locked = d['locked'] == true; final t = asInt(d['term']);
      final k = '${d['pick']}-$t-${cols.length}-${studs.length}'; if (k != sig) { sig = k; ctl.clear(); for (final x in studs) { for (final col in cols) { ctl['${col['id']}:${x['id']}'] = TextEditingController(text: mapOf(x['scores'])['${col['id']}'] == null ? '' : num2(mapOf(x['scores'])['${col['id']}'])); } } }
      Map<String, dynamic> body() => {'pick': pick, 'term': t};
      return PageBody([FilterBar([classPick(my, pick, (v) => setState(() { pick = v; })), Drop<int>('Term', t, const {1: 'Term 1', 2: 'Term 2', 3: 'Term 3', 4: 'Term 4'}, (v) => setState(() => term = v ?? 1)), Btn('Export CSV', () => downloadCsv(c, '/teacher/record/csv', 'class_record.csv', {'pick': pick, 'term': t}), small: true)]),
        if (locked) AlertBox('Term $t grades are released to students. You can still keep your class record, but copying it to term grades is locked.', kind: 'warn'),
        Panel(title: 'Add a column (quiz, activity, exam...)', child: Wrapx([SizedBox(width: 200, child: Fld('Title', ti, maxLength: 60)), SizedBox(width: 160, child: DateFld('Date', dt)), SizedBox(width: 120, child: Fld('Highest score', mx, keyboard: TextInputType.number)), SizedBox(width: 100, child: Fld('Weight', wt, keyboard: TextInputType.number)),
          Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('Add column', () async { final r = await act(c, () => s.api.post('/teacher/record/addcol', {...body(), 'title': ti.text, 'col_date': dt.text, 'max_score': mx.text, 'weight': wt.text})); if (r != null) { ti.clear(); reload(); } }, pri: true))])),
        Panel(title: '${d['label']} · Term $t', flush: true, child: cols.isEmpty ? const Empty('Add a column to start the class record.') : Column(children: [
          DataTbl(['Student', for (final col in cols) '${col['title']}\n/${num2(col['max_score'])} ×${num2(col['weight'])}', 'Percent', 'Absences'], [for (final x in studs) ['${x['name']}', for (final col in cols) SizedBox(width: 70, child: TextField(controller: ctl['${col['id']}:${x['id']}'], keyboardType: const TextInputType.numberWithOptions(decimal: true), style: sans(14), decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()))), x['percent'] == null ? '-' : '${num2(x['percent'])}%', '${x['absences']}/${d['free']} ${x['standing'] == 'ok' ? '' : '(${x['standing']})'}']]),
          Padding(padding: const EdgeInsets.all(14), child: Wrapx([Btn('Save scores', () async { final scores = <String, dynamic>{}; for (final col in cols) { scores['${col['id']}'] = {for (final x in studs) '${x['id']}': ctl['${col['id']}:${x['id']}']!.text}; } final r = await act(c, () => s.api.post('/teacher/record/scores', {...body(), 's': scores})); if (r != null) { sig = ''; reload(); } }, pri: true),
            Btn('Copy to Term $t grades (percent)', locked ? null : () async { await act(c, () => s.api.post('/teacher/record/pushgrade', {...body(), 'transmute': false})); reload(); }), Btn('Copy with transmutation', locked ? null : () async { await act(c, () => s.api.post('/teacher/record/pushgrade', {...body(), 'transmute': true})); reload(); })]))])),
        if (cols.isNotEmpty) Panel(title: 'Columns', flush: true, child: DataTbl(['Title', 'Date', 'Highest', 'Weight', ''], [for (final col in cols) ['${col['title']}', '${col['col_date']}', num2(col['max_score']), num2(col['weight']), Btn('Remove', () async { if (await confirm(c, 'Remove column "${col['title']}" and its scores? You can undo this.', yes: 'Remove', danger: true)) { await act(c, () => s.api.post('/teacher/record/col/${col['id']}/delete', body())); reload(); } }, small: true, danger: true)]]))]); }); }
}

/* ================= Term grades ================= */
class GradesPage extends StatefulWidget { const GradesPage({super.key}); @override State<GradesPage> createState() => _GradesState(); }
class _GradesState extends State<GradesPage> {
  String? pick; int term = 0; final ctl = <int, TextEditingController>{}; String sig = '';
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: '$pick-$term', topics: const ['grades'], load: () => s.api.get('/teacher/grades', {'pick': pick, 'term': term == 0 ? null : term}), builder: (c, d, reload) { final my = rowsOf(d['classes']); if (my.isEmpty) return const Empty('You have no classes assigned yet.'); pick ??= d['pick'] as String?; final studs = rowsOf(d['students']), locked = d['locked'] == true, t = asInt(d['term']);
      final k = '${d['pick']}-$t-${studs.length}'; if (k != sig) { sig = k; ctl.clear(); for (final x in studs) { ctl[asInt(x['id'])] = TextEditingController(text: x['grade'] == null ? '' : num2(x['grade'])); } }
      return PageBody([FilterBar([classPick(my, pick, (v) => setState(() => pick = v)), Drop<int>('Term', t, const {1: 'Term 1', 2: 'Term 2', 3: 'Term 3', 4: 'Term 4'}, (v) => setState(() => term = v ?? 1))]),
        if (locked) AlertBox('Term $t grades are released to students and locked. Ask the registrar to hide the term to edit.', kind: 'warn'),
        Panel(title: 'Term $t grades (passing ${d['passing']})', flush: true, child: Column(children: [DataTbl(['Student ID', 'Student', 'Grade'], [for (final x in studs) [Text('${x['student_no'] ?? '-'}', style: mono), '${x['name']}', SizedBox(width: 100, child: TextField(controller: ctl[asInt(x['id'])], enabled: !locked, keyboardType: const TextInputType.numberWithOptions(decimal: true), style: sans(15), decoration: const InputDecoration(isDense: true, border: OutlineInputBorder())))]], emptyText: 'No students in this section.'),
          Padding(padding: const EdgeInsets.all(14), child: Align(alignment: Alignment.centerLeft, child: Btn('Save grades', locked || studs.isEmpty ? null : () async { final r = await act(c, () => s.api.post('/teacher/grades/save', {'pick': pick, 'term': t, 'g': {for (final e in ctl.entries) '${e.key}': e.value.text}})); if (r != null) { sig = ''; reload(); } }, pri: true)))]))]); }); }
}

/* ================= Class attendance ================= */
class ClassAttendancePage extends StatefulWidget { const ClassAttendancePage({super.key}); @override State<ClassAttendancePage> createState() => _CAState(); }
class _CAState extends State<ClassAttendancePage> {
  String? pick; final date = TextEditingController(text: todayStr()); final status = <int, String>{}, remarks = <int, TextEditingController>{}; String sig = ''; final free = TextEditingController(); bool apply = false; String polSig = '';
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: '$pick-${date.text}', topics: const ['attendance'], load: () => s.api.get('/teacher/cattendance', {'pick': pick, 'date': date.text}), builder: (c, d, reload) { final my = rowsOf(d['classes']); if (my.isEmpty) return const Empty('You have no classes assigned yet.'); pick ??= d['pick'] as String?; final studs = rowsOf(d['students']), pol = mapOf(d['policy']);
      final k = '${d['pick']}-${d['date']}-${studs.length}-${d['recorded']}'; if (k != sig) { sig = k; status.clear(); remarks.clear(); for (final x in studs) { status[asInt(x['id'])] = '${x['status']}'; remarks[asInt(x['id'])] = TextEditingController(text: '${x['remarks']}'); } }
      final pk = '${d['pick']}-${pol['free']}-${pol['apply']}'; if (pk != polSig) { polSig = pk; free.text = '${pol['free']}'; apply = asInt(pol['apply']) == 1; }
      const opts = {'P': 'Present', 'A': 'Absent', 'L': 'Late', 'E': 'Excused'};
      return PageBody([FilterBar([classPick(my, pick, (v) => setState(() => pick = v)), DateFld('Date', date)]),
        Panel(title: 'Absence rule for this class', child: Wrapx([SizedBox(width: 160, child: Fld('Allowed absences', free, keyboard: TextInputType.number)), Padding(padding: const EdgeInsets.only(bottom: 14), child: Check('Mark students as Dropped when they pass the limit', apply, (v) => setState(() => apply = v))), Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('Save rule', () async { await act(c, () => s.api.post('/teacher/cattendance/policy', {'pick': pick, 'free': free.text, 'apply': apply})); polSig = ''; reload(); }, small: true))])),
        Panel(title: 'Attendance for ${fmtDay(date.text)}', trailing: d['recorded'] == true ? Btn('Delete this date', () async { if (await confirm(c, 'Remove all attendance for ${date.text}?', yes: 'Remove', danger: true)) { await act(c, () => s.api.post('/teacher/cattendance/deldate', {'pick': pick, 'date': date.text})); reload(); } }, small: true, danger: true) : null, flush: true, child: Column(children: [
          DataTbl(['Student', 'Status', 'Remarks', 'Absences used'], [for (final x in studs) ['${x['name']}', SizedBox(width: 130, child: DropdownButton<String>(isExpanded: true, value: status[asInt(x['id'])], items: [for (final o in opts.entries) DropdownMenuItem(value: o.key, child: Text(o.value))], onChanged: (v) => setState(() => status[asInt(x['id'])] = v ?? 'P'))), SizedBox(width: 180, child: TextField(controller: remarks[asInt(x['id'])], decoration: const InputDecoration(isDense: true, border: OutlineInputBorder(), hintText: 'Remarks'))), Wrap(spacing: 6, children: [Text('${x['absences']}/${pol['free']}'), standingTag('${x['standing']}')])]], emptyText: 'No students in this section.'),
          Padding(padding: const EdgeInsets.all(14), child: Wrapx([Btn('All present', () => setState(() { for (final x in studs) { status[asInt(x['id'])] = 'P'; } }), small: true), Btn('Save attendance', studs.isEmpty ? null : () async { final r = await act(c, () => s.api.post('/teacher/cattendance/save', {'pick': pick, 'date': date.text, 'items': [for (final x in studs) {'student_id': x['id'], 'status': status[asInt(x['id'])], 'remarks': remarks[asInt(x['id'])]!.text}]})); if (r != null) { sig = ''; reload(); } }, pri: true)]))]))]); }); }
}
class StandingPage extends StatelessWidget { const StandingPage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['attendance'], load: () => s.api.get('/teacher/standing'), builder: (c, d, reload) { final rows = rowsOf(d['rows']).where((r) => r['standing'] != 'ok').toList();
      return PageBody([Stats([StatData('${d['warning']}', 'On warning', warn: asInt(d['warning']) > 0), StatData('${d['dropped']}', 'Over the limit', warn: asInt(d['dropped']) > 0)]), Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(bottom: 12), child: Btn('Export CSV', () => downloadCsv(c, '/teacher/standing', 'absence_watch.csv', {'csv': 1}), small: true))),
        Panel(title: 'Absence watch', flush: true, child: DataTbl(['Class', 'Student', 'Absences', 'Used', 'Standing'], [for (final r in rows) ['${r['cls']}', '${r['student']}', '${r['n']} of ${r['free']}', '${r['pct']}%', standingTag('${r['standing']}')]], emptyText: 'Nobody is near their absence limit.'))]); }); }
}
class HomeroomPage extends StatefulWidget { const HomeroomPage({super.key}); @override State<HomeroomPage> createState() => _HomeroomState(); }
class _HomeroomState extends State<HomeroomPage> {
  int sec = 0; final date = TextEditingController(text: todayStr()); final status = <int, String>{}, remarks = <int, TextEditingController>{}; String sig = '';
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: '$sec-${date.text}', topics: const ['attendance'], load: () => s.api.get('/teacher/homeroom', {'sec': sec == 0 ? null : sec, 'date': date.text}), builder: (c, d, reload) { final secs = rowsOf(d['sections']); if (secs.isEmpty) return const Empty('You are not a class adviser this school year, so there is no homeroom attendance for you.'); sec = asInt(d['sec']); final studs = rowsOf(d['students']);
      final k = '$sec-${d['date']}-${studs.length}-${d['recorded']}'; if (k != sig) { sig = k; status.clear(); remarks.clear(); for (final x in studs) { status[asInt(x['id'])] = '${x['status']}'; remarks[asInt(x['id'])] = TextEditingController(text: '${x['remarks']}'); } }
      return PageBody([FilterBar([Drop<int>('Advisory section', sec, {for (final x in secs) asInt(x['id']): 'Grade ${x['grade_level']} - ${x['name']}'}, (v) => setState(() => sec = v ?? sec)), DateFld('Date', date)]),
        Panel(title: 'Daily attendance for ${fmtDay(date.text)}', flush: true, child: Column(children: [DataTbl(['Student', 'Status', 'Remarks'], [for (final x in studs) ['${x['name']}', SizedBox(width: 130, child: DropdownButton<String>(isExpanded: true, value: status[asInt(x['id'])], items: const [DropdownMenuItem(value: 'P', child: Text('Present')), DropdownMenuItem(value: 'A', child: Text('Absent')), DropdownMenuItem(value: 'L', child: Text('Late')), DropdownMenuItem(value: 'E', child: Text('Excused'))], onChanged: (v) => setState(() => status[asInt(x['id'])] = v ?? 'P'))), SizedBox(width: 200, child: TextField(controller: remarks[asInt(x['id'])], decoration: const InputDecoration(isDense: true, border: OutlineInputBorder(), hintText: 'Remarks')))]]),
          Padding(padding: const EdgeInsets.all(14), child: Wrapx([Btn('All present', () => setState(() { for (final x in studs) { status[asInt(x['id'])] = 'P'; } }), small: true), Btn('Save attendance', studs.isEmpty ? null : () async { final r = await act(c, () => s.api.post('/teacher/homeroom/save', {'sec': sec, 'date': date.text, 'items': [for (final x in studs) {'student_id': x['id'], 'status': status[asInt(x['id'])], 'remarks': remarks[asInt(x['id'])]!.text}]})); if (r != null) { sig = ''; reload(); } }, pri: true)]))]))]); }); }
}

/* ================= Notices, profile ================= */
class NoticesPage extends StatelessWidget { const NoticesPage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c); return Live(topics: const ['notices', 'feed'], load: () => s.api.get('/teacher/notices'), builder: (c, d, r) => PageBody([for (final n in rowsOf(d['rows'])) Panel(title: '${n['title']}', trailing: Text(fmtDate(n['created_at']), style: sans(12, color: C.muted)), child: SelectableText('${n['body']}', style: sans(15))), if (rowsOf(d['rows']).isEmpty) const Empty('No notices from the administration.')])); }
}
class ProfilePage extends StatelessWidget { const ProfilePage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c); return Live(load: () => s.api.get('/teacher/profile'), builder: (c, d, r) { final p = mapOf(d['profile']);
    return PageBody([Panel(title: 'My profile', child: KV({'Teacher ID': '${p['teacher_no']}', 'Name': '${p['first_name']} ${p['last_name']}', 'Birthdate': '${p['birthdate']}', 'Address': '${p['address']}', 'Contact no.': '${p['contact_no']}', 'Subjects': rowsOf(d['subjects']).map((x) => '${x['code']} ${x['name']}').join('; ')})), const Text('To change these details, ask the administrator.')]); }); }
}
