import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../core/content.dart' show isUmassDiningHost;
import 'source.dart';
import 'states.dart';

/// Runs a network job. The repository's `_pooled` when one is wired in (shared slots and offline window), else the job itself.
typedef Pool = Future<T> Function<T>(Future<T> Function() job);

/// Café menu PDFs (or, as [PdfCache.images], event pictures) kept on the phone: one file per URL under [dir] (the app support directory's `pdf/`). A saved file is the answer, with no
/// request: a changed URL is simply another file, and [prune] drops the ones the feed no longer lists.
class PdfCache {
  PdfCache(this.dir, this.client, {this.timeout = const Duration(seconds: 15), Duration? stillLoadingAfter, this.ext = 'pdf', this.allow = isUmassDiningHost, this.valid = _isPdf})
      : stillLoadingAfter = stillLoadingAfter ?? stillLoadingDelay;

  /// Event pictures: any http(s) host (the feed names its own), JPEG / PNG / GIF / WebP bodies up to 5 MB, under [dir] (the app support directory's `events/`).
  PdfCache.images(Directory dir, http.Client client, {Duration? stillLoadingAfter}) : this(dir, client, stillLoadingAfter: stillLoadingAfter, ext: 'img', allow: _isWebUrl, valid: _isImage);

  /// The file extension, the URL check (before any request) and the body check (before any write).
  final String ext;
  final bool Function(String url) allow;
  final bool Function(List<int> bytes) valid;
  final Directory dir;
  final http.Client client;
  final Duration timeout, stillLoadingAfter;

  Pool pool = <T>(job) => job();

  /// FNV-1a over the URL's UTF-16 units: stable across runs (String.hashCode is not) and short enough for any file system.
  String _name(String url) {
    var h = 0xcbf29ce484222325;
    for (final c in url.codeUnits) {
      h = (h ^ c) * 0x100000001b3;
    }
    return '${h.toUnsigned(64).toRadixString(16).padLeft(16, '0')}.$ext';
  }

  /// Fetches in flight by URL: a second ask (the launch prefetch and a tap on the same menu) joins the first, and [prune] knows whose `.part` is live.
  final _fetching = <String, Future<File>>{};

  File file(String url) => File('${dir.path}/${_name(url)}');

  /// Saved: Loaded at once. Otherwise Loading, then Loaded / NotSaved (no route to UMass) / Failed (bad answer, not a PDF, not UMass's).
  Stream<DataState<File>> open(String url) async* {
    final f = file(url);
    if (f.existsSync()) {
      yield Loaded(f);
      return;
    }
    yield Loading();
    final slow = Completer<void>();
    final timer = Timer(stillLoadingAfter, slow.complete);
    final fetched = fetch(url).then<DataState<File>>(Loaded.new, onError: (Object e) => e is Unreachable ? NotSaved<File>() : Failed<File>(e));
    // StillLoading is only said while the fetch is still out
    final first = await Future.any([fetched, slow.future.then<DataState<File>?>((_) => null)]);
    if (first == null) yield StillLoading();
    final done = first ?? await fetched;
    timer.cancel();
    yield done;
  }

  /// Fetches [url] into its file (throws [Unreachable], [BadStatus], [ArgumentError] or [FormatException]). A body [valid] refuses (no %PDF header, not an image):
  /// the viewer would render whatever the server sent. Written to a temp name first, so a half-written file is never a hit.
  Future<File> fetch(String url) {
    final f = _fetching[url] ??= _fetch(url).whenComplete(() {
      _fetching.remove(url); // (a block: whenComplete awaits a returned Future, and remove returns this very one)
    });
    return f;
  }

  Future<File> _fetch(String url) async {
    if (!allow(url)) throw ArgumentError.value(url, 'url', 'not an allowed link');
    final bytes = await pool(() => sendBytes(client, timeout, 'GET', Uri.parse(url)));
    if (!valid(bytes)) throw FormatException('not the expected file type', url);
    dir.createSync(recursive: true);
    final f = file(url), tmp = File('${f.path}.part');
    await tmp.writeAsBytes(bytes, flush: true);
    return tmp.rename(f.path);
  }

  /// Deletes every saved file whose URL is not in [keep], and any leftover half-written one unless a fetch in flight owns it.
  Future<void> prune(Set<String> keep) async {
    if (!dir.existsSync()) return;
    final names = {for (final u in keep) _name(u), for (final u in _fetching.keys) '${_name(u)}.part'};
    for (final e in dir.listSync()) {
      if (e is File && !names.contains(e.uri.pathSegments.last)) await e.delete();
    }
  }
}

bool _isPdf(List<int> b) => b.length >= 5 && String.fromCharCodes(b.take(5)) == '%PDF-';

bool _isWebUrl(String url) {
  final u = Uri.tryParse(url);
  return u != null && (u.scheme == 'http' || u.scheme == 'https') && u.host.isNotEmpty;
}

const _imageCap = 5 * 1024 * 1024;

/// JPEG, PNG, GIF or WebP by its first bytes, no larger than [_imageCap].
bool _isImage(List<int> b) {
  if (b.length < 4 || b.length >= _imageCap) return false;
  bool at(int i, String s) => String.fromCharCodes(b.skip(i).take(s.length)) == s;
  return (b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) || (b[0] == 0x89 && at(1, 'PNG')) || at(0, 'GIF8') || (at(0, 'RIFF') && at(8, 'WEBP'));
}
