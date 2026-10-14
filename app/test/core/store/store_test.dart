import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/export.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';

const nut = '{"servingSize":"1 cup","calories":210,"caloriesFromFat":54,"totalFatG":6,"satFatG":1.5,"transFatG":0,"cholesterolMg":10,"sodiumMg":340,"totalCarbG":30,"dietaryFiberG":3,"sugarsG":4,"proteinG":9.5,"sodiumDv":14}';
// All four RN LogEntry sources, as RN's JSON.stringify writes them.
const sources = [
  '{"type":"umass-menu","dishName":"Café \\"Crème\\"","hallTid":2}',
  '{"type":"off","barcode":"0123456789012","productName":"Oat Bar"}',
  '{"type":"usda","fdcId":"171705","productName":"Banana"}',
  '{"type":"custom","customFoodId":"cf1","productName":"Mom\'s chili"}',
];
// Meal A (plate with 2 items) at 12:00; B at 12:30 AM on the 2nd (belongs to the 1st); C on the 2nd at 9 AM.
const stamps = ['2026-10-01T12:00:00.000', '2026-10-01T12:00:00.000', '2026-10-02T00:30:00.000', '2026-10-02T09:00:00.000'];

Future<List<Map<String, Object?>>> rows(Database db, String t) => db.rawQuery('SELECT rowid AS _rowid, * FROM $t ORDER BY rowid');
Future<Map<String, Object?>> dump(Database db) async =>
    {for (final t in ['log_entries', 'favorites', 'custom_foods', 'preferences_kv']) t: await rows(db, t)};

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late Database db;
  late UdineStore s;
  setUp(() async {
    dir = Directory.systemTemp.createTempSync('udine_store_api');
    final r = await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi);
    db = (r as StoreReady).db;
    s = UdineStore(db);
    for (var i = 0; i < 4; i++) {
      await db.insert('log_entries', {'id': 'e$i', 'logged_at': stamps[i], 'source_json': sources[i], 'servings': i + 0.5, 'nutrition_json': nut});
    }
    await db.insert('favorites', {'key': 'dish:Pizza', 'favorite_json': '{"type":"dish","dishName":"Pizza"}'});
    await db.insert('favorites', {'key': 'location:3', 'favorite_json': '{"type":"location","hallTid":3}'});
    await db.insert('custom_foods', {'id': 'cf1', 'food_json': '{"id":"cf1","name":"Mom\'s chili","servingSize":"1 bowl","nutrition":$nut}'});
  });
  tearDown(() async {
    await db.close();
    dir.deleteSync(recursive: true);
  });

  Future<void> roundTrips(Future<Undo> Function() op) async {
    final before = await dump(db);
    final undo = await op();
    expect(await dump(db), isNot(before), reason: 'op changed something');
    await undo();
    expect(await dump(db), before);
  }

  group('each operation + Undo restores byte-identical rows (rowid included)', () {
    test('add', () => roundTrips(() => s.addEntry(LogEntry.fromJson({'id': 'n', 'loggedAt': stamps[0], 'source': jsonDecode(sources[1]), 'servings': 2, 'nutrition': jsonDecode(nut)}))));
    test('add replacing an existing id', () => roundTrips(() => s.addEntry(LogEntry.fromJson({'id': 'e1', 'loggedAt': stamps[3], 'source': jsonDecode(sources[2]), 'servings': 3, 'nutrition': jsonDecode(nut)}))));
    test('change servings', () => roundTrips(() => s.changeServings('e2', 1)));
    test('delete one (middle row keeps its rowid)', () => roundTrips(() => s.deleteEntry('e1')));
    test('delete a meal', () async => roundTrips(() async => s.deleteMeal((await s.mealsForDay('2026-10-01')).first)));
    test('favorite add / remove', () async {
      await roundTrips(() => s.addFavorite(const DishFavorite('Soup')));
      await roundTrips(() => s.removeFavorite(const DishFavorite('Pizza')));
    });
    test('custom food add / remove', () async {
      await roundTrips(() => s.removeCustomFood('cf1'));
      await roundTrips(() => s.addCustomFood(CustomFood.fromJson({'id': 'cf2', 'name': 'X', 'servingSize': '1', 'nutrition': jsonDecode(nut)})));
    });
    test('changeServings leaves source_json and nutrition_json bytes alone', () async {
      await s.changeServings('e0', 2);
      final r = (await rows(db, 'log_entries')).first;
      expect([r['source_json'], r['nutrition_json'], r['servings']], [sources[0], nut, 2.0]);
    });
    test('servings must be positive', () => expect(() => s.changeServings('e0', 0), throwsArgumentError));
  });

  test('RN-written rows (all four sources) read back and re-write unchanged', () async {
    final before = await dump(db);
    for (final e in await s.allEntries()) {
      await s.addEntry(e);
    }
    for (final f in await s.favorites()) {
      await s.addFavorite(f);
    }
    for (final c in await s.customFoods()) {
      await s.addCustomFood(c);
    }
    // INSERT OR REPLACE re-numbers rowids (RN does too); compare the bytes, not the rowid.
    Map<String, Object?> strip(Map<String, Object?> d) => {for (final e in d.entries) e.key: [for (final r in e.value! as List) {...(r as Map<String, Object?>)}..remove('_rowid')]};
    expect(strip(await dump(db)), strip(before));
    expect((await s.allEntries()).map((e) => e.source.runtimeType.toString()), ['UmassMenuSource', 'OffSource', 'UsdaSource', 'CustomSource']);
  });

  test('ranked lists keep RN order and bytes', () async {
    const dishes = '[{"dishName":"B","hallTid":1,"rating":1520.5,"comparisonCount":3},{"dishName":"A","hallTid":2,"rating":1500,"comparisonCount":1}]';
    const foods = '[{"dishName":"Z","rating":1490,"comparisonCount":2}]';
    await db.insert('preferences_kv', {'key': 'ranked_dishes', 'value_json': dishes});
    await db.insert('preferences_kv', {'key': 'ranked_foods', 'value_json': foods});
    await s.saveRankedDishes(await s.rankedDishes());
    await s.saveRankedFoods(await s.rankedFoods());
    String kv(List<Map<String, Object?>> r, String k) => r.firstWhere((x) => x['key'] == k)['value_json']! as String;
    final r = await rows(db, 'preferences_kv');
    expect([kv(r, 'ranked_dishes'), kv(r, 'ranked_foods')], [dishes, foods]);
    expect(await UdineStore(db).rankedDishes().then((l) => l.map((d) => d.dishName)), ['B', 'A']);
  });

  group('preferences', () {
    const rn = '{"allergensToAvoid":["peanuts"],"requiredDietTags":["vegetarian"],"macroPresets":["high-protein","under-500-cal"],"futureField":{"x":[1,2]}}';
    setUp(() => db.insert('preferences_kv', {'key': 'food_preferences', 'value_json': rn}));
    Future<String> raw() async => (await db.rawQuery("SELECT value_json FROM preferences_kv WHERE key='food_preferences'")).single['value_json']! as String;

    test('RN allergens read as Avoid, diet tags as Only show', () async {
      expect(await s.avoid(), ['peanuts']);
      expect(await s.onlyShow(), ['vegetarian']);
    });
    test('writing Avoid / Only show keeps macroPresets, unknown fields and key order', () async {
      await s.setAvoid(['peanuts', 'soy']);
      await s.setOnlyShow(['halal']);
      expect(await raw(), '{"allergensToAvoid":["peanuts","soy"],"requiredDietTags":["halal"],"macroPresets":["high-protein","under-500-cal"],"futureField":{"x":[1,2]}}');
    });
    test('absent row: written with only the two mapped fields', () async {
      await db.delete('preferences_kv', where: "key='food_preferences'");
      await s.setAvoid(['milk']);
      expect(await raw(), '{"allergensToAvoid":["milk"],"requiredDietTags":[]}');
    });
    test('M2 keys default, round-trip, and sit beside RN keys', () async {
      expect([await s.tracking(), await s.charlesRiver(), await s.firstRunSeen(), await s.scores()], [true, false, false, (healthfulness: false, carbon: false)]);
      await s.setTracking(false);
      await s.setCharlesRiver(true);
      await s.setFirstRunSeen(true);
      await s.setScores(healthfulness: true, carbon: false);
      expect([await s.tracking(), await s.charlesRiver(), await s.firstRunSeen(), await s.scores()], [false, true, true, (healthfulness: true, carbon: false)]);
      expect(await raw(), rn);
    });
  });

  group('day grouping', () {
    test('2 AM rollover: 12:30 AM belongs to the day before', () async {
      expect((await s.entriesForDay('2026-10-01')).map((e) => e.id), ['e0', 'e1', 'e2']);
      expect((await s.entriesForDay('2026-10-02')).map((e) => e.id), ['e3']);
      expect(await s.loggedDays(), ['2026-10-02', '2026-10-01']);
    });
    test('meals = entries sharing loggedAt; hall from first umass item', () async {
      final m = await s.mealsForDay('2026-10-01');
      expect(m.map((x) => '${x.loggedAt} ${x.entries.map((e) => e.id).join(',')} ${x.hallTid}'), ['${stamps[0]} e0,e1 2', '${stamps[2]} e2 null']);
    });
    test('across DST changes (bare local stamps)', () async {
      await db.delete('log_entries');
      const at = {
        '2026-03-08T01:59:00.000': '2026-03-07', // before the spring-forward 2 AM boundary
        '2026-03-08T03:00:00.000': '2026-03-08',
        '2026-11-01T01:30:00.000': '2026-10-31', // fall-back repeated hour
        '2026-11-01T02:00:00.000': '2026-11-01',
      };
      for (final k in at.keys) {
        await db.insert('log_entries', {'id': k, 'logged_at': k, 'source_json': sources[1], 'servings': 1, 'nutrition_json': nut});
      }
      for (final e in at.entries) {
        expect((await s.entriesForDay(e.value)).map((x) => x.id), contains(e.key), reason: e.key);
      }
      expect((await s.loggedDays()).length, 4);
    });
  });

  group('export from a seeded store equals export.json', () {
    final doc = jsonDecode(File('../shared/vectors/export.json').readAsStringSync()) as Map<String, dynamic>;
    for (final c in (doc['cases'] as List).cast<Map<String, dynamic>>()) {
      final kind = c['kind'] as String;
      final input = (c['input'] as List).cast<Map<String, dynamic>>();
      test('$kind: ${c['name']}', () async {
        await db.delete('log_entries');
        await db.delete('favorites');
        await db.delete('custom_foods');
        String expected = c['expected'] as String;
        if (kind.startsWith('entries')) {
          // the store lists by logged_at (RN's order); vectors with unsorted input re-derive via the proven exporter
          final sorted = [...input]..sort((a, b) => (a['loggedAt'] as String).compareTo(b['loggedAt'] as String));
          for (final e in input) {
            await db.insert('log_entries', {'id': e['id'], 'logged_at': e['loggedAt'], 'source_json': jsonEncode(e['source']), 'servings': e['servings'], 'nutrition_json': jsonEncode(e['nutrition'])});
          }
          if (sorted.map((e) => e['id']).join() != input.map((e) => e['id']).join()) {
            final es = [for (final e in sorted) LogEntry.fromJson(e)];
            expected = kind.endsWith('json') ? exportEntriesAsJson(es) : exportEntriesAsCsv(es);
          }
        } else if (kind.startsWith('ranked_dishes')) {
          await db.insert('preferences_kv', {'key': 'ranked_dishes', 'value_json': jsonEncode(input)}, conflictAlgorithm: ConflictAlgorithm.replace);
        } else if (kind.startsWith('ranked_foods')) {
          await db.insert('preferences_kv', {'key': 'ranked_foods', 'value_json': jsonEncode(input)}, conflictAlgorithm: ConflictAlgorithm.replace);
        } else if (kind.startsWith('favorites')) {
          for (final f in input) {
            await db.insert('favorites', {'key': Favorite.fromJson(f).key, 'favorite_json': jsonEncode(f)});
          }
        } else {
          for (final f in input) {
            await db.insert('custom_foods', {'id': f['id'], 'food_json': jsonEncode(f)});
          }
        }
        final out = kind.endsWith('json') ? await s.exportJson() : await s.exportCsv();
        final name = kind.replaceFirst(RegExp(r'_(json|csv)$'), '');
        expect(out['${name == 'entries' ? 'entries' : name}.${kind.split('_').last}'], expected);
      });
    }
  });
}
