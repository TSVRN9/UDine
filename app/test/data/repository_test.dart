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
  Duration delay = Duration.zero;
  int inFlight = 0, maxInFlight = 0;

  late final client = MockClient((req) async {
    calls.add(req.url);
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    try {
      await Future<void>.delayed(delay);
      if (!online) throw const SocketException('Network is unreachable');
      await gate?.future;
    } finally {
      inFlight--;
    }
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

    test('offline after one online launch: every hall renders today and tomorrow from cache; a final copy asks for nothing', () async {
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
      // today was fetched on its own day (final): no request. Tomorrow's prefetch isn't final: tried, failed quietly.
      expect(net.calls.where((u) => u.queryParameters['date'] == '10/13/2026'), isEmpty);
    });

    test('a day that was never saved reports NotSaved offline', () async {
      await repo.launch();
      net.online = false;
      expect(kinds(await run(repo.menu(2, '2026-10-15'))), 'Loading,NotSaved');
    });

    test('stale copy while unreachable: Loaded (saved) then LoadedOffline', () async {
      await run(repo.menu(2, '2026-10-14'));
      clock = clock.add(const Duration(hours: 7));
      net.online = false;
      final got = await run(repo.menu(2, '2026-10-14'));
      expect(kinds(got), 'Loaded,LoadedOffline');
      expect((got.last as LoadedOffline<List<MenuItem>>).value, hasLength(4));
    });

    test('stale copy is refreshed behind the saved render', () async {
      await run(repo.menu(2, '2026-10-14'));
      clock = clock.add(const Duration(hours: 7));
      net.calls.clear();
      expect(kinds(await run(repo.menu(2, '2026-10-14'))), 'Loaded,Loaded');
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
      await run(repo.menu(2, '2026-10-14'));
      clock = clock.add(const Duration(hours: 7));
      net.status = 503;
      expect(kinds(await run(repo.menu(2, '2026-10-14'))), 'Loaded');
    });

    test('unreachable within 6h of the save stays quietly Loaded', () async {
      await run(repo.menu(2, '2026-10-14'));
      net.online = false;
      expect(kinds(await run(repo.menu(2, '2026-10-14'))), 'Loaded');
    });

    test('a final copy (fetched on its own day, non-empty) is served with no request', () async {
      await run(repo.menu(2, '2026-10-13'));
      net.calls.clear();
      expect(kinds(await run(repo.menu(2, '2026-10-13'))), 'Loaded');
      expect(net.calls, isEmpty);
    });

    test('before the 2 AM rollover a copy is not yet final for that date', () async {
      clock = DateTime(2026, 10, 14, 1); // still 10-13; a fetch of 10-14 now predates its day
      await run(repo.menu(2, '2026-10-14'));
      clock = DateTime(2026, 10, 14, 1, 30);
      net.calls.clear();
      expect(kinds(await run(repo.menu(2, '2026-10-14'))), 'Loaded,Loaded');
    });

    test('a copy prefetched the day before refreshes behind the saved render on the day', () async {
      await run(repo.menu(2, '2026-10-14')); // fetched 10-13 12:00
      clock = DateTime(2026, 10, 14, 8);
      net.calls.clear();
      expect(kinds(await run(repo.menu(2, '2026-10-14'))), 'Loaded,Loaded');
      expect(net.calls, hasLength(1));
      net.calls.clear(); // that refresh was fetched on the day: now final
      expect(kinds(await run(repo.menu(2, '2026-10-14'))), 'Loaded');
      expect(net.calls, isEmpty);
    });

    Future<void> seed(String key, Map<String, dynamic> raw, DateTime at) => db.insert('preferences_kv', {
      'key': key,
      'value_json': jsonEncode({'fetchedAt': at.toUtc().toIso8601String(), 'raw': raw}),
    });

    test('an empty saved menu is never rendered or final: Loading, then refreshed', () async {
      await seed('menu:v2:2|2026-10-13', {}, clock);
      final got = await run(repo.menu(2, '2026-10-13'));
      expect(kinds(got), 'Loading,Loaded');
      expect((got.last as Loaded<List<MenuItem>>).value, hasLength(4));
    });

    test('an empty saved menu with the network down is NotSaved', () async {
      await seed('menu:v2:2|2026-10-13', {}, clock);
      net.online = false;
      expect(kinds(await run(repo.menu(2, '2026-10-13'))), 'Loading,NotSaved');
    });

    test('an empty answer never overwrites a non-empty saved copy, and is not emitted over its render', () async {
      await run(repo.menu(2, '2026-10-14'));
      final before = await db.query('preferences_kv', where: "key = 'menu:v2:2|2026-10-14'");
      clock = DateTime(2026, 10, 14, 8);
      final glitchy = Repository(UmassSource(MockClient((_) async => http.Response('[]', 200))), db, now: () => clock);
      final got = await run(glitchy.menu(2, '2026-10-14'));
      expect(kinds(got), 'Loaded');
      expect((got.single as Loaded<List<MenuItem>>).value, hasLength(4));
      expect(await db.query('preferences_kv', where: "key = 'menu:v2:2|2026-10-14'"), before);
    });

    test('a corrupt row is treated as unsaved', () async {
      await db.insert('preferences_kv', {'key': 'menu:v2:2|2026-10-13', 'value_json': 'not json'});
      expect(kinds(await run(repo.menu(2, '2026-10-13'))), 'Loading,Loaded');
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

  test('events: fetched, parsed, saved for the day; offline the saved copy answers, then LoadedOffline', () async {
    final got = await run(repo.events());
    expect(kinds(got), 'Loading,Loaded');
    expect((got.last as Loaded<List<DiningEvent>>).value, isNotEmpty);
    expect((await db.query('preferences_kv')).map((r) => r['key']), ['events:v2:2026-10-13']);
    net.online = false;
    final off = await run(repo.events());
    expect(kinds(off), 'Loaded,LoadedOffline');
    expect((off.last as LoadedOffline<List<DiningEvent>>).value, isNotEmpty);
  });

  test('events: a copy from another day is not offered offline', () async {
    await run(repo.events());
    clock = clock.add(const Duration(days: 1));
    net.online = false;
    expect(kinds(await run(repo.events())), 'Loading,NotSaved');
  });

  test('prune drops saved events older than yesterday with the menus and hours', () async {
    for (final d in ['2026-10-10', '2026-10-12']) {
      await db.insert('preferences_kv', {'key': 'events:v2:$d', 'value_json': '{}'});
    }
    await repo.prune('2026-10-13');
    expect((await db.query('preferences_kv')).map((r) => r['key']), ['events:v2:2026-10-12']);
  });

  group('launch', () {
    test('warms the day\'s events too, so they open offline', () async {
      await repo.launch();
      expect((await db.query('preferences_kv', where: "key LIKE 'events:v2:%'")).length, 1);
    });

    test(
      'prefetches today and tomorrow for the four halls, plus hours; a second launch asks again only for the non-final tomorrow and hours',
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
        expect(net.calls.where((u) => u.path == '/foodpro-menu-ajax').map((u) => u.queryParameters['date']).toSet(), {'10/14/2026'});
        expect(net.calls.where((u) => u.path == '/uapp/get_infov2'), hasLength(1));
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

  group('the network pool', () {
    final days = [for (var i = 0; i < 15; i++) '2026-10-${(13 + i).toString().padLeft(2, '0')}'];
    Future<void> loadAll() => Future.wait([for (final d in days) repo.menu(2, d).drain<void>()]);

    test('15 days asked for at once never have more than 4 requests in flight, and all 15 are answered', () async {
      net.delay = const Duration(milliseconds: 20);
      final got = await Future.wait([for (final d in days) run(repo.menu(2, d))]);
      expect(net.maxInFlight, lessThanOrEqualTo(4));
      expect(net.calls, hasLength(15));
      expect([for (final g in got) kinds(g)], everyElement('Loading,Loaded'));
    });

    test('once a fetch has failed Unreachable, the others resolve from the phone without asking the network', () async {
      net.online = false;
      await run(repo.menu(2, days[0]));
      expect(net.calls, hasLength(1));
      await loadAll();
      expect(net.calls, hasLength(1)); // an offline schedule open adds no request
      expect(kinds(await run(repo.menu(2, days[5]))), 'Loading,NotSaved');
    });

    test('a saved copy still renders offline inside the window', () async {
      await run(repo.menu(2, days[1]));
      clock = clock.add(const Duration(hours: 7));
      net.online = false;
      await run(repo.menu(2, days[0]));
      expect(kinds(await run(repo.menu(2, days[1]))), 'Loaded,LoadedOffline');
    });

    test('after the window the network is tried again, and a success ends the offline stretch', () async {
      net.online = false;
      await run(repo.menu(2, days[0]));
      net.online = true;
      await run(repo.menu(2, days[1]));
      expect(net.calls, hasLength(1)); // still inside the window
      clock = clock.add(Repository.offlineWindow + const Duration(seconds: 1));
      expect(kinds(await run(repo.menu(2, days[1]))), 'Loading,Loaded');
      expect(net.calls, hasLength(2));
      net.online = false;
      await run(repo.menu(2, days[2])); // fails again: window restarts
      net.online = true;
      await run(repo.menu(2, days[3]));
      expect(net.calls, hasLength(3));
    });

    test('a skipped fetch does not extend the window', () async {
      net.online = false;
      await run(repo.menu(2, days[0]));
      clock = clock.add(const Duration(seconds: 20));
      await run(repo.menu(2, days[1])); // skipped
      clock = clock.add(const Duration(seconds: 11)); // 31 s after the failure
      net.online = true;
      expect(kinds(await run(repo.menu(2, days[2]))), 'Loading,Loaded');
    });

    test('an explicit retry asks again at once', () async {
      net.online = false;
      await run(repo.menu(2, days[0]));
      net.online = true;
      repo.retryNetwork();
      expect(kinds(await run(repo.menu(2, days[0]))), 'Loading,Loaded');
      expect(net.calls, hasLength(2));
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
