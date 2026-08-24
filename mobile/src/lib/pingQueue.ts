import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "./db";
import type { PingInsertRow } from "./sendPing";

/**
 * #181's "Pings queue and send on reconnect" -- SocialPane sends a ping straight to Supabase when
 * online, but a hold-and-release while offline has nowhere to go. Queues it locally instead
 * (reuses preferences_kv, same call menuHoursCache.ts/seenDishesStorage.ts already made -- no new
 * table) and flushes on the next successful reconnect (RETRY tap, or the pane's own next
 * successful refresh). ponytail: no retry backoff/dedup beyond FIFO-drain-on-flush -- fine at this
 * volume (a handful of pings a session, not a queue under real load); revisit if double-sends from
 * an interrupted flush ever show up in practice.
 */
const KEY = "queued_pings";

export async function enqueuePing(row: PingInsertRow): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  const queue: PingInsertRow[] = existing ? JSON.parse(existing.value_json) : [];
  queue.push(row);
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(queue));
}

export async function getQueuedPings(): Promise<PingInsertRow[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  return row ? JSON.parse(row.value_json) : [];
}

/**
 * Sends every queued ping, in order, dropping each one from the queue as soon as it succeeds --
 * a ping that fails again (still offline, or a real RLS rejection) stays queued for the next
 * flush attempt rather than being lost. No Alert on a per-row failure here (unlike
 * sendPingGuarded, which is for an interactive send) -- a background flush failing silently and
 * retrying later is the correct offline behavior, not a user-facing error every reconnect attempt.
 */
export async function flushQueuedPings(client: Pick<SupabaseClient, "from">): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  const queue: PingInsertRow[] = row ? JSON.parse(row.value_json) : [];
  if (queue.length === 0) return;

  const remaining: PingInsertRow[] = [];
  for (const ping of queue) {
    const { error } = await client.from("pings").insert(ping);
    if (error) remaining.push(ping);
  }
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(remaining));
}
