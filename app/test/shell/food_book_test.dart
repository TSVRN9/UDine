// Your foods over the device store (flutter-port-packaged-foods Task 3): newest first across custom_foods and saved_foods, save-on-add that
// never overwrites an edit, Edit and Delete with an Undo that puts back the exact rows, and a past day that no edit or delete can change.
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/m2/board.dart' show Macro;
import 'package:udine/core/packaged_food.dart';
import 'package:udine/core/saved_food.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';
import 'package:udine/shell/food_book.dart';

PackagedFood off(String code, String name, {num cal = 250}) => PackagedFood(
      source: OffSource(barcode: code, productName: name), productName: name, brand: 'Clif Bar',
      nutrition: NutritionFacts(servingSize: '1 bar (68 g)', calories: cal, caloriesFromFat: 0, totalFatG: 6, satFatG: 2, transFatG: 0, cholesterolMg: 0, sodiumMg: 260, totalCarbG: 43, dietaryFiberG: 5, sugarsG: 21, proteinG: 10),
      allergens: const ['Soybeans'], ingredients: 'oats',
    );

Future<List<Map<String, Object?>>> rows(UdineStore s, String t) => s.db.rawQuery('SELECT rowid AS _rowid, * FROM $t ORDER BY rowid');

void main() {
  sqfliteFfiInit();
  late UdineStore store;
  late FoodBook book;
  var clock = DateTime.utc(2026, 10, 8, 16, 41), n = 0;
  setUp(() async {
    databaseFactory = databaseFactoryFfi;
    final db = (await openStore(inMemoryDatabasePath)) as StoreReady;
    addTearDown(db.db.close);
    store = UdineStore(db.db);
    n = 0;
    book = FoodBook(store, now: () => clock = clock.add(const Duration(minutes: 1)), salt: () => 'x${n++}');
    await book.reload();
  });

  test('empty, then newest first across both tables: a custom food and a packaged one interleave by when they were saved', () async {
    expect(book.foods, isEmpty);
    final a = await book.addCustom('Chobani', const Macro(140, 12, 15, 0));
    await book.save(SavedFood.packed(off('1', 'Chocolate Chip')));
    final c = await book.addCustom('Granola', const Macro(200, 5, 30, 8));
    await book.save(SavedFood.packed(off('2', 'Peanut Butter')));
    expect([for (final f in book.foods) f.name], ['Clif Bar Peanut Butter', 'Granola', 'Clif Bar Chocolate Chip', 'Chobani']);
    expect(a.kind, FoodKind.custom);
    expect(c.source.toJson()['customFoodId'], c.id);
  });

  test('a custom food is RN\'s row: id, name, servingSize, nutrition, and nothing else; a packaged one lands in saved_foods', () async {
    final f = await book.addCustom('Chobani', const Macro(140, 12, 15, 0));
    final r = (await rows(store, 'custom_foods')).single;
    expect(r.keys, containsAll(['id', 'food_json']));
    expect((await store.customFoods()).single.toJson(), {'id': f.id, 'name': 'Chobani', 'servingSize': '1 serving', 'nutrition': f.nutrition.toJson()});
    expect(await rows(store, 'saved_foods'), isEmpty);
    await book.save(SavedFood.packed(off('1', 'Chocolate Chip')));
    expect((await rows(store, 'saved_foods')), hasLength(1));
    expect(await rows(store, 'custom_foods'), hasLength(1));
  });

  test('the same name is the same food: no new row, and the first save\'s figures stay', () async {
    final a = await book.addCustom('Chobani', const Macro(140, 12, 15, 0));
    final b = await book.addCustom(' chobani ', const Macro(140, 12, 15, 0));
    final c = await book.addCustom('Chobani', const Macro(100, 12, 15, 0));
    expect([b.id, c.id], [a.id, a.id]);
    expect(c.macro.cal, 140);
    expect(book.foods, hasLength(1));
    expect(await rows(store, 'custom_foods'), hasLength(1));
  });

  test('saving a packaged food already saved keeps the saved copy: an edit is never overwritten by the hit it came from', () async {
    final hit = SavedFood.packed(off('1', 'Chocolate Chip'));
    final saved = await book.save(hit);
    await book.edit(saved, saved.edited(name: 'My bar', cal: 200, p: 6, c: 30, f: 5));
    final again = await book.save(hit);
    expect([again.name, again.macro.cal], ['My bar', 200]);
    expect(book.foods.single.name, 'My bar');
  });

  test('Edit keeps the food where it is, in the same row, and a custom food keeps its id', () async {
    final a = await book.addCustom('Chobani', const Macro(140, 12, 15, 0));
    await book.save(SavedFood.packed(off('1', 'Chocolate Chip')));
    await book.edit(a, a.edited(name: 'Chobani Zero', cal: 120, p: 15, c: 10, f: 0));
    expect([for (final f in book.foods) f.name], ['Clif Bar Chocolate Chip', 'Chobani Zero']);
    expect((await store.customFoods()).single.id, a.id);
    expect(await rows(store, 'custom_foods'), hasLength(1));
  });

  test('Delete then Undo puts back the exact row, in its place, for each table', () async {
    final a = await book.addCustom('Chobani', const Macro(140, 12, 15, 0));
    final b = await book.save(SavedFood.packed(off('1', 'Chocolate Chip')));
    final c = await book.addCustom('Granola', const Macro(200, 5, 30, 8));
    final before = [await rows(store, 'custom_foods'), await rows(store, 'saved_foods')];
    for (final f in [b, a]) {
      final undo = await book.delete(f);
      expect(book.foods.map((x) => x.id), isNot(contains(f.id)));
      await undo();
      expect(book.foods.map((x) => x.id), contains(f.id));
    }
    expect([await rows(store, 'custom_foods'), await rows(store, 'saved_foods')], before);
    expect([for (final f in book.foods) f.name], ['Granola', 'Clif Bar Chocolate Chip', 'Chobani']);
    expect(c.id, isNotEmpty);
  });

  test('a logged meal keeps its own snapshot: editing or deleting the food leaves the past day as it was', () async {
    final f = await book.save(SavedFood.packed(off('1', 'Chocolate Chip')));
    await store.addEntries([LogEntry(id: 'e1', loggedAt: '2026-10-07T12:00:00.000', servings: 1, source: f.source, nutrition: f.nutrition)]);
    Future<List<Map<String, dynamic>>> day() async => [for (final e in await store.entriesForDay('2026-10-07')) e.toJson()];
    final was = await day();
    await book.edit(f, f.edited(name: 'Other', cal: 1, p: 1, c: 1, f: 1));
    expect(await day(), was);
    await book.delete(book.foods.single);
    expect(await day(), was);
  });

  test('a store that cannot be written leaves Your foods as it was and throws', () async {
    await store.db.close();
    await expectLater(book.save(SavedFood.packed(off('1', 'Chocolate Chip'))), throwsA(anything));
    expect(book.foods, isEmpty);
  });
}
