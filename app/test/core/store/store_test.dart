import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/export.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';
import 'package:udine/core/packaged_food.dart';

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

  LogEntry mk(String id, String at) => LogEntry.fromJson({'id': id, 'loggedAt': at, 'source': jsonDecode(sources[1]), 'servings': 1, 'nutrition': jsonDecode(nut)});
  Future<num> serv(String id) async => (await db.rawQuery('SELECT servings FROM log_entries WHERE id=?', [id])).single['servings']! as num;
  Future<List<String>> ids() async => [for (final r in await db.rawQuery('SELECT id FROM log_entries ORDER BY rowid')) r['id']! as String];

  group('Undo after the world moved on: safe subset, never throws, never loses data', () {
    test('delete meal -> add entry (reuses rowid) -> Undo: meal and new entry both exist', () async {
      await db.delete('log_entries');
      for (final i in [0, 1]) {
        await db.insert('log_entries', {'id': 'm$i', 'logged_at': stamps[0], 'source_json': sources[1], 'servings': 1, 'nutrition_json': nut});
      }
      final undo = await s.deleteMeal((await s.mealsForDay('2026-10-01')).single);
      await s.addEntry(mk('new', stamps[3]));
      await undo();
      expect((await ids())..sort(), ['m0', 'm1', 'new']);
    });
    test('delete -> same id re-added -> Undo leaves the existing row', () async {
      final undo = await s.deleteEntry('e0');
      await s.addEntry(mk('e0', stamps[3]));
      await undo();
      expect((await s.allEntries()).firstWhere((e) => e.id == 'e0').source, isA<OffSource>());
    });
    test('changeServings -> delete -> Undo: row stays deleted', () async {
      final undo = await s.changeServings('e1', 4);
      await s.deleteEntry('e1');
      await undo();
      expect(await ids(), isNot(contains('e1')));
    });
    test('edit A -> edit B -> Undo A: stays B', () async {
      final a = await s.changeServings('e1', 2);
      await s.changeServings('e1', 3);
      await a();
      expect(await serv('e1'), 3);
    });
    test('add -> edit -> Undo add: row stays', () async {
      final undo = await s.addEntry(mk('n', stamps[0]));
      await s.changeServings('n', 5);
      await undo();
      expect(await ids(), contains('n'));
      expect(await serv('n'), 5);
    });
    test('favorites: remove -> re-add differently -> Undo keeps the newer row', () async {
      final undo = await s.removeFavorite(const DishFavorite('Pizza'));
      await db.insert('favorites', {'key': 'dish:Pizza', 'favorite_json': '{"type":"dish","dishName":"Pizza","x":1}'});
      await undo();
      expect((await db.query('favorites', where: "key='dish:Pizza'")).single['favorite_json'], contains('"x":1'));
    });
  });

  test('allEntries orders by logged_at, not id', () async {
    await db.delete('log_entries');
    for (final e in [('a', stamps[3]), ('b', stamps[0]), ('c', stamps[2])]) {
      await db.insert('log_entries', {'id': e.$1, 'logged_at': e.$2, 'source_json': sources[1], 'servings': 1, 'nutrition_json': nut});
    }
    expect((await s.allEntries()).map((e) => e.id), ['b', 'c', 'a']);
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
    test('pinned cafés: empty by default, kept in the order pinned, beside RN keys', () async {
      expect(await s.pins(), isEmpty);
      await s.setPins(['Wasabi', 'Tamales']);
      expect(await s.pins(), ['Wasabi', 'Tamales']);
      expect(await raw(), rn);
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
        final base = {'entries': 'udine-export'}[name] ?? 'udine-${name.replaceAll('_', '-')}';
        expect(out['$base.${kind.split('_').last}'], expected);
      });
    }
  });

  group('saved foods (packaged and lookup foods added to the plate)', () {
    NutritionFacts n(num cal, [String serving = 'per 100g']) => NutritionFacts.fromJson({...jsonDecode(nut) as Map<String, dynamic>, 'servingSize': serving, 'calories': cal});
    final clif = PackagedFood(
      source: const OffSource(barcode: '0722252068484', productName: 'Chocolate Chip'),
      productName: 'Chocolate Chip',
      brand: 'Clif Bar',
      nutrition: n(368),
      ingredients: 'oats, "syrup"',
      allergens: const ['Soybeans'],
    );
    final oats = PackagedFood(source: const UsdaSource(fdcId: '1', productName: 'Oats'), productName: 'Oats', nutrition: n(380));
    final laksa = PackagedFood(source: const UmassMenuSource(dishName: 'Laksa', hallTid: 4306), productName: 'Laksa', nutrition: n(420, '1 bowl'), allergens: const ['Shellfish']);

    test('round trips every field and lists newest first', () async {
      await s.saveFood(clif);
      await s.saveFood(oats);
      await s.saveFood(laksa);
      final got = await s.savedFoods();
      expect(got.map((f) => f.id), ['umass:Laksa|4306', 'usda:1', 'off:0722252068484']);
      final back = got.last;
      expect(back.toJson(), clif.toJson());
      expect(back.displayName, 'Clif Bar Chocolate Chip');
      expect(back.ingredients, 'oats, "syrup"');
      expect(back.allergens, ['Soybeans']);
      expect(back.nutrition.servingSize, 'per 100g');
      expect(got[1].ingredients, isNull);
    });

    test('saving an existing food again edits it in place; Undo restores the old row exactly', () async {
      await s.saveFood(clif);
      await s.saveFood(oats);
      final before = await rows(db, 'saved_foods');
      final undo = await s.saveFood(PackagedFood(source: clif.source, productName: 'Chocolate Chip', brand: 'Clif Bar', nutrition: n(999)));
      expect((await s.savedFoods()).map((f) => f.id), ['usda:1', 'off:0722252068484']);
      expect((await s.savedFoods()).last.nutrition.calories, 999);
      await undo();
      expect(await rows(db, 'saved_foods'), before);
    });

    test('remove then Undo puts back the same row', () async {
      await s.saveFood(clif);
      await s.saveFood(oats);
      final before = await rows(db, 'saved_foods');
      final undo = await s.removeSavedFood('off:0722252068484');
      expect((await s.savedFoods()).map((f) => f.id), ['usda:1']);
      await undo();
      expect(await rows(db, 'saved_foods'), before);
    });

    test('never touches custom_foods, log entries or favorites', () async {
      final before = await dump(db);
      await s.saveFood(clif);
      await (await s.removeSavedFood(clif.id))();
      await s.saveFood(oats);
      final after = await dump(db);
      expect(after, before);
    });

    test('exports as udine-saved-foods.json and .csv, like the other tables', () async {
      await s.saveFood(clif);
      await s.saveFood(oats);
      final foods = await s.savedFoods();
      final j = (await s.exportJson())['udine-saved-foods.json']!;
      expect(j, exportSavedFoodsAsJson(foods));
      expect(jsonDecode(j), [for (final f in foods) f.toJson()]);
      final c = (await s.exportCsv())['udine-saved-foods.csv']!;
      expect(c, exportSavedFoodsAsCsv(foods));
      expect(c.split('\n'), [
        'id,name,servingSize,calories,proteinG,totalCarbG,totalFatG,ingredients',
        '"usda:1","Oats","per 100g","380","9.5","30","6",""',
        '"off:0722252068484","Clif Bar Chocolate Chip","per 100g","368","9.5","30","6","oats, ""syrup"""',
      ]);
      expect(exportSavedFoodsAsJson([]), '[]');
    });
  });
}
