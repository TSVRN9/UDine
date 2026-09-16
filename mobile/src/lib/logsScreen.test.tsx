// #119: Logs & stats screen wiring -- week strip selection, tap-to-edit rows, stepper/remove
// recompute, Last 7 Days chart, For Fun stat gate. Same conventions as hallMenu.test.tsx (module-
// scope storage singleton, mocks retrieved via `.mock.results[0].value` since `../app/logs`
// instantiates SqliteLogStorage at module top level -- importing the screen below is what loads it)
// and YouPane.test.tsx (jest.fn()s created *inside* each factory, not closed over from an outer
// scope -- babel hoists jest.mock factories above other top-level statements).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import type { LogEntry } from "@udine/shared";
import LogsScreen from "../app/logs";
import { SqliteLogStorage } from "./sqliteStorage";
import { __resetRetailNamesForTest, recordRetailNames } from "./retailHallNames";

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
  __resetRetailNamesForTest();
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

  it("bolds past/selected day-number digits but not future ones (#420, matches the #388 label-color split)", async () => {
    const root = await renderLogsScreen();
    // todayIso mocked to 2026-08-20 (Thursday); Aug 21/22 fall later in the same week strip.
    const pastChip = pressableWithLabel(root, "Tuesday, August 18");
    const futureChip = pressableWithLabel(root, "Friday, August 21");
    const chipNumberWeight = (chip: typeof pastChip) => {
      const numberText = chip.findAllByType(Text)[1];
      return Object.assign({}, ...([] as unknown[]).concat(numberText.props.style)).fontWeight;
    };
    expect(chipNumberWeight(pastChip)).toBe("600");
    expect(chipNumberWeight(futureChip)).toBe("400");
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

  // #243 bug A: the edit card's subtitle is a SEPARATE hallNameFor call site from the collapsed
  // row's logItemLine -- fixing one without the other would still show "Hall 32" the moment a café
  // dish's row is expanded into its edit state.
  it("shows the café's real name in the edit card subtitle instead of 'Hall <tid>' (#243 bug A)", async () => {
    recordRetailNames([{ name: "People's Organic Coffee", hours: null, locationId: 32 }]);
    logMock.getAllEntries.mockResolvedValue([logEntry("1", "Coffee", 32, "2026-08-20T07:00:00.000")]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit Coffee · People's Organic Coffee").props.onPress();
    });

    expect(texts(root)).toMatch(/People's Organic Coffee/);
    expect(texts(root)).not.toMatch(/Hall 32/);
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
    // macros alone drive the average. Before: 320 cal / 12g protein / 30g carb / 8g fat ->
    // round(320/7)=46, round(12/7)=2, round(30/7)=4, round(8/7)=1. After stepping up to 2
    // servings: 640 cal / 24g protein / 60g carb / 16g fat -> round(640/7)=91, round(24/7)=3,
    // round(60/7)=9, round(16/7)=2. mutant 3 from PR #140's review (deleting stepEntry's
    // `await refresh()`) would leave the chart reading the stale figures here, same as it broke
    // the day/meal totals.
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();
    expect(texts(root)).toMatch(/Avg\s*46\s*cal \/ day/);
    expect(texts(root)).toMatch(/2\s*g protein \/ day/);
    expect(texts(root)).toMatch(/4\s*g carb \/ day/);
    expect(texts(root)).toMatch(/1\s*g fat \/ day/);

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.getAllEntries.mockResolvedValue([{ ...entry, servings: 2 }]);
    await act(async () => {
      await pressableWithLabel(root, "Add one French Toast").props.onPress();
    });

    expect(texts(root)).toMatch(/Avg\s*91\s*cal \/ day/);
    expect(texts(root)).toMatch(/3\s*g protein \/ day/);
    expect(texts(root)).toMatch(/9\s*g carb \/ day/);
    expect(texts(root)).toMatch(/2\s*g fat \/ day/);
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

  // #165 (follow-up from PR #164's review): withStepGuard still releases `stepping.current` in
  // `finally` when the guarded write rejects (#162), but until now the rejection itself
  // propagated out of the un-awaited onPress as an unhandled promise rejection -- withStepGuard
  // had no catch of its own, same as rank.tsx's choose() and unlike the three handlers #158 fixed
  // (#146). withStepGuard now catches the failed write and surfaces it by extending the existing
  // per-entry editSubtitle text in EditEntryCard, rather than adding new banner infra. Proven
  // here: pressing no longer rejects, the error text renders alongside the entry being edited, a
  // second tap still commits (guard released despite the caught throw), and a later success
  // clears the earlier error.
  it("catches a rejected write, surfaces it next to the entry being edited, and still releases the step guard so a subsequent tap commits (#162, #165)", async () => {
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.addEntry.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      // No longer rejects -- withStepGuard catches the failed write internally.
      await pressableWithLabel(root, "Add one French Toast").props.onPress();
    });

    expect(logMock.addEntry).toHaveBeenCalledTimes(1);
    expect(texts(root)).toMatch(/Couldn't save.*disk full/);

    // Guard must have released in `finally` despite the caught throw -- a second tap must still
    // reach addEntry (computing from the still-1 servings count, since the rejected write's
    // refresh() never ran), not be dropped as if the first write were still in flight.
    logMock.getAllEntries.mockResolvedValue([{ ...entry, servings: 2 }]);
    await act(async () => {
      await pressableWithLabel(root, "Add one French Toast").props.onPress();
    });

    expect(logMock.addEntry).toHaveBeenCalledTimes(2);
    expect(logMock.addEntry).toHaveBeenLastCalledWith(expect.objectContaining({ id: "1", servings: 2 }));
    expect(texts(root)).toMatch(/640\s*cal/);
    // A successful step clears the earlier error instead of leaving it stuck on screen.
    expect(texts(root)).not.toMatch(/Couldn't save/);
  });

  // Same withStepGuard chokepoint as the stepper test above, but through the × remove button's
  // removeEntry() path instead of stepEntry() -- both handlers route through the one guarded
  // catch, but nothing proved the × button's own failure surfaces (removeEntry throws before
  // setEditingId(null) runs, so the card stays mounted and shows the error).
  it("catches a rejected removal from the × button and surfaces it next to the entry, without clearing the edit state (#165)", async () => {
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.removeEntry.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      // No longer rejects -- withStepGuard catches the failed removal internally.
      await pressableWithLabel(root, "Remove French Toast").props.onPress();
    });

    expect(logMock.removeEntry).toHaveBeenCalledTimes(1);
    expect(texts(root)).toMatch(/Couldn't save.*disk full/);
    // Still in the edit state -- removeEntry threw before setEditingId(null) could run.
    expect(pressableWithLabel(root, "Remove French Toast")).toBeTruthy();

    // Guard must have released despite the caught throw -- a second tap still reaches removeEntry.
    logMock.removeEntry.mockResolvedValueOnce(undefined);
    logMock.getAllEntries.mockResolvedValue([]);
    await act(async () => {
      await pressableWithLabel(root, "Remove French Toast").props.onPress();
    });

    expect(logMock.removeEntry).toHaveBeenCalledTimes(2);
    expect(texts(root)).toMatch(/Nothing logged/);
  });

  // #167 (PR #166 review nit): removeEntry() used to call setEditingId(null) *before* awaiting
  // refresh(). If the delete write itself succeeded but the follow-up getAllEntries() then
  // rejected, the edit card unmounted (editingId already null) while allEntries still held the
  // (now actually deleted) entry -- the row kept rendering as an untouched, non-editing row, with
  // stepError set but nowhere to display it. Reordered so editingId only clears after a successful
  // refresh; a rejection there now leaves the edit card (and its error text) in place instead.
  it("leaves the edit card open with an error when the delete succeeds but the follow-up refresh fails, instead of silently showing a stale row (#167)", async () => {
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.removeEntry.mockResolvedValueOnce(undefined);
    logMock.getAllEntries.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      // No longer rejects -- withStepGuard catches the failed refresh internally.
      await pressableWithLabel(root, "Remove French Toast").props.onPress();
    });

    expect(logMock.removeEntry).toHaveBeenCalledWith("1");
    expect(texts(root)).toMatch(/Couldn't save.*disk full/);
    // Still in the edit state -- the failed refresh means we don't actually know the UI reflects
    // reality yet, so editingId must not have been cleared out from under it.
    expect(pressableWithLabel(root, "Remove French Toast")).toBeTruthy();
  });

  // Same #167 reorder, but through stepEntry's own delete branch (stepping the stepper down to 0)
  // rather than the × button's removeEntry() -- both branches had the identical bug and both got
  // reordered, so both need a red test proving it, not just the one above.
  it("leaves the edit card open with an error when stepping to 0 deletes successfully but the follow-up refresh fails (#167)", async () => {
    const entry = logEntry("1", "French Toast", 3, "2026-08-20T07:00:00.000", 1);
    logMock.getAllEntries.mockResolvedValue([entry]);
    const root = await renderLogsScreen();

    act(() => {
      pressableWithLabel(root, "Edit French Toast · Hampshire").props.onPress();
    });

    logMock.removeEntry.mockResolvedValueOnce(undefined);
    logMock.getAllEntries.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      // No longer rejects -- withStepGuard catches the failed refresh internally.
      await pressableWithLabel(root, "Remove one French Toast").props.onPress();
    });

    expect(logMock.removeEntry).toHaveBeenCalledWith("1");
    expect(logMock.addEntry).not.toHaveBeenCalled();
    expect(texts(root)).toMatch(/Couldn't save.*disk full/);
    // Still in the edit state -- the failed refresh means we don't actually know the UI reflects
    // reality yet, so editingId must not have been cleared out from under it.
    expect(pressableWithLabel(root, "Remove one French Toast")).toBeTruthy();
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
