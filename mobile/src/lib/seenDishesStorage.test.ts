// Fake expo-sqlite backing a single `preferences_kv` row set, keyed by SQL text's positional `?`
// params — good enough to exercise SqliteSeenDishesStorage's actual read-modify-write/JSON
// round-trip without a real native SQLite binding, which can't run under jest (verified: importing
// the real expo-sqlite module here throws "NativeDatabase is not a constructor" — no JS-only test
// double ships with the package). Mocked at the expo-sqlite boundary (not "./db") so getDb()'s own
// code — table creation, the promise-caching singleton — stays in play.
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

import { SqliteSeenDishesStorage } from "./seenDishesStorage";

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
