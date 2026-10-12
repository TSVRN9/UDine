// Run: deno test --node-modules-dir=none --allow-env supabase/functions/record-occupancy
// Fixture: real get_infov2 response captured 2026-10-12, trimmed to the fields this function reads
// (7 of 39 locations: halls, a café, the shared Blue Wall sensor, and 999999 no-sensor places).
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;
const { handle, slotStart } = await import("./index.ts");

import FIXTURE from "./get_infov2.fixture.json" with { type: "json" };
const NOW = new Date("2026-10-12T14:37:21Z");
const SECRET = "s3cret";
Deno.env.set("EDGE_CRON_SECRET", SECRET);

function fakeDb() {
  const calls = { upserts: [] as { rows: Record<string, unknown>[]; opts: unknown }[], deletes: [] as { col: string; val: string }[] };
  const db = {
    from: (_t: string) => ({
      upsert: (rows: Record<string, unknown>[], opts: unknown) => (calls.upserts.push({ rows, opts }), Promise.resolve({ error: null })),
      delete: () => ({ lt: (col: string, val: string) => (calls.deletes.push({ col, val }), Promise.resolve({ error: null })) }),
    }),
  };
  return { db, calls };
}
const req = (secret?: string) => new Request("http://x", { method: "POST", headers: secret ? { "x-udine-cron-secret": secret } : {} });
const feed = (body: unknown = FIXTURE) => () => Promise.resolve(new Response(JSON.stringify(body)));

Deno.test("rejects calls without the cron secret and does not fetch", async () => {
  const { db, calls } = fakeDb();
  let fetched = false;
  const res = await handle(req(), { db, fetch: () => ((fetched = true), feed()()), now: () => NOW });
  if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
  if (fetched || calls.upserts.length) throw new Error("must not fetch or write when unauthorized");
});

Deno.test("stores raw numbers, skips 999999 sensors, truncates observed_at to the 15-minute slot", async () => {
  const { db, calls } = fakeDb();
  const res = await handle(req(SECRET), { db, fetch: feed(), now: () => NOW });
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const rows = calls.upserts[0].rows;
  const ids = rows.map((r) => r.location_id).sort((a, b) => Number(a) - Number(b));
  if (JSON.stringify(ids) !== JSON.stringify([1, 2, 4, 14, 5991])) throw new Error(`unexpected ids ${ids}`);
  const worcester = rows.find((r) => r.location_id === 1);
  const want = { location_id: 1, observed_at: "2026-10-12T14:30:00.000Z", headcount: 162, moderate_at: 576, notbusy_at: 383, pct: null, level: null };
  if (JSON.stringify(worcester) !== JSON.stringify(want)) throw new Error(`got ${JSON.stringify(worcester)}`);
});

Deno.test("skips locations whose business_level is not an integer", async () => {
  const { db, calls } = fakeDb();
  const bad = [{ ...FIXTURE[0], business_level: null }, { ...FIXTURE[1], business_level: "12" }, { ...FIXTURE[2], business_level: 1.5 }, FIXTURE[3]];
  await handle(req(SECRET), { db, fetch: feed(bad), now: () => NOW });
  if (calls.upserts[0].rows.length !== 1) throw new Error(`expected 1 row, got ${calls.upserts[0].rows.length}`);
});

Deno.test("stores busy.pct / busy.level when upstream carries them again", async () => {
  const { db, calls } = fakeDb();
  const withBusy = [{ ...FIXTURE[0], busy: { pct: 87, level: 2 } }];
  await handle(req(SECRET), { db, fetch: feed(withBusy), now: () => NOW });
  const r = calls.upserts[0].rows[0];
  if (r.pct !== 87 || r.level !== 2) throw new Error(`got ${JSON.stringify(r)}`);
});

Deno.test("idempotent within a slot: ignoreDuplicates upsert, same observed_at for two runs in one slot", async () => {
  const { db, calls } = fakeDb();
  await handle(req(SECRET), { db, fetch: feed(), now: () => new Date("2026-10-12T14:30:01Z") });
  await handle(req(SECRET), { db, fetch: feed(), now: () => new Date("2026-10-12T14:44:59Z") });
  const [a, b] = calls.upserts;
  if (a.rows[0].observed_at !== b.rows[0].observed_at) throw new Error("slot differs");
  const o = a.opts as { onConflict: string; ignoreDuplicates: boolean };
  if (o.onConflict !== "location_id,observed_at" || o.ignoreDuplicates !== true) throw new Error(`opts ${JSON.stringify(o)}`);
});

Deno.test("deletes samples older than 12 weeks", async () => {
  const { db, calls } = fakeDb();
  await handle(req(SECRET), { db, fetch: feed(), now: () => NOW });
  const d = calls.deletes[0];
  if (d.col !== "observed_at" || d.val !== "2026-07-20T14:30:00.000Z") throw new Error(`got ${JSON.stringify(d)}`);
});

Deno.test("502 and no writes when upstream fails", async () => {
  const { db, calls } = fakeDb();
  const res = await handle(req(SECRET), { db, fetch: () => Promise.resolve(new Response("x", { status: 500 })), now: () => NOW });
  if (res.status !== 502 || calls.upserts.length) throw new Error(`status ${res.status}`);
});

Deno.test("slotStart", () => {
  if (slotStart(new Date("2026-10-12T00:14:59Z")).toISOString() !== "2026-10-12T00:00:00.000Z") throw new Error("slot");
});
