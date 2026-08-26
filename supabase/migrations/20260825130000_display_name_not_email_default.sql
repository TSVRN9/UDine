-- #260: display_name defaulted to split_part(email, '@', 1) since 20260817220000, and the domain
-- is a constant (@umass.edu, guaranteed by the signup hook) -- so for any user who never renamed,
-- display_name IS their email local-part. display_name stays on the table-wide SELECT grant
-- (20260825120000) and the discoverable=true policy arm is unbounded (that's #234's fix, separate
-- issue) -- so this was the exact bulk-email-scrape #227/20260825120000 closed, reopened through a
-- different column, at 1 query instead of 504. This migration is HALF 1 of #260's two-part fix
-- only: stop the leak at the source (new signups) and clean up what already leaked (existing rows).
-- #234's definer reroute for the discoverable=true SELECT arm is out of scope here.
--
-- Default chosen: coalesce(full_name, name, 'UMass student') from raw_user_meta_data. Supabase's
-- Google OAuth identity payload is documented to populate both `full_name` and `name` (they're
-- typically identical, kept as two keys for provider-shape compatibility) -- but this repo's own
-- fixtures (supabase/tests/database/*.sql) all insert raw_user_meta_data as '{}', and there is no
-- live-signup capture on file to confirm the actual shape server-side, so this is NOT independently
-- verified against a real Google signup on this project. Whatever the real key turns out to be,
-- neither coalesce arm can ever produce an email-derived string, so the leak stays closed even if
-- both keys come back empty and every user lands on 'UMass student' -- confirm the real key live
-- before treating "shows real names" (as opposed to "leaks nothing") as verified.
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

-- Backfill (option (a) from the issue -- silently rewrite to the same non-email default, not (b)
-- flag-for-rename-prompt). (a) chosen because it's the smaller, immediately-effective fix for a
-- live security leak; a rewritten "UMass student" is no longer anyone's email, whereas leaving it
-- flagged-but-unchanged keeps every existing row scrapeable until the user next opens the app. (b)
-- is not free here -- it needs a new column/flag, a mobile UI prompt, and a decision about when the
-- prompt fires, none of which exist yet -- so it's raised in the PR body for the owner rather than
-- built speculatively. Every affected row gets the literal 'UMass student' (not each user's OAuth
-- name) because a backfill has no live raw_user_meta_data to re-derive from at migration time --
-- only handle_new_user, running at signup, ever sees that payload.
--
-- Scoped to exactly the rows the issue's repro flags: display_name = email local-part. A user who
-- already renamed themselves (differs from the local-part, even coincidentally matching a real
-- name) is left untouched -- this migration fixes the leak, it doesn't overwrite anyone's deliberate
-- choice.
update public.profiles p
set display_name = 'UMass student'
from auth.users u
where p.user_id = u.id
  and p.display_name = split_part(u.email, '@', 1);
