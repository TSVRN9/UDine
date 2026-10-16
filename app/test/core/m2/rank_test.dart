// "Which was better?": the pool is the dishes in the user's own log; pairs and the ranking come from RN's Elo rows.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/rank.dart';
import 'package:udine/core/ranking.dart';
import 'package:udine/core/types.dart';

const a = LoggedDish('Posole', 1), b = LoggedDish('Burger', 3), c = LoggedDish('Rice', 1);
RankedDish r(LoggedDish d, num rating, int n) => RankedDish(dishName: d.dishName, hallTid: d.hallTid, rating: rating, comparisonCount: n);

void main() {
  test('the ranking is RN\'s ranked_dishes order, before any new pick; unranked dishes follow in log order', () {
    expect(rankedOrder([a, b, c], [r(c, 1600, 2), r(a, 1550, 2)]), [c, a, b]);
    expect(rankedOrder([a, b, c], const []), [a, b, c]);
  });

  test('a ranked dish that is no longer in the log is not listed', () {
    expect(rankedOrder([a], [r(b, 1700, 4), r(a, 1500, 1)]), [a]);
  });

  test('the next pair is the two least-compared dishes, log order breaking ties', () {
    expect(nextPair([a, b, c], [r(a, 1500, 3), r(b, 1500, 0), r(c, 1500, 1)]), (b, c));
    expect(nextPair([a, b, c], const []), (a, b));
  });

  test('no pair with fewer than two dishes, or once every dish has been set against all the others', () {
    expect(nextPair([a], const []), isNull);
    expect(nextPair([a, b, c], [r(a, 1500, 2), r(b, 1500, 2), r(c, 1500, 2)]), isNull);
    expect(nextPair([a, b, c], [r(a, 1500, 2), r(b, 1500, 2), r(c, 1500, 1)]), isNotNull);
  });
}
