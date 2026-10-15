import 'dart:io';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Hands an export to the OS share sheet: file name to contents. The user starts it; nothing else sends the log anywhere.
typedef ShareFiles = Future<void> Function(Map<String, String> files);

/// Where the app's temporary files live (a test hands in its own).
typedef TempDir = Future<Directory> Function();

Future<Directory> _exportDir(TempDir tmp) async => Directory('${(await tmp()).path}/export');

/// Removes whatever an earlier export left: plaintext copies of the log and the ranking. Not done right after the share sheet returns, as the
/// app it handed the file to may still be reading it.
Future<void> clearExports({TempDir tmp = getTemporaryDirectory}) async {
  try {
    final d = await _exportDir(tmp);
    if (await d.exists()) await d.delete(recursive: true);
  } catch (e) {
    debugPrint('udine: could not clear the old exports: $e');
  }
}

Future<void> _send(List<XFile> files) => SharePlus.instance.share(ShareParams(files: files));

/// Writes the files to a fresh export directory (the old ones cleared first) and opens the share sheet on them.
Future<void> shareFiles(Map<String, String> files, {TempDir tmp = getTemporaryDirectory, Future<void> Function(List<XFile>) send = _send}) async {
  await clearExports(tmp: tmp);
  final dir = await (await _exportDir(tmp)).create(recursive: true);
  await send([
    for (final e in files.entries) XFile((await File('${dir.path}/${e.key}').writeAsString(e.value)).path, mimeType: e.key.endsWith('.json') ? 'application/json' : 'text/csv'),
  ]);
}
