// The log as You reads it: RN's rows grouped into M2's meals and days (flutter-port-you Task 1).
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/history.dart';
import 'package:udine/core/types.dart';
import 'support.dart' as fx;

NutritionFacts n(num cal, {num p = 0, num c = 0, num f = 0}) => NutritionFacts(
    servingSize: '', calories: cal, caloriesFromFat: 0, totalFatG: f, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: c, dietaryFiberG: 0, sugarsG: 0, proteinG: p);
LogEntry e(String id, String at, {String dish = 'Posole', int tid = 1, num servings = 1, num cal = 200, LogSource? source}) =>
    LogEntry(id: id, loggedAt: at, source: source ?? UmassMenuSource(dishName: dish, hallTid: tid), servings: servings, nutrition: n(cal, p: 10, c: 20, f: 5));

void main() {
  final board = fx.board;
  test('rows sharing one loggedAt are one meal; days are the effective day, newest first', () {
    final ms = loggedMeals([
      e('a', '2026-10-07T12:20:00.000'),
      e('b', '2026-10-07T12:20:00.000', dish: 'Burger'),
      e('c', '2026-10-08T00:30:00.000'), // 12:30 AM counts for the day before
      e('d', '2026-10-08T08:42:00.000'),
    ]);
    expect(ms.map((m) => m.items.length), [2, 1, 1]);
    expect(ms.map((m) => m.day), ['2026-10-07', '2026-10-07', '2026-10-08']);
    expect(loggedDays(ms), ['2026-10-08', '2026-10-07']);
  });

  test('the time, meal window and hall of a meal', () {
    final m = loggedMeals([e('a', '2026-10-07T12:41:00.000', tid: 4)]).single;
    expect((m.time, m.meal, m.place(const {})), ('12:41 PM', 'lunch', 'B'));
    expect(loggedMeals([e('a', '2026-10-07T08:05:00.000')]).single.time, '8:05 AM');
    expect(loggedMeals([e('a', '2026-10-07T00:30:00.000')]).single.time, '12:30 AM');
    expect(loggedMeals([e('a', '2026-10-07T00:30:00.000')]).single.meal, 'late');
    expect(loggedMeals([e('a', '2026-10-07T18:10:00.000')]).single.meal, 'dinner');
    expect(loggedMeals([e('a', '2026-10-07T08:05:00.000')]).single.meal, 'breakfast');
  });

  test('a plate of only custom foods has no place, and neither does an id nothing lists', () {
    expect(loggedMeals([e('a', '2026-10-07T12:00:00.000', source: const CustomSource(customFoodId: 'x', productName: 'Chili'))]).single.place(const {}), isNull);
    expect(loggedMeals([e('a', '2026-10-07T12:00:00.000', tid: 99)]).single.place(const {'c3': 7}), isNull);
    expect(loggedMeals([e('a', '2026-10-07T12:00:00.000', tid: -5)]).single.place(const {'c3': 7}), isNull); // RN's hashed id for a café the feed gave none
  });

  test('a café meal is named by its location id, as the plate\'s Log writes it', () {
    final ids = {'c3': 71, 'c5': 88};
    final m = loggedMeals([e('a', '2026-10-07T12:41:00.000', tid: 88)]).single;
    expect(m.place(ids), 'c5');
    expect(mealTitle(m, board, ids), 'Lunch at Wasabi');
    expect(deletedLine(m, board, ids), 'Deleted Wasabi lunch');
  });

  test('titles and the delete receipt say the hall when there is one, and nothing when no place resolves', () {
    final w = loggedMeals([e('a', '2026-10-07T12:41:00.000')]).single, none = loggedMeals([e('a', '2026-10-07T12:41:00.000', tid: 99)]).single;
    expect(mealTitle(w, board, const {}), 'Lunch at Worcester');
    expect(deletedLine(w, board, const {}), 'Deleted Worcester lunch');
    expect(mealTitle(none, board, const {}), 'Lunch');
    expect(deletedLine(none, board, const {}), 'Deleted lunch');
  });

  test('totals are each row times its servings, per meal and per day', () {
    final ms = loggedMeals([e('a', '2026-10-07T12:20:00.000', servings: 2), e('b', '2026-10-07T12:20:00.000', cal: 100, servings: 0.5), e('c', '2026-10-07T18:00:00.000')]);
    expect(ms.first.total.cal, 450);
    expect(ms.first.total.p, 25);
    expect(dayTotal(ms, '2026-10-07').cal, 650);
    expect(dayTotal(ms, '2026-10-06').cal, 0);
  });

  test("the meal's label sums every nutrient times servings", () {
    final rows = mealLabelRows(loggedMeals([e('a', '2026-10-07T12:20:00.000', servings: 2)]).single);
    expect(rows.cal, '400');
  });
}
