import { claimSighting } from "./sightingDedup";

// Same fake expo-sqlite technique as db.test.ts/menuHoursCache.test.ts -- mocked at the expo-sqlite
// boundary (not "./db") so getDb()'s own table-creation/singleton code stays in play. runAsync here
// simulates a real `INSERT OR IGNORE ... PRIMARY KEY` table: a key already in `mockRows` is a no-op
// (changes: 0), a new key is inserted (changes: 1) -- same shape SQLite itself reports. Named
// `mockRows` (not `rows`) because jest.mock() factories may only close over out-of-scope names that
// start with "mock" -- see jest's own "module factory is not allowed to reference out-of-scope
// variables" guard.
const mockRows = new Set<string>();

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    runAsync: async (_sql: string, dishName: string, hallTid: number, sightedDate: string) => {
      const key = `${dishName}|${hallTid}|${sightedDate}`;
      if (mockRows.has(key)) return { changes: 0 };
      mockRows.add(key);
      return { changes: 1 };
    },
  }),
}));

beforeEach(() => {
  mockRows.clear();
});

it("claims a not-yet-seen (dish, hall, date) and reports it as new", async () => {
  await expect(claimSighting("Chicken Parm", 3, "2026-09-15")).resolves.toBe(true);
});

it("does not re-claim the same (dish, hall, date) a second time -- mirrors food_sightings' unique constraint", async () => {
  await claimSighting("Chicken Parm", 3, "2026-09-15");
  await expect(claimSighting("Chicken Parm", 3, "2026-09-15")).resolves.toBe(false);
});

it("treats a different hall, dish, or date as a distinct sighting", async () => {
  await claimSighting("Chicken Parm", 3, "2026-09-15");
  await expect(claimSighting("Chicken Parm", 4, "2026-09-15")).resolves.toBe(true); // different hall
  await expect(claimSighting("Pizza", 3, "2026-09-15")).resolves.toBe(true); // different dish
  await expect(claimSighting("Chicken Parm", 3, "2026-09-16")).resolves.toBe(true); // different date
});
