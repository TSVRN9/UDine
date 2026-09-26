import { DINING_HALLS, GRAB_N_GO_TIDS, type MenuItem } from "@udine/shared";

import { prefetchTodaysMenus, warmMenuCache } from "./menuPrefetch";
import type { CachedMenu } from "./menuHoursCache";

const mockFetchMenu = jest.fn<Promise<MenuItem[]>, [number, Date]>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: (tid: number, date: Date) => mockFetchMenu(tid, date),
}));

const mockSaveCachedMenu = jest.fn<Promise<void>, [number, Date, MenuItem[]]>();
const mockGetCachedMenu = jest.fn<Promise<CachedMenu | null>, [number, Date]>();
const mockFetchHoursAndCache = jest.fn<Promise<unknown>, []>();
// isMenuCacheFinal is the real (pure) implementation via requireActual -- a test's cached fixture
// is judged by the actual rule, not a stand-in for it.
jest.mock("./menuHoursCache", () => ({
  ...jest.requireActual("./menuHoursCache"),
  saveCachedMenu: (...args: [number, Date, MenuItem[]]) => mockSaveCachedMenu(...args),
  getCachedMenu: (...args: [number, Date]) => mockGetCachedMenu(...args),
  fetchHoursAndCache: () => mockFetchHoursAndCache(),
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
  mockGetCachedMenu.mockReset().mockResolvedValue(null);
  mockFetchHoursAndCache.mockReset().mockResolvedValue(undefined);
});

test("caches all 4 dining hall tids and 4 Grab 'N Go tids, for today + the next 2 days", async () => {
  expect(allTids).toHaveLength(8);
  mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));
  const date = new Date(2026, 8, 8);

  prefetchTodaysMenus(date);
  await flush();

  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(24); // 8 tids x 3 days
  for (const tid of allTids) {
    for (const dayOffset of [0, 1, 2]) {
      const expectedDate = new Date(2026, 8, 8 + dayOffset);
      expect(mockSaveCachedMenu).toHaveBeenCalledWith(tid, expect.objectContaining({ getFullYear: expect.anything() }), itemsFor(tid));
      expect(mockFetchMenu).toHaveBeenCalledWith(tid, expect.anything());
      // Sanity-check at least one exact (tid, date) pair, rather than every one of 24 verbosely.
      if (dayOffset === 2 && tid === allTids[0]) {
        expect(mockFetchMenu.mock.calls.some(([t, d]) => t === tid && d.toDateString() === expectedDate.toDateString())).toBe(true);
      }
    }
  }
});

test("with no date argument, defaults to the rollover-aware effective day, not a bare new Date() (12:30 AM still warms the prior day's cache)", async () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 9, 0, 30, 0, 0)); // Sep 9, 12:30 AM local
  mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));

  prefetchTodaysMenus();
  await flush();

  const firstDayCalls = mockSaveCachedMenu.mock.calls.filter(([, date]) => date.toDateString() === new Date(2026, 8, 8).toDateString());
  expect(firstDayCalls).toHaveLength(8);
  jest.useRealTimers();
});

test("one tid's fetchMenu rejection doesn't stop the others or throw/reject", async () => {
  const failingTid = allTids[0];
  mockFetchMenu.mockImplementation((tid) => {
    if (tid === failingTid) return Promise.reject(new Error("network down"));
    return Promise.resolve(itemsFor(tid));
  });
  const date = new Date(2026, 8, 8);

  expect(() => prefetchTodaysMenus(date)).not.toThrow();
  await flush();

  // The failing tid rejects on all 3 warmed days; the other 7 tids succeed on all 3.
  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(21);
  expect(mockSaveCachedMenu).not.toHaveBeenCalledWith(failingTid, expect.anything(), expect.anything());
});

describe("warmMenuCache's skip rule", () => {
  // A fixed "now" so a cached fetchedAt's age and finality can be controlled independently of the
  // host's real clock (isMenuCacheFinal compares fetchedAt against `date`'s own local start, and a
  // real "now" far in either direction would otherwise make every fixture trivially final or not).
  const now = new Date(2026, 8, 8, 3, 0, 0); // Sep 8, 3 AM local -- early enough that "N hours ago" still lands on Sep 7, before `date`'s own start
  const date = new Date(2026, 8, 8); // today relative to `now` -- already started, so a fresh-enough fetch IS final

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("skips a (tid, date) whose cached copy is final -- no network call for it", async () => {
    mockGetCachedMenu.mockImplementation(async (tid, d) =>
      tid === allTids[0] && d.toDateString() === date.toDateString() ? { items: itemsFor(tid), fetchedAt: new Date(2026, 8, 8, 6).toISOString() } : null,
    );
    mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));

    await warmMenuCache(date);

    expect(mockFetchMenu.mock.calls.filter(([t, d]) => t === allTids[0] && d.toDateString() === date.toDateString())).toHaveLength(0);
    // Sanity: still fetched for other tids on this same day.
    expect(mockFetchMenu.mock.calls.some(([t, d]) => t === allTids[1] && d.toDateString() === date.toDateString())).toBe(true);
  });

  test("skips a non-final copy that's under ~6h old -- no network call for it", async () => {
    // Not final: fetched BEFORE the cached date's own local start (yesterday evening), so
    // isMenuCacheFinal is false regardless of age; the freshness half of the skip rule is what's
    // under test here.
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000); // Sep 7, 10 PM -- before today's own start
    mockGetCachedMenu.mockImplementation(async (tid, d) =>
      tid === allTids[0] && d.toDateString() === date.toDateString() ? { items: itemsFor(tid), fetchedAt: fiveHoursAgo.toISOString() } : null,
    );
    mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));

    await warmMenuCache(date);

    expect(mockFetchMenu.mock.calls.filter(([t, d]) => t === allTids[0] && d.toDateString() === date.toDateString())).toHaveLength(0);
  });

  test("re-fetches a non-final copy older than ~6h", async () => {
    const sevenHoursAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000); // Sep 7, 8 PM -- before today's own start
    mockGetCachedMenu.mockImplementation(async (tid, d) =>
      tid === allTids[0] && d.toDateString() === date.toDateString() ? { items: itemsFor(tid), fetchedAt: sevenHoursAgo.toISOString() } : null,
    );
    mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));

    await warmMenuCache(date);

    expect(mockFetchMenu.mock.calls.filter(([t, d]) => t === allTids[0] && d.toDateString() === date.toDateString())).toHaveLength(1);
  });
});

test("also warms the hours cache", async () => {
  mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));

  await warmMenuCache(new Date(2026, 8, 8));

  expect(mockFetchHoursAndCache).toHaveBeenCalledTimes(1);
});

test("an hours warm failure doesn't reject warmMenuCache", async () => {
  mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));
  mockFetchHoursAndCache.mockRejectedValue(new Error("hours down"));

  await expect(warmMenuCache(new Date(2026, 8, 8))).resolves.toBeUndefined();
});
