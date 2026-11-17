import 'package:flutter/material.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Activity log. Administrator sees everything; a teacher sees only their own lines. Deleted things have a Restore button.
class LogsPage extends StatefulWidget { final String scope; const LogsPage(this.scope, {super.key}); @override State<LogsPage> createState() => _LogsState(); }
class _LogsState extends State<LogsPage> {
  final u = TextEditingController(), from = TextEditingController(), to = TextEditingController(); String show = '', act_ = '', ent = ''; int page = 1; int tick = 0;
  @override Widget build(BuildContext c) {
    final s = Scope.read(c), adm = widget.scope == 'admin';
    return Live(reloadKey: '$tick-$page', topics: const ['people'], load: () => s.api.get('/${widget.scope}/logs', {'u': u.text, 'show': show, 'act': act_, 'e': ent, 'from': from.text, 'to': to.text, 'p': page}), builder: (c, d, reload) {
      final open = asInt(d['open']), acts = (d['actions'] as List).cast<String>(), ents = (d['entities'] as List).cast<String>();
      return PageBody([
        AlertBox(open > 0 ? '$open deleted item(s) can be restored. Every delete is saved here. Find the line marked Deleted and press Restore.' : 'Nothing is waiting to be restored. When you delete something, it appears here and can be brought back.', kind: open > 0 ? 'warn' : 'ok'),
        FilterBar([if (adm) Fld('User', u), Drop<String>('Show', show, const {'': 'Everything', 'restorable': 'Can be restored', 'restored': 'Already restored'}, (v) => setState(() => show = v ?? '')),
          Drop<String>('Action', act_, {'': 'All', for (final a in acts) a: a.replaceAll('_', ' ')}, (v) => setState(() => act_ = v ?? '')), Drop<String>('Module', ent, {'': 'All', for (final e in ents) e: e}, (v) => setState(() => ent = v ?? '')),
          DateFld('From', from), DateFld('To', to), Btn('Filter', () => setState(() { page = 1; tick++; }))]),
        Panel(flush: true, child: DataTbl(['Time', if (adm) 'User', 'Action', 'Module', 'Details', 'Restore'], [for (final r in rowsOf(d['rows'])) [fmtDT(r['created_at']), if (adm) '${r['username']}',
          Row(mainAxisSize: MainAxisSize.min, children: [Text('${r['action']}'.replaceAll('_', ' ')), if (r['trash_id'] != null && r['restored_at'] == null) ...[const SizedBox(width: 6), const TagChip('Deleted', kind: 'dropped')]]), '${r['entity']}', '${r['details']}',
          r['trash_id'] != null && r['restored_at'] == null ? Btn('Restore', () async { if (await confirm(c, 'Restore "${r['tlabel']}"?', yes: 'Restore')) { await act(c, () => s.api.post('/${widget.scope}/logs/restore', {'id': r['trash_id']})); reload(); } }, small: true, pri: true)
            : r['restored_at'] != null ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const TagChip('Restored', kind: 'ok'), Text(fmtDT(r['restored_at']), style: sans(11.5, color: C.muted))]) : const SizedBox.shrink()]], emptyText: 'No log entries match.')),
        Text('${d['total']} entries. Log lines cannot be edited or deleted; a restore adds its own line.', style: sans(12.5, color: C.muted)), const SizedBox(height: 8),
        Pager(asInt(d['total']), asInt(d['per']), page, (p) => setState(() => page = p)),
      ]);
    });
  }
}
