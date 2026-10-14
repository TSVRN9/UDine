import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/content.dart';
import 'package:udine/core/types.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';

import 'fixtures.dart';

/// Answers like UMass; [online] false = airplane mode. Records every request.
class Fake {
  bool online = true;
  int? status;
  Completer<void>? gate;
  final calls = <Uri>[];

  late final client = MockClient((req) async {
    calls.add(req.url);
    if (!online) throw const SocketException('Network is unreachable');
    await gate?.future;
    if (status != null) return http.Response('boom', status!);
    final body = switch (req.url.path) {
      '/foodpro-menu-ajax' => ajaxBody(),
      '/uapp/get_infov2' => jsonEncode(locations()),
      '/uapp/get_beacons_events' => eventsBody(),
      _ => throw StateError('unexpected ${req.url}'),
    };
    return http.Response.bytes(utf8.encode(body), 200);
  });
}

Future<List<DataState<T>>> run<T>(Stream<DataState<T>> s) => s.toList();

String kinds<T>(List<DataState<T>> l) => l.map((s) => s.runtimeType.toString().split('<').first).join(',');

void main() {
  sqfliteFfiInit();
  late Database db;
  late Fake net;
  var clock = DateTime(2026, 10, 13, 12);
  late Repository repo;

  Repository make({Duration slow = const Duration(milliseconds: 400)}) =>
      Repository(UmassSource(net.client), db, now: () => clock, stillLoadingAfter: slow);

  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    net = Fake();
    clock = DateTime(2026, 10, 13, 12);
    repo = make();
  });
  tearDown(() => db.close());

  group('menu', () {
    test('online: Loading then Loaded, foodpro URL for the place and day', () async {
      final got = await run(repo.menu(2, '2026-10-13'));
      expect(kinds(got), 'Loading,Loaded');
      final items = (got.last as Loaded<List<MenuItem>>).value;
      expect(items, hasLength(4)); // 2 dishes x breakfast + late night
      expect(items.first.hallTid, 2);
      expect(items.first.health, 3); // raw response is stored/parsed, so grade survives
      expect(net.calls.single.toString(), 'https://www.umassdining.com/foodpro-menu-ajax?tid=2&date=10%2F13%2F2026');
    });

    test('offline after one online launch: today and tomorrow of every hall from cache, zero network calls', () async {
      await repo.launch();
      net.calls.clear();
      net.online = false;
      for (final d in ['2026-10-13', '2026-10-14']) {
        for (final h in diningHalls) {
          final got = await run(repo.menu(h.tid, d));
          expect(kinds(got), 'Loaded', reason: '${h.slug} $d');
          expect((got.single as Loaded<List<MenuItem>>).value, hasLength(4));
        }
      }
      expect(net.calls, isEmpty);
    });

    test('a day that was never saved reports NotSaved offline', () async {
      await repo.launch();
      net.online = false;
      expect(kinds(await run(repo.menu(2, '2026-10-15'))), 'Loading,NotSaved');
    });

    test('stale copy while unreachable: Loaded (saved) then LoadedOffline', () async {
      await run(repo.menu(2, '2026-10-13'));
      clock = clock.add(const Duration(hours: 7));
      net.online = false;
      final got = await run(repo.menu(2, '2026-10-13'));
      expect(kinds(got), 'Loaded,LoadedOffline');
      expect((got.last as LoadedOffline<List<MenuItem>>).value, hasLength(4));
    });

    test('stale copy is refreshed behind the saved render', () async {
      await run(repo.menu(2, '2026-10-13'));
      clock = clock.add(const Duration(hours: 7));
      net.calls.clear();
      expect(kinds(await run(repo.menu(2, '2026-10-13'))), 'Loaded,Loaded');
      expect(net.calls, hasLength(1));
    });

    test('server error with nothing saved: Failed; retry succeeds', () async {
      net.status = 500;
      final bad = await run(repo.menu(2, '2026-10-13'));
      expect(kinds(bad), 'Loading,Failed');
      expect((bad.last as Failed).error, isA<BadStatus>());
      net.status = null;
      expect(kinds(await run(repo.menu(2, '2026-10-13'))), 'Loading,Loaded');
    });

    test('server error with a saved copy keeps the saved render', () async {
      await run(repo.menu(2, '2026-10-13'));
      clock = clock.add(const Duration(hours: 7));
      net.status = 503;
      expect(kinds(await run(repo.menu(2, '2026-10-13'))), 'Loaded');
    });

    test('slow response reports StillLoading, then the result', () async {
      repo = make(slow: const Duration(milliseconds: 20));
      net.gate = Completer();
      final f = run(repo.menu(2, '2026-10-13'));
      await Future<void>.delayed(const Duration(milliseconds: 80));
      net.gate!.complete();
      expect(kinds(await f), 'Loading,StillLoading,Loaded');
    });

    test('an empty response (past day: the feed returns []) is a Loaded empty menu', () async {
      final r = Repository(UmassSource(MockClient((_) async => http.Response('[]', 200))), db, now: () => clock);
      final got = await run(r.menu(2, '2026-10-01'));
      expect((got.last as Loaded<List<MenuItem>>).value, isEmpty);
    });
  });

  group('cafe menu', () {
    const withId = RetailLocationHours(name: 'Cafe', locationId: 2, lunchMenu: '<p>Chai Latte \$3.75</p>');
    test('no foodpro items falls back to the standing menu; items win otherwise', () async {
      final empty = Repository(UmassSource(MockClient((_) async => http.Response('[]', 200))), db, now: () => clock);
      final standing = (await run(empty.cafeMenu(withId, '2026-10-13'))).last as Loaded<CafeMenu>;
      expect(((standing.value as StandingCafeMenu).menu as RetailMenuItems).items.single.name, 'Chai Latte');
      final integrated = (await run(repo.cafeMenu(withId, '2026-10-14'))).last as Loaded<CafeMenu>;
      expect(integrated.value, isA<IntegratedCafeMenu>());
    });

    test('a café without a location id never asks foodpro', () async {
      const noId = RetailLocationHours(name: 'Truck', lunchMenu: '<p>Taco</p>');
      expect(kinds(await run(repo.cafeMenu(noId, '2026-10-13'))), 'Loaded');
      expect(net.calls, isEmpty);
    });
  });

  group('hours and busy', () {
    test('online: hours with the live triple; the saved entry has no busy fields', () async {
      final got = await run(repo.hours('2026-10-13'));
      expect(kinds(got), 'Loading,Loaded');
      final data = (got.last as Loaded<HoursData>).value;
      expect(data.feed.halls, hasLength(4));
      expect(data.busy!['Worcester Commons']!.count, 348);
      final raw = (await db.query('preferences_kv', where: "key = 'hours:v2:2026-10-13'")).single['value_json']! as String;
      for (final k in ['business_level', 'notbusy_level', 'moderate_level', '"busy"']) {
        expect(raw, isNot(contains(k)));
      }
    });

    test('offline: saved hours, busy absent (never stale)', () async {
      await run(repo.hours('2026-10-13'));
      net.online = false;
      final got = await run(repo.hours('2026-10-13'));
      expect(kinds(got), 'Loaded,LoadedOffline');
      for (final s in got) {
        final d = switch (s) {
          Loaded<HoursData>(:final value) => value,
          LoadedOffline<HoursData>(:final value) => value,
          _ => fail('unexpected $s'),
        };
        expect(d.feed.halls, hasLength(4));
        expect(d.busy, isNull);
      }
    });

    test('offline with no saved day: NotSaved', () async {
      net.online = false;
      expect(kinds(await run(repo.hours('2026-10-13'))), 'Loading,NotSaved');
    });
  });

  test('events: fetched, parsed, not saved', () async {
    final got = await run(repo.events());
    expect(kinds(got), 'Loading,Loaded');
    expect((got.last as Loaded<List<DiningEvent>>).value, isNotEmpty);
    expect(await db.query('preferences_kv'), isEmpty);
  });

  group('launch', () {
    test(
      'prefetches today and tomorrow for the four halls, plus hours; a second launch inside the window asks for nothing but hours',
      () async {
        await repo.launch();
        final menus = net.calls
            .where((u) => u.path == '/foodpro-menu-ajax')
            .map((u) => '${u.queryParameters['tid']}@${u.queryParameters['date']}')
            .toSet();
        expect(menus, {
          for (final t in [1, 2, 3, 4])
            for (final d in ['10/13/2026', '10/14/2026']) '$t@$d',
        });
        expect(net.calls.where((u) => u.path == '/uapp/get_infov2'), hasLength(1));
        net.calls.clear();
        await repo.launch();
        expect(net.calls.map((u) => u.path), ['/uapp/get_infov2']);
      },
    );

    test('offline launch never throws', () async {
      net.online = false;
      await repo.launch();
    });

    test('rollover: before 2am the effective today is still yesterday', () async {
      clock = DateTime(2026, 10, 14, 1);
      await repo.launch();
      expect(net.calls.where((u) => u.path == '/foodpro-menu-ajax').map((u) => u.queryParameters['date']).toSet(), {
        '10/13/2026',
        '10/14/2026',
      });
    });
  });

  group('cache bound', () {
    test('launch deletes entries older than yesterday; RN rows and newer entries stay', () async {
      Future<void> put(String k) => db.insert('preferences_kv', {'key': k, 'value_json': '{}'});
      for (final k in [
        'menu:v2:2|2026-10-11', // older than yesterday -> gone
        'hours:v2:2026-10-11', // gone
        'menu:v2:2|2026-10-12', // yesterday -> kept
        'hours:v2:2026-10-12',
        'menu:v2:2|2026-10-20', // future -> kept
        'menu_cache:2|2026-10-01', // RN's, never touched
        'hours_cache:v1',
        'something:else|2026-10-01',
      ]) {
        await put(k);
      }
      net.online = false; // keep launch's prefetch from adding rows
      await repo.launch();
      final keys = (await db.query('preferences_kv', columns: ['key'])).map((r) => r['key']).toSet();
      expect(keys, {
        'menu:v2:2|2026-10-12',
        'hours:v2:2026-10-12',
        'menu:v2:2|2026-10-20',
        'menu_cache:2|2026-10-01',
        'hours_cache:v1',
        'something:else|2026-10-01',
      });
    });
  });
}
