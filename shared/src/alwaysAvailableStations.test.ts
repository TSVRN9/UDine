import assert from "node:assert/strict";
import { test } from "node:test";
import { ALWAYS_AVAILABLE_STATIONS } from "./alwaysAvailableStations.ts";

const VALID_STATIONS = new Set(["Salad Bar", "Yogurt Bar", "Pizza"]);

test("every entry has a real station name, a real hall tid (1-4), and a non-empty dish list with no duplicates", () => {
  for (const entry of ALWAYS_AVAILABLE_STATIONS) {
    assert.ok(VALID_STATIONS.has(entry.station), `unexpected station name: ${entry.station}`);
    assert.ok(Number.isInteger(entry.hallTid) && entry.hallTid >= 1 && entry.hallTid <= 4, `hallTid out of range: ${entry.hallTid}`);
    assert.ok(entry.dishNames.length > 0, `${entry.station} @ hall ${entry.hallTid} has no dishes`);
    assert.equal(new Set(entry.dishNames).size, entry.dishNames.length, `${entry.station} @ hall ${entry.hallTid} has a duplicate dish name`);
  }
});

test("no (station, hallTid) pair is listed twice -- each hall's station gets exactly one entry", () => {
  const keys = ALWAYS_AVAILABLE_STATIONS.map((e) => `${e.station}@${e.hallTid}`);
  assert.equal(new Set(keys).size, keys.length, `duplicate (station, hallTid) pair: ${JSON.stringify(keys)}`);
});

// Ground truth captured live 2026-09-14 against af-foodpro1.campus.ads.umass.edu's longmenu.aspx
// (see this file's own header): Pizza exists at all 4 halls, Salad Bar only at Worcester (1) and
// Berkshire (4), and no itemized Yogurt Bar was found at any hall. Pinned here so a future
// hand-edit that silently drops a real hall's Pizza row (or "fixes" the Salad Bar gap by inventing
// one for Franklin/Hampshire) fails loudly instead of quietly shipping wrong data.
test("matches the live 2026-09-14 ground truth: Pizza at every hall, Salad Bar only at Worcester/Berkshire, no Yogurt Bar", () => {
  const pizzaHalls = ALWAYS_AVAILABLE_STATIONS.filter((e) => e.station === "Pizza")
    .map((e) => e.hallTid)
    .sort();
  assert.deepEqual(pizzaHalls, [1, 2, 3, 4]);

  const saladBarHalls = ALWAYS_AVAILABLE_STATIONS.filter((e) => e.station === "Salad Bar")
    .map((e) => e.hallTid)
    .sort();
  assert.deepEqual(saladBarHalls, [1, 4]);

  assert.equal(
    ALWAYS_AVAILABLE_STATIONS.some((e) => e.station === "Yogurt Bar"),
    false,
  );
});
