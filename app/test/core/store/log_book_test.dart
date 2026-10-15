// What You's edits do to the store, and what each Undo puts back (flutter-port-you Task 1): byte-identical rows, rowid included.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/log_book.dart';
import 'package:udine/core/store/store.dart';

const nut = '{"servingSize":"1 cup","calories":210,"caloriesFromFat":54,"totalFatG":6,"satFatG":1.5,"transFatG":0,"cholesterolMg":10,"sodiumMg":340,"totalCarbG":30,"dietaryFiberG":3,"sugarsG":4,"proteinG":9.5}';
String src(String d) => '{"type":"umass-menu","dishName":"$d","hallTid":1}';

Future<List<Map<String, Object?>>> dump(Database db) => db.rawQuery('SELECT rowid AS _rowid, * FROM log_entries ORDER BY rowid');

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late Database db;
  late LogBook book;
  setUp(() async {
    dir = Directory.systemTemp.createTempSync('udine_log_book');
    db = ((await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi)) as StoreReady).db;
    for (final r in [('a', '2026-10-07T12:20:00.000', 'Posole', 1), ('b', '2026-10-07T12:20:00.000', 'Burger', 2), ('c', '2026-10-07T12:20:00.000', 'Rice', 1), ('d', '2026-10-08T08:42:00.000', 'Egg', 1)]) {
      await db.insert('log_entries', {'id': r.$1, 'logged_at': r.$2, 'source_json': src(r.$3), 'servings': r.$4, 'nutrition_json': nut});
    }
    book = LogBook(UdineStore(db), now: () => DateTime(2026, 10, 8, 12, 41));
    await book.reload();
  });
  tearDown(() async {
    await db.close();
    dir.deleteSync(recursive: true);
  });

  test('reads RN rows as meals, and today is the app clock\'s effective day', () {
    expect(book.meals.map((m) => m.items.length), [3, 1]);
    expect(book.today, '2026-10-08');
  });

  test('a stepper changes the servings in the store and on screen', () async {
    await book.setServings(book.meals.first.items.first, 1.5);
    expect(book.meals.first.items.first.qty, 1.5);
    expect((await dump(db)).firstWhere((r) => r['id'] == 'a')['servings'], 1.5);
  });

  test('removing an item takes its row out; Undo puts back exactly the row that was there', () async {
    final before = await dump(db);
    final undo = await book.remove(book.meals.first.items[1]);
    expect(await db.query('log_entries', where: "id = 'b'"), isEmpty);
    expect(book.meals.first.items.map((i) => i.id), ['a', 'c']);
    await undo();
    expect(await dump(db), before);
    expect(book.meals.first.items.map((i) => i.id), ['a', 'b', 'c']);
  });

  test('deleting a meal takes its rows out and no others; Undo puts back exactly those rows', () async {
    final before = await dump(db);
    final undo = await book.deleteMeal(book.meals.first);
    expect((await dump(db)).map((r) => r['id']), ['d']);
    expect(book.meals, hasLength(1));
    await undo();
    expect(await dump(db), before);
    expect(book.meals, hasLength(2));
  });

  Future<Object?> servingsOf(String id) async => (await db.query('log_entries', where: 'id = ?', whereArgs: [id])).single['servings'];
  Object? shown(String id) => book.meals.expand((m) => m.items).firstWhere((i) => i.id == id).qty;

  test('a failed edit does not undo the edit queued behind it: the screen and the file agree afterwards', () async {
    final items = book.meals.first.items, a = items[0], b = items[1]; // b is 2 servings
    final failed = book.setServings(a, 0); // the store refuses servings <= 0
    final fine = book.setServings(b, 3);
    await expectLater(failed, throwsA(anything));
    await fine;
    expect(await servingsOf('b'), 3);
    expect(shown('b'), 3);
    expect(shown('a'), 1); // a was never changed in the file, and shows what the file holds
  });

  test('rapid taps land in order, in the file and on screen', () async {
    final a = book.meals.first.items.first;
    final taps = [for (final q in [2.0, 3.0, 1.0, 4.0]) book.setServings(a, q)]; // none awaited: the stepper's taps
    await Future.wait(taps);
    expect(await servingsOf('a'), 4);
    expect(shown('a'), 4);
  });
}
