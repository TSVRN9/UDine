import assert from "node:assert/strict";
import { test } from "node:test";
import { applyComparison, favoriteDiningHalls, rankDishes } from "./ranking.ts";
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

test("favoriteDiningHalls ranks halls by average dish rating, highest first", () => {
  const dishes: RankedDish[] = [
    { dishName: "A1", hallTid: 1, rating: 1400, comparisonCount: 1 },
    { dishName: "A2", hallTid: 1, rating: 1400, comparisonCount: 1 },
    { dishName: "B1", hallTid: 2, rating: 1700, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1700, comparisonCount: 1 },
  ];
  assert.deepEqual(favoriteDiningHalls(dishes), [2, 1]);
});

test("favoriteDiningHalls excludes halls below the minimum rated-dish threshold", () => {
  const dishes: RankedDish[] = [
    { dishName: "OneHit", hallTid: 9, rating: 2000, comparisonCount: 1 }, // only 1 rated dish at hall 9
    { dishName: "B1", hallTid: 2, rating: 1500, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1500, comparisonCount: 1 },
  ];
  assert.deepEqual(favoriteDiningHalls(dishes), [2]);
});

test("favoriteDiningHalls respects topN", () => {
  const dishes: RankedDish[] = [1, 2, 3].flatMap((hallTid) => [
    { dishName: `${hallTid}a`, hallTid, rating: 1500 + hallTid, comparisonCount: 1 },
    { dishName: `${hallTid}b`, hallTid, rating: 1500 + hallTid, comparisonCount: 1 },
  ]);
  assert.equal(favoriteDiningHalls(dishes, 2).length, 2);
});
