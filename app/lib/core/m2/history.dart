import '../date.dart';
import '../types.dart';
import 'board.dart';
import 'places.dart' show cafeTable, straight;
import 'variants.dart' show shownName;
import 'dish_sheet.dart' show labelRowsOf;
import '../../ui/label_model.dart' show Label;

/// One logged row as the past-meal sheet shows it (M2's item `{n, qty, cal}`): the entry's id is what a stepper edits. A snapshot taken
/// when it was logged, so a past meal stays true whatever the feed does later.
class LoggedItem {
  const LoggedItem(this.entry);
  final LogEntry entry;
  String get id => entry.id;
  double get qty => entry.servings.toDouble();
  num? get calEach => entry.nutrition.knownCal;
  /// A bowl's parts as logged (name, servings), empty for anything else.
  List<(String, num)> get parts => switch (entry.source) {
        UmassMenuSource(parts: final p?) => [for (final x in p) (x.name, x.servings)],
        _ => const [],
      };
  String get name => switch (entry.source) {
        UmassMenuSource s => shownName(s.dishName),
        OffSource s => s.productName,
        UsdaSource s => s.productName,
        CustomSource s => s.productName,
      };
}

/// M2's meal `{at, day, time, meal, hall, items}`: every row RN stamped with one `loggedAt` (one plate), filed under its effective day.
class LoggedMeal {
  LoggedMeal(this.loggedAt, this.day, this.items);
  final String loggedAt, day;
  final List<LoggedItem> items;

  /// "12:41 PM" (M2 `fmtClock`)
  String get time {
    final h = int.parse(loggedAt.substring(11, 13)), m = loggedAt.substring(14, 16);
    return '${(h + 11) % 12 + 1}:$m ${h < 12 ? 'AM' : 'PM'}';
  }

  /// The standard meal window the time falls in; a log between midnight and the rollover belongs to the evening before.
  String get meal {
    final h = int.parse(loggedAt.substring(11, 13)), m = int.parse(loggedAt.substring(14, 16));
    return mealOfMinute((h < defaultRolloverHour ? h + 24 : h) * 60 + m);
  }

  /// The place the first menu item was served at: a hall by its tid, or a café whose get_infov2 `location_id` is that number
  /// (`cafeIds`, café key to id: what the plate's Log wrote for a café, as RN did). Null when nothing resolves (a plate of only custom,
  /// packaged or USDA foods, or an id the feed no longer lists).
  String? place(Map<String, int> cafeIds) {
    final tid = items.map((i) => i.entry.source).whereType<UmassMenuSource>().firstOrNull?.hallTid;
    if (tid == null) return null;
    if (tid >= 1 && tid <= halls.length) return halls[tid - 1];
    for (final e in cafeIds.entries) {
      if (e.value == tid) return e.key;
    }
    return null;
  }

  /// Whether a hall's tid does not explain this meal's place: a café's (or an id RN hashed), which only the hours can name.
  bool get needsCafeIds {
    final tid = items.map((i) => i.entry.source).whereType<UmassMenuSource>().firstOrNull?.hallTid;
    return tid != null && (tid < 1 || tid > halls.length);
  }

  Totals get total => _sum(items);
}

/// Every café's location id by place key (`c3`), for the cafés the feed has one for.
Map<String, int> cafeIdsOf(DiningHoursFeed? feed) {
  if (feed == null) return const {};
  final byTitle = {for (final r in feed.retail) straight(r.name): r.locationId};
  return {for (var i = 0; i < cafeTable.length; i++) 'c$i': ?byTitle[straight(cafeTable[i].title)]};
}

class Totals {
  const Totals(this.cal, this.p, this.c, this.f);
  final double? cal, p, c, f;
}

Totals _sum(Iterable<LoggedItem> items) {
  double? cal, p, c, f;
  double? add(double? a, num? x, num q) => x == null ? a : (a ?? 0) + x * q;
  for (final i in items) {
    final n = i.entry.nutrition, q = i.qty;
    cal = add(cal, n.knownCal, q);
    p = add(p, n.knownProtein, q);
    c = add(c, n.knownCarb, q);
    f = add(f, n.knownFat, q);
  }
  return items.isEmpty ? const Totals(0, 0, 0, 0) : Totals(cal, p, c, f);
}

/// Every meal in the log, oldest first (M2 sorts a day's meals by `at`).
List<LoggedMeal> loggedMeals(Iterable<LogEntry> entries, {int rolloverHour = defaultRolloverHour}) {
  final groups = <String, List<LoggedItem>>{};
  for (final e in entries) {
    (groups[e.loggedAt] ??= []).add(LoggedItem(e));
  }
  return [for (final g in groups.entries) LoggedMeal(g.key, effectiveDayOf(g.key, rolloverHour), g.value)]..sort((a, b) => a.loggedAt.compareTo(b.loggedAt));
}

Totals dayTotal(Iterable<LoggedMeal> meals, String day) => _sum([for (final m in meals) if (m.day == day) ...m.items]);

/// Days with something logged, newest first (M2 `logDays`).
List<String> loggedDays(Iterable<LoggedMeal> meals) => ({for (final m in meals) m.day}.toList()..sort()).reversed.toList();

/// M2 `mealLabel`: "Lunch at Worcester", "Dinner at Green Fields", "Lunch" when no place resolves.
String mealTitle(LoggedMeal m, Board fx, Map<String, int> cafeIds) {
  final p = m.place(cafeIds);
  return '${mealLabel[m.meal]}${p != null ? ' at ${placeName(fx, p)}' : ''}';
}

/// M2 `deleteMeal`'s receipt: "Deleted Worcester lunch" ("Deleted lunch" with no hall).
String deletedLine(LoggedMeal m, Board fx, Map<String, int> cafeIds) {
  final p = m.place(cafeIds);
  return 'Deleted ${p != null ? '${placeName(fx, p)} ' : ''}${mealLabel[m.meal]!.toLowerCase()}';
}

/// M2 `mlabel`: the Nutrition Facts panel summed over a meal's rows, servings included (no serving row, no carbon grade, as a plate's).
Label mealLabelRows(LoggedMeal m) {
  double f(double Function(NutritionFacts n) of) => m.items.fold(0.0, (a, i) => a + of(i.entry.nutrition) * i.qty);
  return labelRowsOf(NutritionFacts(
    servingSize: '', calories: m.total.cal ?? 0, caloriesFromFat: f((n) => n.caloriesFromFat.toDouble()), totalFatG: f((n) => n.totalFatG.toDouble()),
    satFatG: f((n) => n.satFatG.toDouble()), transFatG: f((n) => n.transFatG.toDouble()), cholesterolMg: f((n) => n.cholesterolMg.toDouble()),
    sodiumMg: f((n) => n.sodiumMg.toDouble()), totalCarbG: f((n) => n.totalCarbG.toDouble()), dietaryFiberG: f((n) => n.dietaryFiberG.toDouble()),
    sugarsG: f((n) => n.sugarsG.toDouble()), proteinG: f((n) => n.proteinG.toDouble()),
    blank: {for (final (k, v) in [('calories', m.total.cal), ('totalFatG', m.total.f), ('totalCarbG', m.total.c), ('proteinG', m.total.p)]) if (v == null) k},
  ));
}
