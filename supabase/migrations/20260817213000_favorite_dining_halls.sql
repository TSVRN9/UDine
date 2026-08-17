-- The only ranking-derived signal allowed to leave the device, per CLAUDE.md's data residency table:
-- a coarse "which dining halls does this user prefer" derived on-device from favoriteDiningHalls()
-- in shared/src/ranking.ts. Per-dish ratings and raw pairwise comparisons never reach this table or
-- any other server table — they stay in device-local storage always, signed in or not.
create table public.favorite_dining_halls (
  user_id uuid not null references auth.users (id) on delete cascade,
  hall_tid int not null,
  rank smallint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, hall_tid)
);

alter table public.favorite_dining_halls enable row level security;

-- No @umass.edu re-check needed here: the before-user-created hook (see
-- restrict_signup_by_umass_domain migration) guarantees no non-umass row can exist in auth.users,
-- so auth.uid() scoping alone is sufficient.
create policy "select own favorite halls"
  on public.favorite_dining_halls
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own favorite halls"
  on public.favorite_dining_halls
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "update own favorite halls"
  on public.favorite_dining_halls
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own favorite halls"
  on public.favorite_dining_halls
  for delete
  to authenticated
  using (auth.uid() = user_id);
