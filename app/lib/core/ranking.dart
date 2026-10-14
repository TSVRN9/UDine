// Port of shared/src/ranking.ts (Elo tracks, hall ranking, post-log pairing).
import 'dart:math';

import 'types.dart';

const defaultRating = 1500;
const _maxK = 32;
const _minK = 8;
const _kDecay = 10;

double kFactorFor(int comparisonCount) => max(_minK, _maxK / (1 + max(0, comparisonCount) / _kDecay)).toDouble();

/// JS Array.prototype.sort is stable; Dart's List.sort is not. Ties keep input order.
List<T> _stableSortedDesc<T>(List<T> xs, num Function(T) by) {
  final idx = [for (var i = 0; i < xs.length; i++) i];
  idx.sort((a, b) {
    final d = by(xs[b]).compareTo(by(xs[a]));
    return d != 0 ? d : a.compareTo(b);
  });
  return [for (final i in idx) xs[i]];
}

double _expected(num winnerRating, num loserRating) => 1 / (1 + pow(10, (loserRating - winnerRating) / 400));

/// One pairwise comparison; same (dishName, hallTid) on both sides returns [dishes] unchanged.
/// The two updated rows go last, winner then loser.
List<RankedDish> applyComparison(List<RankedDish> dishes, ({String dishName, int hallTid}) winner, ({String dishName, int hallTid}) loser) {
  if (winner.dishName == loser.dishName && winner.hallTid == loser.hallTid) return dishes;
  RankedDish find(({String dishName, int hallTid}) k) =>
      dishes.where((d) => d.dishName == k.dishName && d.hallTid == k.hallTid).firstOrNull ??
      RankedDish(dishName: k.dishName, hallTid: k.hallTid, rating: defaultRating, comparisonCount: 0);
  final w = find(winner), l = find(loser);
  final ew = _expected(w.rating, l.rating);
  final el = 1 - ew;
  final uw = RankedDish(dishName: w.dishName, hallTid: w.hallTid, rating: w.rating + kFactorFor(w.comparisonCount) * (1 - ew), comparisonCount: w.comparisonCount + 1);
  final ul = RankedDish(dishName: l.dishName, hallTid: l.hallTid, rating: l.rating + kFactorFor(l.comparisonCount) * (0 - el), comparisonCount: l.comparisonCount + 1);
  bool isKey(RankedDish d, ({String dishName, int hallTid}) k) => d.dishName == k.dishName && d.hallTid == k.hallTid;
  return [...dishes.where((d) => !isKey(d, winner) && !isKey(d, loser)), uw, ul];
}

List<RankedDish> rankDishes(List<RankedDish> dishes) => _stableSortedDesc(dishes, (d) => d.rating);

/// Cross-hall Favorite Food track; same dishName on both sides returns [foods] unchanged.
List<RankedFood> applyFoodComparison(List<RankedFood> foods, String winner, String loser) {
  if (winner == loser) return foods;
  RankedFood find(String n) => foods.where((f) => f.dishName == n).firstOrNull ?? RankedFood(dishName: n, rating: defaultRating, comparisonCount: 0);
  final w = find(winner), l = find(loser);
  final ew = _expected(w.rating, l.rating);
  final el = 1 - ew;
  final uw = RankedFood(dishName: w.dishName, rating: w.rating + kFactorFor(w.comparisonCount) * (1 - ew), comparisonCount: w.comparisonCount + 1);
  final ul = RankedFood(dishName: l.dishName, rating: l.rating + kFactorFor(l.comparisonCount) * (0 - el), comparisonCount: l.comparisonCount + 1);
  return [...foods.where((f) => f.dishName != winner && f.dishName != loser), uw, ul];
}

List<RankedFood> rankFoods(List<RankedFood> foods) => _stableSortedDesc(foods, (f) => f.rating);

const _minRatedDishesPerHall = 2;

/// Ranks the 4 dining halls by average dish rating; halls with under 2 rated dishes come back unranked.
/// Dishes at any other tid are ignored.
({List<({int hallTid, int rank})> ranked, List<int> unranked}) rankDiningHalls(List<RankedDish> dishes) {
  final tids = {for (final h in diningHalls) h.tid};
  final byHall = <int, List<num>>{};
  for (final d in dishes) {
    if (!tids.contains(d.hallTid)) continue;
    byHall.putIfAbsent(d.hallTid, () => []).add(d.rating);
  }
  final avgs = [
    for (final e in byHall.entries)
      if (e.value.length >= _minRatedDishesPerHall) (hallTid: e.key, average: e.value.reduce((a, b) => a + b) / e.value.length),
  ];
  final sorted = _stableSortedDesc(avgs, (a) => a.average);
  final ranked = [for (var i = 0; i < sorted.length; i++) (hallTid: sorted[i].hallTid, rank: i + 1)];
  final rankedIds = {for (final r in ranked) r.hallTid};
  return (ranked: ranked, unranked: [for (final h in diningHalls) if (!rankedIds.contains(h.tid)) h.tid]);
}

class LoggedDish {
  const LoggedDish(this.dishName, this.hallTid);
  final String dishName;
  final int hallTid;
  @override
  bool operator ==(Object other) => other is LoggedDish && other.dishName == dishName && other.hallTid == hallTid;
  @override
  int get hashCode => Object.hash(dishName, hallTid);
}

/// Distinct umass-menu dishes in first-seen order; other sources are skipped.
List<LoggedDish> distinctLoggedDishes(List<LogEntry> entries) {
  final seen = <LoggedDish>{};
  final out = <LoggedDish>[];
  for (final e in entries) {
    final s = e.source;
    if (s is! UmassMenuSource) continue;
    final d = LoggedDish(s.dishName, s.hallTid);
    if (seen.add(d)) out.add(d);
  }
  return out;
}

/// Pairs [justLogged] with the least-compared other logged dish (first wins ties); null with no other dish.
(LoggedDish, LoggedDish)? pickPostLogComparisonPair(List<LogEntry> entries, LoggedDish justLogged, List<RankedDish> ranked) {
  final candidates = distinctLoggedDishes(entries).where((d) => d != justLogged).toList();
  if (candidates.isEmpty) return null;
  int count(LoggedDish d) => ranked.where((r) => r.dishName == d.dishName && r.hallTid == d.hallTid).firstOrNull?.comparisonCount ?? 0;
  final opponent = candidates.reduce((least, d) => count(d) < count(least) ? d : least);
  return (justLogged, opponent);
}
