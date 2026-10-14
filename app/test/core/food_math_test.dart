// Dart-only cases for macros, scores, completion, stations and ranking (ports of the shared/src TS modules;
// expected numbers come from running the TS modules).
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/completion.dart';
import 'package:udine/core/macros.dart';
import 'package:udine/core/ranking.dart';
import 'package:udine/core/scores.dart';
import 'package:udine/core/stations.dart';
import 'package:udine/core/types.dart';

NutritionFacts nut({num cal = 100, num p = 10, num c = 20, num f = 5}) => NutritionFacts(
      servingSize: '1',
      calories: cal,
      caloriesFromFat: 0,
      totalFatG: f,
      satFatG: 0,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: c,
      dietaryFiberG: 0,
      sugarsG: 0,
      proteinG: p,
    );

LogEntry umass(String id, String dish, int hall, {num servings = 1, num cal = 100}) =>
    LogEntry(id: id, loggedAt: '2026-09-15T12:00:00.000Z', source: UmassMenuSource(dishName: dish, hallTid: hall), servings: servings, nutrition: nut(cal: cal));

void main() {
  group('macros', () {
    test('computeDailyTotals scales by servings', () {
      final t = computeDailyTotals('2026-09-15', [umass('a', 'x', 1, servings: 2, cal: 100), umass('b', 'y', 1, servings: 0.5, cal: 300)]);
      expect(t.toJson(), {'date': '2026-09-15', 'calories': 350, 'proteinG': 25, 'totalCarbG': 50, 'totalFatG': 12.5});
    });
    test('averageDailyTotals divides by the list length; empty is zeros with a blank date', () {
      final a = DailyMacroTotals.fromJson({'date': 'd', 'calories': 100, 'proteinG': 10, 'totalCarbG': 0, 'totalFatG': 1});
      final b = DailyMacroTotals.fromJson({'date': 'd', 'calories': 201, 'proteinG': 20, 'totalCarbG': 0, 'totalFatG': 2});
      expect(averageDailyTotals([a, b]).toJson(), {'date': '', 'calories': 150.5, 'proteinG': 15, 'totalCarbG': 0, 'totalFatG': 1.5});
      expect(averageDailyTotals([]).toJson(), {'date': '', 'calories': 0, 'proteinG': 0, 'totalCarbG': 0, 'totalFatG': 0});
    });
    test('isoDateOf', () => expect(isoDateOf('2026-09-15T23:59:59.000Z'), '2026-09-15'));
  });

  group('ranking', () {
    test('kFactorFor tapers 32 -> 16 -> floor 8', () {
      expect([kFactorFor(0), kFactorFor(10), kFactorFor(100), kFactorFor(-5)], [32, 16, 8, 32]);
    });
    test('applyComparison matches the TS Elo update and row order', () {
      var d = applyComparison([], (dishName: 'A', hallTid: 1), (dishName: 'B', hallTid: 2));
      d = applyComparison(d, (dishName: 'A', hallTid: 1), (dishName: 'C', hallTid: 1));
      expect([for (final x in d) x.dishName], ['B', 'A', 'C']);
      expect(d[0].rating, 1484);
      expect(d[1].rating, closeTo(1529.8760847331619, 1e-9));
      expect(d[1].comparisonCount, 2);
      expect(d[2].rating, closeTo(1484.736306793522, 1e-9));
    });
    test('same dish on both sides is a no-op', () {
      final d = [const RankedDish(dishName: 'A', hallTid: 1, rating: 1500, comparisonCount: 0)];
      expect(applyComparison(d, (dishName: 'A', hallTid: 1), (dishName: 'A', hallTid: 1)), same(d));
      expect(applyFoodComparison([], 'A', 'A'), isEmpty);
    });
    test('applyFoodComparison + scoreOutOfTen', () {
      var f = <RankedFood>[];
      for (var i = 0; i < 3; i++) {
        f = applyFoodComparison(f, 'A', 'B');
      }
      expect(f[0].rating, closeTo(1540.3218538335746, 1e-9));
      expect(f[1].rating, closeTo(1459.6781461664254, 1e-9));
      expect(scoreOutOfTen(f), {'A': 5.4, 'B': 4.6});
    });
    test('scoreOutOfTen clamps, rounds to one decimal and skips under 3 comparisons', () {
      RankedFood r(String n, num rating, int c) => RankedFood(dishName: n, rating: rating, comparisonCount: c);
      expect(scoreOutOfTen([r('x', 3000, 5), r('y', 1500, 3), r('z', 1234, 9), r('w', 1600, 2), r('lo', -100, 3)]), {'x': 10, 'y': 5, 'z': 2.3, 'lo': 0});
    });
    test('rankDishes/rankFoods sort by rating descending and keep input order on ties', () {
      RankedFood r(String n, num rating) => RankedFood(dishName: n, rating: rating, comparisonCount: 0);
      expect([for (final f in rankFoods([r('a', 1), r('b', 3), r('c', 1), r('d', 3), r('e', 2)])) f.dishName], ['b', 'd', 'e', 'a', 'c']);
      RankedDish d(String n, num rating) => RankedDish(dishName: n, hallTid: 1, rating: rating, comparisonCount: 0);
      expect([for (final x in rankDishes([d('a', 1), d('b', 1), d('c', 2)])) x.dishName], ['c', 'a', 'b']);
    });
    test('rankDiningHalls ranks halls with 2+ dishes, ignores other tids, lists the rest unranked', () {
      RankedDish d(int hall, num rating) => RankedDish(dishName: 'd$rating$hall', hallTid: hall, rating: rating, comparisonCount: 1);
      final r = rankDiningHalls([d(1, 1600), d(1, 1500), d(3, 1400), d(3, 1400), d(2, 1900), d(99, 1), d(99, 1)]);
      expect(r.ranked, [(hallTid: 1, rank: 1), (hallTid: 3, rank: 2)]);
      expect(r.unranked, [2, 4]);
    });
    test('distinctLoggedDishes skips non-menu sources and repeats; pickPostLogComparisonPair prefers the least compared', () {
      final entries = [
        umass('1', 'A', 1),
        umass('2', 'B', 1),
        umass('3', 'A', 1),
        umass('4', 'C', 2),
        const LogEntry(id: '5', loggedAt: 'x', source: OffSource(barcode: '1', productName: 'Bar'), servings: 1, nutrition: NutritionFacts(servingSize: '', calories: 0, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 0, dietaryFiberG: 0, sugarsG: 0, proteinG: 0)),
      ];
      expect(distinctLoggedDishes(entries), const [LoggedDish('A', 1), LoggedDish('B', 1), LoggedDish('C', 2)]);
      const ranked = [RankedDish(dishName: 'B', hallTid: 1, rating: 1500, comparisonCount: 4)];
      expect(pickPostLogComparisonPair(entries, const LoggedDish('A', 1), ranked), (const LoggedDish('A', 1), const LoggedDish('C', 2)));
      expect(pickPostLogComparisonPair([umass('1', 'A', 1)], const LoggedDish('A', 1), []), isNull);
    });
  });

  group('completion', () {
    test('all four halls, logged counted only if seen, whole-number pct, 0 not NaN', () {
      final r = hallCompletion({
        1: ['A', 'B', 'C'],
        2: ['X'],
      }, [umass('1', 'A', 1), umass('2', 'A', 1), umass('3', 'Never Seen', 1), umass('4', 'B', 1), umass('5', 'X', 3)]);
      expect([for (final h in r) (h.hallTid, h.loggedDistinct, h.seenDistinct, h.pct)], [(1, 2, 3, 67), (2, 0, 1, 0), (3, 0, 0, 0), (4, 0, 0, 0)]);
    });
  });

  group('stations', () {
    test('normalizeStationName', () {
      expect(normalizeStationName('Grab n\'Go Hot '), 'Grab n\'Go Hot');
      expect(normalizeStationName('Latino 1  WOR'), 'Latino 1');
      expect(normalizeStationName('Latino FRK HMP'), 'Latino');
      expect(normalizeStationName('Omelet WOR'), 'Omelet');
      expect(normalizeStationName('NEW STATION XYZ'), 'NEW STATION XYZ');
    });
    test('sortStationNames follows the food-journey order, GF with gluten free, unknown alphabetical last', () {
      expect(sortStationNames(['Desserts', 'Soups', 'Breads', 'Starches', 'Sushi', 'Vegetables', 'Salad Bar/Dressings', 'Grill Station']),
          ['Grill Station', 'Sushi', 'Vegetables', 'Starches', 'Salad Bar/Dressings', 'Soups', 'Breads', 'Desserts']);
      expect(sortStationNames(['Grab n\'Go Hot', 'Desserts', 'Entrees']), ['Entrees', 'Desserts', 'Grab n\'Go Hot']);
      expect(sortStationNames(['Zeta Bar', 'GF Pasta', 'alpha Bar', 'Entrees', 'Beta Bar']), ['GF Pasta', 'Entrees', 'alpha Bar', 'Beta Bar', 'Zeta Bar']);
    });
    test('localeCompare is case-insensitive first, lowercase before uppercase on a tie', () {
      expect(localeCompare('a', 'B'), lessThan(0));
      expect(localeCompare('a', 'A'), lessThan(0));
      expect(localeCompare('ab', 'a'), greaterThan(0));
      expect(localeCompare('x1', 'x2'), lessThan(0));
      expect(localeCompare('x 1', 'x1'), lessThan(0));
    });
  });

  group('stable ordering past Dart\'s short-list insertion sort (TS expected orders)', () {
    final foods = [for (var i = 0; i < 60; i++) RankedFood(dishName: 'f$i', rating: 1500 + i % 3, comparisonCount: 0)];
    test('rankFoods keeps input order within equal ratings', () {
      expect([for (final f in rankFoods(foods)) f.dishName], ['f2', 'f5', 'f8', 'f11', 'f14', 'f17', 'f20', 'f23', 'f26', 'f29', 'f32', 'f35', 'f38', 'f41', 'f44', 'f47', 'f50', 'f53', 'f56', 'f59', 'f1', 'f4', 'f7', 'f10', 'f13', 'f16', 'f19', 'f22', 'f25', 'f28', 'f31', 'f34', 'f37', 'f40', 'f43', 'f46', 'f49', 'f52', 'f55', 'f58', 'f0', 'f3', 'f6', 'f9', 'f12', 'f15', 'f18', 'f21', 'f24', 'f27', 'f30', 'f33', 'f36', 'f39', 'f42', 'f45', 'f48', 'f51', 'f54', 'f57']);
    });
    test('rankDishes keeps input order within equal ratings', () {
      final dishes = [for (var i = 0; i < 60; i++) RankedDish(dishName: 'f$i', hallTid: 1 + i % 4, rating: 1500 + i % 3, comparisonCount: 0)];
      expect([for (final f in rankDishes(dishes)) f.dishName], ['f2', 'f5', 'f8', 'f11', 'f14', 'f17', 'f20', 'f23', 'f26', 'f29', 'f32', 'f35', 'f38', 'f41', 'f44', 'f47', 'f50', 'f53', 'f56', 'f59', 'f1', 'f4', 'f7', 'f10', 'f13', 'f16', 'f19', 'f22', 'f25', 'f28', 'f31', 'f34', 'f37', 'f40', 'f43', 'f46', 'f49', 'f52', 'f55', 'f58', 'f0', 'f3', 'f6', 'f9', 'f12', 'f15', 'f18', 'f21', 'f24', 'f27', 'f30', 'f33', 'f36', 'f39', 'f42', 'f45', 'f48', 'f51', 'f54', 'f57']);
    });
    test('sortStationNames on 48 names matches TS', () {
      expect(sortStationNames(['Grill x', 'Grab n\'Go 1', 'Latino 2', 'Soups 3', 'Beta 4 x', 'Pizza 5', 'Zeta 6', 'Express', 'Desserts 8 x', 'GF Pasta 9', 'Salad Bar 10', 'alpha 0', 'Grill 1 x', 'Grab n\'Go 2', 'Latino', 'Soups 4', 'Beta 5 x', 'Pizza 6', 'Zeta 7', 'Express 8', 'Desserts 9 x', 'GF Pasta', 'Salad Bar 0', 'alpha 1', 'Grill 2 x', 'Grab n\'Go 3', 'Latino 4', 'Soups 5', 'Beta x', 'Pizza 7', 'Zeta 8', 'Express 9', 'Desserts 10 x', 'GF Pasta 0', 'Salad Bar 1', 'alpha', 'Grill 3 x', 'Grab n\'Go 4', 'Latino 5', 'Soups 6', 'Beta 7 x', 'Pizza 8', 'Zeta', 'Express 10', 'Desserts 0 x', 'GF Pasta 1', 'Salad Bar 2', 'alpha 3']), ['Grill 1 x', 'Grill 2 x', 'Grill 3 x', 'Grill x', 'Pizza 5', 'Pizza 6', 'Pizza 7', 'Pizza 8', 'Latino', 'Latino 2', 'Latino 4', 'Latino 5', 'Express', 'Express 10', 'Express 8', 'Express 9', 'GF Pasta', 'GF Pasta 0', 'GF Pasta 1', 'GF Pasta 9', 'Salad Bar 0', 'Salad Bar 1', 'Salad Bar 10', 'Salad Bar 2', 'Soups 3', 'Soups 4', 'Soups 5', 'Soups 6', 'Desserts 0 x', 'Desserts 10 x', 'Desserts 8 x', 'Desserts 9 x', 'Grab n\'Go 1', 'Grab n\'Go 2', 'Grab n\'Go 3', 'Grab n\'Go 4', 'alpha', 'alpha 0', 'alpha 1', 'alpha 3', 'Beta 4 x', 'Beta 5 x', 'Beta 7 x', 'Beta x', 'Zeta', 'Zeta 6', 'Zeta 7', 'Zeta 8']);
    });
  });
}
