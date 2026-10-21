// M2 R12d: every dining commons has a Fountain Drink, a last Beverages station at each meal but Grab 'N Go; no preference hides it, it has no marks.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/menu_view.dart';
import 'package:udine/core/m2/search.dart';
import 'package:udine/screens/hall/hall_controller.dart' show mealsOfItems;
import 'package:udine/core/m2/plate.dart' show emptyPlates;
import 'support.dart';

final _now = DateTime.parse('2026-10-08T12:41:00-04:00');
SearchResult run(Board b, String q) => runSearch(SearchIndex(b, _now), query: q, lenses: const {}, favorites: const {}, plate: emptyPlates);

/// The fixture's hall menus run back through the loader's own path (feed items -> stations), as a hall.
Board withFountain() => Board(
      clock: board.clock, places: board.places, hours: board.hours, grab: board.grab, events: board.events,
      days: {
        for (final MapEntry(key: iso, value: places) in board.days.entries)
          iso: {for (final MapEntry(key: p, value: meals) in places.entries) p: isCafe(p) ? meals : mealsOfItems([for (final s in meals.values.expand((s) => s)) ...s.dishes], hall: true)},
      },
    );

void main() {
  test('every hall meal but Grab N Go ends with a Beverages station of the one Fountain Drink; days the feed leaves empty stay empty', () {
    final b = withFountain();
    var stationDays = 0;
    for (final MapEntry(key: iso, value: places) in b.days.entries) {
      for (final h in halls) {
        for (final MapEntry(key: m, value: sts) in (places[h] ?? const <String, List<Station>>{}).entries) {
          final last = sts.last;
          if (m == 'grab') {
            expect(sts.any((s) => s.name == 'Beverages'), isFalse, reason: '$iso $h grab');
            continue;
          }
          expect(last.name, 'Beverages', reason: '$iso $h $m');
          expect(last.dishes.map((d) => d.dishName), ['Fountain Drink'], reason: '$iso $h $m');
          expect(sts.where((s) => s.name == 'Beverages'), hasLength(1));
          stationDays++;
        }
      }
    }
    expect(stationDays, greaterThan(0));
  });

  test('station-days per hall and meal match vectors.json fountain', () {
    final got = <String, Map<String, int>>{};
    for (final places in withFountain().days.values) {
      for (final h in halls) {
        for (final MapEntry(key: m, value: sts) in (places[h] ?? const <String, List<Station>>{}).entries) {
          if (sts.last.name == 'Beverages') got[h] = {...?got[h], m: (got[h]?[m] ?? 0) + 1};
        }
      }
    }
    expect(got, (vectors['fountain'] as Map)['stationDays']);
  });

  test('the record: 1 each, every nutrient blank, no price, no marks, no score', () {
    final d = withFountain().days[today]!['W']!['lunch']!.last.dishes.single;
    expect(d.nutrition.servingSize, '1 each');
    expect(d.macro.cal, isNull);
    expect((d.macro.p, d.macro.c, d.macro.f), (null, null, null));
    expect((d.price, d.health, d.carbon, d.diet), (null, null, null, 0));
    expect(d.allergens, isEmpty);
  });

  test('no diet preference hides it, and it counts as hidden by nothing', () {
    final d = withFountain().days[today]!['W']!['lunch']!.last.dishes.single;
    expect(dietOK(const Prefs(veg: true, plant: true, halal: true), d), isTrue);
    expect(prefOK(const Prefs(veg: true, plant: true, halal: true, avoid: ['Milk']), d), isTrue);
    final v = menuView(withFountain(), today, 'W', 'lunch', const Prefs(veg: true, plant: true, halal: true), false);
    expect(v.sections.last.name, 'Beverages');
  });

  test('typed "fountain" finds one hall row (W F H B) and one café row; idle Search lists neither', () {
    final b = withFountain();
    final r = run(b, 'fountain');
    expect(r.now.map((x) => x.d.dishName.toLowerCase()), everyElement('fountain drink'));
    expect(r.now, hasLength(1));
    expect(r.cafes, hasLength(1));
    expect(run(b, '').now.any((x) => x.d.dishName == 'Fountain Drink'), isFalse);
  });
}
