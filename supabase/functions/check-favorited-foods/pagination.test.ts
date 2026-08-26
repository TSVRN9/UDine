// Red-first tests for issue #261: check-favorited-foods/index.ts's `profiles`/`favorited_foods`
// lookups used a plain `.select()` / `.in("user_id", userIds)` with no pagination. PostgREST
// silently caps any single response at max_rows (config.toml: 1000, same as the Supabase cloud
// default -- no error, rows past 1000 are just dropped), and a plain `.in()` filter 414s outright
// once the id list is long enough (confirmed live: 300 uuids = an 11,189-byte URL = 414). Below
// ~215 opted-in users the function 500s on every hourly run; below that it silently drops favorites
// past row 1000 with no error at all.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/check-favorited-foods/pagination.test.ts
// (see date.test.ts for why --node-modules-dir=none and --allow-env are both required.)
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

import { createClient } from "jsr:@supabase/supabase-js@2";
import { makeMockPostgrest } from "../_shared/testing/mockPostgrest.ts";

const { fetchEnabledUserIds, fetchFavoritesForUsers } = await import("./index.ts");

function fakeClient(fetchImpl: typeof fetch) {
  return createClient("https://example.supabase.co", "test-anon-key", { global: { fetch: fetchImpl } });
}

Deno.test("fetchFavoritesForUsers: pages past PostgREST's max_rows=1000 cap -- all rows consumed, not silently truncated", async () => {
  // Issue's own repro: 1500 favorited_foods rows for one user -> a plain select() returns only 1000.
  // All 1500 rows tie on user_id, so this also proves paging is safe without duplicate/skipped rows
  // only if the request carries a full-primary-key sort (user_id, dish_name) -- offset/limit paging
  // across separate requests has no ordering guarantee otherwise (postgrest-js's own range() doc
  // comment warns of this).
  const userId = "11111111-1111-1111-1111-111111111111";
  const rows = Array.from({ length: 1500 }, (_, i) => ({ user_id: userId, dish_name: `Dish ${i}` }));
  const { fetchImpl, requestUrls } = makeMockPostgrest({ favorited_foods: rows });

  const { data, error } = await fetchFavoritesForUsers(fakeClient(fetchImpl), [userId]);
  if (error) throw new Error(`unexpected error: ${error.message}`);
  if ((data ?? []).length !== 1500) throw new Error(`expected all 1500 rows consumed via pagination, got ${data?.length}`);
  for (const url of requestUrls) {
    const order = url.searchParams.get("order");
    if (order !== "user_id.asc,dish_name.asc") throw new Error(`paged request sent no full-primary-key sort, got order=${order}`);
  }
});

Deno.test("fetchFavoritesForUsers: chunks the .in() id list so no single request 414s past ~215 users", async () => {
  // Issue's own repro: 300 uuids in one .in() filter = an 11,189-byte URL = 414. The mock server
  // enforces the same URL-length ceiling here.
  const userIds = Array.from({ length: 300 }, (_, i) => `${i.toString().padStart(8, "0")}-0000-0000-0000-000000000000`);
  const rows = userIds.map((id) => ({ user_id: id, dish_name: "French Toast" }));
  const { fetchImpl, requestUrls } = makeMockPostgrest({ favorited_foods: rows }, { maxUrlLength: 8000 });

  const { data, error } = await fetchFavoritesForUsers(fakeClient(fetchImpl), userIds);
  if (error) throw new Error(`unexpected error (a 414 surfaces here as a postgrest-js error): ${error.message}`);
  if ((data ?? []).length !== 300) throw new Error(`expected all 300 rows, got ${data?.length}`);

  if (requestUrls.length < 2) throw new Error(`expected the 300 ids to be split across multiple requests, got ${requestUrls.length}`);
  for (const url of requestUrls) {
    const inFilter = url.searchParams.get("user_id");
    if (!inFilter) continue;
    const idCount = inFilter.slice(4, -1).split(",").length;
    if (idCount > 150) throw new Error(`one request carried ${idCount} ids in its .in() filter, expected <=150`);
  }
});

Deno.test("fetchEnabledUserIds: pages past PostgREST's max_rows=1000 cap for the profiles lookup too", async () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({
    user_id: `${i.toString().padStart(8, "0")}-0000-0000-0000-000000000000`,
    notifications_enabled: true,
  }));
  const { fetchImpl, requestUrls } = makeMockPostgrest({ profiles: rows });

  const { data, error } = await fetchEnabledUserIds(fakeClient(fetchImpl));
  if (error) throw new Error(`unexpected error: ${error.message}`);
  if ((data ?? []).length !== 1200) throw new Error(`expected all 1200 enabled user ids, got ${data?.length}`);
  for (const url of requestUrls) {
    if (url.searchParams.get("order") !== "user_id.asc") throw new Error(`paged request sent no sort, got order=${url.searchParams.get("order")}`);
  }
});
