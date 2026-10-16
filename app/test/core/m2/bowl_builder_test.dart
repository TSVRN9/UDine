// The bowl builder's state (M2 src.html stepPart / bowlNow / footHTML / buildMid / badd) and what a bowl does on a plate and in the log.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/bowl.dart';
import 'package:udine/core/m2/bowl_builder.dart';
import 'package:udine/core/m2/log.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/types.dart';
import 'support.dart';

({BowlSpec spec, MenuItem Function(String) part}) brisket() {
  final ss = board.days[today]!['W']!['lunch']!, si = ss.indexWhere((s) => s.name == 'Noodle Bowl'), ds = ss[si].dishes;
  final di = ds.indexWhere((x) => x.dishName == 'Beef Brisket Noodle Bowl');
  return (spec: BowlSpec.build(buildOf(board, today, 'W', 'lunch', si, di)!, place: 'W', meal: 'lunch'), part: (n) => ds.firstWhere((x) => x.dishName == n));
}

int idx(BowlSpec s, String n) => s.parts.indexWhere((x) => x.dishName == n);

BowlSpec deli() {
  final ss = board.days[today]!['F']!['lunch']!;
  for (var si = 0; si < ss.length; si++) {
    if (synOf(board, today, 'F', 'lunch', si) case final y? when y.label == 'Deli Bar') return BowlSpec.syn(y);
  }
  throw StateError('no Deli Bar');
}

BowlSpec pho() {
  for (final MapEntry(key: iso, value: places) in board.days.entries) {
    for (final MapEntry(key: place, value: meals) in places.entries) {
      for (final MapEntry(key: meal, value: sts) in meals.entries) {
        for (var si = 0; si < sts.length; si++) {
          if (synOf(board, iso, place, meal, si) case final y? when y.pho && !isCafe(place)) return BowlSpec.syn(y);
        }
      }
    }
  }
  throw StateError('no pho bar');
}

void main() {
  group('stepPart (M2 stepPart)', () {
    test('+ goes 0, 1, 2; - goes 2, 1, 1/2, 0; + on 1/2 goes to 1', () {
      final b = brisket().spec, i = idx(b, 'Hard Boiled Egg');
      var sel = <int, num>{};
      qty() => sel[i] ?? 0;
      final up = <num>[], down = <num>[];
      for (var k = 0; k < 2; k++) {
        sel = stepPart(b, sel, i, 1);
        up.add(qty());
      }
      for (var k = 0; k < 3; k++) {
        sel = stepPart(b, sel, i, -1);
        down.add(qty());
      }
      expect(up, [1, 2]);
      expect(down, [1, 0.5, 0]);
      expect(sel.containsKey(i), isFalse);
      expect(stepPart(b, {i: 0.5}, i, 1)[i], 1);
    });

    test('a pho bar takes one base at a time: + on another broth puts the last one back, - puts it back', () {
      final y = pho(), a = y.syn!.choices[0], c = y.syn!.choices[1];
      final ia = y.parts.indexOf(a), ic = y.parts.indexOf(c);
      var sel = stepPart(y, {}, ia, 1);
      sel = stepPart(y, sel, ia, 1);
      expect(sel, {ia: 1});
      sel = stepPart(y, sel, ic, 1);
      expect(sel, {ic: 1});
      expect(bowlNow(y, sel).name, c.dishName);
      expect(stepPart(y, sel, ic, -1), isEmpty);
    });
  });

  group('the bowl the sheet shows', () {
    test('nothing chosen is the plain dish; Add reads the sum as parts are chosen', () {
      final b = brisket();
      expect(bowlNow(b.spec, {}).item.nutrition.calories, b.part('Beef Brisket Noodle Bowl').nutrition.calories);
      expect(bowlNow(b.spec, {}).parts, isEmpty);
      final sel = stepPart(b.spec, stepPart(b.spec, {}, idx(b.spec, 'Hard Boiled Egg'), 1), idx(b.spec, 'Steamed Bok Choy'), 1);
      expect(bowlNow(b.spec, sel).item.nutrition.calories, 340);
      expect(withLine(bowlNow(b.spec, sel).parts), 'with Hard Boiled Egg, Steamed Bok Choy');
    });

    test('a synthetic base keeps Add off at 0 and a pho until a base is picked; a natural base is always addable', () {
      final d = deli(), p = pho(), b = brisket().spec;
      expect(addOff(d, bowlNow(d, {})), isTrue);
      expect(addOff(d, bowlNow(d, {0: 1})), isFalse);
      final other = p.parts.indexWhere((x) => !p.syn!.choices.contains(x));
      expect(addOff(p, bowlNow(p, other < 0 ? {} : {other: 1})), isTrue);
      expect(addOff(p, bowlNow(p, {p.parts.indexOf(p.syn!.choices.first): 1})), isFalse);
      expect(addOff(b, bowlNow(b, {})), isFalse);
    });

    test('a bowl on the plate reopens with its parts chosen', () {
      final b = brisket().spec, sel = {idx(b, 'Hard Boiled Egg'): 2, idx(b, 'Steamed Bok Choy'): 0.5};
      expect(selOf(b, bowlNow(b, sel)), sel);
      final y = pho(), c = y.syn!.choices.last, s2 = {y.parts.indexOf(c): 1, if (y.parts.length > 2) y.parts.indexWhere((x) => !y.syn!.choices.contains(x)): 1};
      expect(selOf(y, bowlNow(y, s2)), s2);
    });

    test('the resting height ends under the fourth add-in (or the last), above the foot', () {
      expect(buildMid(grab: 22, rowsBottom: [100, 156, 212, 268, 324], foot: 74, winH: 844, top: 30), 22 + 268 + 74 + 8);
      expect(buildMid(grab: 22, rowsBottom: [100, 156], foot: 74, winH: 844, top: 30), 22 + 156 + 74 + 8);
      expect(buildMid(grab: 22, rowsBottom: [100, 156, 212, 268], foot: 74, winH: 300, top: 30), 300 - 30 - 8);
    });
  });

  group('on the plate', () {
    test('a plain Add (a base, no parts) is the plain dish; a bowl is its own item, two bowls of one base are two items', () {
      final b = brisket();
      var s = addBowl(emptyPlates, 'lunch', b.spec, bowlNow(b.spec, {}), 'W');
      expect(s.plates.single.items.single.key, dishKey('Beef Brisket Noodle Bowl'));
      expect(s.plates.single.items.single.bowl, isNull);
      expect(totals(s.plates.single).cal, 404 - 2 * 93);
      final egg = idx(b.spec, 'Hard Boiled Egg'), bok = idx(b.spec, 'Steamed Bok Choy');
      s = addBowl(s, 'lunch', b.spec, bowlNow(b.spec, {egg: 1}), 'W');
      s = addBowl(s, 'lunch', b.spec, bowlNow(b.spec, {egg: 1, bok: 1}), 'W');
      s = addBowl(s, 'lunch', b.spec, bowlNow(b.spec, {bok: 1, egg: 1}), 'W'); // the same bowl again: its stepper goes up
      final it = s.plates.single.items;
      expect(it.length, 3);
      expect([for (final i in it) i.qty], [1, 1, 2]);
      expect(it[2].bowl!.bowl.parts.length, 2);
      expect(it[2].name, 'Beef Brisket Noodle Bowl');
    });

    test('Update replaces the bowl where it is; a twin already on the plate takes its servings', () {
      final b = brisket().spec, egg = idx(b, 'Hard Boiled Egg'), bok = idx(b, 'Steamed Bok Choy');
      var s = addBowl(emptyPlates, 'lunch', b, bowlNow(b, {egg: 1}), 'W');
      s = addBowl(s, 'lunch', b, bowlNow(b, {bok: 1}), 'W');
      s = stepItem(s, s.plates.single.id, s.plates.single.items[0].key, 1);
      final id = s.plates.single.id, first = s.plates.single.items[0], second = s.plates.single.items[1];
      var u = updateBowl(s, id, first.key, bowlNow(b, {egg: 1, bok: 1}), b, 'W');
      expect(u.plates.single.items.map((i) => i.qty), [2, 1]);
      expect(u.plates.single.items[0].key, isNot(first.key));
      expect(withLine(u.plates.single.items[0].bowl!.bowl.parts), 'with Hard Boiled Egg, Steamed Bok Choy');
      u = updateBowl(u, id, second.key, bowlNow(b, {egg: 1, bok: 1}), b, 'W');
      expect(u.plates.single.items.length, 1);
      expect(u.plates.single.items.single.qty, 3);
    });

    test('a bowl and a custom food on one plate: two keys, two logged rows, the bowl with its parts, the totals right (#589 review)', () {
      final b = brisket().spec, egg = idx(b, 'Hard Boiled Egg'), bok = idx(b, 'Steamed Bok Choy');
      final bowl = bowlNow(b, {egg: 1, bok: 1});
      var s = addBowl(emptyPlates, 'lunch', b, bowl, 'W');
      s = addDish(s, 'lunch', 'Chobani', {}, const Macro(120, 12, 9, 4));
      s = stepItem(s, s.plates.single.id, bowl.key, 1);
      final p = s.plates.single, keys = [for (final i in p.items) i.key];
      expect(keys.toSet().length, 2);
      expect(keys[0], startsWith('bowl:'));
      expect(keys[1], startsWith('custom:'));
      final rows = logEntries(p, place: 'W', loggedAt: '2026-10-08T12:41:00', salt: () => 'x');
      expect(rows.length, 2);
      final src = rows[0].source as UmassMenuSource;
      expect(src.dishName, 'Beef Brisket Noodle Bowl');
      expect([for (final x in src.parts!) (x.name, x.servings)], [('Hard Boiled Egg', 1), ('Steamed Bok Choy', 1)]);
      expect(rows[0].servings, 2);
      expect(rows[0].nutrition.calories, bowl.item.nutrition.calories);
      expect(rows[1].source, isA<CustomSource>());
      expect(rows[1].servings, 1);
      final t = totals(p);
      expect(t.cal, 2 * bowl.item.nutrition.calories + 120);
      expect(rows.fold<num>(0, (a, e) => a + e.nutrition.calories * e.servings), t.cal);
      // a plain dish logs with no parts at all
      final plain = addDish(emptyPlates, 'lunch', 'Beef Brisket Noodle Bowl', {'W': b.base!});
      expect((logEntries(plain.plates.single, place: 'W', loggedAt: 'x', salt: () => 'x').single.source as UmassMenuSource).parts, isNull);
    });
  });
}
