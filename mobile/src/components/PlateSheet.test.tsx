// PlateSheet reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx). It also now touches Supabase (dishCatalog's background refresh) -- explicit
// factories, not bare automocks, same reasoning as homePane.test.tsx: automock still imports the
// real module to derive its shape, and the real ../lib/supabase drags in native bindings
// unavailable outside jest-expo's native harness.
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { InMemoryLogStorage, searchProducts, type LogEntry, type LogStorage, type MenuItem } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { menuItemToPlateEntry, offResultToPlateEntry } from "../lib/plate";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../lib/supabase", () => ({ supabase: {} }));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  searchProducts: jest.fn(),
}));

jest.mock("../lib/dishCatalog", () => ({
  getCachedDishCatalog: jest.fn(),
  refreshDishCatalogIfStale: jest.fn(),
  searchCachedDishes: jest.fn(),
}));

const mockedSearchProducts = searchProducts as jest.Mock;
const mockedGetCachedDishCatalog = getCachedDishCatalog as jest.Mock;
const mockedRefreshDishCatalogIfStale = refreshDishCatalogIfStale as jest.Mock;
const mockedSearchCachedDishes = searchCachedDishes as jest.Mock;

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

function searchInput(root: renderer.ReactTestRenderer) {
  return root.root.findByProps({ placeholder: "Search for a food" });
}

function emptyLogStorage(): LogStorage {
  return new InMemoryLogStorage();
}

async function logStorageWith(entries: LogEntry[]): Promise<LogStorage> {
  const storage = new InMemoryLogStorage();
  for (const entry of entries) await storage.addEntry(entry);
  return storage;
}

const DISH: MenuItem = {
  dishName: "Pizza",
  category: "Entrees",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: {
    servingSize: "1 slice",
    calories: 200,
    caloriesFromFat: 0,
    totalFatG: 8,
    satFatG: 3,
    transFatG: 0,
    cholesterolMg: 10,
    sodiumMg: 400,
    totalCarbG: 24,
    dietaryFiberG: 1,
    sugarsG: 2,
    proteinG: 9,
  },
  allergens: [],
  dietTags: [],
};

const ZERO_TOTALS = { date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 };

function renderSheet(overrides: Partial<Parameters<typeof PlateSheet>[0]> = {}) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(
      <PlateSheet
        visible
        plate={[]}
        totals={ZERO_TOTALS}
        logStorage={emptyLogStorage()}
        hallTid={1}
        onStep={() => {}}
        onAddOffResult={() => {}}
        onAddHistoryDish={() => {}}
        onLog={() => {}}
        onClose={() => {}}
        {...overrides}
      />,
    );
  });
  return root;
}

async function runSearch(root: renderer.ReactTestRenderer, q: string) {
  act(() => {
    searchInput(root).props.onChangeText(q);
  });
  await act(async () => {
    searchInput(root).props.onSubmitEditing();
  });
}

beforeEach(() => {
  mockedSearchProducts.mockReset().mockResolvedValue([]);
  mockedGetCachedDishCatalog.mockReset().mockResolvedValue(null);
  mockedRefreshDishCatalogIfStale.mockReset().mockResolvedValue(undefined);
  mockedSearchCachedDishes.mockReset().mockReturnValue([]);
});

describe("PlateSheet", () => {
  it("renders plate rows, totals, and a LOG N ITEMS button sized to total item count", () => {
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 3 }];
    const root = renderSheet({ plate, totals: { date: "x", calories: 600, proteinG: 27, totalCarbG: 72, totalFatG: 24 } });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Pizza/);
    expect(body).toMatch(/600/);
    expect(body).toMatch(/LOG 3 ITEMS/);
  });

  it("calls onStep with the row's key and +1/-1 from its stepper buttons", () => {
    const onStep = jest.fn();
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 2 }];
    const root = renderSheet({ plate, totals: { date: "x", calories: 400, proteinG: 18, totalCarbG: 48, totalFatG: 16 }, onStep });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add one Pizza" }).props.onPress();
    });
    expect(onStep).toHaveBeenCalledWith(plate[0].key, 1);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Remove one Pizza" }).props.onPress();
    });
    expect(onStep).toHaveBeenCalledWith(plate[0].key, -1);
  });

  it("fires a background dish-catalog refresh once on mount", () => {
    renderSheet();
    expect(mockedRefreshDishCatalogIfStale).toHaveBeenCalledTimes(1);
  });

  // #198: onSubmitEditing had no guard against a search already in flight -- the Search BUTTON
  // already disables on `searching`, but hitting Enter/the keyboard's search key went straight to
  // runSearch regardless, so mashing Enter while typing fired overlapping searchProducts calls.
  it("#198: a second Enter while a search is already in flight is ignored, not fired as an overlapping request", async () => {
    let resolveFirst!: (v: unknown) => void;
    mockedSearchProducts.mockImplementation(() => new Promise((resolve) => (resolveFirst = resolve)));
    const root = renderSheet();

    act(() => {
      searchInput(root).props.onChangeText("a");
    });
    act(() => {
      searchInput(root).props.onSubmitEditing(); // search #1 starts, unresolved
    });
    act(() => {
      searchInput(root).props.onChangeText("banana");
    });
    act(() => {
      searchInput(root).props.onSubmitEditing(); // must be dropped -- #1 is still in flight
    });

    expect(mockedSearchProducts).toHaveBeenCalledTimes(1);
    expect(mockedSearchProducts).toHaveBeenCalledWith("a");

    await act(async () => {
      resolveFirst([]);
      await Promise.resolve();
    });
  });

  // #198: a stale search left in flight when the sheet closes had nothing invalidating it -- if the
  // user reopens and runs a different, faster search, the stale one resolving afterward silently
  // overwrote the fresh results with an answer to a query the box no longer even shows.
  it("#198: a stale search left in flight when the sheet closes doesn't clobber a fresh search run after reopening", async () => {
    let resolveStale!: (v: unknown) => void;
    mockedSearchProducts.mockImplementationOnce(() => new Promise((resolve) => (resolveStale = resolve)));

    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<PlateSheet visible plate={[]} totals={ZERO_TOTALS} logStorage={emptyLogStorage()} hallTid={1} onStep={() => {}} onAddOffResult={() => {}} onAddHistoryDish={() => {}} onLog={() => {}} onClose={() => {}} />);
    });
    await runSearch(root, "a"); // stale search now in flight (unresolved)

    // Sheet closes before the stale search resolves...
    act(() => {
      root.update(<PlateSheet visible={false} plate={[]} totals={ZERO_TOTALS} logStorage={emptyLogStorage()} hallTid={1} onStep={() => {}} onAddOffResult={() => {}} onAddHistoryDish={() => {}} onLog={() => {}} onClose={() => {}} />);
    });
    // ...then reopens, and the user runs a different, faster search.
    mockedSearchProducts.mockResolvedValueOnce([{ barcode: "999", productName: "Banana Chips", nutrition: DISH.nutrition }]);
    act(() => {
      root.update(<PlateSheet visible plate={[]} totals={ZERO_TOTALS} logStorage={emptyLogStorage()} hallTid={1} onStep={() => {}} onAddOffResult={() => {}} onAddHistoryDish={() => {}} onLog={() => {}} onClose={() => {}} />);
    });
    await runSearch(root, "banana");
    expect(texts(root).flat().join(" ")).toMatch(/Banana Chips/);

    // The stale first search finally resolves -- must not clobber the fresh results now showing.
    await act(async () => {
      resolveStale([{ barcode: "1", productName: "STALE RESULT", nutrition: DISH.nutrition }]);
      await Promise.resolve();
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Banana Chips/);
    expect(body).not.toMatch(/STALE RESULT/);
  });

  it("flags a per-100g-estimated OFF result on both the search-result row and once it's a plate row", async () => {
    mockedSearchProducts.mockResolvedValue([{ barcode: "999", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150, servingSize: "per 100g" } }]);
    const root = renderSheet();
    await runSearch(root, "trail mix");
    expect(texts(root).flat().join(" ")).toMatch(/est\. per 100g/);

    // Once it's on the plate (a row the parent passes back in via the `plate` prop), the same
    // estimate flag must still show -- this is where a real user actually sees the number they're
    // about to log, not just in the pre-pick search results.
    const plateRoot = renderSheet({
      plate: [offResultToPlateEntry({ barcode: "999", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150, servingSize: "per 100g" } })],
      totals: { date: "x", calories: 150, proteinG: 9, totalCarbG: 24, totalFatG: 8 },
    });
    expect(texts(plateRoot).flat().join(" ")).toMatch(/est\. per 100g/);
  });

  it("does not flag a normal per-serving plate row as an estimate", () => {
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 1 }]; // DISH.nutrition.servingSize is "1 slice"
    const root = renderSheet({ plate, totals: { date: "x", calories: 200, proteinG: 9, totalCarbG: 24, totalFatG: 8 } });
    expect(texts(root).flat().join(" ")).not.toMatch(/est\./);
  });

  describe("merged search (device history + cached dish catalog + OpenFoodFacts, one box)", () => {
    function historyEntry(dishName: string, hallTid: number, calories: number, loggedAt: string, servings = 1): LogEntry {
      return {
        id: `${dishName}-${loggedAt}`,
        loggedAt,
        source: { type: "umass-menu", dishName, hallTid },
        servings,
        nutrition: { ...DISH.nutrition, calories },
      };
    }

    it("surfaces a dish that only matches local device history, tagged UMass, and stages it via onAddHistoryDish", async () => {
      const storage = await logStorageWith([historyEntry("Falafel Wrap", 3, 350, "2026-08-01T12:00:00.000Z")]);
      const onAddHistoryDish = jest.fn();
      const onAddOffResult = jest.fn();
      const root = renderSheet({ logStorage: storage, hallTid: 3, onAddHistoryDish, onAddOffResult });

      await runSearch(root, "falafel");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Falafel Wrap/);
      expect(body).toMatch(/UMass/);
      expect(body).not.toMatch(/Packaged/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add Falafel Wrap to plate (UMass)" }).props.onPress();
      });
      expect(onAddHistoryDish).toHaveBeenCalledWith({ dishName: "Falafel Wrap", hallTid: 3, nutrition: { ...DISH.nutrition, calories: 350 } });
      expect(onAddOffResult).not.toHaveBeenCalled();
    });

    it("surfaces a dish that only matches the cached dish catalog, tagged UMass, scoped to the currently-browsed hall", async () => {
      mockedSearchCachedDishes.mockReturnValue([
        { dishName: "Miso Ramen", nutrition: { ...DISH.nutrition, calories: 420 }, allergens: [], dietTags: [], updatedAt: "x" },
      ]);
      const onAddHistoryDish = jest.fn();
      const root = renderSheet({ hallTid: 4, onAddHistoryDish });

      await runSearch(root, "ramen");
      expect(mockedSearchCachedDishes).toHaveBeenCalledWith(null, "ramen");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Miso Ramen/);
      expect(body).toMatch(/UMass/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add Miso Ramen to plate (UMass)" }).props.onPress();
      });
      // Catalog-only hit becomes a HistoryDish scoped to the currently-browsed hall (4) -- flows
      // through the existing onAddHistoryDish path unchanged, no separate catalog-add callback.
      expect(onAddHistoryDish).toHaveBeenCalledWith({ dishName: "Miso Ramen", hallTid: 4, nutrition: { ...DISH.nutrition, calories: 420 } });
    });

    it("when a dish matches both local history and the cached catalog, renders only one row, tagged UMass, using history's nutrition", async () => {
      const storage = await logStorageWith([historyEntry("Pizza", 1, 210, "2026-08-01T12:00:00.000Z")]);
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Pizza", nutrition: { ...DISH.nutrition, calories: 999 }, allergens: [], dietTags: [], updatedAt: "x" }]);
      const onAddHistoryDish = jest.fn();
      const root = renderSheet({ logStorage: storage, hallTid: 1, onAddHistoryDish });

      await runSearch(root, "pizza");

      const pizzaRows = texts(root)
        .flat()
        .filter((t) => typeof t === "string" && t.includes("Pizza"));
      expect(pizzaRows).toHaveLength(1);
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/210/); // history's nutrition wins
      expect(body).not.toMatch(/999/); // catalog's nutrition discarded on collision

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add Pizza to plate (UMass)" }).props.onPress();
      });
      expect(onAddHistoryDish).toHaveBeenCalledWith({ dishName: "Pizza", hallTid: 1, nutrition: { ...DISH.nutrition, calories: 210 } });
    });

    it("surfaces a dish that only matches OpenFoodFacts, tagged Packaged, and stages it via onAddOffResult", async () => {
      mockedSearchProducts.mockResolvedValue([{ barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } }]);
      const onAddOffResult = jest.fn();
      const onAddHistoryDish = jest.fn();
      const root = renderSheet({ onAddOffResult, onAddHistoryDish });

      await runSearch(root, "trail mix");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Trail Mix/);
      expect(body).toMatch(/Packaged/);
      expect(body).not.toMatch(/UMass/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add Trail Mix to plate (packaged)" }).props.onPress();
      });
      expect(onAddOffResult).toHaveBeenCalledWith({ barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } });
      expect(onAddHistoryDish).not.toHaveBeenCalled();
    });

    it("shows No matches when none of the three sources return anything", async () => {
      const root = renderSheet();
      await runSearch(root, "nonexistent");
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/No matches/);
      expect(body).not.toMatch(/UMass/);
      expect(body).not.toMatch(/Packaged/);
    });

    it("never surfaces an OFF-sourced past log entry from local history", async () => {
      const storage: LogStorage = new InMemoryLogStorage();
      await storage.addEntry({
        id: "off-1",
        loggedAt: "2026-08-01T12:00:00.000Z",
        source: { type: "off", barcode: "123", productName: "Trail Mix From History" },
        servings: 1,
        nutrition: { ...DISH.nutrition, calories: 150 },
      });
      const root = renderSheet({ logStorage: storage });

      await runSearch(root, "trail mix from history");

      const body = texts(root).flat().join(" ");
      expect(body).not.toMatch(/Trail Mix From History/);
      expect(body).toMatch(/No matches/);
    });

    // #344 review: dedup used to be hall-agnostic -- a dish logged at a different hall than the one
    // currently open could still surface and, if picked, would restage against ITS original hallTid
    // rather than the hall being browsed.
    it("never surfaces a dish logged at a different hall than the one currently being browsed", async () => {
      const storage = await logStorageWith([historyEntry("Curry Bowl", 2, 200, "2026-08-01T12:00:00.000Z")]);
      const root = renderSheet({ logStorage: storage, hallTid: 1 }); // logged at hallTid 2, browsing hallTid 1

      await runSearch(root, "curry");

      const body = texts(root).flat().join(" ");
      expect(body).not.toMatch(/Curry Bowl/);
      expect(body).toMatch(/No matches/);
    });

    it("shows the existing 'Search failed' text only when all three sources fail", async () => {
      mockedSearchProducts.mockRejectedValue(new Error("off down"));
      const storage: LogStorage = new InMemoryLogStorage();
      const failingStorage: LogStorage = { ...storage, getAllEntries: () => Promise.reject(new Error("db down")) } as LogStorage;
      mockedSearchCachedDishes.mockImplementation(() => {
        throw new Error("catalog down");
      });
      const root = renderSheet({ logStorage: failingStorage });

      await runSearch(root, "anything");

      expect(texts(root).flat().join(" ")).toMatch(/Search failed/);
    });
  });
});
