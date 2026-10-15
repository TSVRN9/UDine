import '../ranking.dart';
import '../types.dart';
import 'history.dart';

/// "Which was better?" draws on the dishes in the user's own log: a menu dish by name and hall, as RN's `ranked_dishes` keys it.
List<LoggedDish> rankPool(Iterable<LoggedMeal> meals) => distinctLoggedDishes([for (final m in meals) for (final i in m.items) i.entry]);

num _rating(List<RankedDish> ranked, LoggedDish d) => ranked.where((r) => r.dishName == d.dishName && r.hallTid == d.hallTid).firstOrNull?.rating ?? defaultRating;
int _count(List<RankedDish> ranked, LoggedDish d) => ranked.where((r) => r.dishName == d.dishName && r.hallTid == d.hallTid).firstOrNull?.comparisonCount ?? 0;

/// "Your ranking": the pool by RN's Elo rating, best first. A dish never compared sits at the default rating, in log order among its peers.
List<LoggedDish> rankedOrder(List<LoggedDish> pool, List<RankedDish> ranked) {
  final idx = {for (final (i, d) in pool.indexed) d: i};
  return [...pool]..sort((x, y) {
      final d = _rating(ranked, y).compareTo(_rating(ranked, x));
      return d != 0 ? d : idx[x]!.compareTo(idx[y]!);
    });
}

String pairKey(LoggedDish x, LoggedDish y) => ([x, y].map((d) => '${d.dishName}@${d.hallTid}').toList()..sort()).join('|');

/// The next pair to ask: the two dishes compared least so far (log order breaks ties), skipping pairs already taken in this visit. Null when
/// fewer than two dishes are logged or every pair has been taken.
(LoggedDish, LoggedDish)? nextPair(List<LoggedDish> pool, List<RankedDish> ranked, Set<String> taken) {
  (LoggedDish, LoggedDish)? best;
  var bestCost = 1 << 30;
  for (var i = 0; i < pool.length; i++) {
    for (var j = i + 1; j < pool.length; j++) {
      if (taken.contains(pairKey(pool[i], pool[j]))) continue;
      final cost = _count(ranked, pool[i]) + _count(ranked, pool[j]);
      if (cost < bestCost) {
        bestCost = cost;
        best = (pool[i], pool[j]);
      }
    }
  }
  return best;
}
