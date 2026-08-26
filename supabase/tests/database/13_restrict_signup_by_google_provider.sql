-- #268 half 2: hook_restrict_signup_by_umass_domain (20260817210000_restrict_signup_by_umass_domain.sql
-- + the 20260826120000 provider-check follow-up) is a Before-User-Created auth hook, invoked by
-- GoTrue with a simulated event payload, not through a real HTTP signup -- there's no live GoTrue
-- on the local pgTAP harness to POST against, so this calls the SQL function directly with the
-- exact event shape Supabase's own docs specify (Auth Hooks > Before User Created hook):
-- `event->'user'->'email'` and `event->'user'->'app_metadata'->>'provider'`. No auth.users rows are
-- inserted anywhere in this file -- the hook only ever inspects the jsonb payload, never the table.
create extension if not exists pgtap;

begin;
select plan(10);

-- Small helper so every case below builds the same event shape with one field varied at a time.
create or replace function pg_temp.signup_event(email text, provider text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created'),
    'user', jsonb_build_object(
      'email', email,
      'app_metadata', case
        when provider is null then jsonb_build_object()
        else jsonb_build_object('provider', provider, 'providers', jsonb_build_array(provider))
      end
    )
  );
$$;

-- =================================================================================================
-- Fixed-function behavior (current main + this PR's migration applied).
-- =================================================================================================

-- (1) RED on pre-#268 main: email/password provider, valid @umass.edu address -- this is exactly
-- the exploit #268 reports (plant victim@umass.edu without proving mailbox ownership). Rejected by
-- the new provider check.
select is(
  (public.hook_restrict_signup_by_umass_domain(pg_temp.signup_event('victim@umass.edu', 'email'))->'error'->>'message'),
  'UDine accounts sign in with Google.',
  'email-provider signup for a valid @umass.edu address is rejected with the provider message'
);

-- (2) google provider, valid @umass.edu address -- the legitimate path, still allowed.
select is(
  public.hook_restrict_signup_by_umass_domain(pg_temp.signup_event('student@umass.edu', 'google')),
  '{}'::jsonb,
  'google-provider signup for a valid @umass.edu address is allowed'
);

-- (3) google provider, non-umass address -- the pre-existing domain check still fires first/independently.
select is(
  (public.hook_restrict_signup_by_umass_domain(pg_temp.signup_event('student@gmail.com', 'google'))->'error'->>'message'),
  'UDine accounts require a @umass.edu email address.',
  'google-provider signup for a non-umass address is still rejected, by the domain check'
);

-- (4) email provider, non-umass address -- both checks would reject; domain check runs first, same
-- message as before this PR (behavior for this case is unchanged).
select is(
  (public.hook_restrict_signup_by_umass_domain(pg_temp.signup_event('nobody@gmail.com', 'email'))->'error'->>'message'),
  'UDine accounts require a @umass.edu email address.',
  'email-provider signup for a non-umass address is rejected by the domain check (message unchanged)'
);

-- (5) no app_metadata.provider at all (defensive -- `is distinct from` treats null as not 'google').
select is(
  (public.hook_restrict_signup_by_umass_domain(pg_temp.signup_event('nulltest@umass.edu', null))->'error'->>'message'),
  'UDine accounts sign in with Google.',
  'a signup event with no provider field at all is rejected, not silently allowed'
);

-- =================================================================================================
-- Ambient assertions (#222): the EXECUTE grants on the hook function itself, read without any
-- mutation in this file, not just "does the function return the right jsonb". A migration that
-- accidentally granted EXECUTE to authenticated/anon/public would pass every assertion above while
-- reopening the ability for a client to invoke the hook logic directly (irrelevant to real signups,
-- but a privilege-boundary regression GoTrue's own contract doesn't expect).
-- =================================================================================================
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_restrict_signup_by_umass_domain(jsonb)', 'EXECUTE'), 'AMBIENT: supabase_auth_admin can execute the hook (required for GoTrue to call it)');
select ok(not has_function_privilege('authenticated', 'public.hook_restrict_signup_by_umass_domain(jsonb)', 'EXECUTE'), 'AMBIENT: authenticated cannot execute the hook directly');
select ok(not has_function_privilege('anon', 'public.hook_restrict_signup_by_umass_domain(jsonb)', 'EXECUTE'), 'AMBIENT: anon cannot execute the hook directly');

-- =================================================================================================
-- RED-first proof that assertion (1) is load-bearing: temporarily restore the pre-#268
-- domain-only function body and watch the exact same email-provider/valid-umass case flip to
-- ALLOWED, exactly as #268 reports live. Then restore the fixed body and confirm it flips back.
-- Mirrors 10_add_friends_security_fixes.sql / 11_profile_search_lockdown.sql's own RED/GREEN style.
--
-- Caveat inherent to this in-file style: the "GREEN" assertion right after this block re-creates
-- the fixed function from a body hardcoded *in this test file*, so it stays green even if the
-- shipped migration's body regresses -- it only proves this test's own copy is self-consistent.
-- The assertion that actually caught a real regression against the shipped migration was run
-- out-of-band, not by this file: with 20260826120000_restrict_signup_by_google_provider.sql
-- temporarily removed and `supabase db reset` re-applied, this suite's assertions (1) and (5)
-- failed exactly as expected ("have: NULL, want: UDine accounts sign in with Google.") while (2),
-- (3), (4), and the ambient grant checks stayed green -- confirming (1)/(5) are the ones actually
-- exercising the new provider check, not passing for an unrelated reason. Re-applying the
-- migration turned the suite green again. That external add/remove-the-migration run, not this
-- inline block, is the authoritative red-first evidence for this PR.
-- =================================================================================================
create or replace function public.hook_restrict_signup_by_umass_domain(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
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

select is(
  public.hook_restrict_signup_by_umass_domain(pg_temp.signup_event('victim@umass.edu', 'email')),
  '{}'::jsonb,
  'RED: the pre-#268 domain-only hook body allows an email-provider signup for a valid @umass.edu address -- the exact exploit'
);

-- Restore the fixed body (the migration's own definition) so later suites in the same test run
-- see the real, shipped function, not this test's ablated one.
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

select is(
  (public.hook_restrict_signup_by_umass_domain(pg_temp.signup_event('victim@umass.edu', 'email'))->'error'->>'message'),
  'UDine accounts sign in with Google.',
  'GREEN: with the fixed body restored, the identical email-provider signup is rejected again'
);

select * from finish();
rollback;
