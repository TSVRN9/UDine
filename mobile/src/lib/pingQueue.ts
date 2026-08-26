import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "react-native";
import { getDb } from "./db";

// #294: moved here from the now-deleted sendPing.ts (its only export, `sendPingGuarded`, had no
// production callers left once friend/[id].tsx/friends.tsx/SocialPane.tsx all routed through this
// file's own sendOrQueuePing instead -- see #181/#231/#294) -- this file is now the one real
// consumer of the shared `pings` insert row shape.
export type PingInsertRow = { sender_id: string; receiver_id: string; hall_tid: number | null; message: string | null };

/**
 * #181's "Pings queue and send on reconnect" -- SocialPane sends a ping straight to Supabase when
 * online, but a hold-and-release while offline has nowhere to go. Queues it locally instead
 * (reuses preferences_kv, same call menuHoursCache.ts/seenDishesStorage.ts already made -- no new
 * table) and flushes on the next successful reconnect (RETRY tap, or the pane's own next
 * successful refresh). ponytail: no retry backoff/dedup beyond FIFO-drain-on-flush -- fine at this
 * volume (a handful of pings a session, not a queue under real load); revisit if double-sends from
 * an interrupted flush ever show up in practice. The serialization fix below (module-level
 * `writeQueue`, added to stop enqueue/flush from clobbering each other's read-modify-write) has its
 * own ceiling: `flushQueuedPings` holds that lock across all N of its network round-trips, not just
 * its own local read/write, so an interactive `enqueuePing` landing mid-flush blocks until every
 * queued ping in that flush resolves or times out -- and an app kill in that window loses the
 * ping the user just tried to send (it never reached `writeQueueRows`, so nothing durable exists
 * for it). Upgrade to per-ping locking (or write the new row before attempting the flush) if that
 * shows up in practice.
 */
const KEY = "queued_pings";

// #240 finding A: a queue that only ever flushed on an in-session offline->online transition could
// sit across an app restart until some future dip happened to occur, at which point it sent a
// "come eat with me" ping that was actually hours/days stale. A queued ping older than this is
// dropped instead of sent -- a stale meal invitation is worse than no invitation.
// ponytail: fixed 6h ceiling (roughly a full day's worth of meal periods), not user-configurable --
// revisit if that turns out too short/long in practice.
const MAX_QUEUE_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Row shape actually persisted to SQLite -- `queuedAt` is bookkeeping for the age check above. It's
 * stripped back down to a plain `PingInsertRow` before ever being sent to Supabase (see
 * `flushQueuedPings`) and never exposed via `getQueuedPings` (callers/tests still see plain
 * `PingInsertRow`s, same contract as before #240). A row read back with no `queuedAt` at all (queued
 * by a build that predates this fix) is treated as maximally stale -- exactly the "possibly
 * days-old" case #240 is worried about -- so it's dropped on the very next flush rather than sent
 * with an unknown, possibly very old, age.
 */
type QueuedPing = PingInsertRow & { queuedAt: number };

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

async function readQueue(): Promise<QueuedPing[]> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>("SELECT value_json FROM preferences_kv WHERE key = ?", KEY);
  const parsed: (PingInsertRow & { queuedAt?: number })[] = row ? JSON.parse(row.value_json) : [];
  return parsed.map((p) => ({ ...p, queuedAt: typeof p.queuedAt === "number" ? p.queuedAt : 0 }));
}

async function writeQueueRows(rows: QueuedPing[]): Promise<void> {
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
    queue.push({ ...row, queuedAt: Date.now() });
    await writeQueueRows(queue);
  });
}

export function getQueuedPings(): Promise<PingInsertRow[]> {
  return serialized(async () => (await readQueue()).map(({ queuedAt: _queuedAt, ...row }) => row));
}

/**
 * Sends every queued ping, in order. A ping that fails again with a TRANSIENT error (still
 * offline) stays queued for the next flush attempt. A ping that fails with a PERMANENT error (RLS
 * rejection) is dropped -- retrying it forever would silently waste requests and never tell the
 * user it was actually rejected -- and surfaced once via a single Alert covering however many
 * permanent drops happened in this flush (not one Alert per row, which would spam the user if
 * several queued pings all reject at once). A ping older than MAX_QUEUE_AGE_MS (#240 finding A) is
 * dropped without even attempting to send it -- silently, no Alert, same as any other queue
 * housekeeping that isn't a user-facing rejection.
 *
 * #294: SocialPane.tsx's loadEvents now calls this unconditionally on every successful load
 * (#240 finding A), including before any session check -- so a queue left over from a previously
 * signed-in session would otherwise attempt to flush while signed out, hit `pings`' RLS with no
 * `auth.uid()` at all, get a permanent rejection, and surface a one-time "You may not be friends
 * with the recipient (yet)." alert to a signed-out user. No-op without a session instead --
 * left queued for whenever someone next signs in and this runs again.
 */
export async function flushQueuedPings(client: Pick<SupabaseClient, "from"> & { auth: Pick<SupabaseClient["auth"], "getSession"> }): Promise<void> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return;

  return serialized(async () => {
    const queue = await readQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    const remaining: QueuedPing[] = [];
    let permanentlyDropped = 0;
    for (const queued of queue) {
      if (now - queued.queuedAt > MAX_QUEUE_AGE_MS) continue;
      const { queuedAt: _queuedAt, ...row } = queued;
      const { error } = await client.from("pings").insert(row);
      if (error) {
        if (isTransientPingError(error)) remaining.push(queued);
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
