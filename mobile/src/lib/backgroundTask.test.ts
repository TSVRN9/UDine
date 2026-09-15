import { DINING_HALLS, GRAB_N_GO_TIDS, type Favorite, type MenuItem } from "@udine/shared";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";

import { BACKGROUND_TASK_NAME, registerBackgroundTask } from "./backgroundTask";

// expo-task-manager/expo-background-task are called at backgroundTask.ts's OWN module scope
// (TaskManager.defineTask must run in the JS bundle's global scope -- see backgroundTask.ts's own
// note). jest.mock() calls are hoisted above every import regardless of where they're written, so
// the mock jest.fn()s live INSIDE the factories here rather than in an outer `const mockX =
// jest.fn()` -- an outer one wouldn't be assigned yet at the moment backgroundTask.ts's own
// top-level defineTask() call runs.
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(),
}));

// @udine/shared and ./menuHoursCache are only reached from inside warmMenuCache's function body
// (never at module scope), so the deferred-closure pattern menuPrefetch.test.ts already uses is
// safe here too.
const mockFetchMenu = jest.fn<Promise<MenuItem[]>, [number, Date]>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: (tid: number, date: Date) => mockFetchMenu(tid, date),
}));

const mockSaveCachedMenu = jest.fn<Promise<void>, [number, Date, MenuItem[]]>();
const mockGetCachedMenu = jest.fn<Promise<{ items: MenuItem[]; fetchedAt: string } | null>, [number, Date]>();
jest.mock("./menuHoursCache", () => ({
  saveCachedMenu: (...args: [number, Date, MenuItem[]]) => mockSaveCachedMenu(...args),
  getCachedMenu: (...args: [number, Date]) => mockGetCachedMenu(...args),
}));

// Task 3 (signed-out favorited-dish notification match) dependencies -- each mocked at its own
// module boundary, same style as fetchMenu/saveCachedMenu above, so this file stays a wiring/gating
// test: real matchFavoritedDishes (from the unmocked-except-fetchMenu @udine/shared above) is what
// proves the match-primitive integration, not a mock of it.
const mockGetSession = jest.fn();
jest.mock("./supabase", () => ({ supabase: { auth: { getSession: (...args: []) => mockGetSession(...args) } } }));

const mockGetFavorites = jest.fn<Promise<Favorite[]>, []>();
jest.mock("./favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites: () => mockGetFavorites() })),
}));

const mockClaimSighting = jest.fn<Promise<boolean>, [string, number, string]>();
jest.mock("./sightingDedup", () => ({
  claimSighting: (...args: [string, number, string]) => mockClaimSighting(...args),
}));

jest.mock("expo-notifications", () => ({ scheduleNotificationAsync: jest.fn() }));
const mockScheduleNotificationAsync = Notifications.scheduleNotificationAsync as jest.Mock;

const mockDefineTask = TaskManager.defineTask as jest.Mock;
const mockRegisterTaskAsync = BackgroundTask.registerTaskAsync as jest.Mock;

// Importing "./backgroundTask" above already called TaskManager.defineTask exactly once (module
// scope) -- capture that single registration now, before any test resets the mock.
const [registeredTaskName, taskExecutor] = mockDefineTask.mock.calls[0] as [string, () => Promise<unknown>];

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

beforeEach(() => {
  // Baseline default so tests that don't care about the cache-warm step's own fetch (task 3's
  // notification-matching tests below) don't have to restate it -- every pre-existing cache-warm
  // test below still overrides this with its own mockImplementation.
  mockFetchMenu.mockReset().mockResolvedValue([]);
  mockSaveCachedMenu.mockReset().mockResolvedValue(undefined);
  mockRegisterTaskAsync.mockReset().mockResolvedValue(undefined);
  // Signed-out by default (task 3's own path) -- individual signed-in tests override this.
  mockGetCachedMenu.mockReset().mockResolvedValue(null);
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockGetFavorites.mockReset().mockResolvedValue([]);
  mockClaimSighting.mockReset().mockResolvedValue(true);
  mockScheduleNotificationAsync.mockReset().mockResolvedValue("notification-id");
});

test("defines exactly one background task naming this module's task name", () => {
  expect(registeredTaskName).toBe(BACKGROUND_TASK_NAME);
  expect(typeof taskExecutor).toBe("function");
});

test("a run refreshes the cache for every dining hall + Grab 'N Go tid -- the same scope prefetchTodaysMenus covers", async () => {
  expect(allTids).toHaveLength(8);
  mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));

  const result = await taskExecutor();

  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(8);
  for (const tid of allTids) {
    expect(mockSaveCachedMenu).toHaveBeenCalledWith(tid, expect.any(Date), itemsFor(tid));
  }
  expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
});

test("a failed fetch for one tid degrades silently -- swallowed, others still cache, task never throws", async () => {
  const failingTid = allTids[0];
  mockFetchMenu.mockImplementation((tid) => {
    if (tid === failingTid) return Promise.reject(new Error("network down"));
    return Promise.resolve(itemsFor(tid));
  });

  await expect(taskExecutor()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);

  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(7);
  expect(mockSaveCachedMenu).not.toHaveBeenCalledWith(failingTid, expect.any(Date), expect.anything());
});

test("registerBackgroundTask registers the defined task name with the OS's minimum interval", async () => {
  await registerBackgroundTask();

  // Pinned to the exact value (not expect.any(Number)) -- 15 is WorkManager's own floor on
  // Android (see the brief's Rationale); a drift to something looser would silently change how
  // often the cache actually gets a chance to warm.
  expect(mockRegisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_TASK_NAME, { minimumInterval: 15 });
});

// Task 3: signed-out local favorited-dish notification matching.
function menuItem(dishName: string, hallTid: number): MenuItem {
  return { ...itemsFor(hallTid)[0], dishName, hallTid };
}

describe("signed-out favorited-dish notification match", () => {
  test("a favorited dish on the freshly-cached menu, not yet claimed, fires exactly one local notification and records the dedup entry", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetCachedMenu.mockImplementation((tid) => (tid === DINING_HALLS[2].tid ? Promise.resolve({ items: [menuItem("Chicken Parm", tid)], fetchedAt: "x" }) : Promise.resolve(null)));
    mockGetFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);
    mockClaimSighting.mockResolvedValue(true);

    await taskExecutor();

    expect(mockClaimSighting).toHaveBeenCalledTimes(1);
    expect(mockClaimSighting).toHaveBeenCalledWith("Chicken Parm", DINING_HALLS[2].tid, "2026-09-08");
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [call] = mockScheduleNotificationAsync.mock.calls[0];
    expect(call.trigger).toBeNull();
    expect(call.content.title).toContain("Chicken Parm");
  });

  // The real (unmocked) matchFavoritedDishes from @udine/shared decides which cached items match --
  // only ./supabase, ./favoritesStorage, ./menuHoursCache, ./sightingDedup and expo-notifications
  // are mocked above -- so this exercises the actual matching primitive, not a stand-in for it.
  test("only the favorited dish name matches -- an unfavorited dish on the same cached menu is not notified", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetCachedMenu.mockImplementation((tid) =>
      tid === DINING_HALLS[0].tid ? Promise.resolve({ items: [menuItem("Chicken Parm", tid), menuItem("Tofu Stir Fry", tid)], fetchedAt: "x" }) : Promise.resolve(null),
    );
    mockGetFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);
    mockClaimSighting.mockResolvedValue(true);

    await taskExecutor();

    expect(mockClaimSighting).toHaveBeenCalledTimes(1);
    expect(mockClaimSighting).toHaveBeenCalledWith("Chicken Parm", DINING_HALLS[0].tid, "2026-09-08");
  });

  // A "location" favorite (favorited hall, not a dish) is never a food match -- matchFavoritedDishes
  // filters to type "dish" only.
  test("a location favorite never fires a notification even if its name happens to equal a dish", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetCachedMenu.mockImplementation((tid) => (tid === DINING_HALLS[0].tid ? Promise.resolve({ items: [menuItem("Chicken Parm", tid)], fetchedAt: "x" }) : Promise.resolve(null)));
    mockGetFavorites.mockResolvedValue([{ type: "location", hallTid: DINING_HALLS[0].tid }]);

    await taskExecutor();

    expect(mockClaimSighting).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("a match already claimed by an earlier run does not fire a second local notification", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetCachedMenu.mockImplementation((tid) => (tid === DINING_HALLS[2].tid ? Promise.resolve({ items: [menuItem("Chicken Parm", tid)], fetchedAt: "x" }) : Promise.resolve(null)));
    mockGetFavorites.mockResolvedValue([{ type: "dish", dishName: "Chicken Parm" }]);
    mockClaimSighting.mockResolvedValue(false); // already recorded by an earlier background-task run

    await taskExecutor();

    expect(mockClaimSighting).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("signed in: cache still refreshes, but the local match/notify path never runs", async () => {
    mockFetchMenu.mockImplementation((tid) => Promise.resolve(itemsFor(tid)));
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });

    await taskExecutor();

    // Task 2's job, unchanged.
    expect(mockSaveCachedMenu).toHaveBeenCalledTimes(8);
    // Task 3's job, gated off for a signed-in user (see the brief's Rationale -- server push already
    // covers them via check-favorited-foods).
    expect(mockGetFavorites).not.toHaveBeenCalled();
    expect(mockClaimSighting).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test("a failure anywhere in the match/notify step degrades silently -- never throws out of the registered task", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetFavorites.mockRejectedValue(new Error("sqlite hiccup"));

    await expect(taskExecutor()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);
  });
});
