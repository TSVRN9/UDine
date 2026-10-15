import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Hands an export to the OS share sheet: file name to contents. The user starts it; nothing else sends the log anywhere.
typedef ShareFiles = Future<void> Function(Map<String, String> files);

Future<void> shareFiles(Map<String, String> files) async {
  final dir = await Directory('${(await getTemporaryDirectory()).path}/export').create(recursive: true);
  final out = <XFile>[
    for (final e in files.entries) XFile((await File('${dir.path}/${e.key}').writeAsString(e.value)).path, mimeType: e.key.endsWith('.json') ? 'application/json' : 'text/csv'),
  ];
  await SharePlus.instance.share(ShareParams(files: out));
}
