-- #260: display_name defaulted to split_part(email, '@', 1) since 20260817220000, and the domain
-- is a constant (@umass.edu, guaranteed by the signup hook) -- so for any user who never renamed,
-- display_name IS their email local-part. display_name stays on the table-wide SELECT grant
-- (20260825120000) and the discoverable=true policy arm is unbounded (that's #234's fix, separate
-- issue) -- so this was the exact bulk-email-scrape #227/20260825120000 closed, reopened through a
-- different column, at 1 query instead of 504. This migration is HALF 1 of #260's two-part fix
-- only: stop the leak at the source (new signups) and clean up what already leaked (existing rows).
-- #234's definer reroute for the discoverable=true SELECT arm is out of scope here.
--
-- Default chosen: coalesce(full_name, name, 'UMass student') from raw_user_meta_data. CONFIRMED
-- live (read-only select) -- Google OAuth signups on this project populate both `full_name` and
-- `name` in raw_user_meta_data (identical values). 'UMass student' is not dead code, though: an
-- email/password signup (no OAuth identity) carries raw_user_meta_data = '{}', and a Google
-- signup could in principle omit both keys, so the literal fallback still has a real caller.
-- Accepted residual: a user whose Google full_name happens to equal their email handle (e.g.
-- someone actually named "jsmith") still lands on it here -- that's coincidence, not derivation,
-- and isn't bulk-recoverable the way split_part(email, '@', 1) was.
--
-- Not yet applied to the live project (owner-gated, see CLAUDE.md) -- applies only after this PR is
-- reviewed and approved, same as every other migration in this repo's recent history.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      'UMass student'
    ),
    new.email
  );
  return new;
end;
$$;

-- Backfill (option (a) from the issue -- silently rewrite, not (b) flag-for-rename-prompt). (a) is
-- fine here, not just smaller: there is no display_name WRITE path anywhere in mobile/web today
-- (grepped every public.profiles write -- the full set is discoverable and notifications_enabled),
-- so a leaked row's current value can never be a deliberate user choice -- it's either this
-- migration's old email-derived default or literally nothing else. (b)'s rename-prompt would solve
-- a problem no user can actually have.
--
-- re-derives display_name with the EXACT same coalesce/nullif chain as handle_new_user above,
-- joining auth.users' raw_user_meta_data (a persisted column, not something only visible at
-- signup time) -- so a real Google name lands correctly (verified live: the one existing user has
-- full_name/name = "Owen Wang", display_name = "owenwang", i.e. their real name is one column away
-- and must not be thrown out for a placeholder). Only email/password rows with raw_user_meta_data
-- = '{}' (or a blank full_name/name) fall through to 'UMass student'. Idempotent: re-running finds
-- nothing left to update once display_name no longer equals the email local-part.
update public.profiles p
set display_name = coalesce(
  nullif(u.raw_user_meta_data->>'full_name', ''),
  nullif(u.raw_user_meta_data->>'name', ''),
  'UMass student'
)
from auth.users u
where p.user_id = u.id
  and p.display_name = split_part(u.email, '@', 1);
