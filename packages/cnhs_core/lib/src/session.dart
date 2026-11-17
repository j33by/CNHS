import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/widgets.dart';
import 'api.dart';
import 'background.dart';
import 'notifier.dart';
import 'realtime.dart';
import 'store.dart';

enum Role { admin, teacher, student }

/// Signed-in state for one app. Holds the API client, the realtime socket and the signed-in person's profile.
class Session extends ChangeNotifier {
  final Role role; final ApiClient api; late final RealtimeService rt;
  Json? me; Json? year; bool booting = true; String? notice; DateTime _touched = DateTime.now();
  Session(this.role, String server) : api = ApiClient(server) {
    rt = RealtimeService(api, showNative: !Platform.isAndroid);
    api.onExpired = () { if (me != null || api.token != null) _clear('Your session ended. Please sign in again.'); };
  }
  bool get signedIn => me != null;
  bool get mustChange => me?['mustChange'] == true;
  bool get desktopDevice => !Platform.isAndroid;
  String get name => '${me?['name'] ?? ''}';
  /// Android phones stay signed in (so push keeps working); Windows follows the portal's old rules: 20 minutes idle, 8 hours at most.
  String get device => Platform.isAndroid ? 'mobile' : 'desktop';

  Future<void> restore() async {
    try {
      api.baseUrl = await Store.server(); final t = await Store.token();
      if (t != null) { api.token = t; await refresh(); }
    } catch (_) { api.token = null; me = null; }
    booting = false; notifyListeners();
  }
  Future<void> refresh() async {
    final r = await api.get('/auth/me');
    final m = (r['me'] as Map).cast<String, dynamic>();
    if (m['type'] != role.name) { await Store.setToken(null); api.token = null; me = null; return; }
    me = m; year = (r['year'] as Map?)?.cast<String, dynamic>(); rt.setUnread((r['unread'] as num?)?.toInt() ?? 0);
    await _online(); notifyListeners();
  }
  Future<void> _online() async { await NativeNotifier.init(); await NativeNotifier.requestPermission(); rt.start(); await Background.start(); }

  Future<void> login(String id, String password, {String? server}) async {
    if (server != null && server.trim().isNotEmpty) { await Store.setServer(server); api.baseUrl = server.trim(); }
    final r = await api.post('/auth/login', {'role': role.name, 'id': id, 'password': password, 'device': device});
    api.token = r['token'] as String; await Store.setToken(api.token); notice = null;
    await Store.clearLastNotif(); // the first catch-up on this device then records the newest id instead of replaying old notifications
    await refresh();
  }
  Future<void> logout() async { try { await api.post('/auth/logout'); } catch (_) {} await _clear(null); }
  Future<void> _clear(String? msg) async {
    rt.stop(); await Background.stop(); await Store.setToken(null); api.token = null; me = null; notice = msg; notifyListeners();
  }
  /// Keeps the server-side idle timer fresh while someone is reading (desktop).
  void touch() { if (!signedIn || DateTime.now().difference(_touched).inMinutes < 4) return; _touched = DateTime.now(); api.get('/auth/me').catchError((_) => <String, dynamic>{}); }
  void passwordChanged() { me?['mustChange'] = false; notifyListeners(); }
}

/// Gives every widget access to the session: `Scope.of(context)`.
class Scope extends InheritedNotifier<Session> {
  const Scope({super.key, required Session session, required super.child}) : super(notifier: session);
  static Session of(BuildContext c) => c.dependOnInheritedWidgetOfExactType<Scope>()!.notifier!;
  static Session read(BuildContext c) => (c.getElementForInheritedWidgetOfExactType<Scope>()!.widget as Scope).notifier!;
}
