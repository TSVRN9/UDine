// Red-first tests for fetchHallMenu's failure handling (pr-reviewer finding, #145). VERIFIED on
// main: fetchHallMenu's fetch()/.json() were unguarded, so a single hall's fetch rejection or a
// 200-with-HTML body (umassdining.com is a scraped Drupal endpoint that serves maintenance pages)
// threw out of the Deno.serve handler and aborted the WHOLE invocation -- zero sightings, zero
// pushes, for every hall and every user -- while pg_cron still reported success (net.http_post
// returns a request id unconditionally). Mirrors _shared/hours.test.ts's fetchHallHours coverage,
// which the sibling _shared/hours.ts fix (and its doc comment) already named as the shape to copy.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/check-favorited-foods/menu.test.ts
// (see date.test.ts for why --node-modules-dir=none and --allow-env are both required.)
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { fetchHallMenu } = await import("./index.ts");

Deno.test("fetchHallMenu: a rejected fetch (network/DNS/TLS failure) degrades to an empty map, not a thrown/rejected promise", async () => {
  const rejectingFetch = (() => Promise.reject(new Error("simulated network failure"))) as unknown as typeof fetch;
  const result = await fetchHallMenu(1, rejectingFetch);
  if (result.size !== 0) throw new Error(`expected an empty map, got size ${result.size}`);
});

Deno.test("fetchHallMenu: a 200 response with a non-JSON body (maintenance page) degrades to an empty map, not a thrown/rejected promise", async () => {
  const maintenancePageFetch = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")),
    })) as unknown as typeof fetch;
  const result = await fetchHallMenu(1, maintenancePageFetch);
  if (result.size !== 0) throw new Error(`expected an empty map, got size ${result.size}`);
});

Deno.test("fetchHallMenu: a non-OK response degrades to an empty map", async () => {
  const notOkFetch = (() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
  const result = await fetchHallMenu(1, notOkFetch);
  if (result.size !== 0) throw new Error(`expected an empty map, got size ${result.size}`);
});

Deno.test("fetchHallMenu: a real response still extracts dishes through the injected fetchImpl", async () => {
  const workingFetch = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ lunch: { "Hot Bar": '<li><a data-dish-name="French Toast"></a></li>' } }),
    })) as unknown as typeof fetch;
  const result = await fetchHallMenu(1, workingFetch);
  if (result.get("French Toast") !== "lunch") throw new Error(`expected French Toast -> lunch, got ${result.get("French Toast")}`);
});
