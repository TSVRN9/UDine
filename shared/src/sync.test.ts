import assert from "node:assert/strict";
import { test } from "node:test";
import { syncDiningHallRanks, syncFavoritedFoods } from "./sync.ts";
import type { Favorite, RankedDish } from "./types.ts";

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

/** Minimal stand-in for the SupabaseClient methods syncFavoritedFoods actually calls. */
function makeFavoritedFoodsSupabaseMock(inserted: { table: string; rows: unknown[] }[], opts: { deleteError?: unknown; insertError?: unknown } = {}) {
  return {
    from(table: string) {
      return {
        delete() {
          return { eq: () => Promise.resolve({ error: opts.deleteError ?? null }) };
        },
        insert(rows: unknown[]) {
          inserted.push({ table, rows });
          return Promise.resolve({ error: opts.insertError ?? null });
        },
      };
    },
    // biome-ignore lint: test double, shape doesn't need to match SupabaseClient exactly
  } as any;
}

test("syncFavoritedFoods pushes only dish favorites (not location favorites)", async () => {
  const favorites: Favorite[] = [
    { type: "dish", dishName: "Pizza" },
    { type: "location", hallTid: 1 },
    { type: "dish", dishName: "Salad" },
  ];
  const inserted: { table: string; rows: unknown[] }[] = [];
  await syncFavoritedFoods(makeFavoritedFoodsSupabaseMock(inserted), "user-1", favorites);

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, "favorited_foods");
  assert.deepEqual(inserted[0].rows, [
    { user_id: "user-1", dish_name: "Pizza" },
    { user_id: "user-1", dish_name: "Salad" },
  ]);
});

test("syncFavoritedFoods skips the insert call entirely when there are no dish favorites", async () => {
  const inserted: { table: string; rows: unknown[] }[] = [];
  await syncFavoritedFoods(makeFavoritedFoodsSupabaseMock(inserted), "user-1", []);
  assert.equal(inserted.length, 0);
});

// #45: syncFavoritedFoods used to await supabase.from(...).delete()/.insert() without checking
// the returned { error } — a PostgREST failure (RLS denial, expired session, ...) resolved
// normally and was silently discarded, so the caller's await chain continued as if it had
// succeeded even though no row existed. It has two call sites (mobile and web), neither wraps it
// in a try/catch, so it must never throw/reject — same contract as syncDiningHallRanks. Instead
// it returns { error } so each caller can log it and keep going (mobile: still reach
// push_tokens; web: still reach enablePush/disablePush).
test("syncFavoritedFoods resolves with the delete's error instead of throwing", async () => {
  const inserted: { table: string; rows: unknown[] }[] = [];
  const result = await syncFavoritedFoods(makeFavoritedFoodsSupabaseMock(inserted, { deleteError: { message: "permission denied" } }), "user-1", [
    { type: "dish", dishName: "Pizza" },
  ]);
  assert.deepEqual(result, { error: { message: "permission denied" } });
  assert.equal(inserted.length, 0, "should not attempt the insert once the delete failed");
});

test("syncFavoritedFoods resolves with the insert's error instead of throwing", async () => {
  const inserted: { table: string; rows: unknown[] }[] = [];
  const result = await syncFavoritedFoods(makeFavoritedFoodsSupabaseMock(inserted, { insertError: { message: "permission denied" } }), "user-1", [
    { type: "dish", dishName: "Pizza" },
  ]);
  assert.deepEqual(result, { error: { message: "permission denied" } });
});

test("syncFavoritedFoods resolves with { error: null } on success", async () => {
  const inserted: { table: string; rows: unknown[] }[] = [];
  const result = await syncFavoritedFoods(makeFavoritedFoodsSupabaseMock(inserted), "user-1", [{ type: "dish", dishName: "Pizza" }]);
  assert.deepEqual(result, { error: null });
});
