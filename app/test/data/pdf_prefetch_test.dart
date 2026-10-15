import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/data/pdf_cache.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';

import 'fixtures.dart';

const commonwealth = 'The Commonwealth Restaurant';

void main() {
  sqfliteFfiInit();
  late Database db;
  late Directory dir;
  late bool online;
  String? broken;
  late List<Uri> pdfCalls;
  late Repository repo;

  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    dir = Directory.systemTemp.createTempSync('pdf_prefetch_test');
    online = true;
    pdfCalls = [];
    final client = MockClient((req) async {
      if (!online) throw const SocketException('Network is unreachable');
      if (req.url.path.endsWith('.pdf')) {
        pdfCalls.add(req.url);
        if (broken != null && req.url.path.contains(broken!)) return http.Response('boom', 500);
        return http.Response.bytes(utf8.encode('%PDF-1.4\n%synthetic\n'), 200);
      }
      return http.Response.bytes(utf8.encode(switch (req.url.path) {
        '/uapp/get_infov2' => jsonEncode(locations()),
        '/foodpro-menu-ajax' => ajaxBody(),
        _ => throw StateError('unexpected ${req.url}'),
      }), 200);
    });
    repo = Repository(UmassSource(client), db, now: () => DateTime(2026, 10, 13, 12), pdfs: PdfCache(dir, client));
  });
  tearDown(() async {
    await db.close();
    dir.deleteSync(recursive: true);
  });

  test('launch fetches every PDF of a pinned café, and nothing else', () async {
    await repo.launch(pins: [commonwealth, 'Wasabi']);
    expect(pdfCalls, hasLength(4));
    expect(pdfCalls.map((u) => u.host).toSet(), {'www.umassdining.com'});
  });

  test('no pins, no PDF traffic', () async {
    await repo.launch();
    expect(pdfCalls, isEmpty);
  });

  test('a pinned café offline opens its PDFs: they were saved at launch', () async {
    await repo.launch(pins: [commonwealth]);
    online = false;
    final cafe = (await repo.hours('2026-10-13').toList()).whereType<Loaded<HoursData>>().last.value.feed.retail.firstWhere((r) => r.name == commonwealth);
    expect(cafe.breakfastMenu, contains('.pdf'));
    for (final u in pdfCalls) {
      expect(await repo.pdfs!.open(u.toString()).toList(), [isA<Loaded<File>>()]);
    }
  });

  test('a PDF that fails to fetch does not stop the others or launch', () async {
    broken = 'LITE';
    await repo.launch(pins: [commonwealth]);
    expect(pdfCalls, hasLength(4));
    expect(repo.pdfs!.file(pdfCalls[1].toString()).existsSync(), isFalse);
    expect(repo.pdfs!.file(pdfCalls[2].toString()).existsSync(), isTrue);
  });

  test('launch prunes saved PDFs the feed no longer lists', () async {
    const gone = 'https://www.umassdining.com/sites/default/files/old.pdf';
    await repo.pdfs!.open(gone).drain<void>();
    await repo.launch(pins: [commonwealth]);
    expect(repo.pdfs!.file(gone).existsSync(), isFalse);
  });
}
