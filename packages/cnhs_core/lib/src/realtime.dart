import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api.dart';
import 'notifier.dart';
import 'store.dart';

class AppNotification {
  final int id; final String kind, title, body; final DateTime at; final bool read; final Json data;
  AppNotification(this.id, this.kind, this.title, this.body, this.at, this.read, this.data);
  factory AppNotification.fromJson(Json j) => AppNotification((j['id'] as num).toInt(), '${j['kind']}', '${j['title']}', '${j['body'] ?? ''}', DateTime.tryParse('${j['created_at']}')?.toLocal() ?? DateTime.now(), j['read_at'] != null, (j['data'] as Map?)?.cast<String, dynamic>() ?? {});
}

/// One WebSocket to the backend. Two kinds of message arrive: notifications (shown as system notifications) and "data" topics
/// (open screens listen with [topics] and reload). Reconnects by itself and, after every (re)connect, catches up on anything missed.
class RealtimeService {
  final ApiClient api;
  final bool showNative; // true on Windows (this isolate raises the toast); false on Android (the background service does it)
  RealtimeService(this.api, {required this.showNative});
  final _topics = StreamController<String>.broadcast();
  final _notes = StreamController<AppNotification>.broadcast();
  final _status = StreamController<bool>.broadcast();
  Stream<String> get topics => _topics.stream;
  Stream<AppNotification> get notifications => _notes.stream;
  Stream<bool> get connection => _status.stream;
  bool connected = false; int unread = 0;
  final unreadChanged = StreamController<int>.broadcast();
  WebSocketChannel? _ch; Timer? _ping, _retry; int _backoff = 1; bool _run = false;

  void start() { if (_run) return; _run = true; _connect(); }
  void stop() { _run = false; _ping?.cancel(); _retry?.cancel(); _ch?.sink.close(); _ch = null; _set(false); }
  void _set(bool v) { if (connected != v) { connected = v; _status.add(v); } }
  void setUnread(int n) { unread = n < 0 ? 0 : n; unreadChanged.add(unread); }

  void _connect() {
    if (!_run || api.token == null) return;
    try {
      final ch = WebSocketChannel.connect(api.wsUri); _ch = ch;
      ch.sink.add(jsonEncode({'type': 'auth', 'token': api.token}));
      ch.stream.listen((raw) => _onMsg(raw), onDone: _lost, onError: (_) => _lost(), cancelOnError: true);
      _ping?.cancel(); _ping = Timer.periodic(const Duration(seconds: 25), (_) { try { ch.sink.add('{"type":"ping"}'); } catch (_) {} });
    } catch (_) { _lost(); }
  }
  void _lost() { _ping?.cancel(); _set(false); if (!_run) return; _retry?.cancel(); _retry = Timer(Duration(seconds: _backoff), _connect); _backoff = (_backoff * 2).clamp(1, 30); }

  Future<void> _onMsg(dynamic raw) async {
    Json m; try { m = (jsonDecode(raw as String) as Map).cast<String, dynamic>(); } catch (_) { return; }
    switch (m['type']) {
      case 'ready': _backoff = 1; _set(true); setUnread((m['unread'] as num?)?.toInt() ?? 0); _topics.add('*'); if (showNative) await catchUp(api, announce: true); break;
      case 'data': _topics.add('${m['topic']}'); break;
      case 'notification':
        final n = AppNotification.fromJson(((m['n'] as Map).cast<String, dynamic>())..['read_at'] = null);
        setUnread(unread + 1); _notes.add(n); _topics.add('notifications');
        if (showNative) { await NativeNotifier.show(n.id, n.title, n.body); await Store.setLastNotif(n.id); }
        break;
      case 'error': if (m['code'] == 'AUTH') { _run = false; api.onExpired?.call(); } break;
    }
  }

  /// Shows notifications the device missed while it was offline. First run on a device only records the newest id (no flood of old items).
  static Future<void> catchUp(ApiClient api, {bool announce = true}) async {
    try {
      final last = await Store.lastNotif();
      if (last == null) { final r = await api.get('/notifications'); final ids = (r['items'] as List).map((e) => (e['id'] as num).toInt()); await Store.setLastNotif(ids.isEmpty ? 0 : ids.reduce((a, b) => a > b ? a : b)); return; }
      final r = await api.get('/notifications', {'after': last}); var max = last;
      for (final e in (r['items'] as List)) { final n = AppNotification.fromJson((e as Map).cast<String, dynamic>()); if (announce && !n.read) await NativeNotifier.show(n.id, n.title, n.body); if (n.id > max) max = n.id; }
      await Store.setLastNotif(max);
    } catch (_) {}
  }
}
