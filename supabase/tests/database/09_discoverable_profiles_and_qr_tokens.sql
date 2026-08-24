-- #184: Add Friends surface -- profiles.discoverable gating the search/select path,
-- request_friendship's new "no remote requests to a non-discoverable stranger" guard, qr_tokens
-- RLS + expiry/replay, and the both-confirm state machine (redeem_qr_token + confirm_friendship +
-- the friendships_qr_needs_both_confirms check). Modeled on 07_shared_stats_rls.sql's house style:
-- simulated JWT claims, stranger/pending/anon denial cases, genuine mutation-red on the CHECK
-- constraint that actually enforces both-confirm.
create extension if not exists pgtap;

begin;
select plan(31);

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@umass.edu',   crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol@umass.edu', crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dave@umass.edu',  crypt('x', gen_salt('bf')), '{}', '{}', now(), now(), '', now());

-- (1) email is backfilled by the (recreated) signup trigger.
select is(
  (select email from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  'alice@umass.edu',
  'handle_new_user backfills profiles.email from auth.users.email'
);

-- (2) discoverable defaults true.
select is(
  (select discoverable from public.profiles where user_id = '00000000-0000-0000-0000-000000000001'),
  true,
  'discoverable defaults to true'
);

-- carol goes private; dave stays discoverable and becomes an accepted friend of alice; alice and
-- dave's friendship is used below to prove revoking discoverability never breaks it.
update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-000000000003';
insert into public.friendships (user_a, user_b, status, requested_by)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'accepted', '00000000-0000-0000-0000-000000000001');

-- (3) A stranger (bob) can see a discoverable profile (carol, before she goes private -- test dave,
-- who stays discoverable throughout) directly, no RPC needed -- the RLS-scoped select IS the search
-- boundary.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-000000000004'),
  1,
  'bob (stranger) can read dave''s profile -- dave is discoverable'
);
select is(
  (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-000000000003'),
  0,
  'bob (stranger) cannot read carol''s profile -- carol went private and has no relationship with bob'
);
reset role;

-- (4) Revoking discoverability never breaks an EXISTING friendship: alice can still read dave's
-- profile even if dave later goes private too (relationship clause, not the discoverable clause).
update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-000000000004'),
  1,
  'alice can still read dave''s profile after he goes private -- they''re already friends'
);
reset role;
-- put dave back for the rest of the suite.
update public.profiles set discoverable = true where user_id = '00000000-0000-0000-0000-000000000004';

-- (5) A user can always read their own profile regardless of discoverable.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-000000000003'),
  1,
  'carol can always read her own profile, private or not'
);
reset role;

-- (6) request_friendship rejects targeting a non-discoverable stranger (carol, private, no
-- existing relationship with bob) -- "no remote requests possible".
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$select public.request_friendship('00000000-0000-0000-0000-000000000003')$$,
  '%not accepting friend requests%',
  'request_friendship rejects a request to a non-discoverable stranger'
);
reset role;

-- (7) ... but still succeeds against a discoverable target.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$select public.request_friendship('00000000-0000-0000-0000-000000000004')$$,
  'request_friendship still succeeds against a discoverable target'
);
reset role;

-- (8) Mutation-red on the request_friendship guard: prove the throws_like above is actually load-
-- bearing by relaxing carol back to discoverable and watching the same call succeed.
update public.profiles set discoverable = true where user_id = '00000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$select public.request_friendship('00000000-0000-0000-0000-000000000003')$$,
  'mutation-red: the same request that just failed succeeds once carol is discoverable again'
);
reset role;
update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-000000000003';
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000002' and user_b = '00000000-0000-0000-0000-000000000003';

-- (9) email is locked down: bob cannot spoof his own profiles.email to someone else's address.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$update public.profiles set email = 'not-really-alice@umass.edu' where user_id = '00000000-0000-0000-0000-000000000002'$$,
  '%permission denied%',
  'a user cannot update their own profiles.email column -- locked to the signup trigger'
);
-- discoverable IS still owner-writable, same statement shape as the toggle screen will use.
select lives_ok(
  $$update public.profiles set discoverable = false where user_id = '00000000-0000-0000-0000-000000000002'$$,
  'a user can still update their own discoverable column'
);
reset role;
update public.profiles set discoverable = true where user_id = '00000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------------------------
-- qr_tokens
-- ---------------------------------------------------------------------------------------------

-- (10) mint_qr_token creates the caller's own row.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.mint_qr_token();
reset role;
select is(
  (select count(*)::int from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  1,
  'mint_qr_token creates alice''s own qr_tokens row'
);

-- (11) Re-minting replaces the token outright (one active token per user, "code refreshes").
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.mint_qr_token();
reset role;
select is(
  (select count(*)::int from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  1,
  'minting again still leaves exactly one row for alice -- refresh, not accumulation'
);

-- (12) Owner can read their own token; a stranger's direct select of it comes back empty (RLS
-- filters to zero rows, not an error -- same shape as every other own-row table in this schema).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  1,
  'alice can read her own qr_tokens row'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'bob cannot read alice''s qr_tokens row directly'
);
reset role;

-- (13) A raw insert/update against qr_tokens from `authenticated` is rejected outright -- writes
-- only happen through the security-definer RPCs.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$insert into public.qr_tokens (user_id, token) values ('00000000-0000-0000-0000-000000000002', gen_random_uuid())$$,
  '%permission denied%',
  'a raw insert into qr_tokens is rejected -- no insert grant for authenticated'
);
reset role;

-- ---------------------------------------------------------------------------------------------
-- redeem_qr_token: expiry + replay-after-expiry + self-scan rejection
-- ---------------------------------------------------------------------------------------------

-- (14) An unknown/bogus token is rejected.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$select public.redeem_qr_token('11111111-1111-1111-1111-111111111111')$$,
  '%invalid or expired code%',
  'redeem_qr_token rejects a token that does not exist'
);
reset role;

-- (15) alice's own token cannot be redeemed by alice herself.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select throws_like(
  $$select public.redeem_qr_token((select token from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'))$$,
  '%cannot add yourself%',
  'alice cannot redeem her own qr token'
);
reset role;

-- (16) A valid token redeemed by bob creates a pending, qr-origin friendship row with both confirm
-- columns still null. Captured into a session GUC first (ambient/superuser, bypasses RLS) --
-- bob's own role can't select alice's qr_tokens row at all (owner-only SELECT policy), so a plain
-- subquery under bob's claims would just see NULL.
select set_config('app.qr_token', (select token::text from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'), false);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select public.redeem_qr_token(current_setting('app.qr_token')::uuid);
reset role;
select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  'pending',
  'redeeming a valid token creates a pending friendship, not yet accepted'
);
select is(
  (select origin from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  'qr',
  'the redeemed friendship is tagged origin = qr'
);
select is(
  (select confirmed_a is null and confirmed_b is null from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  true,
  'neither side has confirmed yet -- the scan alone is not a confirm'
);
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

-- (17) & (18) Expiry: an expired token is rejected, and replaying it after expiry stays rejected
-- (not "used once then blocked" -- genuinely time-based).
update public.qr_tokens set expires_at = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-000000000001';
select set_config('app.qr_token', (select token::text from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'), false);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select throws_like(
  $$select public.redeem_qr_token(current_setting('app.qr_token')::uuid)$$,
  '%invalid or expired code%',
  'an expired token is rejected'
);
select throws_like(
  $$select public.redeem_qr_token(current_setting('app.qr_token')::uuid)$$,
  '%invalid or expired code%',
  'replaying the same expired token again is still rejected'
);
reset role;

-- (19) Mutation-red: re-minting (fresh expiry) makes the exact same call path succeed again --
-- proves (17)/(18) are actually gated on expires_at, not some unrelated failure.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.mint_qr_token();
reset role;
select set_config('app.qr_token', (select token::text from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'), false);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select lives_ok(
  $$select public.redeem_qr_token(current_setting('app.qr_token')::uuid)$$,
  'mutation-red: a freshly-reminted (non-expired) token redeems successfully'
);
reset role;

-- ---------------------------------------------------------------------------------------------
-- both-confirm: confirm_friendship + friendships_qr_needs_both_confirms
-- ---------------------------------------------------------------------------------------------

-- (bob just redeemed alice's fresh token above -- pending qr row between 01/02 exists again.)

-- (20) alice confirming leaves status pending (only one side has confirmed).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.confirm_friendship('00000000-0000-0000-0000-000000000002');
reset role;
select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  'pending',
  'one-sided confirm (alice, the code owner) leaves the friendship still pending'
);
select is(
  (select confirmed_a is not null and confirmed_b is null from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  true,
  'only confirmed_a is set after alice confirms'
);

-- (21) bob (the scanner / requested_by) confirming is what the pre-existing self-accept guard
-- would normally block on a plain UPDATE while pending -- confirm_friendship must still work for
-- him, via its security-definer bypass.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select public.confirm_friendship('00000000-0000-0000-0000-000000000001');
reset role;
select is(
  (select status from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002'),
  'accepted',
  'both sides confirmed -- the friendship is now accepted, and the requester (scanner) was able to confirm despite the self-accept UPDATE guard'
);
-- Clear this pair's row before (24) reuses alice/bob for the constraint mutation-red below --
-- otherwise redeem_qr_token's on-conflict-do-nothing would just hand back this already-accepted
-- row instead of creating a fresh pending one.
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';

-- (22) A third party (carol) confirming against a row she's not part of finds nothing to confirm.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003"}';
select throws_like(
  $$select public.confirm_friendship('00000000-0000-0000-0000-000000000001')$$,
  '%no pending in-person request to confirm%',
  'carol confirming against a friendship she is not part of raises -- nothing to confirm'
);
reset role;

-- (23) confirm_friendship is scoped to origin = 'qr': it cannot be used to fast-track a
-- search-origin pending request past the normal single-side accept.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003"}';
select public.request_friendship('00000000-0000-0000-0000-000000000004');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000004"}';
select throws_like(
  $$select public.confirm_friendship('00000000-0000-0000-0000-000000000003')$$,
  '%no pending in-person request to confirm%',
  'confirm_friendship refuses to touch a search-origin (not qr) pending row'
);
reset role;
delete from public.friendships where user_a = '00000000-0000-0000-0000-000000000003' and user_b = '00000000-0000-0000-0000-000000000004';

-- (24) Mutation-red on the actual both-confirm guarantee: the friendships_qr_needs_both_confirms
-- CHECK, not just confirm_friendship's own logic, is what makes "either side alone can force
-- accept" impossible. Prove it by dropping the constraint and watching a one-sided raw UPDATE to
-- 'accepted' on a qr-origin row succeed (it shouldn't be able to, and with the constraint in place
-- it can't -- reverted immediately after).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
select public.mint_qr_token();
reset role;
select set_config('app.qr_token', (select token::text from public.qr_tokens where user_id = '00000000-0000-0000-0000-000000000001'), false);
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002"}';
select public.redeem_qr_token(current_setting('app.qr_token')::uuid);
reset role;

-- Both statements below run as the ambient superuser connection (no role narrowed) -- the point
-- is to isolate the CHECK constraint itself, not any RLS policy, so RLS is irrelevant here.
alter table public.friendships drop constraint friendships_qr_needs_both_confirms;
select lives_ok(
  $$update public.friendships set status = 'accepted' where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002' and origin = 'qr'$$,
  'mutation-red: WITHOUT the check constraint, a one-sided (no confirms at all) status flip to accepted succeeds'
);
-- Revert the row to pending BEFORE re-adding the constraint -- ADD CONSTRAINT validates every
-- existing row immediately, and this row is currently 'accepted' with no confirms (exactly the
-- state the constraint exists to forbid), so re-adding it first would fail on the existing row
-- rather than on the throws_like attempt below.
update public.friendships set status = 'pending' where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';
alter table public.friendships add constraint friendships_qr_needs_both_confirms
  check (status <> 'accepted' or origin <> 'qr' or (confirmed_a is not null and confirmed_b is not null));

select throws_like(
  $$update public.friendships set status = 'accepted' where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002' and origin = 'qr'$$,
  '%friendships_qr_needs_both_confirms%',
  'WITH the constraint restored, the same one-sided flip to accepted is rejected at the DB layer'
);

select * from finish();
rollback;
