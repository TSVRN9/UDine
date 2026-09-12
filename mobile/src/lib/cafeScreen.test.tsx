// /cafe/[name].tsx's own wiring, post-café-screen-unification: fetch hours, find the tapped
// location, hand it straight to HallMenuScreenBody as a HallMenuSubject (tid + retailLoc) -- that
// shared screen (also used by /halls/[slug]) owns the whole waterfall (ajax -> standing-menu-HTML
// match -> info-only) and picks its OWN internal state; this screen never probes anything or routes
// between a screen and a separate fallback sheet anymore (that mechanism -- cafeTapTarget,
// cafeSheetHandoff.ts -- is retired, see this PR's body). Same jest.mock-factory pattern as
// hallMenu.test.tsx (which this reuses -- HallMenuScreenBody renders unconditionally now, so it
// needs the same storage/dish-catalog/supabase mocks that file already establishes).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { fetchMenu, type MenuItem } from "@udine/shared";
import CafeScreen from "../app/cafe/[name]";
import { Button } from "../components/ui";
import { PlateBar } from "../components/PlateBar";
import { syntheticHallTidForName } from "./cafeMenu";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";

jest.mock("../lib/sqliteStorage", () => ({
  SqliteLogStorage: jest.fn().mockImplementation(() => ({ addEntry: jest.fn() })),
}));

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({
    getFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  })),
  // #198: useGuardedToggleFavorite is pure logic against the (mocked) storage interface above --
  // keep it real, same pattern as SocialPane.test.tsx's real isTransientPingError.
  useGuardedToggleFavorite: jest.requireActual("../lib/favoritesStorage").useGuardedToggleFavorite,
}));

jest.mock("../lib/preferences", () => ({
  getPreferences: jest.fn().mockResolvedValue({ allergensToAvoid: [], requiredDietTags: [] }),
  getCachedPreferences: jest.fn().mockReturnValue(undefined),
}));

jest.mock("./seenDishesStorage", () => ({
  SqliteSeenDishesStorage: jest.fn().mockImplementation(() => ({ recordSeen: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// HallMenuScreenBody (rendered directly by this screen now, always -- not just a "menu" branch)
// imports the real ../lib/supabase singleton for its own dish-catalog background refresh -- explicit
// factory, not a bare automock, same reasoning as homePane.test.tsx: the real module drags in native
// bindings (AsyncStorage) unavailable outside jest-expo's native harness. dishCatalog itself is
// mocked too so that refresh, and the standing-menu waterfall's own catalog read, are controllable.
jest.mock("../lib/supabase", () => ({ supabase: {} }));
const mockedGetCachedDishCatalog = jest.fn().mockResolvedValue(null);
const mockedSearchCachedDishes = jest.fn().mockReturnValue([]);
jest.mock("../lib/dishCatalog", () => ({
  getCachedDishCatalog: (...args: unknown[]) => mockedGetCachedDishCatalog(...args),
  refreshDishCatalogIfStale: jest.fn().mockResolvedValue(undefined),
  searchCachedDishes: (...args: unknown[]) => mockedSearchCachedDishes(...args),
}));

// react-native-webview needs a native module not present under jest -- CafePdfViewer (rendered only
// once a PDF row is tapped, which no test below does) is the only importer reached from this screen.
jest.mock("react-native-webview", () => ({ WebView: () => null }));

// Inlined directly in the factory, not a module-scope const referenced from it -- jest.mock
// factories run at hoist time, before top-level `const` initializers in this file's own source
// order (same hazard hallMenu.test.tsx's own top comment documents).
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: jest.fn(),
}));

const DEFAULT_HOURS_FEED = {
  halls: [],
  retail: [
    {
      name: "People's Organic Coffee",
      hours: { openTime: "7:00 AM", closeTime: "4:00 PM" },
      locationId: 32,
      breakfastMenu: "<p>Bacon Croissant</p>",
      lunchMenu: null,
      dinnerMenu: null,
      description: "",
      address: "",
      mapAddress: undefined,
      acceptedPayment: "",
    },
  ],
};

// #243 bug C: the screen must resolve its `loc` through menuHoursCache.ts's caching path (like
// halls/[slug].tsx already does for its own hours effect), not shared's bare fetchDiningHours --
// otherwise a café row Home just rendered from a warm cache errors out the moment it's tapped
// while offline. Same jest.mock shape as hallMenu.test.tsx/homePaneOffline.test.tsx.
const mockFetchHoursAndCache = jest.fn();
const mockGetCachedHours = jest.fn();
const mockGetCachedMenu = jest.fn();
jest.mock("./menuHoursCache", () => ({
  fetchHoursAndCache: () => mockFetchHoursAndCache(),
  getCachedHours: () => mockGetCachedHours(),
  getCachedMenu: (...args: unknown[]) => mockGetCachedMenu(...args),
  // menuFetchWithSeenTracking.ts (real implementation, not mocked -- same call as
  // hallMenu.test.tsx) also imports saveCachedMenu from this module.
  saveCachedMenu: jest.fn().mockResolvedValue(undefined),
}));

let mockSearchParamName = "People's Organic Coffee";
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ name: encodeURIComponent(mockSearchParamName) }),
  useFocusEffect: (_callback: () => void) => {},
  router: { back: jest.fn(), push: jest.fn() },
}));

const mockedFetchMenu = fetchMenu as jest.Mock;

// #107/#181-style lazy access -- menuFetchWithSeenTracking.ts instantiates this singleton eagerly
// at module scope, which only runs once CafeScreen (and its fetchMenuAndRecordSeen import) is
// first loaded.
function recordSeenMock(): jest.Mock | undefined {
  return (SqliteSeenDishesStorage as unknown as jest.Mock).mock.results[0]?.value?.recordSeen;
}

// halls/[slug].tsx's `const storage = new SqliteLogStorage();` (module top level) is a singleton,
// created once by the first render that imports the module -- same lazy-access pattern
// recordSeenMock above already uses for the seen-dishes singleton (and hallMenu.test.tsx's own
// mockAddEntry, which this mirrors).
function mockAddEntry(): jest.Mock {
  return (SqliteLogStorage as unknown as jest.Mock).mock.results[0].value.addEntry as jest.Mock;
}

// hallMenu.test.tsx's own file-wide fix for the exact same class of crash: logPlate's success path
// (HallMenuScreenBody, unchanged by this PR) schedules a real setTimeout for the "Logged N items"
// banner's auto-dismiss -- with no unmount and no fake timers, that timer fires ~4s after THIS
// test finishes, well past teardown, and crashes the whole run with "window.dispatchEvent is not a
// function" instead of just failing the one test. Only the new locationId-less-café LOG test below
// actually reaches logPlate's success path, but this is file-wide (not scoped to one describe/it)
// for the same reason hallMenu.test.tsx's is: any future test here that logs inherits the same risk.
beforeEach(() => {
  jest.useFakeTimers();
  mockFetchHoursAndCache.mockReset().mockResolvedValue(DEFAULT_HOURS_FEED);
  mockGetCachedHours.mockReset().mockResolvedValue(null);
  mockGetCachedMenu.mockReset().mockResolvedValue(null);
  mockedGetCachedDishCatalog.mockReset().mockResolvedValue(null);
  mockedSearchCachedDishes.mockReset().mockReturnValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

const COFFEE: MenuItem = {
  dishName: "Coffee",
  category: "Beverages",
  mealPeriod: "allday",
  hallTid: 32,
  date: "2026-08-19",
  nutrition: {
    servingSize: "1 cup",
    calories: 5,
    caloriesFromFat: 0,
    totalFatG: 0,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 0,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG: 0,
  },
  allergens: [],
  dietTags: [],
  price: "$3.00",
};

async function renderCafeScreen(items: MenuItem[]) {
  mockedFetchMenu.mockResolvedValue(items);
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<CafeScreen />);
  });
  return root;
}

describe("/cafe/[name] -- unified café screen (always HallMenuScreenBody)", () => {
  it("non-empty fetchMenu -> the integrated state, full nutrition, no info-only content", async () => {
    const root = await renderCafeScreen([COFFEE]);
    expect(texts(root).flat()).toContain("Coffee");
    // CafeSheet's status-pill copy only ever renders in the info-only state -- its absence here
    // proves this rendered the integrated dish list, not the info-only content.
    expect(texts(root).flat().join(" ")).not.toMatch(/OPEN · TIL|CLOSED/);
  });

  // Café-screen unification: an empty ajax probe with a parseable standing-menu item list no longer
  // hands off anywhere -- it renders right here, in the SAME screen, as the "standing" state.
  it("empty fetchMenu + standing-menu HTML -> renders the item (unmatched: name only, no nutrition) in this same screen", async () => {
    const root = await renderCafeScreen([]);
    expect(mockedFetchMenu).toHaveBeenCalledWith(32, expect.any(Date));
    const flat = texts(root).flat();
    expect(flat).toContain("Bacon Croissant");
    expect(flat).toContain("Today's menu isn't posted — standing menu from umassdining.com.");
  });

  // Café-screen QA fix (bug 2): a "standing" state has no real MealPeriod to build tabs from --
  // deriveCafeMealTabs' own "allday" synthetic tab used to render as a degenerate single-tab strip
  // ("ALL DAY"), which the approved design says shouldn't exist for this state at all. The caveat
  // banner takes the tab strip's place instead.
  it("standing-state café renders NO tab strip -- the caveat banner takes its place", async () => {
    const root = await renderCafeScreen([]);
    expect(root.root.findAllByProps({ accessibilityLabel: "All Day menu" }).length).toBe(0);
    expect(texts(root).flat()).not.toContain("All Day");
    // The caveat banner itself must still be there, just not inside a tab row.
    expect(texts(root).flat()).toContain("Today's menu isn't posted — standing menu from umassdining.com.");
  });

  // A catalog hit on the same standing-menu name gets full nutrition, rendered via the exact same
  // dish-row pipeline an integrated/hall item uses.
  it("empty fetchMenu + standing-menu HTML matched against the catalog -> full nutrition, not just name+price", async () => {
    mockedSearchCachedDishes.mockReturnValue([
      { dishName: "Bacon Croissant", nutrition: { ...COFFEE.nutrition, calories: 420, proteinG: 12 }, allergens: [], dietTags: [], updatedAt: "x" },
    ]);
    const root = await renderCafeScreen([]);
    const flat = texts(root).flat();
    expect(flat).toContain("Bacon Croissant");
    expect(flat.join(" ")).toMatch(/420\s*cal/);
  });

  // Café-screen unification AC 2's second half: an unmatched standing-menu row is tappable into the
  // plate sheet's "add something else" search, pre-filled with its own name -- not a dead end. This
  // is the one seam (openUnmatchedItemSearch -> plateSearchSeed -> PlateSheet's initialQuery) no
  // other test crosses; PlateSheet.test.tsx covers `initialQuery` in isolation, this covers the
  // actual tap wiring that feeds it.
  it("tapping an unmatched standing-menu row opens the plate sheet's search pre-filled with its name", async () => {
    const root = await renderCafeScreen([]);
    const row = root.root.findByProps({ accessibilityLabel: "Search for Bacon Croissant, nutrition not found" });
    await act(async () => {
      row.props.onPress();
    });
    const searchInput = root.root.findByProps({ placeholder: "Search for a food" });
    expect(searchInput.props.value).toBe("Bacon Croissant");
  });

  // Café-screen QA fix (bug 3): an unmatched standing-menu row (no catalog hit, name+price only)
  // used to render as a plain flat row visually indistinguishable from a matched dish row except by
  // tapping it -- must instead be clearly marked "not a real, loggable dish yet": dashed border
  // (matched rows/the section's own dividers are solid), and its own "nutrition not found" text.
  it("an unmatched standing-menu row is visually distinct -- dashed border, 'nutrition not found' text", async () => {
    const root = await renderCafeScreen([]);
    const row = root.root.findByProps({ accessibilityLabel: "Search for Bacon Croissant, nutrition not found" });
    expect(row.props.style).toEqual(expect.objectContaining({ borderStyle: "dashed" }));
    expect(texts(root).flat()).toContain("nutrition not found");
  });

  it("empty fetchMenu + no standing menu at all -> the info-only state's content, within this same screen (no menu/dish rows, no filter FAB)", async () => {
    mockFetchHoursAndCache.mockResolvedValue({
      halls: [],
      retail: [{ ...DEFAULT_HOURS_FEED.retail[0], breakfastMenu: null }],
    });
    const root = await renderCafeScreen([]);
    const flat = texts(root).flat();
    // Neither the standing-menu caveat nor a dish row renders -- this resolved "info", not
    // "standing"/"integrated". The café's own name still appears TWICE: once in the pushed
    // screen's header (unchanged for every café state) and once in CafeSheet's own title, proving
    // CafeSheet actually mounted as this state's content.
    expect(flat).not.toContain("Today's menu isn't posted — standing menu from umassdining.com.");
    expect(flat.filter((t) => t === "People's Organic Coffee").length).toBe(2);
    // Café-screen unification: the filter FAB is hidden entirely in the info-only state (nothing to
    // filter -- see halls/[slug].tsx's own comment).
    expect(root.root.findAllByProps({ accessibilityLabel: "Filters" }).length).toBe(0);
  });

  // Café-screen QA fix (bug 1): the info-only café never gets a mealTabs entry (see mealTabs' own
  // doc), so selectedMeal stays null forever -- the plate bar's own "still loading" formula used to
  // read that as permanent loading: disabled LOG button, "add dishes once the menu loads" copy that
  // can never come true since this café's menu structurally never loads. Tapping the plate bar's
  // body still opened PlateSheet's search underneath (the whole bar is one Pressable), but nothing
  // on screen said so -- it read as broken. The plate bar must present its normal, working
  // "search for something not on the menu" empty state instead, same as a real hall whose menu has
  // genuinely zero matching dishes.
  it("info-only café's plate bar is NOT stuck on the disabled loading state -- LOG works, copy doesn't contradict itself", async () => {
    mockFetchHoursAndCache.mockResolvedValue({
      halls: [],
      retail: [{ ...DEFAULT_HOURS_FEED.retail[0], breakfastMenu: null }],
    });
    const root = await renderCafeScreen([]);
    const plateBar = root.root.findByType(PlateBar);
    expect(plateBar.props.emptyState.disabled).not.toBe(true);
    expect(plateBar.props.emptyState.subline).not.toMatch(/menu loads/);
  });

  // Café-screen QA fix (bug 5): the loading skeleton always assumed the "integrated" shape (dish
  // rows + filter FAB) regardless of which state this café will actually resolve to -- for a café
  // whose retailLoc has no standing-menu item list at all (predictable synchronously, no network
  // needed -- see [slug].tsx's own cafeSkeletonLooksLikeInfo comment), that FAB popped in during
  // loading and vanished the instant cafeState resolved to "info". It should never show in the
  // first place for that predicted case.
  it("café loading skeleton hides the filter FAB while still resolving, when retailLoc predicts 'info' (bug 5)", async () => {
    mockFetchHoursAndCache.mockResolvedValue({
      halls: [],
      retail: [{ ...DEFAULT_HOURS_FEED.retail[0], breakfastMenu: null }],
    });
    let resolveFetch!: (items: MenuItem[]) => void;
    mockedFetchMenu.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    // Still loading: the ajax probe (mockedFetchMenu) hasn't resolved yet, so cafeState is still
    // null and this screen is on the skeleton branch.
    expect(root.root.findAllByProps({ accessibilityLabel: "Filters" }).length).toBe(0);
    await act(async () => {
      resolveFetch([]);
      await Promise.resolve();
    });
  });

  it("a name absent from the resolved hours feed shows an error instead of spinning forever", async () => {
    mockSearchParamName = "Not A Real Café";
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    mockSearchParamName = "People's Organic Coffee"; // reset for later tests in this file
    expect(texts(root).flat().join(" ")).toMatch(/Couldn.t find\s+Not A Real Café/);
  });

  // PR #219 review, finding 1: a rejected fetchHoursAndCache with no cache to fall back to used to
  // leave this screen spinning behind only a back chevron forever, plus an unhandled promise
  // rejection. `.catch` in cafe/[name].tsx routes here instead.
  it("a rejected fetchHoursAndCache with no cache to fall back to shows an error instead of spinning forever", async () => {
    mockFetchHoursAndCache.mockRejectedValue(new Error("network down"));
    mockGetCachedHours.mockResolvedValue(null);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Failed to load.*network down/);
  });

  // #243 bug C: the actual reported symptom -- a café row Home just rendered FROM CACHE while
  // offline must still be tappable, not error out just because the live hours re-fetch this
  // screen does on its own mount fails the same way it did for Home.
  it("an offline tap still resolves the café from a warm hours cache and renders its menu (#243 bug C)", async () => {
    mockFetchHoursAndCache.mockRejectedValue(new Error("network down"));
    mockGetCachedHours.mockResolvedValue({ feed: DEFAULT_HOURS_FEED, fetchedAt: "2026-08-19T12:00:00.000Z" });
    // HallMenuScreenBody's own ajax fetch (fetchMenuAndRecordSeen) also fails offline -- it falls
    // back to its own retry-card/cached-menu handling (unit-covered by hallMenu.test.tsx), not this
    // screen's concern any more; here it just needs to not crash or dead-end.
    mockedFetchMenu.mockRejectedValue(new Error("network down"));
    mockGetCachedMenu.mockResolvedValue(null);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/Couldn.t find|Failed to load/);
  });

  // A REJECTED ajax fetch (not just an empty result) must still fall through to the standing-menu
  // tier, same as an empty one -- pre-unification, this exact outcome (locationId's probe rejects)
  // already degraded to the fallback sheet rather than a permanent error/skeleton (cafe/[name].tsx's
  // old #243 bug C comment); this pins that same degradation now that both outcomes render from
  // inside this one screen. Without cafeState folding `error` into the waterfall, this used to
  // skeleton-lock forever: `items` stays null on a rejection, mealTabs/tabs never populate, and
  // HallMenuScreenBody's own top-level `tabs.length === 0` branch never resolves past the loading
  // skeleton -- see this file's own cafeState doc comment for the fix.
  it("a rejected ajax fetch with a standing menu still renders that standing menu, not a permanent skeleton", async () => {
    mockedFetchMenu.mockRejectedValue(new Error("upstream 500"));
    mockGetCachedMenu.mockResolvedValue(null);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    const flat = texts(root).flat();
    expect(flat).toContain("Bacon Croissant");
    expect(flat).toContain("Today's menu isn't posted — standing menu from umassdining.com.");
    expect(flat.join(" ")).not.toMatch(/Getting today.s menu from UMass Dining/); // not the loading skeleton
  });

  // #243 bug D: HallMenuScreenBody's fetch effects are keyed on `hall`'s object IDENTITY (see
  // halls/[slug].tsx), and this screen used to pass a fresh `{tid, name}` literal every render --
  // so any unrelated re-render (rotation, inset change) reset items to null, refetched the menu,
  // and recorded the dish as "seen" a second time.
  it("does not refetch the menu or duplicate recordSeen when the screen re-renders without loc changing (#243 bug D)", async () => {
    const root = await renderCafeScreen([COFFEE]);
    const fetchCallsBefore = mockedFetchMenu.mock.calls.length;
    const recordSeenCallsBefore = recordSeenMock()?.mock.calls.length ?? 0;

    await act(async () => {
      root.update(<CafeScreen />);
    });

    expect(mockedFetchMenu.mock.calls.length).toBe(fetchCallsBefore);
    expect(recordSeenMock()?.mock.calls.length ?? 0).toBe(recordSeenCallsBefore);
  });

  // pr-reviewer 3rd-pass finding: cafeMenu.test.ts/retailHallNames.test.ts's own tests pin
  // syntheticHallTidForName and recordRetailNames in isolation, but neither one exercises the ACTUAL
  // call site that matters -- halls/[slug].tsx's `cafeHallTid = hall.tid ?? syntheticHallTidForName
  // (hall.name)`, which is what feeds both the waterfall's synthetic MenuItem and PlateSheet's own
  // `hallTid` prop (history scoping). Reverting that call site back to the pre-fix `hall.tid ?? -1`
  // must fail THIS test (confirmed -- see the commit this fix landed in) even though every locationId
  // fixture elsewhere in this file (32) never exercises the locationId-less branch at all.
  it("a locationId-less café logs a dish under its own real synthetic hallTid, not the old shared -1 sentinel", async () => {
    mockFetchHoursAndCache.mockResolvedValue({
      halls: [],
      retail: [{ ...DEFAULT_HOURS_FEED.retail[0], name: "Mystery Cart", locationId: undefined, breakfastMenu: "<p>Mystery Snack</p>" }],
    });
    // A catalog hit -- so the standing entry is a normal, directly-addable dish row (matched), not
    // an unmatched name+price row that would need the search flow just to get something onto the
    // plate at all.
    mockedSearchCachedDishes.mockReturnValue([{ dishName: "Mystery Snack", nutrition: COFFEE.nutrition, allergens: [], dietTags: [], updatedAt: "x" }]);
    mockSearchParamName = "Mystery Cart";
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    mockSearchParamName = "People's Organic Coffee"; // reset for later tests in this file

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add Mystery Snack to plate" }).props.onPress();
    });
    act(() => {
      root.root.findByType(PlateBar).props.onPress();
    });
    const logButton = root.root.findAllByType(Button).find((n) => typeof n.props.children === "string" && /^LOG \d+ ITEMS?$/.test(n.props.children));
    if (!logButton) throw new Error("LOG N ITEMS button not found -- is the sheet actually open?");
    await act(async () => {
      await logButton.props.onPress();
    });

    const addEntryMock = mockAddEntry();
    expect(addEntryMock).toHaveBeenCalledTimes(1);
    const loggedEntry = addEntryMock.mock.calls[0][0];
    expect(loggedEntry.source).toEqual({ type: "umass-menu", dishName: "Mystery Snack", hallTid: syntheticHallTidForName("Mystery Cart") });
    expect(loggedEntry.source.hallTid).not.toBe(-1);
  });
});
