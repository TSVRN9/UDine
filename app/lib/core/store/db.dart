import 'dart:io';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

/// Schema version this build knows. 0 is RN's schema (never stamped a version).
const kUserVersion = 4; // == _migrations.length

/// RN's schema, copied from mobile/src/lib/db.ts. Never alter these; new
/// migrations add tables/columns/keys only.
const _rnSchema = [
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

/// Additive-only steps; index i migrates user_version i -> i+1.
/// 0 -> 1: stamps the version (RN's tables are created above if missing).
/// 1 -> 2: saved_foods, the packaged and lookup foods added to the plate (custom_foods stays RN's alone).
/// 2 -> 3: alert_sent, the favourite-dish alerts already posted (day is the effective day, 2 AM rollover; RN's food_sighting_dedup stays RN's alone).
/// 3 -> 4: health_writes, the Health Connect / Apple Health record ids of each meal (meal_id is its loggedAt), so an edit or delete finds its record without reading Health.
const _migrations = <List<String>>[
  [],
  ['CREATE TABLE IF NOT EXISTS saved_foods (id TEXT PRIMARY KEY NOT NULL, food_json TEXT NOT NULL)'],
  ['CREATE TABLE IF NOT EXISTS alert_sent (dish_name TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (dish_name, day))'],
  ['CREATE TABLE IF NOT EXISTS health_writes (meal_id TEXT NOT NULL, platform TEXT NOT NULL, record_ids_json TEXT NOT NULL, PRIMARY KEY (meal_id, platform))'],
];

sealed class StoreOpen {}

class StoreReady extends StoreOpen {
  StoreReady(this.db);
  final Database db;
}

/// The file was written by a newer build. Nothing was migrated or written.
class StoreNewerVersion extends StoreOpen {
  StoreNewerVersion(this.found, this.supported);
  final int found;
  final int supported;
}

/// expo-sqlite's location, so the Flutter app inherits RN's data in place.
/// Android: path_provider_android 2.3.1 getApplicationSupportPath() returns
/// Context.getFilesDir().path (path_provider_android_real.dart), which is
/// expo-sqlite's `filesDir/SQLite` parent. iOS: Documents/SQLite.
/// Never sqflite's default databases/ dir.
Future<String> udineDbPath() async {
  final base = Platform.isAndroid
      ? await getApplicationSupportDirectory()
      : await getApplicationDocumentsDirectory();
  return p.join(base.path, 'SQLite', 'udine.db');
}

Future<int> _version(DatabaseExecutor db) async =>
    (await db.rawQuery('PRAGMA user_version')).first.values.first! as int;

/// Opens [path] in place (SQLite replays any -wal itself; nothing is copied).
/// The newer-version probe is a normal read-only open: it reads user_version
/// through the WAL and changes no data, though SQLite may create -shm.
/// [singleInstance] false gives this call its own connection: sqflite's default shares one native handle per path across the process (not
/// reference-counted), so a second engine (the background check) closing "its" db would close the app's. [migrations]/[onOpen] are test seams.
Future<StoreOpen> openStore(
  String path, {
  DatabaseFactory? factory,
  bool singleInstance = true,
  @visibleForTesting List<List<String>> migrations = _migrations,
  @visibleForTesting void Function(Database)? onOpen,
}) async {
  final f = factory ?? databaseFactory;
  final target = migrations.length;
  if (File(path).existsSync()) {
    final probe = await f.openDatabase(path, options: OpenDatabaseOptions(readOnly: true, singleInstance: singleInstance));
    final found = await _version(probe);
    await probe.close();
    if (found > target) return StoreNewerVersion(found, target);
  } else {
    Directory(p.dirname(path)).createSync(recursive: true);
  }
  final db = await f.openDatabase(path, options: OpenDatabaseOptions(singleInstance: singleInstance));
  onOpen?.call(db);
  try {
    await db.transaction((tx) async {
      for (final s in _rnSchema) {
        await tx.execute(s);
      }
      for (var v = await _version(tx); v < target; v++) {
        for (final s in migrations[v]) {
          await tx.execute(s);
        }
        await tx.execute('PRAGMA user_version = ${v + 1}');
      }
    });
  } catch (_) {
    await db.close();
    rethrow;
  }
  return StoreReady(db);
}
