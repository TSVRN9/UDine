-- Fixes anon/authenticated_security_definer_function_executable: handle_new_user is meant to run
-- only as the auth.users trigger, not be callable directly via PostgREST's auto-exposed RPC endpoint
-- (revoking EXECUTE doesn't affect the trigger itself — triggers fire regardless of grants).
revoke execute on function public.handle_new_user() from anon, authenticated, public;
