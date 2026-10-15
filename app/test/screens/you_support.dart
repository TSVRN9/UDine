import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/types.dart';
import 'package:udine/screens/you/day_page.dart';
import 'package:udine/screens/you/you_screen.dart';
import 'plate_support.dart';
import 'support.dart';

NutritionFacts _n(num cal, num p, num c, num f) => NutritionFacts(
    servingSize: '1 serving', calories: cal, caloriesFromFat: f * 9, totalFatG: f, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 100, totalCarbG: c, dietaryFiberG: 0, sugarsG: 0, proteinG: p);

LogEntry _e(String id, String at, String dish, int tid, num cal, {num servings = 1}) =>
    LogEntry(id: id, loggedAt: at, source: UmassMenuSource(dishName: dish, hallTid: tid), servings: servings, nutrition: _n(cal, cal / 20, cal / 8, cal / 25));

/// M2's seeded history (`SEED`, round 10) as RN would have logged it, with made-up nutrition: Tuesday's Cobb Salad is a custom food (no
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

enum History { none, today, full }

/// The recorded app with `h` already in the log, as an upgraded RN database would hold it.
Future<Boot> bootYou(WidgetTester t, [History h = History.full]) async {
  final b = await bootRecorded(t);
  await t.runAsync(() async {
    await b.store!.addEntries([if (h != History.none) ...seedToday, if (h == History.full) ...seedEarlier]);
    await b.log!.reload();
  });
  return b;
}

Future<void> openYou(WidgetTester t, Boot b, {double w = 390, String route = '/you', bool reduced = false}) async {
  await openApp(t, b, route: route, w: w, reduced: reduced);
  await until(t, () => find.byType(route.startsWith('/you/day') ? DayPage : YouScreen).evaluate().isNotEmpty);
  await t.pumpAndSettle();
}

Future<List<Map<String, Object?>>> logRows(WidgetTester t, Boot b) async => (await t.runAsync(() => b.store!.db.rawQuery('SELECT rowid AS _rowid, * FROM log_entries ORDER BY rowid')))!;

/// Real time for a store write behind an edit, then the frames it causes.
Future<void> wrote(WidgetTester t) async {
  await t.pumpAndSettle(); // (a row's close-up runs first, then the write it waited for)
  await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 80)));
  await t.pumpAndSettle();
}
