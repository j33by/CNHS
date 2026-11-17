import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';
import 'common.dart';

/* ================= Grades ================= */
class GradesPage extends StatefulWidget { const GradesPage({super.key}); @override State<GradesPage> createState() => _GradesState(); }
class _GradesState extends State<GradesPage> {
  int y = 0, sec = 0, sub = 0, term = 0, tick = 0; final ctl = <int, TextEditingController>{}; String sig = '';
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Column(children: [Padding(padding: const EdgeInsets.fromLTRB(24, 16, 24, 0), child: YearSection(onChange: (a, b) => setState(() { y = a; sec = b; sub = 0; term = 0; }))),
      Expanded(child: y == 0 ? const SizedBox() : Live(reloadKey: '$y-$sec-$sub-$term-$tick', topics: const ['grades'], load: () => s.api.get('/admin/grades', {'y': y, 'sec': sec, 'sub': sub, 'term': term}), builder: (c, d, reload) {
        final rel = (d['released'] as List).map(asInt).toList(), subs = rowsOf(d['subjects']), studs = rowsOf(d['students']);
        final key = '${d['subject']}-${d['term']}-${studs.length}'; if (key != sig) { sig = key; ctl.clear(); for (final x in studs) { ctl[asInt(x['id'])] = TextEditingController(text: x['grade'] == null ? '' : num2(x['grade'])); } }
        return PageBody([Panel(title: 'Release grades to students', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Students only see terms that are released. Releasing sends them a notification, and teachers cannot change a released term.', style: sans(13.5, color: C.muted)), const SizedBox(height: 8),
            Wrapx([for (var t = 1; t <= 4; t++) FilterChip(label: Text('Term $t ${rel.contains(t) ? '· Released' : '· Hidden'}'), selected: rel.contains(t), onSelected: (v) async { if (await confirm(c, v ? 'Release Term $t grades to students? They will be notified.' : 'Hide Term $t grades from students?', yes: v ? 'Release' : 'Hide')) { await act(c, () => s.api.post('/admin/grades/release', {'y': y, 'term': t, 'on': v})); reload(); } })])])),
          if (sec == 0) const Empty('Select a section to enter grades.') else if (subs.isEmpty) const Empty('This section has no subjects yet.') else Panel(title: 'Enter grades', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrapx([SizedBox(width: 300, child: Drop<int>('Subject', asInt(d['subject']), {for (final x in subs) asInt(x['id']): '${x['n']}'}, (v) => setState(() { sub = v ?? 0; }))), SizedBox(width: 140, child: Drop<int>('Term', asInt(d['term']), const {1: 'Term 1', 2: 'Term 2', 3: 'Term 3', 4: 'Term 4'}, (v) => setState(() { term = v ?? 0; })))]),
            DataTbl(['Student ID', 'Student', 'Grade (0 to 100)'], [for (final x in studs) [Text('${x['student_no'] ?? '-'}', style: mono), '${x['name']}', SizedBox(width: 110, child: TextField(controller: ctl[asInt(x['id'])], keyboardType: const TextInputType.numberWithOptions(decimal: true), style: sans(15), decoration: const InputDecoration(isDense: true, border: OutlineInputBorder())))]], emptyText: 'No students in this section.'), const SizedBox(height: 12),
            Btn('Save grades', studs.isEmpty ? null : () async { final r = await act(c, () => s.api.post('/admin/grades/save', {'sec': sec, 'sub': d['subject'], 'term': d['term'], 'g': {for (final e in ctl.entries) '${e.key}': e.value.text}})); if (r != null) { sig = ''; reload(); } }, pri: true)]))]); }))]); }
}

/* ================= Attendance (view only) ================= */
class AttendancePage extends StatefulWidget { const AttendancePage({super.key}); @override State<AttendancePage> createState() => _AttState(); }
class _AttState extends State<AttendancePage> {
  int y = 0, sec = 0, sub = 0; final date = TextEditingController(text: todayStr());
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Column(children: [Padding(padding: const EdgeInsets.fromLTRB(24, 16, 24, 0), child: YearSection(onChange: (a, b) => setState(() { y = a; sec = b; sub = 0; }), extra: [DateFld('Date', date)])),
      Expanded(child: sec == 0 ? const Empty('Select a section to see attendance. Teachers record it; this view is read-only.') : Live(reloadKey: '$y-$sec-$sub-${date.text}', topics: const ['attendance'], load: () => s.api.get('/admin/attendance', {'y': y, 'sec': sec, 'sub': sub, 'date': date.text}), builder: (c, d, reload) { final subs = rowsOf(d['subjects']), watch = rowsOf(d['watch']);
        return PageBody([Panel(title: 'Attendance for ${date.text}', trailing: SizedBox(width: 260, child: DropdownButton<int>(isExpanded: true, value: sub, items: [const DropdownMenuItem(value: 0, child: Text('Homeroom (daily)')), for (final x in subs) DropdownMenuItem(value: asInt(x['id']), child: Text('${x['n']}', overflow: TextOverflow.ellipsis))], onChanged: (v) => setState(() => sub = v ?? 0))), flush: true,
          child: DataTbl(['Student', 'Status', 'Remarks', 'Marked by'], [for (final r in rowsOf(d['rows'])) ['${r['name']}', r['status'] == null ? const Text('Not marked', style: TextStyle(color: C.muted)) : statusTag({'P': 'present', 'A': 'absent', 'L': 'late', 'E': 'ok'}['${r['status']}'] ?? '', labels: const {'present': 'Present', 'absent': 'Absent', 'late': 'Late', 'ok': 'Excused'}), '${r['remarks'] ?? ''}', '${r['marked_by'] ?? ''}']])),
          if (watch.isNotEmpty) Panel(title: 'Absence watch', flush: true, child: DataTbl(['Student', 'Subject', 'Absences', 'Standing'], [for (final w in watch) ['${w['student']}', '${w['subject']}', '${w['absences']} of ${w['free']} allowed', standingTag('${w['standing']}')]])),
          Panel(title: 'Homeroom summary for ${'${d['month']}'}', flush: true, child: DataTbl(['Student', 'Present', 'Absent', 'Late', 'Excused'], [for (final r in rowsOf(d['summary'])) ['${r['name']}', '${r['p']}', '${r['a']}', '${r['l']}', '${r['e']}']]))]); }))]); }
}

/* ================= Reports ================= */
class ReportsPage extends StatefulWidget { const ReportsPage({super.key}); @override State<ReportsPage> createState() => _ReportsState(); }
class _ReportsState extends State<ReportsPage> {
  int y = 0, sec = 0;
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Column(children: [Padding(padding: const EdgeInsets.fromLTRB(24, 16, 24, 0), child: YearSection(onChange: (a, b) => setState(() { y = a; sec = b; }), extra: [Btn('Export student list (CSV)', () => downloadCsv(c, '/admin/reports/csv/students', 'students.csv', {'y': y}), small: true)])),
      Expanded(child: sec == 0 ? const Empty('Select a section for rankings and report cards.') : Live(reloadKey: '$y-$sec', topics: const ['grades'], load: () => s.api.get('/admin/reports', {'y': y, 'sec': sec}), builder: (c, d, reload) => PageBody([
        Panel(title: 'Class ranking', trailing: Wrapx([Btn('Export grades (CSV)', () => downloadCsv(c, '/admin/reports/csv/grades', 'grades.csv', {'y': y, 'sec': sec}), small: true), Btn('All report cards', () => openPage(c, AllCardsPage(y, sec)), small: true)]), flush: true,
          child: DataTbl(['Rank', 'Student', 'General average', 'Honors', ''], [for (final r in rowsOf(d['list'])) [r['rank'] == null ? '-' : '${r['rank']}', '${r['name']}', r['avg'] == null ? '-' : '${r['avg']}${r['complete'] == true ? '' : ' (incomplete)'}', '${r['honor']}', Btn('Report card', () => openPage(c, CardPage(asInt(r['id']), y)), small: true)]], emptyText: 'No students in this section.')),
        const Text('Ranks and honors count only students with a final grade in every subject.')]))) ]); }
}
class CardPage extends StatelessWidget { final int id, y; const CardPage(this.id, this.y, {super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c); return Live(load: () => s.api.get('/admin/reports/card/$id', {'y': y}), builder: (c, d, r) => PageBody([const Back('Reports'), ReportCardView(mapOf(d['card']))])); } }
class AllCardsPage extends StatelessWidget { final int y, sec; const AllCardsPage(this.y, this.sec, {super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c); return Live(load: () => s.api.get('/admin/reports/cards', {'y': y, 'sec': sec}), builder: (c, d, r) => PageBody([const Back('Reports'), for (final x in rowsOf(d['cards'])) ReportCardView(x)])); } }
