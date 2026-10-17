// M2's bowl rules (src.html buildOf / synOf / baseOf / phoOf / bowlDish) against vectors.json and the recorded 15 days.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/bowl.dart';
import 'package:udine/core/m2/plate.dart';
import 'support.dart';

typedef Day = ({String iso, String place, String meal, int si, Station st});

/// Every station-day on the board, in book order.
Iterable<Day> stationDays([bool Function(String place)? only]) sync* {
  for (final MapEntry(key: iso, value: places) in board.days.entries) {
    for (final MapEntry(key: place, value: meals) in places.entries) {
      if (only != null && !only(place)) continue;
      for (final MapEntry(key: meal, value: sts) in meals.entries) {
        for (var si = 0; si < sts.length; si++) {
          yield (iso: iso, place: place, meal: meal, si: si, st: sts[si]);
        }
      }
    }
  }
}

Syn? synOfDay(Day d) => synOf(board, d.iso, d.place, d.meal, d.si);

void main() {
  test('synthetic bases: exactly the 120 station-days in vectors.json, each named for its station', () {
    final got = {for (final d in stationDays()) if (synOfDay(d) case final y?) '${d.iso}|${d.place}|${d.meal}|${d.st.name}|${y.label}'};
    final want = {for (final v in vectors['synthetic'] as List) '${v['day']}|${v['place']}|${v['meal']}|${v['station']}|${v['label']}'};
    expect(want.length, 120);
    expect(got.difference(want), isEmpty);
    expect(want.difference(got), isEmpty);
  });

  test('no by-the-pound bar gets a base (owner, 2026-10-13): Harvest Market, Roots', () {
    for (final d in stationDays()) {
      if (RegExp(r'/\s*LB\b', caseSensitive: false).hasMatch(d.st.name)) expect(synOfDay(d), isNull, reason: '${d.place} ${d.st.name}');
    }
    expect({for (final d in stationDays()) if (synOfDay(d) != null) synOfDay(d)!.label}, {'Salad Bar', 'Deli Bar', 'Noodle Bowl'});
  });

  test('every hall Noodle Bowl station-day resolves exactly one base: the 82 in vectors.json, pho bars named for the broth', () {
    final want = {for (final v in vectors['bowlbase'] as List) '${v['day']}|${v['place']}|${v['meal']}': v};
    expect(want.length, 82);
    final seen = <String>[];
    for (final d in stationDays((p) => !isCafe(p))) {
      if (stName(d.st.name) != 'Noodle Bowl') continue;
      final v = want['${d.iso}|${d.place}|${d.meal}']!;
      final y = synOfDay(d), b = baseOf(board, d.iso, d.place, d.meal, d.si);
      final builds = [for (var di = 0; di < d.st.dishes.length; di++) if (buildOf(board, d.iso, d.place, d.meal, d.si, di) != null || (d.st.dishes.length == 1 && identical(d.st.dishes[di], b))) di];
      expect((y != null ? 1 : 0) + builds.length, 1, reason: '${d.iso} ${d.place} ${d.meal}');
      expect(y != null, v['synthetic']);
      expect(y != null ? y.label : b!.dishName, v['base'], reason: '${d.iso} ${d.place} ${d.meal}');
      if (y != null) expect([for (final c in y.choices) c.dishName], v['choices']);
      seen.add('${d.iso} ${d.place} ${d.meal}: ${v['base']}${y != null ? ' (pho bar: ${v['choices']})' : ''}');
    }
    expect(seen.length, 82);
    // ignore: avoid_print
    seen.forEach(print);
  });

  test('the benchmark: Beef Brisket Noodle Bowl builds from Worcester lunch, and its plain + is still the 404 cal plate', () {
    final d = stationDays((p) => p == 'W').firstWhere((d) => d.iso == today && d.meal == 'lunch' && d.st.name == 'Noodle Bowl');
    final di = d.st.dishes.indexWhere((x) => x.dishName == 'Beef Brisket Noodle Bowl');
    final b = buildOf(board, d.iso, d.place, d.meal, d.si, di)!;
    expect(b.head, 'Noodle Bowl');
    expect(b.base.dishName, 'Beef Brisket Noodle Bowl');
    expect(b.parts, isNotEmpty);
    expect(b.base.macro.cal + 2 * 93, 404); // the benchmark plate (brisket + 2 Golden BBQ): the plain + adds the dish as it is
    expect(buildOf(board, d.iso, d.place, d.meal, d.si, di == 0 ? 1 : 0), isNull); // a topping is not a base
  });

  test('a café builds only from its Add-ons / Toppings, and only with dishes that have nutrition', () {
    var built = 0;
    for (final d in stationDays(isCafe)) {
      final meals = board.days[d.iso]![d.place]![d.meal]!;
      final adds = [for (var i = 0; i < meals.length; i++) if (RegExp(r'^(Add-ons|Toppings)$').hasMatch(meals[i].name.trim())) i];
      for (var di = 0; di < d.st.dishes.length; di++) {
        final b = buildOf(board, d.iso, d.place, d.meal, d.si, di);
        if (b == null) continue;
        built++;
        expect(adds, isNotEmpty);
        expect(adds.contains(d.si), isFalse);
        expect(b.parts.every((p) => p.nutrition.calories > 0), isTrue);
        expect(b.parts.length, [for (final i in adds) ...meals[i].dishes.where((x) => x.nutrition.calories > 0)].length);
      }
    }
    expect(built, greaterThan(0));
  });

  group('bowlDish: sums, price, key', () {
    final w = stationDays((p) => p == 'W').firstWhere((d) => d.iso == today && d.meal == 'lunch' && d.st.name == 'Noodle Bowl');
    MenuItem dish(String n) => w.st.dishes.firstWhere((x) => x.dishName == n);
    test('a base and parts sum calories (rounded) and grams; same parts in any order are the same key', () {
      final a = bowlDish(dish('Beef Brisket Noodle Bowl'), [(dish('Hard Boiled Egg'), 1), (dish('Steamed Bok Choy'), 1)], place: 'W');
      final b = bowlDish(dish('Beef Brisket Noodle Bowl'), [(dish('Steamed Bok Choy'), 1), (dish('Hard Boiled Egg'), 1)], place: 'W');
      final c = bowlDish(dish('Beef Brisket Noodle Bowl'), [(dish('Hard Boiled Egg'), 2)], place: 'W');
      expect(a.key, b.key);
      expect(a.key, isNot(c.key));
      expect(a.key, isNot(dishKey('Beef Brisket Noodle Bowl')));
      expect(a.name, 'Beef Brisket Noodle Bowl');
      expect(a.item.nutrition.calories, 340);
      expect(withLine(a.parts), 'with Hard Boiled Egg, Steamed Bok Choy');
      expect(withLine([(dish('Hard Boiled Egg'), 0.5), (dish('Steamed Bok Choy'), 2)]), 'with ½ × Hard Boiled Egg, 2 × Steamed Bok Choy');
    });
  });

  group('M2 plate vectors with bowl ops', () {
    for (final v in (vectors['plate'] as List).where((v) => (v['ops'] as List).any((o) => o[0] == 'bowl'))) {
      test(v['name'], () {
        var s = emptyPlates;
        final bowls = <String, Bowl>{};
        for (final op in v['ops'] as List) {
          if (op[0] == 'add') {
            s = addDish(s, op[1], op[2], {for (final p in op[3]) p as String: servingOn(board, today, p, op[1], dishKey(op[2]))!});
            continue;
          }
          final meal = op[1] as String, place = op[2] as String, parts = op[5] as List;
          Day? find(String n) {
            for (final d in stationDays((p) => p == place)) {
              if (d.iso == today && plateMeal(board, place, d.meal, board.clock) == meal && d.st.dishes.any((x) => x.dishName == n)) return d;
            }
            return null;
          }

          MenuItem part(String n) => find(n)!.st.dishes.firstWhere((x) => x.dishName == n);
          final sel = [for (final p in parts) (part(p[0] as String), p[1] as num)];
          final Bowl bd;
          if (op[3] != null) {
            bd = bowlDish(part(op[3] as String), sel, place: place);
          } else {
            final d0 = find(parts[0][0] as String)!, y = synOf(board, today, place, d0.meal, d0.si)!;
            bd = synBowl(y, sel, place: place);
          }
          bowls[bd.key] = bd;
          s = addDish(s, meal, bd.name, {place: bd.item}, null, bd.key);
        }
        final byKey = {for (final p in s.plates) for (final i in p.items) i.key: i};
        expect(
          [
            for (final p in s.plates)
              {
                'meal': p.meal,
                'halls': plateHalls(p),
                'label': plateLabel(board, p),
                'items': [
                  for (final i in p.items)
                    [
                      i.name, i.qty,
                      if (bowls[i.key] case final b?) {'parts': [for (final (x, q) in b.parts) [x.dishName, q]], 'cal': b.item.nutrition.calories, 'price': b.item.price},
                    ],
                ],
                'totals': {for (final e in {'cal': totals(p).cal, 'p': totals(p).p, 'c': totals(p).c, 'f': totals(p).f}.entries) e.key: (e.value * 10).round() / 10},
              },
          ],
          v['plates'],
        );
        expect(s.front, v['front']);
        expect(byKey.length, greaterThan(0));
      });
    }
  });
}
