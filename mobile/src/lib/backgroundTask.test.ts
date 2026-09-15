import { DINING_HALLS, GRAB_N_GO_TIDS, type MenuItem } from "@udine/shared";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";

import { BACKGROUND_TASK_NAME, BackgroundTaskResult, registerBackgroundTask } from "./backgroundTask";

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
jest.mock("./menuHoursCache", () => ({
  saveCachedMenu: (...args: [number, Date, MenuItem[]]) => mockSaveCachedMenu(...args),
}));

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
  mockFetchMenu.mockReset();
  mockSaveCachedMenu.mockReset().mockResolvedValue(undefined);
  mockRegisterTaskAsync.mockReset().mockResolvedValue(undefined);
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
  expect(result).toBe(BackgroundTaskResult.Success);
});

test("a failed fetch for one tid degrades silently -- swallowed, others still cache, task never throws", async () => {
  const failingTid = allTids[0];
  mockFetchMenu.mockImplementation((tid) => {
    if (tid === failingTid) return Promise.reject(new Error("network down"));
    return Promise.resolve(itemsFor(tid));
  });

  await expect(taskExecutor()).resolves.toBe(BackgroundTaskResult.Success);

  expect(mockSaveCachedMenu).toHaveBeenCalledTimes(7);
  expect(mockSaveCachedMenu).not.toHaveBeenCalledWith(failingTid, expect.any(Date), expect.anything());
});

test("registerBackgroundTask registers the defined task name with the OS's minimum interval", async () => {
  await registerBackgroundTask();

  expect(mockRegisterTaskAsync).toHaveBeenCalledWith(
    BACKGROUND_TASK_NAME,
    expect.objectContaining({ minimumInterval: expect.any(Number) }),
  );
});
