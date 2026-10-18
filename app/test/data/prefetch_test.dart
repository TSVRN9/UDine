@Timeout(Duration(seconds: 10))
library;

import 'dart:async';
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
// network at most once, the repository's pool keeps at most four requests in flight, and with the network known to be down (the pool's
// offline window) nothing is asked.
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
      await Future<void>.delayed(const Duration(milliseconds: 60));
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

  test('every place-day comes back, with never more than the repository pool\'s four in flight', () async {
    final got = await repo.prefetchMenus(pairs);
    expect(calls, hasLength(pairs.length));
    expect(peak, inInclusiveRange(2, Repository.maxInFlight));
    expect(got.length, pairs.length);
    expect(got[(1, '2026-10-13')], isNotEmpty);
    expect(got[(4, '2026-10-13')], isEmpty);
  });

  test('a prefetch parses on its own isolate (profile and release) and answers what the UI isolate would', () async {
    final here = await repo.prefetchMenus(pairs);
    await db.delete('preferences_kv');
    Repository.parseOffUi = true;
    addTearDown(() => Repository.parseOffUi = false);
    final off = await make().prefetchMenus(pairs);
    expect(off.keys.toSet(), here.keys.toSet());
    expect([for (final e in off.entries) e.value.length], [for (final e in off.entries) here[e.key]!.length]);
    expect([for (final d in off[(1, '2026-10-13')]!) d.dishName], [for (final d in here[(1, '2026-10-13')]!) d.dishName]);
  });

  test('a menu a hall page asks for (not a prefetch) parses off the UI isolate too when the flag is on', () async {
    Repository.parseOffUi = true;
    addTearDown(() => Repository.parseOffUi = false);
    final before = Repository.offUiParses;
    final fg = await make().menu(1, '2026-10-13').toList();
    expect((fg.last as Loaded).value, isNotEmpty);
    expect(Repository.offUiParses, greaterThan(before));
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

  test('a user\'s own fetch is not queued behind a prefetch of 40 place-days: it starts at once (the prefetch may hold two of the four slots), and four stay the most in flight', () async {
    final forty = [for (var id = 10; id < 18; id++) for (final d in days.take(5)) (id, d)];
    final prefetch = repo.prefetchMenus(forty);
    while (calls.length < 2) {
      await Future<void>.delayed(const Duration(milliseconds: 1)); // the prefetch has what it may of the slots
    }
    final mine = repo.menu(1, '2026-10-30').drain<void>();
    await Future.wait([prefetch, mine]);
    final order = [for (final u in calls) u.queryParameters['tid']];
    final at = order.indexOf('1');
    expect(at, inInclusiveRange(0, 2), reason: 'started as call #$at of ${order.length}: $order');
    expect(peak, lessThanOrEqualTo(Repository.maxInFlight));
    expect(order.length, forty.length + 1);
  }, timeout: const Timeout(Duration(seconds: 10)));

  test('a prefetch that is told to stop asks for nothing more', () async {
    var stop = false;
    final f = repo.prefetchMenus(pairs, stopped: () => stop);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    stop = true;
    await f;
    expect(calls.length, lessThan(pairs.length));
  });

  group('the pool\'s policy: foreground before background, background at most 2 of the 4 slots', () {
    // every request waits to be released by the test, so who started, and when, is exactly what the pool decided
    final started = <int>[], hold = <int, Completer<void>>{};
    late Repository pool;
    setUp(() {
      started.clear();
      hold.clear();
      final c = MockClient((req) async {
        final tid = int.parse(req.url.queryParameters['tid']!);
        started.add(tid);
        await (hold[tid] = Completer<void>()).future;
        return http.Response(ajaxBody(), 200);
      });
      pool = Repository(UmassSource(c), db, now: () => DateTime(2026, 10, 13, 12));
    });
    Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 40)); // (the cache lookup before each fetch)
    void ask(int tid, {bool background = false}) => unawaited(pool.menu(tid, '2026-10-30', background: background).drain<void>());
    Future<void> release(int tid) async {
      hold[tid]!.complete();
      await settle();
    }

    test('when a slot frees, a waiting foreground job goes before background jobs that queued earlier, even with a background slot free', () async {
      ask(101, background: true);
      ask(1);
      ask(2);
      ask(3);
      await settle();
      expect(started, [101, 1, 2, 3], reason: 'the pool is full, one background job in it');
      ask(102, background: true); // queued first
      ask(103, background: true);
      ask(4); // queued after them
      await settle();
      expect(started, [101, 1, 2, 3], reason: 'four in flight: the rest wait');
      await release(1);
      expect(started.last, 4, reason: 'foreground 4 before background 102, though a background slot is free: $started');
      await release(2);
      expect(started.last, 102, reason: 'no foreground waiting: the oldest background job: $started');
      await release(3);
      expect(started, [101, 1, 2, 3, 4, 102], reason: 'two background jobs running: 103 waits for one of them');
      await release(101);
      expect(started.last, 103);
      for (final t in [4, 102, 103]) {
        await release(t);
      }
    }, timeout: const Timeout(Duration(seconds: 5)));

    test('a freed slot is not handed to a background job when background already holds 2', () async {
      ask(101, background: true);
      ask(102, background: true);
      ask(1);
      ask(2);
      ask(103, background: true); // waits: the pool is full
      await settle();
      expect(started, [101, 102, 1, 2]);
      await release(1);
      expect(started, [101, 102, 1, 2], reason: 'a slot is free but two background jobs are running: 103 waits');
      await release(101);
      expect(started.last, 103);
      for (final t in [102, 2, 103]) {
        await release(t);
      }
    }, timeout: const Timeout(Duration(seconds: 5)));

    test('background jobs hold at most 2 slots: a third waits while foreground slots are free, until a background one finishes', () async {
      ask(101, background: true);
      ask(102, background: true);
      ask(103, background: true);
      await settle();
      expect(started, [101, 102], reason: 'two slots of four are free, and the third background job still waits');
      ask(1);
      await settle();
      expect(started, [101, 102, 1], reason: 'a foreground fetch starts at once');
      await release(101);
      expect(started, [101, 102, 1, 103], reason: 'it starts when a background slot frees');
      for (final t in [102, 1, 103]) {
        await release(t);
      }
    }, timeout: const Timeout(Duration(seconds: 5)));
  });
}
