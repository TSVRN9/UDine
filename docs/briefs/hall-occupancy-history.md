# Hall occupancy history

Goal: a student can see not just how busy a dining hall is right now, but when it's usually busy
and when it usually clears up, from UDine's own week-over-week history instead of UMass's
still-immature forecast.

## Spec

UI: none in this brief. The meter and typical-day curve are being designed in the M1 flow prototype
(Flow Lab, `https://claude.ai/artifact/4bxHWnGM5soyTVQoSJhs2z`). They land with the UI overhaul.
This brief ships the data and the shared derivation the UI will read.
Annotations: none.
States: n/a (no rendered output).
Routes: none.

Backend:
- **What upstream publishes (verified 2026-10-12).** `get_infov2`'s `busy` object (pct, outlook, calmer_at, updated), seen
  on 2026-10-08, is gone from the Oct 11 and Oct 12 captures. What every location carries now is three integers:
  - `business_level`: a live headcount. It's 0 at closed places, and 191 at Worcester just after midnight.
  - `moderate_level` and `notbusy_level`: that location's thresholds. They drift over time (Worcester's moderate was 612 on
    Oct 8, 711 on Oct 11 and 576 on Oct 12). The Blue Wall cafés share one sensor (746/548). `999999` means the location
    has no sensor (UMass Store, Terrace, Charles River, Commonwealth).
  - **First live day (2026-10-12):** thresholds also change within a day. Location 1 went from 386/205 at 9:00 to
    324/297 at 9:15. That's why each sample keeps its own thresholds. Headcounts rose from 0 overnight to 50–95 at the
    three open halls by 8:45–9:00. Location 3 reached 292 at 9:45, past its moderate of 272, so it read busy.
    **The thresholds are hourly.** Every hall's pair changes once an hour, first seen in the :15 sample, from opening on.
    Location 1 went 576/383 overnight, then 102/44 (07:15), 386/205 (08:15), 324/297 (09:15), 533/388 (10:15), 590/405
    (11:15) and 768/516 (12:15). They track the expected crowd for that hour, so the inferred level means "busy for this
    hour", not absolute crowding: at 12:45 Worcester held 471 people, its lunch high so far, and read not busy because
    the bar was 516. Hampshire's 304 against 273 read moderate. So `median_level` already answers "busier than usual for
    now?", and `median_headcount` is the only absolute measure. The UI design should decide which one the meter shows.
  - **Inferred level:** headcount ≥ moderate is busy (2), ≥ notbusy is moderate (1), otherwise not busy (0). This matches
    Oct 8, when Worcester's 672 ≥ 612 and the feed's own `busy.label` said "Busy".

  The meaning is inferred, so **store the raw numbers**, plus `busy.pct`/`busy.level` whenever that object reappears.
- New Edge Function `record-occupancy`, scheduled by pg_cron + pg_net **every 15 minutes, all day** (`*/15 * * * *`, owner 2026-10-12: one sample per 15-minute bucket per day).
  Late night runs past midnight, and zeros overnight are data too.
  - Auth: reuse the existing pair, the Vault-backed `Authorization` header and `x-udine-cron-secret`, checked by
    `supabase/functions/_shared/cronAuth.ts`.
  - Schedule: copy the shape from `20260914150000_schedule_populate_always_available_dishes.sql`.
- **Each run:**
  - makes one GET to `https://www.umassdining.com/uapp/get_infov2`;
  - inserts one row per location whose `business_level` is an integer and whose thresholds aren't `999999`;
  - deletes samples older than 12 weeks.
- **The table:** `public.occupancy_samples (location_id int, observed_at timestamptz, headcount int, moderate_at int,
  notbusy_at int, pct smallint null, level smallint null, primary key (location_id, observed_at))`.
  - `observed_at` is the run's time truncated to its 15-minute slot (upstream no longer gives an `updated` stamp), so a
    retried run doesn't double-count.
  - Inserts use `on conflict do nothing`.
- **The RPC:** `security definer` `occupancy_typical(p_location_id int, p_dow int)` with `search_path` pinned.
  - It returns `(bucket_start time, median_headcount int, median_level smallint, samples int)` per 15-minute bucket,
    computed over the trailing 6 weeks for that weekday in America/New_York.
  - The level is inferred per sample from its own thresholds before taking the median.
- **Grants:**
  - RLS is on for `occupancy_samples`, with no policies for `anon`/`authenticated`: no direct reads, and writes only through
    the service-role function.
  - `execute` on the RPC goes to `anon, authenticated`.
  - Explicit `GRANT`/`REVOKE` per CLAUDE.md, with TRUNCATE revoked.
- **Shared logic** goes in `@udine/shared` as `occupancy.ts`, a pure function. Given the typical curve, the current live
  reading (headcount and thresholds) and "now", it returns `{ level, vsUsual, usuallyClearsAt | null, confidence }`.
  - `usuallyClearsAt` is the first future bucket today whose median level is below the current level.
  - `confidence` is low under N samples per bucket.
  - Mobile reads the live numbers straight from `get_infov2`, as it already does for hours, and the typical curve from the
    RPC. Both are cached on the device.

Residency: this adds a new row to CLAUDE.md's residency table: **"Hall occupancy history
(`occupancy_samples`) — Server, public read-only via RPC. Upstream crowd percentages per location
over time, no per-user data."** It's like `public.dishes`: public facts about places, not
anyone's behavior. It works for the anonymous path, because the RPC is granted to `anon`.

Rationale:
- UMass's feed briefly computed `usual_pct`, `outlook` and `calmer_at`. On 2026-10-08 its `confidence` was `"new"`, and by
  2026-10-11 the object was gone. Only our own history can say what's usual.
- Our own trailing-6-week medians per weekday and time give a stable "usually clears at" that
  adapts as the semester's rhythm changes.
- Rejected: computing typical curves on the device from the app's own polling. Each device only
  sees the moments it was open, so the curves would be sparse and per-user.
- Rejected: storing the whole `get_infov2` payload. We'd keep only what the derivation needs.
- Cadence: 96 upstream calls a day, which is gentle. Every other cron here is hourly or daily.
  15 minutes matches the RPC's buckets and still resolves a lunch rush. The owner asked for every time of day
  (2026-10-12), so there's no window.

## Acceptance

- [ ] Migration creates the table, RLS, grants, RPC (search_path pinned), retention and schedule — evidence: pgTAP (anon can't select `occupancy_samples`, anon can execute the RPC, TRUNCATE revoked, RPC returns medians for seeded samples)
- [ ] `record-occupancy` rejects calls without the cron secret, skips `999999`/non-integer locations, stores the raw numbers, and is idempotent within a 15-minute slot — evidence: deno test
- [ ] `occupancy.ts` derives `usuallyClearsAt`/`vsUsual`/`confidence` correctly, including null-outlook and low-sample cases — evidence: test (shared lane)
- [ ] CLAUDE.md residency table gains the occupancy row — evidence: diff
- [ ] Owner applies the migration and confirms rows accumulating, using `select count(*) … group by location_id` after a day — evidence: owner

## Tasks

1. Migration + `record-occupancy` + pgTAP + deno tests + the CLAUDE.md residency row (the table ships here) — files: `supabase/migrations/<ts>_occupancy_history.sql`, `supabase/functions/record-occupancy/`, `supabase/tests/database/` — lanes: supabase test db, deno test — blocked by: none — PR:
2. `@udine/shared` `occupancy.ts` + tests (can wait for the UI that reads it) — files: `shared/src/occupancy.ts` — lanes: shared — blocked by: none — PR:
