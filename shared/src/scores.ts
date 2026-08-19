import { DEFAULT_RATING } from "./ranking.ts";
import type { RankedFood } from "./types.ts";

/** Below this comparisonCount, a food's rating hasn't seen enough pairwise comparisons to be worth
 * displaying as a score — excluded from the map entirely rather than shown with a misleadingly
 * precise number. */
const MIN_COMPARISONS_FOR_SCORE = 3;

// ponytail: fixed linear band, not min-max over the current set — DEFAULT_RATING (ranking.ts) is the
// 5.0 midpoint and every 100 rating points is worth 1.0 score point, so a rating 500+ points below/
// above the anchor saturates at 0.0/10.0. This is what makes a single qualifying food NOT
// automatically 10.0 (min-max normalization over one point would always give min=max=10). Upgrade to
// a normalization that adapts to the observed rating spread if the fixed band ever feels too tight/
// loose in practice.
const SCORE_MIDPOINT_RATING = DEFAULT_RATING;
const RATING_POINTS_PER_SCORE_POINT = 100;

function ratingToScore(rating: number): number {
  const raw = 5 + (rating - SCORE_MIDPOINT_RATING) / RATING_POINTS_PER_SCORE_POINT;
  const clamped = Math.min(10, Math.max(0, raw));
  return Math.round(clamped * 10) / 10;
}

/**
 * Beli-style 0-10 display score for each Favorite Food (ranking.ts's cross-hall RankedFood track —
 * CONTEXT.md glossary), derived from its Elo rating. Deterministic and monotonic with Elo order: a
 * strictly higher rating never produces a lower score (see ratingToScore's fixed linear mapping).
 * Foods with fewer than MIN_COMPARISONS_FOR_SCORE comparisons are left out of the map entirely
 * rather than given a score off too little data. Keyed by dishName — RankedFood's own identity, the
 * same key applyFoodComparison/findOrCreateFood already use in ranking.ts, not a parallel scheme.
 */
export function scoreOutOfTen(rankedFoods: RankedFood[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const food of rankedFoods) {
    if (food.comparisonCount < MIN_COMPARISONS_FOR_SCORE) continue;
    scores.set(food.dishName, ratingToScore(food.rating));
  }
  return scores;
}
