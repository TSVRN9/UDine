-- #184 security review rework: adversarial cases the review reproduced against the local stack,
-- each proven red against the pre-fix state (20260824150000 alone) and green with
-- 20260824160000's fixes applied. House style per 07_shared_stats_rls.sql/09's own precedent:
-- loosen the exact mechanism, watch the assertion flip red, restore it, watch it flip back.
--
-- #222: that repair-and-break style means this file could stay 100% green even if the SHIPPED
-- migration regressed -- the RED blocks below ADD the pre-fix grant/policy back themselves, so
-- they'd never notice it was already back. The block right after plan() closes that gap: it reads
-- the real, already-migrated ambient state (information_schema/pg_policies/has_*_privilege) before
-- this file's own RED blocks touch anything, so a regression in 20260824160000 itself shows up here
-- even though every exploit assertion further down would still pass for the wrong reason.
create extension if not exists pgtap;

begin;
select plan(32);

-- =================================================================================================
-- #222 AMBIENT: read the real post-migration state, before this file's own RED blocks mutate
-- anything. If 20260824160000's fixes ever regressed (e.g. the blanket UPDATE grant on friendships
-- came back), these fail on their own -- the exploit assertions below can't cover for them, because
-- those RED blocks apply the very grant/policy this section is checking is ALREADY absent.
-- =================================================================================================

select ok(
  not has_column_privilege('authenticated', 'public.friendships', 'confirmed_a', 'UPDATE'),
  'AMBIENT: authenticated has no UPDATE on friendships.confirmed_a'
);
select ok(
  not has_column_privilege('authenticated', 'public.friendships', 'confirmed_b', 'UPDATE'),
  'AMBIENT: authenticated has no UPDATE on friendships.confirmed_b'
);
-- The other half of Finding 1's fix: the narrowed grant must still cover status/requested_by, or
-- the ordinary search-flow accept breaks. Without this, an over-revoke regression (drop the column
-- grant entirely instead of narrowing it) would pass every check above AND the "search-flow accept
-- still works" lives_ok further down -- that lives_ok runs after THIS FILE's own repair re-grants
-- these two columns, so it can't see an ambient over-revoke either.
select ok(
  has_column_privilege('authenticated', 'public.friendships', 'status', 'UPDATE'),
  'AMBIENT: authenticated keeps UPDATE on friendships.status -- the search-flow accept needs it'
);
select ok(
  has_column_privilege('authenticated', 'public.friendships', 'requested_by', 'UPDATE'),
  'AMBIENT: authenticated keeps UPDATE on friendships.requested_by -- see 08''s two-field-forge case'
);

select ok(
  not has_table_privilege('authenticated', 'public.qr_tokens', 'TRUNCATE'),
  'AMBIENT: authenticated has no TRUNCATE on qr_tokens'
);

select matches(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'friendships' and policyname = 'participants can insert their own pending search requests'),
  'status = ''pending''',
  'AMBIENT: friendships INSERT policy''s with_check still requires status = ''pending'' (the #214 must-start-pending arm)'
);
select matches(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'friendships' and policyname = 'participants can insert their own pending search requests'),
  'discoverable',
  'AMBIENT: friendships INSERT policy''s with_check still requires the target to be discoverable'
);

select ok(not has_function_privilege('anon', 'public.mint_qr_token()', 'EXECUTE'), 'AMBIENT: anon has no EXECUTE on mint_qr_token');
select ok(not has_function_privilege('public', 'public.mint_qr_token()', 'EXECUTE'), 'AMBIENT: PUBLIC has no EXECUTE on mint_qr_token');
select ok(not has_function_privilege('anon', 'public.redeem_qr_token(uuid)', 'EXECUTE'), 'AMBIENT: anon has no EXECUTE on redeem_qr_token');
select ok(not has_function_privilege('public', 'public.redeem_qr_token(uuid)', 'EXECUTE'), 'AMBIENT: PUBLIC has no EXECUTE on redeem_qr_token');
select ok(not has_function_privilege('anon', 'public.confirm_friendship(uuid)', 'EXECUTE'), 'AMBIENT: anon has no EXECUTE on confirm_friendship');
select ok(not has_function_privilege('public', 'public.confirm_friendship(uuid)', 'EXECUTE'), 'AMBIENT: PUBLIC has no EXECUTE on confirm_friendship');

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- carol is private (not discoverable), no existing relationship with anyone.
update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-000000000003';

-- bob has an opted-in shared_stats row -- the actual thing findings 1/2 let an attacker read.
insert into public.shared_stats (user_id, completion) values
  ('00000000-0000-0000-0000-000000000002', '[{"hallTid":1,"loggedDistinct":5,"seenDistinct":9}]'::jsonb);

-- =================================================================================================
-- Finding 1: a participant writing the OTHER party's confirm column (not just the no-confirms
-- flip 09's assertion 24 covered -- alice is the code owner here, NOT requested_by, so the
-- self-accept USING guard does not block her).
-- =================================================================================================

-- alice mints, bob redeems -- pending qr row (alice, bob), requested_by = bob.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.mint_qr_token();
reset role;
select set_config('app.qr_token', (select token::text from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'), false);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select public.redeem_qr_token(current_setting('app.qr_token')::uuid);
reset role;

-- RED first: temporarily restore the pre-fix blanket UPDATE grant and prove the exploit works
-- exactly as the reviewer ran it -- alice (participant, not requested_by) force-accepts unilaterally.
grant update on public.friendships to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$update public.friendships set status = 'accepted', confirmed_a = now(), confirmed_b = now() where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'$$,
  'RED: with the pre-fix blanket UPDATE grant, alice (code owner, not requested_by) can force-accept unilaterally by writing both confirm columns herself'
);
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000002'),
  1,
  'RED: ...and immediately reads bob''s shared_stats without bob ever confirming anything'
);
reset role;
-- revert the row and the grant back to the fixed state. Must run at the ambient (superuser) role,
-- not `authenticated` -- REVOKE/GRANT issued by a non-owner role doesn't error, it silently no-ops
-- with a WARNING ("no privileges could be revoked"), which would leave the blanket grant above
-- still in effect and make every GREEN assertion below pass for the wrong reason. Caught exactly
-- this way the first time this test was written -- forgetting this reset left the "fixed" state
-- never actually restored.
update public.friendships set status = 'pending', confirmed_a = null, confirmed_b = null
  where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';
revoke update on public.friendships from authenticated;
grant update (status, requested_by) on public.friendships to authenticated;

-- GREEN: with the fix's column-grant lock in place, the identical statement is rejected outright.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select throws_like(
  $$update public.friendships set status = 'accepted', confirmed_a = now(), confirmed_b = now() where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'$$,
  '%permission denied%',
  'GREEN: with confirmed_a/confirmed_b column-grant-locked, the same one-statement force-accept is rejected'
);
-- Still as alice -- this must run RLS-gated (as alice), not at the ambient superuser role (which
-- bypasses RLS entirely and would read every shared_stats row regardless, testing nothing).
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000002'),
  0,
  'and alice still cannot read bob''s shared_stats'
);
reset role;
select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  'pending',
  'the friendship is genuinely still pending -- the rejected statement changed nothing'
);

-- The legitimate path still works: confirm_friendship (security definer) can still write both
-- sides' confirm columns, because it bypasses grantee column privileges as the table owner.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.confirm_friendship('00000000-0000-0000-0000-000000000002');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select public.confirm_friendship('00000000-0000-0000-0000-000000000001');
reset role;
select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  'accepted',
  'confirm_friendship (security definer) can still legitimately accept once both sides genuinely confirm'
);
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

-- Existing search-flow accept (plain UPDATE ... SET status) is untouched by the narrowed grant.
insert into public.friendships (user_a, user_b, status, requested_by)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'pending', '00000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$update public.friendships set status = 'accepted' where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'$$,
  'the ordinary search-flow accept (status only, by the non-requester) still works with the narrowed grant'
);
reset role;
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

-- =================================================================================================
-- Finding 2 + #214: raw INSERT bypassing both the discoverability guard and the "must start
-- pending" guard.
-- =================================================================================================

-- RED first: temporarily restore the pre-fix INSERT policy and prove both exploits work.
drop policy "participants can insert their own pending search requests" on public.friendships;
create policy "participants can insert their own friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requested_by and (auth.uid() = user_a or auth.uid() = user_b));

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$insert into public.friendships (user_a, user_b, status, requested_by) values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'pending', '00000000-0000-0000-0000-000000000002')$$,
  'RED: with the pre-fix INSERT policy, bob can raw-insert a request landing in carol''s inbox even though carol is not discoverable'
);
reset role;
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000002' and user_b = '00000000-0000-0000-0000-000000000003';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$insert into public.friendships (user_a, user_b, status, requested_by) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '00000000-0000-0000-0000-000000000001')$$,
  'RED (#214): with the pre-fix INSERT policy, alice can raw-insert an ALREADY-accepted friendship with no accept step at all'
);
select is(
  (select count(*)::int from public.shared_stats where user_id = '00000000-0000-0000-0000-000000000002'),
  1,
  'RED: ...and immediately reads bob''s shared_stats via the forged-accepted row'
);
reset role;
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

-- restore the fixed policy.
drop policy "participants can insert their own friend requests" on public.friendships;
create policy "participants can insert their own pending search requests"
  on public.friendships for insert
  to authenticated
  with check (
    auth.uid() = requested_by
    and (auth.uid() = user_a or auth.uid() = user_b)
    and status = 'pending'
    and confirmed_a is null
    and confirmed_b is null
    and origin = 'search'
    and exists (
      select 1 from public.profiles p
      where p.user_id = (case when user_a = auth.uid() then user_b else user_a end)
        and p.discoverable = true
    )
  );

-- GREEN: both exploits are now rejected outright. Same actors as the RED block above (bob for the
-- discoverability case, alice for the #214/origin cases) -- otherwise a rejection could just be the
-- unrelated requested_by/participant check firing instead of the check actually being tested.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$insert into public.friendships (user_a, user_b, status, requested_by) values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'pending', '00000000-0000-0000-0000-000000000002')$$,
  '%row-level security policy%',
  'GREEN: the same raw insert targeting non-discoverable carol is rejected'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select throws_like(
  $$insert into public.friendships (user_a, user_b, status, requested_by) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted', '00000000-0000-0000-0000-000000000001')$$,
  '%row-level security policy%',
  'GREEN (#214): the same raw insert-as-accepted is rejected -- a new friendship must start pending'
);
select throws_like(
  $$insert into public.friendships (user_a, user_b, status, requested_by, origin) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'pending', '00000000-0000-0000-0000-000000000001', 'qr')$$,
  '%row-level security policy%',
  'GREEN: a raw insert also cannot claim origin = qr without ever redeeming a real token'
);
reset role;

-- The legitimate path (request_friendship, against a discoverable target) still works.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select lives_ok(
  $$select public.request_friendship('00000000-0000-0000-0000-000000000002')$$,
  'request_friendship against a discoverable target still succeeds with the narrowed INSERT policy'
);
reset role;

-- =================================================================================================
-- Finding 4: TRUNCATE on qr_tokens.
-- =================================================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.mint_qr_token();
reset role;

grant truncate on public.qr_tokens to authenticated;
set local role authenticated;
select lives_ok(
  $$truncate public.qr_tokens$$,
  'RED: before the truncate revoke, plain authenticated can truncate qr_tokens outright (RLS never gates TRUNCATE)'
);
reset role;
revoke truncate on public.qr_tokens from anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.mint_qr_token();
select throws_like(
  $$truncate public.qr_tokens$$,
  '%permission denied%',
  'GREEN: with truncate revoked, the same statement is rejected'
);
reset role;

-- =================================================================================================
-- Finding 5: anon cannot call any of the three new RPCs.
-- =================================================================================================

set local role anon;
select throws_like(
  $$select public.mint_qr_token()$$,
  '%permission denied%',
  'anon cannot execute mint_qr_token'
);
select throws_like(
  $$select public.redeem_qr_token('11111111-1111-1111-1111-111111111111'::uuid)$$,
  '%permission denied%',
  'anon cannot execute redeem_qr_token'
);
select throws_like(
  $$select public.confirm_friendship('00000000-0000-0000-0000-000000000001'::uuid)$$,
  '%permission denied%',
  'anon cannot execute confirm_friendship'
);
reset role;

select * from finish();
rollback;
