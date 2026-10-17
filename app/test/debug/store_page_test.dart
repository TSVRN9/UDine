// /debug/store lists each table's row count and newest rows (read-only) and exists only outside release builds.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/app.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/debug/store_page.dart';
import '../fonts.dart';
import '../screens/support.dart';

void main() {
  sqfliteFfiInit();
  setUpAll(loadFonts);
  late Directory dir;
  late Database db;
  setUp(() async {
    dir = Directory.systemTemp.createTempSync('udine_debug_store');
    db = (await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi) as StoreReady).db;
    for (var i = 0; i < 3; i++) {
      await db.insert('log_entries', {'id': 'e$i', 'logged_at': '2026-10-0${i + 1}T12:00:00.000', 'source_json': '{"type":"off","productName":"Oat Bar $i"}', 'servings': 1, 'nutrition_json': '{}'});
    }
    await db.insert('favorites', {'key': 'dish:Pizza', 'favorite_json': '{"type":"dish","dishName":"Pizza"}'});
  });
  tearDown(() async {
    await db.close();
    dir.deleteSync(recursive: true);
  });

  test('dumpStore counts every table, newest rows first, and the schema version', () async {
    final d = await dumpStore(db);
    expect(d.userVersion, kUserVersion);
    final t = {for (final x in d.tables) x.name: x};
    expect(t['log_entries']!.count, 3);
    expect(t['favorites']!.count, 1);
    expect(t['custom_foods']!.count, 0);
    expect(t['log_entries']!.rows.first, contains('Oat Bar 2'));
    expect(t.keys, containsAll(['preferences_kv', 'saved_foods', 'food_sighting_dedup']));
  });

  test('dumpStore writes nothing: no row changed on the connection, whatever it undid after', () async {
    Future<Object?> changes() async => (await db.rawQuery('SELECT total_changes() c')).first['c'];
    final before = await changes();
    await dumpStore(db);
    expect(await changes(), before);
  });

  test('preferences_kv lists every key by name, with the occupancy caches folded into one line', () async {
    await db.insert('preferences_kv', {'key': 'food_preferences', 'value_json': '{"allergensToAvoid":["Peanuts"]}'});
    await db.insert('preferences_kv', {'key': 'ranked_dishes', 'value_json': '[]'});
    for (var i = 0; i < 60; i++) {
      await db.insert('preferences_kv', {'key': 'occupancy:v1:$i', 'value_json': '{}'});
    }
    await db.insert('preferences_kv', {'key': 'seen_dishes', 'value_json': '{}'}); // newest rowid, so the first 40 by rowid would hold only caches
    final t = {for (final x in (await dumpStore(db)).tables) x.name: x}['preferences_kv']!;
    expect(t.count, 63);
    expect(t.rows.where((r) => r.startsWith('food_preferences')), hasLength(1));
    expect(t.rows.where((r) => r.startsWith('ranked_dishes')), hasLength(1));
    expect(t.rows.where((r) => r.startsWith('seen_dishes')), hasLength(1));
    expect(t.rows.where((r) => r.contains('occupancy')), ['occupancy:*: 60 cached']);
    final keys = [for (final r in t.rows) if (!r.contains('occupancy')) r.split(' | ').first];
    expect(keys, [...keys]..sort());
  });

  testWidgets('the page shows counts and rows', (t) async {
    final b = await bootRecorded(t);
    await t.runAsync(() async {
      await b.store!.db.insert('log_entries', {'id': 'e9', 'logged_at': '2026-10-09T12:00:00.000', 'source_json': '{"type":"off","productName":"Oat Bar 9"}', 'servings': 1, 'nutrition_json': '{}'});
      await b.store!.db.insert('favorites', {'key': 'dish:Pizza', 'favorite_json': '{}'});
    });
    await openApp(t, b, route: '/debug/store?data=recorded');
    await until(t, () => find.textContaining('log_entries').evaluate().isNotEmpty);
    expect(find.textContaining('log_entries: 1'), findsOneWidget);
    expect(find.textContaining('Oat Bar 9'), findsOneWidget);
    expect(find.textContaining('dish:Pizza'), findsOneWidget);
    await drain(t);
  });

  testWidgets('a release build has no /debug/store', (t) async {
    final b = await bootRecorded(t);
    await t.pumpWidget(UdineApp(initialRoute: '/debug/store', boot: b, release: true));
    await t.pump(const Duration(seconds: 1));
    expect(find.textContaining('user_version'), findsNothing);
    expect(find.byType(StorePage), findsNothing);
    await drain(t);
  });
}
