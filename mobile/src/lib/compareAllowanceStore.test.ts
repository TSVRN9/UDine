// sqliteAllowanceStore against a fake expo-sqlite preferences_kv (same technique as seenDishesStorage.test.ts:
// mocked at the expo-sqlite boundary so getDb() itself stays in play). The fake mimics real SQLite enough to
// catch the two ways this adapter can go wrong: plain INSERT fails on an existing key, and a shared key
// overwrites another blob.
import { sqliteAllowanceStore } from "./compareAllowance";

const mockRows = new Map<string, string>();
const mockSql: string[] = [];

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    runAsync: async (sql: string, key: string, value: string) => {
      mockSql.push(sql);
      if (/^INSERT OR REPLACE INTO preferences_kv \(key, value_json\) VALUES \(\?, \?\)$/.test(sql)) mockRows.set(key, value);
      else if (/^INSERT INTO preferences_kv/.test(sql)) {
        if (mockRows.has(key)) throw new Error("UNIQUE constraint failed: preferences_kv.key");
        mockRows.set(key, value);
      } else throw new Error(`unexpected SQL: ${sql}`);
    },
    getFirstAsync: async (sql: string, key: string) => {
      mockSql.push(sql);
      if (!/^SELECT value_json FROM preferences_kv WHERE key = \?$/.test(sql)) throw new Error(`unexpected SQL: ${sql}`);
      return mockRows.has(key) ? { value_json: mockRows.get(key) } : null;
    },
  }),
}));

beforeEach(() => {
  mockRows.clear();
  mockSql.length = 0;
});

test("a missing row reads as null", async () => {
  expect(await sqliteAllowanceStore.read()).toBeNull();
});

test("write then read round-trips under exactly one key, distinct from the ranking blobs", async () => {
  await sqliteAllowanceStore.write('{"date":"2026-09-20","count":2}');
  expect([...mockRows.keys()]).toEqual(["compare_daily_allowance"]);
  expect(await sqliteAllowanceStore.read()).toBe('{"date":"2026-09-20","count":2}');
  expect(["ranked_dishes", "ranked_foods"]).not.toContain("compare_daily_allowance");
});

test("writing never touches the ranking blobs", async () => {
  mockRows.set("ranked_dishes", "[1]");
  mockRows.set("ranked_foods", "[2]");
  await sqliteAllowanceStore.write("{}");
  expect(mockRows.get("ranked_dishes")).toBe("[1]");
  expect(mockRows.get("ranked_foods")).toBe("[2]");
});

test("a second write replaces the first (INSERT OR REPLACE, not INSERT)", async () => {
  await sqliteAllowanceStore.write('{"date":"2026-09-20","count":1}');
  await sqliteAllowanceStore.write('{"date":"2026-09-20","count":2}');
  expect(await sqliteAllowanceStore.read()).toBe('{"date":"2026-09-20","count":2}');
  expect(mockSql.filter((s) => s.startsWith("INSERT"))).toEqual([
    "INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)",
    "INSERT OR REPLACE INTO preferences_kv (key, value_json) VALUES (?, ?)",
  ]);
});
