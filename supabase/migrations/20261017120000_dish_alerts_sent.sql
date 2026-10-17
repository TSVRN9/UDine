-- Per-(dish, day) claim for send-dish-alerts (docs/briefs/flutter-port-alert-push.md Task 3).
-- The function claims with `insert ... on conflict do nothing returning`, sends only if a row came back,
-- deletes the claim if FCM fails, and at the end of a run deletes rows older than three days.
-- Public facts only: a dish key and a logical day, no user, no token.
create table public.dish_alerts_sent (
  dish_key text not null,
  day date not null,
  primary key (dish_key, day)
);

-- No policies: only service_role (which bypasses RLS) touches it. No TRUNCATE for anyone.
alter table public.dish_alerts_sent enable row level security;
revoke all on public.dish_alerts_sent from anon, authenticated, service_role; -- service_role gets default-privilege TRUNCATE etc.
grant select, insert, delete on public.dish_alerts_sent to service_role;
