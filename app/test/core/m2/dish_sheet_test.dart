import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/dish_sheet.dart';
import 'package:udine/core/types.dart';
import 'package:udine/ui/label_model.dart';
import 'support.dart';

final labelVectors = (jsonDecode(File('test/core/m2/label_vectors.json').readAsStringSync()) as Map)['vectors'] as List;
MenuItem dish(String name) => dishes.firstWhere((d) => d.dishName == name);
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
    final unscored = dishes.firstWhere((d) => d.health == null && d.carbon == null && d.diet & 31 == 0);
    final scored = dishes.firstWhere((d) => d.health != null && d.carbon != null);
    test('an unscored, unmarked dish has no row at all, whatever the toggles', () {
      expect(sheetMarks(unscored, both), isNull);
      expect(sheetMarks(unscored, off), isNull);
    });
    test('a dish with a healthfulness number but no H code draws no healthfulness and leaves no slot', () {
      final raw = dishes.firstWhere((d) => d.health == null && d.carbon != null && d.diet & 31 == 0);
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
      MenuItem withTags(List<String> tags) => MenuItem(
          dishName: 'x', category: '', mealPeriod: MealPeriod.lunch, hallTid: 1, date: today, nutrition: dish('Golden BBQ Chicken Thigh').nutrition,
          allergens: const [], dietTags: tags);
      expect(sheetMarks(withTags(['Vegetarian', 'Plant Based', 'Halal', 'Local', 'Sustainable']), off)!.marks, ['plant', 'halal', 'local', 'sus']);
      expect(sheetMarks(withTags(['Vegetarian']), off)!.marks, ['veg']);
    });
  });

  group('labelRows match M2\'s labelHTML (%DV published, computed from the FDA base, or blank)', () {
    for (final v in labelVectors) {
      test(v['dish'], () {
        final d = dish(v['dish']);
        final got = labelRows(d);
        expect(got.cal, v['cals']);
        expect(got.rows.map((r) => [r.left, r.right]).toList(), v['rows']);
      });
    }
    test('the serving row only when the dish has a serving; the Fat cal. row only when the feed has it', () {
      final d = dish('Add Crispy Chicken');
      expect(labelRows(d).serving, '3 oz');
      expect(labelRows(d).rows[0].right, '% Daily Value*');
      expect(labelRows(dish('Golden BBQ Chicken Thigh')).rows[0].right, startsWith('Fat cal.'));
      expect(labelRows(dish('Golden BBQ Chicken Thigh')).serving, '1 each');
    });
  });

  test('fc groups thousands and f1 drops a trailing .0', () {
    expect((fc(1234.4), fc(93), f1(13.3), f1(7.0)), ('1,234', '93', '13.3', '7'));
  });
}
