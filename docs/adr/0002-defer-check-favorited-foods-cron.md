# Schedule check-favorited-foods via pg_cron, deferred until push credentials exist

`check-favorited-foods`'s matching logic is verified (see `CLAUDE.md`), but nothing invokes it on a
schedule — no cron job exists in `supabase/migrations`. We considered three mechanisms: `pg_cron` +
`pg_net` (migration-versioned, consistent with how the rest of the schema lives in
`supabase/migrations`), a Supabase-dashboard Edge Function Cron trigger (same category as the
`@umass.edu` auth hook — dashboard-only registration, outside version control), and an external
scheduler hitting the function's URL.

We chose `pg_cron` + `pg_net`, but deliberately have **not** wired it up yet — it goes in once VAPID
(Web Push) and Firebase/FCM credentials exist, not before. A `food_sightings` row with no push
dispatch step and no in-app "recently spotted" view to consume it has no observable effect for a
user; shipping the cron job before push exists would add a running job with nothing to verify it
against. Bundling the schedule with the credential rollout means the first cron-triggered run can be
verified end-to-end (match → push delivered) instead of partially.

## Consequences

The `@umass.edu` auth hook remains the only dashboard-only-registered piece of this project; every
other cross-cutting Supabase config, including this cron job once it exists, stays
migration-versioned. Until VAPID/FCM credentials land, `check-favorited-foods` stays invokable only
by manual/test trigger, same as today.
