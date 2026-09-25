// On-demand FoodPro Web INA lookup for a dish name not already in public.dishes -- the "cache
// miss" half of the mirror-vs-on-demand decision in docs/decisions-log.md's "Web INA: mirror vs.
// on-demand, and the `populate-dishes` cron (2026-09-13)" entry (see also this repo's
// docs/apk-reverse-engineering.md "FoodPro Web INA" section for the endpoint reference).
//
// UNLIKE populate-dishes/check-favorited-foods/send-ping-push, this function is deliberately NOT
// gated by _shared/cronAuth.ts's x-udine-cron-secret -- it exists specifically to be called by
// real anonymous end users tapping "Search UMass Dining directly" in the mobile app's plate
// search (CLAUDE.md: "menus, nutrition... work with zero account"). verify_jwt = true (the
// anon/publishable key every client already holds) is the only gate at the HTTP layer, same
// baseline as every other client-facing table/function in this schema. The actual protection
// against abuse is the Postgres-backed rate limit below, not a secret header.
//
// Flow per request, in order (each step below is the reason NOT to skip ahead):
//   1. Check public.dishes for an existing name match -- free, no FoodPro round-trip needed.
//   2. Check the negative cache (dish_lookup_misses) -- a query that resolved to nothing recently
//      doesn't get to retry against FoodPro on every keystroke/retry within the TTL.
//   3. Try to claim the in-flight coalescing row (dish_lookup_inflight) -- a concurrent identical
//      search waits on/reuses this request's result instead of firing its own FoodPro round-trip.
//   4. Atomically increment + check the GLOBAL hourly budget (dish_lookup_rate_limit,
//      dish_lookup_config) BEFORE any outbound HTTP call -- exhausted means a real, honest
//      "try again later" response, never a silent fall-through to FoodPro anyway.
//   5. Only now: prime the FoodPro session cookie, search.aspx, and up to
//      MAX_CANDIDATES_PER_REQUEST label.aspx fetches for real nutrition.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://af-foodpro1.campus.ads.umass.edu/foodpro.net/";
const RESIDENTIAL_HALL_LOCATION_NUMS = new Set([1, 2, 3, 4]);
// "top few candidates, not every single match" -- bounds both this single request's latency and
// how much of the hourly budget one user action can spend (see the migration's own comment on
// dish_lookup_config.hourly_cap for the arithmetic this number feeds into).
const MAX_CANDIDATES_PER_REQUEST = 3;
// Shorter than public.dishes' permanent cache -- long enough that a typo/garbage retry within a
// normal "let me try again" window doesn't re-spend budget, short enough that a dish UMass adds
// later the same day is still discoverable well before the next campus-dining cycle.
const NEGATIVE_CACHE_TTL_MINUTES = 15;
// How long a claimed dish_lookup_inflight row is honored before a new request is allowed to
// re-claim it -- bounds how long a crashed/timed-out leader can block followers.
const INFLIGHT_CLAIM_TTL_SECONDS = 30;
// A follower (lost the inflight claim race) polls for the leader's write instead of independently
// spending budget. Sized to actually cover the leader's own worst-case latency, not just a
// token gesture: 1 location.aspx + 1 search.aspx + up to MAX_CANDIDATES_PER_REQUEST label.aspx
// fetches, no artificial delay between them (unlike populate-retail-dishes' politeness sleep --
// this is a single user-triggered request, not a bulk crawl), so 10 x 500ms = 5s gives real
// margin over that. ponytail: a fixed poll, not a real pub/sub wakeup -- upgrade to LISTEN/NOTIFY
// or realtime if 5s proves too short/long in practice.
const FOLLOWER_POLL_ATTEMPTS = 10;
const FOLLOWER_POLL_INTERVAL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" };
function decodeEntities(s: string): string {
  return s.replace(/&(amp|#039|quot|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const match = s.match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : 0;
}

/** Cache/dedup key: trimmed, whitespace-collapsed, lowercased -- distinct from what's actually sent
 * to search.aspx (only the longest token now, see fetchFoodProCandidates). Query-key normalization
 * is intentionally NOT changed to the token-based normalizeForMatch below: it only gates a 15-
 * minute negative cache, so a stale miss recorded under the old exact-match semantics ages out on
 * its own shortly after this deploys -- not worth widening the key format for. */
export function normalizeQueryKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Lowercases and turns every run of non-alphanumeric characters into a single space -- the shared
 * normalization both selectCandidateHits and the search-token picker build on. Deliberately
 * duplicated from @udine/shared's matchesQuery (task 2 of this brief): Deno can't import
 * @udine/shared (see WebInaNutrition's own comment below for the same constraint elsewhere in this
 * file) -- keep the two normalization rules in sync by hand if either changes. */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function tokensForMatch(s: string): string[] {
  return normalizeForMatch(s).trim().split(/\s+/).filter(Boolean);
}

/** Token-AND match: every token of `query` must be a substring of `name`, both normalized the same
 * way. FoodPro's search.aspx only narrows the candidate set (see fetchFoodProCandidates) -- this is
 * the real "does this dish actually match what the user typed" filter. */
function matchesQueryTokens(name: string, query: string): boolean {
  const normalizedName = normalizeForMatch(name);
  return tokensForMatch(query).every((token) => normalizedName.includes(token));
}

/** Same shape as populate-dishes/populate-retail-dishes' own DishNutrition/RetailDishNutrition --
 * duplicated, not imported: this function is independently deployed (Deno can't import another
 * Edge Function's index.ts without also executing its top-level Deno.serve(), and can't reach
 * @udine/shared either -- see populate-dishes/index.ts's own header comment for the precedent). */
export interface WebInaNutrition {
  servingSize: string;
  calories: number;
  caloriesFromFat: number;
  totalFatG: number;
  satFatG: number;
  transFatG: number;
  cholesterolMg: number;
  sodiumMg: number;
  totalCarbG: number;
  dietaryFiberG: number;
  sugarsG: number;
  proteinG: number;
}

export interface LookupCandidate {
  dishName: string;
  /** Human location name (e.g. "Worcester Dining Commons", "Bluewall - Grill") -- "" for a hit
   * that came straight from public.dishes, which has no location context of its own. */
  location: string;
  hallTid: number;
  nutrition: WebInaNutrition;
  allergens: string[];
  dietTags: string[];
}

export type LookupResult = { status: "hit"; candidates: LookupCandidate[] } | { status: "miss" } | { status: "rate_limited"; reason: "budget_exhausted" | "in_progress" };

/** One search.aspx result row: `<div class='searchcoldesc'><a href='label.aspx?...'>Name</a></div>`
 * -- confirmed live 2026-09-14 against a real "Bacon" search (6 distinct RecNums across Worcester
 * and Franklin). Same shape as populate-retail-dishes' longmenucoldispname parser, different class. */
export interface SearchHit {
  dishName: string;
  labelPath: string;
}

export function parseSearchHits(html: string): SearchHit[] {
  const rows: SearchHit[] = [];
  const re = /searchcoldesc'><a href='(label\.aspx\?[^']+)'[^>]*>([^<]*)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const dishName = decodeEntities(m[2]).trim();
    if (!dishName) continue;
    rows.push({ dishName, labelPath: decodeEntities(m[1]) });
  }
  return rows;
}

export function extractRecNum(labelPath: string): string | null {
  const m = labelPath.match(/RecNumAndPort=(\d+)/);
  return m ? m[1] : null;
}

export function extractLocationNum(labelPath: string): number | null {
  const m = labelPath.match(/locationNum=(\d+)/);
  return m ? Number(m[1]) : null;
}

/** locationName as a human display string -- label.aspx/search.aspx hrefs encode it with literal
 * `+` for spaces (query-string convention, not %20), on top of the usual HTML entities. */
export function extractLocationName(labelPath: string): string {
  const m = labelPath.match(/locationName=([^&]+)/);
  if (!m) return "";
  return decodeEntities(m[1].replace(/\+/g, " ")).trim();
}

/** `search.aspx` is a phrase-substring search (searching "Bacon" also returns "Bacon Jalapeno
 * Quesadilla", "Canadian Bacon", etc. -- confirmed live; "White Pizza" itself gets 0 hits there,
 * confirmed live 2026-09-25, hence fetchFoodProCandidates sending it only the longest token) --
 * filters to hits where every token of `query` is a substring of the dish name (token-AND,
 * matchesQueryTokens above), sorts exact (post-normalization) matches first, then dedupes by
 * RecNum (the same recipe recurs across many dates in search.aspx's results -- confirmed live, one
 * real search returned the same RecNum 5+ times), capped to MAX_CANDIDATES_PER_REQUEST. A query
 * that normalizes to no tokens at all (e.g. punctuation-only) matches nothing, not everything. */
export function selectCandidateHits(hits: SearchHit[], query: string, max: number = MAX_CANDIDATES_PER_REQUEST): SearchHit[] {
  const normalizedQuery = normalizeForMatch(query).trim();
  if (!normalizedQuery) return [];
  const matching = hits.filter((h) => matchesQueryTokens(h.dishName, query));
  const isExact = (h: SearchHit) => normalizeForMatch(h.dishName).trim() === normalizedQuery;
  const ordered = [...matching].sort((a, b) => Number(isExact(b)) - Number(isExact(a)));
  const seenRecNums = new Set<string>();
  const deduped: SearchHit[] = [];
  for (const hit of ordered) {
    const recNum = extractRecNum(hit.labelPath);
    const dedupeKey = recNum ?? hit.labelPath;
    if (seenRecNums.has(dedupeKey)) continue;
    seenRecNums.add(dedupeKey);
    deduped.push(hit);
    if (deduped.length >= max) break;
  }
  return deduped;
}

/** A real hall (1-4) keeps its own tid, matching populate-dishes' hallTid convention exactly --
 * these ARE the same FoodPro locationNums as foodpro-menu-ajax's tid. Anything else is a retail/
 * café location outside the 4-hall tid system, negated so it can never collide with a real hall
 * tid -- the same convention populate-retail-dishes established for last_seen_hall_tid (that
 * function's own file isn't reachable from here for the reason above, so this is a deliberate,
 * independent re-application of its scheme for consistency, not a coincidence). */
export function hallTidForLocationNum(locationNum: number): number {
  return RESIDENTIAL_HALL_LOCATION_NUMS.has(locationNum) ? locationNum : -locationNum;
}

/** label.aspx's rendered Nutrition Facts table -- identical markup/parsing to
 * populate-retail-dishes' parseLabelNutrition (verified against the same live page shape:
 * "<label>&nbsp;(</b>)?</font><font ...>value</font>" for every field except Calories/Calories
 * from Fat, which are inline in one tag). Returns null for a stale/expired RecNum (renders as a
 * page with no Calories figure at all) rather than throwing. */
export function parseLabelNutrition(html: string): WebInaNutrition | null {
  const caloriesMatch = html.match(/Calories&nbsp;(\d+(?:\.\d+)?)/);
  if (!caloriesMatch) return null;
  const caloriesFromFatMatch = html.match(/Calories from Fat&nbsp;(\d+(?:\.\d+)?)/);
  const labelledValue = (label: string): string | undefined => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escaped}&nbsp;(?:</b>)?</font>\\s*<font[^>]*>([^<]+)</font>`, "i");
    const m = html.match(re);
    return m ? decodeEntities(m[1]).trim() : undefined;
  };
  return {
    servingSize: labelledValue("Serving Size") ?? "",
    calories: Number.parseFloat(caloriesMatch[1]),
    caloriesFromFat: caloriesFromFatMatch ? Number.parseFloat(caloriesFromFatMatch[1]) : 0,
    totalFatG: num(labelledValue("Total Fat")),
    satFatG: num(labelledValue("Sat. Fat")),
    transFatG: num(labelledValue("Trans Fat")),
    cholesterolMg: num(labelledValue("Cholesterol")),
    sodiumMg: num(labelledValue("Sodium")),
    totalCarbG: num(labelledValue("Tot. Carb.")),
    dietaryFiberG: num(labelledValue("Dietary Fiber")),
    sugarsG: num(labelledValue("Sugars")),
    proteinG: num(labelledValue("Protein")),
  };
}

export function parseLabelAllergens(html: string): string[] {
  const m = html.match(/labelallergensvalue">([^<]*)</);
  if (!m) return [];
  return decodeEntities(m[1])
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function cookieHeaderFromSetCookie(setCookieValues: string[]): string {
  return setCookieValues.map((c) => c.split(";")[0]).join("; ");
}

export function buildDishUpsertRow(candidate: LookupCandidate, updatedAt: string) {
  return {
    dish_name: candidate.dishName,
    nutrition: candidate.nutrition,
    allergens: candidate.allergens,
    diet_tags: candidate.dietTags,
    last_seen_hall_tid: candidate.hallTid,
    updated_at: updatedAt,
  };
}

/** fetchFoodProCandidates' result: `candidates` is what actually got usable nutrition parsed,
 * `searchHitCount` is how many hits selectCandidateHits kept (its own token-AND filter + RecNum
 * dedupe + cap) BEFORE any label.aspx fetch was attempted. The two can diverge (search found N
 * candidates, but every label.aspx fetch 404'd/timed out/failed to parse) -- the caller needs
 * that distinction to avoid negative-caching a transient label.aspx outage as "this dish doesn't
 * exist" (see performLookup). */
export interface FoodProLookup {
  candidates: LookupCandidate[];
  searchHitCount: number;
}

/** The live FoodPro round-trip: location.aspx (session cookie) -> search.aspx (candidates, keyed
 * on only the longest token of `query` -- search.aspx is a phrase-substring search, so a
 * multi-word query itself can get 0 hits there, confirmed live 2026-09-25 for "White Pizza") ->
 * up to MAX_CANDIDATES_PER_REQUEST label.aspx fetches (real nutrition). selectCandidateHits then
 * does the real "every word of the full query matches" filtering locally. An empty `candidates`
 * with `searchHitCount === 0` is "nothing locally matched" -- a genuine miss, safe to
 * negative-cache. An empty `candidates` with `searchHitCount > 0` means hits matched but every
 * label.aspx fetch for them failed -- a transient failure, NOT a miss; the caller must not
 * negative-cache this. Throws only on a genuine transport failure (location.aspx/search.aspx
 * unreachable), which the caller lets surface as a 502 rather than silently recording a false
 * negative-cache miss for what might just be a transient network blip. */
export async function fetchFoodProCandidates(query: string, fetchImpl: typeof fetch = fetch): Promise<FoodProLookup> {
  const locationRes = await fetchImpl(`${BASE}location.aspx`);
  if (!locationRes.ok) throw new Error(`location.aspx returned ${locationRes.status}`);
  const cookieHeader = cookieHeaderFromSetCookie(locationRes.headers.getSetCookie?.() ?? []);
  await locationRes.body?.cancel?.();

  // search.aspx is a phrase-substring search, not a token-AND search -- sending it the whole
  // multi-word query can return 0 hits for a real dish (confirmed live: "White Pizza"). Sending
  // the single longest token is the narrowest substring guaranteed to still be a substring of any
  // dish name that would pass selectCandidateHits' own token-AND filter below.
  const tokens = tokensForMatch(query);
  const searchToken = tokens.reduce((longest, t) => (t.length > longest.length ? t : longest), tokens[0] ?? query.trim());
  const searchRes = await fetchImpl(`${BASE}search.aspx`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader },
    body: `Action=SEARCH&strCurKeywords=${encodeURIComponent(searchToken)}`,
  });
  if (!searchRes.ok) throw new Error(`search.aspx returned ${searchRes.status}`);
  const searchHtml = await searchRes.text();
  const hits = selectCandidateHits(parseSearchHits(searchHtml), query);

  const candidates: LookupCandidate[] = [];
  for (const hit of hits) {
    try {
      const labelRes = await fetchImpl(`${BASE}${hit.labelPath}`);
      if (!labelRes.ok) continue;
      const labelHtml = await labelRes.text();
      const nutrition = parseLabelNutrition(labelHtml);
      if (!nutrition) continue;
      const locationNum = extractLocationNum(hit.labelPath) ?? 0;
      candidates.push({
        dishName: hit.dishName,
        location: extractLocationName(hit.labelPath),
        hallTid: hallTidForLocationNum(locationNum),
        nutrition,
        allergens: parseLabelAllergens(labelHtml),
        dietTags: [],
      });
    } catch (err) {
      console.error(`lookup-dish: label.aspx failed for "${hit.dishName}":`, err);
    }
  }
  return { candidates, searchHitCount: hits.length };
}

/** Escapes ilike's own wildcard metacharacters (`%`, `_`) plus the escape character itself (`\`)
 * so an ilike call is a literal case-insensitive equality check, never a pattern match -- without
 * this, a user-typed query containing `%` or `_` (e.g. searching literally for "%") would match
 * an arbitrary unrelated dish name as a false "cache hit", bypassing the rate limit entirely for
 * that query. */
function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** public.dishes hit -- checked BEFORE spending any budget/FoodPro request. ilike is used as a
 * case-insensitive exact match (dish_name's own real values never contain `%`/`_`, but a
 * malicious/accidental user query might, so the query itself -- not just dish_name -- is escaped
 * before it's used as an ilike pattern). */
export async function checkCatalogHit(supabase: Pick<SupabaseClient, "from">, query: string): Promise<LookupCandidate | null> {
  const { data, error } = await supabase
    .from("dishes")
    .select("dish_name, nutrition, allergens, diet_tags, last_seen_hall_tid")
    .ilike("dish_name", escapeLikePattern(query.trim()))
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { dish_name: string; nutrition: WebInaNutrition; allergens: string[]; diet_tags: string[]; last_seen_hall_tid: number | null };
  return { dishName: row.dish_name, location: "", hallTid: row.last_seen_hall_tid ?? 0, nutrition: row.nutrition, allergens: row.allergens, dietTags: row.diet_tags };
}

export async function checkRecentMiss(supabase: Pick<SupabaseClient, "from">, key: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - NEGATIVE_CACHE_TTL_MINUTES * 60_000).toISOString();
  const { data } = await supabase.from("dish_lookup_misses").select("query_key").eq("query_key", key).gt("checked_at", cutoff).maybeSingle();
  return !!data;
}

export async function recordMiss(supabase: Pick<SupabaseClient, "from">, key: string, now: Date): Promise<void> {
  await supabase.from("dish_lookup_misses").upsert({ query_key: key, checked_at: now.toISOString() }, { onConflict: "query_key" });
}

/** Insert-if-absent claim: PostgREST's ignore-duplicates upsert returns the inserted row on a
 * fresh claim and nothing on a conflict -- that emptiness IS the "someone else already has this"
 * signal, no separate SELECT needed. Stale claims are deleted first so a leader that crashed
 * mid-fetch can't block followers past INFLIGHT_CLAIM_TTL_SECONDS. */
export async function claimInflight(supabase: Pick<SupabaseClient, "from">, key: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - INFLIGHT_CLAIM_TTL_SECONDS * 1000).toISOString();
  await supabase.from("dish_lookup_inflight").delete().lt("claimed_at", cutoff);
  const { data } = await supabase.from("dish_lookup_inflight").upsert({ query_key: key, claimed_at: now.toISOString() }, { onConflict: "query_key", ignoreDuplicates: true }).select();
  return !!data && data.length > 0;
}

export async function releaseInflight(supabase: Pick<SupabaseClient, "from">, key: string): Promise<void> {
  await supabase.from("dish_lookup_inflight").delete().eq("query_key", key);
}

/** Atomically bumps the current hour's counter and returns it alongside the tunable cap --
 * increment_dish_lookup_count() (20260914140000_lookup_dish_rate_limit.sql) does the actual
 * atomic `count = count + 1` a plain PostgREST upsert can't express. */
export async function incrementAndCheckBudget(supabase: Pick<SupabaseClient, "rpc" | "from">): Promise<{ count: number; cap: number }> {
  const [{ data: count }, { data: config }] = await Promise.all([
    supabase.rpc("increment_dish_lookup_count"),
    supabase.from("dish_lookup_config").select("hourly_cap").limit(1).maybeSingle(),
  ]);
  return { count: (count as number | null) ?? 0, cap: (config as { hourly_cap: number } | null)?.hourly_cap ?? 0 };
}

export async function upsertCandidates(supabase: Pick<SupabaseClient, "from">, candidates: LookupCandidate[], updatedAt: string): Promise<void> {
  if (candidates.length === 0) return;
  await supabase.from("dishes").upsert(
    candidates.map((c) => buildDishUpsertRow(c, updatedAt)),
    { onConflict: "dish_name" },
  );
}

/** The whole flow, dependency-injected (supabase + fetchImpl + a fixed `now`) so it's testable
 * without a real Postgres/network connection -- Deno.serve below is a thin HTTP-parsing wrapper
 * around this. */
export async function performLookup(deps: { supabase: SupabaseClient; fetchImpl?: typeof fetch; now?: Date; sleepImpl?: (ms: number) => Promise<void> }, rawQuery: string): Promise<LookupResult> {
  const { supabase, fetchImpl = fetch, sleepImpl = sleep } = deps;
  const now = deps.now ?? new Date();
  const query = rawQuery.trim();
  const key = normalizeQueryKey(query);

  const cached = await checkCatalogHit(supabase, query);
  if (cached) return { status: "hit", candidates: [cached] };

  if (await checkRecentMiss(supabase, key, now)) return { status: "miss" };

  const claimed = await claimInflight(supabase, key, now);
  if (!claimed) {
    for (let i = 0; i < FOLLOWER_POLL_ATTEMPTS; i++) {
      await sleepImpl(FOLLOWER_POLL_INTERVAL_MS);
      const hit = await checkCatalogHit(supabase, query);
      if (hit) return { status: "hit", candidates: [hit] };
    }
    return { status: "rate_limited", reason: "in_progress" };
  }

  try {
    const { count, cap } = await incrementAndCheckBudget(supabase);
    if (count > cap) return { status: "rate_limited", reason: "budget_exhausted" };

    const { candidates, searchHitCount } = await fetchFoodProCandidates(query, fetchImpl);
    if (candidates.length === 0) {
      // Only cache a NEGATIVE result when search.aspx itself found nothing -- if it found hits but
      // every label.aspx fetch for them failed, that's a transient failure (a flaky upstream
      // fetch), not "this dish doesn't exist," and must not poison the 15-minute negative cache
      // with a false miss for a dish that's actually there.
      if (searchHitCount === 0) await recordMiss(supabase, key, now);
      return { status: "miss" };
    }
    await upsertCandidates(supabase, candidates, now.toISOString());
    return { status: "hit", candidates };
  } finally {
    await releaseInflight(supabase, key);
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return json(400, { error: "query is required" });
  // Generous but bounded -- search.aspx has no documented length limit, this just guards against
  // a pathological payload, not a real product constraint.
  if (query.length > 200) return json(400, { error: "query too long" });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const result = await performLookup({ supabase }, query);
    return json(200, result);
  } catch (err) {
    console.error("lookup-dish: unhandled failure:", err);
    return json(502, { error: "UMass Dining lookup failed" });
  }
});
