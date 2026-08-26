-- #268 half 2: email/password signup is enabled on the live project, and the existing
-- Before-User-Created hook (20260817210000_restrict_signup_by_umass_domain.sql, pinned in
-- 20260817210100_fix_hook_search_path.sql) only ever checked the email's *domain*, not which
-- provider actually authenticated the address. That let anyone plant a discoverable
-- `victim@umass.edu` profile via the password-signup endpoint without ever proving mailbox
-- ownership -- CLAUDE.md's whole point in adopting Google OAuth was that ownership check.
--
-- Half 1 (owner-only, dashboard) disables the Email provider entirely on the live project --
-- that's the actual fix. This migration is the belt-and-braces half: it survives a dashboard
-- misclick or a future re-enable, and it's visible/reviewable in the repo. Extends the SAME
-- function (name unchanged) so the existing "Before User Created" dashboard hook registration
-- does not need to be re-selected.
--
-- Field choice: `event->'user'->'app_metadata'->>'provider'`, not the sibling `providers` array.
-- Confirmed against Supabase's own docs (Auth Hooks > Before User Created hook): both fields are
-- documented as always-present on this event, but Supabase's own worked example for this exact
-- use case -- "Block by OAuth Provider" -- reads the singular `provider` field
-- (`provider := event->'user'->'app_metadata'->>'provider';`). At user-creation time there is
-- exactly one identity being created, so `providers` (plural) is always a one-element array
-- containing that same value -- checking it would just be an array-containment version of the
-- identical check, not a stronger one. `provider` is also not client-suppliable: GoTrue sets it
-- itself from which signup endpoint/flow was used, unlike `user_metadata`/`raw_user_meta_data`
-- (see #267 -- that field IS client-controlled, which is a different, already-handled concern).
create or replace function public.hook_restrict_signup_by_umass_domain(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email text;
  provider text;
begin
  email := event->'user'->>'email';

  if email is null or email !~* '@umass\.edu$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'UDine accounts require a @umass.edu email address.',
        'http_code', 403
      )
    );
  end if;

  provider := event->'user'->'app_metadata'->>'provider';

  if provider is distinct from 'google' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'UDine accounts sign in with Google.',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;
