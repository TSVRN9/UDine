-- The /friends UI subscribes to postgres_changes INSERT events on pings for a live "you got pinged"
-- update. Tables aren't in the supabase_realtime publication by default — without this, the client
-- subscription silently never fires (confirmed empty via `select * from pg_publication_tables where
-- pubname = 'supabase_realtime'` before this migration).
alter publication supabase_realtime add table public.pings;
