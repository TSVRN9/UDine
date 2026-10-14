// Port of shared/src/scores.ts.
import 'ranking.dart';
import 'types.dart';

const _minComparisonsForScore = 3;

double _ratingToScore(num rating) {
  final raw = 5 + (rating - defaultRating) / 100;
  final clamped = raw.clamp(0, 10);
  return (clamped * 10).round() / 10; // non-negative, so round() == JS Math.round
}

/// 0-10 display score per food keyed by dishName; foods with under 3 comparisons are left out.
Map<String, double> scoreOutOfTen(List<RankedFood> foods) => {
      for (final f in foods)
        if (f.comparisonCount >= _minComparisonsForScore) f.dishName: _ratingToScore(f.rating),
    };
