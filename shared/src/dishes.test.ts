import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchDishCatalog } from "./dishes.ts";

/**
 * Minimal stand-in for the SupabaseClient methods fetchDishCatalog actually calls -- same
 * philosophy as sync.test.ts's makeSupabaseMock: not a real PostgrestFilterBuilder, just enough
 * chainable shape (.select().order().gt()?.range(), awaitable) to drive the function under test
 * without a network call. `allRows` is sliced by exactly the `.range(from, to)` the caller
 * requests, same as real PostgREST honors a range at or under its own max_rows cap -- a mock that
 * just returned the whole array regardless of `.range()` would hide the exact truncation bug this
 * table is a few thousand rows away from hitting (see supabase/config.toml's max_rows and
 * supabase/functions/_shared/paging.ts's own doc comment for the sibling incident, issue #261).
 */
function makeSupabaseMock(allRows: unknown[], options: { error?: unknown } = {}) {
  const calls: { table: string; select: string; order?: string; gt?: [string, string]; range?: [number, number] }[] = [];

  function builder(table: string, select: string, order?: string, gt?: [string, string], range?: [number, number]) {
    return {
      order(column: string) {
        return builder(table, select, column, gt, range);
      },
      gt(column: string, value: string) {
        return builder(table, select, order, [column, value], range);
      },
      range(from: number, to: number) {
        return builder(table, select, order, gt, [from, to]);
      },
      then(resolve: (result: { data: unknown[] | null; error: unknown }) => void) {
        calls.push({ table, select, order, gt, range });
        if (options.error) {
          resolve({ data: null, error: options.error });
          return;
        }
        const [from, to] = range ?? [0, allRows.length - 1];
        resolve({ data: allRows.slice(from, to + 1), error: null });
      },
    };
  }

  return {
    supabase: {
      from(table: string) {
        return { select: (select: string) => builder(table, select) };
      },
      // biome-ignore lint: test double, shape doesn't need to match SupabaseClient exactly
    } as any,
    calls,
  };
}

function dishRow(name: string, updatedAt = "2026-09-05T08:00:00.000Z") {
  return { dish_name: name, nutrition: { calories: 200, servingSize: "1 each" }, allergens: ["Gluten"], diet_tags: ["Halal"], updated_at: updatedAt };
}

test("fetchDishCatalog: with no updatedSince, selects the whole table (one page) and maps rows to DishCatalogEntry", async () => {
  const { supabase, calls } = makeSupabaseMock([dishRow("Chicken Tenders")]);

  const result = await fetchDishCatalog(supabase);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "dishes");
  assert.equal(calls[0].gt, undefined);
  assert.deepEqual(result, [
    {
      dishName: "Chicken Tenders",
      nutrition: { calories: 200, servingSize: "1 each" },
      allergens: ["Gluten"],
      dietTags: ["Halal"],
      updatedAt: "2026-09-05T08:00:00.000Z",
    },
  ]);
});

test("fetchDishCatalog: with updatedSince, filters on updated_at > updatedSince for a cheap incremental sync", async () => {
  const { supabase, calls } = makeSupabaseMock([]);

  await fetchDishCatalog(supabase, "2026-09-01T00:00:00.000Z");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].gt, ["updated_at", "2026-09-01T00:00:00.000Z"]);
});

test("fetchDishCatalog: orders by dish_name (the table's own primary key) so paging across separate requests can't skip or duplicate rows", async () => {
  const { supabase, calls } = makeSupabaseMock([dishRow("A")]);
  await fetchDishCatalog(supabase);
  assert.equal(calls[0].order, "dish_name");
});

test("fetchDishCatalog: a table with more rows than PostgREST's max_rows page cap (1000) is paged past, not silently truncated to page 1", async () => {
  // Real PostgREST/config.toml max_rows is 1000; this table can hold "a few thousand" dishes per
  // the migration's own comment, so an unpaginated .select() would silently return only the first
  // 1000 rows with no error at all -- the same failure class issue #261 already fixed on the write
  // side for favorited_foods/profiles (see supabase/functions/_shared/paging.ts). 1005 rows forces
  // exactly the page-boundary case: a full first page (1000, non-final) plus a short second page
  // (5, final) -- fetchDishCatalog must not stop after the first, full-length page.
  const allNames = Array.from({ length: 1005 }, (_, i) => `Dish ${i}`);
  const { supabase, calls } = makeSupabaseMock(allNames.map((n) => dishRow(n)));

  const result = await fetchDishCatalog(supabase);

  assert.deepEqual(
    result.map((d) => d.dishName),
    allNames,
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].range, [0, 999]);
  assert.deepEqual(calls[1].range, [1000, 1999]);
});

test("fetchDishCatalog: an empty table returns an empty array, not null/undefined", async () => {
  const { supabase } = makeSupabaseMock([]);
  const result = await fetchDishCatalog(supabase);
  assert.deepEqual(result, []);
});

test('fetchDishCatalog: rejects when Supabase reports a PostgREST error, so an incremental sync never silently treats a failure as "nothing new"', async () => {
  const { supabase } = makeSupabaseMock([], { error: { message: "permission denied" } });
  await assert.rejects(() => fetchDishCatalog(supabase));
});
