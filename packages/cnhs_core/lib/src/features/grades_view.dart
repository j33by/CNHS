import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets.dart';

/// Subjects with Term 1-4, final grade and remarks, plus the general average.
class GradeTable extends StatelessWidget {
  final Map<String, dynamic> grades; final List<dynamic>? released; const GradeTable(this.grades, {super.key, this.released});
  @override Widget build(BuildContext c) {
    final rows = rowsOf(grades['rows']), pass = (grades['passing'] as num?) ?? 75;
    Widget term(Map<String, dynamic> t, int i) { final v = t['$i']; return v == null ? const Text('-') : Text(num2(v), style: sans(14, w: (v as num) < pass ? 700 : 400, color: v < pass ? C.err : C.ink)); }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      DataTbl(['Subject', 'Term 1', 'Term 2', 'Term 3', 'Term 4', 'Final', 'Remarks'], [
        for (final s in rows) ['${s['code']} ${s['name']}', for (var i = 1; i <= 4; i++) term(mapOf(s['t']), i), Text(s['final'] == null ? '-' : '${s['final']}', style: sans(14, w: 700)),
          s['final'] == null ? const Text('Incomplete') : (s['final'] as num) >= pass ? const TagChip('Passed', kind: 'passed') : const TagChip('Failed', kind: 'failed')],
        ['General average', '', '', '', '', Text(grades['avg'] == null ? '-' : '${grades['avg']}', style: sans(14, w: 700)), 'Passing: $pass']], emptyText: 'No grades to show yet.'),
      if (released != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Terms released to students: ${released!.isEmpty ? 'none yet' : released!.map((t) => 'Term $t').join(', ')}', style: sans(12.5, color: C.muted))),
    ]);
  }
}

/// Printable-style report card drawn on screen.
class ReportCardView extends StatelessWidget {
  final Map<String, dynamic> card; const ReportCardView(this.card, {super.key});
  @override Widget build(BuildContext c) {
    final a = mapOf(card['attendance']);
    return Container(margin: const EdgeInsets.only(bottom: 16), padding: const EdgeInsets.all(20), decoration: BoxDecoration(color: Colors.white, border: Border.all(color: C.lineStrong), borderRadius: BorderRadius.circular(6)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [ClipOval(child: Image.asset('assets/logo.png', package: 'cnhs_core', width: 54)), const SizedBox(width: 14), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Calape National High School', style: serif(19)), Text('Calape, Bohol', style: sans(13, color: C.muted)), Text('Report on Learning Progress and Achievement', style: sans(14, w: 700))]))]),
      const SizedBox(height: 14),
      KV({'Name': '${card['name']}', 'Student ID': '${card['studentNo'] ?? '-'}', 'LRN': '${card['lrn']}', 'Sex / birthdate': '${card['sex'] == 'M' ? 'Male' : 'Female'} / ${card['birthdate']}', 'Grade and section': 'Grade ${card['gradeLevel']}${card['section'] != null ? ' - ${card['section']}' : ''}', 'School year': '${card['schoolYear']}'}),
      const SizedBox(height: 12), GradeTable(mapOf(card['grades'])), const SizedBox(height: 10),
      Text('Attendance: Present ${a['P']}, Late ${a['L']}, Excused ${a['E']}, Absent ${a['A']} day(s).${'${card['honor']}'.isNotEmpty ? '  ${card['honor']}' : ''}', style: sans(14, w: '${card['honor']}'.isNotEmpty ? 700 : 400)),
      const SizedBox(height: 22), Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [SizedBox(width: 170, child: Column(children: [Text('${card['adviser']}', style: sans(14)), const Divider(), Text('Class adviser', style: sans(12, color: C.muted))])), SizedBox(width: 170, child: Column(children: [const Text(' '), const Divider(), Text('School head', style: sans(12, color: C.muted))]))]),
    ]));
  }
}
