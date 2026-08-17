-- Enforces the @umass.edu signup restriction server-side, per CLAUDE.md: Google's hd= param is a
-- client-side UI hint only and is trivially bypassed. This is a Before User Created Auth Hook
-- (https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) — it runs before the
-- row is inserted into auth.users, so a non-umass signup is rejected outright rather than created
-- and cleaned up after the fact (which would leave a race window).
--
-- Applying this migration does NOT enable the hook by itself — Supabase Auth hook registration is
-- dashboard-only (no public management API for it): Authentication > Hooks (Beta), select
-- `hook_restrict_signup_by_umass_domain` from the "Before User Created" dropdown.
create or replace function public.hook_restrict_signup_by_umass_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email text;
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

  return '{}'::jsonb;
end;
$$;

grant execute
  on function public.hook_restrict_signup_by_umass_domain
  to supabase_auth_admin;

revoke execute
  on function public.hook_restrict_signup_by_umass_domain
  from authenticated, anon, public;
