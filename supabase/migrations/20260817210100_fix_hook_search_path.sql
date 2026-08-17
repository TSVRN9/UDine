-- Fixes the function_search_path_mutable advisory on the signup-restriction hook: an unset
-- search_path lets a caller with schema-creation privileges shadow objects the function resolves
-- unqualified. The function doesn't reference any tables, but pin it anyway per Supabase's linter.
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
