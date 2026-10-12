// Records one occupancy sample per sensor-equipped dining location into public.occupancy_samples
// (supabase/migrations/20260921120000_occupancy_history.sql), every 10 minutes, all day. See
// docs/briefs/hall-occupancy-history.md for why we keep our own history.
//
// Upstream: get_infov2 carries, per location, `business_level` (live headcount) and the location's
// own `moderate_level` / `notbusy_level` thresholds (999999 = no sensor). The meaning is inferred,
// so the raw integers are stored; `busy.pct` / `busy.level` are kept too whenever that object
// reappears (it was present 2026-10-08, gone by 2026-10-11).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cronAuth.ts";

const FEED = "https://www.umassdining.com/uapp/get_infov2";
const NO_SENSOR = 999999;
const SLOT_MS = 10 * 60_000;
const RETENTION_MS = 12 * 7 * 86_400_000;

/** The run's time truncated to its 10-minute slot, so a retried run can't double-count. */
export const slotStart = (now: Date) => new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS);

interface Loc {
  location_id?: unknown;
  business_level?: unknown;
  moderate_level?: unknown;
  notbusy_level?: unknown;
  busy?: { pct?: unknown; level?: unknown } | null;
}

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };
interface Deps {
  db: Db;
  fetch: typeof fetch;
  now: () => Date;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const int = (v: unknown): v is number => Number.isInteger(v);
const smallint = (v: unknown) => (int(v) ? v : null);

export async function handle(req: Request, { db, fetch, now }: Deps): Promise<Response> {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  let locs: Loc[];
  try {
    const res = await fetch(FEED);
    if (!res.ok) return json(502, { error: `get_infov2 returned ${res.status}` });
    locs = await res.json();
    if (!Array.isArray(locs)) return json(502, { error: "get_infov2 was not a list" });
  } catch (err) {
    return json(502, { error: `get_infov2 fetch failed: ${err}` });
  }

  const slot = slotStart(now());
  const rows = locs
    .filter((l) => int(l.location_id) && int(l.business_level) && int(l.moderate_level) && int(l.notbusy_level) &&
      l.moderate_level !== NO_SENSOR && l.notbusy_level !== NO_SENSOR)
    .map((l) => ({
      location_id: l.location_id,
      observed_at: slot.toISOString(),
      headcount: l.business_level,
      moderate_at: l.moderate_level,
      notbusy_at: l.notbusy_level,
      pct: smallint(l.busy?.pct),
      level: smallint(l.busy?.level),
    }));

  const t = db.from("occupancy_samples");
  if (rows.length) {
    const { error } = await t.upsert(rows, { onConflict: "location_id,observed_at", ignoreDuplicates: true });
    if (error) return json(500, { error: error.message });
  }
  const { error: delErr } = await db.from("occupancy_samples").delete().lt("observed_at", new Date(slot.getTime() - RETENTION_MS).toISOString());
  if (delErr) return json(500, { error: delErr.message });

  return json(200, { recorded: rows.length });
}

Deno.serve((req) =>
  handle(req, {
    db: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    fetch,
    now: () => new Date(),
  })
);
