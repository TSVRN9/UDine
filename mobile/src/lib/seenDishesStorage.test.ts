// Fake expo-sqlite backing a single `preferences_kv` row set, keyed by SQL text's positional `?`
// params — good enough to exercise SqliteSeenDishesStorage's actual read-modify-write/JSON
// round-trip without a real native SQLite binding, which can't run under jest (verified: importing
// the real expo-sqlite module here throws "NativeDatabase is not a constructor" — no JS-only test
// double ships with the package). Mocked at the expo-sqlite boundary (not "./db") so getDb()'s own
// code — table creation, the promise-caching singleton — stays in play.
import { SqliteSeenDishesStorage } from "./seenDishesStorage";

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

beforeEach(() => mockRows.clear());

test("recordSeen/getAllSeenDishNames round-trips and de-dupes within a hall", async () => {
  const storage = new SqliteSeenDishesStorage();
  await storage.recordSeen(1, ["Chicken", "Beans"]);
  await storage.recordSeen(1, ["Beans", "Rice"]); // "Beans" repeated, "Chicken" not seen again this fetch
  const seen = (await storage.getAllSeenDishNames()).get(1)!;
  expect(seen.sort()).toEqual(["Beans", "Chicken", "Rice"]);
});

test("keeps distinct dishes previously seen even if absent from a later fetch", async () => {
  const storage = new SqliteSeenDishesStorage();
  await storage.recordSeen(1, ["Chicken"]);
  await storage.recordSeen(1, ["Beans"]); // Chicken not in this fetch's list
  const seen = (await storage.getAllSeenDishNames()).get(1)!;
  expect(seen.sort()).toEqual(["Beans", "Chicken"]);
});

test("tracks halls independently", async () => {
  const storage = new SqliteSeenDishesStorage();
  await storage.recordSeen(1, ["Chicken"]);
  await storage.recordSeen(2, ["Pizza"]);
  const all = await storage.getAllSeenDishNames();
  expect(all.get(1)).toEqual(["Chicken"]);
  expect(all.get(2)).toEqual(["Pizza"]);
});

test("getAllSeenDishNames is empty before anything is recorded", async () => {
  const storage = new SqliteSeenDishesStorage();
  expect((await storage.getAllSeenDishNames()).size).toBe(0);
});

// #149: recordSeen was a non-atomic read->union->write against one shared row. Two overlapping
// calls read the same snapshot and the second write clobbered the first's names — reproduced here
// with Promise.all, matching the ticket's confirmed probe.
test("Promise.all of concurrent different-hall recordSeen calls doesn't lose either hall", async () => {
  const storage = new SqliteSeenDishesStorage();
  await Promise.all([storage.recordSeen(1, ["Chicken"]), storage.recordSeen(2, ["Pizza"])]);
  const all = await storage.getAllSeenDishNames();
  expect(all.get(1)).toEqual(["Chicken"]);
  expect(all.get(2)).toEqual(["Pizza"]);
});

test("Promise.all of concurrent same-hall recordSeen calls doesn't lose either dish", async () => {
  const storage = new SqliteSeenDishesStorage();
  await Promise.all([storage.recordSeen(1, ["Chicken"]), storage.recordSeen(1, ["Pizza"])]);
  const seen = (await storage.getAllSeenDishNames()).get(1)!;
  expect(seen.sort()).toEqual(["Chicken", "Pizza"]);
});

// The real call sites (menuFetchWithSeenTracking.ts, YouPane.tsx) each hold their own
// SqliteSeenDishesStorage instance, all writing the same underlying row — the lock has to be
// module-level, not an instance field, or two instances racing wouldn't be serialized at all.
test("serializes across separate storage instances sharing the same row", async () => {
  await Promise.all([
    new SqliteSeenDishesStorage().recordSeen(1, ["Chicken"]),
    new SqliteSeenDishesStorage().recordSeen(1, ["Pizza"]),
  ]);
  const seen = (await new SqliteSeenDishesStorage().getAllSeenDishNames()).get(1)!;
  expect(seen.sort()).toEqual(["Chicken", "Pizza"]);
});
