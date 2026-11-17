import 'package:flutter/material.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

const reactionEmoji = {'like': '👍', 'love': '❤️', 'thanks': '🙏', 'noted': '💡'};
const reactionLabel = {'like': 'Like', 'love': 'Love', 'thanks': 'Thanks', 'noted': 'Noted'};

/// Announcements for admin and teachers: history table, compose form, and a detail page with settings, reactions and comments.
class AnnouncementsPage extends StatefulWidget { final String scope; const AnnouncementsPage(this.scope, {super.key}); @override State<AnnouncementsPage> createState() => _AnnState(); }
class _AnnState extends State<AnnouncementsPage> {
  final title = TextEditingController(), body = TextEditingController(); String mode = ''; final picked = <int>{}; bool react = false, comm = false;
  @override Widget build(BuildContext c) {
    final s = Scope.read(c), sc = widget.scope, isT = sc == 'teacher';
    return Live(topics: const ['announcements'], load: () async { final r = await s.api.get('/$sc/announcements'); if (!isT) { final l = await s.api.get('/admin/lookups'); r['sections'] = l['sections']; } return r; }, builder: (c, d, reload) {
      final secs = rowsOf(d['sections']); if (mode.isEmpty) mode = isT ? 'advisory' : 'all';
      final list = Panel(title: isT ? 'My announcements' : 'Announcements', flush: true, child: DataTbl(['Date', 'Title', if (!isT) 'By', 'Sent to', 'Reactions', 'Comments', ''], [for (final r in rowsOf(d['rows'])) [fmtDate(r['created_at']), '${r['title']}', if (!isT) '${r['author_name']}', '${r['audience_label']}', r['allow_reactions'] == true ? '${r['rx']}' : 'off', r['allow_comments'] == true ? '${r['cm']}' : 'off',
        Btn('Open', () async { await openPage(c, AnnouncementDetail(sc, asInt(r['id']))); reload(); }, small: true)]], emptyText: 'No announcements yet.'));
      final form = secs.isEmpty && isT ? const Empty('You have no sections yet, so there is nobody to send to.') : Panel(title: 'New announcement', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Fld('Title', title, maxLength: 160), Fld('Message', body, maxLines: 5, maxLength: 5000), Text('Send to', style: sans(13, w: 700)),
        RadioGroupX(mode, isT ? {'advisory': 'My advisory section', 'all': 'All my sections (${secs.length})', 'selected': 'Selected sections'} : {'all': 'All students', 'selected': 'Selected sections'}, (v) => setState(() => mode = v)),
        if (mode == 'selected') Wrap(spacing: 8, children: [for (final x in secs) FilterChip(label: Text('Grade ${x['grade_level']} - ${x['name']}'), selected: picked.contains(asInt(x['id'])), onSelected: (v) => setState(() => v ? picked.add(asInt(x['id'])) : picked.remove(asInt(x['id']))))]),
        const SizedBox(height: 8), Text('Student interaction', style: sans(13, w: 700)), Check('Allow reactions', react, (v) => setState(() => react = v)), Check('Allow comments', comm, (v) => setState(() => comm = v)), const SizedBox(height: 10),
        Btn('Post announcement', () async { final r = await act(c, () => s.api.post('/$sc/announcements', {'title': title.text, 'body': body.text, 'mode': mode, 'section_ids': picked.toList(), 'allow_reactions': react, 'allow_comments': comm})); if (r != null) { title.clear(); body.clear(); picked.clear(); reload(); } }, pri: true)]));
      return PageBody([isWide(c) ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: list), const SizedBox(width: 16), Expanded(flex: 2, child: form)]) : Column(children: [form, list])]);
    });
  }
}
class RadioGroupX extends StatelessWidget {
  final String value; final Map<String, String> items; final void Function(String) onChanged; const RadioGroupX(this.value, this.items, this.onChanged, {super.key});
  @override Widget build(BuildContext c) => Column(children: [for (final e in items.entries) InkWell(onTap: () => onChanged(e.key), child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [Icon(value == e.key ? Icons.radio_button_checked : Icons.radio_button_off, size: 20, color: value == e.key ? C.indigo : C.muted), const SizedBox(width: 10), Expanded(child: Text(e.value, style: sans(14.5)))])))]);
}

class AnnouncementDetail extends StatefulWidget { final String scope; final int id; const AnnouncementDetail(this.scope, this.id, {super.key}); @override State<AnnouncementDetail> createState() => _AnnDetailState(); }
class _AnnDetailState extends State<AnnouncementDetail> {
  final reply = TextEditingController(); bool? react, comm;
  @override Widget build(BuildContext c) {
    final s = Scope.read(c), sc = widget.scope, base = '/$sc/announcements/${widget.id}';
    return Live(topics: const ['announcements'], load: () => s.api.get(base), builder: (c, d, reload) {
      final a = mapOf(d['announcement']); react ??= a['allow_reactions'] == true; comm ??= a['allow_comments'] == true; final rx = mapOf(a['reactions']), cms = rowsOf(a['comments']);
      return PageBody([const Back('All announcements'),
        Panel(title: '${a['title']}', trailing: Text('${a['author_name']} (${a['author_type']}) · ${fmtDT(a['created_at'])}', style: sans(12, color: C.muted)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SelectableText('${a['body']}', style: sans(15)), const SizedBox(height: 8), Text('Sent to: ${a['sentTo']}', style: sans(13, color: C.muted)), const Divider(height: 28),
          Check('Allow reactions', react!, (v) => setState(() => react = v)), Check('Allow comments', comm!, (v) => setState(() => comm = v)),
          Wrapx([Btn('Save settings', () async { await act(c, () => s.api.post('$base/toggle', {'allow_reactions': react, 'allow_comments': comm})); reload(); }, small: true),
            Btn('Delete announcement', () async { if (await confirm(c, 'Remove this announcement from the student feed?', yes: 'Delete', danger: true)) { final r = await act(c, () => s.api.post('$base/delete', {})); if (r != null && c.mounted) Navigator.of(c).pop(); } }, small: true, danger: true)]),
          const SizedBox(height: 12), Text('Reactions: ${reactionLabel.keys.map((k) => '${reactionLabel[k]} ${rx[k] ?? 0}').join('   ')}', style: sans(14))])),
        Panel(title: 'Comments (${cms.length})', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (cms.isEmpty) Empty(a['allow_comments'] == true ? 'No comments yet.' : 'Comments are turned off for this announcement.'),
          for (final m in cms) Container(padding: const EdgeInsets.symmetric(vertical: 10), decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.lineSoft))), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: 8, children: [Text('${m['author']}', style: sans(14, w: 700)), TagChip('${m['author_type']}'.replaceFirstMapped(RegExp('^.'), (x) => x[0]!.toUpperCase())), Text(fmtDT(m['created_at']), style: sans(12, color: C.muted))]), Text('${m['body']}', style: sans(14.5))])),
            Btn('Remove', () async { if (await confirm(c, 'Remove this comment?', yes: 'Remove', danger: true)) { await act(c, () => s.api.post('$base/delcomment', {'cid': m['id']})); reload(); } }, small: true, danger: true)])),
          if (a['allow_comments'] == true) ...[const SizedBox(height: 12), Fld('Reply', reply, maxLength: 500), Btn('Post reply', () async { final r = await act(c, () => s.api.post('$base/reply', {'body': reply.text})); if (r != null) { reply.clear(); reload(); } }, pri: true)]])),
      ]);
    });
  }
}
