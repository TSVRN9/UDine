// Red-first tests for issue #261's second call site: dispatchPushNotifications' push_tokens lookup
// (previously a plain `.select()` / `.in("user_id", affectedUserIds)`) has the exact same shape as
// check-favorited-foods/index.ts's favorited_foods lookup -- see
// check-favorited-foods/pagination.test.ts for the full issue writeup. check-favorited-foods can
// pass hundreds of affected users here in one hourly run; send-ping-push always passes exactly one,
// so this only changes behavior for the former, but the fix lives once in fetchTokensForUsers so
// both callers get it.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/_shared/push-tokens-paging.test.ts
// (--allow-env: push.ts imports npm:web-push at module top level, which transitively reads an env
// var at import time -- see check-favorited-foods/date.test.ts's comment for the full explanation.)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { makeMockPostgrest } from "./testing/mockPostgrest.ts";
import { fetchTokensForUsers } from "./push.ts";

function fakeClient(fetchImpl: typeof fetch) {
  return createClient("https://example.supabase.co", "test-anon-key", { global: { fetch: fetchImpl } });
}

Deno.test("fetchTokensForUsers: pages past PostgREST's max_rows=1000 cap -- all tokens consumed, not silently truncated", async () => {
  // All 1200 rows tie on user_id, so this also proves paging carries push_tokens' full primary key
  // (user_id, platform, token) as its sort -- offset/limit paging across separate requests has no
  // ordering guarantee without one (postgrest-js's own range() doc comment warns of this).
  const userId = "11111111-1111-1111-1111-111111111111";
  const rows = Array.from({ length: 1200 }, (_, i) => ({ user_id: userId, platform: "expo", token: `ExponentPushToken[${i}]` }));
  const { fetchImpl, requestUrls } = makeMockPostgrest({ push_tokens: rows });

  const tokens = await fetchTokensForUsers(fakeClient(fetchImpl), [userId]);
  if (tokens.length !== 1200) throw new Error(`expected all 1200 tokens consumed via pagination, got ${tokens.length}`);
  for (const url of requestUrls) {
    const order = url.searchParams.get("order");
    if (order !== "user_id.asc,platform.asc,token.asc") throw new Error(`paged request sent no full-primary-key sort, got order=${order}`);
  }
});

Deno.test("fetchTokensForUsers: chunks the .in() id list so no single request 414s past ~215 affected users", async () => {
  const userIds = Array.from({ length: 300 }, (_, i) => `${i.toString().padStart(8, "0")}-0000-0000-0000-000000000000`);
  const rows = userIds.map((id) => ({ user_id: id, platform: "expo", token: `ExponentPushToken[${id}]` }));
  const { fetchImpl, requestUrls } = makeMockPostgrest({ push_tokens: rows }, { maxUrlLength: 8000 });

  const tokens = await fetchTokensForUsers(fakeClient(fetchImpl), userIds);
  if (tokens.length !== 300) throw new Error(`expected all 300 tokens (a 414 would surface as a swallowed empty result here), got ${tokens.length}`);

  if (requestUrls.length < 2) throw new Error(`expected the 300 ids to be split across multiple requests, got ${requestUrls.length}`);
  for (const url of requestUrls) {
    const inFilter = url.searchParams.get("user_id");
    if (!inFilter) continue;
    const idCount = inFilter.slice(4, -1).split(",").length;
    if (idCount > 150) throw new Error(`one request carried ${idCount} ids in its .in() filter, expected <=150`);
  }
});
