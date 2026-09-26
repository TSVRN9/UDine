import type { MenuItem } from "@udine/shared";

import { fetchMenuAndRecordSeen, loadMenuCacheFirst } from "./menuFetchWithSeenTracking";
import type { CachedMenu } from "./menuHoursCache";

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

// getCachedMenu/saveCachedMenu are jest.fn()s the tests drive directly; isMenuCacheFinal is the
// real (pure) implementation, so a test's cached-copy fixture is judged by the actual rule, not a
// stand-in for it.
const mockGetCachedMenu = jest.fn<Promise<CachedMenu | null>, [number, Date]>();
const mockSaveCachedMenu = jest.fn<Promise<void>, [number, Date, MenuItem[]]>();
jest.mock("./menuHoursCache", () => ({
  ...jest.requireActual("./menuHoursCache"),
  getCachedMenu: (...args: [number, Date]) => mockGetCachedMenu(...args),
  saveCachedMenu: (...args: [number, Date, MenuItem[]]) => mockSaveCachedMenu(...args),
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
  mockGetCachedMenu.mockReset().mockResolvedValue(null);
  mockSaveCachedMenu.mockReset().mockResolvedValue(undefined);
});

// Never resolves/rejects on its own -- lets a test hold fetchMenu open to observe
// loadMenuCacheFirst's behavior before the network settles, same "manually resolved promise"
// technique the advisor flagged for the screen-level no-cache/late-success tests.
function pendingFetch(): { promise: Promise<MenuItem[]>; resolve: (items: MenuItem[]) => void; reject: (e: unknown) => void } {
  let resolve!: (items: MenuItem[]) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<MenuItem[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("loadMenuCacheFirst", () => {
  const date = new Date(2026, 7, 19);

  it("delivers a non-empty cached copy before the fetch resolves, and records it seen", async () => {
    const cachedItems = [item("Cached Chicken", 3)];
    mockGetCachedMenu.mockResolvedValue({ items: cachedItems, fetchedAt: new Date(2026, 7, 19, 6).toISOString() }); // not final: before the fetch, still same day but not "final" test below covers that
    const pending = pendingFetch();
    mockFetchMenu.mockReturnValue(pending.promise);
    const onItems = jest.fn();

    const donePromise = loadMenuCacheFirst(3, date, onItems);
    await Promise.resolve();
    await Promise.resolve();

    expect(onItems).toHaveBeenCalledWith(cachedItems);
    expect(mockRecordSeen).toHaveBeenCalledWith(3, ["Cached Chicken"]);

    pending.resolve([item("Fresh Chicken", 3)]);
    await donePromise;
  });

  it("skips the network entirely when the cached copy is final", async () => {
    mockGetCachedMenu.mockResolvedValue({ items: [item("Final Chicken", 3)], fetchedAt: new Date(2026, 7, 19, 6).toISOString() });
    const onItems = jest.fn();

    await loadMenuCacheFirst(3, date, onItems);

    expect(mockFetchMenu).not.toHaveBeenCalled();
    expect(onItems).toHaveBeenCalledTimes(1);
  });

  it("delivers a late fresh result even after a non-final cached copy was already shown", async () => {
    mockGetCachedMenu.mockResolvedValue({ items: [item("Cached Chicken", 3)], fetchedAt: new Date(2026, 7, 18, 6).toISOString() }); // yesterday's fetch, not final for today
    const freshItems = [item("Fresh Chicken", 3)];
    mockFetchMenu.mockResolvedValue(freshItems);
    const onItems = jest.fn();

    await loadMenuCacheFirst(3, date, onItems);

    expect(onItems).toHaveBeenNthCalledWith(1, [item("Cached Chicken", 3)]);
    expect(onItems).toHaveBeenNthCalledWith(2, freshItems);
  });

  it("rejects when there is no cache and the fetch failed", async () => {
    mockGetCachedMenu.mockResolvedValue(null);
    mockFetchMenu.mockRejectedValue(new Error("network down"));

    await expect(loadMenuCacheFirst(3, date, jest.fn())).rejects.toThrow("network down");
  });

  it("does not reject when a cached copy was delivered and the background fetch later fails", async () => {
    mockGetCachedMenu.mockResolvedValue({ items: [item("Cached Chicken", 3)], fetchedAt: new Date(2026, 7, 18, 6).toISOString() });
    mockFetchMenu.mockRejectedValue(new Error("network down"));
    const onItems = jest.fn();

    await expect(loadMenuCacheFirst(3, date, onItems)).resolves.toBeUndefined();
    expect(onItems).toHaveBeenCalledTimes(1);
  });

  it("treats a cached empty array as no cache -- doesn't deliver it, and still rejects on a failed fetch", async () => {
    mockGetCachedMenu.mockResolvedValue({ items: [], fetchedAt: new Date(2026, 7, 19, 6).toISOString() });
    mockFetchMenu.mockRejectedValue(new Error("network down"));
    const onItems = jest.fn();

    await expect(loadMenuCacheFirst(3, date, onItems)).rejects.toThrow("network down");
    expect(onItems).not.toHaveBeenCalled();
  });

  it("doesn't deliver a late empty fetch result over an already-delivered non-empty cached copy", async () => {
    mockGetCachedMenu.mockResolvedValue({ items: [item("Cached Chicken", 3)], fetchedAt: new Date(2026, 7, 18, 6).toISOString() });
    mockFetchMenu.mockResolvedValue([]);
    const onItems = jest.fn();

    await loadMenuCacheFirst(3, date, onItems);

    expect(onItems).toHaveBeenCalledTimes(1);
    expect(onItems).toHaveBeenCalledWith([item("Cached Chicken", 3)]);
  });

  it("delivers a genuinely empty fetch result when nothing was cached", async () => {
    mockGetCachedMenu.mockResolvedValue(null);
    mockFetchMenu.mockResolvedValue([]);
    const onItems = jest.fn();

    await loadMenuCacheFirst(3, date, onItems);

    expect(onItems).toHaveBeenCalledWith([]);
  });
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
