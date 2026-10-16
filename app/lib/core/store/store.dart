import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../date.dart';
import '../export.dart';
import '../packaged_food.dart';
import '../types.dart';

/// Puts back exactly the rows (rowid and bytes) an operation removed or changed.
typedef Undo = Future<void> Function();

/// A meal is what RN logs as one plate: every entry sharing one `logged_at`
/// string (plate.ts toLogEntries stamps a whole plate with a single loggedAt).
/// M2's meal `{id, at, day, hall, items}` is the same group: `at` = loggedAt,
/// `day` = effectiveDayOf(at, rollover), `hall` = the first umass-menu item's
/// hallTid (null for a plate of only off/usda/custom items). Two plates logged
/// in the same millisecond would merge; nowLocalIso has ms resolution.
class Meal {
  const Meal(this.loggedAt, this.day, this.entries);
  final String loggedAt, day;
  final List<LogEntry> entries;
  int? get hallTid => entries.map((e) => e.source).whereType<UmassMenuSource>().firstOrNull?.hallTid;
}

/// M2 tracking/score/campus/first-run settings: new preferences_kv keys, prefixed so they never meet RN's.
const kTrackKey = 'm2:track', kScoresKey = 'm2:scores', kCharlesRiverKey = 'm2:charles_river', kFirstRunSeenKey = 'm2:first_run_seen', kPinsKey = 'm2:pins';

/// Repositories over an opened db, reading and writing RN's exact rows and JSON shapes.
class UdineStore {
  UdineStore(this.db);
  final Database db;

  // ---- generic: snapshot-based Undo. Undo restores what the action changed and never touches any other row:
  // if the world moved on it does the safe subset and never throws data away or throws. ----

  Future<List<Map<String, Object?>>> _rows(DatabaseExecutor x, String table, String keyCol, List<String> keys) async => keys.isEmpty
      ? []
      : x.rawQuery('SELECT rowid AS _rowid, * FROM $table WHERE $keyCol IN (${List.filled(keys.length, '?').join(',')})', keys);

  static bool _same(Map<String, Object?> a, Map<String, Object?> b) => a.keys.where((k) => k != '_rowid').every((k) => a[k] == b[k]);

  Future<Undo> _change(String table, String keyCol, List<String> keys, Future<void> Function(DatabaseExecutor tx) action) async {
    final before = await _rows(db, table, keyCol, keys);
    await db.transaction(action);
    final after = await _rows(db, table, keyCol, keys);
    return () => db.transaction((tx) async {
          for (final k in keys) {
            final was = before.where((r) => r[keyCol] == k).firstOrNull;
            final wrote = after.where((r) => r[keyCol] == k).firstOrNull;
            final now = (await _rows(tx, table, keyCol, [k])).firstOrNull;
            if (wrote != null) {
              // Remove what the action wrote only if it is still exactly that; an edited row is left alone (and so is the old one).
              if (now == null || !_same(now, wrote)) continue;
              await tx.rawDelete('DELETE FROM $table WHERE $keyCol = ?', [k]);
            } else if (now != null) {
              continue; // the key was re-created since: leave the existing row
            }
            if (was == null) continue;
            final row = {...was};
            final rowid = row.remove('_rowid');
            final free = (await tx.rawQuery('SELECT 1 FROM $table WHERE rowid = ?', [rowid])).isEmpty;
            if (free) row['rowid'] = rowid;
            await tx.insert(table, row);
          }
        });
  }

  // ---- log ----

  static LogEntry _entry(Map<String, Object?> r) => LogEntry.fromJson({
        'id': r['id'],
        'loggedAt': r['logged_at'],
        'source': jsonDecode(r['source_json']! as String),
        'servings': r['servings'],
        'nutrition': jsonDecode(r['nutrition_json']! as String),
      });

  Future<List<LogEntry>> allEntries() async => [for (final r in await db.rawQuery('SELECT * FROM log_entries ORDER BY logged_at')) _entry(r)];

  /// Entries of an effective day (2 AM rollover), in logged_at order. Filtered in Dart like RN: a raw date prefix
  /// would file a 12:30 AM snack under the wrong day.
  Future<List<LogEntry>> entriesForDay(String isoDay, {int rolloverHour = defaultRolloverHour}) async =>
      [for (final e in await allEntries()) if (effectiveDayOf(e.loggedAt, rolloverHour) == isoDay) e];

  /// Days with at least one entry, newest first.
  Future<List<String>> loggedDays({int rolloverHour = defaultRolloverHour}) async =>
      ({for (final e in await allEntries()) effectiveDayOf(e.loggedAt, rolloverHour)}.toList()..sort()).reversed.toList();

  Future<List<Meal>> mealsForDay(String isoDay, {int rolloverHour = defaultRolloverHour}) async {
    final groups = <String, List<LogEntry>>{};
    for (final e in await entriesForDay(isoDay, rolloverHour: rolloverHour)) {
      (groups[e.loggedAt] ??= []).add(e);
    }
    return [for (final g in groups.entries) Meal(g.key, isoDay, g.value)];
  }

  Future<Undo> addEntry(LogEntry e) => _change('log_entries', 'id', [e.id], (tx) async {
        await tx.rawInsert(
          'INSERT OR REPLACE INTO log_entries (id, logged_at, source_json, servings, nutrition_json) VALUES (?, ?, ?, ?, ?)',
          [e.id, e.loggedAt, jsonEncode(e.source.toJson()), e.servings, jsonEncode(e.nutrition.toJson())],
        );
      });

  /// Touches only the servings column; source/nutrition bytes stay as written.
  /// Undo is compare-and-set: it restores the old value only if the row still exists with the servings this edit set.
  Future<Undo> changeServings(String id, num servings) async {
    if (!(servings > 0)) throw ArgumentError.value(servings, 'servings', 'must be > 0; use deleteEntry to remove');
    final old = (await db.rawQuery('SELECT servings FROM log_entries WHERE id = ?', [id])).firstOrNull?['servings'];
    await db.rawUpdate('UPDATE log_entries SET servings = ? WHERE id = ?', [servings, id]);
    return () async {
      if (old == null) return;
      await db.rawUpdate('UPDATE log_entries SET servings = ? WHERE id = ? AND servings = ?', [old, id, servings]);
    };
  }

  Future<Undo> deleteEntry(String id) => deleteEntries([id]);

  Future<Undo> deleteMeal(Meal m) => deleteEntries([for (final e in m.entries) e.id]);

  Future<Undo> deleteEntries(List<String> ids) => _change('log_entries', 'id', ids, (tx) async {
        await tx.rawDelete('DELETE FROM log_entries WHERE id IN (${List.filled(ids.length, '?').join(',')})', ids);
      });

  // ---- favorites ----

  Future<List<Favorite>> favorites() async =>
      [for (final r in await db.rawQuery('SELECT favorite_json FROM favorites ORDER BY rowid')) Favorite.fromJson(jsonDecode(r['favorite_json']! as String) as Map<String, dynamic>)];

  Future<Undo> addFavorite(Favorite f) => _change('favorites', 'key', [f.key], (tx) async {
        await tx.rawInsert('INSERT OR REPLACE INTO favorites (key, favorite_json) VALUES (?, ?)', [f.key, jsonEncode(f.toJson())]);
      });

  Future<Undo> removeFavorite(Favorite f) => _change('favorites', 'key', [f.key], (tx) async {
        await tx.rawDelete('DELETE FROM favorites WHERE key = ?', [f.key]);
      });

  // ---- custom foods ----

  Future<List<CustomFood>> customFoods() async =>
      [for (final r in await db.rawQuery('SELECT food_json FROM custom_foods ORDER BY rowid')) CustomFood.fromJson(jsonDecode(r['food_json']! as String) as Map<String, dynamic>)];

  Future<Undo> addCustomFood(CustomFood f) => _change('custom_foods', 'id', [f.id], (tx) async {
        await tx.rawInsert('INSERT OR REPLACE INTO custom_foods (id, food_json) VALUES (?, ?)', [f.id, jsonEncode(f.toJson())]);
      });

  Future<Undo> removeCustomFood(String id) => _change('custom_foods', 'id', [id], (tx) async {
        await tx.rawDelete('DELETE FROM custom_foods WHERE id = ?', [id]);
      });

  // ---- saved foods: packaged and lookup foods added to the plate (Your foods, with custom_foods) ----

  /// Newest first.
  Future<List<PackagedFood>> savedFoods() async =>
      [for (final r in await db.rawQuery('SELECT food_json FROM saved_foods ORDER BY rowid DESC')) PackagedFood.fromJson(jsonDecode(r['food_json']! as String) as Map<String, dynamic>)];

  /// Saving a food that is already saved edits it where it is.
  Future<Undo> saveFood(PackagedFood f) => _change('saved_foods', 'id', [f.id], (tx) async {
        await tx.rawInsert(
          'INSERT INTO saved_foods (id, food_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET food_json = excluded.food_json',
          [f.id, jsonEncode(f.toJson())],
        );
      });

  Future<Undo> removeSavedFood(String id) => _change('saved_foods', 'id', [id], (tx) async {
        await tx.rawDelete('DELETE FROM saved_foods WHERE id = ?', [id]);
      });

  // ---- preferences_kv ----

  Future<Object?> _kv(String key) async {
    final r = await db.rawQuery('SELECT value_json FROM preferences_kv WHERE key = ?', [key]);
    return r.isEmpty ? null : jsonDecode(r.first['value_json']! as String);
  }

  Future<void> _setKv(String key, Object? value) =>
      db.rawInsert('INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)', [key, jsonEncode(value)]);

  // rankings: whole-list replace, as RN

  Future<List<RankedDish>> rankedDishes() async =>
      [for (final j in (await _kv('ranked_dishes') as List? ?? [])) RankedDish.fromJson(j as Map<String, dynamic>)];
  Future<void> saveRankedDishes(List<RankedDish> d) => _setKv('ranked_dishes', [for (final x in d) x.toJson()]);
  Future<List<RankedFood>> rankedFoods() async =>
      [for (final j in (await _kv('ranked_foods') as List? ?? [])) RankedFood.fromJson(j as Map<String, dynamic>)];
  Future<void> saveRankedFoods(List<RankedFood> f) => _setKv('ranked_foods', [for (final x in f) x.toJson()]);

  /// `food_preferences` is read and written as the raw map so fields this build doesn't model (macroPresets, anything
  /// a later RN build added) stay in the row untouched. Mapping: M2 Avoid <-> allergensToAvoid, M2 Only show <-> requiredDietTags.
  Future<Map<String, dynamic>> _prefsRaw() async =>
      Map<String, dynamic>.from(await _kv('food_preferences') as Map? ?? {'allergensToAvoid': <String>[], 'requiredDietTags': <String>[]});

  Future<List<String>> avoid() async => List<String>.from((await _prefsRaw())['allergensToAvoid'] as List? ?? []);
  Future<List<String>> onlyShow() async => List<String>.from((await _prefsRaw())['requiredDietTags'] as List? ?? []);
  Future<void> setAvoid(List<String> v) async => _setKv('food_preferences', (await _prefsRaw())..['allergensToAvoid'] = v);
  Future<void> setOnlyShow(List<String> v) async => _setKv('food_preferences', (await _prefsRaw())..['requiredDietTags'] = v);

  // M2 settings

  Future<bool> tracking() async => await _kv(kTrackKey) as bool? ?? true;
  Future<void> setTracking(bool v) => _setKv(kTrackKey, v);
  Future<bool> charlesRiver() async => await _kv(kCharlesRiverKey) as bool? ?? false;
  Future<void> setCharlesRiver(bool v) => _setKv(kCharlesRiverKey, v);
  /// Pinned cafés by name, in the order pinned (M2 `S.pins`).
  Future<List<String>> pins() async => List<String>.from(await _kv(kPinsKey) as List? ?? []);
  Future<void> setPins(List<String> v) => _setKv(kPinsKey, v);
  Future<bool> firstRunSeen() async => await _kv(kFirstRunSeenKey) as bool? ?? false;
  Future<void> setFirstRunSeen(bool v) => _setKv(kFirstRunSeenKey, v);

  /// Score toggles ("Show on dishes"), both off by default.
  Future<({bool healthfulness, bool carbon})> scores() async {
    final m = await _kv(kScoresKey) as Map? ?? {};
    return (healthfulness: m['healthfulness'] == true, carbon: m['carbon'] == true);
  }

  Future<void> setScores({required bool healthfulness, required bool carbon}) =>
      _setKv(kScoresKey, {'healthfulness': healthfulness, 'carbon': carbon});

  // ---- export: every device-local user table, through core/export.dart ----

  Future<Map<String, String>> exportJson() async => {
        'udine-export.json': exportEntriesAsJson(await allEntries()),
        'udine-ranked-dishes.json': exportRankedDishesAsJson(await rankedDishes()),
        'udine-ranked-foods.json': exportRankedFoodsAsJson(await rankedFoods()),
        'udine-favorites.json': exportFavoritesAsJson(await favorites()),
        'udine-custom-foods.json': exportCustomFoodsAsJson(await customFoods()),
        'udine-saved-foods.json': exportSavedFoodsAsJson(await savedFoods()),
      };

  Future<Map<String, String>> exportCsv() async => {
        'udine-export.csv': exportEntriesAsCsv(await allEntries()),
        'udine-ranked-dishes.csv': exportRankedDishesAsCsv(await rankedDishes()),
        'udine-ranked-foods.csv': exportRankedFoodsAsCsv(await rankedFoods()),
        'udine-favorites.csv': exportFavoritesAsCsv(await favorites()),
        'udine-custom-foods.csv': exportCustomFoodsAsCsv(await customFoods()),
        'udine-saved-foods.csv': exportSavedFoodsAsCsv(await savedFoods()),
      };
}
