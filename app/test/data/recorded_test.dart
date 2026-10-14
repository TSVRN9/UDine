import 'dart:io';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/types.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/m2/status.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/theme/m2_tokens.g.dart';

const _flows = '../docs/design/explorations/2026-10-ui-overhaul/flows';
Future<String> _read(String name) async => File('$_flows/$name').readAsStringSync();

String kinds<T>(List<DataState<T>> l) => l.map((s) => s.runtimeType.toString().split('<').first).join(',');

void main() {
  sqfliteFfiInit();
  late Database db;
  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
  });
  tearDown(() => db.close());

  Future<Repository> repo(String route, {Duration? slow}) async {
    final f = recordedFlags(route)!;
    return recordedRepository(f, db, read: _read, slow: slow);
  }

  group('flags', () {
    test('data=recorded with at and net', () {
      final f = recordedFlags('/hall/worcester?data=recorded&at=2026-10-08T12:41&net=slow')!;
      expect(f.at, DateTime(2026, 10, 8, 12, 41));
      expect(f.net, NetMode.slow);
    });
    test('defaults: net ok, clock unset', () {
      final f = recordedFlags('/?data=recorded')!;
      expect((f.at, f.net), (null, NetMode.ok));
    });
    test('no data flag, no switch', () => expect(recordedFlags('/hall/worcester?net=fail'), isNull));
  });

  group('release guard', () {
    test('the gate is const and tracks kReleaseMode', () {
      expect(recordedAvailable, !kReleaseMode);
    });
    test('an unavailable gate returns no flags even for a recorded route', () {
      expect(recordedFlags('/?data=recorded', available: false), isNull);
    });
    test('pubspec bundles the recorded assets for the internal flavor only', () {
      final y = File('pubspec.yaml').readAsStringSync();
      expect(RegExp(r'- path: assets/recorded/\n\s+flavors:\n\s+- internal\n').hasMatch(y), isTrue);
      expect(RegExp(r'^\s+- assets/recorded', multiLine: true).hasMatch(y), isFalse);
    });
  });

  group('same repository, recorded source', () {
    test('Worcester lunch Oct 8: benchmark dishes and the 404 cal plate', () async {
      final r = await repo('/?data=recorded&at=2026-10-08T12:41');
      final got = await r.menu(1, '2026-10-08').toList();
      expect(kinds(got), 'Loading,Loaded');
      final lunch = (got.last as Loaded<List<MenuItem>>).value.where((i) => i.mealPeriod.name == 'lunch').toList();
      final names = lunch.map((i) => i.dishName).toList();
      expect(names, containsAll(['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh']));
      var s = emptyPlates;
      for (final n in ['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh', 'Golden BBQ Chicken Thigh']) {
        s = addDish(s, 'lunch', n, {'W': lunch.firstWhere((i) => i.dishName == n)});
      }
      final t = totals(s.plates[0]);
      expect((t.cal, double.parse(t.p.toStringAsFixed(1))), (404, 38.9));
    });

    test('a café is served by its location id; hours carry busy', () async {
      final r = await repo('/?data=recorded&at=2026-10-08T12:41');
      final h = (await r.hours('2026-10-08').toList()).last as Loaded<HoursData>;
      expect(h.value.busy, isNotEmpty);
      expect(h.value.feed.retail, isNotEmpty);
      final e = (await r.events().toList()).last as Loaded<List<DiningEvent>>;
      expect(e.value, isNotEmpty);
    });

    test('the fixed clock drives open status', () async {
      final noon = await repo('/?data=recorded&at=2026-10-08T12:41');
      final early = await repo('/?data=recorded&at=2026-10-08T06:00');
      Future<String> status(Repository r) async {
        final h = (await r.hours(r.today).toList()).last as Loaded<HoursData>;
        return statusText(h.value.feed.halls.firstWhere((x) => x.hallTid == 1), r.now());
      }

      expect(await status(noon), 'Open until midnight');
      expect(await status(early), 'Opens 7 AM');
    });
  });

  group('net flags', () {
    test('ok: Loading, Loaded', () async {
      expect(kinds(await (await repo('/?data=recorded')).menu(1, '2026-10-08').toList()), 'Loading,Loaded');
    });
    test('slow: waits the net.slow token, StillLoading shows before Loaded', () async {
      expect(M2Motion.netSlow, 1600);
      final r = await repo('/?data=recorded&net=slow', slow: const Duration(milliseconds: 600));
      final sw = Stopwatch()..start();
      final got = await r.menu(1, '2026-10-08').toList();
      expect(kinds(got), 'Loading,StillLoading,Loaded');
      expect(sw.elapsedMilliseconds, greaterThanOrEqualTo(590));
    });
    test('default slow is M2 net.slow', () async {
      expect(defaultSlow, const Duration(milliseconds: 1600));
    });
    test('offline: today and tomorrow come from the cache, other days are not saved', () async {
      final r = await repo('/?data=recorded&net=offline&at=2026-10-08T12:41');
      expect(kinds(await r.menu(1, '2026-10-08').toList()), 'Loaded');
      expect(kinds(await r.menu(1, '2026-10-09').toList()), 'Loaded');
      expect(kinds(await r.menu(1, '2026-10-12').toList()), 'Loading,NotSaved');
    });
    test('fail: Failed', () async {
      final r = await repo('/?data=recorded&net=fail');
      expect(kinds(await r.menu(1, '2026-10-08').toList()), 'Loading,Failed');
    });
  });
}
