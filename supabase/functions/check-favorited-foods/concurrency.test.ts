// Red-first test for the 2026-09-11 staleness incident fix (docs/decisions-log.md):
// fetchAllHallMenus must fetch all halls concurrently. The previous sequential
// `for (const tid of HALL_TIDS) await fetchHallMenu(tid)` loop routinely pushed total invocation
// time past whatever the platform enforces -- observed live: a healthy run finished in ~5s, failing
// runs died at 9-14s with a bare Gateway Timeout / EDGE_FUNCTION_ERROR and no application
// console.error (the runtime was killed mid-flight, not our own code throwing).
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/check-favorited-foods/concurrency.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { fetchAllHallMenus } = await import("./index.ts");

Deno.test("fetchAllHallMenus fetches every hall concurrently, not one at a time", async () => {
  const hallTids = [1, 2, 3, 4];
  const started: number[] = [];
  let releaseAll: () => void = () => {};
  // Every stub call blocks until ALL 4 halls have started fetching -- a sequential implementation
  // deadlocks on this (call 1 can't resolve until calls 2-4 have started, which can't happen until
  // call 1 resolves), so this reliably times out under the old code and completes immediately under
  // the fix.
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

  const result = await Promise.race([fetchAllHallMenus(hallTids, fetchImpl), timeout]);
  if (started.length !== 4) throw new Error(`expected all 4 halls to start fetching, got ${started.length}`);
  if (result.size !== 4) throw new Error(`expected 4 halls in result map, got ${result.size}`);
});
