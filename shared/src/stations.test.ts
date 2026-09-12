import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeStationName, sortStationNames } from "./stations.ts";

test("normalizeStationName trims outer whitespace and collapses internal runs to one space", () => {
  assert.equal(normalizeStationName("Grab n'Go Hot "), "Grab n'Go Hot");
  assert.equal(normalizeStationName("International "), "International");
  assert.equal(normalizeStationName("Grab n'Go Cold "), "Grab n'Go Cold");
  assert.equal(normalizeStationName("Entrees"), "Entrees");
});

test("normalizeStationName strips confirmed hall-code suffixes (WOR, FRK HMP)", () => {
  // Ground truth pull (2026-09-12) confirmed these are the only two hall-code tokens in the feed.
  assert.equal(normalizeStationName("Latino 1  WOR"), "Latino 1");
  assert.equal(normalizeStationName("Latino 2  WOR"), "Latino 2");
  assert.equal(normalizeStationName("Latino FRK HMP"), "Latino");
  assert.equal(normalizeStationName("Omelet WOR"), "Omelet");
});

test("sortStationNames orders hot mains before sides before salad/soup before bread/dessert, real station names (2026-09-11 pull)", () => {
  const names = [
    "Desserts",
    "Soups",
    "Vegetables",
    "Grill Station",
    "Breads",
    "Sushi",
    "Salad Bar/Dressings",
    "Starches",
  ];
  assert.deepEqual(sortStationNames(names), ["Grill Station", "Sushi", "Vegetables", "Starches", "Salad Bar/Dressings", "Soups", "Breads", "Desserts"]);
});

test("sortStationNames puts Grab 'N Go stations last", () => {
  const names = ["Grab n'Go Hot", "Entrees", "Desserts"];
  assert.deepEqual(sortStationNames(names), ["Entrees", "Desserts", "Grab n'Go Hot"]);
});

test("sortStationNames matches 'GF ' abbreviation to the same bucket as spelled-out 'Gluten Free'", () => {
  const names = ["GF Hot Breakfast", "Gluten Free", "Desserts"];
  const sorted = sortStationNames(names);
  assert.deepEqual(sorted.slice(0, 2).sort(), ["GF Hot Breakfast", "Gluten Free"]);
  assert.equal(sorted[2], "Desserts");
});

test("sortStationNames places an unrecognized station name alphabetically after every matched bucket, not first-seen order", () => {
  const names = ["Desserts", "Some New Station UMass Adds Later", "Entrees"];
  assert.deepEqual(sortStationNames(names), ["Entrees", "Desserts", "Some New Station UMass Adds Later"]);
});

test("sortStationNames is stable and deterministic regardless of input order", () => {
  const a = ["Desserts", "Entrees", "Soups"];
  const b = ["Soups", "Desserts", "Entrees"];
  assert.deepEqual(sortStationNames(a), sortStationNames(b));
});

test("sortStationNames groups every real station name observed across all 4 halls (2026-09-11 pull) without throwing", () => {
  const realNames = [
    "Breads",
    "Breakfast Entrees",
    "Breakfast Pastries",
    "Deli Bar",
    "Desserts",
    "Display Station",
    "Entrees",
    "Express",
    "GF Hot Breakfast",
    "Gluten Free",
    "Grab n'Go Breakfast",
    "Grab n'Go Cold",
    "Grab n'Go Hot",
    "Grill Station",
    "International",
    "Latino 1 WOR",
    "Latino 2 WOR",
    "Latino FRK HMP",
    "Mediterranean",
    "Noodle Bowl",
    "Omelet WOR",
    "Pasta Bar",
    "Pizza",
    "Salad Bar/Dressings",
    "Seasons",
    "Soups",
    "Starches",
    "Stir Fry Station",
    "Street Food",
    "Sushi",
    "Tandoor",
    "Toppings",
    "Vegetables",
    "Vegetarian Line",
  ];
  const sorted = sortStationNames(realNames);
  assert.equal(sorted.length, realNames.length);
  assert.deepEqual(new Set(sorted), new Set(realNames));
  // Every Grab 'N Go station sorts after every non-Grab station.
  const lastNonGrabIndex = sorted.map((n) => !n.startsWith("Grab")).lastIndexOf(true);
  const firstGrabIndex = sorted.findIndex((n) => n.startsWith("Grab"));
  assert.ok(firstGrabIndex === -1 || firstGrabIndex > lastNonGrabIndex);
});
