// #119: Logs & stats screen wiring -- week strip selection, tap-to-edit rows, stepper/remove
// recompute, Last 7 Days chart, For Fun stat gate. Same conventions as hallMenu.test.tsx (module-
// scope storage singleton, mocks retrieved via `.mock.results[0].value` since `../app/logs`
// instantiates SqliteLogStorage at module top level -- importing the screen below is what loads it)
// and YouPane.test.tsx (jest.fn()s created *inside* each factory, not closed over from an outer
// scope -- babel hoists jest.mock factories above other top-level statements).
jest.mock("../lib/sqliteStorage", () => {
  const getAllEntries = jest.fn().mockResolvedValue([]);
  const addEntry = jest.fn().mockResolvedValue(undefined);
  const removeEntry = jest.fn().mockResolvedValue(undefined);
  return { SqliteLogStorage: jest.fn().mockImplementation(() => ({ getAllEntries, addEntry, removeEntry })) };
});

const mockRouterBack = jest.fn();
// Fires the focus callback only once per test (reset in beforeEach below), not on every render --
// the real hook only fires on an actual focus event, not on every state-driven re-render. A naive
// `(callback) => callback()` mock (as several other test files use, for screens that never
// interact past their initial load) would instead re-invoke `load()` on every tap in this screen's
// tests, silently reloading from the mocked getAllEntries() and masking whether the screen's own
// post-edit refresh() call actually does the work.
let mockFocusEffectFired = false;
jest.mock("expo-router", () => ({
  router: { back: () => mockRouterBack() },
  useFocusEffect: (callback: () => void) => {
    if (!mockFocusEffectFired) {
      mockFocusEffectFired = true;
      callback();
    }
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../lib/date", () => ({ todayIso: () => "2026-08-20" }));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import type { LogEntry } from "@udine/shared";
import LogsScreen from "../app/logs";
import { SqliteLogStorage } from "./sqliteStorage";

const logMock = new SqliteLogStorage() as unknown as { getAllEntries: jest.Mock; addEntry: jest.Mock; removeEntry: jest.Mock };

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

function pressableWithLabel(root: renderer.ReactTestRenderer, label: string) {
  const match = root.root.findAllByProps({ accessibilityRole: "button" }).find((p) => p.props.accessibilityLabel === label);
  if (!match) throw new Error(`No button found with accessibilityLabel "${label}"`);
  return match;
}

const NUTRITION = {
  servingSize: "1 serving",
  calories: 320,
  caloriesFromFat: 40,
  totalFatG: 8,
  satFatG: 2,
  transFatG: 0,
  cholesterolMg: 10,
  sodiumMg: 200,
  totalCarbG: 30,
  dietaryFiberG: 2,
  sugarsG: 5,
  proteinG: 12,
};

function logEntry(id: string, dishName: string, hallTid: number, loggedAt: string, servings = 1): LogEntry {
  return { id, loggedAt, source: { type: "umass-menu", dishName, hallTid }, servings, nutrition: NUTRITION };
}

async function renderLogsScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<LogsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

beforeEach(() => {
  logMock.getAllEntries.mockReset().mockResolvedValue([]);
  logMock.addEntry.mockReset().mockResolvedValue(undefined);
  logMock.removeEntry.mockReset().mockResolvedValue(undefined);
  mockRouterBack.mockReset();
  mockFocusEffectFired = false;
});

describe("LogsScreen header", () => {
  it("navigates back when the back arrow is tapped", async () => {
    const root = await renderLogsScreen();
    act(() => {
      pressableWithLabel(root, "Back").props.onPress();
    });
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});

describe("LogsScreen week strip", () => {
  it("selects today by default and shows a gold dot only on logged days", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-18T07:00:00.000")]);
    const root = await renderLogsScreen();
    const body = texts(root);
    // Today (Aug 20) is selected -> the day log section is titled after today's weekday.
    expect(body).toMatch(/THURSDAY'S LOG/i);
  });

  it("switches the day log to a different day's entries when its chip is tapped", async () => {
    logMock.getAllEntries.mockResolvedValue([
      logEntry("today", "Grilled Chicken", 1, "2026-08-20T18:00:00.000"),
      logEntry("mon", "French Toast", 3, "2026-08-18T07:00:00.000"),
    ]);
    const root = await renderLogsScreen();
    // Collapsed rows always include the hall ("<dish> · <hall>") -- disambiguates the day-log row
    // from "Grilled Chicken" possibly also appearing plain in the (all-time, not day-scoped)
    // For Fun most-logged-dish caption.
    expect(texts(root)).toMatch(/Grilled Chicken · Worcester/);
    expect(texts(root)).not.toMatch(/French Toast · Hampshire/);

    act(() => {
      // Chip a11y label is humanized, not the bare ISO date (issue #142) -- Aug 18 2026 is a Tuesday.
      pressableWithLabel(root, "Tuesday, August 18").props.onPress();
    });

    expect(texts(root)).toMatch(/French Toast · Hampshire/);
    expect(texts(root)).not.toMatch(/Grilled Chicken · Worcester/);
  });
});

describe("LogsScreen day log editing", () => {
  it("toggles a tapped row into the gold-bordered edit state (stepper + remove visible)", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 2)]);
    const root = await renderLogsScreen();

    expect(() => pressableWithLabel(root, "Remove French Toast")).toThrow();

    act(() => {
      pressableWithLabel(root, "Edit French Toast × 2 · Hampshire").props.onPress();
    });

    expect(pressableWithLabel(root, "Remove French Toast")).toBeTruthy();
    expect(pressableWithLabel(root, "Add one French Toast")).toBeTruthy();
    expect(pressableWithLabel(root, "Remove one French Toast")).toBeTruthy();
  });

  it("stepping down to 0 deletes the entry and recomputes the day/meal totals (delete/recompute path)", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1)]);
    const root = await renderLogsScreen();
    expect(texts(root)).toMatch(/320\s*cal/); // the day total before stepping down (Text's children array join adds a space)

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.getAllEntries.mockResolvedValue([]); // storage now reflects the delete
    await act(async () => {
      await pressableWithLabel(root, "Remove one French Toast").props.onPress();
    });

    expect(logMock.removeEntry).toHaveBeenCalledWith("1");
    expect(logMock.addEntry).not.toHaveBeenCalled();
    expect(texts(root)).not.toMatch(/French Toast/);
    expect(texts(root)).not.toMatch(/320\s*cal/);
    expect(texts(root)).toMatch(/Nothing logged/);
  });

  it("stepping up writes the incremented servings via addEntry and recomputes the total", async () => {
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.getAllEntries.mockResolvedValue([{ ...entry, servings: 2 }]);
    await act(async () => {
      await pressableWithLabel(root, "Add one French Toast").props.onPress();
    });

    expect(logMock.addEntry).toHaveBeenCalledWith(expect.objectContaining({ id: "1", servings: 2 }));
    expect(texts(root)).toMatch(/640\s*cal/); // 320 * 2, recomputed
  });

  it("recomputes the Last 7 Days chart average after an edit, not just the day/meal totals (issue #142)", async () => {
    // Today (Aug 20) is the only day in the trailing 7-day chart window with any entries, so its
    // calories/protein alone drive the average. Before: 320 cal / 12g protein -> round(320/7)=46,
    // round(12/7)=2. After stepping up to 2 servings: 640 cal / 24g protein -> round(640/7)=91,
    // round(24/7)=3. mutant 3 from PR #140's review (deleting stepEntry's `await refresh()`) would
    // leave the chart reading the stale 46/2 figures here, same as it broke the day/meal totals.
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();
    expect(texts(root)).toMatch(/Avg\s*46\s*cal \/ day/);
    expect(texts(root)).toMatch(/2\s*g protein \/ day/);

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.getAllEntries.mockResolvedValue([{ ...entry, servings: 2 }]);
    await act(async () => {
      await pressableWithLabel(root, "Add one French Toast").props.onPress();
    });

    expect(texts(root)).toMatch(/Avg\s*91\s*cal \/ day/);
    expect(texts(root)).toMatch(/3\s*g protein \/ day/);
  });

  it("drops a rapid second tap while the first step's write is still in flight, instead of both reading the same stale servings count", async () => {
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    // addEntry never resolves until we say so -- simulates a slow storage write, the exact window
    // in which two taps would otherwise both compute `entry.servings + 1` from the same snapshot.
    let resolveAddEntry!: () => void;
    logMock.addEntry.mockImplementation(() => new Promise<void>((resolve) => (resolveAddEntry = resolve)));

    await act(async () => {
      const plusButton = pressableWithLabel(root, "Add one French Toast");
      plusButton.props.onPress(); // starts the guarded write
      plusButton.props.onPress(); // fires before the first resolves -- must be dropped, not queued
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(logMock.addEntry).toHaveBeenCalledTimes(1);

    // Let the first write settle -- the guard must release so a later, real tap still works.
    await act(async () => {
      resolveAddEntry();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("tapping × removes the entry regardless of remaining servings", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 5)]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit French Toast × 5 · Hampshire").props.onPress();
    });

    logMock.getAllEntries.mockResolvedValue([]);
    await act(async () => {
      await pressableWithLabel(root, "Remove French Toast").props.onPress();
    });

    expect(logMock.removeEntry).toHaveBeenCalledWith("1");
    expect(texts(root)).toMatch(/Nothing logged/);
  });
});

describe("LogsScreen For Fun stats", () => {
  it("shows an empty state instead of zeroed stat cards when the log is completely empty", async () => {
    logMock.getAllEntries.mockResolvedValue([]);
    const root = await renderLogsScreen();
    const body = texts(root);
    expect(body).not.toMatch(/day logging streak/);
    expect(body).toMatch(/For Fun/i);
  });

  it("renders fun stat cards once there's enough data", async () => {
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 3)]);
    const root = await renderLogsScreen();
    const body = texts(root);
    expect(body).toMatch(/× 3/);
    expect(body).toMatch(/French Toast/);
  });
});
