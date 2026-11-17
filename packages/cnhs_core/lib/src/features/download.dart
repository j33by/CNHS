import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/widgets.dart';
import '../api.dart';
import '../session.dart';
import '../widgets.dart';

/// Downloads a CSV from the server and lets the person choose where to save it.
Future<void> downloadCsv(BuildContext c, String path, String fileName, [Map<String, dynamic>? q]) async {
  final s = Scope.read(c);
  try {
    final text = await s.api.getText(path, q);
    final bytes = Uint8List.fromList(utf8.encode(text));
    final out = await FilePicker.platform.saveFile(dialogTitle: 'Save file', fileName: fileName, bytes: Platform.isAndroid ? bytes : null);
    if (out == null) return;
    if (!Platform.isAndroid) await File(out).writeAsBytes(bytes);
    if (c.mounted) toast(c, 'Saved $fileName');
  } on ApiException catch (e) { if (c.mounted) toast(c, e.message, err: true); }
}
