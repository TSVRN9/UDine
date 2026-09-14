// Red-first tests for the three pieces of the 2026-09-11 staleness incident fix
// (docs/decisions-log.md): fetchAllHallDishes must fetch all halls concurrently (the sequential
// version routinely pushed total invocation time past whatever the platform enforces, killing the
// run with a bare Gateway Timeout / EDGE_FUNCTION_ERROR); buildPopulateResponse must make a
// total-outage day (0 rows across every hall) visibly distinct from a normal day, instead of the
// plain 200 it returned before; and upsertDishes must catch a thrown/rejected upsert instead of
// letting it escape as a bare, unlogged 500 (the previous inline `await ... .upsert(...)` had no
// try/catch at all).
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-dishes/handler.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

import type { DishRow } from "./index.ts";
const { fetchAllHallDishes, buildPopulateResponse, buildUpsertRows, upsertDishes } = await import("./index.ts");

Deno.test("fetchAllHallDishes fetches every hall concurrently, not one at a time", async () => {
  const hallTids = [1, 2, 3, 4];
  const started: number[] = [];
  let releaseAll: () => void = () => {};
  // Every stub call blocks until ALL 4 halls have started fetching. A sequential
  // implementation (await one hall, then the next) can never reach 4 started calls -- the first
  // call would block forever waiting on a gate that only opens once calls 2-4 have already
  // started, which can't happen until call 1 resolves. That's a deadlock, not a flaky timing
  // assertion: this test times out reliably under the old sequential code and completes
  // immediately under the fix.
  const gate = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });
  const fetchImpl = (async (url: string | URL) => {
    const tid = Number(new URL(url.toString()).searchParams.get("tid"));
    started.push(tid);
    if (started.length === hallTids.length) releaseAll();
    await gate;
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timed out -- halls are being fetched sequentially, not concurrently")), 2000),
  );

  const result = await Promise.race([fetchAllHallDishes(hallTids, fetchImpl), timeout]);
  if (started.length !== 4) throw new Error(`expected all 4 halls to start fetching, got ${started.length}`);
  if (result.size !== 4) throw new Error(`expected 4 halls in result map, got ${result.size}`);
});

function dish(name: string, hallTid: number): DishRow {
  return {
    dishName: name,
    hallTid,
    nutrition: {
      servingSize: "1 each",
      calories: 100,
      caloriesFromFat: 0,
      totalFatG: 0,
      satFatG: 0,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 0,
      dietaryFiberG: 0,
      sugarsG: 0,
      proteinG: 0,
    },
    allergens: [],
    dietTags: [],
  };
}

Deno.test("buildPopulateResponse: 0 rows across every hall is logged distinctly, closing the 2026-09-13 blind spot", async () => {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    const rows = buildUpsertRows(new Map(), "2026-09-14T08:00:00.000Z");
    const res = buildPopulateResponse(rows, null);
    // Deliberately still 200 -- a 0-row day is ambiguous (real outage vs. a legitimately dish-less
    // day, e.g. a campus closure) and a hard-failure status would false-alarm on the latter. The
    // fix for the blind spot is that this case is now distinguishable at all, via the warning.
    if (res.status !== 200) throw new Error(`expected 200 (0 rows is not itself an HTTP error), got ${res.status}`);
    const body = await res.json();
    if (body.dishesUpserted !== 0) throw new Error(`expected dishesUpserted 0, got ${JSON.stringify(body)}`);
    if (warnings.length !== 1) throw new Error(`expected exactly one console.warn distinguishing this run, got ${warnings.length}`);
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("buildPopulateResponse: a real upsert error still surfaces as 500", async () => {
  const merged = new Map([["Chicken Tenders", dish("Chicken Tenders", 1)]]);
  const rows = buildUpsertRows(merged, "2026-09-14T08:00:00.000Z");
  const res = buildPopulateResponse(rows, "connection reset");
  if (res.status !== 500) throw new Error(`expected 500, got ${res.status}`);
  const body = await res.json();
  if (body.error !== "connection reset") throw new Error(`expected upsert error message to pass through, got ${JSON.stringify(body)}`);
});

Deno.test("buildPopulateResponse: a normal successful day returns 200 with the upserted count", async () => {
  const merged = new Map([["Chicken Tenders", dish("Chicken Tenders", 1)]]);
  const rows = buildUpsertRows(merged, "2026-09-14T08:00:00.000Z");
  const res = buildPopulateResponse(rows, null);
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.dishesUpserted !== 1) throw new Error(`expected dishesUpserted 1, got ${JSON.stringify(body)}`);
});

// deno-lint-ignore no-explicit-any
function stubSupabase(upsertImpl: (...args: any[]) => Promise<{ error: { message: string } | null }>) {
  return { from: () => ({ upsert: upsertImpl }) } as unknown as Parameters<typeof upsertDishes>[0];
}

Deno.test("upsertDishes: a thrown/rejected upsert is caught and logged, not left to escape as a bare unlogged 500", async () => {
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const rows = buildUpsertRows(new Map([["Chicken Tenders", dish("Chicken Tenders", 1)]]), "2026-09-14T08:00:00.000Z");
    const supabase = stubSupabase(() => Promise.reject(new Error("connection reset mid-upsert")));
    const result = await upsertDishes(supabase, rows);
    if (result !== "connection reset mid-upsert") throw new Error(`expected the thrown error's message to surface, got ${JSON.stringify(result)}`);
    if (errors.length !== 1) throw new Error(`expected exactly one console.error for the caught throw, got ${errors.length}`);
  } finally {
    console.error = originalError;
  }
});

Deno.test("upsertDishes: a resolved {error} result (no throw) still surfaces the message", async () => {
  const rows = buildUpsertRows(new Map([["Chicken Tenders", dish("Chicken Tenders", 1)]]), "2026-09-14T08:00:00.000Z");
  const supabase = stubSupabase(() => Promise.resolve({ error: { message: "duplicate key" } }));
  const result = await upsertDishes(supabase, rows);
  if (result !== "duplicate key") throw new Error(`expected "duplicate key", got ${JSON.stringify(result)}`);
});

Deno.test("upsertDishes: a clean upsert returns null (no error)", async () => {
  const rows = buildUpsertRows(new Map([["Chicken Tenders", dish("Chicken Tenders", 1)]]), "2026-09-14T08:00:00.000Z");
  const supabase = stubSupabase(() => Promise.resolve({ error: null }));
  const result = await upsertDishes(supabase, rows);
  if (result !== null) throw new Error(`expected null, got ${JSON.stringify(result)}`);
});
