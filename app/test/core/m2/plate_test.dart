import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/ui/label_model.dart';
import 'support.dart';

Map<String, MenuItem> refsFor(String meal, String name, List places) =>
    {for (final p in places) p as String: servingOn(board, today, p, meal, dishKey(name))!};
double r1(num x) => (x * 10).round() / 10;

void main() {
  group('plate ops match M2', () {
    for (final v in vectors['plate'] as List) {
      // Bowl ops (M2 R10 §4) are run in bowl_test.dart.
      if ((v['ops'] as List).any((op) => op[0] == 'bowl')) continue;
      // M2 round 12c: a blank nutrient stays blank in the totals; green with docs/briefs/m2-round-12-13.md Task 2, which removes this skip
      test(v['name'], skip: v['name'] == 'blank calories (20 oz Chai): the plate has no calorie total' ? 'M2 round 12c missing nutrients: m2-round-12-13 Task 2' : false, () {
        var s = emptyPlates;
        for (final op in v['ops'] as List) {
          if (op[0] == 'add') {
            s = addDish(s, op[1], op[2], refsFor(op[1], op[2], op[3]));
          } else if (op[0] == 'custom') {
            s = addDish(s, op[1], op[2], {}, Macro(op[3]['cal'], op[3]['p'], op[3]['c'], op[3]['f']));
          } else {
            s = stepItem(s, s.plates[op[1] as int].id, dishKey(op[2]), op[3]);
          }
        }
        expect(
          s.plates.map((p) {
            final t = totals(p);
            return {
              'meal': p.meal,
              'halls': plateHalls(p),
              'label': plateLabel(board, p),
              'items': p.items.map((i) => [i.name, i.qty]).toList(),
              'totals': {'cal': r1(t.cal), 'p': r1(t.p), 'c': r1(t.c), 'f': r1(t.f)},
            };
          }).toList(),
          v['plates'],
        );
        expect(s.front, v['front']);
      });
    }
  });

  test('is pure: the input state is not mutated', () {
    final a = addDish(emptyPlates, 'lunch', 'Golden BBQ Chicken Thigh', refsFor('lunch', 'Golden BBQ Chicken Thigh', ['W']));
    final before = a.plates.single.items.map((i) => [i.name, i.qty, i.refs.keys.toList()]).toList();
    stepItem(a, a.plates[0].id, dishKey('Golden BBQ Chicken Thigh'), -1);
    expect(a.plates.single.items.map((i) => [i.name, i.qty, i.refs.keys.toList()]).toList(), before);
    expect(emptyPlates.plates, isEmpty);
    expect([emptyPlates.front, emptyPlates.nextId], [0, 1]);
  });

  test('1/2 then down removes the item, the empty plate, and keeps front in range (Review Focus 3)', () {
    var s = addDish(emptyPlates, 'lunch', 'Golden BBQ Chicken Thigh', refsFor('lunch', 'Golden BBQ Chicken Thigh', ['W']));
    final id = s.plates[0].id, k = dishKey('Golden BBQ Chicken Thigh');
    s = stepItem(s, id, k, -1);
    expect(s.plates[0].items[0].qty, 0.5);
    s = stepItem(s, id, k, -1);
    expect(s.plates, isEmpty);
    expect(s.front, 0);
  });

  test("macros come from the plate's hall, not the first ref (Review Focus 1)", () {
    final brisket = refsFor('lunch', 'Beef Brisket Noodle Bowl', ['B', 'W']); // B inserted before W
    final bbq = refsFor('lunch', 'Golden BBQ Chicken Thigh', ['W']);
    expect(brisket.keys.toList(), ['B', 'W']);
    expect(brisket['B']!.macro.cal, isNot(brisket['W']!.macro.cal));
    final s = addDish(addDish(emptyPlates, 'lunch', 'Beef Brisket Noodle Bowl', brisket), 'lunch', 'Golden BBQ Chicken Thigh', bbq);
    expect(plateHalls(s.plates[0]), ['W']);
    expect(totals(s.plates[0]).cal, brisket['W']!.macro.cal + bbq['W']!.macro.cal);
    expect(totals(s.plates[0], 'B').cal, brisket['B']!.macro.cal + bbq['W']!.macro.cal);
    expect(totals(s.plates[0], 'B').cal, isNot(totals(s.plates[0]).cal));
  });

  test('fq, plateMeal, rowCode', () {
    expect([0.5, 1.0, 1.5, 2.0].map(fq).toList(), ['½', '1', '1½', '2']);
    final noon = DateTime.parse(vectors['clock']);
    expect(plateMeal(board, 'c12', 'all', noon), 'lunch');
    expect(plateMeal(board, 'W', 'grab', noon), 'grab');
    final s = addDish(emptyPlates, 'lunch', 'Golden BBQ Chicken Thigh', refsFor('lunch', 'Golden BBQ Chicken Thigh', ['W']));
    final k = dishKey('Golden BBQ Chicken Thigh');
    expect(rowCode(s, 'lunch', k, 'W'), 1);
    expect(rowCode(s, 'lunch', 'something else', 'W'), 0);
    expect(rowCode(s, 'lunch', 'something else', 'B'), -1);
  });
}
