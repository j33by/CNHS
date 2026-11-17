import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';
import 'common.dart';

/* ================= Sections ================= */
class SectionsPage extends StatefulWidget { const SectionsPage({super.key}); @override State<SectionsPage> createState() => _SectionsState(); }
class _SectionsState extends State<SectionsPage> {
  int y = 0, grade = 7, count = 1, term = 1, tick = 0; List<Map<String, dynamic>> years = []; List<TextEditingController> names = [TextEditingController()];
  @override void initState() { super.initState(); Scope.read(context).api.get('/admin/lookups').then((r) { if (mounted) setState(() { years = rowsOf(r['years']); y = asInt(r['currentYearId']); }); }); }
  @override Widget build(BuildContext c) { final s = Scope.read(c); if (y == 0) return const Center(child: CircularProgressIndicator(color: C.indigo));
    return Live(reloadKey: '$y-$tick', topics: const ['people', 'classes'], load: () => s.api.get('/admin/sections', {'y': y}), builder: (c, d, reload) {
      final rows = rowsOf(d['rows']);
      return PageBody([FilterBar([Drop<int>('School year', y, {for (final r in years) asInt(r['id']): '${r['label']}'}, (v) => setState(() => y = v ?? y))]),
        Panel(title: 'Create sections', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrapx([SizedBox(width: 150, child: Drop<int>('Grade', grade, gradeNames, (v) => setState(() => grade = v ?? 7))), SizedBox(width: 150, child: Drop<int>('How many', count, {for (var i = 1; i <= 20; i++) i: '$i'}, (v) => setState(() { count = v ?? 1; while (names.length < count) { names.add(TextEditingController()); } while (names.length > count) { names.removeLast(); } }))), SizedBox(width: 170, child: Drop<int>('Grading term', term, const {1: 'Term 1', 2: 'Term 2', 3: 'Term 3', 4: 'Term 4'}, (v) => setState(() => term = v ?? 1)))]),
          Wrapx([for (var i = 0; i < count; i++) SizedBox(width: 200, child: Fld('Section ${i + 1} name', names[i], maxLength: 40))]),
          Btn('Create sections', () async { final r = await act(c, () => s.api.post('/admin/sections', {'y': y, 'grade': grade, 'count': count, 'term': term, 'names': names.take(count).map((e) => e.text).toList()})); if (r != null) { for (final n in names) n.clear(); reload(); } }, pri: true)])),
        for (final g in [for (final x in {...rows.map((r) => asInt(r['grade_level']))}) x]) Panel(title: 'Grade $g', child: Wrapx([for (final r in rows.where((r) => asInt(r['grade_level']) == g)) InkWell(onTap: () async { await openPage(c, SectionDetailPage(asInt(r['id']))); reload(); }, child: Container(width: 230, padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: C.field, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(10)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${r['name']}', style: serif(18)), Text('${r['students']} students · ${r['subjects']} subjects', style: sans(13, color: C.muted)), Text('Adviser: ${r['adviser'] ?? 'none'}', style: sans(13)), Text('Grading term ${r['grading_term']}', style: sans(12.5, color: C.muted))])))])),
        if (rows.isEmpty) const Empty('No sections for this school year yet.')]);
    }); }
}
class SectionDetailPage extends StatefulWidget { final int id; const SectionDetailPage(this.id, {super.key}); @override State<SectionDetailPage> createState() => _SectionDetailState(); }
class _SectionDetailState extends State<SectionDetailPage> {
  final name = TextEditingController(); int term = 1, adviser = 0, addSub = 0; bool init = false; final picked = <int>{};
  @override Widget build(BuildContext c) { final s = Scope.read(c), base = '/admin/sections/${widget.id}';
    return Live(topics: const ['people', 'classes'], load: () => s.api.get(base), builder: (c, d, reload) {
      final sec = mapOf(d['section']), mem = rowsOf(d['members']), cand = rowsOf(d['candidates']), subs = rowsOf(d['subjects']), adv = rowsOf(d['advisers']), addable = rowsOf(d['addable']);
      if (!init) { name.text = '${sec['name']}'; term = asInt(sec['grading_term']); adviser = asInt(sec['adviser_id']); init = true; }
      return PageBody([const Back('All sections'),
        Stats([StatData('${mem.length} / ${d['estimate']}', 'Assigned / estimated'), StatData('Grade ${sec['grade_level']}', '${sec['year']}'), StatData('Term ${sec['grading_term']}', 'Grading term'), StatData('${cand.length}', 'Unassigned in this grade')]),
        Panel(title: 'Section details', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Wrapx([SizedBox(width: 240, child: Fld('Section name', name, maxLength: 40)), SizedBox(width: 160, child: Drop<int>('Grading term', term, const {1: 'Term 1', 2: 'Term 2', 3: 'Term 3', 4: 'Term 4'}, (v) => setState(() => term = v ?? 1))),
          SizedBox(width: 280, child: Drop<int>('Class adviser', adviser, {0: 'None', for (final a in adv) asInt(a['id']): '${a['n']}'}, (v) => setState(() => adviser = v ?? 0)))]),
          Wrapx([Btn('Save section', () async { await act(c, () => s.api.post('$base/update', {'name': name.text, 'term': term, 'adviser_id': adviser == 0 ? null : adviser})); reload(); }, pri: true),
            Btn('Delete section', () async { if (await confirm(c, 'Remove this section? Its students become unassigned (restorable from Activity logs).', yes: 'Delete', danger: true)) { final r = await act(c, () => s.api.post('$base/delete', {})); if (r != null && c.mounted) Navigator.of(c).pop(); } }, danger: true)])])),
        Panel(title: 'Subjects and subject teachers (${subs.length}/${d['maxSubjects']})', flush: true, child: Column(children: [DataTbl(['Subject', 'Teacher', ''], [for (final x in subs) ['${x['code']} ${x['name']}',
          SizedBox(width: 260, child: DropdownButton<int>(isExpanded: true, value: [0, ...rowsOf(x['options']).map((o) => asInt(o['id']))].contains(asInt(x['teacher_id'])) ? asInt(x['teacher_id']) : 0, items: [const DropdownMenuItem(value: 0, child: Text('No teacher yet')), for (final o in rowsOf(x['options'])) DropdownMenuItem(value: asInt(o['id']), child: Text('${o['name']}'))], onChanged: (v) async { await act(c, () => s.api.post('$base/subteacher', {'subject_id': x['id'], 'teacher_id': v == 0 ? null : v})); reload(); })),
          Btn('Remove', () async { await act(c, () => s.api.post('$base/rmsub', {'subject_id': x['id']})); reload(); }, small: true, danger: true)]], emptyText: 'No subjects in this section yet.'),
          Padding(padding: const EdgeInsets.all(14), child: Wrapx([SizedBox(width: 320, child: Drop<int>('Add a subject', addSub, {0: 'Choose...', for (final a in addable) asInt(a['id']): '${a['code']} - ${a['name']}'}, (v) => setState(() => addSub = v ?? 0))), Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('Add to section', addSub == 0 ? null : () async { await act(c, () => s.api.post('$base/addsub', {'subject_id': addSub})); setState(() => addSub = 0); reload(); }, pri: true))]))])),
        Panel(title: 'Students in this section (${mem.length}/${d['cap']})', trailing: Btn('Generate portal passwords', () async { final r = await act(c, () => s.api.post('$base/portal-all', {}), quiet: true); if (r != null && c.mounted) _showAll(c, rowsOf(r['rows']), '${sec['name']}'); reload(); }, small: true), flush: true, child: DataTbl(['#', 'Student ID', 'Name', 'Portal', ''], [for (var i = 0; i < mem.length; i++) ['${i + 1}', Text('${mem[i]['student_no'] ?? '-'}', style: mono), '${mem[i]['name']}', mem[i]['has_portal'] == true ? 'Yes' : 'No', Btn('Remove', () async { await act(c, () => s.api.post('$base/remove', {'student_id': mem[i]['id']})); reload(); }, small: true, danger: true)]], emptyText: 'No students in this section yet.')),
        Panel(title: 'Add students (Grade ${sec['grade_level']}, not yet in a section)', child: cand.isEmpty ? const Text('Everyone in this grade already has a section.') : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Wrap(spacing: 8, runSpacing: 4, children: [for (final x in cand) FilterChip(label: Text('${x['name']}'), selected: picked.contains(asInt(x['id'])), onSelected: (v) => setState(() => v ? picked.add(asInt(x['id'])) : picked.remove(asInt(x['id']))))]), const SizedBox(height: 12),
          Wrapx([Btn('Select all', () => setState(() => picked.addAll(cand.map((x) => asInt(x['id'])))), small: true), Btn('Add ${picked.length} selected', picked.isEmpty ? null : () async { await act(c, () => s.api.post('$base/add', {'student_ids': picked.toList()})); setState(picked.clear); reload(); }, pri: true)])]))]);
    }); }
  void _showAll(BuildContext c, List<Map<String, dynamic>> rows, String sec) => showDialog(context: c, builder: (x) => AlertDialog(backgroundColor: C.card, title: Text('Student portal accounts - $sec', style: serif(19)), content: SizedBox(width: 560, child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const AlertBox('Passwords are shown only now. Copy or write them down. Students must change the password at first sign-in.', kind: 'warn'), DataTbl(['Student ID', 'Name', 'Temporary password'], [for (final r in rows) [Text('${r['student_no']}', style: mono), '${r['name']}', SelectableText('${r['password']}', style: mono.copyWith(fontWeight: FontWeight.w700))]], emptyText: 'Every student in this section already has a portal account. Reset individual passwords from the student record.')]))),
    actions: [TextButton(onPressed: () { Clipboard.setData(ClipboardData(text: rows.map((r) => '${r['student_no']}\t${r['name']}\t${r['password']}').join('\n'))); toast(c, 'Copied as a table.'); }, child: const Text('Copy all')), FilledButton(onPressed: () => Navigator.pop(x), child: const Text('Done'))]));
}

/* ================= Subjects ================= */
class SubjectsPage extends StatelessWidget { const SubjectsPage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['classes'], load: () => s.api.get('/admin/subjects'), builder: (c, d, reload) => PageBody([Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('Add subject', () async { await openPage(c, const SubjectFormPage()); reload(); }, pri: true, icon: Icons.add))),
      Panel(flush: true, child: DataTbl(['Subject ID', 'Name', 'Grade', 'Teachers', ''], [for (final r in rowsOf(d['rows'])) ['${r['code']}', '${r['name']}', r['grade_level'] == null ? 'All grades' : 'Grade ${r['grade_level']}', '${r['teachers']}'.isEmpty ? '-' : '${r['teachers']}',
        Wrapx([Btn('Edit', () async { await openPage(c, SubjectFormPage(id: asInt(r['id']))); reload(); }, small: true), Btn('Delete', () async { if (await confirm(c, 'Remove subject ${r['code']}?', yes: 'Delete', danger: true)) { await act(c, () => s.api.post('/admin/subjects/${r['id']}/delete', {})); reload(); } }, small: true, danger: true)])]], emptyText: 'No subjects yet.'))])); }
}
class SubjectFormPage extends StatefulWidget { final int? id; const SubjectFormPage({super.key, this.id}); @override State<SubjectFormPage> createState() => _SubjectFormState(); }
class _SubjectFormState extends State<SubjectFormPage> {
  final code = TextEditingController(), name = TextEditingController(); int grade = 0; final picked = <int>{}; List<Map<String, dynamic>> tch = []; int max = 5, maxT = 3; bool ready = false;
  @override void initState() { super.initState(); () async { final s = Scope.read(context); try { final t = await s.api.get('/admin/subjects-teachers', {'subject': widget.id ?? 0}); tch = rowsOf(t['rows']); max = asInt(t['max']);
    if (widget.id != null) { final r = mapOf((await s.api.get('/admin/subjects/${widget.id}'))['subject']); code.text = '${r['code']}'; name.text = '${r['name']}'; grade = asInt(r['grade_level']); picked.addAll((r['teachers'] as List).map(asInt)); } } catch (_) {} if (mounted) setState(() => ready = true); }(); }
  @override Widget build(BuildContext c) { if (!ready) return const Center(child: CircularProgressIndicator(color: C.indigo)); final s = Scope.read(c);
    return PageBody([const Back('Subjects'), Panel(title: widget.id == null ? 'Add subject' : 'Edit subject', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      FormGrid([Fld('Subject ID', code, req: true, maxLength: 20), Fld('Subject name', name, req: true, maxLength: 120), Drop<int>('Grade level', grade, {0: 'All grades', ...gradeNames}, (v) => setState(() => grade = v ?? 0))]),
      Text('Assign teachers (up to $maxT; each teacher up to $max subjects)', style: sans(14, w: 700)), const SizedBox(height: 6),
      Wrap(spacing: 8, runSpacing: 4, children: [for (final t in tch) FilterChip(label: Text('${t['last_name']}, ${t['first_name']} (${t['load']}/$max)'), selected: picked.contains(asInt(t['id'])), onSelected: asInt(t['load']) >= max && !picked.contains(asInt(t['id'])) ? null : (v) => setState(() => v ? picked.add(asInt(t['id'])) : picked.remove(asInt(t['id']))))]), const SizedBox(height: 16),
      Wrapx([Btn('Cancel', () => Navigator.of(c).pop()), Btn('Save subject', () async { final body = {'code': code.text, 'name': name.text, 'grade_level': grade == 0 ? null : grade, 'teachers': picked.toList()}; final r = await act(c, () => widget.id == null ? s.api.post('/admin/subjects', body) : s.api.put('/admin/subjects/${widget.id}', body)); if (r != null && c.mounted) Navigator.of(c).pop(); }, pri: true)])]))]); }
}

/* ================= Schedules ================= */
class SchedulePage extends StatefulWidget { const SchedulePage({super.key}); @override State<SchedulePage> createState() => _ScheduleState(); }
class _ScheduleState extends State<SchedulePage> {
  int y = 0, sec = 0, sub = 0, day = 1; final st = TextEditingController(text: '07:30'), en = TextEditingController(text: '08:30'), room = TextEditingController();
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Column(children: [Padding(padding: const EdgeInsets.fromLTRB(24, 16, 24, 0), child: YearSection(onChange: (a, b) => setState(() { y = a; sec = b; }))),
      Expanded(child: sec == 0 ? const Empty('Select a section to see its weekly schedule.') : Live(reloadKey: sec, topics: const ['schedule'], load: () => s.api.get('/admin/schedule', {'sec': sec}), builder: (c, d, reload) { final subs = rowsOf(d['subjects']);
        final list = Panel(title: 'Weekly schedule', child: ScheduleView(rowsOf(d['rows']), trailing: (r) => Btn('Remove', () async { await act(c, () => s.api.post('/admin/schedule/$sec/del', {'entry': r['id']})); reload(); }, small: true, danger: true)));
        final form = subs.isEmpty ? const Empty('Add subjects to this section first.') : Panel(title: 'Add class period', child: Column(children: [Drop<int>('Subject', subs.any((x) => asInt(x['id']) == sub) ? sub : asInt(subs.first['id']), {for (final x in subs) asInt(x['id']): '${x['n']}'}, (v) => setState(() => sub = v ?? 0)),
          Drop<int>('Day', day, const {1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday'}, (v) => setState(() => day = v ?? 1)), TimeFld('Start', st), TimeFld('End', en), Fld('Room (optional)', room, maxLength: 30), Text('Conflicts for the section, the teacher and the room are blocked.', style: sans(12.5, color: C.muted)), const SizedBox(height: 10),
          Btn('Add period', () async { final pick = subs.any((x) => asInt(x['id']) == sub) ? sub : asInt(subs.first['id']); final r = await act(c, () => s.api.post('/admin/schedule/$sec/add', {'subject_id': pick, 'day': day, 'start': st.text, 'end': en.text, 'room': room.text})); if (r != null) { room.clear(); reload(); } }, pri: true, wide: true)]));
        return PageBody([isWide(c) ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: list), const SizedBox(width: 16), SizedBox(width: 320, child: form)]) : Column(children: [list, form])]); }))]); }
}

/* ================= School years ================= */
class YearsPage extends StatefulWidget { const YearsPage({super.key}); @override State<YearsPage> createState() => _YearsState(); }
class _YearsState extends State<YearsPage> {
  final label = TextEditingController(), sd = TextEditingController(), ed = TextEditingController(); int from = 0, to = 0; bool retain = true;
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(load: () => s.api.get('/admin/years'), builder: (c, d, reload) { final rows = rowsOf(d['rows']); final yo = {for (final r in rows) asInt(r['id']): '${r['label']}'}; if (from == 0 && rows.length > 1) { to = asInt(rows.first['id']); from = asInt(rows[1]['id']); }
      return PageBody([Panel(title: 'School years', flush: true, child: DataTbl(['Label', 'Start', 'End', 'Status', ''], [for (final r in rows) ['${r['label']}', '${r['start_date']}', '${r['end_date']}', r['is_current'] == true ? const TagChip('Current', kind: 'active') : '', r['is_current'] == true ? '' : Btn('Set current', () async { if (await confirm(c, 'Make this the current school year?', yes: 'Set current')) { await act(c, () => s.api.post('/admin/years/${r['id']}/current', {})); reload(); } }, small: true)]])),
        Panel(title: 'Add school year', child: Wrapx([SizedBox(width: 200, child: Fld('Label (e.g. 2027-2028)', label, req: true)), SizedBox(width: 180, child: DateFld('Start date', sd, req: true)), SizedBox(width: 180, child: DateFld('End date', ed, req: true)), Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('Add school year', () async { final r = await act(c, () => s.api.post('/admin/years', {'label': label.text, 'start_date': sd.text, 'end_date': ed.text})); if (r != null) { label.clear(); sd.clear(); ed.clear(); reload(); } }, pri: true))])),
        if (rows.length > 1) Panel(title: 'Year-end promotion', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Moves every enrolled student of the old school year to the next grade in the new year and clears their section. Grade 12 students become graduates. Grades and attendance of the old year are kept.', style: sans(14.5)), const SizedBox(height: 12),
          Wrapx([SizedBox(width: 220, child: Drop<int>('From school year', from, yo, (v) => setState(() => from = v ?? from))), SizedBox(width: 220, child: Drop<int>('To school year', to, yo, (v) => setState(() => to = v ?? to)))]),
          Check('Retain students whose general average is below 75', retain, (v) => setState(() => retain = v)), const SizedBox(height: 8),
          Btn('Run promotion', () async { if (await confirm(c, 'Run year-end promotion? This changes every enrolled student and cannot be undone automatically.', yes: 'Run promotion', danger: true)) { await act(c, () => s.api.post('/admin/years/promote', {'from': from, 'to': to, 'retain': retain})); reload(); } }, pri: true)]))]); }); }
}
