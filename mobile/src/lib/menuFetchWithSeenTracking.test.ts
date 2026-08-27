import type { MenuItem } from "@udine/shared";

import { fetchMenuAndRecordSeen } from "./menuFetchWithSeenTracking";

const mockFetchMenu = jest.fn<Promise<MenuItem[]>, [number, Date]>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: (hallTid: number, date: Date) => mockFetchMenu(hallTid, date),
}));

const mockRecordSeen = jest.fn<Promise<void>, [number, string[]]>();
// menuFetchWithSeenTracking.ts instantiates SqliteSeenDishesStorage eagerly at module scope (same
// singleton-at-import pattern as rankingStorage.ts/sqliteStorage.ts) — that instantiation happens
// during Babel's hoisted `import` evaluation, which runs *before* this file's own `const
// mockRecordSeen = jest.fn()` line executes. So the mock's `recordSeen` can't capture mockRecordSeen
// directly at construction time (it'd capture undefined); it has to defer the reference to call time.
jest.mock("./seenDishesStorage", () => ({
  SqliteSeenDishesStorage: jest.fn().mockImplementation(() => ({
    recordSeen: (...args: [number, string[]]) => mockRecordSeen(...args),
  })),
}));

function item(dishName: string, hallTid: number): MenuItem {
  return {
    dishName,
    category: "Entrees",
    mealPeriod: "lunch",
    hallTid,
    date: "2026-08-19",
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
      caloriesFromFat: 10,
      totalFatG: 5,
      satFatG: 1,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 10,
      dietaryFiberG: 1,
      sugarsG: 1,
      proteinG: 20,
    },
    allergens: [],
    dietTags: [],
  };
}

beforeEach(() => {
  mockFetchMenu.mockReset();
  // Must resolve, not return undefined -- the wrapper does `.catch(() => {})` on recordSeen's
  // return value (PR #123 review: a bare jest.fn() returning undefined throws on that .catch).
  mockRecordSeen.mockReset().mockResolvedValue(undefined);
});

test("records distinct dish names seen at the fetched hall and returns the menu unchanged", async () => {
  const items = [item("Chicken", 3), item("Beans", 3), item("Chicken", 3)]; // "Chicken" appears twice (two categories)
  mockFetchMenu.mockResolvedValue(items);

  const result = await fetchMenuAndRecordSeen(3, new Date("2026-08-19"));

  expect(result).toBe(items);
  expect(mockRecordSeen).toHaveBeenCalledTimes(1);
  const [hallTid, dishNames] = mockRecordSeen.mock.calls[0];
  expect(hallTid).toBe(3);
  expect(dishNames.sort()).toEqual(["Beans", "Chicken"]);
});

test("doesn't call recordSeen when the hall has no items", async () => {
  mockFetchMenu.mockResolvedValue([]);
  await fetchMenuAndRecordSeen(3, new Date("2026-08-19"));
  expect(mockRecordSeen).not.toHaveBeenCalled();
});

// PR #123 review: a rejecting recordSeen (SQLITE_BUSY, full disk, corrupt row) must never take
// down the menu fetch it's just bookkeeping alongside -- recordSeen is fire-and-forget precisely
// so this holds.
test("returns the menu unchanged when recordSeen rejects", async () => {
  const items = [item("Chicken", 3)];
  mockFetchMenu.mockResolvedValue(items);
  mockRecordSeen.mockRejectedValue(new Error("database is locked"));

  const result = await fetchMenuAndRecordSeen(3, new Date("2026-08-19"));

  expect(result).toBe(items);
});
