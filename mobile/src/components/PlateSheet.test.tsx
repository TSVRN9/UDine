// PlateSheet reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx). It also now touches Supabase (dishCatalog's background refresh) -- explicit
// factories, not bare automocks, same reasoning as homePane.test.tsx: automock still imports the
// real module to derive its shape, and the real ../lib/supabase drags in native bindings
// unavailable outside jest-expo's native harness.
import renderer, { act } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { InMemoryLogStorage, searchBrandedFoods, searchFoods, searchProducts, type CustomFoodsStorage, type LogEntry, type LogStorage, type MenuItem } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { Button } from "./ui";
import { menuItemToPlateEntry, offResultToPlateEntry, type PlateSearchResult } from "../lib/plate";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";
import { searchCustomFoods } from "../lib/customFoodsStorage";
import { lookupDishLive } from "../lib/lookupDish";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../lib/supabase", () => ({ supabase: {} }));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  searchProducts: jest.fn(),
  searchFoods: jest.fn(),
  searchBrandedFoods: jest.fn(),
}));

jest.mock("../lib/dishCatalog", () => ({
  getCachedDishCatalog: jest.fn(),
  refreshDishCatalogIfStale: jest.fn(),
  searchCachedDishes: jest.fn(),
}));

jest.mock("../lib/customFoodsStorage", () => ({
  searchCustomFoods: jest.fn(),
}));

jest.mock("../lib/lookupDish", () => ({
  ...jest.requireActual("../lib/lookupDish"),
  lookupDishLive: jest.fn(),
}));

const mockedSearchProducts = searchProducts as jest.Mock;
const mockedSearchFoods = searchFoods as jest.Mock;
const mockedSearchBrandedFoods = searchBrandedFoods as jest.Mock;
const mockedGetCachedDishCatalog = getCachedDishCatalog as jest.Mock;
const mockedRefreshDishCatalogIfStale = refreshDishCatalogIfStale as jest.Mock;
const mockedSearchCachedDishes = searchCachedDishes as jest.Mock;
const mockedSearchCustomFoods = searchCustomFoods as jest.Mock;
const mockedLookupDishLive = lookupDishLive as jest.Mock;

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

// #382: the search box starts hidden behind an idle "Add something else" row. Call this once,
// OUTSIDE any surrounding act() the caller is about to open, before using searchInput() below --
// nesting this act() inside another one defers the flush to the outer act's completion, so a
// same-call findByProps right after would still see the pre-tap tree.
function ensureSearchExpanded(root: renderer.ReactTestRenderer) {
  if (root.root.findAllByProps({ placeholder: "Search for a food" }).length === 0) {
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
    });
  }
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

function fakeCustomFoodsStorage(): CustomFoodsStorage {
  return { addCustomFood: jest.fn(), removeCustomFood: jest.fn(), getAllCustomFoods: jest.fn().mockResolvedValue([]) };
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
        customFoodsStorage={fakeCustomFoodsStorage()}
        hallTid={1}
        onStep={() => {}}
        onSetCount={() => {}}
        onShowResultDetail={() => {}}
        onOpenCustomFoodForm={() => {}}
        onLog={() => {}}
        onClose={() => {}}
        {...overrides}
      />,
    );
  });
  return root;
}

async function runSearch(root: renderer.ReactTestRenderer, q: string) {
  ensureSearchExpanded(root);
  act(() => {
    searchInput(root).props.onChangeText(q);
  });
  await act(async () => {
    searchInput(root).props.onSubmitEditing();
  });
}

beforeEach(() => {
  mockedSearchProducts.mockReset().mockResolvedValue({ results: [], hasMore: false });
  mockedSearchFoods.mockReset().mockResolvedValue({ results: [], hasMore: false });
  mockedSearchBrandedFoods.mockReset().mockResolvedValue({ results: [], hasMore: false });
  mockedGetCachedDishCatalog.mockReset().mockResolvedValue(null);
  mockedRefreshDishCatalogIfStale.mockReset().mockResolvedValue(undefined);
  mockedSearchCachedDishes.mockReset().mockReturnValue([]);
  mockedSearchCustomFoods.mockReset().mockReturnValue([]);
  mockedLookupDishLive.mockReset();
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

  it("renders a fractional count as a decimal (1.5), not a whole-number-only display", () => {
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 1.5 }];
    const root = renderSheet({ plate });
    expect(texts(root).flat().join(" ")).toMatch(/1\.5/);
  });

  it("tapping the count opens an editable field seeded with the current value; submitting an exact decimal calls onSetCount", () => {
    const onSetCount = jest.fn();
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 2 }];
    const root = renderSheet({ plate, onSetCount });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Edit servings for Pizza" }).props.onPress();
    });
    const field = root.root.findByProps({ accessibilityLabel: "Servings for Pizza" });
    expect(field.props.value).toBe("2");

    act(() => {
      field.props.onChangeText("2.5");
    });
    act(() => {
      field.props.onSubmitEditing();
    });

    expect(onSetCount).toHaveBeenCalledWith(plate[0].key, 2.5);
  });

  it("blurring with invalid or empty text leaves the count unchanged (doesn't call onSetCount, doesn't delete the row)", () => {
    const onSetCount = jest.fn();
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 2 }];
    const root = renderSheet({ plate, onSetCount });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Edit servings for Pizza" }).props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Servings for Pizza" }).props.onChangeText("");
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Servings for Pizza" }).props.onBlur();
    });

    expect(onSetCount).not.toHaveBeenCalled();
  });

  it("starting to edit a second row commits whatever was typed into the row being left", () => {
    const onSetCount = jest.fn();
    const pizza = { ...menuItemToPlateEntry(DISH), count: 1 };
    const salad = { ...menuItemToPlateEntry({ ...DISH, dishName: "Salad" }), count: 1 };
    const root = renderSheet({ plate: [pizza, salad], onSetCount });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Edit servings for Pizza" }).props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Servings for Pizza" }).props.onChangeText("1.5");
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Edit servings for Salad" }).props.onPress();
    });

    expect(onSetCount).toHaveBeenCalledWith(pizza.key, 1.5);
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
    ensureSearchExpanded(root);

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
      resolveFirst({ results: [], hasMore: false });
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
      root = renderer.create(
        <PlateSheet
          visible
          plate={[]}
          totals={ZERO_TOTALS}
          logStorage={emptyLogStorage()}
          customFoodsStorage={fakeCustomFoodsStorage()}
          hallTid={1}
          onStep={() => {}}
          onSetCount={() => {}}
          onShowResultDetail={() => {}}
          onOpenCustomFoodForm={() => {}}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    await runSearch(root, "a"); // stale search now in flight (unresolved)

    // Sheet closes before the stale search resolves...
    act(() => {
      root.update(
        <PlateSheet
          visible={false}
          plate={[]}
          totals={ZERO_TOTALS}
          logStorage={emptyLogStorage()}
          customFoodsStorage={fakeCustomFoodsStorage()}
          hallTid={1}
          onStep={() => {}}
          onSetCount={() => {}}
          onShowResultDetail={() => {}}
          onOpenCustomFoodForm={() => {}}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    // ...then reopens, and the user runs a different, faster search.
    mockedSearchProducts.mockResolvedValueOnce({ results: [{ barcode: "999", productName: "Banana Chips", nutrition: DISH.nutrition }], hasMore: false });
    act(() => {
      root.update(
        <PlateSheet
          visible
          plate={[]}
          totals={ZERO_TOTALS}
          logStorage={emptyLogStorage()}
          customFoodsStorage={fakeCustomFoodsStorage()}
          hallTid={1}
          onStep={() => {}}
          onSetCount={() => {}}
          onShowResultDetail={() => {}}
          onOpenCustomFoodForm={() => {}}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    await runSearch(root, "banana");
    expect(texts(root).flat().join(" ")).toMatch(/Banana Chips/);

    // The stale first search finally resolves -- must not clobber the fresh results now showing.
    await act(async () => {
      resolveStale({ results: [{ barcode: "1", productName: "STALE RESULT", nutrition: DISH.nutrition }], hasMore: false });
      await Promise.resolve();
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Banana Chips/);
    expect(body).not.toMatch(/STALE RESULT/);
  });

  it("flags a per-100g-estimated OFF result on both the search-result row and once it's a plate row", async () => {
    mockedSearchProducts.mockResolvedValue({
      results: [{ barcode: "999", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150, servingSize: "per 100g" } }],
      hasMore: false,
    });
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

  describe("merged search (device history + cached dish catalog + OpenFoodFacts + USDA FDC + custom foods, one box)", () => {
    function historyEntry(dishName: string, hallTid: number, calories: number, loggedAt: string, servings = 1): LogEntry {
      return {
        id: `${dishName}-${loggedAt}`,
        loggedAt,
        source: { type: "umass-menu", dishName, hallTid },
        servings,
        nutrition: { ...DISH.nutrition, calories },
      };
    }

    // Tapping any result now opens the shared NutritionLabel confirm/detail step (routed via
    // onShowResultDetail, lifted to the caller -- see halls/[slug].tsx) instead of adding straight
    // to the plate (#91 follow-on).

    it("surfaces a dish that only matches local device history, tagged UMass, and routes a tap through onShowResultDetail", async () => {
      const storage = await logStorageWith([historyEntry("Falafel Wrap", 3, 350, "2026-08-01T12:00:00.000Z")]);
      const onShowResultDetail = jest.fn();
      const root = renderSheet({ logStorage: storage, hallTid: 3, onShowResultDetail });

      await runSearch(root, "falafel");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Falafel Wrap/);
      expect(body).toMatch(/UMass/);
      expect(body).not.toMatch(/Packaged/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "View Falafel Wrap (UMass)" }).props.onPress();
      });
      const expected: PlateSearchResult = { kind: "umass", dish: { dishName: "Falafel Wrap", hallTid: 3, nutrition: { ...DISH.nutrition, calories: 350 } } };
      expect(onShowResultDetail).toHaveBeenCalledWith(expected);
    });

    it("surfaces a dish that only matches the cached dish catalog, tagged UMass, scoped to the currently-browsed hall", async () => {
      mockedSearchCachedDishes.mockReturnValue([
        { dishName: "Miso Ramen", nutrition: { ...DISH.nutrition, calories: 420 }, allergens: [], dietTags: [], updatedAt: "x" },
      ]);
      const onShowResultDetail = jest.fn();
      const root = renderSheet({ hallTid: 4, onShowResultDetail });

      await runSearch(root, "ramen");
      expect(mockedSearchCachedDishes).toHaveBeenCalledWith(null, "ramen");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Miso Ramen/);
      expect(body).toMatch(/UMass/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "View Miso Ramen (UMass)" }).props.onPress();
      });
      // Catalog-only hit becomes a HistoryDish scoped to the currently-browsed hall (4).
      const expected: PlateSearchResult = { kind: "umass", dish: { dishName: "Miso Ramen", hallTid: 4, nutrition: { ...DISH.nutrition, calories: 420 } } };
      expect(onShowResultDetail).toHaveBeenCalledWith(expected);
    });

    it("when a dish matches both local history and the cached catalog, renders only one row, tagged UMass, using history's nutrition", async () => {
      const storage = await logStorageWith([historyEntry("Pizza", 1, 210, "2026-08-01T12:00:00.000Z")]);
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Pizza", nutrition: { ...DISH.nutrition, calories: 999 }, allergens: [], dietTags: [], updatedAt: "x" }]);
      const root = renderSheet({ logStorage: storage, hallTid: 1 });

      await runSearch(root, "pizza");

      const pizzaRows = texts(root)
        .flat()
        .filter((t) => typeof t === "string" && t.includes("Pizza"));
      expect(pizzaRows).toHaveLength(1);
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/210/); // history's nutrition wins
      expect(body).not.toMatch(/999/); // catalog's nutrition discarded on collision
    });

    it("surfaces a dish that only matches OpenFoodFacts, tagged Packaged, and routes a tap through onShowResultDetail", async () => {
      mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } }], hasMore: false });
      const onShowResultDetail = jest.fn();
      const root = renderSheet({ onShowResultDetail });

      await runSearch(root, "trail mix");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Trail Mix/);
      expect(body).toMatch(/Packaged/);
      // Exact-string check (not a substring match on the whole body) -- the new "Search UMass
      // Dining directly" fallback affordance legitimately contains the word "UMass" too, since
      // this search found no umass-kind result; only the UMass *badge* text itself must be absent.
      expect(texts(root).flat()).not.toContain("UMass");

      act(() => {
        root.root.findByProps({ accessibilityLabel: "View Trail Mix (Packaged)" }).props.onPress();
      });
      const expected: PlateSearchResult = { kind: "off", product: { barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } } };
      expect(onShowResultDetail).toHaveBeenCalledWith(expected);
    });

    it("surfaces a hit that only matches USDA FoodData Central, tagged USDA, and routes a tap through onShowResultDetail", async () => {
      mockedSearchFoods.mockResolvedValue({ results: [{ fdcId: "173944", productName: "Banana, raw", nutrition: { ...DISH.nutrition, calories: 89 } }], hasMore: false });
      const onShowResultDetail = jest.fn();
      const root = renderSheet({ onShowResultDetail });

      await runSearch(root, "banana");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Banana, raw/);
      expect(body).toMatch(/USDA/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "View Banana, raw (USDA)" }).props.onPress();
      });
      const expected: PlateSearchResult = { kind: "usda", food: { fdcId: "173944", productName: "Banana, raw", nutrition: { ...DISH.nutrition, calories: 89 } } };
      expect(onShowResultDetail).toHaveBeenCalledWith(expected);
    });

    it("surfaces a Branded (USDA FDC) hit alongside a Foundation/SR-Legacy hit, both tagged USDA", async () => {
      mockedSearchFoods.mockResolvedValue({ results: [{ fdcId: "173944", productName: "Banana, raw", nutrition: { ...DISH.nutrition, calories: 89 } }], hasMore: false });
      mockedSearchBrandedFoods.mockResolvedValue({ results: [{ fdcId: "2001", productName: "Cheerios", nutrition: { ...DISH.nutrition, calories: 380 } }], hasMore: false });
      const onShowResultDetail = jest.fn();
      const root = renderSheet({ onShowResultDetail });

      await runSearch(root, "cheerios");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Banana, raw/);
      expect(body).toMatch(/Cheerios/);
      expect(texts(root).flat().filter((t) => t === "USDA")).toHaveLength(2);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "View Cheerios (USDA)" }).props.onPress();
      });
      const expected: PlateSearchResult = { kind: "usda", food: { fdcId: "2001", productName: "Cheerios", nutrition: { ...DISH.nutrition, calories: 380 } } };
      expect(onShowResultDetail).toHaveBeenCalledWith(expected);
    });

    it("surfaces a saved custom food as the 4th source, tagged Custom, and routes a tap through onShowResultDetail", async () => {
      const customFood = { id: "c1", name: "Grandma's Lasagna", servingSize: "1 slice", nutrition: { ...DISH.nutrition, calories: 420 } };
      mockedSearchCustomFoods.mockReturnValue([customFood]);
      const onShowResultDetail = jest.fn();
      const root = renderSheet({ onShowResultDetail });

      await runSearch(root, "lasagna");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Grandma's Lasagna/);
      expect(body).toMatch(/Custom/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "View Grandma's Lasagna (Custom)" }).props.onPress();
      });
      const expected: PlateSearchResult = { kind: "custom", food: customFood };
      expect(onShowResultDetail).toHaveBeenCalledWith(expected);
    });

    it("shows No matches when none of the 4 sources return anything", async () => {
      const root = renderSheet();
      await runSearch(root, "nonexistent");
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/No matches/);
      // Exact-string check, not substring -- "Search UMass Dining directly" legitimately appears
      // here too (this search found no umass-kind result); only the UMass *badge* must be absent.
      expect(texts(root).flat()).not.toContain("UMass");
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

    it("shows the existing 'Search failed' text only when every source fails", async () => {
      mockedSearchProducts.mockRejectedValue(new Error("off down"));
      mockedSearchFoods.mockRejectedValue(new Error("usda down"));
      const storage: LogStorage = new InMemoryLogStorage();
      const failingStorage: LogStorage = { ...storage, getAllEntries: () => Promise.reject(new Error("db down")) } as LogStorage;
      mockedSearchCachedDishes.mockImplementation(() => {
        throw new Error("catalog down");
      });
      const failingCustomFoodsStorage: CustomFoodsStorage = { ...fakeCustomFoodsStorage(), getAllCustomFoods: () => Promise.reject(new Error("custom down")) };
      const root = renderSheet({ logStorage: failingStorage, customFoodsStorage: failingCustomFoodsStorage });

      await runSearch(root, "anything");

      expect(texts(root).flat().join(" ")).toMatch(/Search failed/);
    });

    // pr-reviewer finding on #351: `allFailed` required ALL sources to reject before surfacing an
    // error -- if OFF rejected (e.g. network down) while every other source legitimately resolved
    // empty (the common case for a dish nobody's logged/cached/created yet), the merged result was
    // an empty array and the sheet rendered "No matches", telling the user their food doesn't exist
    // when the real problem is the search didn't complete.
    it("#351 review: shows the failure text, not 'No matches', when OFF rejects and every other source resolves empty", async () => {
      mockedSearchProducts.mockRejectedValue(new Error("network down"));
      const root = renderSheet(); // everything else resolves empty

      await runSearch(root, "anything");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Search failed/);
      expect(body).not.toMatch(/No matches/);
    });

    // A rejection alongside a real hit from a surviving source is NOT treated as a failure -- the
    // user still got something useful, so the sheet shows it plainly rather than pairing a real
    // result with confusing error text.
    it("#351 review: still shows a real hit from a surviving source when OFF rejects, without an error message", async () => {
      mockedSearchProducts.mockRejectedValue(new Error("network down"));
      const storage = await logStorageWith([historyEntry("Falafel Wrap", 1, 350, "2026-08-01T12:00:00.000Z")]);
      const root = renderSheet({ logStorage: storage, hallTid: 1 });

      await runSearch(root, "falafel");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Falafel Wrap/);
      expect(body).not.toMatch(/Search failed/);
    });

    // The all-rejected-with-nothing-usable branch must not strand the user: it's the exact moment
    // they most need the "Create a custom food" escape hatch, and it must never leak the raw
    // exception text (e.g. a UnknownHostException from a rate-limited source).
    it("keeps the custom-food footer available and hides the raw exception when every source fails", async () => {
      mockedSearchProducts.mockRejectedValue(new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "api.nal.usda.gov"'));
      mockedSearchFoods.mockRejectedValue(new Error('fetch failed: java.net.UnknownHostException: Unable to resolve host "api.nal.usda.gov"'));
      const failingStorage: LogStorage = { ...new InMemoryLogStorage(), getAllEntries: () => Promise.reject(new Error("db down")) } as LogStorage;
      mockedSearchCachedDishes.mockImplementation(() => {
        throw new Error("catalog down");
      });
      const failingCustomFoodsStorage: CustomFoodsStorage = { ...fakeCustomFoodsStorage(), getAllCustomFoods: () => Promise.reject(new Error("custom down")) };
      const root = renderSheet({ logStorage: failingStorage, customFoodsStorage: failingCustomFoodsStorage });

      await runSearch(root, "anything");

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Search failed/);
      expect(body).not.toMatch(/UnknownHostException/);
      expect(body).toMatch(/Create a custom food/);
    });
  });

  // Bug report: a long dish/product name pushed the kind badge (UMass/Custom/Packaged/USDA)
  // clean off the row's right edge instead of wrapping around it -- reproduced on-device with
  // e.g. "Buffalo Chicken Salad w/Blue Cheese Dressing" and confirmed against the live design
  // canvas (docs/design/PlateSheetResults.dc.html, unchanged from upstream) that no icon/overflow
  // handling was ever specified there for this case.
  it("lets a long dish name shrink/wrap instead of pushing its kind badge off the row", async () => {
    mockedSearchCachedDishes.mockReturnValue([
      { dishName: "Buffalo Chicken Salad w/Blue Cheese Dressing", nutrition: { ...DISH.nutrition, calories: 322 }, allergens: [], dietTags: [], updatedAt: "x" },
    ]);
    const root = renderSheet();

    await runSearch(root, "buffalo");

    const { StyleSheet } = require("react-native");
    const label = root.root.findAll(
      (n) => n.type === Text && Array.isArray(n.props.children) === false && n.props.children === "Buffalo Chicken Salad w/Blue Cheese Dressing",
    )[0];
    const flat = StyleSheet.flatten(label.props.style);
    expect(flat.flexShrink).toBe(1);
  });

  describe("idle search state (#382)", () => {
    it("starts idle with 'Add something else', not a live search box, until tapped", () => {
      const root = renderSheet();
      expect(texts(root).flat().join(" ")).toMatch(/Add something else/);
      expect(() => root.root.findByProps({ placeholder: "Search for a food" })).toThrow();

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
      });

      expect(root.root.findByProps({ placeholder: "Search for a food" })).toBeTruthy();
    });

    // Bug report: tapping "Add something else" swapped in the search box unfocused, so the user
    // had to tap it a second time before the keyboard appeared. On-device verification (uiautomator
    // dump + dumpsys input_method) showed the declarative `autoFocus` prop doesn't actually request
    // focus for a TextInput newly mounted by a re-render inside an already-open Modal -- the native
    // EditText never gained input focus and no keyboard appeared, though a manual second tap on the
    // same field focused it instantly. PlateSheet.tsx now calls searchInputRef.current.focus()
    // imperatively instead (deferred one frame via requestAnimationFrame, to give Android time to
    // finish attaching/laying out the newly-mounted view). `ref.current` on a real RN TextInput is
    // its own class instance, not the host node createNodeMock stands in for, so this spies directly
    // on the class method instead.
    it("imperatively focuses the search box the instant it's revealed, not requiring a second tap", async () => {
      const focusSpy = jest.spyOn(TextInput.prototype, "focus").mockImplementation(() => {});
      const root = renderSheet();

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      // Checked by instance, not raw call count: TextInput.prototype.focus is one method shared by
      // every TextInput instance in the process, and other tests in this file leave their own
      // requestAnimationFrame-deferred focus() calls pending (none of these tests unmount their
      // renderer), so they can fire during this same await and inflate a plain call count.
      const searchInputInstance = searchInput(root).instance;
      expect(focusSpy.mock.instances).toContain(searchInputInstance);
      focusSpy.mockRestore();
    });

    // #409: addSection's dashed border (docs/design/PlateExpanded.dc.html:87) is idle-only --
    // once expanded it must switch to the plain solid border the artboard specifies for the
    // active search row (docs/design/PlateSheetResults.dc.html:35), not stay dashed around the
    // whole search UI.
    it("#409: addSection is dashed maroon while idle, and switches to a solid border once expanded", () => {
      const { StyleSheet } = require("react-native");
      const { colors, withOpacity } = require("../lib/theme");
      const root = renderSheet();

      // addSection is the only style in this component with a minHeight -- a stable marker
      // regardless of which other style objects are composed alongside it.
      const findAddSection = () =>
        root.root.findAll((n) => {
          const flat = StyleSheet.flatten(n.props.style);
          return !!flat && flat.minHeight !== undefined;
        })[0];

      const idleFlat = StyleSheet.flatten(findAddSection().props.style);
      expect(idleFlat.borderStyle).toBe("dashed");
      expect(idleFlat.borderColor).toBe(withOpacity(colors.maroon600, 45));

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
      });

      const expandedFlat = StyleSheet.flatten(findAddSection().props.style);
      expect(expandedFlat.borderStyle).not.toBe("dashed");
      expect(expandedFlat.borderColor).toBe(withOpacity(colors.ink900, 20));
    });
  });

  describe("OFF/USDA/Branded pagination (Load more)", () => {
    it("shows a Load more button when any of OFF/USDA/Branded reports hasMore, and pages all three on tap", async () => {
      mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "1", productName: "Off Page 1", nutrition: DISH.nutrition }], hasMore: true });
      mockedSearchFoods.mockResolvedValue({ results: [{ fdcId: "1", productName: "Usda Page 1", nutrition: DISH.nutrition }], hasMore: true });
      mockedSearchBrandedFoods.mockResolvedValue({ results: [{ fdcId: "b1", productName: "Branded Page 1", nutrition: DISH.nutrition }], hasMore: true });
      const root = renderSheet();
      await runSearch(root, "chicken");

      expect(texts(root).flat().join(" ")).toMatch(/Load 20 More/);

      mockedSearchProducts.mockResolvedValueOnce({ results: [{ barcode: "2", productName: "Off Page 2", nutrition: DISH.nutrition }], hasMore: false });
      mockedSearchFoods.mockResolvedValueOnce({ results: [{ fdcId: "2", productName: "Usda Page 2", nutrition: DISH.nutrition }], hasMore: false });
      mockedSearchBrandedFoods.mockResolvedValueOnce({ results: [{ fdcId: "b2", productName: "Branded Page 2", nutrition: DISH.nutrition }], hasMore: false });

      await act(async () => {
        root.root.findByProps({ children: "Load 20 More" }).props.onPress();
        await Promise.resolve();
      });

      expect(mockedSearchProducts).toHaveBeenCalledWith("chicken", 2);
      expect(mockedSearchFoods).toHaveBeenCalledWith("chicken", 2);
      expect(mockedSearchBrandedFoods).toHaveBeenCalledWith("chicken", 2);
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Off Page 1/);
      expect(body).toMatch(/Off Page 2/);
      expect(body).toMatch(/Usda Page 1/);
      expect(body).toMatch(/Usda Page 2/);
      expect(body).toMatch(/Branded Page 1/);
      expect(body).toMatch(/Branded Page 2/);
      // All three sources reported hasMore:false on their 2nd page -- button gone.
      expect(body).not.toMatch(/Load 20 More/);
    });

    it("does not show Load more when none of OFF/USDA/Branded has more", async () => {
      const root = renderSheet();
      await runSearch(root, "chicken");
      expect(texts(root).flat().join(" ")).not.toMatch(/Load 20 More/);
    });
  });

  // Bug report: all 6 search sources merge with zero display cap, so a single search could
  // legitimately render 40-60+ rows at once. These assert the DISPLAY of `merged` is capped
  // regardless of how much any one source actually returned, and that "Load More" reveals
  // already-fetched rows before ever spending a network round-trip on an exhausted source.
  describe("capped result display (owner: 'maybe 5 at a time')", () => {
    function offResult(n: number) {
      return { barcode: `off-${n}`, productName: `Off Match ${n}`, nutrition: DISH.nutrition };
    }

    it("renders only 5 of a much larger merged result set on the first search", async () => {
      mockedSearchProducts.mockResolvedValue({ results: Array.from({ length: 12 }, (_, i) => offResult(i)), hasMore: false });
      const root = renderSheet();
      await runSearch(root, "off");

      const shown = texts(root)
        .flat()
        .filter((t) => typeof t === "string" && t.startsWith("Off Match"));
      expect(shown).toHaveLength(5);
      expect(texts(root).flat().join(" ")).toMatch(/Load 5 More/);
    });

    it("Load More reveals more of the already-fetched buffer without calling any search source again", async () => {
      mockedSearchProducts.mockResolvedValue({ results: Array.from({ length: 12 }, (_, i) => offResult(i)), hasMore: false });
      const root = renderSheet();
      await runSearch(root, "off");
      expect(mockedSearchProducts).toHaveBeenCalledTimes(1);

      await act(async () => {
        root.root.findByProps({ children: "Load 5 More" }).props.onPress();
        await Promise.resolve();
      });

      const shown = texts(root)
        .flat()
        .filter((t) => typeof t === "string" && t.startsWith("Off Match"));
      expect(shown).toHaveLength(10);
      // Still just the one call from the initial search -- revealing more of an already-fetched
      // buffer must not re-fetch anything.
      expect(mockedSearchProducts).toHaveBeenCalledTimes(1);
      expect(texts(root).flat().join(" ")).toMatch(/Load 2 More/); // 2 of the 12 remain hidden
    });

    it("only hits the network for a new page once the visible buffer has caught up to what's already fetched", async () => {
      mockedSearchProducts.mockResolvedValue({ results: Array.from({ length: 5 }, (_, i) => offResult(i)), hasMore: true });
      const root = renderSheet();
      await runSearch(root, "off"); // exactly 5 fetched, all 5 visible -- buffer is caught up already

      expect(texts(root).flat().join(" ")).toMatch(/Load 20 More/); // no hidden buffer -- next tap must fetch

      mockedSearchProducts.mockResolvedValueOnce({ results: [offResult(100)], hasMore: false });
      await act(async () => {
        root.root.findByProps({ children: "Load 20 More" }).props.onPress();
        await Promise.resolve();
      });

      expect(mockedSearchProducts).toHaveBeenCalledWith("off", 2);
      const shown = texts(root)
        .flat()
        .filter((t) => typeof t === "string" && t.startsWith("Off Match"));
      expect(shown).toHaveLength(6); // the 5 already visible plus the one newly-fetched result
    });

    it("does not show 'No matches' when there are matches, just none visible yet beyond the cap", async () => {
      mockedSearchProducts.mockResolvedValue({ results: Array.from({ length: 8 }, (_, i) => offResult(i)), hasMore: false });
      const root = renderSheet();
      await runSearch(root, "off");
      expect(texts(root).flat().join(" ")).not.toMatch(/No matches/);
    });
  });

  describe("custom food creation footer row", () => {
    it("shows the standing 'Create a custom food' row once a search has run, even with real matches", async () => {
      mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "1", productName: "Trail Mix", nutrition: DISH.nutrition }], hasMore: false });
      const root = renderSheet();
      await runSearch(root, "trail mix");
      expect(texts(root).flat().join(" ")).toMatch(/Create a custom food/);
    });

    it("shows the row on a genuinely empty result too", async () => {
      const root = renderSheet();
      await runSearch(root, "nonexistent");
      expect(texts(root).flat().join(" ")).toMatch(/Create a custom food/);
    });

    it("does not show the row before any search has run", () => {
      const root = renderSheet();
      expect(texts(root).flat().join(" ")).not.toMatch(/Create a custom food/);
    });

    it("tapping it calls onOpenCustomFoodForm with the current (trimmed) query", async () => {
      const onOpenCustomFoodForm = jest.fn();
      const root = renderSheet({ onOpenCustomFoodForm });
      await runSearch(root, "  Grandma's Lasagna  ");

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Create a custom food" }).props.onPress();
      });
      expect(onOpenCustomFoodForm).toHaveBeenCalledWith("Grandma's Lasagna");
    });
  });

  // Café-screen unification: an unmatched standing-menu row opens this sheet via `initialQuery`
  // instead of leaving a dead end -- the box must come up pre-filled AND already searched, not just
  // pre-typed for the user to press Search again.
  describe("initialQuery (café-screen unification: unmatched standing item -> search)", () => {
    it("seeds the search box and runs the search immediately when opened with an initialQuery", async () => {
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Bacon Croissant", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
      let root!: renderer.ReactTestRenderer;
      await act(async () => {
        root = renderer.create(
          <PlateSheet
            visible
            plate={[]}
            totals={ZERO_TOTALS}
            logStorage={emptyLogStorage()}
            customFoodsStorage={fakeCustomFoodsStorage()}
            hallTid={1}
            onStep={() => {}}
            onSetCount={() => {}}
            onShowResultDetail={() => {}}
            onOpenCustomFoodForm={() => {}}
            onLog={() => {}}
            onClose={() => {}}
            initialQuery="Bacon Croissant"
          />,
        );
      });

      expect(searchInput(root).props.value).toBe("Bacon Croissant");
      expect(mockedSearchCachedDishes).toHaveBeenCalledWith(null, "Bacon Croissant");
      expect(texts(root).flat()).toContain("Bacon Croissant");
    });

    it("does not seed anything when initialQuery is absent (the plain PlateBar-tap open)", () => {
      const root = renderSheet();
      // #382: nothing to seed also means the sheet stays idle -- no live search box at all until tapped.
      expect(root.root.findAllByProps({ placeholder: "Search for a food" })).toHaveLength(0);
      ensureSearchExpanded(root);
      expect(searchInput(root).props.value).toBe("");
      expect(mockedSearchCachedDishes).not.toHaveBeenCalled();
    });
  });

  describe("manual 'Search UMass Dining directly' fallback (lookup-dish)", () => {
    // Button is wrapped through several nested layers (Press/Pressable/View), each forwarding
    // accessibilityLabel/children via spread -- findByProps/findAllByProps match every layer that
    // carries the searched prop, not just the outer button, so a type+prop predicate restricted to
    // the composite Button instance itself is the only way to get an unambiguous single match.
    function directLookupButton(root: renderer.ReactTestRenderer) {
      return root.root.findAll((n) => n.type === Button && n.props.accessibilityLabel === "Search UMass Dining directly");
    }

    it("is hidden when the merged search already found a UMass result", async () => {
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Miso Ramen", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
      const root = renderSheet();
      await runSearch(root, "ramen");
      expect(directLookupButton(root)).toHaveLength(0);
    });

    it("appears once a search has run and found no UMass result, and never fires lookup-dish on its own", async () => {
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");
      expect(directLookupButton(root)).toHaveLength(1);
      expect(mockedLookupDishLive).not.toHaveBeenCalled();
    });

    it("tapping it merges a live hit into the results as an ordinary UMass row, staged to the CURRENTLY-BROWSED hall, not the candidate's own FoodPro location", async () => {
      // hallTid: -14 (a retail location, per lookup-dish/index.ts's hallTidForLocationNum) is
      // deliberately different from the browsed hall (1) below -- catches the exact regression
      // this test is named for: staging the candidate's own hallTid would misattribute
      // hall-completion/favorite-hall credit to a hall the user isn't browsing (or a negative
      // retail tid) once that syncs server-side. See the Props doc comment on `hallTid` and
      // runDirectLookup's own comment for why the catalog-search path already avoids this.
      mockedLookupDishLive.mockResolvedValue({
        status: "hit",
        candidates: [{ dishName: "Bacon", location: "", hallTid: -14, nutrition: { ...DISH.nutrition, calories: 140 }, allergens: [], dietTags: [] }],
      });
      const onShowResultDetail = jest.fn();
      const root = renderSheet({ hallTid: 1, onShowResultDetail });
      await runSearch(root, "Bacon");

      await act(async () => {
        directLookupButton(root)[0].props.onPress();
      });

      expect(mockedLookupDishLive).toHaveBeenCalledWith({}, "Bacon");
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Bacon/);
      expect(body).toMatch(/UMass/);
      expect(directLookupButton(root)).toHaveLength(0);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "View Bacon (UMass)" }).props.onPress();
      });
      const expected: PlateSearchResult = { kind: "umass", dish: { dishName: "Bacon", hallTid: 1, nutrition: { ...DISH.nutrition, calories: 140 } } };
      expect(onShowResultDetail).toHaveBeenCalledWith(expected);
    });

    it("disambiguates same-named candidates from different locations by appending the location", async () => {
      mockedLookupDishLive.mockResolvedValue({
        status: "hit",
        candidates: [
          { dishName: "Bacon", location: "Worcester Dining Commons", hallTid: 1, nutrition: DISH.nutrition, allergens: [], dietTags: [] },
          { dishName: "Bacon", location: "Franklin Dining Commons", hallTid: 2, nutrition: DISH.nutrition, allergens: [], dietTags: [] },
        ],
      });
      const root = renderSheet();
      await runSearch(root, "Bacon");
      await act(async () => {
        directLookupButton(root)[0].props.onPress();
      });
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Bacon \(Worcester Dining Commons\)/);
      expect(body).toMatch(/Bacon \(Franklin Dining Commons\)/);
    });

    it("renders an honest, plain 'no matches' state on a genuine miss, keeping the affordance for a retry", async () => {
      mockedLookupDishLive.mockResolvedValue({ status: "miss" });
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");
      await act(async () => {
        directLookupButton(root)[0].props.onPress();
      });
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/doesn.t have this dish either/);
      expect(directLookupButton(root)).toHaveLength(1);
    });

    it("renders an honest, plain rate-limited state -- not a crash, not a silent no-op", async () => {
      mockedLookupDishLive.mockResolvedValue({ status: "rate_limited" });
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");
      await act(async () => {
        directLookupButton(root)[0].props.onPress();
      });
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/busy right now|try again/i);
    });
  });
});
