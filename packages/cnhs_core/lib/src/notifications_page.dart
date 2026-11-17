import 'package:flutter/material.dart';
import 'api.dart';
import 'realtime.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

/// The bell: every notification this person has received, newest first.
class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});
  @override Widget build(BuildContext c) {
    final s = Scope.read(c);
    return Live(topics: const ['notifications'], load: () => s.api.get('/notifications'), builder: (c, d, reload) {
      final items = rowsOf(d['items']).map(AppNotification.fromJson).toList();
      return PageBody([
        const Back('Back'),
        Panel(title: 'Notifications', trailing: items.any((n) => !n.read) ? Btn('Mark all read', () async { await s.api.post('/notifications/read', {}); s.rt.setUnread(0); reload(); }, small: true) : null, flush: true,
          child: items.isEmpty ? const Empty('Nothing yet. School updates will appear here as they happen.') : Column(children: [for (final n in items)
            InkWell(onTap: () async { if (!n.read) { await s.api.post('/notifications/read', {'ids': [n.id]}); s.rt.setUnread(s.rt.unread - 1); reload(); } },
              child: Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: n.read ? Colors.transparent : C.indigoTint.withOpacity(.5), border: const Border(bottom: BorderSide(color: C.lineSoft))), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(padding: const EdgeInsets.only(top: 6, right: 10), child: Icon(Icons.circle, size: 9, color: n.read ? Colors.transparent : C.orange)),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(n.title, style: sans(14.5, w: 700)), if (n.body.isNotEmpty) Text(n.body, style: sans(13.5, color: C.ink2)), Text(fmtDT(n.at.toIso8601String()), style: sans(12, color: C.muted))]))])))])),
      ]);
    });
  }
}
