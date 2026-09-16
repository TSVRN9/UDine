import { DINING_HALLS, GRAB_N_GO_TIDS, type MenuItem } from "@udine/shared";

import { prefetchTodaysMenus } from "./menuPrefetch";

const mockFetchMenu = jest.fn<Promise<MenuItem[]>, [number, Date]>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: (tid: number, date: Date) => mockFetchMenu(tid, date),
}));

const mockSaveCachedMenu = jest.fn<Promise<void>, [number, Date, MenuItem[]]>();
jest.mock("./menuHoursCache", () => ({
  saveCachedMenu: (...args: [number, Date, MenuItem[]]) => mockSaveCachedMenu(...args),
}));

const allTids = [...DINING_HALLS.map((hall) => hall.tid), ...Object.values(GRAB_N_GO_TIDS)];

function itemsFor(tid: number): MenuItem[] {
  return [
    {
      dishName: `Dish ${tid}`,
      category: "Entrees",
      mealPeriod: "lunch",
      hallTid: tid,
      date: "2026-09-08",
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
    },
  ];
}

// flush the microtask queue so fire-and-forget .then/.catch chains settle before assertions
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  mockFetchMenu.mockReset();
  mockSaveCachedMenu.mockReset().mockResolvedValue(undefined);
});

test("caches all 4 dining hall tids and 4 Grab 'N Go tids for the given date", async () => {
  expect(allTids).toHaveLength(8);
  mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));
  const date = new Date("2026-09-08");

  prefetchTodaysMenus(date);
  await flush();

  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(8);
  for (const tid of allTids) {
    expect(mockSaveCachedMenu).toHaveBeenCalledWith(tid, date, itemsFor(tid));
  }
});

test("with no date argument, defaults to the rollover-aware effective day, not a bare new Date() (12:30 AM still warms the prior day's cache)", async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 9, 0, 30, 0, 0)); // Sep 9, 12:30 AM local
  mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));

  prefetchTodaysMenus();
  await flush();

  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(8);
  for (const [, date] of mockSaveCachedMenu.mock.calls) {
    expect(date.toDateString()).toBe(new Date(2026, 8, 8).toDateString());
  }
  jest.useRealTimers();
});

test("one tid's fetchMenu rejection doesn't stop the others or throw/reject", async () => {
  const failingTid = allTids[0];
  mockFetchMenu.mockImplementation((tid) => {
    if (tid === failingTid) return Promise.reject(new Error("network down"));
    return Promise.resolve(itemsFor(tid));
  });
  const date = new Date("2026-09-08");

  expect(() => prefetchTodaysMenus(date)).not.toThrow();
  await flush();

  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(7);
  expect(mockSaveCachedMenu).not.toHaveBeenCalledWith(failingTid, date, expect.anything());
});
