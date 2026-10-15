import '../date.dart';
import '../types.dart';
import 'board.dart';
import 'dish_sheet.dart' show labelRowsOf;
import '../../ui/label_model.dart' show Label;

/// One logged row as the past-meal sheet shows it (M2's item `{n, qty, cal}`): the entry's id is what a stepper edits. A snapshot taken
/// when it was logged, so a past meal stays true whatever the feed does later.
class LoggedItem {
  const LoggedItem(this.entry);
  final LogEntry entry;
  String get id => entry.id;
  double get qty => entry.servings.toDouble();
  num get calEach => entry.nutrition.calories;
  String get name => switch (entry.source) {
        UmassMenuSource s => s.dishName,
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

  /// The hall of the first menu item (null for a plate of only custom, packaged or USDA foods, or a tid that is not one of the four).
  String? get hall {
    final tid = items.map((i) => i.entry.source).whereType<UmassMenuSource>().firstOrNull?.hallTid;
    return tid != null && tid >= 1 && tid <= halls.length ? halls[tid - 1] : null;
  }

  Totals get total => _sum(items);
}

class Totals {
  const Totals(this.cal, this.p, this.c, this.f);
  final double cal, p, c, f;
}

Totals _sum(Iterable<LoggedItem> items) {
  double cal = 0, p = 0, c = 0, f = 0;
  for (final i in items) {
    final n = i.entry.nutrition, q = i.qty;
    cal += n.calories * q;
    p += n.proteinG * q;
    c += n.totalCarbG * q;
    f += n.totalFatG * q;
  }
  return Totals(cal, p, c, f);
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

/// M2 `mealLabel`: "Lunch at Worcester", "Lunch" with no hall.
String mealTitle(LoggedMeal m, Board fx) => '${mealLabel[m.meal]}${m.hall != null ? ' at ${placeName(fx, m.hall!)}' : ''}';

/// M2 `deleteMeal`'s receipt: "Deleted Worcester lunch" ("Deleted lunch" with no hall).
String deletedLine(LoggedMeal m, Board fx) => 'Deleted ${m.hall != null ? '${placeName(fx, m.hall!)} ' : ''}${mealLabel[m.meal]!.toLowerCase()}';

/// M2 `mlabel`: the Nutrition Facts panel summed over a meal's rows, servings included (no serving row, no carbon grade, as a plate's).
Label mealLabelRows(LoggedMeal m) {
  double f(double Function(NutritionFacts n) of) => m.items.fold(0.0, (a, i) => a + of(i.entry.nutrition) * i.qty);
  return labelRowsOf(NutritionFacts(
    servingSize: '', calories: m.total.cal, caloriesFromFat: f((n) => n.caloriesFromFat.toDouble()), totalFatG: f((n) => n.totalFatG.toDouble()),
    satFatG: f((n) => n.satFatG.toDouble()), transFatG: f((n) => n.transFatG.toDouble()), cholesterolMg: f((n) => n.cholesterolMg.toDouble()),
    sodiumMg: f((n) => n.sodiumMg.toDouble()), totalCarbG: f((n) => n.totalCarbG.toDouble()), dietaryFiberG: f((n) => n.dietaryFiberG.toDouble()),
    sugarsG: f((n) => n.sugarsG.toDouble()), proteinG: f((n) => n.proteinG.toDouble()),
  ));
}
