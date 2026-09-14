// Red-first tests for the bounded-pool fix to this function's two crawl phases (pr-reviewer finding
// on PR #468): the old `for (const ...) { await fetch(...); await sleep(...) }` loops ran discovery's
// 96 longmenu.aspx requests and up to 100 label.aspx requests fully sequentially -- measured live at
// ~45s for discovery alone, the same shape that killed populate-dishes/check-favorited-foods with
// platform Gateway Timeouts at just 4 sequential fetches (docs/decisions-log.md,
// fix/cron-sequential-fetch-timeout). Unlike that sibling fix (4 halls, full Promise.all fan-out),
// this crawl has 96-100 requests against one upstream host, so the fix is a BOUNDED pool
// (CRAWL_CONCURRENCY lanes), not full fan-out -- these tests assert both "not sequential" and
// "never exceeds the cap", not just "all ran concurrently".
//
//
// Also covers the batched-upsert follow-up (pr-reviewer's second-round finding on PR #468): the
// pooled fix above still only measured discoverAllDishes alone as its "well clear of the danger
// zone" evidence -- the FULL crawl (discovery + label-fetch together, the initial-backlog-clearing
// worst case) measured live at ~8.7-8.8s, right at the floor of the observed failure zone. Fixed with
// two changes: MAX_LABEL_FETCHES_PER_RUN lowered 100->50 for margin, and fetchAllLabels now upserts
// every UPSERT_BATCH_SIZE rows as they complete instead of collecting all of them and upserting once
// at the very end -- so a mid-run platform kill loses at most one batch, not the whole run's
// discoveries. See docs/decisions-log.md's "corrected timing" follow-up for the real numbers.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-retail-dishes/concurrency.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { runPool, discoverAllDishes, fetchAllLabels } = await import("./index.ts");
type RetailLocation = Parameters<typeof discoverAllDishes>[0][number];

// A real label.aspx Nutrition Facts fragment is unnecessary here -- parseLabelNutrition's own
// correctness is parser.test.ts's job. This only needs a page with SOME Calories figure so
// fetchAllLabels' row-building path (not just its concurrency) is covered: dropping the
// `rows.push` or the label-count cap in fetchAllLabels turns this red without touching runPool.
const STUB_LABEL_HTML = "<b>Calories&nbsp;100</b>";

Deno.test("fetchAllLabels fetches every entry's label.aspx and returns one row per successful lookup", async () => {
  const entries: [string, { labelPath: string; locationNum: number }][] = [
    ["Dish A", { labelPath: "label.aspx?RecNumAndPort=1", locationNum: 8 }],
    ["Dish B", { labelPath: "label.aspx?RecNumAndPort=2", locationNum: 14 }],
    ["Dish C", { labelPath: "label.aspx?RecNumAndPort=3", locationNum: 23 }],
  ];
  const fetchImpl = (async () => new Response(STUB_LABEL_HTML, { status: 200 })) as typeof fetch;

  const rows = await fetchAllLabels(entries, "2026-09-14T12:00:00.000Z", fetchImpl, 2);

  if (rows.length !== 3) throw new Error(`expected 3 rows (one per entry), got ${rows.length}`);
  const names = rows.map((r) => r.dish_name).sort();
  if (JSON.stringify(names) !== JSON.stringify(["Dish A", "Dish B", "Dish C"])) {
    throw new Error(`unexpected dish names: ${JSON.stringify(names)}`);
  }
});

Deno.test("fetchAllLabels upserts in batches as rows complete, not once at the very end", async () => {
  const entries: [string, { labelPath: string; locationNum: number }][] = Array.from({ length: 30 }, (_, i) => [
    `Dish ${i}`,
    { labelPath: `label.aspx?RecNumAndPort=${i}`, locationNum: 8 },
  ]);
  const fetchImpl = (async () => new Response(STUB_LABEL_HTML, { status: 200 })) as typeof fetch;
  const batchSizes: number[] = [];
  const upsertBatch = (batch: unknown[]) => {
    batchSizes.push(batch.length);
    return Promise.resolve();
  };

  const rows = await fetchAllLabels(entries, "2026-09-14T12:00:00.000Z", fetchImpl, 6, upsertBatch);

  if (rows.length !== 30) throw new Error(`expected 30 rows, got ${rows.length}`);
  // A revert to "collect everything, upsert once at the end" would produce exactly one call of 30 --
  // this is the case that actually distinguishes batching from the old single-upsert shape.
  if (batchSizes.length < 2) {
    throw new Error(`expected multiple incremental upsert calls for 30 rows, got ${batchSizes.length} call(s): ${JSON.stringify(batchSizes)}`);
  }
  if (Math.max(...batchSizes) > 25) throw new Error(`a batch exceeded the 25-row cap: ${JSON.stringify(batchSizes)}`);
  const total = batchSizes.reduce((a, b) => a + b, 0);
  if (total !== 30) throw new Error(`batches summed to ${total} rows, expected 30: ${JSON.stringify(batchSizes)}`);
});

Deno.test("runPool caps in-flight work at the given concurrency without running fully sequential", async () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  let inFlight = 0;
  let maxInFlight = 0;
  const seen: number[] = [];

  await runPool(items, 4, async (item) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    seen.push(item);
  });

  if (seen.length !== 12) throw new Error(`expected all 12 items processed, got ${seen.length}`);
  if (maxInFlight < 2) throw new Error(`pool ran fully sequential (maxInFlight=${maxInFlight})`);
  if (maxInFlight > 4) throw new Error(`pool exceeded its concurrency cap: ${maxInFlight} > 4`);
});

Deno.test("discoverAllDishes fetches longmenu.aspx through a bounded pool, not one at a time", async () => {
  const locations: RetailLocation[] = [
    { locationNum: 8, locationNumRaw: "08", hrefLocationName: "Whitmore+Cafe", displayName: "Whitmore Cafe" },
    { locationNum: 14, locationNumRaw: "14", hrefLocationName: "Bluewall+-+Grill", displayName: "Bluewall - Grill" },
  ];
  // 2 locations x 4 meal periods (MEAL_PERIODS) = 8 tasks total.
  const concurrency = 3;
  let started = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let releaseFirstBatch: () => void = () => {};
  // Every stub call blocks until `concurrency` calls have started -- a strictly sequential
  // implementation (one lane at a time) deadlocks on this and never reaches `concurrency` started
  // calls, so the race below times out under the old code and completes immediately under the fix.
  const gate = new Promise<void>((resolve) => {
    releaseFirstBatch = resolve;
  });
  const fetchImpl = (async () => {
    started++;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (started === concurrency) releaseFirstBatch();
    await gate;
    inFlight--;
    return new Response("", { status: 200, headers: { "Content-Type": "text/html" } });
  }) as typeof fetch;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("timed out -- pool is running fully sequential (stuck waiting on the gate)")),
      2000,
    );
  });

  try {
    await Promise.race([discoverAllDishes(locations, "cookie=1", fetchImpl, concurrency), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }

  if (started !== 8) throw new Error(`expected all 8 (location x meal) tasks to run, got ${started}`);
  if (maxInFlight > concurrency) throw new Error(`pool exceeded its concurrency cap: ${maxInFlight} > ${concurrency}`);
});
