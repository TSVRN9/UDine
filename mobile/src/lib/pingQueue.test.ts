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

import { enqueuePing, flushQueuedPings, getQueuedPings } from "./pingQueue";
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
