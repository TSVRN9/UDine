// Same fake expo-sqlite technique as seenDishesStorage.test.ts / menuHoursCache.test.ts.
const mockRows = new Map<string, string>();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    runAsync: async (_sql: string, key: string, value: string) => {
      mockRows.set(key, value);
    },
    getFirstAsync: async (_sql: string, key: string) => (mockRows.has(key) ? { value_json: mockRows.get(key) } : null),
  }),
}));

import { Alert } from "react-native";
import { enqueuePing, flushQueuedPings, getQueuedPings, isTransientPingError, sendOrQueuePing } from "./pingQueue";
import type { PingInsertRow } from "./sendPing";

beforeEach(() => mockRows.clear());

function ping(overrides: Partial<PingInsertRow> = {}): PingInsertRow {
  return { sender_id: "me", receiver_id: "friend", hall_tid: 1, message: null, ...overrides };
}

test("enqueuePing/getQueuedPings round-trips in FIFO order", async () => {
  await enqueuePing(ping({ receiver_id: "a" }));
  await enqueuePing(ping({ receiver_id: "b" }));
  const queue = await getQueuedPings();
  expect(queue.map((p) => p.receiver_id)).toEqual(["a", "b"]);
});

test("getQueuedPings is empty before anything is queued", async () => {
  expect(await getQueuedPings()).toEqual([]);
});

test("flushQueuedPings sends every queued ping and clears the queue on full success", async () => {
  await enqueuePing(ping({ receiver_id: "a" }));
  await enqueuePing(ping({ receiver_id: "b" }));
  const insert = jest.fn().mockResolvedValue({ error: null });
  await flushQueuedPings({ from: () => ({ insert }) as never });
  expect(insert).toHaveBeenCalledTimes(2);
  expect(await getQueuedPings()).toEqual([]);
});

test("flushQueuedPings leaves a ping queued if it fails again, but still sends/drops the rest", async () => {
  await enqueuePing(ping({ receiver_id: "a" }));
  await enqueuePing(ping({ receiver_id: "b" }));
  const insert = jest
    .fn()
    .mockResolvedValueOnce({ error: { message: "still offline" } }) // "a" fails again
    .mockResolvedValueOnce({ error: null }); // "b" succeeds
  await flushQueuedPings({ from: () => ({ insert }) as never });
  const remaining = await getQueuedPings();
  expect(remaining.map((p) => p.receiver_id)).toEqual(["a"]);
});

test("flushQueuedPings is a no-op when nothing is queued", async () => {
  const insert = jest.fn();
  await flushQueuedPings({ from: () => ({ insert }) as never });
  expect(insert).not.toHaveBeenCalled();
});

// --- #181 review finding 1/7: transient (network) vs permanent (RLS) classification ---

test("isTransientPingError treats an empty/absent code as transient (network-shaped) and a real code as permanent", () => {
  expect(isTransientPingError({ code: "" })).toBe(true);
  expect(isTransientPingError({ code: "42501" })).toBe(false);
  expect(isTransientPingError({ code: "PGRST301" })).toBe(false);
  expect(isTransientPingError(null)).toBe(false); // no error at all -- not "transient", there's nothing to retry
});

test("flushQueuedPings drops a permanently-rejected (RLS) ping instead of requeueing it, and alerts once", async () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await enqueuePing(ping({ receiver_id: "a" }));
  await enqueuePing(ping({ receiver_id: "b" }));
  const insert = jest
    .fn()
    .mockResolvedValueOnce({ error: { message: "not friends", code: "42501" } }) // "a" -- permanent, dropped
    .mockResolvedValueOnce({ error: { message: "still offline", code: "" } }); // "b" -- transient, stays queued
  await flushQueuedPings({ from: () => ({ insert }) as never });
  const remaining = await getQueuedPings();
  expect(remaining.map((p) => p.receiver_id)).toEqual(["b"]); // "a" dropped, not retried forever
  expect(alertSpy).toHaveBeenCalledTimes(1);
  alertSpy.mockRestore();
});

test("flushQueuedPings does not alert when every failure this flush was transient", async () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await enqueuePing(ping());
  const insert = jest.fn().mockResolvedValue({ error: { message: "still offline", code: "" } });
  await flushQueuedPings({ from: () => ({ insert }) as never });
  expect(alertSpy).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});

// --- sendOrQueuePing: the actual #181 review finding 1 (blocking) fix ---

test("sendOrQueuePing returns 'sent' and does not queue anything when the insert succeeds", async () => {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const outcome = await sendOrQueuePing({ from: () => ({ insert }) as never }, ping());
  expect(outcome).toBe("sent");
  expect(await getQueuedPings()).toEqual([]);
});

test("sendOrQueuePing returns 'queued' and enqueues the ping when the insert fails for a transient (network) reason -- the actual bug fix: this used to be silently discarded", async () => {
  const insert = jest.fn().mockResolvedValue({ error: { message: "Failed to fetch", code: "" } });
  const row = ping({ receiver_id: "friend-1" });
  const outcome = await sendOrQueuePing({ from: () => ({ insert }) as never }, row);
  expect(outcome).toBe("queued");
  expect(await getQueuedPings()).toEqual([row]);
});

test("sendOrQueuePing returns 'rejected' and does NOT queue when the insert fails for a permanent (RLS) reason", async () => {
  const insert = jest.fn().mockResolvedValue({ error: { message: "not friends", code: "42501" } });
  const outcome = await sendOrQueuePing({ from: () => ({ insert }) as never }, ping());
  expect(outcome).toBe("rejected");
  expect(await getQueuedPings()).toEqual([]);
});

// --- #181 review finding 8: concurrent enqueue/flush read-modify-write races ---

test("a Promise.all of concurrent enqueuePing calls doesn't lose either ping (same class of race #149 fixed for seenDishesStorage)", async () => {
  await Promise.all([enqueuePing(ping({ receiver_id: "a" })), enqueuePing(ping({ receiver_id: "b" }))]);
  const queue = await getQueuedPings();
  expect(queue.map((p) => p.receiver_id).sort()).toEqual(["a", "b"]);
});

test("an enqueuePing racing a concurrent flushQueuedPings doesn't lose the newly-queued ping", async () => {
  await enqueuePing(ping({ receiver_id: "already-queued" }));
  const insert = jest.fn().mockResolvedValue({ error: null }); // flush succeeds -- would clear the queue
  await Promise.all([flushQueuedPings({ from: () => ({ insert }) as never }), enqueuePing(ping({ receiver_id: "raced-in" }))]);
  // Whichever actually ran second (serialized, not interleaved) sees the other's effect --
  // "raced-in" must survive somewhere, never silently dropped by an overlapping read-modify-write.
  const queue = await getQueuedPings();
  expect(queue.map((p) => p.receiver_id)).toContain("raced-in");
});
