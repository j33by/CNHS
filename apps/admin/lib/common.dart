import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';

/// "School year + Section" pickers used by grades, attendance, reports and schedules.
class YearSection extends StatefulWidget {
  final void Function(int year, int section) onChange; final List<Widget> extra; const YearSection({super.key, required this.onChange, this.extra = const []});
  @override State<YearSection> createState() => _YSState();
}
class _YSState extends State<YearSection> {
  int y = 0, sec = 0; List<Map<String, dynamic>> years = [], secs = []; bool ready = false;
  @override void initState() { super.initState(); _load(null); }
  Future<void> _load(int? yr) async {
    final s = Scope.read(context);
    try { final r = await s.api.get('/admin/lookups', {'y': yr}); years = rowsOf(r['years']); secs = rowsOf(r['sections']); y = yr ?? asInt(r['currentYearId']); if (!secs.any((x) => asInt(x['id']) == sec)) sec = 0; } catch (_) {}
    if (mounted) setState(() => ready = true); widget.onChange(y, sec);
  }
  @override Widget build(BuildContext c) => !ready ? const LinearProgressIndicator() : FilterBar([
    Drop<int>('School year', y, {for (final r in years) asInt(r['id']): '${r['label']}'}, (v) { if (v != null) { sec = 0; _load(v); } }),
    Drop<int>('Section', sec, {0: 'Select a section', for (final r in secs) asInt(r['id']): 'Grade ${r['grade_level']} - ${r['name']}'}, (v) { setState(() => sec = v ?? 0); widget.onChange(y, sec); }), ...widget.extra]);
}
const gradeNames = {7: 'Grade 7', 8: 'Grade 8', 9: 'Grade 9', 10: 'Grade 10', 11: 'Grade 11', 12: 'Grade 12'};
const stuStatus = {'enrolled': 'Enrolled', 'dropped': 'Dropped', 'transferred': 'Transferred out', 'graduated': 'Graduated'};
const tchStatus = {'active': 'Active', 'on_leave': 'On leave', 'resigned': 'Resigned', 'retired': 'Retired', 'terminated': 'Terminated'};
