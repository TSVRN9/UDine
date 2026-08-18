-- Discovered while building the pgTAP suite for issue #27: a fresh `supabase start` (local CLI,
-- Postgres 17 image) does NOT auto-grant table-level privileges to anon/authenticated/service_role
-- on new public-schema tables/functions anymore — confirmed via `select * from pg_default_acl`
-- against a freshly-migrated local instance (only TRIGGER/TRUNCATE/REFERENCES show up for those
-- roles, never SELECT/INSERT/UPDATE/DELETE). supabase/config.toml's `api.auto_expose_new_tables`
-- comment confirms this is now "the new cloud default", not a local-only quirk, and that the
-- legacy auto-expose behaviour it names is being removed entirely on 2026-10-30 — so relying on
-- that (deprecated, time-bombed) config flag instead of fixing the schema would just move this
-- same failure to whenever that flag disappears.
--
-- None of `friendships`/`pings`/`favorited_foods`/`push_tokens`/`food_sightings`/
-- `favorite_dining_halls`/`profiles` had an explicit GRANT anywhere in prior migrations — they
-- relied entirely on whatever implicit privilege the table owner (`postgres`) had. Every RLS policy
-- on these tables is `to authenticated`, and RLS is a second gate on top of the base table grant,
-- not a replacement for it: without SELECT/INSERT/UPDATE/DELETE granted to `authenticated` (and
-- `service_role`, which also came back with no grants locally despite BYPASSRLS), Postgres denies
-- access before RLS is even evaluated. This is why the pgTAP tests in supabase/tests/database/ hit
-- `permission denied for table friendships` before this migration existed. Grants below are scoped
-- to exactly the operations each table's existing RLS policies already allow (see
-- 20260817213000_favorite_dining_halls.sql and 20260817220000_friends_pings_favorited_foods.sql)
-- — this does not widen what any user can actually do, RLS still fully gates every row.
--
-- `service_role` gets the full set on every table regardless of policy shape: it's the trusted
-- backend role (Edge Functions, this migration's own future callers) and is expected to bypass RLS
-- entirely, which still requires the base table grant to exist.
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.friendships to service_role;
grant execute on function public.request_friendship(uuid) to authenticated;

grant select, insert, delete on public.pings to authenticated;
grant select, insert, update, delete on public.pings to service_role;

grant select, insert, update, delete on public.favorited_foods to authenticated;
grant select, insert, update, delete on public.favorited_foods to service_role;

grant select, insert, update, delete on public.push_tokens to authenticated;
grant select, insert, update, delete on public.push_tokens to service_role;

-- food_sightings: `authenticated` gets an INSERT grant here on purpose, same as every other table
-- above — the thing that actually blocks a user from spoofing their own sighting is RLS's
-- default-deny (there is no `authenticated` insert *policy*, see
-- 20260817220000_friends_pings_favorited_foods.sql), not a missing table-level grant. Skipping the
-- grant would make an insert attempt fail with a generic "permission denied for table" before RLS
-- is even reached, which would test the wrong mechanism — the pgTAP suite asserts specifically that
-- RLS is what rejects it. service_role (the check-favorited-foods Edge Function) needs full CRUD to
-- populate the table in the first place.
grant select, insert, update on public.food_sightings to authenticated;
grant select, insert, update, delete on public.food_sightings to service_role;

grant select, insert, update, delete on public.favorite_dining_halls to authenticated;
grant select, insert, update, delete on public.favorite_dining_halls to service_role;
