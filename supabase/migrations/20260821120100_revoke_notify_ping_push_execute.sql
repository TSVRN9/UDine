-- Fixes anon/authenticated_security_definer_function_executable (get_advisors, run right after
-- 20260821120000_ping_push_trigger.sql): same class of finding as
-- 20260817220100_revoke_handle_new_user_execute.sql fixed for handle_new_user. notify_ping_push is
-- meant to run only as the pings AFTER INSERT trigger, not be callable directly via PostgREST's
-- auto-exposed RPC endpoint (revoking EXECUTE doesn't affect the trigger itself -- triggers fire
-- regardless of grants).
revoke execute on function public.notify_ping_push() from anon, authenticated, public;
