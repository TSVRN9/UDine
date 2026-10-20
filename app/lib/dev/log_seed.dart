import '../core/types.dart';

NutritionFacts _n(num cal, num p, num c, num f) => NutritionFacts(
    servingSize: '1 serving', calories: cal, caloriesFromFat: f * 9, totalFatG: f, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 100, totalCarbG: c, dietaryFiberG: 0, sugarsG: 0, proteinG: p);

LogEntry _e(String id, String at, String dish, int tid, num cal, {num servings = 1}) =>
    LogEntry(id: id, loggedAt: at, source: UmassMenuSource(dishName: dish, hallTid: tid), servings: servings, nutrition: _n(cal, cal / 20, cal / 8, cal / 25));

/// `?history=today|full` on a recorded route (screenshots) and the tests: M2's seeded history (`SEED`, round 10) as RN would have logged it, with made-up nutrition: Tuesday's Cobb Salad is a custom food (no
/// hall), Wednesday's lunch is at Worcester and dinner at Hampshire, and today's breakfast is at Worcester.
final seedToday = [
  _e('t0', '2026-10-08T08:42:00.000', 'Hard Boiled Egg', 1, 70),
  _e('t1', '2026-10-08T08:42:00.000', 'Make Your Own Waffles', 1, 250, servings: 2),
  _e('t2', '2026-10-08T08:42:00.000', 'Red Potato Home Fries', 1, 150),
];
final seedEarlier = [
  LogEntry(id: 'e0', loggedAt: '2026-10-06T18:40:00.000', source: const CustomSource(customFoodId: 'cf', productName: 'Cobb Salad'), servings: 1, nutrition: _n(420, 28, 14, 30)),
  _e('e1', '2026-10-07T12:20:00.000', 'Golden BBQ Chicken Thigh', 1, 180),
  _e('e2', '2026-10-07T12:20:00.000', 'Local Roasted Sweet Potatoes', 1, 140),
  _e('e3', '2026-10-07T12:20:00.000', 'Green Chile Posole', 1, 300),
  _e('e4', '2026-10-07T18:10:00.000', 'Green Chile Posole', 3, 300),
  _e('e5', '2026-10-07T18:10:00.000', 'Black Bean Burger', 3, 380),
];

/// `?history=bowl`: the above and M2's Monday lunch at Worcester, a Beef Brisket Noodle Bowl with a Hard Boiled Egg and Steamed Bok Choy
/// (`SEED`'s 2026-10-05T12:30), logged as one row with its parts.
final seedBowl = [
  LogEntry(
    id: 'b0', loggedAt: '2026-10-05T12:30:00.000', servings: 1, nutrition: _n(340, 21, 30, 12),
    source: UmassMenuSource(dishName: 'Beef Brisket Noodle Bowl', hallTid: 1, parts: [
      LogPart(name: 'Hard Boiled Egg', servings: 1, nutrition: _n(111, 6, 1, 8)),
      LogPart(name: 'Steamed Bok Choy', servings: 1, nutrition: _n(11, 1, 2, 0)),
    ]),
  ),
];

/// `?history=chai`: the full history and a 20 oz Chai logged (every figure unknown, M2 R12c) beside a recorded 0, one Wednesday meal.
final seedChai = [
  LogEntry(
    id: 'k0', loggedAt: '2026-10-07T15:30:00.000', source: const UmassMenuSource(dishName: '20 oz Chai', hallTid: 1), servings: 1,
    nutrition: _n(0, 0, 0, 0).withBlank(const {'calories', 'proteinG', 'totalCarbG', 'totalFatG'}),
  ),
];
