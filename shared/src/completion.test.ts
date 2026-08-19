import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemorySeenDishesStorage, hallCompletion } from "./completion.ts";
import { DINING_HALLS } from "./umassDining.ts";
import type { LogEntry } from "./types.ts";

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

// --- InMemorySeenDishesStorage -------------------------------------------------------------------

test("InMemorySeenDishesStorage recordSeen/getAllSeenDishNames round-trips and de-dupes within a hall", async () => {
  const storage = new InMemorySeenDishesStorage();
  await storage.recordSeen(1, ["Chicken", "Beans"]);
  await storage.recordSeen(1, ["Beans", "Rice"]); // "Beans" repeated, "Chicken" not seen again this fetch
  const seen = (await storage.getAllSeenDishNames()).get(1)!;
  assert.deepEqual(seen.sort(), ["Beans", "Chicken", "Rice"]);
});

test("InMemorySeenDishesStorage keeps distinct dishes previously seen even if absent from a later fetch", async () => {
  const storage = new InMemorySeenDishesStorage();
  await storage.recordSeen(1, ["Chicken"]);
  await storage.recordSeen(1, ["Beans"]); // Chicken not in this fetch's list
  const seen = (await storage.getAllSeenDishNames()).get(1)!;
  assert.deepEqual(seen.sort(), ["Beans", "Chicken"]);
});

test("InMemorySeenDishesStorage tracks halls independently", async () => {
  const storage = new InMemorySeenDishesStorage();
  await storage.recordSeen(1, ["Chicken"]);
  await storage.recordSeen(2, ["Fish"]);
  const all = await storage.getAllSeenDishNames();
  assert.deepEqual(all.get(1), ["Chicken"]);
  assert.deepEqual(all.get(2), ["Fish"]);
});

test("InMemorySeenDishesStorage getAllSeenDishNames omits a hall with no recorded fetches", async () => {
  const storage = new InMemorySeenDishesStorage();
  await storage.recordSeen(1, ["Chicken"]);
  assert.equal((await storage.getAllSeenDishNames()).has(4), false);
});

test("InMemorySeenDishesStorage getAllSeenDishNames returns every tracked hall's distinct dishes", async () => {
  const storage = new InMemorySeenDishesStorage();
  await storage.recordSeen(1, ["Chicken", "Beans"]);
  await storage.recordSeen(2, ["Fish"]);
  const all = await storage.getAllSeenDishNames();
  assert.deepEqual([...all.get(1)!].sort(), ["Beans", "Chicken"]);
  assert.deepEqual([...all.get(2)!].sort(), ["Fish"]);
});

// --- hallCompletion --------------------------------------------------------------------------------

test("hallCompletion always returns all 4 dining halls, even ones with nothing seen or logged", () => {
  const result = hallCompletion(new Map(), []);
  assert.equal(result.length, DINING_HALLS.length);
  assert.deepEqual(
    result.map((r) => r.hallTid).sort(),
    DINING_HALLS.map((h) => h.tid).sort(),
  );
});

test("hallCompletion: a hall with nothing seen has seenDistinct 0, loggedDistinct 0, and pct 0 (not NaN from 0/0)", () => {
  const result = hallCompletion(new Map(), []);
  const worcester = result.find((r) => r.hallTid === 1)!;
  assert.deepEqual(worcester, { hallTid: 1, loggedDistinct: 0, seenDistinct: 0, pct: 0 });
});

test("hallCompletion counts distinct seen dishes as the denominator", () => {
  const seen = new Map([[1, ["Chicken", "Beans", "Rice"]]]);
  const result = hallCompletion(seen, []);
  const worcester = result.find((r) => r.hallTid === 1)!;
  assert.equal(worcester.seenDistinct, 3);
});

test("hallCompletion counts distinct logged dishes (deduped, same as ranking.ts's distinctLoggedDishes) that were also seen, as the numerator", () => {
  const seen = new Map([[1, ["Chicken", "Beans", "Rice"]]]);
  const logged = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }), // repeat, shouldn't double-count
    entry({ id: "3", source: { type: "umass-menu", dishName: "Beans", hallTid: 1 } }),
  ];
  const result = hallCompletion(seen, logged);
  const worcester = result.find((r) => r.hallTid === 1)!;
  assert.equal(worcester.loggedDistinct, 2);
  assert.equal(worcester.seenDistinct, 3);
  assert.equal(worcester.pct, 67); // round(100 * 2/3)
});

test("hallCompletion excludes a logged dish this device never recorded seeing, keeping pct <= 100", () => {
  // Log predates seen-tracking (or was logged on another device): "Tofu" was logged at hall 1 but
  // never appears in the seen set. Honest-by-construction denominator means it can't count as
  // completion progress against a menu this device never observed.
  const seen = new Map([[1, ["Chicken"]]]);
  const logged = [
    entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } }),
    entry({ id: "2", source: { type: "umass-menu", dishName: "Tofu", hallTid: 1 } }),
  ];
  const result = hallCompletion(seen, logged);
  const worcester = result.find((r) => r.hallTid === 1)!;
  assert.equal(worcester.loggedDistinct, 1);
  assert.equal(worcester.pct, 100);
});

test("hallCompletion ignores non-umass-menu (barcode) log entries", () => {
  const seen = new Map([[1, ["Chicken"]]]);
  const logged = [entry({ id: "1", source: { type: "off", barcode: "012345", productName: "Granola Bar" } })];
  const result = hallCompletion(seen, logged);
  const worcester = result.find((r) => r.hallTid === 1)!;
  assert.equal(worcester.loggedDistinct, 0);
});

test("hallCompletion keeps halls independent — logging at one hall doesn't affect another's completion", () => {
  const seen = new Map([
    [1, ["Chicken"]],
    [2, ["Fish", "Tofu"]],
  ]);
  const logged = [entry({ id: "1", source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 } })];
  const result = hallCompletion(seen, logged);
  assert.deepEqual(result.find((r) => r.hallTid === 1), { hallTid: 1, loggedDistinct: 1, seenDistinct: 1, pct: 100 });
  assert.deepEqual(result.find((r) => r.hallTid === 2), { hallTid: 2, loggedDistinct: 0, seenDistinct: 2, pct: 0 });
});

test("hallCompletion pct is a whole-number percentage (0-100), rounded", () => {
  const seen = new Map([[1, ["A", "B", "C"]]]);
  const logged = [entry({ id: "1", source: { type: "umass-menu", dishName: "A", hallTid: 1 } })];
  const result = hallCompletion(seen, logged);
  // 1/3 = 33.333... -> rounds to 33, and must be an integer, not a float
  const worcester = result.find((r) => r.hallTid === 1)!;
  assert.equal(worcester.pct, 33);
  assert.equal(Number.isInteger(worcester.pct), true);
});
