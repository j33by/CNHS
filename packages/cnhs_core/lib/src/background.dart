import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:ui' show DartPluginRegistrant;
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'api.dart';
import 'notifier.dart';
import 'realtime.dart';
import 'store.dart';

/// Push without Firebase (Android). A foreground service keeps one WebSocket open to our own backend and raises the
/// notification itself. It restarts after a reboot, and catches up on missed notifications every time it reconnects.
/// Android shows a small permanent "connected" notification while it runs; that is the price of not using Google's push.
class Background {
  static Future<void> configure() async {
    if (!Platform.isAndroid) return;
    await NativeNotifier.init();
    await FlutterBackgroundService().configure(
      androidConfiguration: AndroidConfiguration(
        onStart: _onStart, autoStart: true, autoStartOnBoot: true, isForegroundMode: true,
        notificationChannelId: 'cnhs_service', initialNotificationTitle: 'CNHS', initialNotificationContent: 'Connected for school updates',
        foregroundServiceNotificationId: 4242, foregroundServiceTypes: [AndroidForegroundType.dataSync],
      ),
      iosConfiguration: IosConfiguration(),
    );
  }
  static Future<void> start() async { if (!Platform.isAndroid) return; final s = FlutterBackgroundService(); if (!await s.isRunning()) await s.startService(); else s.invoke('reload'); }
  static Future<void> stop() async { if (!Platform.isAndroid) return; FlutterBackgroundService().invoke('stop'); }
}

@pragma('vm:entry-point')
Future<void> _onStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();
  await NativeNotifier.init();
  WebSocketChannel? ch; Timer? ping, retry; var backoff = 1; var alive = true;
  Future<ApiClient?> client() async { final t = await Store.token(); if (t == null) return null; return ApiClient(await Store.server())..token = t; }
  void close() { ping?.cancel(); try { ch?.sink.close(); } catch (_) {} ch = null; }
  Future<void> connect() async {
    if (!alive) return; close();
    final api = await client();
    if (api == null) { alive = false; service.stopSelf(); return; } // signed out: nothing to listen for
    void again() { if (!alive) return; retry?.cancel(); retry = Timer(Duration(seconds: backoff), connect); backoff = (backoff * 2).clamp(1, 60); }
    try {
      final c = WebSocketChannel.connect(api.wsUri); ch = c;
      c.sink.add(jsonEncode({'type': 'auth', 'token': api.token}));
      ping = Timer.periodic(const Duration(seconds: 25), (_) { try { c.sink.add('{"type":"ping"}'); } catch (_) {} });
      c.stream.listen((raw) async {
        Map m; try { m = jsonDecode(raw as String) as Map; } catch (_) { return; }
        if (m['type'] == 'ready') { backoff = 1; await RealtimeService.catchUp(api); }
        else if (m['type'] == 'notification') { final n = (m['n'] as Map); final id = (n['id'] as num).toInt(); await NativeNotifier.show(id, '${n['title']}', '${n['body'] ?? ''}'); await Store.setLastNotif(id); }
        else if (m['type'] == 'error' && m['code'] == 'AUTH') { alive = false; close(); service.stopSelf(); }
      }, onDone: again, onError: (_) => again(), cancelOnError: true);
    } catch (_) { again(); }
  }
  service.on('stop').listen((_) { alive = false; close(); service.stopSelf(); });
  service.on('reload').listen((_) { backoff = 1; connect(); });
  await connect();
}
