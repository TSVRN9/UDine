import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyComparison,
  applyFoodComparison,
  distinctLoggedDishes,
  kFactorFor,
  pickPostLogComparisonPair,
  rankDiningHalls,
  rankDishes,
  rankFoods,
} from "./ranking.ts";
import { DINING_HALLS } from "./umassDining.ts";
import type { LogEntry, RankedDish, RankedFood } from "./types.ts";

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: "1",
    loggedAt: "2026-08-17T12:00:00.000Z",
    source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 },
    servings: 1,
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
      caloriesFromFat: 10,
      totalFatG: 5,
      satFatG: 1,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 10,
      dietaryFiberG: 1,
      sugarsG: 1,
      proteinG: 20,
    },
    ...overrides,
  };
}

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

test("applyComparison is a no-op when winner and loser are the same dish (same name, same hall) — mirrors applyFoodComparison's guard (#187)", () => {
  const before: RankedDish[] = [{ dishName: "Chicken", hallTid: 1, rating: 1500, comparisonCount: 3 }];
  const after = applyComparison(before, { dishName: "Chicken", hallTid: 1 }, { dishName: "Chicken", hallTid: 1 });
  assert.deepEqual(after, before);

  // also true for a dish that hasn't been rated yet — no phantom/duplicate row should be created
  const fromEmpty = applyComparison([], { dishName: "Chicken", hallTid: 1 }, { dishName: "Chicken", hallTid: 1 });
  assert.deepEqual(fromEmpty, []);
});

test("applyComparison exact rating delta for an unequal-rating pair (1800 vs 1200, comparisonCount 0) — protects against a wrong Elo divisor (#187)", () => {
  const seeded: RankedDish[] = [
    { dishName: "Favorite", hallTid: 1, rating: 1800, comparisonCount: 0 },
    { dishName: "Underdog", hallTid: 1, rating: 1200, comparisonCount: 0 },
  ];
  const after = applyComparison(seeded, { dishName: "Favorite", hallTid: 1 }, { dishName: "Underdog", hallTid: 1 });
  // expectedWinner = 1 / (1 + 10 ** ((1200 - 1800) / 400)) ≈ 0.9693465699682844 with the correct /400
  // divisor; a mutated divisor (e.g. /100) changes expectedWinner and both deltas below, unlike the
  // existing equal-rating tests (expected score 0.5 regardless of divisor) and inequality-only upset test.
  assert.equal(after.find((d) => d.dishName === "Favorite")!.rating, 1800.9809097610148);
  assert.equal(after.find((d) => d.dishName === "Underdog")!.rating, 1199.0190902389852);
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

// #115: Grab 'N Go locations have their own tid (e.g. 10715), distinct from the 4 DINING_HALLS,
// but log entries for dishes eaten there carry that tid through distinctLoggedDishes into the same
// RankedDish pool the rank screen compares -- so a user who ranks 2+ Grab 'N Go dishes could
// otherwise produce a `ranked` entry for hallTid 10715. Only `ranked` gets synced to the server as
// a "favorite dining hall" (see this function's doc comment + CLAUDE.md's data-residency table) --
// a non-hall location id in that sync payload is exactly the kind of thing downstream code (which
// assumes every favorite-hall row maps to one of the 4 DINING_HALLS) isn't built to handle.
test("rankDiningHalls never ranks or unranks a dish's hallTid that isn't one of the 4 DINING_HALLS (e.g. a Grab 'N Go location)", () => {
  const dishes: RankedDish[] = [
    { dishName: "GNG1", hallTid: 10715, rating: 2000, comparisonCount: 1 },
    { dishName: "GNG2", hallTid: 10715, rating: 2000, comparisonCount: 1 },
    { dishName: "B1", hallTid: 2, rating: 1500, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1500, comparisonCount: 1 },
  ];
  const { ranked, unranked } = rankDiningHalls(dishes);
  assert.deepEqual(
    ranked.map((r) => r.hallTid),
    [2],
  );
  assert.deepEqual(
    unranked.map((u) => u.hallTid).sort((a, b) => a - b),
    [1, 3, 4],
  );
});

test("applyFoodComparison is a no-op when winner and loser share a dishName (same dish, different halls)", () => {
  const before: RankedFood[] = [{ dishName: "Chicken", rating: 1500, comparisonCount: 3 }];
  const after = applyFoodComparison(before, { dishName: "Chicken" }, { dishName: "Chicken" });
  assert.deepEqual(after, before);

  // also true for a food that hasn't been rated yet — no phantom entry should be created
  const fromEmpty = applyFoodComparison([], { dishName: "Chicken" }, { dishName: "Chicken" });
  assert.deepEqual(fromEmpty, []);
});

test("applyFoodComparison updates both foods on different dish names", () => {
  const after = applyFoodComparison([], { dishName: "Black Beans" }, { dishName: "Fried Plantain" });
  assert.equal(after.length, 2);
  assert.ok(after.find((f) => f.dishName === "Black Beans")!.rating > 1500);
  assert.ok(after.find((f) => f.dishName === "Fried Plantain")!.rating < 1500);
});

test("applyFoodComparison reuses kFactorFor from #1 — winner's rating delta at equal ratings equals kFactorFor(comparisonCount)/2", () => {
  const seeded: RankedFood[] = [
    { dishName: "A", rating: 1500, comparisonCount: 5 },
    { dishName: "B", rating: 1500, comparisonCount: 5 },
  ];
  const after = applyFoodComparison(seeded, { dishName: "A" }, { dishName: "B" });
  // equal starting ratings -> expected score 0.5 -> new rating is exactly half the K-factor above 1500
  assert.equal(after.find((f) => f.dishName === "A")!.rating, 1500 + kFactorFor(5) * 0.5);
});

test("applyFoodComparison exact rating delta for an unequal-rating pair (1800 vs 1200, comparisonCount 0) — protects against a wrong Elo divisor (#187)", () => {
  const seeded: RankedFood[] = [
    { dishName: "Favorite", rating: 1800, comparisonCount: 0 },
    { dishName: "Underdog", rating: 1200, comparisonCount: 0 },
  ];
  const after = applyFoodComparison(seeded, { dishName: "Favorite" }, { dishName: "Underdog" });
  // Same math as applyComparison's exact-delta test above; see its comment for the derivation.
  assert.equal(after.find((f) => f.dishName === "Favorite")!.rating, 1800.9809097610148);
  assert.equal(after.find((f) => f.dishName === "Underdog")!.rating, 1199.0190902389852);
});

test("rankFoods sorts highest rating first", () => {
  const foods: RankedFood[] = [
    { dishName: "Low", rating: 1400, comparisonCount: 1 },
    { dishName: "High", rating: 1600, comparisonCount: 1 },
    { dishName: "Mid", rating: 1500, comparisonCount: 1 },
  ];
  assert.deepEqual(
    rankFoods(foods).map((f) => f.dishName),
    ["High", "Mid", "Low"],
  );
});

// --- #67: post-log comparison prompt pair-selection --------------------------------------------

test("distinctLoggedDishes de-duplicates repeated logs of the same dish+hall, preserving first-seen order", () => {
  const entries = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Beans", hallTid: 1 } }),
    entry({ id: "3", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }), // repeat
  ];
  assert.deepEqual(distinctLoggedDishes(entries), [
    { dishName: "Chicken", hallTid: 1 },
    { dishName: "Beans", hallTid: 1 },
  ]);
});

test("distinctLoggedDishes treats the same dish name at different halls as distinct entries", () => {
  const entries = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Chicken", hallTid: 2 } }),
  ];
  assert.deepEqual(distinctLoggedDishes(entries), [
    { dishName: "Chicken", hallTid: 1 },
    { dishName: "Chicken", hallTid: 2 },
  ]);
});

test("distinctLoggedDishes ignores non-umass-menu (e.g. barcode-logged) entries", () => {
  const entries = [entry({ id: "1", source: { type: "off", barcode: "012345", productName: "Granola Bar" } })];
  assert.deepEqual(distinctLoggedDishes(entries), []);
});

test("pickPostLogComparisonPair returns null when justLogged is the only distinct dish logged so far", () => {
  const entries = [entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } })];
  const pair = pickPostLogComparisonPair(entries, { dishName: "Chicken", hallTid: 1 }, []);
  assert.equal(pair, null);
});

test("pickPostLogComparisonPair returns null when there are no logged dishes at all", () => {
  const pair = pickPostLogComparisonPair([], { dishName: "Chicken", hallTid: 1 }, []);
  assert.equal(pair, null);
});

test("pickPostLogComparisonPair pairs justLogged with the only other distinct logged dish", () => {
  const entries = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Beans", hallTid: 1 } }),
  ];
  const pair = pickPostLogComparisonPair(entries, { dishName: "Beans", hallTid: 1 }, []);
  assert.deepEqual(pair, [
    { dishName: "Beans", hallTid: 1 },
    { dishName: "Chicken", hallTid: 1 },
  ]);
});

test("pickPostLogComparisonPair never offers justLogged as its own opponent, even if it was logged repeatedly", () => {
  const entries = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
  ];
  const pair = pickPostLogComparisonPair(entries, { dishName: "Chicken", hallTid: 1 }, []);
  assert.equal(pair, null);
});

test("pickPostLogComparisonPair prefers the least-compared candidate — same signal /rank's own picker uses", () => {
  const entries = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Beans", hallTid: 1 } }),
    entry({ id: "3", source: { type: "umass-menu", dishName: "Rice", hallTid: 1 } }),
  ];
  const rankedDishes: RankedDish[] = [
    { dishName: "Beans", hallTid: 1, rating: 1500, comparisonCount: 5 },
    { dishName: "Rice", hallTid: 1, rating: 1500, comparisonCount: 1 }, // least-compared candidate
  ];
  const pair = pickPostLogComparisonPair(entries, { dishName: "Chicken", hallTid: 1 }, rankedDishes);
  assert.deepEqual(pair, [
    { dishName: "Chicken", hallTid: 1 },
    { dishName: "Rice", hallTid: 1 },
  ]);
});

test("pickPostLogComparisonPair treats a never-compared candidate (comparisonCount 0, absent from rankedDishes) as least-compared", () => {
  const entries = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Beans", hallTid: 1 } }),
    entry({ id: "3", source: { type: "umass-menu", dishName: "Rice", hallTid: 1 } }),
  ];
  // Beans has been compared before; Rice has never been rated at all (absent from rankedDishes).
  const rankedDishes: RankedDish[] = [{ dishName: "Beans", hallTid: 1, rating: 1500, comparisonCount: 3 }];
  const pair = pickPostLogComparisonPair(entries, { dishName: "Chicken", hallTid: 1 }, rankedDishes);
  assert.deepEqual(pair, [
    { dishName: "Chicken", hallTid: 1 },
    { dishName: "Rice", hallTid: 1 },
  ]);
});
