// PlateSheet reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx). It also now touches Supabase (dishCatalog's background refresh) -- explicit
// factories, not bare automocks, same reasoning as homePane.test.tsx: automock still imports the
// real module to derive its shape, and the real ../lib/supabase drags in native bindings
// unavailable outside jest-expo's native harness.
import renderer, { act } from "react-test-renderer";
import { BackHandler, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import * as Reanimated from "react-native-reanimated";
import { InMemoryLogStorage, searchBrandedFoods, searchFoods, searchProducts, type CustomFoodsStorage, type LogEntry, type LogStorage, type MenuItem } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { Spinner } from "./Skeleton";
import Svg from "react-native-svg";
import { Button } from "./ui";
import { menuItemToPlateEntry, offResultToPlateEntry, type PlateSearchResult } from "../lib/plate";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";
import { searchCustomFoods } from "../lib/customFoodsStorage";
import { lookupDishLive } from "../lib/lookupDish";
import { artboardEnclosingStyle, artboardPanelGap, artboardStyle, normalizeColor } from "../lib/artboard";

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

// Shared across the "manual fallback" and "fetching/rate_limited inline states" describes below.
// Button is wrapped through several nested layers (Press/Pressable/View), each forwarding
// accessibilityLabel/children via spread -- a type+prop predicate restricted to the composite
// Button instance itself is the only way to get an unambiguous single match.
function directLookupButton(root: renderer.ReactTestRenderer) {
  return root.root.findAll((n) => n.type === Button && n.props.accessibilityLabel === "Search UMass Dining directly");
}

// testID alone double-matches (the composite View and its underlying host node both carry it) --
// filtering by the composite View type from 'react-native' collapses that to the one real row.
function lookupStateRow(root: renderer.ReactTestRenderer) {
  return root.root.findAll((n) => n.type === View && n.props.testID === "lookupStateRow");
}

// Same composite/host double-match reasoning as lookupStateRow above -- under the reanimated jest
// mock, Animated.View literally IS the real RN View (mock.ts: `View: ViewRN`), so a bare
// findAllByType(View) can't tell this wrapper apart from every other View in the tree either.
function keyboardFollowWrapper(root: renderer.ReactTestRenderer) {
  return root.root.findAll((n) => n.type === View && n.props.testID === "keyboardFollowWrapper");
}

// platesheet-search-panel-spacing-gap: the panel-level "gap between two direct sibling rows" this
// file otherwise never asserted (its "Root cause" section) -- every existing artboard-parity test
// here checks a row's own internal styling, none checks the rhythm BETWEEN rows. RN/Yoga adds a
// flex container's own `gap` to each child's own margin rather than collapsing them (the exact
// mechanism the brief's bug came from), so this sums both: `a`'s trailing margin, `b`'s leading
// margin, and, if they share a common ancestor, that ancestor's own `gap`.
//
// The shared-ancestor check tries the immediate parent AND the grandparent (not just one): every
// RN host component (View, Text, …) is actually two react-test-renderer instances stacked -- the
// forwardRef composite and the host node it renders -- so two literal JSX siblings can each be
// "one instance too deep" relative to each other depending which of that pair a caller's node
// happens to be. Trying both levels means callers don't have to know or count which.
function renderedGap(a: renderer.ReactTestInstance, b: renderer.ReactTestInstance): number {
  const { StyleSheet } = require("react-native");
  const aFlat = StyleSheet.flatten(a.props.style) ?? {};
  const bFlat = StyleSheet.flatten(b.props.style) ?? {};
  let parentGap = 0;
  for (const [pa, pb] of [
    [a.parent, b.parent],
    [a.parent?.parent, b.parent?.parent],
  ]) {
    if (pa && pa === pb) {
      const gap = (StyleSheet.flatten(pa.props.style) ?? {}).gap;
      if (typeof gap === "number") {
        parentGap = gap;
        break;
      }
    }
  }
  return (aFlat.marginBottom ?? 0) + parentGap + (bFlat.marginTop ?? 0);
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

  // Decision 5 (plate-search-semantics.md): a catalog refresh that resolves mid-search must
  // actually feed it, not just sync silently for the NEXT search.
  describe("live catalog refresh feeding an open search (decision 5)", () => {
    it("splices a newly-available umass hit into the still-open, still-matching search once the background refresh resolves", async () => {
      let resolveRefresh!: () => void;
      mockedRefreshDishCatalogIfStale.mockImplementation(() => new Promise<void>((resolve) => (resolveRefresh = resolve)));
      mockedSearchCachedDishes.mockReturnValue([]); // nothing locally cached yet
      const root = renderSheet();
      await runSearch(root, "ramen");
      expect(texts(root).flat().join(" ")).not.toMatch(/Miso Ramen/);

      // The catalog the background refresh just synced now has a match for the SAME open query.
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Miso Ramen", nutrition: { ...DISH.nutrition, calories: 420 }, allergens: [], dietTags: [], updatedAt: "x" }]);
      await act(async () => {
        resolveRefresh();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(texts(root).flat().join(" ")).toMatch(/Miso Ramen/);
    });

    it("visually distinguishes the newly-spliced row as just-arrived (a FadeIn entrance), with no new explanatory text", async () => {
      let resolveRefresh!: () => void;
      mockedRefreshDishCatalogIfStale.mockImplementation(() => new Promise<void>((resolve) => (resolveRefresh = resolve)));
      mockedSearchCachedDishes.mockReturnValue([]);
      const root = renderSheet();
      await runSearch(root, "ramen");

      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Miso Ramen", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
      await act(async () => {
        resolveRefresh();
        await Promise.resolve();
        await Promise.resolve();
      });

      // No new caption/label describing the mechanism -- just the ordinary row plus an entrance.
      expect(texts(root).flat()).not.toContain("New");
      expect(texts(root).flat().join(" ")).not.toMatch(/just arrived|new result|updated/i);
      const animatedRows = root.root.findAll((n) => n.type === View && Boolean(n.props.entering));
      expect(animatedRows).toHaveLength(1);
    });

    it("does not splice anything when no search is open (results === null)", async () => {
      let resolveRefresh!: () => void;
      mockedRefreshDishCatalogIfStale.mockImplementation(() => new Promise<void>((resolve) => (resolveRefresh = resolve)));
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Miso Ramen", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
      renderSheet(); // no search ever run -- results stays null

      await act(async () => {
        resolveRefresh();
        await Promise.resolve();
        await Promise.resolve();
      });
      // Nothing to assert on screen (search is still collapsed) -- the real assertion is that this
      // resolves without throwing (getCachedDishCatalog is never even called for an unopened search).
      expect(mockedGetCachedDishCatalog).not.toHaveBeenCalled();
    });

    it("a stale refresh resolution after the sheet closes is dropped, not repainted onto the closed sheet", async () => {
      let resolveRefresh!: () => void;
      mockedRefreshDishCatalogIfStale.mockImplementation(() => new Promise<void>((resolve) => (resolveRefresh = resolve)));
      mockedSearchCachedDishes.mockReturnValue([]);
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
      await runSearch(root, "ramen");

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

      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Miso Ramen", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
      await act(async () => {
        resolveRefresh();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(texts(root).flat().join(" ")).not.toMatch(/Miso Ramen/);
    });

    // The results list (and its rows' FadeIn `entering`) unmounts when the user taps Back to
    // idle and remounts fresh on re-expand -- without clearing "just arrived" there, a row
    // already seen once would replay its arrival animation every time the panel reopens.
    it("does not replay the just-arrived entrance after collapsing to idle (Back) and re-expanding", async () => {
      let resolveRefresh!: () => void;
      mockedRefreshDishCatalogIfStale.mockImplementation(() => new Promise<void>((resolve) => (resolveRefresh = resolve)));
      mockedSearchCachedDishes.mockReturnValue([]);
      const root = renderSheet();
      await runSearch(root, "ramen");

      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Miso Ramen", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
      await act(async () => {
        resolveRefresh();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(root.root.findAll((n) => n.type === View && Boolean(n.props.entering))).toHaveLength(1);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Back" }).props.onPress();
      });
      ensureSearchExpanded(root);

      expect(texts(root).flat().join(" ")).toMatch(/Miso Ramen/); // still there...
      expect(root.root.findAll((n) => n.type === View && Boolean(n.props.entering))).toHaveLength(0); // ...but not re-animated
    });
  });

  // platesheet-search-results-parity-gap task 1: the caller passes contextLabel as one already-
  // joined "<Hall> · <Meal>" string (halls/[slug].tsx via hallMenuTabs.ts's
  // plateSheetContextLabel, its own tests) -- this pins PlateSheet's own render of *whatever*
  // string it's handed against PlateSheetResults.dc.html:32's typography, so the label doesn't
  // silently drift out of its 12px/rgba(36,26,20,0.55) treatment independent of the join logic.
  it("renders contextLabel with the artboard's own type/color treatment", () => {
    const root = renderSheet({ contextLabel: "Hampshire · Lunch" });
    const label = root.root.findByProps({ children: "Hampshire · Lunch" });
    const flat = StyleSheet.flatten(label.props.style);
    const spec = artboardStyle("PlateSheetResults.dc.html", "Hampshire · Lunch");
    expect(flat.fontSize).toBe(spec.fontSize);
    expect(normalizeColor(flat.color as string)).toBe(spec.color);
  });

  // #198: onSubmitEditing had no guard against a search already in flight -- the Search BUTTON
  // already disables on `searching`, but hitting Enter/the keyboard's search key went straight to
  // runSearch regardless, so mashing Enter while typing fired overlapping searchProducts calls.
  // Decision 6 (plate-search-semantics.md) narrowed the fix from "block ANY new search while
  // searching" to "block only a resubmission of the exact SAME still-in-flight query" -- a
  // genuinely different query must now start immediately and supersede the running one instead.
  it("#198: a second Enter with the SAME still-in-flight query is ignored, not fired as an overlapping request", async () => {
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
      searchInput(root).props.onSubmitEditing(); // same query, still in flight -- must be a no-op
    });

    expect(mockedSearchProducts).toHaveBeenCalledTimes(1);
    expect(mockedSearchProducts).toHaveBeenCalledWith("a");

    await act(async () => {
      resolveFirst({ results: [], hasMore: false });
      await Promise.resolve();
    });
  });

  // Decision 6: the other half of #198's old guard was too broad -- it blocked ANY new search
  // while one was in flight, not just a resubmission of the same query, so the searchSeq-based
  // staleness discard (which correctly no-ops a superseded search's late results) was unreachable
  // for this exact case. A genuinely different query must be allowed to start immediately.
  it("a genuinely different query starts immediately while one's in flight, and supersedes it", async () => {
    let resolveFirst!: (v: unknown) => void;
    mockedSearchProducts.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    mockedSearchProducts.mockResolvedValueOnce({ results: [{ barcode: "2", productName: "Banana Chips", nutrition: DISH.nutrition }], hasMore: false });
    const root = renderSheet();
    ensureSearchExpanded(root);

    act(() => {
      searchInput(root).props.onChangeText("a");
    });
    act(() => {
      searchInput(root).props.onSubmitEditing(); // search A starts, unresolved
    });
    act(() => {
      searchInput(root).props.onChangeText("banana");
    });
    await act(async () => {
      searchInput(root).props.onSubmitEditing(); // a different query -- must fire immediately, not be dropped
    });

    expect(mockedSearchProducts).toHaveBeenCalledTimes(2);
    expect(mockedSearchProducts).toHaveBeenLastCalledWith("banana");
    expect(texts(root).flat().join(" ")).toMatch(/Banana Chips/);

    // Search A's late resolution must be a no-op -- searchSeq already moved on to B.
    await act(async () => {
      resolveFirst({ results: [{ barcode: "1", productName: "STALE A RESULT", nutrition: DISH.nutrition }], hasMore: false });
      await Promise.resolve();
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Banana Chips/);
    expect(body).not.toMatch(/STALE A RESULT/);
  });

  // Regression coverage for runDirectLookup's existing searchSeq-gated staleness protection
  // (unchanged by decision 6) plus the one new case the brief calls out: a fresh merged search
  // started while a direct lookup is still in flight must correctly supersede it too.
  it("a fresh search started while a direct lookup is in flight supersedes it -- the late lookup result is discarded", async () => {
    let resolveLookup!: (v: unknown) => void;
    mockedLookupDishLive.mockImplementation(() => new Promise((resolve) => (resolveLookup = resolve)));
    const root = renderSheet();
    await runSearch(root, "nonexistent dish"); // no umass hit -- direct-lookup button available
    await act(async () => {
      directLookupButton(root)[0].props.onPress(); // direct lookup starts, unresolved
    });

    mockedSearchProducts.mockResolvedValueOnce({ results: [{ barcode: "9", productName: "Something Else", nutrition: DISH.nutrition }], hasMore: false });
    await runSearch(root, "something else"); // a fresh search while the lookup is still in flight

    await act(async () => {
      resolveLookup({ status: "hit", candidates: [{ dishName: "Bacon", location: "", hallTid: 1, nutrition: DISH.nutrition, allergens: [], dietTags: [] }] });
      await Promise.resolve();
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Something Else/);
    expect(body).not.toMatch(/Bacon/); // the stale lookup hit must not have merged in
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

    // 3b: the local (history+catalog+custom) group, OFF, USDA, and Branded now each splice into
    // `results` independently as they resolve, instead of all 6 sources being awaited together
    // before anything renders.
    describe("progressive source streaming", () => {
      it("shows a local hit as soon as it resolves, without waiting for a still-pending network source", async () => {
        let resolveOff!: (v: unknown) => void;
        mockedSearchProducts.mockImplementation(() => new Promise((resolve) => (resolveOff = resolve)));
        const storage = await logStorageWith([historyEntry("Falafel Wrap", 1, 350, "2026-08-01T12:00:00.000Z")]);
        const root = renderSheet({ logStorage: storage, hallTid: 1 });
        ensureSearchExpanded(root);
        act(() => {
          searchInput(root).props.onChangeText("falafel");
        });
        await act(async () => {
          searchInput(root).props.onSubmitEditing();
        });

        // The local group is a device-only read -- it's resolved even though OFF is still pending.
        expect(texts(root).flat().join(" ")).toMatch(/Falafel Wrap/);
        // The overall search hasn't finished (OFF is still in flight) -- the "Create a custom
        // food" footer, which reads as a post-search summary, must not have appeared yet.
        expect(texts(root).flat()).not.toContain("Can't find it? Create a custom food");

        await act(async () => {
          resolveOff({ results: [], hasMore: false });
          await Promise.resolve();
        });
        expect(texts(root).flat().join(" ")).toMatch(/Create a custom food/);
      });

      // #494 review: each group's splice does `setResults((prev) => [...(prev ?? []), ...])` --
      // correct for accumulating ONE search's own groups, but without an explicit reset at the top
      // of runSearch, a SECOND search in the same open sheet was appending its own splices onto
      // whatever the FIRST search had already left in `results`, instead of replacing it.
      it("a second search in the same open sheet replaces the first search's results, not appends to them", async () => {
        const storage = await logStorageWith([historyEntry("Falafel Wrap", 1, 350, "2026-08-01T12:00:00.000Z")]);
        mockedSearchCachedDishes.mockReturnValueOnce([]).mockReturnValueOnce([{ dishName: "Miso Ramen", nutrition: { ...DISH.nutrition, calories: 420 }, allergens: [], dietTags: [], updatedAt: "x" }]);
        const root = renderSheet({ logStorage: storage, hallTid: 1 });

        await runSearch(root, "falafel");
        expect(texts(root).flat().join(" ")).toMatch(/Falafel Wrap/);

        await runSearch(root, "ramen");
        const body = texts(root).flat().join(" ");
        expect(body).toMatch(/Miso Ramen/);
        expect(body).not.toMatch(/Falafel Wrap/);
      });
    });

    // plate-search-semantics.md decisions 1-2: cross-source ordering is no longer whatever order
    // the 4 parallel groups' promises happen to settle in.
    describe("cross-source ordering (decisions 1-2)", () => {
      // Decision 1: "UMass numbers are source of truth on campus" (CLAUDE.md) -- umass/history
      // results always sort first, even when they're the LAST group to settle.
      it("sorts umass/history first no matter which of the 4 search groups' promises settle first", async () => {
        mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "1", productName: "Off Chicken", nutrition: DISH.nutrition }], hasMore: false });
        mockedSearchFoods.mockResolvedValue({ results: [{ fdcId: "1", productName: "Usda Chicken", nutrition: DISH.nutrition }], hasMore: false });
        let resolveHistory!: (entries: LogEntry[]) => void;
        const slowStorage: LogStorage = { ...new InMemoryLogStorage(), getAllEntries: () => new Promise((resolve) => (resolveHistory = resolve)) } as LogStorage;
        const root = renderSheet({ logStorage: slowStorage, hallTid: 1 });
        ensureSearchExpanded(root);
        act(() => {
          searchInput(root).props.onChangeText("chicken");
        });
        await act(async () => {
          searchInput(root).props.onSubmitEditing();
          await Promise.resolve();
          await Promise.resolve();
        });
        // OFF/USDA (already-resolved mocks) settled first -- the umass/history group is still
        // pending on the slow storage read above.
        expect(texts(root).flat().join(" ")).toMatch(/Off Chicken/);

        await act(async () => {
          resolveHistory([
            { id: "h1", loggedAt: "2026-08-01T12:00:00.000Z", source: { type: "umass-menu", dishName: "Umass Chicken", hallTid: 1 }, servings: 1, nutrition: DISH.nutrition },
          ]);
          await Promise.resolve();
        });

        const flat = texts(root).flat();
        const umassIdx = flat.indexOf("Umass Chicken");
        const offIdx = flat.indexOf("Off Chicken");
        expect(umassIdx).toBeGreaterThanOrEqual(0);
        expect(offIdx).toBeGreaterThan(umassIdx); // umass sorted first despite settling LAST
      });

      // Decision 2: custom foods interleave with umass/history by match-quality (exact/prefix
      // beats a plain substring match), not appended unconditionally after them. Two pairs, one in
      // each tier, prove genuine interleaving both ways -- not "umass always first" (a tier-1
      // custom result outranks a tier-2 umass one) and not "custom always last" either. A tier-0
      // exact match (arriving LAST, from custom foods) proves that tier too, not just tiers 1/2.
      it("interleaves custom foods with umass/history by match quality, in both directions", async () => {
        mockedSearchCachedDishes.mockReturnValue([
          { dishName: "Wrap Special", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }, // prefix match -- tier 1
          { dishName: "Best Turkey Wrap", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }, // substring -- tier 2
        ]);
        mockedSearchCustomFoods.mockReturnValue([
          { id: "c1", name: "Turkey Wrap", servingSize: "1", nutrition: DISH.nutrition }, // substring -- tier 2
          { id: "c2", name: "Wrap Deluxe", servingSize: "1", nutrition: DISH.nutrition }, // prefix match -- tier 1
          { id: "c3", name: "Wrap", servingSize: "1", nutrition: DISH.nutrition }, // exact match -- tier 0, despite arriving LAST
        ]);
        const root = renderSheet();
        await runSearch(root, "wrap");

        const flat = texts(root).flat();
        const idx = (name: string) => flat.indexOf(name);
        // Tier 0 (exact match) sorts first, ahead of every tier-1/tier-2 result above it.
        expect(idx("Wrap")).toBeGreaterThanOrEqual(0);
        expect(idx("Wrap")).toBeLessThan(idx("Wrap Special"));
        // Both tier 1 (prefix match): umass's own arrival order (before custom's) is preserved.
        expect(idx("Wrap Special")).toBeGreaterThanOrEqual(0);
        expect(idx("Wrap Special")).toBeLessThan(idx("Wrap Deluxe"));
        // Tier 1 sorts entirely before tier 2 -- the custom tier-1 hit outranks the umass tier-2 one.
        expect(idx("Wrap Deluxe")).toBeLessThan(idx("Best Turkey Wrap"));
        // Both tier 2 (substring): umass's own arrival order is preserved here too.
        expect(idx("Best Turkey Wrap")).toBeLessThan(idx("Turkey Wrap"));
      });
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

    // #409, updated per platesheet-search-spec-conformance: addSection's dashed border
    // (docs/design/PlateExpanded.dc.html:87) is idle-only -- addSectionIdle carries it.
    // docs/design/PlateSheetResults.dc.html has NO border around the expanded panel at all (only
    // around the input box itself), so the base addSection style the expanded panel uses bare
    // must have no border of its own -- the old "switches to a solid border" behavior was a
    // spec drift, not the artboard.
    it("#409: addSectionIdle carries the dashed maroon border; the expanded panel (bare addSection) has none", () => {
      const { StyleSheet } = require("react-native");
      const { colors, withOpacity } = require("../lib/theme");
      const root = renderSheet();

      // testID="addSection" marks the same conceptual row in both states -- platesheet-search-
      // panel-spacing-gap moved minHeight (the marker this test used to key off) to addSectionIdle
      // only, since SearchExpandedHeader.dc.html's expanded state has no box at all, so it's no
      // longer present once expanded.
      const findAddSection = () => root.root.findAll((n) => n.type === View && n.props.testID === "addSection")[0];

      const idleFlat = StyleSheet.flatten(findAddSection().props.style);
      expect(idleFlat.borderWidth).toBe(1);
      expect(idleFlat.borderStyle).toBe("dashed");
      expect(idleFlat.borderColor).toBe(withOpacity(colors.maroon600, 45));

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
      });

      const expandedFlat = StyleSheet.flatten(findAddSection().props.style);
      expect(expandedFlat.borderWidth).toBeUndefined();
      expect(expandedFlat.borderColor).toBeUndefined();
      expect(expandedFlat.borderStyle).toBeUndefined();
      // platesheet-search-panel-spacing-gap (pr-reviewer REWORK): the idle pill's padding/
      // min-height/corner-radius are just as idle-only as its border above, and leak into the
      // expanded state the exact same way the border used to -- SearchExpandedHeader.dc.html's
      // panel has no wrapping box at all, so none of these belong on the bare `addSection` object.
      // Un-enforced before this: reverting addSection's split (re-adding these four properties to
      // the shared object) left the full suite green.
      expect(expandedFlat.paddingVertical).toBeUndefined();
      expect(expandedFlat.paddingHorizontal).toBeUndefined();
      expect(expandedFlat.minHeight).toBeUndefined();
      expect(expandedFlat.borderRadius).toBeUndefined();
    });

    // docs/briefs/platesheet-search-panel-spacing-gap.md's "Root cause" section: nothing in this
    // file asserted the panel's own between-sibling rhythm before this, only each row's own
    // internal styling -- the same class of gap that let #513's border bug ship first. These two
    // cover the pair the brief's bug actually broke (double margin: header's marginBottom PLUS
    // addSection's own marginTop stacking to 28px instead of 10px).
    it("panel gap: 'Your Plate' row to the SEARCH header row matches SearchExpandedHeader.dc.html, not PlateExpanded's own idle-state value", () => {
      const { View } = require("react-native");
      const root = renderSheet();
      ensureSearchExpanded(root);

      const header = root.root.findByProps({ children: "Your Plate" }).parent!;
      const addSection = root.root.findAll((n) => n.type === View && n.props.testID === "addSection")[0];

      expect(renderedGap(header, addSection)).toBe(artboardPanelGap("SearchExpandedHeader.dc.html"));
    });

    it("panel gap: the SEARCH header row to the search input row is the same 10px panel gap, not the addSection internal gap alone", () => {
      const root = renderSheet();
      ensureSearchExpanded(root);

      const searchHeader = root.root.findByProps({ accessibilityLabel: "Back" }).parent!;
      // 3 hops: Svg -> host(searchInputBox) -> composite(searchInputBox) -> host(searchRow) -- see
      // the itemList test below for why a View level costs two `.parent` hops, not one.
      const searchRow = root.root.findByProps({ testID: "searchIcon" }).parent!.parent!.parent!;

      expect(renderedGap(searchHeader, searchRow)).toBe(artboardPanelGap("SearchExpandedHeader.dc.html"));
    });

    // Regression guard for the idle state's own panel gap (14px, PlateExpanded.dc.html) -- proves
    // the new headerExpanded override above only applies while searchExpanded, and that this is a
    // genuinely different value from the expanded-state test above, not a coincidence of both
    // artboards sharing one number.
    it("panel gap: 'Your Plate' row to the item list matches PlateExpanded.dc.html's own idle-state gap (14px)", () => {
      const root = renderSheet({ plate: [{ ...menuItemToPlateEntry(DISH), count: 1 }] });

      const header = root.root.findByProps({ children: "Your Plate" }).parent!;
      // 5 hops: Text -> host(itemInfo) -> composite(itemInfo) -> host(itemRow) -> composite(itemRow)
      // -> host(itemList) -- react-test-renderer's instance tree doesn't collapse a `View`'s own
      // composite wrapper the way JSX nesting visually suggests, so each View level climbed costs
      // two `.parent` hops, not one.
      const itemList = root.root.findByProps({ children: "Pizza" }).parent!.parent!.parent!.parent!.parent!;

      expect(renderedGap(header, itemList)).toBe(artboardPanelGap("PlateExpanded.dc.html"));
      expect(artboardPanelGap("PlateExpanded.dc.html")).not.toBe(artboardPanelGap("SearchExpandedHeader.dc.html"));
    });

    // PlateSheetResults.dc.html:37 / SearchExpandedHeader.dc.html:42 spec a magnifying-glass icon
    // inside the expanded input box (14x14, r=4.2, rgba(36,26,20,0.5) stroke, width 1.4) -- not
    // the idle row's own CTA icon (PlateExpanded.dc.html:87, 20x20/maroon600/1.6), which is a
    // different affordance and was never carried over when the row expands into the real input.
    it("shows a magnifying-glass icon in the expanded search input, per the artboard's own numbers", () => {
      const { Circle } = require("react-native-svg");
      const { colors, withOpacity } = require("../lib/theme");
      const root = renderSheet();
      ensureSearchExpanded(root);
      expect(root.root.findAll((n) => n.type === Svg && n.props.testID === "searchIcon")).toHaveLength(1);
      const [circle] = root.root.findAll((n) => n.type === Circle);
      expect(circle.props.r).toBe(4.2);
      expect(circle.props.stroke).toBe(withOpacity(colors.ink900, 50));
    });

    // artboardStyle can't read the <svg>'s own presentation attributes (r/stroke above) -- it's a
    // text-anchor regex reader (artboard.ts's header comment), and the icon's tag carries no leaf
    // text of its own. What IS artboard-readable is its enclosing input box
    // (PlateSheetResults.dc.html:36, one <div> up from the "protein bar" placeholder sibling the
    // icon shares a row with) -- pins the icon's own row layout (gap from the input text,
    // vertical centering) against the same artboard the r/stroke numbers above are cited from.
    it("the icon's enclosing input box centers it against the text with the artboard's own gap", () => {
      const root = renderSheet();
      ensureSearchExpanded(root);
      const inputBox = root.root.findByProps({ testID: "searchIcon" }).parent!;
      const flat = StyleSheet.flatten(inputBox.props.style);
      const spec = artboardEnclosingStyle("PlateSheetResults.dc.html", "protein bar", 1);
      expect(flat.alignItems).toBe(spec.alignItems);
      expect(flat.gap).toBe(spec.gap);
    });

    // PlateSheetResults.dc.html:40 specs a solid-fill Search button, not the outlined/transparent
    // "secondary" variant -- "primary" (theme.ts buttonColors) is the already-existing variant
    // that matches, same one the sheet's own LOG button uses.
    it("renders the Search button with the solid 'primary' variant, not 'secondary'", () => {
      const root = renderSheet();
      ensureSearchExpanded(root);
      const searchButtons = root.root.findAll((n) => n.type === Button && n.props.children === "Search");
      expect(searchButtons).toHaveLength(1);
      expect(searchButtons[0].props.variant).toBe("primary");
    });

    // platesheet-search-results-parity-gap task 1: buttonColors("primary") alone fills with
    // colors.maroon600 (#7c2430) -- PlateSheetResults.dc.html:40 (and SearchExpandedHeader.dc.html:45)
    // specs the darker #3b0a0f (maroon900) with an Oswald/600/12px/uppercase/0.5-letterspacing
    // label, same "primary variant + style/textStyle override" pattern CustomFoodForm.tsx's
    // Save button (saveButton/saveButtonText) already uses for its own #3b0a0f artboard button.
    // Padding/borderWidth aren't asserted here -- Button's own "sm" padding sets the touch target,
    // not the artboard's `padding: 0 18px` (height comes from the 44px flex row it sits in there).
    it("fills with the artboard's #3b0a0f (not buttonColors('primary')'s default maroon600) and matches its Oswald/12px/uppercase label", () => {
      const root = renderSheet();
      ensureSearchExpanded(root);
      const searchButtons = root.root.findAll((n) => n.type === Button && n.props.children === "Search");
      const spec = artboardStyle("PlateSheetResults.dc.html", "Search");

      const buttonFlat = StyleSheet.flatten(searchButtons[0].props.style);
      expect(normalizeColor(buttonFlat.backgroundColor as string)).toBe(spec.backgroundColor);
      expect(buttonFlat.borderRadius).toBe(spec.borderRadius);

      const label = searchButtons[0].findByType(Text);
      const labelFlat = StyleSheet.flatten(label.props.style);
      expect(labelFlat.fontSize).toBe(spec.fontSize);
      expect(labelFlat.letterSpacing).toBe(spec.letterSpacing);
      expect(labelFlat.textTransform).toBe(spec.textTransform);
      expect(normalizeColor(labelFlat.color as string)).toBe(spec.color);
    });

    // SearchExpandedHeader.dc.html:35-38 + CustomFoodForm.tsx's established chevron+title header
    // convention -- the back chevron must sit in a header row with a "Search" title, not float
    // alone outside any such row (same pattern NutritionLabel.tsx/CustomFoodForm.tsx already use).
    // Values read straight from the artboard, not copied by eye.
    it("wraps the back chevron in a header row with a 'Search' title, matching the artboard's own row/title styling", () => {
      const { StyleSheet } = require("react-native");
      const root = renderSheet();
      ensureSearchExpanded(root);

      const backButton = root.root.findByProps({ accessibilityLabel: "Back" });
      const header = backButton.parent!;
      expect(header.type).toBe("View");
      const flat = StyleSheet.flatten(header.props.style);
      // artboardEnclosingStyle up=1: the title's own div is up=0, its parent (the flex row
      // itself, display:flex + align-items + gap -- "display" isn't a mapped RN prop, so
      // flexDirection isn't spec-readable, but it's CSS's own row default and what the row style
      // sets) is up=1.
      const rowSpec = artboardEnclosingStyle("SearchExpandedHeader.dc.html", "Search", 1);
      expect(flat.flexDirection).toBe("row");
      expect(flat.alignItems).toBe(rowSpec.alignItems);
      expect(flat.gap).toBe(rowSpec.gap);

      const title = header.findByProps({ children: "Search" });
      expect(title.type).toBe(Text);
      const titleSpec = artboardStyle("SearchExpandedHeader.dc.html", "Search");
      const titleFlat = StyleSheet.flatten(title.props.style);
      expect(titleFlat.fontSize).toBe(titleSpec.fontSize);
      expect(titleFlat.letterSpacing).toBe(titleSpec.letterSpacing);
      expect(titleFlat.textTransform).toBe(titleSpec.textTransform);
      expect(normalizeColor(titleFlat.color)).toBe(titleSpec.color);
    });

    // 3a: expanding search now replaces the WHOLE pane body (item list/totals/LOG button included),
    // not just the bottom addSection block -- and a back chevron collapses it again in place.
    it("expanding search replaces the whole pane -- item list, totals, and LOG button unmount, leaving only a back button + search UI", () => {
      const plate = [{ ...menuItemToPlateEntry(DISH), count: 2 }];
      const root = renderSheet({ plate, totals: { date: "x", calories: 400, proteinG: 18, totalCarbG: 48, totalFatG: 16 } });
      expect(texts(root).flat().join(" ")).toMatch(/LOG 2 ITEMS/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
      });

      const body = texts(root).flat().join(" ");
      expect(body).not.toMatch(/LOG \d+ ITEMS/);
      expect(root.root.findAllByProps({ accessibilityLabel: "Edit servings for Pizza" })).toHaveLength(0);
      expect(root.root.findByProps({ accessibilityLabel: "Back" })).toBeTruthy();
    });

    it("tapping Back collapses to idle without resetting the query or the results already fetched", async () => {
      mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "1", productName: "Trail Mix", nutrition: DISH.nutrition }], hasMore: false });
      const root = renderSheet();
      await runSearch(root, "trail mix");
      expect(texts(root).flat().join(" ")).toMatch(/Trail Mix/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Back" }).props.onPress();
      });
      expect(root.root.findAllByProps({ placeholder: "Search for a food" })).toHaveLength(0);
      expect(root.root.findByProps({ accessibilityLabel: "Add something else" })).toBeTruthy();

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
      });
      expect(searchInput(root).props.value).toBe("trail mix");
      expect(texts(root).flat().join(" ")).toMatch(/Trail Mix/);
      // Reopening after Back must not refire the network search -- the buffer is preserved, not reset.
      expect(mockedSearchProducts).toHaveBeenCalledTimes(1);
    });
  });

  describe("OFF/USDA/Branded pagination (Load more)", () => {
    it("shows a Load more button when any of OFF/USDA/Branded reports hasMore, and pages all three on tap", async () => {
      mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "1", productName: "Off Page 1", nutrition: DISH.nutrition }], hasMore: true });
      mockedSearchFoods.mockResolvedValue({ results: [{ fdcId: "1", productName: "Usda Page 1", nutrition: DISH.nutrition }], hasMore: true });
      mockedSearchBrandedFoods.mockResolvedValue({ results: [{ fdcId: "b1", productName: "Branded Page 1", nutrition: DISH.nutrition }], hasMore: true });
      const root = renderSheet();
      await runSearch(root, "chicken");

      expect(texts(root).flat().join(" ")).toMatch(/Load More/);

      mockedSearchProducts.mockResolvedValueOnce({ results: [{ barcode: "2", productName: "Off Page 2", nutrition: DISH.nutrition }], hasMore: false });
      mockedSearchFoods.mockResolvedValueOnce({ results: [{ fdcId: "2", productName: "Usda Page 2", nutrition: DISH.nutrition }], hasMore: false });
      mockedSearchBrandedFoods.mockResolvedValueOnce({ results: [{ fdcId: "b2", productName: "Branded Page 2", nutrition: DISH.nutrition }], hasMore: false });

      await act(async () => {
        root.root.findByProps({ children: "Load More" }).props.onPress();
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
      expect(body).not.toMatch(/Load More/);
    });

    it("does not show Load more when none of OFF/USDA/Branded has more", async () => {
      const root = renderSheet();
      await runSearch(root, "chicken");
      expect(texts(root).flat().join(" ")).not.toMatch(/Load More/);
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
      expect(texts(root).flat().join(" ")).toMatch(/Load More/);
    });

    // Decision 4 (plate-search-semantics.md): the label stays the fixed "Load More" whether the
    // next tap reveals an already-fetched row (this test) or fetches a new network page (the next
    // test below) -- it used to leak that distinction as "Load 5 More" vs "Load 20 More".
    it("Load More reveals more of the already-fetched buffer without calling any search source again", async () => {
      mockedSearchProducts.mockResolvedValue({ results: Array.from({ length: 12 }, (_, i) => offResult(i)), hasMore: false });
      const root = renderSheet();
      await runSearch(root, "off");
      expect(mockedSearchProducts).toHaveBeenCalledTimes(1);

      await act(async () => {
        root.root.findByProps({ children: "Load More" }).props.onPress();
        await Promise.resolve();
      });

      const shown = texts(root)
        .flat()
        .filter((t) => typeof t === "string" && t.startsWith("Off Match"));
      expect(shown).toHaveLength(10);
      // Still just the one call from the initial search -- revealing more of an already-fetched
      // buffer must not re-fetch anything.
      expect(mockedSearchProducts).toHaveBeenCalledTimes(1);
      expect(texts(root).flat().join(" ")).toMatch(/Load More/); // 2 of the 12 remain hidden, same fixed label
    });

    it("only hits the network for a new page once the visible buffer has caught up to what's already fetched", async () => {
      mockedSearchProducts.mockResolvedValue({ results: Array.from({ length: 5 }, (_, i) => offResult(i)), hasMore: true });
      const root = renderSheet();
      await runSearch(root, "off"); // exactly 5 fetched, all 5 visible -- buffer is caught up already

      expect(texts(root).flat().join(" ")).toMatch(/Load More/); // no hidden buffer -- next tap must fetch

      mockedSearchProducts.mockResolvedValueOnce({ results: [offResult(100)], hasMore: false });
      await act(async () => {
        root.root.findByProps({ children: "Load More" }).props.onPress();
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
    // Decision 3 (plate-search-semantics.md): unconditionally available once a search finishes,
    // never gated on result content -- it used to hide the moment ANY umass-kind result existed
    // anywhere in `results`, even one unrelated to what the user actually typed ("I really don't
    // see it at the bottom at times").
    it("still renders even when the merged search already found a UMass result", async () => {
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Miso Ramen", nutrition: DISH.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
      const root = renderSheet();
      await runSearch(root, "ramen");
      expect(directLookupButton(root)).toHaveLength(1);
    });

    it("appears once a search has run and found no UMass result, and never fires lookup-dish on its own", async () => {
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");
      expect(directLookupButton(root)).toHaveLength(1);
      expect(mockedLookupDishLive).not.toHaveBeenCalled();
    });

    it("is absent before any search has run, and hidden again while a search is in flight", async () => {
      const root = renderSheet();
      expect(directLookupButton(root)).toHaveLength(0); // idle, no search run yet
      ensureSearchExpanded(root);
      act(() => {
        searchInput(root).props.onChangeText("anything");
      });
      act(() => {
        searchInput(root).props.onSubmitEditing();
      });
      expect(directLookupButton(root)).toHaveLength(0); // `results` reset to null and `searching` true -- neither settled yet
      await act(async () => {
        await Promise.resolve();
      });
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
      // Decision 3: no longer gated on result content -- a fresh umass hit merging in doesn't hide
      // the affordance anymore (only `directLookup === "loading"`/a search in flight do).
      expect(directLookupButton(root)).toHaveLength(1);

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

    it("miss: removes the spinner row and adds no new message -- the standing 'Create a custom food' row is the resolution, and the retry affordance stays", async () => {
      mockedLookupDishLive.mockResolvedValue({ status: "miss" });
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");
      await act(async () => {
        directLookupButton(root)[0].props.onPress();
      });
      const body = texts(root).flat().join(" ");
      // brief foodpro-menu-expansion task 4: miss is a non-change to the empty state -- no new
      // "doesn't have this dish either"-style text, the dashed Create-a-custom-food row (already
      // always present) is the only resolution.
      expect(body).not.toMatch(/doesn.t have this dish either/i);
      expect(lookupStateRow(root)).toHaveLength(0);
      expect(directLookupButton(root)).toHaveLength(1);
    });
  });

  describe("lookup-dish fetching/rate_limited inline states (brief foodpro-menu-expansion task 4)", () => {
    it("fetching: renders as exactly one inline row at the position a UMass match would occupy; already-found OFF rows are unaffected", async () => {
      mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "1", productName: "Trail Mix", nutrition: DISH.nutrition }], hasMore: false });
      let resolveLookup!: (v: unknown) => void;
      mockedLookupDishLive.mockImplementation(() => new Promise((resolve) => (resolveLookup = resolve)));
      const root = renderSheet();
      await runSearch(root, "trail mix");

      act(() => {
        directLookupButton(root)[0].props.onPress();
      });

      // `<Text>Looking up {query}…</Text>` renders its children as separate array entries
      // ("Looking up ", "trail mix", "…"), not one joined string -- join the whole flattened
      // text tree into one string (same pattern other tests in this file use) before matching,
      // and compare string positions for the ordering claim.
      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Looking up\s+trail mix/i);
      expect(body).toMatch(/Trail Mix/);
      const spinnerPos = body.search(/Looking up\s+trail mix/i);
      const offPos = body.indexOf("Trail Mix");
      expect(spinnerPos).toBeGreaterThanOrEqual(0);
      expect(offPos).toBeGreaterThan(spinnerPos); // spinner row sits at the top slot, OFF row still shows beneath it
      expect(lookupStateRow(root)).toHaveLength(1);
      // exactly one fetching indicator -- the manual-tap button isn't a second one alongside it
      expect(directLookupButton(root)).toHaveLength(0);

      await act(async () => {
        resolveLookup({ status: "miss" });
        await Promise.resolve();
      });
    });

    it("rate_limited: swaps into the same slot the fetching row occupied, with its own gray/clock treatment, not a copy of the fetching gold/spinner styling -- nothing else shifts", async () => {
      mockedSearchProducts.mockResolvedValue({ results: [{ barcode: "1", productName: "Trail Mix", nutrition: DISH.nutrition }], hasMore: false });
      let resolveLookup!: (v: unknown) => void;
      mockedLookupDishLive.mockImplementation(() => new Promise((resolve) => (resolveLookup = resolve)));
      const root = renderSheet();
      await runSearch(root, "trail mix");

      act(() => {
        directLookupButton(root)[0].props.onPress();
      });
      const fetchingRows = lookupStateRow(root);
      expect(fetchingRows).toHaveLength(1);
      const fetchingStyle = StyleSheet.flatten(fetchingRows[0].props.style);
      const bodyDuringFetch = texts(root).flat().join(" ");
      const fetchSlotPos = bodyDuringFetch.search(/Looking up\s+trail mix/i);
      const offPosDuringFetch = bodyDuringFetch.indexOf("Trail Mix");

      await act(async () => {
        resolveLookup({ status: "rate_limited" });
        await Promise.resolve();
      });

      const rateLimitedRows = lookupStateRow(root);
      expect(rateLimitedRows).toHaveLength(1); // still exactly one row, not zero/two -- same slot
      const rateLimitedStyle = StyleSheet.flatten(rateLimitedRows[0].props.style);
      // Per SearchLookupStates.dc.html, fetching (gold pill) and rate_limited (gray pill) are
      // deliberately NOT the same treatment -- only the slot they occupy is shared.
      expect(rateLimitedStyle.backgroundColor).not.toEqual(fetchingStyle.backgroundColor);
      const bodyAfterRateLimit = texts(root).flat().join(" ");
      expect(bodyAfterRateLimit).toMatch(/maxed out for the hour/i);
      // "nothing else shifts": the already-found OFF row is still there, still after the lookup
      // row -- swapping fetching -> rate_limited didn't reorder or duplicate surrounding rows.
      const rateLimitSlotPos = bodyAfterRateLimit.search(/maxed out for the hour/i);
      const offPosAfterRateLimit = bodyAfterRateLimit.indexOf("Trail Mix");
      expect(offPosDuringFetch).toBeGreaterThan(fetchSlotPos);
      expect(offPosAfterRateLimit).toBeGreaterThan(rateLimitSlotPos);
    });

    it("fetching and rate_limited pills match SearchLookupStates.dc.html's distinct backgrounds/radius/padding (43/46 gold pill vs 71/73 gray pill)", async () => {
      let resolveLookup!: (v: unknown) => void;
      mockedLookupDishLive.mockImplementation(() => new Promise((resolve) => (resolveLookup = resolve)));
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");

      act(() => {
        directLookupButton(root)[0].props.onPress();
      });
      const fetchingStyle = StyleSheet.flatten(lookupStateRow(root)[0].props.style);
      const fetchingSpec = artboardEnclosingStyle("SearchLookupStates.dc.html", "Looking up", 2);
      expect(normalizeColor(fetchingStyle.backgroundColor as string)).toBe(fetchingSpec.backgroundColor);
      expect(fetchingStyle.borderRadius).toBe(fetchingSpec.borderRadius);
      expect(fetchingStyle.paddingVertical).toBe(fetchingSpec.paddingVertical);
      expect(fetchingStyle.paddingHorizontal).toBe(fetchingSpec.paddingHorizontal);

      await act(async () => {
        resolveLookup({ status: "rate_limited" });
        await Promise.resolve();
      });
      const rateLimitedStyle = StyleSheet.flatten(lookupStateRow(root)[0].props.style);
      const rateLimitedSpec = artboardEnclosingStyle("SearchLookupStates.dc.html", "Live lookups", 1);
      expect(normalizeColor(rateLimitedStyle.backgroundColor as string)).toBe(rateLimitedSpec.backgroundColor);
      expect(rateLimitedStyle.borderRadius).toBe(rateLimitedSpec.borderRadius);
      expect(rateLimitedStyle.paddingVertical).toBe(rateLimitedSpec.paddingVertical);
      expect(rateLimitedStyle.paddingHorizontal).toBe(rateLimitedSpec.paddingHorizontal);
      expect(rateLimitedStyle.gap).toBe(rateLimitedSpec.gap);
    });

    it("fetching label text is 13px with no line-height (line 46) and rate_limited copy is a distinct 12px/1.4-line-height treatment (line 73), not the fetching row's shared style", async () => {
      let resolveLookup!: (v: unknown) => void;
      mockedLookupDishLive.mockImplementation(() => new Promise((resolve) => (resolveLookup = resolve)));
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");

      act(() => {
        directLookupButton(root)[0].props.onPress();
      });
      const fetchingTextStyle = StyleSheet.flatten(lookupStateRow(root)[0].findByType(Text).props.style);
      const fetchingTextSpec = artboardStyle("SearchLookupStates.dc.html", "Looking up");
      expect(fetchingTextStyle.fontSize).toBe(fetchingTextSpec.fontSize);
      expect(fetchingTextStyle.lineHeight).toBeUndefined();

      await act(async () => {
        resolveLookup({ status: "rate_limited" });
        await Promise.resolve();
      });
      const rateLimitedTextStyle = StyleSheet.flatten(lookupStateRow(root)[0].findByType(Text).props.style);
      const rateLimitedTextSpec = artboardStyle("SearchLookupStates.dc.html", "Live lookups");
      expect(rateLimitedTextStyle.fontSize).toBe(rateLimitedTextSpec.fontSize);
      // artboard.ts's px() runs "line-height: 1.4" through Number() with no unit stripped, so the
      // spec value is the bare unitless CSS ratio (1.4), not an RN absolute pixel line-height --
      // multiply by fontSize before comparing, never assert `lineHeight: 1.4` directly.
      expect(rateLimitedTextStyle.lineHeight).toBe(
        Math.round((rateLimitedTextSpec.fontSize as number) * (rateLimitedTextSpec.lineHeight as number)),
      );
    });

    it("rate_limited renders the artboard's static clock glyph (line 72), not the fetching spinner", async () => {
      mockedLookupDishLive.mockResolvedValue({ status: "rate_limited" });
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");

      await act(async () => {
        directLookupButton(root)[0].props.onPress();
        await Promise.resolve();
      });

      const row = lookupStateRow(root)[0];
      // A clock glyph is a Circle + a bent Path (the hands) with no `spin`-style rotating
      // container around it -- distinguishing it from the fetching row's Spinner component.
      expect(row.findAllByType(Spinner)).toHaveLength(0);
      expect(row.findAll((n) => n.type === Svg && n.props.testID === "lookupStateClockIcon")).toHaveLength(1);
    });

    it("rate_limited: retry is a manual tap only -- letting time pass never re-fires lookup-dish on its own", async () => {
      jest.useFakeTimers();
      mockedLookupDishLive.mockResolvedValue({ status: "rate_limited" });
      const root = renderSheet();
      await runSearch(root, "nonexistent dish");

      await act(async () => {
        directLookupButton(root)[0].props.onPress();
        await Promise.resolve();
      });
      expect(mockedLookupDishLive).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(5 * 60_000);
      });
      expect(mockedLookupDishLive).toHaveBeenCalledTimes(1); // no timed auto-retry

      // the retry affordance is still there and still only fires on an explicit tap
      await act(async () => {
        directLookupButton(root)[0].props.onPress();
        await Promise.resolve();
      });
      expect(mockedLookupDishLive).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  // #platesheet-keyboard-follow: the sheet's bottom margin must track useAnimatedKeyboard's live
  // shared value every frame, not a discrete useState snap from a Keyboard event listener -- a
  // state snap renders the margin at its FINAL value in one frame while the OS keyboard is still
  // mid-slide underneath it (visible only on-device; unreproducible under Jest, which never fires
  // a real keyboard event -- this test instead asserts the wrapper is actually WIRED to the live
  // shared value by mocking what that value reports).
  describe("keyboard-follow margin", () => {
    afterEach(() => {
      jest.restoreAllMocks(); // don't leak the mocked useAnimatedKeyboard onto every other test in this file
    });

    it("wrapper's marginBottom reflects useAnimatedKeyboard's live height, not a static 0", () => {
      jest.spyOn(Reanimated, "useAnimatedKeyboard").mockReturnValue({ height: { value: 250 }, state: { value: 2 } } as never);
      const root = renderSheet();
      expect(keyboardFollowWrapper(root)[0].props.style).toMatchObject({ marginBottom: 250 });
    });

    // #platesheet-keyboard-follow-real-device: on real Android hardware the margin above stayed 0
    // while the keyboard was up. useAnimatedKeyboard's native side registers its insets-animation
    // callback on the Activity window's decorView, but an RN <Modal> hosts its content in its own
    // Dialog window -- and Android delivers the IME animation only to the window that owns the
    // focused input (dumpsys: imeInputTarget = the ty=APPLICATION dialog window, not the
    // BASE_APPLICATION activity window). So the sheet -- and above all its search TextInput -- must
    // live in the screen's own window, never inside a Modal. The API-35 emulator happened to hide
    // this, which is why the margin test above alone wasn't enough.
    it("hosts the search input in the screen's own window -- no RN Modal in the tree", () => {
      const root = renderSheet();
      ensureSearchExpanded(root);
      expect(searchInput(root)).toBeTruthy();
      expect(root.root.findAllByType(Modal)).toHaveLength(0);
    });

    // Modal's onRequestClose used to be what mapped Android's hardware back to onClose; without a
    // Modal that has to be wired explicitly.
    it("hardware back closes the sheet while it's open", () => {
      const onClose = jest.fn();
      const spy = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove: jest.fn() });
      renderSheet({ onClose });
      const handlers = spy.mock.calls.filter(([name]) => name === "hardwareBackPress").map(([, handler]) => handler as () => boolean);
      expect(handlers.length).toBeGreaterThan(0);
      expect(handlers[handlers.length - 1]()).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // iOS half of the a11y fencing a Modal used to give for free (the Android half is the caller's
    // behindSheetA11yProps wrapper, see sheetAnimation.ts): VoiceOver confines navigation to the
    // overlay while it's up.
    it("marks the overlay root accessibilityViewIsModal", () => {
      const root = renderSheet();
      expect(root.root.findAll((n) => n.props.accessibilityViewIsModal === true).length).toBeGreaterThan(0);
    });

    it("renders nothing while closed (no Modal to hide it anymore)", () => {
      const root = renderSheet({ visible: false });
      expect(root.toJSON()).toBeNull();
    });
  });
});
