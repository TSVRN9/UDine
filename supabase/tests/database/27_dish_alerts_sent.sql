-- dish_alerts_sent: send-dish-alerts' per-(dish, day) claim table (docs/briefs/flutter-port-alert-push.md Task 3).
-- Public facts only; service_role is the sole reader/writer.
create extension if not exists pgtap;

begin;
select plan(13);

select has_table('public', 'dish_alerts_sent', 'dish_alerts_sent exists');
select ok((select relrowsecurity from pg_class where oid = 'public.dish_alerts_sent'::regclass), 'RLS is on');
select is((select count(*)::int from pg_policies where tablename = 'dish_alerts_sent'), 0, 'no policies');
select col_is_pk('public', 'dish_alerts_sent', array['dish_key', 'day'], 'primary key is (dish_key, day)');

select ok(not has_table_privilege('anon', 'public.dish_alerts_sent', 'select'), 'anon cannot select');
select ok(not has_table_privilege('anon', 'public.dish_alerts_sent', 'insert'), 'anon cannot insert');
select ok(not has_table_privilege('authenticated', 'public.dish_alerts_sent', 'select'), 'authenticated cannot select');
select ok(not has_table_privilege('authenticated', 'public.dish_alerts_sent', 'insert'), 'authenticated cannot insert');
select ok(not has_table_privilege('authenticated', 'public.dish_alerts_sent', 'delete'), 'authenticated cannot delete');
select ok(not has_table_privilege('anon', 'public.dish_alerts_sent', 'truncate')
  and not has_table_privilege('authenticated', 'public.dish_alerts_sent', 'truncate')
  and not has_table_privilege('service_role', 'public.dish_alerts_sent', 'truncate'), 'nobody has truncate');
select ok(has_table_privilege('service_role', 'public.dish_alerts_sent', 'select')
  and has_table_privilege('service_role', 'public.dish_alerts_sent', 'insert')
  and has_table_privilege('service_role', 'public.dish_alerts_sent', 'delete'), 'service_role can select, insert, delete');

-- Claim: the second claim for the same (dish, day) returns no row; the sweep keeps only the last three days.
create temp table claims (n int, got int);
with c as (insert into public.dish_alerts_sent values ('dish-a', '2026-10-17') on conflict do nothing returning 1)
insert into claims select 1, count(*) from c;
with c as (insert into public.dish_alerts_sent values ('dish-a', '2026-10-17') on conflict do nothing returning 1)
insert into claims select 2, count(*) from c;
select is((select got from claims where n = 1), 1, 'first claim returns a row');
select is((select got from claims where n = 2), 0, 'second claim for the same dish and day returns no row');

select * from finish();
rollback;
