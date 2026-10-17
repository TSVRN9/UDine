// Log and Undo over the device store (flutter-port-dish-and-plate Task 2): the rows RN would also read, Undo removing exactly
// those and putting the plate back, and the three ways it can go wrong (a double tap, an Undo after the receipt has gone, a write
// that fails).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/bowl.dart' show buildOf;
import 'package:udine/core/m2/bowl_builder.dart';
import 'package:udine/core/m2/log.dart';
import 'package:udine/core/date.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';
import 'package:udine/shell/plate_model.dart';
import 'package:udine/theme/tokens.dart';
import '../core/m2/support.dart';

Map<String, MenuItem> refs(String meal, String name, List<String> places) => {for (final p in places) p: servingOn(board, today, p, meal, dishKey(name))!};

const brisket = 'Beef Brisket Noodle Bowl', bbq = 'Golden BBQ Chicken Thigh';

/// M2's benchmark: brisket x1 and the BBQ thigh x2, a Worcester lunch plate.
void benchmark(PlateModel m) {
  m.add('lunch', brisket, refs('lunch', brisket, ['W', 'B']));
  m.add('lunch', bbq, refs('lunch', bbq, ['W']));
  m.add('lunch', bbq, refs('lunch', bbq, ['W']));
}

PlateModel modelOf(UdineStore s, DateTime clock) => PlateModel(write: s.addEntries, readDay: s.entriesForDay, now: () => clock);

Future<List<Map<String, Object?>>> raw(UdineStore s) => s.db.rawQuery('SELECT rowid AS _rowid, * FROM log_entries ORDER BY rowid');

void main() {
  sqfliteFfiInit();
  late UdineStore store;
  late PlateModel m;
  late DateTime clock;
  setUp(() async {
    databaseFactory = databaseFactoryFfi;
    store = UdineStore(((await openStore(inMemoryDatabasePath)) as StoreReady).db);
    clock = board.clock;
    m = modelOf(store, clock);
    // a row that was already in the log: Log and Undo must never touch it
    await store.addEntry(LogEntry(id: 'old', loggedAt: '2026-10-07T12:00:00.000', source: const OffSource(barcode: '1', productName: 'Bar'), servings: 1, nutrition: dishes.first.nutrition));
  });
  tearDown(() async => store.db.close());

  group('the rows Log writes (RN toLogEntries)', () {
    test('one row per item, one loggedAt for the plate, servings = qty, the chosen place\'s serving', () async {
      benchmark(m);
      final plate = m.state.plates.single;
      final rows = logEntries(plate, place: 'W', loggedAt: '2026-10-08T12:41:00.000', salt: () => 'x');
      expect(rows.map((e) => e.toJson()).toList(), [
        for (var i = 0; i < 2; i++)
          {
            'id': '2026-10-08T12:41:00.000-$i-x',
            'loggedAt': '2026-10-08T12:41:00.000',
            'source': {'type': 'umass-menu', 'dishName': plate.items[i].name, 'hallTid': 1},
            'servings': i == 0 ? 1 : 2,
            'nutrition': plate.items[i].refs['W']!.nutrition.toJson(),
          }
      ]);
    });

    test('Log at Berkshire writes Berkshire\'s serving: hallTid 4 and its calories', () {
      m.add('lunch', brisket, refs('lunch', brisket, ['W', 'B']));
      final e = logEntries(m.state.plates.single, place: 'B', loggedAt: '2026-10-08T12:41:00.000').single;
      expect((e.source as UmassMenuSource).hallTid, 4);
      expect(e.nutrition.calories, 220);
      expect(logEntries(m.state.plates.single, place: 'W', loggedAt: 'x').single.nutrition.calories, 218);
    });

    test('a custom item is a custom-source row with its macros and no other nutrient', () {
      final s = addDish(emptyPlates, 'lunch', 'My chili', {}, const Macro(310, 20, 30, 10));
      final e = logEntries(s.plates.single, place: null, loggedAt: 'x').single;
      expect(e.source.toJson(), {'type': 'custom', 'customFoodId': customKey('My chili', const Macro(310, 20, 30, 10)).substring('custom:'.length), 'productName': 'My chili'});
      expect((e.source as CustomSource).customFoodId, startsWith('my chili:'));
      expect([e.nutrition.calories, e.nutrition.proteinG, e.nutrition.totalCarbG, e.nutrition.totalFatG], [310, 20, 30, 10]);
    });
  });

  group('Log', () {
    test('the benchmark plate lands in the store as 404 cal / 38.9 g and the receipt says what the day holds', () async {
      benchmark(m);
      expect(totals(m.state.plates.single).cal, 404);
      expect(await m.log(), isTrue);
      final all = await store.allEntries();
      final mine = all.where((e) => e.id != 'old').toList();
      expect(mine, hasLength(2));
      expect(mine.fold<num>(0, (a, e) => a + e.nutrition.calories * e.servings), 404);
      expect(double.parse(mine.fold<num>(0, (a, e) => a + e.nutrition.proteinG * e.servings).toStringAsFixed(1)), 38.9);
      expect(mine.map((e) => e.loggedAt).toSet(), {nowLocalIso(clock)});
      expect(m.state.plates, isEmpty);
      expect(m.receipt!.dayCal, 404); // (the old row is another day)
      expect(m.receipt!.ids, mine.map((e) => e.id));
    });

    test('Log at a place the plate allows writes that place; the plate leaves, the next plate comes to the front', () async {
      m.add('lunch', brisket, refs('lunch', brisket, ['W', 'B']));
      m.add('dinner', bbq, refs('lunch', bbq, ['W']));
      expect(m.state.plates, hasLength(2));
      m.setFront(0);
      expect(await m.log(place: 'B'), isTrue);
      expect((await store.allEntries()).where((e) => e.id != 'old').map((e) => (e.source as UmassMenuSource).hallTid), [4]);
      expect(m.state.plates, hasLength(1));
      expect(m.state.front, 0);
    });

    test('a double tap writes the plate once', () async {
      benchmark(m);
      final a = m.log(), b = m.log();
      expect(await a, isTrue);
      expect(await b, isFalse);
      expect((await store.allEntries()).where((e) => e.id != 'old'), hasLength(2));
      expect(await m.log(), isFalse, reason: 'the plate is gone: nothing to log');
      expect((await store.allEntries()).where((e) => e.id != 'old'), hasLength(2));
    });

    test('a failed write leaves the plate, writes nothing, shows no receipt, and a retry works', () async {
      benchmark(m);
      final before = m.state;
      await store.db.close();
      expect(await m.log(), isFalse);
      expect(identical(m.state, before), isTrue);
      expect(m.receipt, isNull);
      expect(m.failed, isTrue);
      // the same model against a working store: the guard was released
      final ok = UdineStore(((await openStore(inMemoryDatabasePath)) as StoreReady).db);
      final m2 = modelOf(ok, clock);
      benchmark(m2);
      expect(await m2.log(), isTrue);
    });

    test('a write that dies half-way leaves no rows', () async {
      benchmark(m);
      await store.db.execute('CREATE TRIGGER boom BEFORE INSERT ON log_entries WHEN new.servings = 2 BEGIN SELECT RAISE(ABORT, \'no\'); END');
      expect(await m.log(), isFalse);
      expect((await store.allEntries()).map((e) => e.id), ['old']);
      expect(m.state.plates, hasLength(1));
    });

    test('a day total that cannot be read writes nothing and keeps the plate (the rows never commit without a receipt)', () async {
      final bad = PlateModel(write: store.addEntries, readDay: (_) => throw StateError('no day'), now: () => clock);
      benchmark(bad);
      expect(await bad.log(), isFalse);
      expect((await store.allEntries()).map((e) => e.id), ['old']);
      expect(bad.state.plates, hasLength(1));
      expect(bad.receipt, isNull);
    });

    test('no store: nothing is logged', () async {
      final none = PlateModel(now: () => clock);
      benchmark(none);
      expect(await none.log(), isFalse);
      expect(none.state.plates, hasLength(1));
    });
  });

  group('a bowl', () {
    test('Log writes one row with its parts in source_json and the summed nutrition; Undo takes exactly it out; a plain dish beside it has no parts', () async {
      final ss = board.days[today]!['W']!['lunch']!, si = ss.indexWhere((x) => x.name == 'Noodle Bowl'), di = ss[si].dishes.indexWhere((x) => x.dishName == brisket);
      final spec = BowlSpec.build(buildOf(board, today, 'W', 'lunch', si, di)!, place: 'W', meal: 'lunch');
      final bowl = bowlNow(spec, {spec.parts.indexWhere((x) => x.dishName == 'Hard Boiled Egg'): 2});
      m.addBowl('lunch', spec, bowl);
      m.add('lunch', bbq, refs('lunch', bbq, ['W']));
      expect(await m.log(), isTrue);
      final mine = (await store.allEntries()).where((e) => e.id != 'old').toList(), row = mine.firstWhere((e) => (e.source as UmassMenuSource).dishName == brisket);
      final src = (row.source as UmassMenuSource).toJson();
      expect((src['parts'] as List).single, containsPair('name', 'Hard Boiled Egg'));
      expect((src['parts'] as List).single, containsPair('servings', 2));
      expect(row.nutrition.calories, bowl.item.nutrition.calories);
      expect(((await raw(store)).firstWhere((r) => (r['source_json'] as String).contains('"parts"'))['source_json'] as String), contains('"Hard Boiled Egg"'));
      expect((mine.firstWhere((e) => (e.source as UmassMenuSource).dishName == bbq).source as UmassMenuSource).parts, isNull);
      expect(await m.undo(), isTrue);
      expect((await store.allEntries()).map((e) => e.id), ['old']);
      expect(m.state.plates.single.items.first.bowl, isNotNull); // the plate is back with its bowl
    });
  });

  group('Undo', () {
    test('removes exactly the rows Log wrote and puts the same plate back where it was', () async {
      m.add('lunch', brisket, refs('lunch', brisket, ['W', 'B']));
      m.add('dinner', bbq, refs('lunch', bbq, ['W']));
      m.setFront(0);
      final plate = m.state.plates[0], other = m.state.plates[1];
      final preRows = await raw(store);
      await m.log(place: 'W');
      expect((await store.allEntries()), hasLength(2));
      expect(await m.undo(), isTrue);
      expect(await raw(store), preRows);
      expect(m.state.plates, hasLength(2));
      expect(identical(m.state.plates[0], plate), isTrue);
      expect(identical(m.state.plates[1], other), isTrue);
      expect(m.state.front, 0);
      expect(m.state.nextId, isNot(lessThan(3)));
      expect(m.receipt, isNull);
    });

    test('a second Undo does nothing', () async {
      benchmark(m);
      await m.log();
      expect(await m.undo(), isTrue);
      expect(await m.undo(), isFalse);
      expect(m.state.plates, hasLength(1));
    });

    test('a double tap on Undo restores one plate', () async {
      benchmark(m);
      await m.log();
      final a = m.undo(), b = m.undo();
      expect(await a, isTrue);
      expect(await b, isFalse);
      expect(m.state.plates, hasLength(1));
    });

    test('after the receipt timeout Undo is a no-op', () async {
      benchmark(m);
      await m.log();
      expect(m.receipt, isNotNull);
      await Future<void>.delayed(const Duration(milliseconds: M2Motion.receiptD + 100));
      expect(m.receipt, isNull);
      expect(await m.undo(), isFalse);
      expect((await store.allEntries()).where((e) => e.id != 'old'), hasLength(2));
      expect(m.state.plates, isEmpty);
    }, timeout: const Timeout(Duration(seconds: 15)));

    test('adding a dish while the receipt shows ends the receipt (M2 addDish): Undo can no longer meet a plate that could join', () async {
      benchmark(m);
      await m.log();
      m.add('lunch', brisket, refs('lunch', brisket, ['W', 'B']));
      expect(m.receipt, isNull);
      expect(await m.undo(), isFalse);
      expect(m.state.plates, hasLength(1));
    });

    test('a failed delete keeps the rows, the receipt and the empty plate list', () async {
      benchmark(m);
      await m.log();
      await store.db.execute('CREATE TRIGGER boom BEFORE DELETE ON log_entries BEGIN SELECT RAISE(ABORT, \'no\'); END');
      expect(await m.undo(), isFalse);
      expect(m.receipt, isNotNull);
      expect(m.state.plates, isEmpty);
      expect((await store.allEntries()).where((e) => e.id != 'old'), hasLength(2));
      expect(m.failed, isTrue);
    });

    test('Log writes the RN column shapes: source and nutrition as JSON text, servings a number, logged_at the local stamp', () async {
      benchmark(m);
      await m.log();
      final written = [for (final r in await raw(store)) if (r['id'] != 'old') r];
      expect(written, hasLength(2));
      final plate = m.receipt!.plate;
      for (var i = 0; i < 2; i++) {
        final r = written[i], it = plate.items[i];
        expect(r['logged_at'], nowLocalIso(clock));
        expect(r['servings'], it.qty);
        expect(jsonDecode(r['source_json']! as String), {'type': 'umass-menu', 'dishName': it.name, 'hallTid': 1});
        expect(jsonDecode(r['nutrition_json']! as String), it.refs['W']!.nutrition.toJson());
        expect((r['id']! as String), matches(RegExp('^${RegExp.escape(nowLocalIso(clock))}-$i-[0-9a-z]+\$')));
      }
      await m.undo();
      expect((await raw(store)).map((r) => r['id']), ['old']);
    });
  });
}
