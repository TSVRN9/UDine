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
- New Edge Function `record-occupancy`, scheduled by pg_cron + pg_net every 10 minutes from 06:30 to 24:00
  America/New_York. It reuses the existing auth: the Vault-backed `Authorization` header plus
  `x-udine-cron-secret`, checked by `supabase/functions/_shared/cronAuth.ts`. Copy the schedule shape
  from `20260914150000_schedule_populate_always_available_dishes.sql`.
- It makes one GET to `https://www.umassdining.com/uapp/get_infov2`, then inserts one row per location whose `busy.pct` is
  non-null. The table is `public.occupancy_samples (location_id int, observed_at timestamptz, pct smallint,
  level smallint, primary key (location_id, observed_at))`. `observed_at` comes from upstream
  `busy.updated` (unix seconds), not the function's clock, so a stale upstream doesn't
  double-count. Inserts use `on conflict do nothing`.
- The same run deletes samples older than 12 weeks.
- A `security definer` RPC `occupancy_typical(p_location_id int, p_dow int)` with `search_path` pinned.
  It returns `(bucket_start time, median_pct smallint, samples int)` per 15-minute bucket, computed over the
  trailing 6 weeks for that weekday in America/New_York.
- Grants:
  - RLS is on for `occupancy_samples`, with no policies for `anon`/`authenticated`: no direct reads,
    and writes only through the service-role function.
  - `execute` on the RPC goes to `anon, authenticated`.
  - Explicit `GRANT`/`REVOKE` per CLAUDE.md, with TRUNCATE revoked.
- Shared logic goes in `@udine/shared` as `occupancy.ts`, a pure function. Given the typical curve, the
  current live reading and "now", it returns `{ vsUsual, usuallyClearsAt | null, confidence }`.
  - `usuallyClearsAt` is the first future bucket today whose median drops a level below the current
    one.
  - `confidence` is low under N samples per bucket. It falls back to UMass's own `calmer_at` and
    `outlook` when present.
  - Mobile reads live `busy` straight from `get_infov2`, as it already does for hours, and the typical
    curve from the RPC. Both are cached on the device.

Residency: this adds a new row to CLAUDE.md's residency table: **"Hall occupancy history
(`occupancy_samples`) — Server, public read-only via RPC. Upstream crowd percentages per location
over time, no per-user data."** It's like `public.dishes`: public facts about places, not
anyone's behavior. It works for the anonymous path, because the RPC is granted to `anon`.

Rationale:
- UMass's feed already computes `usual_pct`, `outlook` and `calmer_at`. As of 2026-10-08 the dining
  commons' `confidence` was `"new"` and most outlook entries were null, so we can't rely on it yet.
- Our own trailing-6-week medians per weekday and time give a stable "usually clears at" that
  adapts as the semester's rhythm changes.
- Rejected: computing typical curves on the device from the app's own polling. Each device only
  sees the moments it was open, so the curves would be sparse and per-user.
- Rejected: storing the whole `get_infov2` payload. We'd keep only what the derivation needs.
- Cadence: 144 upstream calls a day, which is gentle. Every other cron here is hourly or daily.
  10 minutes is the coarsest interval that still resolves a lunch rush.

## Acceptance

- [ ] Migration creates the table, RLS, grants, RPC (search_path pinned), retention and schedule — evidence: pgTAP (anon can't select `occupancy_samples`, anon can execute the RPC, TRUNCATE revoked, RPC returns medians for seeded samples)
- [ ] `record-occupancy` rejects calls without the cron secret, inserts non-null rows, and is idempotent on a repeated upstream `updated` — evidence: deno test
- [ ] `occupancy.ts` derives `usuallyClearsAt`/`vsUsual`/`confidence` correctly, including null-outlook and low-sample cases — evidence: test (shared lane)
- [ ] CLAUDE.md residency table gains the occupancy row — evidence: diff
- [ ] Owner applies the migration and confirms rows accumulating, using `select count(*) … group by location_id` after a day — evidence: owner

## Tasks

1. Migration + `record-occupancy` + pgTAP + deno tests — files: `supabase/migrations/<ts>_occupancy_history.sql`, `supabase/functions/record-occupancy/`, `supabase/tests/database/` — lanes: supabase test db, deno test — blocked by: none — PR:
2. `@udine/shared` `occupancy.ts` + tests, CLAUDE.md residency row — files: `shared/src/occupancy.ts` — lanes: shared — blocked by: none — PR:
