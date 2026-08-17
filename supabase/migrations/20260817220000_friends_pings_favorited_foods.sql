-- Step 5: friends, pings, and favorited-food-spotted-elsewhere alerts (CLAUDE.md build order).
-- Everything in this file is server-side by definition (friends/pings/profile require an account;
-- favorited_foods is the one explicit exception in the data-residency table — dish favorites synced
-- to the server, but ONLY for a signed-in user who has also opted into notifications).

-- profiles: one row per signed-in user. Readable by any authenticated user (needed for friend
-- search/display), writable only by its owner. No @umass.edu re-check needed anywhere in this file —
-- the before-user-created hook already guarantees every auth.users row is @umass.edu.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any signed-in user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-create a profile on signup. security definer is required here (not a security-boundary
-- shortcut) — the trigger fires during auth.users insertion, before the new user has any session for
-- RLS to evaluate against.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- friendships: one row per pair, canonically ordered (user_a < user_b) so there's exactly one row
-- per relationship, never a duplicate/asymmetric pair. Always insert through request_friendship()
-- below rather than a raw insert, so ordering is never left to the client to get right.
create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  requested_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_requested_by_participant check (requested_by = user_a or requested_by = user_b)
);

alter table public.friendships enable row level security;

-- Both parties to a friendship must be able to read it — a naive auth.uid() = user_id-style policy
-- doesn't generalize to a two-party row.
create policy "participants can read their friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "participants can insert their own friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requested_by and (auth.uid() = user_a or auth.uid() = user_b));

create policy "participants can update their friendships"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "participants can delete their friendships"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create or replace function public.request_friendship(target_user_id uuid)
returns public.friendships
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  result public.friendships;
begin
  if me is null then
    raise exception 'must be signed in';
  end if;
  if me = target_user_id then
    raise exception 'cannot friend yourself';
  end if;

  a := least(me, target_user_id);
  b := greatest(me, target_user_id);

  insert into public.friendships (user_a, user_b, status, requested_by)
  values (a, b, 'pending', me)
  on conflict (user_a, user_b) do nothing
  returning * into result;

  if result is null then
    select * into result from public.friendships where user_a = a and user_b = b;
  end if;

  return result;
end;
$$;

-- pings: "come eat with me" — only allowed between accepted friends, enforced in the insert policy
-- rather than trusted to the client.
create table public.pings (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  hall_tid int,
  message text,
  created_at timestamptz not null default now()
);

alter table public.pings enable row level security;

create policy "participants can read their pings"
  on public.pings for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "friends can send pings"
  on public.pings for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and least(sender_id, receiver_id) = f.user_a
        and greatest(sender_id, receiver_id) = f.user_b
    )
  );

create policy "senders can retract their pings"
  on public.pings for delete
  to authenticated
  using (auth.uid() = sender_id);

-- favorited_foods: the one dish-level favorite that may leave the device, and only because the
-- favorited-food-elsewhere alert feature requires server-side matching against the live menu feed.
-- Synced from the client's local dish favorites (see FavoritesStorage) only when signed in AND
-- notifications_enabled — enforced app-side (nothing here prevents syncing sooner, that's a client
-- responsibility, same as favorite_dining_halls).
create table public.favorited_foods (
  user_id uuid not null references auth.users (id) on delete cascade,
  dish_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, dish_name)
);

alter table public.favorited_foods enable row level security;

create policy "users manage their own favorited foods"
  on public.favorited_foods for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- push_tokens: device push tokens for actual notification delivery (Expo push token or Web Push
-- subscription). Table exists now so the client can register a token as soon as the user opts in;
-- nothing currently reads from it — dispatch is gated on VAPID/FCM config the user hasn't supplied
-- yet (see check-favorited-foods Edge Function).
create table public.push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('expo', 'web')),
  token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, platform, token)
);

alter table public.push_tokens enable row level security;

create policy "users manage their own push tokens"
  on public.push_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- food_sightings: the in-app notification feed. Populated only by the check-favorited-foods Edge
-- Function running as the service role (which bypasses RLS entirely) — there is deliberately no
-- insert policy for `authenticated`, so a user cannot spoof their own sightings.
create table public.food_sightings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dish_name text not null,
  hall_tid int not null,
  sighted_date date not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dish_name, hall_tid, sighted_date)
);

alter table public.food_sightings enable row level security;

create policy "users read their own food sightings"
  on public.food_sightings for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can mark their own food sightings read"
  on public.food_sightings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
