import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/store/db.dart';

// RN's schema, verbatim from mobile/src/lib/db.ts (one statement per entry).
const rnSchema = [
  '''CREATE TABLE IF NOT EXISTS log_entries (
           id TEXT PRIMARY KEY NOT NULL,
           logged_at TEXT NOT NULL,
           source_json TEXT NOT NULL,
           servings REAL NOT NULL,
           nutrition_json TEXT NOT NULL
         )''',
  '''CREATE TABLE IF NOT EXISTS favorites (
           key TEXT PRIMARY KEY NOT NULL,
           favorite_json TEXT NOT NULL
         )''',
  '''CREATE TABLE IF NOT EXISTS preferences_kv (
           key TEXT PRIMARY KEY NOT NULL,
           value_json TEXT NOT NULL
         )''',
  '''CREATE TABLE IF NOT EXISTS custom_foods (
           id TEXT PRIMARY KEY NOT NULL,
           food_json TEXT NOT NULL
         )''',
  '''CREATE TABLE IF NOT EXISTS food_sighting_dedup (
           dish_name TEXT NOT NULL,
           hall_tid INTEGER NOT NULL,
           sighted_date TEXT NOT NULL,
           PRIMARY KEY (dish_name, hall_tid, sighted_date)
         )''',
];
const tables = [
  'log_entries',
  'favorites',
  'preferences_kv',
  'custom_foods',
  'food_sighting_dedup',
];
const nut = '{"calories":210,"protein":9.5,"carbs":30,"fat":6,"sodium":340}';

Future<Map<String, Object?>> dump(Database db) async => {
      for (final t in tables) t: await db.rawQuery('SELECT * FROM $t ORDER BY rowid'),
      'schema': await db.rawQuery(
          "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"),
    };

Future<int> version(Database db) async =>
    (await db.rawQuery('PRAGMA user_version')).first.values.first! as int;

void main() {
  sqfliteFfiInit();
  final f = databaseFactoryFfi;
  late Directory dir;
  late String path;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('udine_store');
    path = '${dir.path}/SQLite/udine.db';
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<void> seedRn(int userVersion) async {
    Directory('${dir.path}/SQLite').createSync();
    final db = await f.openDatabase(path);
    for (final s in rnSchema) {
      await db.execute(s);
    }
    final src = [
      '{"type":"umass-menu","dishName":"Café Crème \\"Brûlée\\"","hallTid":2}',
      '{"type":"off","barcode":"0123456789012","productName":"Oat Bar"}',
      '{"type":"usda","fdcId":"171705","productName":"Banana"}',
      '{"type":"custom","customFoodId":"cf1","productName":"Mom\'s chili"}',
    ];
    for (var i = 0; i < src.length; i++) {
      await db.insert('log_entries', {
        'id': 'e$i',
        'logged_at': '2026-10-0${i + 1}T12:00:00.000Z',
        'source_json': src[i],
        'servings': i + 0.5,
        'nutrition_json': nut,
      });
    }
    await db.insert('favorites', {'key': 'dish:Pizza', 'favorite_json': '{"name":"Pizza"}'});
    await db.insert('favorites', {'key': 'location:3', 'favorite_json': '{"tid":3}'});
    await db.insert('custom_foods', {'id': 'cf1', 'food_json': '{"name":"Mom\'s chili"}'});
    for (final k in [
      'food_preferences',
      'ranked_dishes',
      'ranked_foods',
      'seen_dishes',
      'compare_daily_allowance',
      'menu_cache:1|10/13/2026',
    ]) {
      await db.insert('preferences_kv', {'key': k, 'value_json': '{"k":"$k"}'});
    }
    await db.insert('food_sighting_dedup',
        {'dish_name': 'Pizza', 'hall_tid': 1, 'sighted_date': '2026-10-13'});
    await db.execute('PRAGMA user_version = $userVersion');
    await db.close();
  }

  test('fresh create == RN schema, user_version 1', () async {
    final r = await openStore(path, factory: f);
    final db = (r as StoreReady).db;
    expect(await version(db), 1);
    final ref = await f.openDatabase(inMemoryDatabasePath);
    for (final s in rnSchema) {
      await ref.execute(s);
    }
    expect(await dump(db), await dump(ref));
    await db.close();
  });

  test('RN db at user_version 0 upgrades to 1, rows byte-identical', () async {
    await seedRn(0);
    final before = await f.openDatabase(path, options: OpenDatabaseOptions(readOnly: true));
    final want = await dump(before);
    expect(await version(before), 0);
    await before.close();
    final db = (await openStore(path, factory: f) as StoreReady).db;
    expect(await version(db), 1);
    expect(await dump(db), want);
    await db.close();
  });

  test('reopening a migrated db is a no-op', () async {
    await seedRn(0);
    await (await openStore(path, factory: f) as StoreReady).db.close();
    final first = File(path).readAsBytesSync();
    final db = (await openStore(path, factory: f) as StoreReady).db;
    final want = await dump(db);
    await db.close();
    final db2 = (await openStore(path, factory: f) as StoreReady).db;
    expect(await dump(db2), want);
    expect(await version(db2), 1);
    await db2.close();
    expect(File(path).readAsBytesSync(), first);
  });

  test('newer user_version: no migration, no write, error state', () async {
    await seedRn(7);
    final before = File(path).readAsBytesSync();
    final r = await openStore(path, factory: f);
    expect(r, isA<StoreNewerVersion>());
    expect((r as StoreNewerVersion).found, 7);
    expect(r.supported, 1);
    expect(File(path).readAsBytesSync(), before);
  });
}
