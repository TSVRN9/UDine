import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/dish_sheet.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/m2/plate_label.dart';
import 'package:udine/ui/label_model.dart';
import 'support.dart';

MenuItem dish(String name) => dishes.firstWhere((d) => d.dishName == name);
PlateState benchmark() {
  var s = emptyPlates;
  for (final n in ['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh', 'Golden BBQ Chicken Thigh']) {
    s = addDish(s, 'lunch', n, {'W': dish(n)});
  }
  return s;
}

void main() {
  final plate = benchmark().plates.single;

  test('the benchmark plate (Beef Brisket Noodle Bowl x1, Golden BBQ Chicken Thigh x2) is 404 cal and 38.9 g of protein', () {
    final t = totals(plate);
    expect((t.cal, (t.p * 10).round() / 10), (404, 38.9));
    final l = plateLabelRows(plate);
    expect(l.cal, '404');
    expect(l.rows.firstWhere((r) => r.name == 'Protein').value, '38.9g');
    // NOTES "Dish detail and labels": the benchmark plate is 404 cal and 1,913.7 mg sodium (83%)
    final sod = l.rows.firstWhere((r) => r.name == 'Sodium');
    expect((sod.value, sod.right), ('1913.7mg', '83%'));
  });

  test('M2 openPlateLabel: each nutrient is the sum of the dishes x quantity, with no serving row and no published %DV', () {
    final bowl = dish('Beef Brisket Noodle Bowl').nutrition, thigh = dish('Golden BBQ Chicken Thigh').nutrition;
    final l = plateLabelRows(plate);
    expect(l.serving, isNull);
    final sod = bowl.sodiumMg + 2 * thigh.sodiumMg;
    final row = l.rows.firstWhere((r) => r.name == 'Sodium');
    expect(row.value, '${f1(sod)}mg');
    expect(row.right, '${(sod / 2300 * 100).round()}%'); // computed from the FDA base, never the dish's own published value
    expect(l.rows.firstWhere((r) => r.name == 'Total Fat').value, '${f1(bowl.totalFatG + 2 * thigh.totalFatG)}g');
  });

  test('a plate of one dish at 1 reads as that dish\'s label, minus the serving row', () {
    final one = addDish(emptyPlates, 'lunch', 'Golden BBQ Chicken Thigh', {'W': dish('Golden BBQ Chicken Thigh')}).plates.single;
    final got = plateLabelRows(one), want = labelRows(dish('Golden BBQ Chicken Thigh'));
    expect(got.cal, want.cal);
    expect([for (final r in got.rows) r.value], [for (final r in want.rows) r.value]);
  });

  test('a custom food adds only its calories, fat, carbs and protein; the rest of the label does not move', () {
    var s = benchmark();
    s = addDish(s, 'lunch', 'My bar', {}, const Macro(200, 10, 20, 5));
    final base = plateLabelRows(plate), more = plateLabelRows(s.plates.single);
    expect(more.cal, '604');
    expect(more.rows.firstWhere((r) => r.name == 'Sodium').value, base.rows.firstWhere((r) => r.name == 'Sodium').value);
    expect(more.rows.firstWhere((r) => r.name == 'Protein').value, '48.9g');
  });
}
