import assert from "node:assert/strict";
import { test } from "node:test";
import { applyComparison, kFactorFor, rankDiningHalls, rankDishes } from "./ranking.ts";
import { DINING_HALLS } from "./umassDining.ts";
import type { RankedDish } from "./types.ts";

test("applyComparison creates both dishes at default rating 1500 on their first comparison, then updates them", () => {
  const result = applyComparison([], { dishName: "Black Beans", hallTid: 3 }, { dishName: "Fried Plantain", hallTid: 3 });
  assert.equal(result.length, 2);

  const winner = result.find((d) => d.dishName === "Black Beans")!;
  const loser = result.find((d) => d.dishName === "Fried Plantain")!;
  // Equal starting ratings -> expected score 0.5 each -> +/- K/2 = 16
  assert.equal(winner.rating, 1516);
  assert.equal(loser.rating, 1484);
  assert.equal(winner.comparisonCount, 1);
  assert.equal(loser.comparisonCount, 1);
});

test("applyComparison leaves unrelated dishes untouched", () => {
  const before: RankedDish[] = [{ dishName: "Untouched", hallTid: 1, rating: 1500, comparisonCount: 0 }];
  const after = applyComparison(before, { dishName: "A", hallTid: 1 }, { dishName: "B", hallTid: 1 });
  assert.deepEqual(after.find((d) => d.dishName === "Untouched"), before[0]);
});

test("applyComparison treats the same dish name at different halls as distinct entries", () => {
  const after = applyComparison([], { dishName: "Chicken", hallTid: 1 }, { dishName: "Chicken", hallTid: 2 });
  assert.equal(after.length, 2);
  assert.ok(after.some((d) => d.hallTid === 1 && d.rating > 1500));
  assert.ok(after.some((d) => d.hallTid === 2 && d.rating < 1500));
});

test("an upset (lower-rated dish beats a higher-rated one) gains more rating than a expected win", () => {
  const seeded: RankedDish[] = [
    { dishName: "Favorite", hallTid: 1, rating: 1800, comparisonCount: 5 },
    { dishName: "Underdog", hallTid: 1, rating: 1200, comparisonCount: 5 },
  ];
  const expectedWin = applyComparison(seeded, { dishName: "Favorite", hallTid: 1 }, { dishName: "Underdog", hallTid: 1 });
  const upset = applyComparison(seeded, { dishName: "Underdog", hallTid: 1 }, { dishName: "Favorite", hallTid: 1 });

  const gainOnExpectedWin = expectedWin.find((d) => d.dishName === "Favorite")!.rating - 1800;
  const gainOnUpset = upset.find((d) => d.dishName === "Underdog")!.rating - 1200;
  assert.ok(gainOnUpset > gainOnExpectedWin, `upset gain (${gainOnUpset}) should exceed expected-win gain (${gainOnExpectedWin})`);
});

test("kFactorFor is high near comparisonCount 0, comparable to the old fixed 32, and decreases monotonically", () => {
  assert.equal(kFactorFor(0), 32);
  let previous = kFactorFor(0);
  for (const count of [1, 2, 5, 10, 20, 50, 100]) {
    const k = kFactorFor(count);
    assert.ok(k <= previous, `kFactorFor(${count})=${k} should not exceed the previous count's K`);
    previous = k;
  }
});

test("kFactorFor floors at MIN_K for high comparisonCount", () => {
  assert.equal(kFactorFor(1_000_000), 8);
});

test("applyComparison swings a fresh dish's rating more than an established (high-comparisonCount) dish's, given the same win/loss outcome", () => {
  const seeded: RankedDish[] = [
    { dishName: "Fresh", hallTid: 1, rating: 1500, comparisonCount: 0 },
    { dishName: "Established", hallTid: 1, rating: 1500, comparisonCount: 50 },
    { dishName: "Opponent A", hallTid: 1, rating: 1500, comparisonCount: 0 },
    { dishName: "Opponent B", hallTid: 1, rating: 1500, comparisonCount: 0 },
  ];

  const freshResult = applyComparison(seeded, { dishName: "Fresh", hallTid: 1 }, { dishName: "Opponent A", hallTid: 1 });
  const establishedResult = applyComparison(seeded, { dishName: "Established", hallTid: 1 }, { dishName: "Opponent B", hallTid: 1 });

  const freshGain = freshResult.find((d) => d.dishName === "Fresh")!.rating - 1500;
  const establishedGain = establishedResult.find((d) => d.dishName === "Established")!.rating - 1500;
  assert.ok(freshGain > establishedGain, `fresh gain (${freshGain}) should exceed established gain (${establishedGain})`);
});

test("rankDishes sorts highest rating first", () => {
  const dishes: RankedDish[] = [
    { dishName: "Low", hallTid: 1, rating: 1400, comparisonCount: 1 },
    { dishName: "High", hallTid: 1, rating: 1600, comparisonCount: 1 },
    { dishName: "Mid", hallTid: 1, rating: 1500, comparisonCount: 1 },
  ];
  assert.deepEqual(
    rankDishes(dishes).map((d) => d.dishName),
    ["High", "Mid", "Low"],
  );
});

test("rankDiningHalls ranks halls by average dish rating, highest first, with 1-based rank", () => {
  const dishes: RankedDish[] = [
    { dishName: "A1", hallTid: 1, rating: 1400, comparisonCount: 1 },
    { dishName: "A2", hallTid: 1, rating: 1400, comparisonCount: 1 },
    { dishName: "B1", hallTid: 2, rating: 1700, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1700, comparisonCount: 1 },
  ];
  assert.deepEqual(rankDiningHalls(dishes).ranked, [
    { hallTid: 2, rank: 1 },
    { hallTid: 1, rank: 2 },
  ]);
});

test("rankDiningHalls moves halls below the minimum rated-dish threshold to unranked, not omitted", () => {
  const dishes: RankedDish[] = [
    { dishName: "OneHit", hallTid: 3, rating: 2000, comparisonCount: 1 }, // only 1 rated dish at hall 3
    { dishName: "B1", hallTid: 2, rating: 1500, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1500, comparisonCount: 1 },
  ];
  const { ranked, unranked } = rankDiningHalls(dishes);
  assert.deepEqual(ranked, [{ hallTid: 2, rank: 1 }]);
  assert.deepEqual(
    unranked.map((u) => u.hallTid).sort(),
    [1, 3, 4],
  );
});

test("rankDiningHalls always accounts for all 4 halls, ranked and unranked combined", () => {
  const dishes: RankedDish[] = [1, 2].flatMap((hallTid) => [
    { dishName: `${hallTid}a`, hallTid, rating: 1500 + hallTid, comparisonCount: 1 },
    { dishName: `${hallTid}b`, hallTid, rating: 1500 + hallTid, comparisonCount: 1 },
  ]);
  const { ranked, unranked } = rankDiningHalls(dishes);
  assert.equal(ranked.length + unranked.length, DINING_HALLS.length);
});

test("rankDiningHalls with no rated dishes returns all halls unranked", () => {
  const { ranked, unranked } = rankDiningHalls([]);
  assert.deepEqual(ranked, []);
  assert.equal(unranked.length, DINING_HALLS.length);
});
