import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message; final int status; final String? code;
  ApiException(this.message, {this.status = 0, this.code});
  bool get mustChange => code == 'MUST_CHANGE';
  bool get expired => code == 'SESSION_EXPIRED';
  @override String toString() => message;
}

typedef Json = Map<String, dynamic>;

/// Thin client for the Node backend. Every call returns the decoded JSON; failures throw [ApiException] with the server's own message.
class ApiClient {
  String baseUrl;
  String? token;
  void Function()? onExpired;
  ApiClient(this.baseUrl);

  Uri _u(String path, [Map<String, dynamic>? q]) {
    final qp = <String, String>{};
    q?.forEach((k, v) { if (v != null && '$v'.isNotEmpty) qp[k] = '$v'; });
    final b = Uri.parse(baseUrl.replaceAll(RegExp(r'/+$'), ''));
    return b.replace(path: '${b.path}/api/v1$path', queryParameters: qp.isEmpty ? null : qp);
  }
  Map<String, String> get _h => {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};

  Future<http.Response> _send(Future<http.Response> Function() f) async {
    try {
      return await f().timeout(const Duration(seconds: 45));
    } on TimeoutException {
      throw ApiException('The school server is taking too long to answer. Try again in a moment.');
    } catch (_) {
      throw ApiException('Cannot reach the school server. Check your internet connection.');
    }
  }
  Json _decode(http.Response r) {
    Json j;
    try { j = (jsonDecode(utf8.decode(r.bodyBytes)) as Map).cast<String, dynamic>(); } catch (_) { j = {}; }
    if (r.statusCode >= 400) {
      final e = ApiException(j['error']?.toString() ?? 'Something went wrong (${r.statusCode}).', status: r.statusCode, code: j['code']?.toString());
      if (e.expired) onExpired?.call();
      throw e;
    }
    return j;
  }
  Future<Json> get(String path, [Map<String, dynamic>? q]) async => _decode(await _send(() => http.get(_u(path, q), headers: _h)));
  Future<Json> post(String path, [Map<String, dynamic>? body]) async => _decode(await _send(() => http.post(_u(path), headers: _h, body: jsonEncode(body ?? {}))));
  Future<Json> put(String path, [Map<String, dynamic>? body]) async => _decode(await _send(() => http.put(_u(path), headers: _h, body: jsonEncode(body ?? {}))));
  /// CSV and other text downloads.
  Future<String> getText(String path, [Map<String, dynamic>? q]) async {
    final r = await _send(() => http.get(_u(path, q), headers: _h));
    if (r.statusCode >= 400) _decode(r);
    return utf8.decode(r.bodyBytes);
  }
  Future<Json> upload(String path, List<int> bytes, String filename) async {
    final req = http.MultipartRequest('POST', _u(path))..headers.addAll({if (token != null) 'Authorization': 'Bearer $token'})..files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
    try {
      final s = await req.send().timeout(const Duration(seconds: 90));
      return _decode(await http.Response.fromStream(s));
    } on ApiException { rethrow; } catch (_) { throw ApiException('The picture could not be uploaded. Check your connection.'); }
  }
  /// ws(s) address of the realtime socket.
  Uri get wsUri { final b = Uri.parse(baseUrl.replaceAll(RegExp(r'/+$'), '')); return b.replace(scheme: b.scheme == 'https' ? 'wss' : 'ws', path: '${b.path}/ws'); }
}
