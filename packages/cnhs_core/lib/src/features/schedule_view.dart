import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets.dart';

const _days = {1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday'};
int _tone(String code) => code.codeUnits.fold(0, (a, b) => a + b) % 6;

/// Weekly timetable (calendar) or plain list, same as the web portal.
class ScheduleView extends StatefulWidget {
  final List<Map<String, dynamic>> rows; final bool showTeacher, showSection; final Widget Function(Map<String, dynamic>)? trailing;
  const ScheduleView(this.rows, {super.key, this.showTeacher = true, this.showSection = false, this.trailing});
  @override State<ScheduleView> createState() => _ScheduleViewState();
}
class _ScheduleViewState extends State<ScheduleView> {
  bool cal = true;
  @override Widget build(BuildContext c) {
    final rows = widget.rows;
    final switcher = Align(alignment: Alignment.centerRight, child: SegmentedButton<bool>(showSelectedIcon: false, style: SegmentedButton.styleFrom(backgroundColor: C.card, selectedBackgroundColor: C.indigoTint), segments: const [ButtonSegment(value: true, label: Text('Calendar')), ButtonSegment(value: false, label: Text('List'))], selected: {cal}, onSelectionChanged: (v) => setState(() => cal = v.first)));
    if (rows.isEmpty) return const Empty('No schedule entries yet.');
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [switcher, const SizedBox(height: 10), cal ? _calendar(rows) : _list(rows)]);
  }
  Widget _list(List<Map<String, dynamic>> rows) => DataTbl(['Day', 'Time', 'Subject', if (widget.showSection) 'Section', if (widget.showTeacher) 'Teacher', 'Room', if (widget.trailing != null) ''], [for (final r in rows) [
    _days[asInt(r['day_of_week'])] ?? '', '${t12('${r['start_time']}')} - ${t12('${r['end_time']}')}', '${r['code']} ${r['name']}', if (widget.showSection) 'Grade ${r['grade_level']} - ${r['sec']}',
    if (widget.showTeacher) (r['tl'] != null ? '${r['tl']}, ${r['tf']}' : '-'), '${r['room'] ?? '-'}', if (widget.trailing != null) widget.trailing!(r)]]);
  Widget _calendar(List<Map<String, dynamic>> rows) {
    final slots = <String, List<String>>{}, grid = <String, Map<int, List<Map<String, dynamic>>>>{};
    for (final r in rows) { final s = '${r['start_time']}'.substring(0, 5), e = '${r['end_time']}'.substring(0, 5), k = '$s-$e'; slots[k] = [s, e]; ((grid[k] ??= {})[asInt(r['day_of_week'])] ??= []).add(r); }
    final keys = slots.keys.toList()..sort(); final now = DateTime.now(), tod = now.weekday, hm = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    return SingleChildScrollView(scrollDirection: Axis.horizontal, child: Table(defaultColumnWidth: const FixedColumnWidth(160), columnWidths: const {0: FixedColumnWidth(86)}, border: TableBorder.all(color: C.lineSoft), children: [
      TableRow(decoration: const BoxDecoration(color: C.paper2), children: [const Padding(padding: EdgeInsets.all(10), child: Text('Time')), for (final d in _days.entries) Container(color: d.key == tod ? C.orangeTint : null, padding: const EdgeInsets.all(10), child: Text(d.key == tod ? '${d.value} · Today' : d.value, style: sans(13, w: 700)))]),
      for (final k in keys) TableRow(children: [
        Padding(padding: const EdgeInsets.all(10), child: Text('${t12('${slots[k]![0]}:00')}\nto ${t12('${slots[k]![1]}:00')}', style: sans(12, w: 600, color: C.ink2))),
        for (final d in _days.keys) Container(color: d == tod ? C.orangeTint.withOpacity(.25) : null, padding: const EdgeInsets.all(4), child: Column(children: [for (final r in grid[k]![d] ?? const <Map<String, dynamic>>[]) _box(r, d == tod && slots[k]![0].compareTo(hm) <= 0 && slots[k]![1].compareTo(hm) > 0)])),
      ]),
    ]));
  }
  Widget _box(Map<String, dynamic> r, bool live) => Container(margin: const EdgeInsets.only(bottom: 4), padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: C.tones[_tone('${r['code']}')], borderRadius: BorderRadius.circular(8), border: live ? Border.all(color: C.orange, width: 2) : null),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [if (live) Text('NOW', style: sans(10.5, w: 700, color: C.orangeInk)), Text('${r['name']}', style: sans(13, w: 700)), Text('${r['code']}', style: sans(11.5, color: C.muted)),
      if (widget.showSection) Text('Grade ${r['grade_level']} - ${r['sec']}', style: sans(12)), if (widget.showTeacher && r['tl'] != null) Text('${r['tf']} ${r['tl']}', style: sans(12)), if (r['room'] != null) Text('Room ${r['room']}', style: sans(12)), if (widget.trailing != null) widget.trailing!(r)]));
}
