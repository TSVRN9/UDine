import assert from "node:assert/strict";
import { test } from "node:test";
import { rankFoods } from "./ranking.ts";
import { scoreOutOfTen } from "./scores.ts";
import type { RankedFood } from "./types.ts";

test("scoreOutOfTen excludes foods below the min-comparisons gate", () => {
  const foods: RankedFood[] = [{ dishName: "Chicken", rating: 1800, comparisonCount: 2 }];
  assert.equal(scoreOutOfTen(foods).has("Chicken"), false);
});

test("scoreOutOfTen includes a food exactly at the min-comparisons gate boundary", () => {
  const foods: RankedFood[] = [{ dishName: "Chicken", rating: 1800, comparisonCount: 3 }];
  assert.equal(scoreOutOfTen(foods).has("Chicken"), true);
});

test("scoreOutOfTen gate boundary: comparisonCount 2 excluded, 3 included, in the same call", () => {
  const foods: RankedFood[] = [
    { dishName: "TooFew", rating: 1800, comparisonCount: 2 },
    { dishName: "JustEnough", rating: 1800, comparisonCount: 3 },
  ];
  const scores = scoreOutOfTen(foods);
  assert.equal(scores.has("TooFew"), false);
  assert.equal(scores.has("JustEnough"), true);
});

test("scoreOutOfTen gives equal-rated, equally-qualified foods the same score (ties)", () => {
  const foods: RankedFood[] = [
    { dishName: "A", rating: 1650, comparisonCount: 4 },
    { dishName: "B", rating: 1650, comparisonCount: 10 }, // comparisonCount doesn't factor into the score itself, only the gate
  ];
  const scores = scoreOutOfTen(foods);
  assert.equal(scores.get("A"), 6.5);
  assert.equal(scores.get("A"), scores.get("B"));
});

test("scoreOutOfTen anchors a single qualifying food to its rating, not automatically 10.0", () => {
  // Exactly DEFAULT_RATING (1500) after qualifying for a score -> the midpoint, 5.0, not maxed out
  // for being the only food in the map.
  const foods: RankedFood[] = [{ dishName: "Neutral", rating: 1500, comparisonCount: 3 }];
  assert.equal(scoreOutOfTen(foods).get("Neutral"), 5.0);
});

test("scoreOutOfTen: a single qualifying food well above the anchor scores high but is computed, not hardcoded", () => {
  const foods: RankedFood[] = [{ dishName: "Great", rating: 1800, comparisonCount: 3 }];
  assert.equal(scoreOutOfTen(foods).get("Great"), 8.0);
});

test("scoreOutOfTen rounds to one decimal place", () => {
  const foods: RankedFood[] = [{ dishName: "Chicken", rating: 1537, comparisonCount: 3 }];
  // raw = 5 + (1537-1500)/100 = 5.37 -> rounds to 5.4
  assert.equal(scoreOutOfTen(foods).get("Chicken"), 5.4);
});

test("scoreOutOfTen clamps far-above-anchor ratings at 10.0", () => {
  const foods: RankedFood[] = [{ dishName: "Chicken", rating: 5000, comparisonCount: 3 }];
  assert.equal(scoreOutOfTen(foods).get("Chicken"), 10.0);
});

test("scoreOutOfTen clamps far-below-anchor ratings at 0.0", () => {
  const foods: RankedFood[] = [{ dishName: "Chicken", rating: -1000, comparisonCount: 3 }];
  assert.equal(scoreOutOfTen(foods).get("Chicken"), 0.0);
});

test("scoreOutOfTen is monotonic with Elo order: higher-ranked foods never score lower than lower-ranked ones", () => {
  const foods: RankedFood[] = [
    { dishName: "Low", rating: 1400, comparisonCount: 3 },
    { dishName: "Mid", rating: 1500, comparisonCount: 3 },
    { dishName: "High", rating: 1600, comparisonCount: 3 },
  ];
  const scores = scoreOutOfTen(foods);
  const inRankOrder = rankFoods(foods).map((f) => scores.get(f.dishName)!);
  for (let i = 1; i < inRankOrder.length; i++) {
    assert.ok(inRankOrder[i - 1] >= inRankOrder[i], `expected non-increasing scores down rank order, got ${inRankOrder}`);
  }
  // and strictly increasing in this fixture, since ratings are well inside the unclamped band
  assert.deepEqual(inRankOrder, [6.0, 5.0, 4.0]);
});

test("scoreOutOfTen returns an empty map for no foods", () => {
  assert.deepEqual(scoreOutOfTen([]), new Map());
});
