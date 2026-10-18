// M2 R12c: a nutrient the feed leaves blank is unknown ("–"), never 0: parsed, summed, logged, exported.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/export.dart';
import 'package:udine/core/foodpro.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/bowl.dart';
import 'package:udine/core/m2/history.dart';
import 'package:udine/core/m2/log.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/m2/plate_label.dart';
import 'package:udine/core/types.dart';
import 'package:udine/ui/label_model.dart';
import 'support.dart';

MenuItem dish(String name) => dishes.firstWhere((d) => d.dishName == name);

PlateState plateOf(Iterable<String> names, String place) => names.fold(emptyPlates, (s, n) => addDish(s, 'lunch', n, {place: dish(n)}));

NutritionFacts unknown({bool cal = true}) => NutritionFacts(
    servingSize: '', calories: 0, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 0, dietaryFiberG: 0, sugarsG: 0, proteinG: 0,
    blank: {if (cal) 'calories', 'totalFatG', 'totalCarbG', 'proteinG'});

void main() {
  test('the feed parser: an empty data-calories is blank, a recorded 0 is not', () {
    String a(String cal, String protein) => '<a data-dish-name="X" data-calories="$cal" data-protein="$protein" data-total-fat="" data-total-carb="">X</a>';
    final blank = parseCategoryItems(a('', ''), 'c', MealPeriod.lunch, 1, '2026-10-08').single.nutrition;
    expect(blank.blank, containsAll(['calories', 'proteinG', 'totalFatG', 'totalCarbG']));
    final zero = parseCategoryItems(a('0', '0'), 'c', MealPeriod.lunch, 1, '2026-10-08').single.nutrition;
    expect(zero.blank, isNot(contains('calories')));
    expect(zero.blank, isNot(contains('proteinG')));
  });

  test('the five blank records have no macro; a recorded 0 keeps its 0', () {
    for (final n in ['20 oz Chai', '20 oz Iced Chai Latte', '20 oz Iced Tea', 'Add Crispy Chicken', 'Fountain Drink']) {
      final m = dish(n).macro;
      expect((m.cal, m.p, m.c, m.f), (null, null, null, null), reason: n);
    }
    final cap = dish('16 oz Cappuccino').macro;
    expect(cap.cal, 0);
  });

  test('plate totals: a nutrient is null only when every item leaves it unknown', () {
    final alone = totals(plateOf(['20 oz Chai'], 'c12').plates.single);
    expect((alone.cal, alone.p, alone.c, alone.f), (null, null, null, null));
    final both = totals(plateOf(['20 oz Chai', '16 oz Chai'], 'c12').plates.single);
    expect((both.cal, both.p, both.c, both.f), (211, 0, 52.7, 0));
  });

  test('the log keeps the unknown as null; a recorded value is a number', () {
    final rows = logEntries(plateOf(['20 oz Chai', '16 oz Chai'], 'c12').plates.single, place: 'c12', loggedAt: '2026-10-08T12:41:00.000', salt: () => 's');
    final j = [for (final r in rows) r.toJson()['nutrition'] as Map];
    expect([for (final n in j) [n['calories'], n['proteinG'], n['totalCarbG'], n['totalFatG']]], [
      [null, null, null, null],
      [211, 0, 52.7, 0],
    ]);
    final back = LogEntry.fromJson(rows.first.toJson());
    expect(back.nutrition.blank, containsAll(['calories', 'proteinG', 'totalCarbG', 'totalFatG']));
    expect(back.toJson(), rows.first.toJson());
  });

  test('the export writes null: JSON null, an empty CSV cell, never 0', () {
    final e = LogEntry(id: 'a', loggedAt: '2026-10-08T12:41:00.000', source: const UmassMenuSource(dishName: 'Fountain Drink', hallTid: 1), servings: 2, nutrition: unknown());
    final json = exportEntriesAsJson([e]);
    expect(RegExp(r'"calories": null').hasMatch(json), isTrue);
    expect(RegExp(r'"proteinG": null').hasMatch(json), isTrue);
    expect(exportEntriesAsCsv([e]).split('\n').last, endsWith('"2","","","",""'));
  });

  test('a day or meal of only unknowns is null; beside a known item it is the known sum', () {
    LogEntry e(String id, NutritionFacts n, [num q = 1]) => LogEntry(id: id, loggedAt: '2026-10-08T12:41:00.000', source: const UmassMenuSource(dishName: 'x', hallTid: 1), servings: q, nutrition: n);
    final known = NutritionFacts(servingSize: '', calories: 211, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 52.7, dietaryFiberG: 0, sugarsG: 0, proteinG: 0);
    final alone = loggedMeals([e('a', unknown())]).single.total, beside = loggedMeals([e('a', unknown()), e('b', known, 2)]).single.total;
    expect((alone.cal, alone.p, alone.c, alone.f), (null, null, null, null));
    expect((beside.cal, beside.p, beside.c, beside.f), (422, 0, 105.4, 0));
  });

  test('the plate\'s Full label shows – for everything when nothing is known, and only the unknown otherwise', () {
    final none = plateLabelRows(plateOf(['20 oz Chai'], 'c12').plates.single);
    expect(none.cal, '–');
    expect([for (final r in none.rows) if (r.name.isNotEmpty) r.value], everyElement('–'));
    final some = plateLabelRows(plateOf(['20 oz Chai', '16 oz Chai'], 'c12').plates.single);
    expect(some.cal, '211');
  });

  test('a builder offers an add-on with no calories recorded', () {
    final w = board.places.firstWhere((p) => p.name == 'Whitmore Café').key;
    final parts = <String>{
      for (final MapEntry(key: iso, value: places) in board.days.entries)
        for (final MapEntry(key: meal, value: sts) in (places[w] ?? {}).entries)
          for (var si = 0; si < sts.length; si++)
            if (synOf(board, iso, w, meal, si) case final y?) for (final p in y.parts) p.dishName,
    };
    expect(parts, contains('Add Crispy Chicken'));
  });

  test('a bowl of unknown parts is unknown; with one known part it sums the known', () {
    final chicken = dish('Add Crispy Chicken'), chai = dish('16 oz Chai');
    final alone = bowlDish(chicken, const [], place: 'c12').item.nutrition;
    expect(alone.blank, containsAll(['calories', 'proteinG', 'totalCarbG', 'totalFatG']));
    final mixed = bowlDish(chicken, [(chai, 1)], place: 'c12').item.nutrition;
    expect(mixed.blank, isNot(contains('calories')));
    expect(mixed.calories, 211);
  });

  test('fc and f1 draw – for unknown', () {
    expect((fc(null), f1(null), fg(null), fg(0), fc(0)), ('–', '–', '–', '0g', '0'));
  });
}
