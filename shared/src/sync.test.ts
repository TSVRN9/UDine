import assert from "node:assert/strict";
import { test } from "node:test";
import { syncDiningHallRanks } from "./sync.ts";
import type { RankedDish } from "./types.ts";

/** Minimal stand-in for the SupabaseClient methods syncDiningHallRanks actually calls. */
function makeSupabaseMock(inserted: { table: string; rows: unknown[] }[], insertError: unknown = null) {
  return {
    from(table: string) {
      return {
        delete() {
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert(rows: unknown[]) {
          inserted.push({ table, rows });
          return Promise.resolve({ error: insertError });
        },
      };
    },
    // biome-ignore lint: test double, shape doesn't need to match SupabaseClient exactly
  } as any;
}

test("syncDiningHallRanks pushes only the ranked subset, with correct 1-based ranks", async () => {
  const dishes: RankedDish[] = [
    { dishName: "A1", hallTid: 1, rating: 1400, comparisonCount: 1 },
    { dishName: "A2", hallTid: 1, rating: 1400, comparisonCount: 1 },
    { dishName: "B1", hallTid: 2, rating: 1700, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1700, comparisonCount: 1 },
    { dishName: "OneHit3", hallTid: 3, rating: 2000, comparisonCount: 1 }, // below threshold, stays unranked
  ];
  const inserted: { table: string; rows: unknown[] }[] = [];
  await syncDiningHallRanks(makeSupabaseMock(inserted), "user-1", dishes);

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, "favorite_dining_halls");
  assert.deepEqual(inserted[0].rows, [
    { user_id: "user-1", hall_tid: 2, rank: 1 },
    { user_id: "user-1", hall_tid: 1, rank: 2 },
  ]);
});

test("syncDiningHallRanks resolves (does not throw) when the client rejects/throws", async () => {
  const throwingSupabase = {
    from() {
      throw new Error("network down");
    },
  } as any;
  await assert.doesNotReject(() => syncDiningHallRanks(throwingSupabase, "user-1", []));
});

test("syncDiningHallRanks resolves when Supabase reports a PostgREST error on insert, without throwing", async () => {
  const dishes: RankedDish[] = [
    { dishName: "B1", hallTid: 2, rating: 1500, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1500, comparisonCount: 1 },
  ];
  const inserted: { table: string; rows: unknown[] }[] = [];
  await assert.doesNotReject(() => syncDiningHallRanks(makeSupabaseMock(inserted, { message: "permission denied" }), "user-1", dishes));
});
