// M2 R13 §2 `hallMeal` / `hallStar`: a hall card carries a star when a favourite is served there in the meal on now, or, between
// meals, the next meal still ahead on the board's day. After the hall's last meal there is none. The board leads with yesterday until
// 02:00, so the clock is read as minutes on that board day (00:40 is 24:40) and the menus are the board day's, [iso] (`repo.today`), not
// the Eastern calendar day: a device in another zone keys its board by its own day.
import 'board.dart';
import 'where.dart' show mealWindow, toMin;

const _meals = ['breakfast', 'lunch', 'dinner', 'late'];

/// The meal the hall is in at [instant] on the board's day [iso], else the next one ahead, else null.
String? hallMeal(Board fx, String hall, String iso, DateTime instant) {
  final now = boardMinute(instant), probe = DateTime.parse('${iso}T17:00:00Z'); // 12 or 13 in Eastern, so the same date
  final wins = <(String, int, int)>[];
  for (final m in _meals) {
    final w = mealWindow(fx, hall, m, probe);
    if (w == null) continue;
    final open = toMin(w.$1), close = toMin(w.$2);
    wins.add((m, open, close <= open ? close + 1440 : close));
  }
  for (final (m, o, c) in wins) {
    if (o <= now && now < c) return m;
  }
  final ahead = wins.where((w) => w.$2 > now).toList()..sort((a, b) => a.$2 - b.$2);
  return ahead.firstOrNull?.$1;
}

/// Is a favourite (by [dishKey]) served at [hall] in its meal now or next, on the board's day [iso].
bool hallStar(Board fx, String hall, Set<String> favoriteKeys, String iso, DateTime instant) {
  final m = hallMeal(fx, hall, iso, instant);
  if (m == null || favoriteKeys.isEmpty) return false;
  return (fx.days[iso]?[hall]?[m] ?? const <Station>[]).any((s) => s.dishes.any((d) => favoriteKeys.contains(d.key)));
}
