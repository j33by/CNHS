import 'dart:io' show Platform;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:local_notifier/local_notifier.dart';

/// Shows a system notification. Windows: toast (local_notifier). Android: flutter_local_notifications.
/// No Firebase anywhere: on Android the notification is raised by our own foreground service (see background.dart).
class NativeNotifier {
  static final _fln = FlutterLocalNotificationsPlugin();
  static bool _ready = false;
  static const channelId = 'cnhs_updates';

  static Future<void> init({String appName = 'CNHS'}) async {
    if (_ready) return;
    if (Platform.isAndroid) {
      await _fln.initialize(const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')));
      final a = _fln.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await a?.createNotificationChannel(const AndroidNotificationChannel(channelId, 'School updates', description: 'Grades, announcements, attendance and notices', importance: Importance.high));
      await a?.createNotificationChannel(const AndroidNotificationChannel('cnhs_service', 'Connection', description: 'Keeps the app connected for live updates', importance: Importance.low));
    } else if (Platform.isWindows) {
      await localNotifier.setup(appName: appName, shortcutPolicy: ShortcutPolicy.requireCreate);
    }
    _ready = true;
  }
  static Future<bool> requestPermission() async {
    if (!Platform.isAndroid) return true;
    return await _fln.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission() ?? true;
  }
  static Future<void> show(int id, String title, String body) async {
    await init();
    if (Platform.isAndroid) {
      await _fln.show(id, title, body, const NotificationDetails(android: AndroidNotificationDetails(channelId, 'School updates', importance: Importance.high, priority: Priority.high, icon: '@mipmap/ic_launcher')));
    } else if (Platform.isWindows) {
      await LocalNotification(title: title, body: body).show();
    }
  }
}
