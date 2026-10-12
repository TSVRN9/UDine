import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/dish_sheet.dart';
import 'package:udine_bakeoff/logic/fixture.dart';
import 'support.dart';

final labelVectors = (jsonDecode(File('test/label_vectors.json').readAsStringSync()) as Map)['vectors'] as List;
Dish dish(String name) => fx.dishes.firstWhere((d) => d.name == name);
const off = (health: false, carbon: false), both = (health: true, carbon: true);

void main() {
  group('restingSnap (M2 dishMid): the resting height ends just under the label\'s Calories row', () {
    const win = (winH: 800.0, top: 24.0);
    test('is the grab strip, the content down to the bottom of Calories, and the 6 dp sliver', () => expect(restingSnap(calBottom: 410, grab: 22, winH: win.winH, top: win.top), 22 + 410 + 6));
    test('never exceeds the top detent (winH - top - 8)', () => expect(restingSnap(calBottom: 900, grab: 22, winH: win.winH, top: win.top), 800 - 24 - 8));
    test('moves with the content: a taller name pushes the Calories row, and the snap, down', () =>
        expect(restingSnap(calBottom: 450, grab: 22, winH: win.winH, top: win.top), greaterThan(restingSnap(calBottom: 410, grab: 22, winH: win.winH, top: win.top))));
  });

  group('sheetMarks: the patch row is exactly what the dish and the toggles give (Review Focus 5)', () {
    final unscored = fx.dishes.firstWhere((d) => d.health == null && d.carbon == null && d.diet & 31 == 0);
    final scored = fx.dishes.firstWhere((d) => d.health != null && d.carbon != null);
    test('an unscored, unmarked dish has no row at all, whatever the toggles', () {
      expect(sheetMarks(unscored, both), isNull);
      expect(sheetMarks(unscored, off), isNull);
    });
    test('a dish with a healthfulness number but no H code draws no healthfulness and leaves no slot', () {
      final raw = fx.dishes.firstWhere((d) => d.health == null && d.carbon != null && d.diet & 31 == 0);
      expect(sheetMarks(raw, (health: true, carbon: false)), isNull);
      final r = sheetMarks(raw, both)!;
      expect(r.marks, isEmpty);
      expect((r.health, r.carbon), (null, raw.carbon));
    });
    test('the score slots follow the toggles and only exist when the dish is scored', () {
      expect(sheetMarks(scored, off)?.health, isNull);
      final h = sheetMarks(scored, (health: true, carbon: false))!;
      expect((h.health, h.carbon), (scored.health, null));
      expect(sheetMarks(scored, (health: false, carbon: true))!.carbon, scored.carbon);
    });
    test('plant based wins over vegetarian; halal, local and sustainable follow in M2\'s order', () {
      Dish withDiet(int diet) => Dish(key: 'x', name: 'x', station: '', cal: 1, p: 1, c: 1, f: 1, diet: diet, serving: '', nutrition: const {}, ingredients: '', allergens: const [], health: null, carbon: null, price: null);
      expect(sheetMarks(withDiet(1 | 2 | 4 | 8 | 16), off)!.marks, ['plant', 'halal', 'local', 'sus']);
      expect(sheetMarks(withDiet(1), off)!.marks, ['veg']);
    });
  });

  group('labelRows match M2\'s labelHTML (%DV published, computed from the FDA base, or blank)', () {
    for (final v in labelVectors) {
      test(v['dish'], () {
        final d = dish(v['dish']);
        final got = labelRows(d.nutrition, d.cal, d.serving);
        expect(got.cal, v['cals']);
        expect(got.rows.map((r) => [r.left, r.right]).toList(), v['rows']);
      });
    }
    test('the serving row only when the dish has a serving; the Fat cal. row only when the feed has it', () {
      final d = dish('Add Crispy Chicken');
      expect(labelRows(d.nutrition, d.cal, '').serving, isNull);
      expect(labelRows(d.nutrition, d.cal, '').rows[0].right, '% Daily Value*');
      expect(labelRows(dish('Golden BBQ Chicken Thigh').nutrition, 93, '1 each').serving, '1 each');
    });
  });

  test('fc groups thousands and f1 drops a trailing .0', () {
    expect((fc(1234.4), fc(93), f1(13.3), f1(7.0)), ('1,234', '93', '13.3', '7'));
  });
}
