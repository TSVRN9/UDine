import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";
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

/**
 * A network-shaped failure is transient and worth queueing/retrying; a real PostgREST/Postgres
 * rejection (RLS 42501 -- not actually friends, expired session, ...) is permanent and never will
 * succeed no matter how many times it's retried. postgrest-js deliberately leaves `code` (and
 * `hint`) empty for client-side network errors -- "those fields are meant for upstream service
 * errors" (its own source comment, PostgrestBuilder.ts) -- so a non-empty `code` is exactly the
 * signal a real upstream rejection happened, not a dropped connection. Exported so SocialPane's
 * interactive sendPing and this file's own background flush both classify the same way instead of
 * one Alert-ing on a network blip or the other silently retrying an RLS rejection forever.
 */
export function isTransientPingError(error: Pick<PostgrestError, "code"> | null): boolean {
  return !!error && !error.code;
}

// Same read-modify-write serialization seenDishesStorage.ts already uses for its one shared row --
// enqueue (an interactive ping send) and flush (a background reconnect) both touch this exact key,
// and without a queue two overlapping calls can read the same snapshot and the later write clobbers
// the earlier one's queued/dequeued rows. Module-level (not per-call), so it holds across every
// caller, not just concurrent calls from the same one.
let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(run: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(run, run);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readQueue(): Promise<PingInsertRow[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  return row ? JSON.parse(row.value_json) : [];
}

async function writeQueueRows(rows: PingInsertRow[]): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)", KEY, JSON.stringify(rows));
}

export type SendPingOutcome = "sent" | "queued" | "rejected";

/**
 * Attempts a real ping send and classifies the result -- the actual fix for #181 review finding 1
 * (blocking): the caller used to gate on a one-shot mount-time "online" signal, so the ordinary
 * case (network drops mid-session, user sends a ping) never got classified at all and the ping was
 * just discarded with a misleading "not friends" alert. This is a plain function (no RN, no
 * closed-over component state) precisely so it's red-green testable directly, same reasoning
 * pingGesture.ts's own doc comment gives for keeping that logic out of SocialPane.tsx too --
 * "kept free of React Native so ... can be red-green tested in plain jest without mounting
 * anything." SocialPane.tsx's sendPing is a thin wrapper: call this, then update `offline` state
 * and/or flush the queue based on which outcome came back.
 */
export async function sendOrQueuePing(client: Pick<SupabaseClient, "from">, row: PingInsertRow): Promise<SendPingOutcome> {
  const { error } = await client.from("pings").insert(row);
  if (!error) return "sent";
  if (isTransientPingError(error)) {
    await enqueuePing(row);
    return "queued";
  }
  return "rejected";
}

export function enqueuePing(row: PingInsertRow): Promise<void> {
  return serialized(async () => {
    const queue = await readQueue();
    queue.push(row);
    await writeQueueRows(queue);
  });
}

export function getQueuedPings(): Promise<PingInsertRow[]> {
  return serialized(readQueue);
}

/**
 * Sends every queued ping, in order. A ping that fails again with a TRANSIENT error (still
 * offline) stays queued for the next flush attempt. A ping that fails with a PERMANENT error (RLS
 * rejection) is dropped -- retrying it forever would silently waste requests and never tell the
 * user it was actually rejected -- and surfaced once via a single Alert covering however many
 * permanent drops happened in this flush (not one Alert per row, which would spam the user if
 * several queued pings all reject at once).
 */
export async function flushQueuedPings(client: Pick<SupabaseClient, "from">): Promise<void> {
  return serialized(async () => {
    const queue = await readQueue();
    if (queue.length === 0) return;

    const remaining: PingInsertRow[] = [];
    let permanentlyDropped = 0;
    for (const ping of queue) {
      const { error } = await client.from("pings").insert(ping);
      if (error) {
        if (isTransientPingError(error)) remaining.push(ping);
        else permanentlyDropped++;
      }
    }
    await writeQueueRows(remaining);
    if (permanentlyDropped > 0) {
      Alert.alert(
        permanentlyDropped === 1 ? "A queued ping couldn't be sent" : "Some queued pings couldn't be sent",
        "You may not be friends with the recipient (yet).",
      );
    }
  });
}
