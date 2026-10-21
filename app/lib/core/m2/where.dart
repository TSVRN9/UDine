import '../hours.dart';
import '../types.dart';
import 'board.dart';
import 'variants.dart';

class WhereGroup {
  final String st; // now | later | tomorrow
  final String meal;
  final int day;
  final String open, close;
  final List<String> halls;
  /// The menu day the group was found on (not in the JSON): `day` counts from the calendar date, a board counts from its first day.
  final String iso;
  WhereGroup(this.st, this.meal, this.day, this.open, this.close, this.halls, [this.iso = '']);
  Map<String, dynamic> toJson() => {'st': st, 'meal': meal, 'day': day, 'open': open, 'close': close, 'halls': halls};
}

const _standard = {'breakfast': HallMealPeriod.breakfast, 'lunch': HallMealPeriod.lunch, 'dinner': HallMealPeriod.dinner, 'late': HallMealPeriod.latenight};

/// Minutes after midnight of an "H:MM AM" time.
int toMin(String t) {
  final m = RegExp(r'^(\d+):(\d+)\s*(AM|PM)$', caseSensitive: false).firstMatch(t)!;
  return (int.parse(m[1]!) % 12 + (m[3]!.toUpperCase() == 'PM' ? 12 : 0)) * 60 + int.parse(m[2]!);
}

String _fmtMin(int m) => '${((m ~/ 60 + 11) % 12) + 1}:${(m % 60).toString().padLeft(2, '0')} ${m < 720 ? 'AM' : 'PM'}';

/// The window a place serves a meal, whatever the clock says: probe effectiveMealWindow at the place's own opening time.
(String, String)? mealWindow(Board fx, String place, String meal, DateTime now) {
  final h = fx.hours[place];
  if (h == null) return null; // a place whose hours are not known serves no window
  if (!isCafe(place) && meal == 'grab') {
    final g = fx.grab[place];
    return g == null ? null : (g.openTime, g.closeTime);
  }
  if (meal == 'all' || meal == 'grab') return h.general == null ? null : (h.general!.openTime, h.general!.closeTime);
  if (h.general == null) return null;
  final m = toMin(h.general!.openTime);
  final wall = easternWall(now);
  final w = effectiveMealWindow(h, _standard[meal]!, easternInstant(DateTime.utc(wall.year, wall.month, wall.day, m ~/ 60, m % 60)));
  return w == null ? null : (w.openTime, w.closeTime);
}

String _shiftIso(String iso, int days) => DateTime.parse('${iso}T12:00:00Z').add(Duration(days: days)).toIso8601String().substring(0, 10);
String _localIso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class _Acc {
  final WhereGroup g;
  final int open, close; // minutes
  final int order; // insertion order: Dart's sort is not stable
  _Acc(this.g, this.open, this.close, this.order);
}

/// Every group a dish is served in, soonest first (M2 `wherePlan`). `instant` is any DateTime; it is read as Eastern wall time.
List<WhereGroup> wherePlan(Board fx, String dish, DateTime instant, {bool newton = false}) {
  final now = easternWall(instant);
  // a family (`f:Boba`) is served wherever any of its variants is
  final key = dish.startsWith('f:') ? 'f:${dishKey(dish.substring(2))}' : dishKey(dish), fam = familiesOf(fx), today = _localIso(now), nowMin = now.hour * 60 + now.minute;
  final inNewton = {for (final p in fx.places) if (p.area == 4) p.key};
  final groups = <String, _Acc>{};
  // Yesterday's menus count too, for a window that crossed midnight and is still open.
  final days = [_shiftIso(today, -1), today, _shiftIso(today, 1)];
  for (var rel = -1; rel <= 1; rel++) {
    final day = rel == 1 ? 1 : 0;
    for (final MapEntry(key: place, value: meals) in (fx.days[days[rel + 1]] ?? const <String, Map<String, List<Station>>>{}).entries) {
      if (inNewton.contains(place) && !newton) continue;
      for (final MapEntry(key: meal, value: stations) in meals.entries) {
        if (!stations.any((s) => s.dishes.any((d) => d.key == key || fam.familyOf(d)?.key == key))) continue;
        final win = mealWindow(fx, place, meal, instant);
        if (win == null) continue;
        final w = (toMin(win.$1), toMin(win.$2));
        final crosses = w.$2 <= w.$1; // a close at or before its open is the next day's
        final end = crosses ? w.$2 + 1440 : w.$2;
        final st = rel == 1 ? 'tomorrow' : rel == -1 ? (crosses && nowMin < w.$2 ? 'now' : 'past') : nowMin >= end ? 'past' : nowMin >= w.$1 ? 'now' : 'later';
        if (st == 'past') continue;
        final gk = '$st,$meal,${w.$1},${w.$2}';
        final acc = groups.putIfAbsent(gk, () => _Acc(WhereGroup(st, meal, day, _fmtMin(w.$1), _fmtMin(w.$2), [], days[rel + 1]), w.$1, end, groups.length));
        if (!acc.g.halls.contains(place)) acc.g.halls.add(place);
      }
    }
  }
  const rank = {'now': 0, 'later': 1, 'tomorrow': 2};
  final gs = groups.values.toList()
    ..sort((a, b) {
      final byState = rank[a.g.st]! - rank[b.g.st]!;
      if (byState != 0) return byState;
      final byTime = a.g.st == 'now' ? a.close - b.close : a.open - b.open;
      if (byTime != 0) return byTime;
      final byPlace = placeOrder(a.g.halls.first) - placeOrder(b.g.halls.first);
      return byPlace != 0 ? byPlace : a.order - b.order;
    });
  final sorted = [
    for (final a in gs)
      WhereGroup(a.g.st, a.g.meal, a.g.day, a.g.open, a.g.close, [...a.g.halls]..sort((x, y) => placeOrder(x) - placeOrder(y)), a.g.iso),
  ];
  return sorted;
}

/// Where can I get this? At most two groups: the soonest, plus one more today that names a place the first doesn't.
List<WhereGroup> whereAnswer(Board fx, String dish, DateTime instant, {bool newton = false}) {
  final sorted = wherePlan(fx, dish, instant, newton: newton);
  if (sorted.isEmpty) return [];
  final first = sorted.first;
  for (final g in sorted.skip(1)) {
    if (g.day != 0) continue;
    final rest = g.halls.where((h) => !first.halls.contains(h)).toList();
    if (rest.isNotEmpty) return [first, WhereGroup(g.st, g.meal, g.day, g.open, g.close, rest, g.iso)];
  }
  return [first];
}

String fmtT(String t) {
  final m = toMin(t);
  if (m >= 1439) return 'midnight';
  if (m == 720) return 'noon';
  return '${((m ~/ 60 + 11) % 12) + 1}${m % 60 != 0 ? ':${(m % 60).toString().padLeft(2, '0')}' : ''} ${m < 720 ? 'AM' : 'PM'}';
}

String _mealName(String m) => mealLabel[m]!;
String _mealWord(String m) => m == 'grab' ? "Grab 'N Go" : mealLabel[m]!.toLowerCase();

/// "A", "A and B", "A, B and C".
String namesAnd(List<String> n) => n.length < 2 ? n.join() : '${n.sublist(0, n.length - 1).join(', ')} and ${n.last}';

/// What the sheet prints for a group; a second line for the same meal at the same moment only gives its own time.
String whenText(WhereGroup g, [WhereGroup? prev]) {
  final same = prev != null && prev.st == g.st && prev.meal == g.meal;
  if (g.meal == 'all') {
    return g.st == 'now' ? (same ? 'Until ${fmtT(g.close)}' : 'Now, until ${fmtT(g.close)}')
        : g.st == 'later' ? 'From ${fmtT(g.open)}' : 'Tomorrow, from ${fmtT(g.open)}';
  }
  return g.st == 'now' ? (same ? 'Until ${fmtT(g.close)}' : '${_mealName(g.meal)} now, until ${fmtT(g.close)}')
      : g.st == 'later' ? (same ? 'From ${fmtT(g.open)}' : '${_mealName(g.meal)} from ${fmtT(g.open)}')
      : 'Tomorrow, ${_mealWord(g.meal)} from ${fmtT(g.open)}';
}

/// Where the group's menu day sits in the board's days. After midnight the board can still lead with yesterday, so `g.day` is not it.
int boardDay(Board fx, WhereGroup g) {
  final i = fx.days.keys.toList().indexOf(g.iso);
  return i < 0 ? g.day : i;
}

/// What the dish sheet says of a dish with no group left today or tomorrow.
const notServed = 'Not on the menu again today or tomorrow';
