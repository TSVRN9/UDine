// The event pictures kept on the phone: PdfCache's file-per-URL design with an image body check, and the launch warm over the events feed.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/data/pdf_cache.dart';
import 'package:udine/data/recorded/flags.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';

import 'fixtures.dart';

const a = 'https://cdn.example.org/events/a.jpg';
const b = 'https://www.umassdining.com/sites/default/files/b.png';

/// Synthetic bodies: the magic bytes are all the cache looks at. Never a UMass picture.
List<int> jpeg() => [0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];
List<int> png() => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 1];
List<int> gif() => ascii.encode('GIF89a..');
List<int> webp() => [...ascii.encode('RIFF'), 0, 0, 0, 0, ...ascii.encode('WEBPVP8 ')];

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late List<Uri> calls;
  late List<int> body;
  late PdfCache cache;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('image_cache_test');
    calls = [];
    body = jpeg();
    cache = PdfCache.images(dir, MockClient((req) async {
      calls.add(req.url);
      return http.Response.bytes(body, 200);
    }));
  });
  tearDown(() => dir.deleteSync(recursive: true));

  test('a miss is fetched once and kept; a hit makes no request', () async {
    await cache.open(a).drain<void>();
    expect(cache.file(a).readAsBytesSync(), jpeg());
    expect(cache.file(a).path, endsWith('.img'));
    calls.clear();
    expect((await cache.open(a).toList()).single, isA<Loaded<File>>());
    expect(calls, isEmpty);
  });

  test('JPEG, PNG, GIF and WebP are accepted, on any http(s) host', () async {
    for (final (i, x) in [jpeg(), png(), gif(), webp()].indexed) {
      body = x;
      await cache.fetch('$a?$i');
      expect(cache.file('$a?$i').existsSync(), isTrue, reason: 'image $i');
    }
    await cache.fetch(b);
  });

  test('a non-image body, an over-cap body and a non-http(s) URL are refused and nothing is written', () async {
    body = utf8.encode('<html>nope</html>');
    await expectLater(cache.fetch(a), throwsFormatException);
    body = [...jpeg(), ...List.filled(5 * 1024 * 1024, 0)];
    await expectLater(cache.fetch(a), throwsFormatException);
    body = jpeg();
    for (final bad in ['ftp://x.example.org/a.jpg', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url']) {
      await expectLater(cache.fetch(bad), throwsArgumentError);
    }
    expect(calls, hasLength(2)); // only the two bodies were asked for
    expect(dir.existsSync() ? dir.listSync() : [], isEmpty);
  });

  test('recorded evimg=pending is read from the route', () {
    expect(recordedFlags('/search?data=recorded&evimg=pending')!.evimgPending, isTrue);
    expect(recordedFlags('/search?data=recorded')!.evimgPending, isFalse);
  });

  group('launch', () {
    late Database db;
    late List<Uri> pics;
    late Repository repo;
    var urls = <String>[a, b];

    setUp(() async {
      urls = [a, b];
      pics = [];
      db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
      await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
      final client = MockClient((req) async {
        if (req.url.path.endsWith('.jpg') || req.url.path.endsWith('.png')) {
          pics.add(req.url);
          return http.Response.bytes(jpeg(), 200);
        }
        return http.Response.bytes(utf8.encode(switch (req.url.path) {
          '/uapp/get_infov2' => jsonEncode(locations()),
          '/foodpro-menu-ajax' => ajaxBody(),
          '/uapp/get_beacons_events' => jsonEncode({'events': [for (final u in urls) {'title': u, 'featured_image': u, 'pdf_link': '', 'external_link': '', 'expiration_date': 1791777600, 'is_featured': '0'}]}),
          _ => throw StateError('unexpected ${req.url}'),
        }), 200);
      });
      repo = Repository(UmassSource(client), db, now: () => DateTime(2026, 10, 13, 12), images: PdfCache.images(dir, client));
    });
    tearDown(() => db.close());

    test('saves every listed picture, then drops the ones the feed stops listing', () async {
      await repo.launch();
      expect(repo.images!.file(a).existsSync() && repo.images!.file(b).existsSync(), isTrue);
      urls = [b];
      pics.clear();
      await repo.launch();
      expect(repo.images!.file(a).existsSync(), isFalse);
      expect(repo.images!.file(b).existsSync(), isTrue);
      expect(pics, isEmpty); // b was saved already
    });

    test('no image cache (Photos off), no picture request', () async {
      final off = Repository(repo.source, db, now: () => DateTime(2026, 10, 13, 12));
      await off.launch();
      expect(pics, isEmpty);
    });
  });
}
