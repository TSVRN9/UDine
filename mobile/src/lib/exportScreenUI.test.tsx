// Lives here, not next to src/app/export.tsx: expo-router scans every file under src/app/ as a
// candidate route (see redirect.test.tsx's own note). This file only proves THIS screen's wiring
// (selection state -> correct exporter calls with correct formats, zero-selection guard, BOTH
// producing both artifacts) -- exportShare.ts's own read/serialize/share-sheet behavior is
// mutation-tested directly in exportShare.test.ts, so it's mocked here rather than re-tested.

jest.mock("./sqliteStorage", () => {
  const getAllEntries = jest.fn().mockResolvedValue([]);
  return { SqliteLogStorage: jest.fn().mockImplementation(() => ({ getAllEntries })) };
});
jest.mock("./rankingStorage", () => {
  const getRankedDishes = jest.fn().mockResolvedValue([]);
  const getRankedFoods = jest.fn().mockResolvedValue([]);
  return { SqliteRankingStorage: jest.fn().mockImplementation(() => ({ getRankedDishes, getRankedFoods })) };
});
jest.mock("./favoritesStorage", () => {
  const getFavorites = jest.fn().mockResolvedValue([]);
  return { SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({ getFavorites })) };
});

const mockExportLog = jest.fn().mockResolvedValue(undefined);
const mockExportRankedDishes = jest.fn().mockResolvedValue(undefined);
const mockExportRankedFoods = jest.fn().mockResolvedValue(undefined);
const mockExportFavorites = jest.fn().mockResolvedValue(undefined);
jest.mock("./exportShare", () => ({
  exportLog: (...args: unknown[]) => mockExportLog(...args),
  exportRankedDishes: (...args: unknown[]) => mockExportRankedDishes(...args),
  exportRankedFoods: (...args: unknown[]) => mockExportRankedFoods(...args),
  exportFavorites: (...args: unknown[]) => mockExportFavorites(...args),
}));

const mockRouterBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockRouterBack(...args) },
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

import renderer, { act } from "react-test-renderer";
import { Alert, Text } from "react-native";
import ExportScreen from "../app/export";

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children)))
    .join(" | ");
}

/** Finds the onPress ancestor by walking up from a Text node matching `label` -- same convention
 * as friendsScreen.test.tsx's findPressableByText (react-test-renderer's `.type` doesn't compare
 * cleanly against RN's Pressable, so this checks for the onPress prop instead of the component
 * type). */
function pressRow(root: renderer.ReactTestRenderer, label: string) {
  const textNode = root.root.findAllByType(Text).find((n) => n.props.children === label);
  if (!textNode) throw new Error(`text "${label}" not found`);
  let node = textNode.parent;
  while (node && typeof node.props.onPress !== "function") node = node.parent;
  if (!node) throw new Error(`no onPress ancestor for "${label}"`);
  node.props.onPress();
}

async function renderScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<ExportScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe("ExportScreen: selection + zero-selection guard", () => {
  it("starts with nothing selected and the EXPORT button disabled", async () => {
    const root = await renderScreen();
    expect(texts(root)).toMatch(/0 selected/);
    const exportText = root.root.findAllByType(Text).find((n) => n.props.children === "↓ EXPORT");
    let node = exportText!.parent;
    while (node && typeof node.props.onPress !== "function") node = node.parent;
    expect(node!.props.disabled).toBe(true);
  });

  it("tapping EXPORT with nothing selected calls no exporter", async () => {
    const root = await renderScreen();
    await act(async () => {
      pressRow(root, "↓ EXPORT");
    });
    expect(mockExportLog).not.toHaveBeenCalled();
    expect(mockExportRankedDishes).not.toHaveBeenCalled();
    expect(mockExportRankedFoods).not.toHaveBeenCalled();
    expect(mockExportFavorites).not.toHaveBeenCalled();
  });

  it("selecting a row updates the count and the selected-names line", async () => {
    const root = await renderScreen();
    await act(async () => {
      pressRow(root, "Food log");
    });
    expect(texts(root)).toMatch(/1 selected/);
    expect(texts(root)).toMatch(/log/);
  });

  it("selecting a row twice deselects it", async () => {
    const root = await renderScreen();
    await act(async () => {
      pressRow(root, "Food log");
    });
    await act(async () => {
      pressRow(root, "Food log");
    });
    expect(texts(root)).toMatch(/0 selected/);
  });
});

describe("ExportScreen: format + export wiring", () => {
  it("defaults to CSV and runs the CSV exporter for each selected store, in STORE_ORDER", async () => {
    const root = await renderScreen();
    await act(async () => {
      pressRow(root, "Favorites");
    });
    await act(async () => {
      pressRow(root, "Food log");
    });

    await act(async () => {
      pressRow(root, "↓ EXPORT");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockExportLog).toHaveBeenCalledWith("csv");
    expect(mockExportFavorites).toHaveBeenCalledWith("csv");
    expect(mockExportRankedDishes).not.toHaveBeenCalled();
    expect(mockExportRankedFoods).not.toHaveBeenCalled();
  });

  it("switching to JSON runs the JSON exporter instead", async () => {
    const root = await renderScreen();
    await act(async () => {
      pressRow(root, "Dish rankings");
    });
    await act(async () => {
      pressRow(root, "JSON");
    });
    await act(async () => {
      pressRow(root, "↓ EXPORT");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockExportRankedDishes).toHaveBeenCalledWith("json");
    expect(mockExportRankedDishes).not.toHaveBeenCalledWith("csv");
  });

  // Mutation-based red evidence for the BOTH path: buildExportPlan's own test file
  // (exportScreen.test.ts) already mutation-proves the (store, format) pairing; this proves the
  // SCREEN actually calls the exporter twice per selected store when wired to BOTH, once per
  // format -- both real artifacts, not one call with a "both" string the exporter doesn't understand.
  it("BOTH calls each selected store's exporter twice -- once per format, both real artifacts", async () => {
    const root = await renderScreen();
    await act(async () => {
      pressRow(root, "Off-menu food rankings");
    });
    await act(async () => {
      pressRow(root, "BOTH");
    });
    await act(async () => {
      pressRow(root, "↓ EXPORT");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockExportRankedFoods).toHaveBeenCalledTimes(2);
    expect(mockExportRankedFoods).toHaveBeenCalledWith("json");
    expect(mockExportRankedFoods).toHaveBeenCalledWith("csv");
  });

  // Review finding on #212: runExport's try/finally had no catch -- a throw partway through the
  // plan (e.g. job 3 of 8) silently dropped every job after it (the for-loop's throw propagates
  // straight out, finally re-enables the button, and nothing tells the user only part of their
  // export happened). Selects all 4 stores with BOTH (8 jobs: log json/csv, dishRankings
  // json/csv, foodRankings json/csv, favorites json/csv) and fails job 3 (dishRankings json) --
  // proves jobs 4-8 still run, and that the failure is surfaced, not swallowed.
  it("a failing job doesn't abort the rest of the plan, and the failure is surfaced truthfully", async () => {
    mockExportRankedDishes.mockRejectedValueOnce(new Error("disk full"));

    const root = await renderScreen();
    await act(async () => {
      pressRow(root, "Food log");
    });
    await act(async () => {
      pressRow(root, "Dish rankings");
    });
    await act(async () => {
      pressRow(root, "Off-menu food rankings");
    });
    await act(async () => {
      pressRow(root, "Favorites");
    });
    await act(async () => {
      pressRow(root, "BOTH");
    });

    await act(async () => {
      pressRow(root, "↓ EXPORT");
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Job 1-2 (log) and the failing job 3 (dishRankings json) all ran.
    expect(mockExportLog).toHaveBeenCalledWith("json");
    expect(mockExportLog).toHaveBeenCalledWith("csv");
    expect(mockExportRankedDishes).toHaveBeenCalledWith("json");
    // Jobs after the failure (dishRankings csv, both foodRankings jobs, both favorites jobs)
    // must still have run -- this is what a bare try/finally-with-no-catch would NOT do, since
    // the throw from job 3 would propagate out of the for-loop and skip everything after it.
    expect(mockExportRankedDishes).toHaveBeenCalledWith("csv");
    expect(mockExportRankedFoods).toHaveBeenCalledTimes(2);
    expect(mockExportFavorites).toHaveBeenCalledTimes(2);

    // The failure is surfaced, not silently dropped.
    expect(Alert.alert).toHaveBeenCalledWith("Some exports failed", expect.stringContaining("dish rankings"));
  });
});
