import assert from "node:assert/strict";
import { test } from "node:test";
import { syncDiningHallRanks, syncFavoritedFoods, syncSharedStat } from "./sync.ts";
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

type FavoriteHallRow = { user_id: string; hall_tid: number; rank: number };

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * A supabase mock whose delete()/insert() resolve after a configurable delay against one shared
 * `table` array -- lets a test force two concurrent syncDiningHallRanks calls to have their
 * network round-trips land in a chosen order, regardless of call order.
 */
function makeRacySupabaseMock(table: FavoriteHallRow[], delays: { delete: number; insert: number }) {
  return {
    from() {
      return {
        delete() {
          return {
            eq: async (_col: string, userId: string) => {
              await delay(delays.delete, undefined);
              for (let i = table.length - 1; i >= 0; i--) {
                if (table[i].user_id === userId) table.splice(i, 1);
              }
              return { error: null };
            },
          };
        },
        insert: async (rows: FavoriteHallRow[]) => {
          await delay(delays.insert, undefined);
          table.push(...rows);
          return { error: null };
        },
      };
    },
    // biome-ignore lint: test double, shape doesn't need to match SupabaseClient exactly
  } as any;
}

// #189: two overlapping syncDiningHallRanks calls (e.g. two quick rank.tsx comparisons) each do
// their own unserialized delete-then-insert. Call A is dispatched first but its round-trip is
// slower than call B's, so the actual network interleave is del(A), del(B), ins(B), ins(A) -- B's
// insert lands, then A's *stale* delete wipes it and A's *stale* insert leaves A's ranks behind,
// even though B was the more recent comparison. Final state must match the LAST call (B), not
// whichever call's round-trip happened to finish last.
test("syncDiningHallRanks: two overlapping calls don't interleave into a stale final state", async () => {
  const table: FavoriteHallRow[] = [];
  const supabaseA = makeRacySupabaseMock(table, { delete: 30, insert: 30 });
  const supabaseB = makeRacySupabaseMock(table, { delete: 5, insert: 5 });

  const ranksA: RankedDish[] = [
    { dishName: "A1", hallTid: 1, rating: 1700, comparisonCount: 1 },
    { dishName: "A2", hallTid: 1, rating: 1700, comparisonCount: 1 },
  ];
  const ranksB: RankedDish[] = [
    { dishName: "B1", hallTid: 2, rating: 1700, comparisonCount: 1 },
    { dishName: "B2", hallTid: 2, rating: 1700, comparisonCount: 1 },
  ];

  await Promise.all([syncDiningHallRanks(supabaseA, "user-1", ranksA), syncDiningHallRanks(supabaseB, "user-1", ranksB)]);

  assert.deepEqual(
    table.map((r) => r.hall_tid),
    [2],
  );
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

/** Minimal stand-in for the SupabaseClient methods syncSharedStat actually calls. */
function makeSharedStatsSupabaseMock(upserted: { table: string; rows: unknown[] }[], upsertError: unknown = null) {
  return {
    from(table: string) {
      return {
        upsert(rows: unknown) {
          upserted.push({ table, rows: [rows] });
          return Promise.resolve({ error: upsertError });
        },
      };
    },
    // biome-ignore lint: test double, shape doesn't need to match SupabaseClient exactly
  } as any;
}

test("syncSharedStat upserts only the one named field, alongside user_id", async () => {
  const upserted: { table: string; rows: unknown[] }[] = [];
  await syncSharedStat(makeSharedStatsSupabaseMock(upserted), "user-1", "top_foods", [{ dishName: "Pizza", score: 9.4, hallName: "Berkshire" }]);

  assert.equal(upserted.length, 1);
  assert.equal(upserted[0].table, "shared_stats");
  assert.deepEqual(upserted[0].rows, [{ user_id: "user-1", top_foods: [{ dishName: "Pizza", score: 9.4, hallName: "Berkshire" }] }]);
});

// A revoke sends the field with an explicit `null` in the payload -- PostgREST's upsert writes
// that as SQL NULL for exactly that column (see the shared_stats migration's json-null check
// constraints, which exist specifically to make sure this can never instead write a JSON null).
// This asserts the JS-level contract: the payload really does carry `null`, not an omitted key
// (which upsert would just leave untouched on conflict, not clear).
test("syncSharedStat(field, null) upserts the field as an explicit null -- a revoke, not a no-op", async () => {
  const upserted: { table: string; rows: unknown[] }[] = [];
  await syncSharedStat(makeSharedStatsSupabaseMock(upserted), "user-1", "completion", null);

  assert.deepEqual(upserted[0].rows, [{ user_id: "user-1", completion: null }]);
});

test("syncSharedStat resolves with { error: null } on success", async () => {
  const upserted: { table: string; rows: unknown[] }[] = [];
  const result = await syncSharedStat(makeSharedStatsSupabaseMock(upserted), "user-1", "hall_ranks", [{ hallTid: 3, rank: 1 }]);
  assert.deepEqual(result, { error: null });
});

test("syncSharedStat resolves with the upsert's error instead of throwing", async () => {
  const upserted: { table: string; rows: unknown[] }[] = [];
  const result = await syncSharedStat(makeSharedStatsSupabaseMock(upserted, { message: "permission denied" }), "user-1", "completion", []);
  assert.deepEqual(result, { error: { message: "permission denied" } });
});

test("syncSharedStat resolves (does not throw) when the client rejects/throws", async () => {
  const throwingSupabase = {
    from() {
      throw new Error("network down");
    },
  } as any;
  await assert.doesNotReject(() => syncSharedStat(throwingSupabase, "user-1", "completion", []));
});
