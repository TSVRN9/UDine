-- Issue #95 / epic #87 (wave 4): push a notification to a ping's receiver the moment a ping is
-- sent -- pings are latency-sensitive ("come eat with me, I'm here now"), so this widens neither
-- the hourly check-favorited-foods cron nor its schedule; it's a per-insert pg_net trigger/webhook
-- on public.pings instead, calling the new send-ping-push Edge Function.

-- Auth for the http_post call: reuses the SAME vault secret the check-favorited-foods cron job
-- already uses (20260818120000_schedule_check_favorited_foods.sql) -- that secret is just the
-- project's anon/publishable key, not scoped to any one function (send-ping-push is deployed with
-- verify_jwt: true like check-favorited-foods, and reads nothing from the incoming request besides
-- the JSON body; it does its own service-role DB access with its own Edge Function secret). Reusing
-- it means this migration needs no new one-time out-of-band step -- if
-- 'check_favorited_foods_auth_token' is already seeded in Vault (it is, live), this trigger works
-- immediately.
--
-- security definer + set search_path = '' (same pattern as handle_new_user() in
-- 20260817220000_friends_pings_favorited_foods.sql): the trigger fires as a side effect of an
-- `authenticated`-role insert into pings, but net.http_post/vault.decrypted_secrets access
-- shouldn't depend on whatever grants that role happens to have -- it runs with the function
-- owner's (postgres, since migrations run as postgres) privileges instead, same as the cron job's
-- server-side access pattern.
--
-- The whole call is wrapped in its own exception handler: a push notification is a nicety, and this
-- trigger sits on the same insert path real users hit every time they send a ping (public.pings'
-- "friends can send pings" policy, verified in supabase/tests/database/04_pings_rls.sql) -- a vault
-- lookup failure, a pg_net hiccup, or send-ping-push being unreachable must never fail that insert.
-- `raise warning` (not `raise exception`) surfaces the failure in Postgres logs without touching the
-- transaction's outcome.
create or replace function public.notify_ping_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://ubogyqskqzvkcqboqbhw.supabase.co/functions/v1/send-ping-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'check_favorited_foods_auth_token'
        )
      ),
      body := jsonb_build_object('ping_id', new.id)
    );
  exception when others then
    raise warning 'ping push dispatch failed for ping %: %', new.id, sqlerrm;
  end;
  return null; -- AFTER trigger; return value is ignored, but must be non-erroring
end;
$$;

drop trigger if exists ping_push_notify on public.pings;
create trigger ping_push_notify
  after insert on public.pings
  for each row
  execute function public.notify_ping_push();
