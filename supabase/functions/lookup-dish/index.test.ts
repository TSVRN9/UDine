// Red-first tests for lookup-dish's parsers + orchestration, against REAL captured markup from
// af-foodpro1.campus.ads.umass.edu (verified live 2026-09-14 with a real "Bacon" search.aspx call
// and label.aspx fetch -- see this function's own header comment and
// docs/apk-reverse-engineering.md's "FoodPro Web INA" section). The label.aspx nutrition-table
// fragments below are trimmed real markup; the allergens fragment is a synthetic snippet built
// from the exact `<span class="labelallergensvalue">...</span>` shape docs/decisions-log.md's
// `populate-retail-dishes` entry already confirmed live against a different dish (Bluewall's
// Cheeseburger) -- the real "Bacon" label used for the rest of this fixture happened to have no
// allergens listed.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/lookup-dish/index.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
const {
  normalizeQueryKey,
  parseSearchHits,
  extractRecNum,
  extractLocationNum,
  extractLocationName,
  selectCandidateHits,
  hallTidForLocationNum,
  parseLabelNutrition,
  parseLabelAllergens,
  cookieHeaderFromSetCookie,
  checkCatalogHit,
  checkRecentMiss,
  recordMiss,
  claimInflight,
  incrementAndCheckBudget,
  fetchFoodProCandidates,
  performLookup,
} = await import("./index.ts");

Deno.test("normalizeQueryKey trims, collapses whitespace, lowercases", () => {
  if (normalizeQueryKey("  Bacon   Bits  ") !== "bacon bits") throw new Error("normalizeQueryKey didn't normalize as expected");
});

// Real search.aspx response for "Bacon" (POST Action=SEARCH&strCurKeywords=Bacon), captured live
// 2026-09-14 -- one row per (recipe, date) occurrence, same RecNum repeats across many dates.
const SEARCH_FRAGMENT = `
<div class='searchcoldesc'><a href='label.aspx?locationNum=01&locationName=Worcester+Dining+Commons&dtdate=9%2f13%2f2026&RecNumAndPort=181767*1' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';"">Bacon</a></div>
<div class='searchcoldesc'><a href='label.aspx?locationNum=01&locationName=Worcester+Dining+Commons&dtdate=9%2f15%2f2026&RecNumAndPort=081010*1' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';"">Canadian Bacon</a></div>
<div class='searchcoldesc'><a href='label.aspx?locationNum=01&locationName=Worcester+Dining+Commons&dtdate=9%2f19%2f2026&RecNumAndPort=181767*1' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';"">Bacon</a></div>
<div class='searchcoldesc'><a href='label.aspx?locationNum=02&locationName=Franklin+Dining+Commons&dtdate=9%2f14%2f2026&RecNumAndPort=151207*1' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';"">Bacon</a></div>
`;

Deno.test("parseSearchHits extracts every searchcoldesc row's dish name + label.aspx path", () => {
  const hits = parseSearchHits(SEARCH_FRAGMENT);
  if (hits.length !== 4) throw new Error(`expected 4 hits, got ${hits.length}`);
  if (hits[0].dishName !== "Bacon") throw new Error(`expected "Bacon", got ${hits[0].dishName}`);
  if (!hits[0].labelPath.startsWith("label.aspx?locationNum=01")) throw new Error(`unexpected labelPath: ${hits[0].labelPath}`);
});

Deno.test("parseSearchHits returns an empty array for a 'No Result' page", () => {
  if (parseSearchHits("<html><body>No Result</body></html>").length !== 0) throw new Error("expected 0 hits");
});

Deno.test("extractRecNum/extractLocationNum/extractLocationName read the label.aspx query string", () => {
  const path = "label.aspx?locationNum=14&locationName=Bluewall+-+Grill&dtdate=9%2f14%2f2026&RecNumAndPort=060125*1";
  if (extractRecNum(path) !== "060125") throw new Error(`expected recnum 060125, got ${extractRecNum(path)}`);
  if (extractLocationNum(path) !== 14) throw new Error(`expected locationNum 14, got ${extractLocationNum(path)}`);
  if (extractLocationName(path) !== "Bluewall - Grill") throw new Error(`expected "Bluewall - Grill", got "${extractLocationName(path)}"`);
});

Deno.test("selectCandidateHits: exact-name filter drops substring matches like 'Canadian Bacon' for a 'Bacon' query", () => {
  const hits = parseSearchHits(SEARCH_FRAGMENT);
  const selected = selectCandidateHits(hits, "Bacon");
  if (selected.some((h) => h.dishName !== "Bacon")) throw new Error(`a non-exact match leaked through: ${JSON.stringify(selected)}`);
});

Deno.test("selectCandidateHits: dedupes by RecNum (the same recipe recurs across many search-result dates)", () => {
  const hits = parseSearchHits(SEARCH_FRAGMENT);
  const selected = selectCandidateHits(hits, "Bacon");
  // 3 "Bacon" rows in the fixture, but 2 have the same RecNum (181767) -- only 2 distinct recipes.
  if (selected.length !== 2) throw new Error(`expected 2 distinct-RecNum candidates, got ${selected.length}: ${JSON.stringify(selected)}`);
});

Deno.test("selectCandidateHits: caps at `max`", () => {
  const hits = parseSearchHits(SEARCH_FRAGMENT);
  const selected = selectCandidateHits(hits, "Bacon", 1);
  if (selected.length !== 1) throw new Error(`expected 1 (capped), got ${selected.length}`);
});

Deno.test("hallTidForLocationNum: a real hall (1-4) keeps its own tid; anything else is negated", () => {
  if (hallTidForLocationNum(1) !== 1) throw new Error("hall 1 should keep tid 1");
  if (hallTidForLocationNum(4) !== 4) throw new Error("hall 4 should keep tid 4");
  if (hallTidForLocationNum(14) !== -14) throw new Error("retail locationNum 14 should become -14");
});

// Trimmed real label.aspx markup for Bacon (RecNumAndPort=181767*1, Worcester), captured live
// 2026-09-14: 140 cal, 12g total fat, 4g sat fat, 0g trans fat, 40mg cholesterol, 399.9mg sodium,
// 0g carb, 0g fiber, 0g sugars, 8g protein, serving size "1 oz". No allergens listed for this dish.
const BACON_LABEL = `
<div class="labelrecipe">Bacon</div>
<font size="5" face="arial">Serving Size&nbsp;</font><font size="5" face="arial">1 oz</font><br>
<font size="5" face="arial"><b>Calories&nbsp;140</b></font><br>
<font size="5" face="arial">&nbsp;&nbsp;&nbsp;&nbsp;Calories from Fat&nbsp;0</font><br>
<font size="4" face="arial"><b>Total Fat&nbsp;</b></font><font face="arial" size="4">12g</font></font>
<font size="4" face="arial">&nbsp;&nbsp;Sat. Fat&nbsp;</font><font size="4" face="arial">4g</font>
<font size="4" face="arial">&nbsp;&nbsp;Trans Fat&nbsp;</font><font size="4" face="arial">0g</font>
<font size="4" face="arial"><b>Cholesterol&nbsp;</b></font><font size="4" face="arial">40mg</font>
<font size="4" face="arial"><b>Sodium&nbsp;</b></font><font size="4" face="arial">399.9mg</font>
<font size="4" face="arial"><b>Tot. Carb.&nbsp;</b></font><font size="4" face="arial">0g</font>
<font size="4" face="arial">&nbsp;&nbsp;Dietary Fiber&nbsp;</font><font size="4" face="arial">0g</font>
<font size="4" face="arial">&nbsp;&nbsp;Sugars&nbsp;</font><font size="4" face="arial">0g</font>
<font size="4" face="arial"><b>Protein&nbsp;</b></font><font size="4" face="arial">8g</font>
<span class="labelallergenscaption">ALLERGENS:&nbsp;&nbsp;</span><span class="labelallergensvalue"></span>
`;

Deno.test("parseLabelNutrition parses a real label.aspx nutrition table", () => {
  const n = parseLabelNutrition(BACON_LABEL);
  if (!n) throw new Error("expected a parsed nutrition object, got null");
  if (n.calories !== 140) throw new Error(`expected 140 calories, got ${n.calories}`);
  if (n.totalFatG !== 12) throw new Error(`expected 12g total fat, got ${n.totalFatG}`);
  if (n.cholesterolMg !== 40) throw new Error(`expected 40mg cholesterol, got ${n.cholesterolMg}`);
  if (n.sodiumMg !== 399.9) throw new Error(`expected 399.9mg sodium, got ${n.sodiumMg}`);
  if (n.proteinG !== 8) throw new Error(`expected 8g protein, got ${n.proteinG}`);
  if (n.servingSize !== "1 oz") throw new Error(`expected serving size "1 oz", got ${n.servingSize}`);
});

Deno.test("parseLabelNutrition returns null for a stale/expired RecNum page (no Calories figure at all)", () => {
  if (parseLabelNutrition("<html><body>nothing here</body></html>") !== null) throw new Error("expected null");
});

Deno.test("parseLabelAllergens: empty when the page lists none", () => {
  if (parseLabelAllergens(BACON_LABEL).length !== 0) throw new Error("expected no allergens for this fixture");
});

// Synthetic (see file header) but shaped exactly like the confirmed-live labelallergensvalue span.
Deno.test("parseLabelAllergens: comma-splits a populated allergens span", () => {
  const html = `<span class="labelallergensvalue">Milk, Gluten, Soy</span>`;
  const allergens = parseLabelAllergens(html);
  if (allergens.join(",") !== "Milk,Gluten,Soy") throw new Error(`unexpected allergens: ${JSON.stringify(allergens)}`);
});

Deno.test("cookieHeaderFromSetCookie strips per-cookie attributes", () => {
  const header = cookieHeaderFromSetCookie(["ASPSESSIONID=abc123; path=/; HttpOnly", "naFlag=1; path=/"]);
  if (header !== "ASPSESSIONID=abc123; naFlag=1") throw new Error(`unexpected cookie header: ${header}`);
});

// ---- Orchestration (stubbed Postgres, no real network/DB) ----

// deno-lint-ignore no-explicit-any
function stubSupabase(overrides: Record<string, any> = {}) {
  const tables: Record<string, any> = overrides.tables ?? {};
  const from = (table: string) => {
    if (tables[table]) return tables[table]();
    throw new Error(`stubSupabase: no stub registered for table "${table}"`);
  };
  return { from, rpc: overrides.rpc } as unknown as SupabaseClient;
}

Deno.test("checkCatalogHit: returns null on a clean miss (no matching row)", async () => {
  const supabase = stubSupabase({
    tables: {
      dishes: () => ({ select: () => ({ ilike: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
    },
  });
  const result = await checkCatalogHit(supabase, "Nonexistent Dish");
  if (result !== null) throw new Error(`expected null, got ${JSON.stringify(result)}`);
});

Deno.test("checkCatalogHit: maps a matching row to a LookupCandidate with empty location", async () => {
  const row = { dish_name: "Bacon", nutrition: { calories: 140 }, allergens: [], diet_tags: [], last_seen_hall_tid: 1 };
  const supabase = stubSupabase({
    tables: {
      dishes: () => ({ select: () => ({ ilike: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }) }),
    },
  });
  const result = await checkCatalogHit(supabase, "Bacon");
  if (!result || result.dishName !== "Bacon" || result.location !== "" || result.hallTid !== 1) {
    throw new Error(`unexpected candidate: ${JSON.stringify(result)}`);
  }
});

Deno.test("checkCatalogHit: escapes ilike's own %/_ wildcard characters in the user query -- a literal equality check, never a pattern match", async () => {
  let capturedPattern: string | undefined;
  const supabase = stubSupabase({
    tables: {
      dishes: () => ({
        select: () => ({
          ilike: (_col: string, pattern: string) => {
            capturedPattern = pattern;
            return { limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) };
          },
        }),
      }),
    },
  });
  await checkCatalogHit(supabase, "50% Off_Special");
  if (capturedPattern !== "50\\% Off\\_Special") throw new Error(`expected escaped pattern, got ${JSON.stringify(capturedPattern)}`);
});

Deno.test("checkRecentMiss: true when a recent miss row exists, gating the negative-cache TTL via `gt`", async () => {
  let capturedCutoff: string | undefined;
  const supabase = stubSupabase({
    tables: {
      dish_lookup_misses: () => ({
        select: () => ({
          eq: () => ({
            gt: (_col: string, cutoff: string) => {
              capturedCutoff = cutoff;
              return { maybeSingle: () => Promise.resolve({ data: { query_key: "bacon" } }) };
            },
          }),
        }),
      }),
    },
  });
  const now = new Date("2026-09-14T12:00:00.000Z");
  const isRecentMiss = await checkRecentMiss(supabase, "bacon", now);
  if (!isRecentMiss) throw new Error("expected true");
  if (capturedCutoff !== new Date(now.getTime() - 15 * 60_000).toISOString()) throw new Error(`unexpected TTL cutoff: ${capturedCutoff}`);
});

Deno.test("recordMiss: upserts the query_key with the current timestamp", async () => {
  let captured: unknown;
  const supabase = stubSupabase({
    tables: {
      dish_lookup_misses: () => ({
        upsert: (data: unknown) => {
          captured = data;
          return Promise.resolve({ error: null });
        },
      }),
    },
  });
  await recordMiss(supabase, "bacon", new Date("2026-09-14T12:00:00.000Z"));
  if (JSON.stringify(captured) !== JSON.stringify({ query_key: "bacon", checked_at: "2026-09-14T12:00:00.000Z" })) {
    throw new Error(`unexpected upsert payload: ${JSON.stringify(captured)}`);
  }
});

Deno.test("claimInflight: true (won the claim) when the ignore-duplicates upsert returns a row", async () => {
  const supabase = stubSupabase({
    tables: {
      dish_lookup_inflight: () => ({
        delete: () => ({ lt: () => Promise.resolve({ error: null }) }),
        upsert: () => ({ select: () => Promise.resolve({ data: [{ query_key: "bacon" }] }) }),
      }),
    },
  });
  const claimed = await claimInflight(supabase, "bacon", new Date());
  if (!claimed) throw new Error("expected true (claim won)");
});

Deno.test("claimInflight: false (lost the race) when the upsert returns no rows (a real conflict)", async () => {
  const supabase = stubSupabase({
    tables: {
      dish_lookup_inflight: () => ({
        delete: () => ({ lt: () => Promise.resolve({ error: null }) }),
        upsert: () => ({ select: () => Promise.resolve({ data: [] }) }),
      }),
    },
  });
  const claimed = await claimInflight(supabase, "bacon", new Date());
  if (claimed) throw new Error("expected false (claim lost)");
});

Deno.test("incrementAndCheckBudget: reads the rpc'd count and the configured cap together", async () => {
  const supabase = stubSupabase({
    rpc: (_fn: string) => Promise.resolve({ data: 21, error: null }),
    tables: {
      dish_lookup_config: () => ({ select: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { hourly_cap: 20 } }) }) }) }),
    },
  });
  const { count, cap } = await incrementAndCheckBudget(supabase);
  if (count !== 21 || cap !== 20) throw new Error(`expected count 21 / cap 20, got ${count}/${cap}`);
});

Deno.test("performLookup: a rate-limited request (budget exhausted) never reaches fetchFoodProCandidates", async () => {
  let fetchCalled = false;
  const supabase = stubSupabase({
    rpc: () => Promise.resolve({ data: 999, error: null }),
    tables: {
      dishes: () => ({ select: () => ({ ilike: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
      dish_lookup_misses: () => ({ select: () => ({ eq: () => ({ gt: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
      dish_lookup_inflight: () => ({
        delete: () => ({ lt: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) }),
        upsert: () => ({ select: () => Promise.resolve({ data: [{ query_key: "bacon" }] }) }),
      }),
      dish_lookup_config: () => ({ select: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { hourly_cap: 20 } }) }) }) }),
    },
  });
  const fetchImpl = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response("", { status: 200 }));
  }) as typeof fetch;
  const result = await performLookup({ supabase, fetchImpl }, "Bacon");
  if (result.status !== "rate_limited" || result.reason !== "budget_exhausted") throw new Error(`unexpected result: ${JSON.stringify(result)}`);
  if (fetchCalled) throw new Error("fetchFoodProCandidates ran despite the budget being exhausted -- must not fall through to FoodPro");
});

Deno.test("performLookup: a catalog hit short-circuits before touching the rate limit at all", async () => {
  let rpcCalled = false;
  const row = { dish_name: "Bacon", nutrition: { calories: 140 }, allergens: [], diet_tags: [], last_seen_hall_tid: 1 };
  const supabase = stubSupabase({
    rpc: () => {
      rpcCalled = true;
      return Promise.resolve({ data: 1, error: null });
    },
    tables: {
      dishes: () => ({ select: () => ({ ilike: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }) }),
    },
  });
  const result = await performLookup({ supabase }, "Bacon");
  if (result.status !== "hit") throw new Error(`expected hit, got ${JSON.stringify(result)}`);
  if (rpcCalled) throw new Error("the rate-limit RPC ran despite an already-cached catalog hit");
});

function fetchImplFromMap(responses: Record<string, () => Response>): typeof fetch {
  return (async (url: string | URL) => {
    const u = url.toString();
    for (const [key, make] of Object.entries(responses)) {
      if (u.includes(key)) return make();
    }
    throw new Error(`stub fetchImpl: no response registered for ${u}`);
  }) as typeof fetch;
}

function locationResponse(): Response {
  return new Response("", { status: 200, headers: { "Set-Cookie": "ASPSESSIONID=abc; path=/" } });
}

Deno.test("fetchFoodProCandidates: returns real parsed candidates alongside the raw search-hit count", async () => {
  const fetchImpl = fetchImplFromMap({
    "location.aspx": locationResponse,
    "search.aspx": () => new Response(SEARCH_FRAGMENT, { status: 200 }),
    "label.aspx": () => new Response(BACON_LABEL, { status: 200 }),
  });
  const result = await fetchFoodProCandidates("Bacon", fetchImpl);
  // SEARCH_FRAGMENT has 3 "Bacon" rows but only 2 distinct RecNums (181767 x2, 151207) --
  // selectCandidateHits' own dedup test above already pins this count.
  if (result.searchHitCount !== 2) throw new Error(`expected searchHitCount 2, got ${result.searchHitCount}`);
  if (result.candidates.length !== 2) throw new Error(`expected 2 parsed candidates, got ${result.candidates.length}`);
});

Deno.test("fetchFoodProCandidates: searchHitCount is 0 when search.aspx itself found nothing (a genuine miss)", async () => {
  const fetchImpl = fetchImplFromMap({
    "location.aspx": locationResponse,
    "search.aspx": () => new Response("No Result", { status: 200 }),
  });
  const result = await fetchFoodProCandidates("Nonexistent Dish", fetchImpl);
  if (result.searchHitCount !== 0) throw new Error(`expected searchHitCount 0, got ${result.searchHitCount}`);
  if (result.candidates.length !== 0) throw new Error("expected no candidates");
});

Deno.test("fetchFoodProCandidates: searchHitCount stays > 0 even when every label.aspx fetch fails (a transient failure, not a miss)", async () => {
  const fetchImpl = fetchImplFromMap({
    "location.aspx": locationResponse,
    "search.aspx": () => new Response(SEARCH_FRAGMENT, { status: 200 }),
    "label.aspx": () => new Response("upstream error", { status: 500 }),
  });
  const result = await fetchFoodProCandidates("Bacon", fetchImpl);
  if (result.searchHitCount !== 2) throw new Error(`expected searchHitCount 2 (search still found them), got ${result.searchHitCount}`);
  if (result.candidates.length !== 0) throw new Error("expected 0 usable candidates -- every label.aspx fetch failed");
});

/** Full happy-path stub for performLookup: a clean catalog miss, no recent negative-cache entry,
 * a won inflight claim, and budget under cap -- every test below overrides just the one table
 * that matters for what it's checking (dish_lookup_misses' upsert, in the two tests using this). */
function stubPerformLookupSupabase(missUpsertImpl: (data: unknown) => Promise<{ error: null }>) {
  return stubSupabase({
    rpc: () => Promise.resolve({ data: 1, error: null }),
    tables: {
      dishes: () => ({ select: () => ({ ilike: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
      dish_lookup_misses: () => ({
        select: () => ({ eq: () => ({ gt: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
        upsert: missUpsertImpl,
      }),
      dish_lookup_inflight: () => ({
        delete: () => ({ lt: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) }),
        upsert: () => ({ select: () => Promise.resolve({ data: [{ query_key: "x" }] }) }),
      }),
      dish_lookup_config: () => ({ select: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { hourly_cap: 20 } }) }) }) }),
    },
  });
}

Deno.test("performLookup: negative-caches a genuine miss (search.aspx found nothing)", async () => {
  let missUpsertCalled = false;
  const supabase = stubPerformLookupSupabase(() => {
    missUpsertCalled = true;
    return Promise.resolve({ error: null });
  });
  const fetchImpl = fetchImplFromMap({
    "location.aspx": locationResponse,
    "search.aspx": () => new Response("No Result", { status: 200 }),
  });
  const result = await performLookup({ supabase, fetchImpl }, "Nonexistent Dish");
  if (result.status !== "miss") throw new Error(`expected miss, got ${JSON.stringify(result)}`);
  if (!missUpsertCalled) throw new Error("expected the negative cache to be written for a genuine miss");
});

Deno.test("performLookup: does NOT negative-cache when search.aspx found hits but every label.aspx fetch failed (a transient failure)", async () => {
  let missUpsertCalled = false;
  const supabase = stubPerformLookupSupabase(() => {
    missUpsertCalled = true;
    return Promise.resolve({ error: null });
  });
  const fetchImpl = fetchImplFromMap({
    "location.aspx": locationResponse,
    "search.aspx": () => new Response(SEARCH_FRAGMENT, { status: 200 }),
    "label.aspx": () => new Response("upstream error", { status: 500 }),
  });
  const result = await performLookup({ supabase, fetchImpl }, "Bacon");
  if (result.status !== "miss") throw new Error(`expected miss, got ${JSON.stringify(result)}`);
  if (missUpsertCalled) throw new Error("must NOT negative-cache a transient label.aspx failure -- the dish might actually exist");
});

Deno.test("performLookup: a follower that loses the inflight claim polls FOLLOWER_POLL_ATTEMPTS times, actually covering the leader's worst-case latency, before giving up", async () => {
  let pollCount = 0;
  const supabase = stubSupabase({
    tables: {
      dishes: () => ({ select: () => ({ ilike: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
      dish_lookup_misses: () => ({ select: () => ({ eq: () => ({ gt: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }),
      dish_lookup_inflight: () => ({
        delete: () => ({ lt: () => Promise.resolve({ error: null }) }),
        upsert: () => ({ select: () => Promise.resolve({ data: [] }) }), // always loses the claim
      }),
    },
  });
  const sleepImpl = async () => {
    pollCount++;
  };
  const result = await performLookup({ supabase, sleepImpl }, "Bacon");
  if (result.status !== "rate_limited" || result.reason !== "in_progress") throw new Error(`unexpected result: ${JSON.stringify(result)}`);
  // Pinned at 10: the leader's own worst case (cookie prime + search + up to 3 label.aspx fetches,
  // no artificial delay between them) is measured elsewhere in this codebase (populate-retail-
  // dishes) at low-single-digit seconds per handful of requests -- 10 x 500ms = 5s is sized to
  // actually catch that, not just poll a token few times and give up (docs/decisions-log.md).
  if (pollCount !== 10) throw new Error(`expected 10 poll attempts (5s of real margin), got ${pollCount}`);
});
