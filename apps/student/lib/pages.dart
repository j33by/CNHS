import 'package:flutter/material.dart';
import 'package:cnhs_core/cnhs_core.dart';

/* ================= Home ================= */
class HomePage extends StatelessWidget { const HomePage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['grades', 'profile', 'feed', 'schedule'], load: () => s.api.get('/student/home'), builder: (c, d, reload) { final h = DateTime.now().hour, subs = rowsOf(d['subjects']);
      return PageBody([Hello('${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${d['firstName']}.'),
        Stats([StatData('Grade ${d['gradeLevel']}', '${d['section'] ?? 'No section yet'}', sub: 'S.Y. ${d['year']}'), StatData(d['avg'] == null ? '-' : '${d['avg']}', 'General average', sub: 'Released terms only'), StatData('${d['noticeCount']}', 'Notices this month'), StatData('${d['status']}', 'Enrollment status')]),
        if (d['section'] == null) const AlertBox('You have not been placed in a section yet. The registrar will do this soon.', kind: 'warn'),
        Panel(title: 'My subjects', flush: true, child: DataTbl(['Subject', 'Teacher'], [for (final x in subs) ['${x['code']} ${x['name']}', '${x['teacher']}']], emptyText: 'Your subjects will appear once you are in a section.')),
        Panel(title: 'Latest notices', child: rowsOf(d['notices']).isEmpty ? const Text('No notices.') : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final n in rowsOf(d['notices'])) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text.rich(TextSpan(children: [TextSpan(text: '${n['title']}\n', style: sans(14.5, w: 700)), TextSpan(text: fmtDate(n['created_at']), style: sans(12, color: C.muted))])))]))]); }); }
}

/* ================= Grades ================= */
class GradesPage extends StatefulWidget { const GradesPage({super.key}); @override State<GradesPage> createState() => _GradesState(); }
class _GradesState extends State<GradesPage> {
  int y = 0; bool card = false;
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: '$y-$card', topics: const ['grades'], load: () => s.api.get('/student/grades', {'y': y == 0 ? null : y, 'card': card ? 1 : null}), builder: (c, d, reload) { final yrs = rowsOf(d['years']), rel = d['released'] as List;
      return PageBody([FilterBar([Drop<int>('School year', asInt(d['year']), {for (final r in yrs) asInt(r['id']): '${r['label']}'}, (v) => setState(() => y = v ?? 0)), Btn(card ? 'Show table' : 'Show report card', () => setState(() => card = !card))]),
        if (rel.isEmpty) const AlertBox('No grades have been released yet. You will get a notification when your school releases a term.', kind: 'warn'),
        if (card && d['card'] != null) ReportCardView(mapOf(d['card'])) else Panel(title: 'My grades', child: GradeTable(mapOf(d['grades']), released: rel))]); }); }
}

/* ================= Attendance ================= */
class AttendancePage extends StatelessWidget { const AttendancePage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['attendance'], load: () => s.api.get('/student/attendance'), builder: (c, d, reload) { final cn = mapOf(d['counts']);
      return PageBody([Stats([StatData(d['rate'] == null ? '-' : '${d['rate']}%', 'Attendance rate'), StatData('${cn['P']}', 'Present'), StatData('${cn['A']}', 'Absent', warn: asInt(cn['A']) > 0), StatData('${cn['L']}', 'Late'), StatData('${cn['E']}', 'Excused')]),
        Panel(title: 'Absences per subject', flush: true, child: DataTbl(['Subject', 'Absences', 'Allowed', 'Standing'], [for (final r in rowsOf(d['standing'])) ['${r['subject']}', '${r['n']}', '${r['free']}', standingTag('${r['standing']}')]], emptyText: 'No subjects yet.')),
        Panel(title: 'Days you were not present', flush: true, child: DataTbl(['Date', 'Status', 'Remarks'], [for (final r in rowsOf(d['recent'])) [fmtDate(r['att_date']), statusTag({'A': 'absent', 'L': 'late', 'E': 'ok'}['${r['status']}'] ?? '', labels: const {'absent': 'Absent', 'late': 'Late', 'ok': 'Excused'}), '${r['remarks'] ?? ''}']], emptyText: 'No absences or late arrivals recorded.'))]); }); }
}

/* ================= Schedule ================= */
class SchedulePage extends StatelessWidget { const SchedulePage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c); return Live(topics: const ['schedule', 'profile'], load: () => s.api.get('/student/schedule'), builder: (c, d, r) => PageBody([Panel(title: d['section'] == null ? 'Class schedule' : 'Class schedule - ${d['section']}', child: ScheduleView(rowsOf(d['rows'])))])); }
}

/* ================= Feed ================= */
class FeedPage extends StatefulWidget { const FeedPage({super.key}); @override State<FeedPage> createState() => _FeedState(); }
class _FeedState extends State<FeedPage> {
  String f = 'all'; int page = 1; final reply = <int, TextEditingController>{};
  static const filters = {'all': 'All', 'admin': 'From administration', 'teacher': 'From teachers', 'announcement': 'Announcements', 'publication': 'Publications'};
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(reloadKey: '$f-$page', topics: const ['feed'], load: () => s.api.get('/student/feed', {'f': f, 'p': page}), builder: (c, d, reload) { final items = rowsOf(d['items']), base = '${d['imgBase']}';
      return PageBody([SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [for (final e in filters.entries) Padding(padding: const EdgeInsets.only(right: 8, bottom: 14), child: ChoiceChip(label: Text(e.value), selected: f == e.key, onSelected: (_) => setState(() { f = e.key; page = 1; })))])),
        if (items.isEmpty) const Empty('Nothing here yet.'),
        for (final it in items) _card(c, s, it, base, reload), Pager(asInt(d['total']), asInt(d['per']), page, (p) => setState(() => page = p))]); }); }
  Widget _card(BuildContext c, Session s, Map<String, dynamic> it, String base, Future<void> Function() reload) {
    final kind = '${it['kind']}'; final src = '${it['src']}';
    final tag = kind == 'publication' ? const TagChip('Publication', kind: 'info') : kind == 'announcement' ? const TagChip('Announcement', kind: 'warning') : TagChip(src == 'teacher' ? 'Class notice' : 'School notice');
    return Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [tag, Text('${it['by']} · ${fmtDT(it['at'])}', style: sans(12.5, color: C.muted))]), const SizedBox(height: 6),
      if (kind == 'publication' && it['cover'] != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network('$base${it['cover']}', width: double.infinity, height: 160, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink()))),
      Text('${it['title']}', style: serif(19)), const SizedBox(height: 4), SelectableText('${it['body']}', style: sans(14.5)),
      if (kind == 'publication') ...[const SizedBox(height: 10), Wrapx([Btn('Read the full article', () async { await openPage(c, PubReaderPage('student', '${it['slug']}')); reload(); }, pri: true, small: true)]), const SizedBox(height: 10),
        ReactionBar(mapOf(it['counts']), it['mine'] as String?, (k) async { await act(c, () => s.api.post('/student/pub/react', {'pid': it['pid'], 'reaction': k}), quiet: true); reload(); })],
      if (kind == 'announcement') ...[
        if (it['allowReactions'] == true) Padding(padding: const EdgeInsets.only(top: 10), child: ReactionBar(mapOf(it['counts']), it['mine'] as String?, (k) async { await act(c, () => s.api.post('/student/feed/react', {'aid': it['aid'], 'reaction': k}), quiet: true); reload(); })),
        if (it['allowComments'] == true) ...[const Divider(height: 24), for (final m in rowsOf(it['comments'])) Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: Text.rich(TextSpan(children: [TextSpan(text: '${m['author']}${m['author_type'] != 'student' ? ' (${m['author_type']})' : ''}  ', style: sans(13.5, w: 700)), TextSpan(text: '${m['body']}', style: sans(14))]))),
          if (m['own'] == true) IconButton(icon: const Icon(Icons.close, size: 16), onPressed: () async { await act(c, () => s.api.post('/student/feed/delcomment', {'cid': m['id'], 'aid': it['aid']}), quiet: true); reload(); })])),
          Row(children: [Expanded(child: TextField(controller: reply.putIfAbsent(asInt(it['aid']), () => TextEditingController()), maxLength: 500, decoration: InputDecoration(isDense: true, hintText: 'Write a comment', counterText: '', filled: true, fillColor: C.field, border: OutlineInputBorder(borderRadius: BorderRadius.circular(8))))), const SizedBox(width: 8),
            Btn('Post', () async { final ctl = reply[asInt(it['aid'])]!; final r = await act(c, () => s.api.post('/student/feed/comment', {'aid': it['aid'], 'body': ctl.text}), quiet: true); if (r != null) { ctl.clear(); reload(); } }, pri: true, small: true)])]],
    ]));
  }
}

/* ================= Profile ================= */
class ProfilePage extends StatelessWidget { const ProfilePage({super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c); return Live(topics: const ['profile'], load: () => s.api.get('/student/profile'), builder: (c, d, r) { final p = mapOf(d['profile']);
    return PageBody([Panel(title: 'My profile', child: KV({'Student ID': '${p['student_no']}', 'LRN': '${p['lrn']}', 'Name': '${p['name']}', 'Sex': p['sex'] == 'M' ? 'Male' : 'Female', 'Date of birth': '${p['birthdate']}', 'Address': '${p['address']}', 'Grade': 'Grade ${p['grade_level']}', 'Section': '${p['section'] ?? 'Not assigned yet'}', 'Class adviser': '${p['adviser'] ?? '-'}', 'Parent / guardian': '${p['guardian_name']} (${p['guardian_contact']})', 'Emergency contact': '${p['emergency_name']}, ${p['emergency_relation']} (${p['emergency_contact']})', 'Status': '${p['status']}'})), const Text('To correct any detail, please see the school registrar.')]); }); }
}
