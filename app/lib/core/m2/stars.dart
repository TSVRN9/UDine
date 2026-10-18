// M2 R13 §2 `hallMeal` / `hallStar`: a hall card carries a star when a favourite is served there in the meal on now, or, between
// meals, the next meal still ahead on the board's day. After the hall's last meal there is none. The board leads with yesterday until
// 02:00, so the clock is read as minutes on that board day (00:40 is 24:40) and its menus are the board day's.
import '../hours.dart';
import 'board.dart';
import 'where.dart' show mealWindow, minuteOf;

const _meals = ['breakfast', 'lunch', 'dinner', 'late'];

/// The Eastern wall clock, read on the board's day: ISO date and minutes (after-midnight minutes counted past 1440).
(String, int) boardClock(DateTime instant, int rolloverHour) {
  final w = easternWall(instant), early = w.hour < rolloverHour, d = DateTime.utc(w.year, w.month, w.day - (early ? 1 : 0));
  return ('${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}', (early ? w.hour + 24 : w.hour) * 60 + w.minute);
}

/// The meal the hall is in at [instant], else the next one ahead, else null.
String? hallMeal(Board fx, String hall, DateTime instant, int rolloverHour) {
  final (_, now) = boardClock(instant, rolloverHour);
  // the window is looked up on the board's day, which before the rollover is the calendar day before
  final probe = easternWall(instant).hour < rolloverHour ? instant.subtract(const Duration(days: 1)) : instant;
  final wins = <(String, int, int)>[];
  for (final m in _meals) {
    final w = mealWindow(fx, hall, m, probe);
    if (w == null) continue;
    final open = minuteOf(w.$1), close = minuteOf(w.$2);
    wins.add((m, open, close <= open ? close + 1440 : close));
  }
  for (final (m, o, c) in wins) {
    if (o <= now && now < c) return m;
  }
  final ahead = wins.where((w) => w.$2 > now).toList()..sort((a, b) => a.$2 - b.$2);
  return ahead.firstOrNull?.$1;
}

/// Is a favourite (by [dishKey]) served at [hall] in its meal now or next, on the board's day.
bool hallStar(Board fx, String hall, Set<String> favoriteKeys, DateTime instant, int rolloverHour) {
  final m = hallMeal(fx, hall, instant, rolloverHour);
  if (m == null || favoriteKeys.isEmpty) return false;
  final (iso, _) = boardClock(instant, rolloverHour);
  return (fx.days[iso]?[hall]?[m] ?? const <Station>[]).any((s) => s.dishes.any((d) => favoriteKeys.contains(d.key)));
}
