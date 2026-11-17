import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the server address (editable on the sign-in screen) and the sign-in token are kept. Used by the app AND by the Android background service.
const defaultServer = String.fromEnvironment('API_BASE', defaultValue: 'https://cnhs-portal.onrender.com');
const _sec = FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

class Store {
  static Future<String> server() async { final p = await SharedPreferences.getInstance(); await p.reload(); return p.getString('server') ?? defaultServer; }
  static Future<void> setServer(String v) async => (await SharedPreferences.getInstance()).setString('server', v.trim());
  static Future<String?> token() async { try { return await _sec.read(key: 'token'); } catch (_) { return null; } }
  static Future<void> setToken(String? t) async { try { t == null ? await _sec.delete(key: 'token') : await _sec.write(key: 'token', value: t); } catch (_) {} }
  static Future<int?> lastNotif() async { final p = await SharedPreferences.getInstance(); await p.reload(); return p.getInt('lastNotif'); }
  static Future<void> setLastNotif(int v) async => (await SharedPreferences.getInstance()).setInt('lastNotif', v);
  static Future<void> clearLastNotif() async => (await SharedPreferences.getInstance()).remove('lastNotif');
  static Future<String?> lastId() async => (await SharedPreferences.getInstance()).getString('lastId');
  static Future<void> setLastId(String v) async => (await SharedPreferences.getInstance()).setString('lastId', v);
}
