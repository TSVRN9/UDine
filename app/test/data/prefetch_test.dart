import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';

import 'fixtures.dart';

// The one path every place's menus come in by (Search opening, the dish sheet's "where it's served"): each place-day is asked of the
// network at most once, never more than `cap` requests are in flight, and with the network known to be down nothing is asked.
void main() {
  sqfliteFfiInit();
  late Database db;
  final calls = <Uri>[];
  var online = true, inFlight = 0, peak = 0;
  late Repository repo;

  /// tid 4 posts nothing (an empty menu is never "final", so only the session's memory can stop it being asked again).
  final client = MockClient((req) async {
    calls.add(req.url);
    peak = max(peak, ++inFlight);
    try {
      await Future<void>.delayed(const Duration(milliseconds: 15));
      if (!online) throw const SocketException('Network is unreachable');
      return http.Response(req.url.queryParameters['tid'] == '4' ? '{}' : ajaxBody(), 200);
    } finally {
      inFlight--;
    }
  });
  Repository make() => Repository(UmassSource(client), db, now: () => DateTime(2026, 10, 13, 12));
  final days = [for (var d = 13; d < 19; d++) '2026-10-$d'];
  final pairs = [for (final id in [1, 2, 3, 4, 5, 6]) for (final d in days) (id, d)];

  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    calls.clear();
    online = true;
    inFlight = peak = 0;
    repo = make();
  });
  tearDown(() => db.close());

  test('never more than the cap in flight, and every place-day comes back', () async {
    final got = await repo.prefetchMenus(pairs, cap: 4);
    expect(calls, hasLength(pairs.length));
    expect(peak, inInclusiveRange(2, 4));
    expect(got.length, pairs.length);
    expect(got[(1, '2026-10-13')], isNotEmpty);
    expect(got[(4, '2026-10-13')], isEmpty);
  });

  test('a second ask, from the same repository or after a restart, makes no request for a place-day already had (empty ones included)', () async {
    await repo.prefetchMenus(pairs);
    calls.clear();
    await repo.prefetchMenus(pairs);
    expect(calls, isEmpty, reason: 'the session remembers every answer');
    calls.clear();
    await make().prefetchMenus([for (final p in pairs) if (p.$1 != 4 && p.$2 == days.first) p]);
    expect(calls, isEmpty, reason: 'today, saved after its rollover, is final (a later day is asked again at each launch, as menu() always has)');
  });

  test('what a hall already fetched through menu() is not fetched again by the prefetch', () async {
    await repo.menu(4, '2026-10-13').drain<void>(); // an empty menu: not final on disk
    calls.clear();
    await repo.prefetchMenus([(4, '2026-10-13')]);
    expect(calls, isEmpty);
  });

  test('offline, once the network is known to be down: nothing is asked, and what is saved still answers', () async {
    await repo.prefetchMenus([(1, '2026-10-13'), (2, '2026-10-13')]);
    online = false;
    final later = make();
    await later.menu(1, '2026-10-20').drain<void>(); // the hall that opened found the network down
    calls.clear();
    final got = await later.prefetchMenus([(1, '2026-10-13'), (2, '2026-10-13'), (3, '2026-10-13'), (1, '2026-10-20')]);
    expect(calls, isEmpty);
    expect(got.keys.toSet(), {(1, '2026-10-13'), (2, '2026-10-13')});
  });

  test('a prefetch that is told to stop asks for nothing more', () async {
    var stop = false;
    final f = repo.prefetchMenus(pairs, cap: 2, stopped: () => stop);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    stop = true;
    await f;
    expect(calls.length, lessThan(pairs.length));
  });
}
