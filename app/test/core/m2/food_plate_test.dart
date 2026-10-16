// A saved food on the plate (flutter-port-packaged-foods Task 3): keyed 'food:<id>', logged with its own source and its full nutrition
// (RN's offResultToPlateEntry / usdaResultToPlateEntry / customFoodToPlateEntry), summed whole by the plate's label.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/log.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/m2/plate_label.dart';
import 'package:udine/core/packaged_food.dart';
import 'package:udine/core/saved_food.dart';
import 'package:udine/core/types.dart';
import 'package:udine/data/packaged.dart';
import 'package:udine/core/m2/dish_sheet.dart' show labelRowsOf;

PackagedFood clifBar() {
  final flow = jsonDecode(File('../docs/design/explorations/2026-10-ui-overhaul/flows/packaged-2026-10-13.json').readAsStringSync()) as Map<String, dynamic>;
  return mapOffSearch({'products': [flow['product']]}).results.single;
}

PackagedFood hits100() => mapOffSearch({
      'products': [
        {'code': '36346363', 'product_name': 'Clif bar', 'brands': ['Clif Bar'], 'nutriments': {'energy-kcal_100g': 367.6, 'proteins_100g': 14.7, 'carbohydrates_100g': 63.2, 'fat_100g': 8.8, 'sodium_100g': 0.26}},
      ],
    }).results.single;

PlateState add(PlateState s, SavedFood f, [String meal = 'lunch']) => addDish(s, meal, f.name, const {}, f.macro, f.key, null, f);

void main() {
  final bar = SavedFood.packed(clifBar().savedNow(1)), per100 = SavedFood.packed(hits100());
  final chobani = SavedFood.custom(customFromForm(id: 'mh9ab123xyz', name: 'Chobani', m: const Macro(140, 12, 15, 0)));

  test('a food keys as food:<id>, adds its rounded macros, and a second add is a second serving', () {
    var s = add(emptyPlates, bar);
    expect(s.plates.single.items.single.key, 'food:off:0722252068484');
    expect(totals(s.plates.single).cal, 250);
    s = add(s, bar);
    expect(s.plates.single.items.single.qty, 2);
    expect(s.plates.single.items.single.food, same(bar));
    expect(stepItem(s, s.plates.single.id, bar.key, 1).plates.single.items.single.food, same(bar));
    expect(plateHalls(s.plates.single), isNull);
  });

  test('Clif Bar logs as an off row: its own source, 1 bar, every nutrient, servings = the plate quantity', () {
    var s = add(add(emptyPlates, bar), bar);
    final e = logEntries(s.plates.single, place: null, loggedAt: 'T').single;
    expect(e.source.toJson(), {'type': 'off', 'barcode': '0722252068484', 'productName': 'Chocolate Chip'});
    expect(e.servings, 2);
    expect(e.nutrition.toJson(), clifBar().nutrition.toJson());
    expect(e.nutrition.servingSize, '1 bar (68 g)');
    expect(e.nutrition.sodiumMg, greaterThan(0));
  });

  test('a per-100 g food logs as one 100 g serving and reads "per 100 g"', () {
    expect(per100.per100g, isTrue);
    expect(per100.serving, '100 g');
    final e = logEntries(add(emptyPlates, per100).plates.single, place: null, loggedAt: 'T').single;
    expect(e.servings, 1);
    expect(e.nutrition.servingSize, 'per 100g');
    expect(e.nutrition.calories, closeTo(367.6, 0.001));
  });

  test('a saved custom food logs under its custom_foods id, not the name-and-macros hash', () {
    final e = logEntries(add(emptyPlates, chobani).plates.single, place: null, loggedAt: 'T').single;
    expect(e.source.toJson(), {'type': 'custom', 'customFoodId': 'mh9ab123xyz', 'productName': 'Chobani'});
    expect([e.nutrition.calories, e.nutrition.proteinG, e.nutrition.totalCarbG, e.nutrition.totalFatG], [140, 12, 15, 0]);
  });

  test('a UMass Dining lookup logs as umass-menu with the dish and the hall it came from', () {
    final laksa = SavedFood.packed(PackagedFood(source: const UmassMenuSource(dishName: 'Laksa Noodle Bowl', hallTid: 4), productName: 'Laksa Noodle Bowl', nutrition: clifBar().nutrition, diet: 1));
    final e = logEntries(add(emptyPlates, laksa).plates.single, place: null, loggedAt: 'T').single;
    expect(e.source.toJson(), {'type': 'umass-menu', 'dishName': 'Laksa Noodle Bowl', 'hallTid': 4});
    expect(laksa.id, 'umass:Laksa Noodle Bowl|4');
  });

  test('the plate label sums a food whole: its sodium and fiber count, not only the four macros', () {
    final s = add(add(emptyPlates, bar), bar);
    final rows = plateLabelRows(s.plates.single);
    expect(rows.rows.firstWhere((r) => r.name == 'Sodium').value, '${(clifBar().nutrition.sodiumMg * 2).toStringAsFixed(1).replaceAll(RegExp(r'\.0$'), '')}mg');
  });

  test('Edit changes the name and four figures only; a custom keeps its id and a packaged food its source', () {
    final c = chobani.edited(name: 'Chobani Zero', cal: 120, p: 15, c: 10, f: 0);
    expect([c.id, c.name, c.macro.cal, c.at], ['mh9ab123xyz', 'Chobani Zero', 120, chobani.at]);
    final b = bar.edited(name: 'My bar', cal: 200, p: 6, c: 30, f: 5);
    expect([b.id, b.name, b.nutrition.servingSize, b.nutrition.sodiumMg, b.at], [bar.id, 'My bar', '1 bar (68 g)', clifBar().nutrition.sodiumMg, 1]);
    expect(b.source.toJson(), bar.source.toJson());
  });

  test('allergens read as M2 spells them, in Dietary preferences order', () {
    expect(bar.allergens, ['Soy']);
    expect(m2Allergens(['Soybeans', 'Milk', 'Crustaceans', 'Palm oil']), ['Milk', 'Shellfish', 'Soy']);
  });

  test('a nutrient the source did not give draws "–" on the label, not 0; one it gave draws its figure', () {
    final sparse = SavedFood.packed(mapOffSearch({
      'products': [
        {'code': '9', 'product_name': 'Sparse', 'nutriments': {'energy-kcal_100g': 300, 'proteins_100g': 5, 'fat_100g': 2}},
      ],
    }).results.single);
    final rows = {for (final r in labelRowsOf(sparse.nutrition).rows) r.name: r.value};
    expect(rows['Protein'], '5g');
    expect(rows['Total Fat'], '2g');
    expect(rows['Sodium'], '–');
    expect(rows['Dietary Fiber'], '–');
    expect(labelRowsOf(sparse.nutrition).rows.any((r) => r.right.startsWith('Fat cal.')), isFalse);
    // kept on the phone it is still "–": the blanks go in the saved row
    final back = SavedFood.packed(PackagedFood.fromJson(jsonDecode(jsonEncode(sparse.packed!.toJson())) as Map<String, dynamic>));
    expect(back.nutrition.blank, sparse.nutrition.blank);
    // Edit gives the four figures it asks for real values, and leaves the rest blank
    final e = sparse.edited(name: 'S', cal: 1, p: 1, c: 1, f: 1);
    expect(e.nutrition.blank, contains('sodiumMg'));
    expect(e.nutrition.blank, isNot(contains('proteinG')));
    // the vector-checked JSON does not carry them
    expect(sparse.nutrition.toJson().containsKey('blank'), isFalse);
  });
}
