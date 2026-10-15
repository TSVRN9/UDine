import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:udine/data/pdf_cache.dart';
import 'package:udine/data/repository.dart';

const lunch = 'https://www.umassdining.com/sites/default/files/2026-10/Lunch.pdf';
const dinner = 'https://www.umassdining.com/sites/default/files/2026-10/Dinner.pdf';

/// A PDF made up for the test: the header is all the cache looks at. Never a UMass file.
List<int> pdf([String tag = 'a']) => utf8.encode('%PDF-1.4\n% synthetic $tag\n%%EOF\n');

String kinds<T>(List<DataState<T>> l) => l.map((s) => s.runtimeType.toString().split('<').first).join(',');

void main() {
  late Directory dir;
  late bool online;
  late int status;
  late List<int> body;
  late List<Uri> calls;
  late PdfCache cache;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('pdf_cache_test');
    online = true;
    status = 200;
    body = pdf();
    calls = [];
    cache = PdfCache(dir, MockClient((req) async {
      calls.add(req.url);
      if (!online) throw const SocketException('Network is unreachable');
      return http.Response.bytes(body, status);
    }));
  });
  tearDown(() => dir.deleteSync(recursive: true));

  test('miss: Loading, then the file, fetched once and kept on disk', () async {
    final got = await cache.open(lunch).toList();
    expect(kinds(got), 'Loading,Loaded');
    expect((got.last as Loaded<File>).value.readAsBytesSync(), pdf());
    expect(calls, [Uri.parse(lunch)]);
  });

  test('hit: the saved file at once, no request', () async {
    await cache.open(lunch).drain<void>();
    calls.clear();
    final got = await cache.open(lunch).toList();
    expect(kinds(got), 'Loaded');
    expect(calls, isEmpty);
  });

  test('one file per URL: a different URL is a miss', () async {
    await cache.open(lunch).drain<void>();
    expect(kinds(await cache.open(dinner).toList()), 'Loading,Loaded');
    expect(cache.file(lunch).path, isNot(cache.file(dinner).path));
  });

  test('offline with a saved file: it opens as online', () async {
    await cache.open(lunch).drain<void>();
    online = false;
    expect(kinds(await cache.open(lunch).toList()), 'Loaded');
  });

  test('offline without one: NotSaved, and nothing is left on disk', () async {
    online = false;
    expect(kinds(await cache.open(lunch).toList()), 'Loading,NotSaved');
    expect(cache.file(lunch).existsSync(), isFalse);
  });

  test('a failed fetch (500) is Failed and saves nothing; a retry can still succeed', () async {
    status = 500;
    expect(kinds(await cache.open(lunch).toList()), 'Loading,Failed');
    expect(cache.file(lunch).existsSync(), isFalse);
    status = 200;
    expect(kinds(await cache.open(lunch).toList()), 'Loading,Loaded');
  });

  test('a 200 that is not a PDF is Failed and saves nothing', () async {
    body = utf8.encode('<html>sign in</html>');
    expect(kinds(await cache.open(lunch).toList()), 'Loading,Failed');
    expect(cache.file(lunch).existsSync(), isFalse);
  });

  test('only umassdining.com is fetched', () async {
    expect(kinds(await cache.open('https://evil.example/x.pdf').toList()), 'Loading,Failed');
    expect(calls, isEmpty);
  });

  test('a slow fetch says StillLoading after the threshold', () async {
    final gate = Completer<void>();
    final slow = PdfCache(dir, MockClient((req) async {
      await gate.future;
      return http.Response.bytes(pdf(), 200);
    }), stillLoadingAfter: const Duration(milliseconds: 10));
    final f = slow.open(lunch).toList();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    gate.complete();
    expect(kinds(await f), 'Loading,StillLoading,Loaded');
  });

  test('prune keeps the listed URLs and drops the rest (a changed URL leaves nothing behind)', () async {
    await cache.open(lunch).drain<void>();
    await cache.open(dinner).drain<void>();
    await cache.prune({dinner});
    expect(cache.file(lunch).existsSync(), isFalse);
    expect(cache.file(dinner).existsSync(), isTrue);
  });
}
