import '../core/date.dart';
import '../core/favorite_match.dart';
import '../core/m2/board.dart';
import '../core/m2/where.dart';
import '../core/store/store.dart';
import '../core/types.dart';
import '../data/repository.dart';
import '../screens/hall/hall_controller.dart' show grabsOf, mealsOfItems;

/// One notification: the dish's name, the dish sheet's "where" sentences, and the deep link a tap opens.
class AlertNotice {
  const AlertNotice(this.dishName, this.body, this.route);
  final String dishName, body, route;
}

/// No alert before this hour (local).
const alertsFromHour = 7;

String _names(List<String> n) => n.length < 2 ? n.join() : '${n.sublist(0, n.length - 1).join(', ')} and ${n.last}';

/// Favourited dishes on today's menu in the four halls (the rule shared with TS and Deno), each with every place and time it is still
/// to be served today in one body. A dish with no serving left (every window has ended) is left out, which is the "never after the
/// last serving" rule: wherePlan drops a window at its close minute.
List<AlertNotice> dueAlerts(Board fx, List<Favorite> favorites, DateTime now, {bool newton = false}) {
  final day = effectiveTodayIso(now, defaultRolloverHour);
  final items = [for (final h in halls) for (final st in (fx.days[day]?[h]?.values ?? const <List<Station>>[]).expand((s) => s) ) ...st.dishes];
  final out = <AlertNotice>[];
  for (final name in {for (final m in matchFavoritedDishes(favorites, items)) m.dishName}) {
    final plan = wherePlan(fx, name, now, newton: newton).where((g) => g.day == 0).toList();
    if (plan.isEmpty) continue;
    final body = [
      for (var i = 0; i < plan.length; i++) '${whenText(plan[i], i > 0 ? plan[i - 1] : null)}, at ${_names([for (final h in plan[i].halls) placeName(fx, h)])}',
    ].join('\n');
    final slug = diningHalls[halls.indexOf(plan.first.halls.first)].slug;
    out.add(AlertNotice(name, body, Uri(path: '/hall/$slug', queryParameters: {'meal': plan.first.meal, 'day': day, 'dish': name}).toString()));
  }
  return out;
}

/// The background check: nothing unless Notify me is on and it is 7 AM or later; reads the cached menus and hours ([loadBoard], null when
/// there is nothing to read), claims each dish for the day in alert_sent, and posts it. Returns how many were posted.
// A dish is claimed before it is posted (two checks at once cannot both post it); a post that throws gives the claim back, so permission granted later in the day still gets it.
Future<int> runAlertCheck({
  required UdineStore store,
  required DateTime Function() now,
  required Future<Board?> Function(String day) loadBoard,
  required Future<void> Function(AlertNotice) notify,
}) async {
  final t = now();
  if (t.hour < alertsFromHour || !await store.alertsOn()) return 0;
  final favorites = await store.favorites();
  if (!favorites.any((f) => f is DishFavorite)) return 0;
  final day = effectiveTodayIso(t, defaultRolloverHour);
  final fx = await loadBoard(day);
  if (fx == null) return 0;
  var posted = 0;
  for (final n in dueAlerts(fx, favorites, t, newton: await store.charlesRiver())) {
    if (!await store.claimAlert(n.dishName, day)) continue;
    try {
      await notify(n);
    } catch (_) {
      await store.releaseAlert(n.dishName, day);
      rethrow;
    }
    posted++;
  }
  return posted;
}

/// Today's hours and the four halls' menus from the repository: the saved copies first, the network when they are missing or stale
/// (Repository's own offline-first rule). Null when the hours are not available.
Future<Board?> loadAlertBoard(Repository repo, String day) async {
  HoursData? hours;
  await for (final s in repo.hours(day)) {
    if (s case Loaded<HoursData>(:final value) || LoadedOffline<HoursData>(:final value)) hours = value;
  }
  if (hours == null) return null;
  final got = await repo.prefetchMenus([for (final h in diningHalls) (h.tid, day)]);
  return Board(
    clock: repo.now(),
    places: [for (var i = 0; i < halls.length; i++) Place(key: halls[i], name: diningHalls[i].name, area: -1)],
    hours: {for (final h in hours.feed.halls) halls[h.hallTid - 1]: h},
    grab: grabsOf(hours.feed),
    days: {
      day: {for (var i = 0; i < halls.length; i++) if (got[(diningHalls[i].tid, day)] case final it? when it.isNotEmpty) halls[i]: mealsOfItems(it)},
    },
    events: const [],
  );
}
