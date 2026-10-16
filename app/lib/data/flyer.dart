import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'source.dart';

/// Shares the flyer at [url] as an image file (the share hook the app scope carries; tests hand in their own).
typedef FlyerShare = Future<void> Function(String url);

const _mimes = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
};

/// Downloads the flyer, writes it to `<temp>/flyer/<its name>` (the folder cleared first, so one flyer is ever kept) and opens the system
/// share sheet with that FILE, never the address. Only an http(s) address with a host (ArgumentError otherwise); [Unreachable] / [BadStatus]
/// from the download. The extension decides the mime type; one the feed does not give (or one that is not an image) is a JPEG.
Future<void> shareFlyerFile(
  String url, {
  http.Client? client,
  Future<Directory> Function()? tempDir,
  Future<void> Function(XFile)? share,
}) async {
  final u = Uri.tryParse(url);
  if (u == null ||
      u.host.isEmpty ||
      (u.scheme != 'http' && u.scheme != 'https'))
    throw ArgumentError.value(url, 'url', 'not an http(s) address');
  final own = client == null, c = client ?? http.Client();
  try {
    final bytes = await sendBytes(c, const Duration(seconds: 20), 'GET', u);
    final last = u.pathSegments.isEmpty ? '' : u.pathSegments.last;
    final dot = last.lastIndexOf('.'),
        ext = dot < 0 ? '' : last.substring(dot + 1).toLowerCase();
    final mime = _mimes[ext] ?? 'image/jpeg';
    final stem = (dot < 0 ? last : last.substring(0, dot)).replaceAll(
      RegExp(r'[\\/:*?"<>|\x00-\x1f]'),
      '_',
    );
    final name =
        '${stem.isEmpty ? 'flyer' : stem}.${_mimes.containsKey(ext) ? ext : 'jpg'}';
    final dir = Directory(
      '${(await (tempDir ?? getTemporaryDirectory)()).path}/flyer',
    );
    if (dir.existsSync()) dir.deleteSync(recursive: true);
    dir.createSync(recursive: true);
    final f = File('${dir.path}/$name')..writeAsBytesSync(bytes);
    await (share ?? (x) => SharePlus.instance.share(ShareParams(files: [x])))(
      XFile(f.path, mimeType: mime),
    );
  } finally {
    if (own) c.close();
  }
}
