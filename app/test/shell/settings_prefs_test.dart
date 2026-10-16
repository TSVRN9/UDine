// What You's settings write: M2's Only show and Avoid into RN's `food_preferences` row, and the score toggles into their own key.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/m2/menu_view.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/shell/prefs.dart';

void main() {
  group('track', trackTests);
  sqfliteFfiInit();
  late Directory dir;
  late Database db;
  late UdineStore store;
  setUp(() async {
    dir = Directory.systemTemp.createTempSync('udine_settings');
    db = ((await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi)) as StoreReady).db;
    store = UdineStore(db);
  });
  tearDown(() async {
    await db.close();
    dir.deleteSync(recursive: true);
  });

  Future<Object?> row() async => (await db.query('preferences_kv', where: "key = 'food_preferences'")).single['value_json'];

  test('Only show writes the feed\'s exact tag; a field and a tag M2 has no row for stay as RN left them', () async {
    await db.insert('preferences_kv', {'key': 'food_preferences', 'value_json': '{"allergensToAvoid":["Milk"],"requiredDietTags":["Local"],"macroPresets":["high-protein"]}'});
    final p = await AppPrefs.load(store);
    expect(p.diet.avoid, ['Milk']); // an RN user's allergen is checked under Avoid
    await p.setOnlyShow('Plant Based', true);
    expect(p.diet.plant, isTrue);
    expect(await row(), '{"allergensToAvoid":["Milk"],"requiredDietTags":["Local","Plant Based"],"macroPresets":["high-protein"]}');
    await p.setOnlyShow('Plant Based', false);
    expect(await row(), '{"allergensToAvoid":["Milk"],"requiredDietTags":["Local"],"macroPresets":["high-protein"]}');
  });

  test('turning Plant based off removes RN\'s older "Vegan" too; Vegetarian and Halal write their feed strings', () async {
    await db.insert('preferences_kv', {'key': 'food_preferences', 'value_json': '{"allergensToAvoid":[],"requiredDietTags":["Vegan"]}'});
    final p = await AppPrefs.load(store);
    expect(p.diet.plant, isTrue);
    await p.setOnlyShow('Plant Based', false);
    await p.setOnlyShow('Vegetarian', true);
    await p.setOnlyShow('Halal', true);
    expect(await store.onlyShow(), ['Vegetarian', 'Halal']);
    expect(p.diet.veg && p.diet.halal && !p.diet.plant, isTrue);
  });

  test('Avoid adds and removes the feed\'s allergen string, in the order chosen', () async {
    final p = await AppPrefs.load(store);
    await p.toggleAvoid('Tree Nuts');
    await p.toggleAvoid('Milk');
    await p.toggleAvoid('Tree Nuts');
    expect(await store.avoid(), ['Milk']);
    expect(p.diet, const Prefs(avoid: ['Milk']));
  });

  test('a score toggle shows at once and is stored; the other toggle keeps its value', () async {
    final p = await AppPrefs.load(store);
    var heard = 0;
    p.addListener(() => heard++);
    await p.setScore(carbon: true);
    await p.setScore(health: true);
    expect(p.scores, (health: true, carbon: true));
    expect(await store.scores(), (healthfulness: true, carbon: true));
    expect(heard, 2);
  });
}

// Track what I eat and first run (flutter-port-you Task 3): both ride preferences_kv, written only when the user acts.
void trackTests() {
  sqfliteFfiInit();
  late Directory dir;
  late Database db;
  late UdineStore store;
  setUp(() async {
    dir = Directory.systemTemp.createTempSync('udine_track');
    db = ((await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi)) as StoreReady).db;
    store = UdineStore(db);
  });
  tearDown(() async {
    await db.close();
    dir.deleteSync(recursive: true);
  });

  test('tracking is on by default, off survives a restart, and a newer database never tracks', () async {
    var p = await AppPrefs.load(store);
    expect(p.track, isTrue);
    await p.setTrack(false);
    expect(p.track, isFalse);
    p = await AppPrefs.load(store);
    expect(p.track, isFalse);
    await p.setTrack(true);
    expect((await AppPrefs.load(store)).track, isTrue);
    final none = await AppPrefs.load(null);
    expect(none.track, isFalse);
    await none.setTrack(true);
    expect(none.track, isFalse, reason: 'nothing can be recorded without a store');
  });

  test('first run is unseen until it is marked, and the mark survives a restart', () async {
    var p = await AppPrefs.load(store);
    expect(p.firstRunSeen, isFalse);
    expect(await store.firstRunSeen(), isFalse); // (nothing was written by loading)
    await p.markFirstRunSeen();
    expect(p.firstRunSeen, isTrue);
    expect((await AppPrefs.load(store)).firstRunSeen, isTrue);
  });

  test('marking first run seen writes nothing else: an RN user\'s preferences are untouched', () async {
    await db.insert('preferences_kv', {'key': 'food_preferences', 'value_json': '{"allergensToAvoid":["Milk"],"requiredDietTags":["Halal"]}'});
    final p = await AppPrefs.load(store);
    await p.markFirstRunSeen();
    expect((await db.query('preferences_kv', where: "key = 'food_preferences'")).single['value_json'], '{"allergensToAvoid":["Milk"],"requiredDietTags":["Halal"]}');
    expect(await store.scores(), (healthfulness: false, carbon: false));
    expect(await store.tracking(), isTrue);
  });
}
