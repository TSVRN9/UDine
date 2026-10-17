// Write to Health Connect / Apple Health (flutter-port-health Task 2): the switch, the OS answers, and the writes that follow the log.
// Real store and LogBook over a throwaway file; the health store is the simulated OS (SimulatedHealth).
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/health/health_client.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/log_book.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';
import 'package:udine/data/recorded/simulated_health.dart';
import 'package:udine/shell/health_book.dart';

NutritionFacts facts(num cal) => NutritionFacts(
      servingSize: '1 cup', calories: cal, caloriesFromFat: 54, totalFatG: 6, satFatG: 1.5, transFatG: 0.5, cholesterolMg: 10, sodiumMg: 340,
      totalCarbG: 30, dietaryFiberG: 3, sugarsG: 4, proteinG: 9.5,
    );

LogEntry entry(String id, String at, {num cal = 200, num servings = 1}) =>
    LogEntry(id: id, loggedAt: at, source: const UmassMenuSource(dishName: 'Pizza', hallTid: 1), servings: servings, nutrition: facts(cal));

const lunchAt = '2026-10-08T12:41:00.000', dinnerAt = '2026-10-08T18:05:00.000';
final clock = DateTime(2026, 10, 8, 20);

class Rig {
  Rig(this.store, this.log, this.sim, this.book);
  final UdineStore store;
  final LogBook log;
  final SimulatedHealth sim;
  final HealthBook book;

  /// Waits for the log's writes, then the Health writes they caused.
  Future<void> settle() async {
    await Future<void>.delayed(const Duration(milliseconds: 20));
    await book.idle;
  }

  Future<void> logMeal(List<LogEntry> es) async {
    await store.addEntries(es);
    await log.reload();
    await settle();
  }

  num kcal(String at) => sim.records['udine-$at']!.fields['energyKcal']!;
}

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late UdineStore store;
  late LogBook log;
  var tracking = true;
  setUp(() async {
    tracking = true;
    dir = Directory.systemTemp.createTempSync('udine_healthbook');
    store = UdineStore((await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi) as StoreReady).db);
    log = LogBook(store, now: () => clock);
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<Rig> open({SimulatedHealth? sim, bool enabled = false, DateTime? now}) async {
    sim ??= SimulatedHealth(status: enabled ? HealthAccess.granted : HealthAccess.denied);
    if (enabled) await store.setHealthOn(true);
    await log.reload();
    final book = await HealthBook.open(client: sim, store: store, log: log, titleOf: (m) => 'Lunch at Worcester', tracking: () => tracking, now: () => now ?? clock);
    addTearDown(book.dispose);
    return Rig(store, log, sim, book);
  }

  group('writes', () {
    test('Log writes one record with the mapped fields, named for the meal', () async {
      final r = await open(enabled: true);
      await r.logMeal([entry('a', lunchAt), entry('b', lunchAt, cal: 100, servings: 2)]);
      expect(r.sim.records.keys, ['udine-$lunchAt']);
      final m = r.sim.records.values.single;
      expect((m.name, m.fields['energyKcal'], m.fields['proteinG']), ('Lunch at Worcester', 400, 28.5));
      expect((await store.healthWrites()).single.recordIds, ['udine-$lunchAt']);
    });

    test('an edit rewrites the record, a delete deletes it, Undo writes it back', () async {
      final r = await open(enabled: true);
      await r.logMeal([entry('a', lunchAt)]);
      await log.setServings(log.meals.single.items.single, 2);
      await r.settle();
      expect(r.sim.records.length, 1);
      expect(r.kcal(lunchAt), 400);

      final undo = await log.deleteMeal(log.meals.single);
      await r.settle();
      expect(r.sim.records, isEmpty);
      expect(await store.healthWrites(), isEmpty);

      await undo();
      await r.settle();
      expect(r.kcal(lunchAt), 400);
    });

    test('taking one item off rewrites the meal; its Undo rewrites it again', () async {
      final r = await open(enabled: true);
      await r.logMeal([entry('a', lunchAt), entry('b', lunchAt, cal: 100)]);
      expect(r.kcal(lunchAt), 300);
      final undo = await log.remove(log.meals.single.items.last);
      await r.settle();
      expect(r.kcal(lunchAt), 200);
      await undo();
      await r.settle();
      expect(r.kcal(lunchAt), 300);
    });

    test('no backfill: what was logged before the switch went on is never written, only what follows', () async {
      await store.addEntries([entry('old', '2026-10-07T12:00:00.000')]);
      final r = await open();
      await r.book.tap();
      await r.settle();
      expect(r.sim.records, isEmpty);
      await r.logMeal([entry('a', lunchAt)]);
      expect(r.sim.records.keys, ['udine-$lunchAt']);
    });

    test('a meal logged before the book opened is not written when the log is read again', () async {
      await store.addEntries([entry('old', '2026-10-07T12:00:00.000')]);
      final r = await open(enabled: true);
      await log.reload();
      await r.settle();
      expect(r.sim.records, isEmpty);
    });

    test('turning the row off stops new writes and leaves the records already there', () async {
      final r = await open(enabled: true);
      await r.logMeal([entry('a', lunchAt)]);
      await r.book.tap();
      expect(r.book.state, HealthRowState.off);
      expect(await store.healthOn(), isFalse);
      await r.logMeal([entry('b', dinnerAt)]);
      expect(r.sim.records.keys, ['udine-$lunchAt']);
      await log.deleteMeal(log.meals.firstWhere((m) => m.loggedAt == lunchAt));
      await r.settle();
      expect(r.sim.records.keys, ['udine-$lunchAt']); // left alone
    });

    test('tracking off writes nothing', () async {
      final r = await open(enabled: true);
      tracking = false;
      await r.logMeal([entry('a', lunchAt)]);
      expect(r.sim.records, isEmpty);
    });

    test('a meal that starts ahead of the device clock is skipped, not sent', () async {
      final r = await open(enabled: true, now: DateTime(2026, 10, 8, 12, 40));
      await r.logMeal([entry('a', lunchAt)]);
      expect(r.sim.records, isEmpty);
      expect(await store.healthWrites(), isEmpty);
    });

    test('a meal logged at this very minute is written', () async {
      final r = await open(enabled: true, now: DateTime(2026, 10, 8, 12, 41));
      await r.logMeal([entry('a', lunchAt)]);
      expect(r.sim.records.length, 1);
    });

    test('a refusal from Health writes nothing and the next change writes again', () async {
      final r = await open(enabled: true);
      r.sim.failWrites = true;
      await r.logMeal([entry('a', lunchAt)]);
      expect(await store.healthWrites(), isEmpty);
      r.sim.failWrites = false;
      await log.setServings(log.meals.single.items.single, 2);
      await r.settle();
      expect(r.kcal(lunchAt), 400);
    });

    test('revoked in system settings: found on refresh, and nothing is written until it is allowed again', () async {
      final r = await open(enabled: true);
      r.sim.status = HealthAccess.denied;
      await r.book.refresh();
      expect(r.book.state, HealthRowState.revoked);
      await r.logMeal([entry('a', lunchAt)]);
      expect(r.sim.records, isEmpty);
      await r.book.tap(); // the OS sheet allows it
      expect(r.book.state, HealthRowState.allowed);
      await r.logMeal([entry('b', dinnerAt)]);
      expect(r.sim.records.keys, ['udine-$dinnerAt']);
    });
  });

  group('the switch', () {
    test('off: the row is there, unchecked, and asks nothing until tapped', () async {
      final r = await open();
      expect(r.book.state, HealthRowState.off);
      expect(r.book.name, 'Health Connect');
    });

    test('allowed: a tap raises the OS sheet at once and the switch is kept', () async {
      final r = await open();
      await r.book.tap();
      expect(r.book.state, HealthRowState.allowed);
      expect(await store.healthOn(), isTrue);
    });

    test('denied: the check stays empty, the switch is not kept, and the next tap asks again', () async {
      final r = await open(sim: SimulatedHealth(allows: false));
      await r.book.tap();
      expect(r.book.state, HealthRowState.denied);
      expect(await store.healthOn(), isFalse);
      r.sim.allows = true;
      await r.book.tap();
      expect(r.book.state, HealthRowState.allowed);
    });

    test('denied, then allowed in system settings: found on refresh, the row is ready to switch on', () async {
      final r = await open(sim: SimulatedHealth(allows: false));
      await r.book.tap();
      r.sim.status = HealthAccess.granted;
      await r.book.refresh();
      expect(r.book.state, HealthRowState.off);
    });

    test('on and no longer allowed is revoked, not denied', () async {
      final r = await open(sim: SimulatedHealth(), enabled: true);
      r.sim.status = HealthAccess.denied;
      await r.book.refresh();
      expect(r.book.state, HealthRowState.revoked);
      expect(await store.healthOn(), isTrue); // (nothing is lost on our side)
    });

    test('not installed or unsupported: there is nothing to ask, so the row is hidden', () async {
      for (final s in [HealthAccess.notInstalled, HealthAccess.unsupported]) {
        expect((await open(sim: SimulatedHealth(status: s))).book.state, HealthRowState.hidden);
      }
    });

    test('a channel that is not there (a host without Health) hides the row instead of throwing', () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      final book = await HealthBook.open(client: ChannelHealthClient(channel: const MethodChannel('udine/none')), store: store, log: log, titleOf: (_) => '', tracking: () => true);
      addTearDown(book.dispose);
      expect(book.state, HealthRowState.hidden);
    });

    test('iOS names Apple Health and opens Settings', () async {
      final b = (await open(sim: SimulatedHealth(platform: 'ios'))).book;
      expect((b.name, b.settingsLabel), ('Apple Health', 'Open Settings'));
      expect((await open()).book.settingsLabel, 'Open Health Connect');
    });
  });
}
