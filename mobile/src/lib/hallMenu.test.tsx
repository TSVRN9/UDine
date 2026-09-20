// PR #106 review, finding 1: halls/[slug].tsx wiring had zero coverage -- a reviewer applied three
// simultaneous mutations (PlateBar mounted unconditionally, setPlate([]) deleted from logPlate, the
// occlusion padding call replaced with a constant 0) and stayed 101/101 green. Same pattern as
// homePane.test.tsx: explicit jest.mock factories for every native/expo-router dependency, then
// exercise the real screen component through react-test-renderer.

// ES imports are hoisted above ALL other module-body code -- including top-level `const`
// declarations, "mock"-prefixed or not (that prefix only silences babel-plugin-jest-hoist's
// out-of-scope-reference check for identifiers used *inside* a factory; it doesn't reorder a
// separate `const` statement to run before the imports that trigger the factory). So the mock
// jest.fn()s are created *inside* each factory, and retrieved afterward via the mocked
// constructor's own `.mock.results` -- the constructor call already happened by then, since
// halls/[slug].tsx instantiates its storage singletons at module top level, and importing
// HallMenuScreen below is what loads that module.
import fs from "node:fs";
import path from "node:path";
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text, View, SectionList } from "react-native";
import Reanimated from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import { fetchEvents, fetchMenu, GRAB_N_GO_TIDS, type LogEntry, type MenuItem } from "@udine/shared";
import HallMenuScreen, { HallMenuScreenBody } from "../app/halls/[slug]";
import { CompositeDishComposer } from "../components/CompositeDishComposer";
import { HoldSlideAddButton } from "../components/HoldSlideAddButton";
import { PlateBar } from "../components/PlateBar";
import { Toast } from "../components/Toast";
import { StationScrubber } from "../components/StationScrubber";
import { Button } from "../components/ui";
import { colors } from "./theme";
import { stepDate } from "./hallMenuTabs";
import { toastActionDwell, toastDwell } from "./motion";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteRankingStorage } from "./rankingStorage";
import { CompareSheet } from "../components/CompareSheet";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";
import { SqliteFavoritesStorage } from "./favoritesStorage";
import { getCachedPreferences, setPreferences } from "./preferences";

jest.mock("../lib/sqliteStorage", () => ({
  SqliteLogStorage: jest.fn().mockImplementation(() => ({ addEntry: jest.fn(), getAllEntries: jest.fn().mockResolvedValue([]) })),
}));

// The head-to-head compare wiring writes comparisons through SqliteRankingStorage (expo-sqlite via
// ./db, which can't run under jest) -- a real in-memory stand-in, so recordComparison's actual Elo
// math and single-flight guard run against it and tests can read back what was persisted.
jest.mock("../lib/rankingStorage", () => ({
  SqliteRankingStorage: jest.fn().mockImplementation(() => {
    let dishes: unknown[] = [];
    let foods: unknown[] = [];
    return {
      getRankedDishes: jest.fn(async () => dishes),
      getRankedFoods: jest.fn(async () => foods),
      saveRankedDishes: jest.fn(async (d: unknown[]) => {
        dishes = d;
      }),
      saveRankedFoods: jest.fn(async (f: unknown[]) => {
        foods = f;
      }),
      seed: (d: unknown[], f: unknown[]) => {
        dishes = d;
        foods = f;
      },
    };
  }),
}));

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({
    getFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  })),
  // #198: useGuardedToggleFavorite is pure logic against the (mocked) storage interface above --
  // keep it real, same pattern as SocialPane.test.tsx's real isTransientPingError, so these tests
  // exercise the actual guard instead of a stand-in.
  useGuardedToggleFavorite: jest.requireActual("../lib/favoritesStorage").useGuardedToggleFavorite,
}));

// Spread the real module (menu-filters-macros) -- the screen now also imports setPreferences (fired
// when a FilterSheet allergen/diet/macro chip is toggled) and FilterSheet.tsx itself imports the
// real, pure toggleAllergen/toggleDietTag/toggleMacroPreset -- only the SQLite-backed
// getPreferences/setPreferences need mocking, same reasoning as filtersScreen.test.tsx's mock.
jest.mock("../lib/preferences", () => ({
  ...jest.requireActual("../lib/preferences"),
  getPreferences: jest.fn().mockResolvedValue({ allergensToAvoid: [], requiredDietTags: [] }),
  setPreferences: jest.fn(),
  // Badge-pop-in fix: the screen seeds its initial prefs state from this synchronous cache.
  // Defaults to "cold" (undefined) so every existing test here -- which never warms it -- keeps
  // observing the same no-macroPresets initial state as before.
  getCachedPreferences: jest.fn().mockReturnValue(undefined),
}));

jest.mock("expo-router", () => ({
  // #284 nit: a jest.fn (not a bare arrow) so the unknown-slug back-affordance test below can
  // override the return value for one render without touching every other test's default.
  useLocalSearchParams: jest.fn(() => ({ slug: "worcester" })),
  // homePane.test.tsx's same no-op: the screen's default state already matches what the real
  // focus-effect callback would resolve to (empty favorites, default prefs), so nothing here needs
  // to actually fire it for these findings.
  useFocusEffect: (_callback: () => void) => {},
  router: { back: jest.fn(), push: jest.fn() },
}));

// PlateBar reads safe-area insets; there's no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// PlateSheet (rendered by this screen) now imports the real ../lib/supabase singleton for its
// background dish-catalog refresh -- explicit factory, not a bare automock, same reasoning as
// homePane.test.tsx: the real module drags in native bindings (AsyncStorage) unavailable outside
// jest-expo's native harness. dishCatalog itself is mocked too so PlateSheet's mount-time refresh
// is a no-op here, same as menuHoursCache's mocks above/below.
jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock("../lib/dishCatalog", () => ({
  getCachedDishCatalog: jest.fn().mockResolvedValue(null),
  refreshDishCatalogIfStale: jest.fn().mockResolvedValue(undefined),
  searchCachedDishes: jest.fn().mockReturnValue([]),
}));

// Café-screen unification: halls/[slug].tsx now imports CafePdfViewer too (mounted for a café's
// info-only PDF affordance) -- same react-native-webview native-module gap every other importer of
// it already works around under jest (see cafeScreen.test.tsx/CafePdfViewer.test.tsx). This suite
// never taps into that PDF affordance (it's café-only, and every hall here is a real DINING_HALLS
// entry), so a bare `() => null` stub is enough.
jest.mock("react-native-webview", () => ({ WebView: () => null }));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: jest.fn(),
  // #181 review finding 10: the screen no longer calls shared's fetchDiningHours directly (it goes
  // through fetchHoursAndCache, mocked below via ./menuHoursCache) -- no entry needed here anymore.
  // #180: real fetchEvents hits get_beacons_events over the network; a resolved-empty default keeps
  // the hall-info sheet's events effect from throwing and keeps this whole suite off the real
  // endpoint (never hit real UMass endpoints in tests).
  fetchEvents: jest.fn().mockResolvedValue([]),
}));

// #107: the screen must route its menu fetch through menuFetchWithSeenTracking.ts (not call
// shared's fetchMenu directly) so HALL COMPLETION's denominator gets populated. Mock the
// *underlying* seenDishesStorage singleton, not the wrapper itself, so the real
// fetchMenuAndRecordSeen wiring actually runs end-to-end -- a test that mocked the wrapper away
// would pass even if the screen still called fetchMenu directly.
// recordSeen must resolve, not return undefined -- the wrapper does
// `.catch(() => {})` on its return value (PR #123 review), which throws on a bare jest.fn()'s
// undefined return.
jest.mock("./seenDishesStorage", () => ({
  SqliteSeenDishesStorage: jest.fn().mockImplementation(() => ({ recordSeen: jest.fn().mockResolvedValue(undefined) })),
}));

// #181: menuFetchWithSeenTracking.ts now also calls saveCachedMenu (fire-and-forget) on every
// successful fetch, and the screen itself calls getCachedMenu directly on a failed fetch (for the
// retry card's "SHOW SAVED COPY" link). Both touch real SQLite via ./db -> expo-sqlite, which
// can't run under jest (see seenDishesStorage.test.ts's own comment for the confirmed error) --
// mocked here the same way the other singletons above are, with a real in-memory Map standing in
// for the cache so individual tests can seed/inspect it.
const mockMenuCache = new Map<string, { items: MenuItem[]; fetchedAt: string }>();
// #181 review finding 10: the screen now calls fetchHoursAndCache (this module), not shared's bare
// fetchDiningHours -- a resolved-empty default keeps the screen's hours effect from throwing, same
// reasoning as the old @udine/shared fetchDiningHours mock below it replaces for this purpose;
// individual tests override via (fetchHoursAndCache as jest.Mock).mockResolvedValueOnce(...).
const mockFetchHoursAndCache = jest.fn().mockResolvedValue({ halls: [], retail: [] });
jest.mock("./menuHoursCache", () => ({
  saveCachedMenu: jest.fn(async (hallTid: number, date: Date, items: MenuItem[]) => {
    mockMenuCache.set(`${hallTid}|${date.toDateString()}`, { items, fetchedAt: new Date("2026-08-19T12:00:00.000Z").toISOString() });
  }),
  getCachedMenu: jest.fn(async (hallTid: number, date: Date) => mockMenuCache.get(`${hallTid}|${date.toDateString()}`) ?? null),
  fetchHoursAndCache: () => mockFetchHoursAndCache(),
}));

const mockedFetchMenu = fetchMenu as jest.Mock;
const mockedRouterPush = router.push as jest.Mock;
const mockedSetPreferences = setPreferences as jest.Mock;
const mockedGetCachedPreferences = getCachedPreferences as jest.Mock;
// menuFetchWithSeenTracking.ts instantiates SqliteSeenDishesStorage eagerly at module scope, but
// only if something actually imports that wrapper -- until #107's wiring lands, the screen doesn't,
// so the constructor never runs and `.mock.results` is empty. Read this lazily (inside the test,
// not at module scope) so that missing wiring fails one assertion instead of crashing the whole
// suite's module-load phase (which would also take out the unrelated plate-wiring tests below).
function recordSeenMock(): jest.Mock | undefined {
  return (SqliteSeenDishesStorage as unknown as jest.Mock).mock.results[0]?.value?.recordSeen;
}
// halls/[slug].tsx's `const storage = new SqliteLogStorage();` (module top level) already ran by
// the time this line executes -- importing HallMenuScreen above is what loaded that module.
const mockAddEntry = (SqliteLogStorage as unknown as jest.Mock).mock.results[0].value.addEntry as jest.Mock;
const mockGetAllEntries = (SqliteLogStorage as unknown as jest.Mock).mock.results[0].value.getAllEntries as jest.Mock;
const mockRanking = (SqliteRankingStorage as unknown as jest.Mock).mock.results[0].value as {
  getRankedDishes: jest.Mock;
  getRankedFoods: jest.Mock;
  saveRankedDishes: jest.Mock;
  saveRankedFoods: jest.Mock;
  seed: (dishes: unknown[], foods: unknown[]) => void;
};
const mockFavoritesStorage = (SqliteFavoritesStorage as unknown as jest.Mock).mock.results[0].value as {
  getFavorites: jest.Mock;
  addFavorite: jest.Mock;
  removeFavorite: jest.Mock;
};

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

// The swipe pager (MealTabPager) windows in the active tab's ± 1 neighbors -- they're mounted
// (accessibility-hidden, pointerEvents: "none") so a drag can crossfade into them, not just the
// active tab. Whole-tree `texts`/`findByProps` queries above still work fine for plain positive
// matches (extra hidden content elsewhere doesn't break a `toMatch`), but a query that needs
// "only what's actually visible/tappable right now" -- a `not.toMatch` exclusion, or `findByProps`
// expecting exactly one match -- has to scope to the one pane MealTabPager marks
// `importantForAccessibility: "auto"`, or it can spuriously see a hidden neighbor's identical
// content/controls (e.g. three mounted-but-hidden "Try again" buttons when the hall's menu fetch
// fails, since that error state isn't period-specific and every windowed pane renders it).
function activePane(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(View).find((n) => n.props.importantForAccessibility === "auto")!;
}

function activePaneTexts(root: renderer.ReactTestRenderer) {
  return activePane(root).findAllByType(Text).map((n) => n.props.children);
}

function nutrition(calories: number, proteinG = 1): MenuItem["nutrition"] {
  return {
    servingSize: "1 each",
    calories,
    caloriesFromFat: 0,
    totalFatG: 1,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 1,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG,
  };
}

const PIZZA: MenuItem = {
  dishName: "Pizza",
  category: "Entrees",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(200),
  allergens: [],
  dietTags: [],
};

const SALAD: MenuItem = {
  dishName: "Salad",
  category: "Entrees",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(80),
  allergens: [],
  dietTags: ["Halal", "Gluten-Free"],
};

const OATMEAL: MenuItem = {
  dishName: "Oatmeal",
  category: "Breakfast Entrees",
  mealPeriod: "breakfast",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(150),
  allergens: [],
  dietTags: [],
};

const STEAK: MenuItem = {
  dishName: "Steak",
  category: "Entrees",
  mealPeriod: "dinner",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(400),
  allergens: [],
  dietTags: [],
};

// deriveHallMealTabs (#442-follow-up) now hides a meal tab entirely when no item that day carries
// its mealPeriod -- tests below that need all 4 real tabs present (not just Lunch, the sole
// default renderScreen([PIZZA, SALAD]) period) must include one item per period, this one included.
// station-filter-overlap brief, task 3: two distinct lunch stations so the scrubber (count > 1
// guard) actually renders, and a second day's fixtures below reshape that same list.
const GRILL_STATION_ITEM: MenuItem = {
  dishName: "Grilled Chicken",
  category: "Grill",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(300),
  allergens: [],
  dietTags: [],
};

const SALAD_STATION_ITEM: MenuItem = {
  dishName: "Garden Salad",
  category: "Salads",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(90),
  allergens: [],
  dietTags: [],
};

const NEXT_DAY_GRILL_ITEM: MenuItem = {
  dishName: "Burger",
  category: "Grill",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-20",
  nutrition: nutrition(350),
  allergens: [],
  dietTags: [],
};

const NEXT_DAY_SOUP_ITEM: MenuItem = {
  dishName: "Tomato Soup",
  category: "Soups",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-20",
  nutrition: nutrition(120),
  allergens: [],
  dietTags: [],
};

const LATE_SNACK: MenuItem = {
  dishName: "Late Snack",
  category: "Entrees",
  mealPeriod: "latenight",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: nutrition(120),
  allergens: [],
  dietTags: [],
};

// Composite dish (bowl composer) fixture -- foodpro-menu-expansion brief, task 2. Names must match
// halls/[slug].tsx's own COMPOSITE_FIXTURE_ADD_INS exactly (compositeDishFor's dev-only,
// name-keyed lookup -- see its own doc for why there's no real association to test against yet).
const TERIYAKI_BOWL: MenuItem = { ...PIZZA, dishName: "Teriyaki Noodle Bowl", nutrition: nutrition(260, 10) };
const EDAMAME: MenuItem = { ...PIZZA, dishName: "Edamame", nutrition: nutrition(45, 4) };
const CARROT: MenuItem = { ...PIZZA, dishName: "Shredded Carrot", nutrition: nutrition(15, 0) };
const SHALLOTS: MenuItem = { ...PIZZA, dishName: "Fried Shallots", nutrition: nutrition(70, 1) };
const SRIRACHA: MenuItem = { ...PIZZA, dishName: "Sriracha Mayo", nutrition: nutrition(50, 0) };
const ALL_ADD_INS = [EDAMAME, CARROT, SHALLOTS, SRIRACHA];

async function renderScreen(items: MenuItem[] = [PIZZA, SALAD]) {
  mockedFetchMenu.mockResolvedValue(items);
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<HallMenuScreen />);
  });
  return root;
}

function addToPlate(root: renderer.ReactTestRenderer, dishName: string) {
  act(() => {
    root.root.findByProps({ accessibilityLabel: `Add ${dishName} to plate` }).props.onPress();
  });
}

function stepPlate(root: renderer.ReactTestRenderer, dishName: string, dir: "Add one" | "Remove one") {
  act(() => {
    root.root.findByProps({ accessibilityLabel: `${dir} ${dishName}` }).props.onPress();
  });
}

// Drives HoldSlideAddButton's onHoldStart/onHoldEnd props directly and writes straight to the
// liveCount shared value it's handed as a prop, bypassing real gesture recognition (react-test-
// renderer can't simulate RNGH's native touch arbitration, nor the UI-thread worklet that
// normally computes this -- see that component's own doc comment; the drag-distance -> count
// math itself is unit-tested directly in servingsStepper.test.ts). This exercises the actual bug
// pr-reviewer caught: addToPlate used to loop `for (let i = 0; i < count; i++)`, broken for a
// fractional count -- now a single addOrIncrement(item, count) call. HoldSlideAddButton's
// onHoldEnd is the only real caller that ever passes a non-1 count, so this is the one place that
// regression can actually be caught. A count of 0 is the drag's cancel rung (CANCEL_SERVINGS) --
// [slug].tsx's onHoldEnd guards on `liveCount.value > 0`, so passing 0 here exercises "released
// at the bottom of the drag" without a separate cancel axis/flag.
function holdSlideAdd(root: renderer.ReactTestRenderer, dishName: string, count: number) {
  const button = root.root.findAllByType(HoldSlideAddButton).find((n) => n.props.dishName === dishName);
  if (!button) throw new Error(`HoldSlideAddButton not found for ${dishName}`);
  act(() => button.props.onHoldStart({ x: 0, y: 0, width: 44, height: 44 }));
  act(() => {
    button.props.liveCount.value = count;
  });
  act(() => button.props.onHoldEnd());
}

function starPressable(root: renderer.ReactTestRenderer, dishName: string) {
  const matches = root.root.findAll(
    (n) => typeof n.props.accessibilityLabel === "string" && (n.props.accessibilityLabel === `Favorite ${dishName}` || n.props.accessibilityLabel === `Unfavorite ${dishName}`),
  );
  return matches[0];
}

function findToast(root: renderer.ReactTestRenderer) {
  return root.root.findByType(Toast);
}

// #117 review, finding 1: total vertical touch area a Pressable's hitSlop prop adds on top of its
// own laid-out box -- RN accepts hitSlop as either a single number (applied to all 4 sides) or a
// per-side object.
function verticalHitSlop(hitSlop: number | { top?: number; bottom?: number } | undefined): number {
  if (typeof hitSlop === "number") return hitSlop * 2;
  return (hitSlop?.top ?? 0) + (hitSlop?.bottom ?? 0);
}

async function openSheetAndLog(root: renderer.ReactTestRenderer) {
  act(() => {
    root.root.findByType(PlateBar).props.onPress();
  });
  // The sheet's footer LOG button is the `Button` composite whose child text is `LOG N ITEMS` --
  // found by that text instead of a fixed label (avoids re-deriving the plural/count string here).
  // `onPress` lives on this composite's own props, not on Pressable's internal host node.
  const button = root.root.findAllByType(Button).find((n) => typeof n.props.children === "string" && /^LOG \d+ ITEMS?$/.test(n.props.children));
  if (!button) throw new Error("LOG N ITEMS button not found -- is the sheet actually open?");
  // logPlate is async (awaits storage.addEntry per row) -- await its actual Promise inside act()
  // rather than guessing how many microtask ticks a fire-and-forget press needs to settle.
  await act(async () => {
    await button.props.onPress();
  });
}

// File-wide, not just the banner-lifecycle describe below: logPlate's success AND failure paths
// both now schedule a real setTimeout (the banner auto-dismiss), and none of these tests ever
// unmount their renderer -- a real timer would otherwise fire ~4s after a test finishes, well
// past teardown, calling setToast on a destroyed tree and crashing the whole run with
// "window.dispatchEvent is not a function" instead of just failing the one test.
beforeEach(() => {
  jest.useFakeTimers();
  mockMenuCache.clear();
  mockGetAllEntries.mockReset().mockResolvedValue([]);
  mockRanking.seed([], []);
  mockRanking.saveRankedDishes.mockClear();
  mockRanking.saveRankedFoods.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("HallMenuScreen seen-dish tracking (#107)", () => {
  it("records the fetched hall's distinct dish names as seen, through the real menuFetchWithSeenTracking wrapper", async () => {
    await renderScreen([PIZZA, SALAD]);
    const mockRecordSeen = recordSeenMock();
    expect(mockRecordSeen).toBeDefined();
    expect(mockRecordSeen).toHaveBeenCalledTimes(1);
    const [hallTid, dishNames] = mockRecordSeen!.mock.calls[0];
    expect(hallTid).toBe(PIZZA.hallTid);
    expect(dishNames.sort()).toEqual(["Pizza", "Salad"]);
  });

  // PR #123 review: recordSeen used to be awaited on the menu-render critical path, so a rejecting
  // write (SQLITE_BUSY, full disk) replaced the whole SectionList with an error banner. Now
  // fire-and-forget -- the menu must render in full regardless of what recordSeen does.
  it("still renders the full menu when recordSeen rejects", async () => {
    const mockRecordSeen = recordSeenMock();
    mockRecordSeen?.mockRejectedValueOnce(new Error("database is locked"));

    const root = await renderScreen([PIZZA, SALAD]);

    expect(root.root.findAllByType(SectionList)).toHaveLength(1);
    expect(texts(root).flat().join(" ")).not.toMatch(/Failed to load menu/);
  });
});

describe("HallMenuScreen meal tabs + date stepper + Grab 'N Go tab (#117)", () => {
  // hall-menu-correct-meal-on-load brief: `selectedMeal` starts hardcoded "lunch" and only
  // corrects once hallHours resolves -- so if the tab row/content painted real content the moment
  // `items` resolved (the old behavior this replaces), a hall opened outside lunch hours would
  // flash real "Lunch" content before snapping to the true period. The fix stays in the loading
  // state until BOTH items and hours have arrived, so no interim wrong-content frame is ever
  // trustworthy enough to paint. hallHours is left pending here (never resolved) specifically so
  // this observes the interim render, not the settled one.
  it("stays in the loading state -- not the static Lunch default -- once items resolve but hours haven't yet", async () => {
    let resolveHours: ((value: { halls: unknown[]; retail: unknown[] }) => void) | undefined;
    mockFetchHoursAndCache.mockReturnValueOnce(new Promise((resolve) => { resolveHours = resolve; }));
    const root = await renderScreen([PIZZA, SALAD, OATMEAL]);

    const body = activePaneTexts(root).flat().join(" ");
    expect(body).not.toMatch(/Pizza/);
    expect(body).toMatch(/Getting today.s menu from UMass Dining/);

    // Cleanup: let the still-pending promise resolve so it doesn't leak a dangling timer/handler
    // into a later test.
    await act(async () => resolveHours?.({ halls: [], retail: [] }));
  });

  // Root-cause fix for the "always lands on Lunch" bug: once hoursFeed resolves and the hall is
  // currently inside a different meal's window, the initial tab should land on that meal instead of
  // sitting on the static "lunch" interim default forever.
  it("lands on the Dinner tab (not the static Lunch default) once hours resolve and the hall is currently inside its dinner window", async () => {
    // Wed 2026-08-19, 6:00 PM local -- inside the mocked dinner window below.
    jest.setSystemTime(new Date(2026, 7, 19, 18, 0, 0, 0));
    mockFetchHoursAndCache.mockResolvedValueOnce({
      halls: [
        {
          hallTid: 1,
          breakfast: null,
          lunch: { openTime: "11:00 AM", closeTime: "2:30 PM" },
          dinner: { openTime: "5:00 PM", closeTime: "8:00 PM" },
          latenight: null,
          general: null,
        },
      ],
      retail: [],
    });
    const root = await renderScreen([PIZZA, STEAK]);
    await act(async () => {}); // flush fetchHoursAndCache's resolution

    const body = activePaneTexts(root).flat().join(" ");
    expect(body).toMatch(/Steak/);
    expect(body).not.toMatch(/Pizza/);

    const dinnerTab = root.root.findByProps({ accessibilityLabel: "Dinner menu" });
    const underline = dinnerTab.findAllByType(View).at(-1);
    const flatStyle = StyleSheet.flatten(underline!.props.style) as { backgroundColor?: string };
    expect(flatStyle.backgroundColor).toBe(colors.gold500);
  });

  it("switching to the Breakfast tab shows breakfast items and hides the previously-shown lunch items", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Breakfast menu" }).props.onPress();
    });
    // Lunch is now windowed in as Breakfast's right neighbor -- same scoping as above.
    const body = activePaneTexts(root).flat().join(" ");
    expect(body).toMatch(/Oatmeal/);
    expect(body).not.toMatch(/Pizza/);
  });

  it("keeps the previous tab's content mounted but marks it non-interactive/hidden after switching (swipe crossfade windowing, not an unmount-and-remount)", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Breakfast menu" }).props.onPress();
    });
    // Whole-tree, unscoped: Lunch's Pizza is still mounted (windowed in as Breakfast's neighbor).
    expect(texts(root).flat().join(" ")).toMatch(/Pizza/);
    const hiddenPanes = root.root.findAllByType(View).filter((n) => n.props.importantForAccessibility === "no-hide-descendants");
    expect(hiddenPanes.length).toBeGreaterThan(0);
    for (const pane of hiddenPanes) expect(pane.props.accessibilityElementsHidden).toBe(true);
  });

  // PR #514: PlateSheet is an in-tree overlay (not an RN Modal), so nothing hides the hall screen
  // from a screen reader while the sheet is up unless the screen fences its own background. This
  // pins the actual call site -- the wrapper around everything up to PlateBar spreading
  // behindSheetA11yProps(sheetOpen) -- since the helper's own unit test can't tell whether the
  // screen still passes it the live sheetOpen (hardcoding `false` there passed every other test).
  it("fences the whole background (down to the PlateBar) from assistive tech while the plate sheet is open, and unfences it once closed", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    // The fence wrapper is the View that contains the PlateBar (MealTabPager's inactive panes also
    // carry this prop pair, but none of them contain the bar).
    const barFence = () => root.root.findAllByType(View).filter((n) => n.props.importantForAccessibility === "no-hide-descendants" && n.findAllByType(PlateBar).length === 1);
    expect(barFence()).toHaveLength(0);

    act(() => {
      root.root.findByType(PlateBar).props.onPress();
    });
    const [fence] = barFence();
    expect(fence).toBeDefined();
    expect(fence.props.accessibilityElementsHidden).toBe(true);
    // The sheet itself is NOT inside the fence -- it has to stay reachable.
    expect(fence.findAllByProps({ accessibilityLabel: "Close" })).toHaveLength(0);
    expect(root.root.findAllByProps({ accessibilityLabel: "Close" }).length).toBeGreaterThan(0);

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Close" }).props.onPress();
    });
    expect(barFence()).toHaveLength(0);
  });

  it("steps the date forward by exactly one calendar day and refetches the menu for it", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    // mockedFetchMenu is a module-level mock shared across this whole file's tests, never reset --
    // index off "the call count so far", not a fixed index, so this doesn't depend on test order.
    const callsBefore = mockedFetchMenu.mock.calls.length;
    const [, initialDate] = mockedFetchMenu.mock.calls[callsBefore - 1];

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });

    expect(mockedFetchMenu.mock.calls.length).toBe(callsBefore + 1);
    const [, steppedDate] = mockedFetchMenu.mock.calls[callsBefore];
    expect(steppedDate.getTime()).toBe(stepDate(initialDate, 1).getTime());
  });

  // late-night-2am-day-rollover brief, task 2: selectedDate's default now goes through
  // effectiveToday() instead of a bare `new Date()`, so a menu check before the ~2 AM rollover
  // hour still requests/shows the day that's ending (Late Night), not a brand-new day.
  it("at 12:30 AM local, the initial menu fetch is still for the day that's ending, not the new calendar day", async () => {
    jest.setSystemTime(new Date(2026, 7, 20, 0, 30, 0, 0)); // Aug 20, 12:30 AM local
    await renderScreen([PIZZA, SALAD]);

    const [, initialDate] = mockedFetchMenu.mock.calls.at(-1)!;
    expect(initialDate.toDateString()).toBe(new Date(2026, 7, 19).toDateString()); // Aug 19 -- the closing day
  });

  it("at 2:30 AM local (past the rollover hour), the initial menu fetch is for the new calendar day", async () => {
    jest.setSystemTime(new Date(2026, 7, 20, 2, 30, 0, 0)); // Aug 20, 2:30 AM local
    await renderScreen([PIZZA, SALAD]);

    const [, initialDate] = mockedFetchMenu.mock.calls.at(-1)!;
    expect(initialDate.toDateString()).toBe(new Date(2026, 7, 20).toDateString()); // Aug 20 -- rolled over
  });

  it("date-stepper navigation from a 12:30 AM rollover-aware default steps exactly one day, landing on the real calendar day next", async () => {
    jest.setSystemTime(new Date(2026, 7, 20, 0, 30, 0, 0)); // Aug 20, 12:30 AM local -- default resolves to Aug 19
    const root = await renderScreen([PIZZA, SALAD]);
    const callsBefore = mockedFetchMenu.mock.calls.length;
    const [, initialDate] = mockedFetchMenu.mock.calls[callsBefore - 1];
    expect(initialDate.toDateString()).toBe(new Date(2026, 7, 19).toDateString());

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });

    const [, steppedDate] = mockedFetchMenu.mock.calls[callsBefore];
    expect(steppedDate.getTime()).toBe(stepDate(initialDate, 1).getTime());
    expect(steppedDate.toDateString()).toBe(new Date(2026, 7, 20).toDateString()); // the actual calendar day
  });

  // station-filter-overlap brief, task 3: activeStationIndex (fed to StationScrubber) used to
  // reset only on [selectedMeal] -- a date step rebuilds sectionsByPeriod (a brand-new day's own
  // stations) without ever touching selectedMeal, so a highlight left tracking a deep station from
  // the PREVIOUS day survived, numerically valid against the new day's shorter/different station
  // list but pointing at the wrong one. Confirmed on-device 2026-09-17 (Franklin, real
  // next-day fetch): the highlight rendered near the bottom of the track while the freshly loaded
  // day's list sat at its own first section (Grill Station) -- not a one-frame blip, still wrong
  // 12s later with no further interaction, because nothing ever re-fires viewability for a
  // settled, unscrolled list. Fix: reset on activeStationSections too (it already changes for
  // every station/price-filter, diet/allergen-filter, AND date-step reshape in one dependency,
  // so this covers more than just the date-step path this test drives).
  it("resets the station scrubber's stale index when a date step reshapes the section list, not just on a meal-tab switch", async () => {
    const root = await renderScreen([GRILL_STATION_ITEM, SALAD_STATION_ITEM]);
    const sectionList = activePane(root).findByType(SectionList);
    const sections = sectionList.props.sections as { title: string; data: MenuItem[] }[];
    expect(sections.length).toBeGreaterThan(1);
    const lastIndex = sections.length - 1;

    // Simulate the list having scrolled to its last station -- the real trigger (a drag/scroll)
    // isn't simulable through react-test-renderer, but the scrubber only ever reads this state via
    // onViewableItemsChanged, so calling it directly is exercising the same real wiring the
    // component itself uses, not standing in for the mechanism under test.
    act(() => {
      sectionList.props.onViewableItemsChanged({
        viewableItems: [{ item: sections[lastIndex].data[0], key: "k", index: 0, isViewable: true, section: sections[lastIndex] }],
      });
    });
    expect(root.root.findByType(StationScrubber).props.activeStationIndex).toBe(lastIndex);

    // Next day's own menu also has multiple stations (so the scrubber still renders, count > 1) --
    // its topmost section is index 0, not whatever the previous day's list happened to have there.
    mockedFetchMenu.mockResolvedValueOnce([NEXT_DAY_GRILL_ITEM, NEXT_DAY_SOUP_ITEM]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });

    expect(root.root.findByType(StationScrubber).props.activeStationIndex).toBe(0);
  });

  // hall-menu-filter-overlap brief, task 5 (heavy-debugger pass, 2026-09-18): the owner's real
  // vegetarian-filter screenshots (blank gaps, a section header painted over/under a card) were
  // reproduced on-device at 13/31 toggles and root-caused to the cells' own
  // `layout={LinearTransition...}`: a diet-tag toggle thins sections in place, so surviving
  // headers/rows keep their React key, move, and animate -- entirely behind the opaque FilterSheet
  // Modal -- and Reanimated's Fabric layout-animation proxy then leaves some of them at their
  // PRE-filter frame when the 180ms animation ends while VirtualizedList is still committing the
  // reshape's follow-up renders (0/20 with the transition removed; 9/20 with task 4's scroll-to-top
  // instead; 1/20 when the animation was slowed to 1500ms, i.e. outliving the commit storm). The
  // sheet is the only place a reshape can start while this screen is mounted (setPrefs has one
  // caller; station/price filters live in the same sheet), and the transition is invisible behind
  // it anyway, so cells pass no `layout` at all while it is open and get it back on Done.
  it("passes no layout transition to any dish row or section header while the FilterSheet occludes the list, and restores it once the sheet closes", async () => {
    const root = await renderScreen([GRILL_STATION_ITEM, SALAD_STATION_ITEM]);
    const cellLayouts = () =>
      activePane(root)
        .findAll((n) => n.type === Reanimated.View && n.props.style !== undefined && "layout" in n.props)
        .map((n) => n.props.layout);
    // Both rows and both section headers wrap in an animated view carrying a `layout` prop.
    expect(cellLayouts().length).toBeGreaterThanOrEqual(4);
    expect(cellLayouts().every((l) => l !== undefined)).toBe(true);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Filters" }).props.onPress();
    });
    expect(cellLayouts().length).toBeGreaterThanOrEqual(4);
    expect(cellLayouts().every((l) => l === undefined)).toBe(true);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Done" }).props.onPress();
    });
    expect(cellLayouts().every((l) => l !== undefined)).toBe(true);
  });

  // hall-menu-scroll-recovery-dead-code brief: the recovery handler used to call
  // `ref.getListRef?.()?.scrollToOffset?.(...)`, but SectionList (this repo's own react-native
  // dependency tree, Libraries/Lists/SectionList.js) never re-exposes VirtualizedSectionList's
  // internal getListRef() -- its public ref API is scrollToLocation/recordInteraction/
  // flashScrollIndicators/getScrollResponder/getScrollableNode/setNativeProps -- so that chain
  // optional-chained itself into a silent no-op since PR #458. The ref here is the real
  // SectionList instance (no getListRef method), so this drives the same shape the device sees.
  it("nudges the list toward the failed scrollToIndex target's approximate offset through SectionList's real public ref API (getScrollResponder().scrollTo), not a method the ref never had", async () => {
    const scrollTo = jest.fn();
    const responderSpy = jest.spyOn(SectionList.prototype, "getScrollResponder").mockImplementation(() => ({ scrollTo }) as never);
    const root = await renderScreen([GRILL_STATION_ITEM, SALAD_STATION_ITEM]);
    const sectionList = activePane(root).findByType(SectionList);
    expect(typeof (sectionList.instance as { getListRef?: unknown }).getListRef).toBe("undefined");

    act(() => {
      sectionList.props.onScrollToIndexFailed({ index: 7, highestMeasuredFrameIndex: 3, averageItemLength: 80 });
    });

    expect(scrollTo).toHaveBeenCalledWith({ y: 560, animated: false });
    responderSpy.mockRestore();
  });

  it("selects the Grab 'N Go tab in place (gold underline moves to it) instead of navigating to a separate route, and fetches the hall's Grab 'N Go tid, not its regular hall tid", async () => {
    const root = await renderScreen([PIZZA]);
    mockedFetchMenu.mockResolvedValueOnce([]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });
    expect(mockedRouterPush).not.toHaveBeenCalled();
    expect(mockedFetchMenu).toHaveBeenCalledWith(GRAB_N_GO_TIDS.worcester, expect.any(Date));

    const grabTab = root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" });
    const underline = grabTab.findAllByType(View).at(-1);
    const flatStyle = StyleSheet.flatten(underline!.props.style) as { backgroundColor?: string };
    expect(flatStyle.backgroundColor).toBe(colors.gold500);
  });

  it("renders the Grab tab's own station-grouped items, deduped by dish identity across mealPeriod values sharing one category, distinct from the hall's own meal-tab items", async () => {
    // All 4 real periods present (not just PIZZA's lunch) so Grab lands at the tab sequence's own
    // end, index 4 of 4 -- see this test's own comment below on why that distance matters.
    const root = await renderScreen([PIZZA, OATMEAL, STEAK, LATE_SNACK]);
    mockedFetchMenu.mockResolvedValueOnce([
      { ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", hallTid: GRAB_N_GO_TIDS.worcester, mealPeriod: "lunch" },
      { ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", hallTid: GRAB_N_GO_TIDS.worcester, mealPeriod: "breakfast" },
    ]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Grab Wrap/);
    // Grab sits at the tab sequence's own end (index 4 of 4), so Lunch (index 1) falls outside its
    // ± 1 window and is fully unmounted, not just hidden. A future reorder that puts Grab anywhere
    // but last would put Lunch back in the window (mounted, hidden) and silently break this.
    expect(body).not.toMatch(/Pizza/); // the hall's own lunch-tab item, not shown while on the Grab tab

    // Scoped to the active pane, not the whole tree: Late Night (index 3) IS within Grab's own ± 1
    // window and, with a real item of its own (LATE_SNACK), mounts a second real SectionList
    // alongside Grab's -- a legitimate consequence of tabs now only existing when populated
    // (deriveHallMealTabs), not a bug. activePane() (this file's own helper, doc above) scopes past
    // it to the one pane that's actually visible.
    const sections = activePane(root).findByType(SectionList).props.sections as { title: string; data: MenuItem[] }[];
    expect(sections).toEqual([{ title: "Grab n'Go Hot", data: expect.arrayContaining([expect.objectContaining({ dishName: "Grab Wrap" })]) }]);
    expect(sections[0].data).toHaveLength(1); // deduped, not two identical rows
  });

  // pr-reviewer (#362 REQUEST-CHANGES, finding 1): reintroducing station/price-filtering on
  // grabSectionsMemo (mutating it back to `grabSections(stationPriceFilteredGrabItems, prefs)`) left
  // the full suite green -- nothing exercised the Grab tab with a station filter selected. FilterSheet's
  // "Stations Here" checklist is built from the hall's own `items` (here, PIZZA's "Entrees"), never
  // from `grabItems` -- so selecting "Entrees" must have zero effect on Grab's own "Grab n'Go Hot"
  // section, which this pins directly.
  it("a station filter selected via FilterSheet does not silently empty the Grab 'N Go tab (its own stations aren't in that checklist)", async () => {
    const root = await renderScreen([PIZZA, OATMEAL, STEAK, LATE_SNACK]); // PIZZA's category "Entrees"

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Filters" }).props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Station Entrees" }).props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Done" }).props.onPress();
    });

    mockedFetchMenu.mockResolvedValueOnce([{ ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", hallTid: GRAB_N_GO_TIDS.worcester }]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });

    // Scoped to the active pane -- see the preceding test's comment on why Late Night (also
    // windowed in, also populated) would otherwise add a second SectionList to the tree.
    const sections = activePane(root).findByType(SectionList).props.sections as { title: string; data: MenuItem[] }[];
    expect(sections).toEqual([{ title: "Grab n'Go Hot", data: expect.arrayContaining([expect.objectContaining({ dishName: "Grab Wrap" })]) }]);
  });

  // pr-reviewer (#362 REQUEST-CHANGES round 2): the persisted chips' onPress handlers inside
  // FilterSheet.tsx itself (rendered from THIS screen, via the FAB) had zero coverage above the pure
  // toggleAllergen/toggleDietTag/toggleMacroPreset level -- filtersScreen.test.tsx's interaction
  // tests exercise filters.tsx's own call site, not this one. Reviewer mutated the allergen chip's
  // onPress to a no-op here and the full suite stayed green. This presses all three persisted chip
  // kinds (allergen, diet-tag, macro) through the real FAB -> sheet -> chip path and asserts each
  // toggles into the resulting setPreferences call correctly.
  it("pressing a persisted chip in the FilterSheet (allergen, diet-tag, macro) toggles it and persists via setPreferences", async () => {
    mockedSetPreferences.mockClear();
    const root = await renderScreen([{ ...PIZZA, allergens: ["Peanuts"], dietTags: ["Vegan"] }]);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Filters" }).props.onPress();
    });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Allergen Peanuts" }).props.onPress();
    });
    expect(mockedSetPreferences).toHaveBeenLastCalledWith({ allergensToAvoid: ["Peanuts"], requiredDietTags: [] });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Diet tag Vegan" }).props.onPress();
    });
    expect(mockedSetPreferences).toHaveBeenLastCalledWith({ allergensToAvoid: ["Peanuts"], requiredDietTags: ["Vegan"] });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Macro High Protein" }).props.onPress();
    });
    expect(mockedSetPreferences).toHaveBeenLastCalledWith({ allergensToAvoid: ["Peanuts"], requiredDietTags: ["Vegan"], macroPresets: ["high-protein"] });

    // Pressing the same allergen chip again removes it -- a real toggle, not a one-way add.
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Allergen Peanuts" }).props.onPress();
    });
    expect(mockedSetPreferences).toHaveBeenLastCalledWith({ allergensToAvoid: [], requiredDietTags: ["Vegan"], macroPresets: ["high-protein"] });
  });

  // The single most important regression the swipe pager's windowing could introduce: Grab's own
  // fetch is deliberately lazy (only fires once selectedMeal actually becomes "grab"), and Grab's
  // pane only mounts once it's within the ± 1 window of the active tab -- cycling through the 4 real
  // meal tabs (Breakfast/Lunch/Dinner/Late) never puts Grab (the 5th, last tab) in that window, so
  // it must never fetch.
  it("never fetches Grab 'N Go while only cycling through the 4 real meal tabs (lazy fetch stays lazy under windowing)", async () => {
    // All 4 real periods present -- deriveHallMealTabs hides a period with no item, and this test
    // is specifically about cycling through all 4.
    const root = await renderScreen([PIZZA, SALAD, OATMEAL, STEAK, LATE_SNACK]);
    const callsBefore = mockedFetchMenu.mock.calls.length;

    for (const label of ["Breakfast menu", "Dinner menu", "Late menu", "Lunch menu"]) {
      await act(async () => {
        root.root.findByProps({ accessibilityLabel: label }).props.onPress();
      });
    }

    const grabCalls = mockedFetchMenu.mock.calls.slice(callsBefore).filter(([tid]) => tid === GRAB_N_GO_TIDS.worcester);
    expect(grabCalls).toHaveLength(0);
  });

  it("ignores a stale response for a previously-selected date that resolves after a newer one (network order isn't request order)", async () => {
    let resolveFirst: (items: MenuItem[]) => void = () => {};
    const firstFetch = new Promise<MenuItem[]>((resolve) => {
      resolveFirst = resolve;
    });
    mockedFetchMenu.mockReturnValueOnce(firstFetch).mockResolvedValueOnce([SALAD]);

    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });

    // Step to the next day before the first (still in-flight) fetch has resolved -- its response
    // for the *old* date arrives after the second, newer-date fetch's response.
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).toMatch(/Salad/);

    await act(async () => {
      resolveFirst([PIZZA]);
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Salad/);
    expect(body).not.toMatch(/Pizza/);
  });
});

// Grab 'N Go used to be its own screen (grab-n-go/[slug].tsx, retired) -- these cover what's
// specific to it now that it's the hall screen's 4th tab: its own fetch/date-stepper wiring, its
// own loading/error/empty states, its open/closed subtitle, and the deep link that preselects it.
// Plate/log/nutrition-label/favoriting wiring is already covered above (same shared code path,
// same renderDishRow) -- not duplicated here.
describe("HallMenuScreen Grab 'N Go tab (merged from the retired grab-n-go/[slug].tsx)", () => {
  it("steps the date forward while on the Grab tab and refetches its own menu for the new date, ignoring a stale response for the date navigated away from", async () => {
    // Stepping the date re-fires BOTH the hall's own menu effect and the Grab effect (one shared
    // stepper, per the artboard spec) -- branch the shared fetchMenu mock by which tid it's called
    // with, rather than by call order, since the two effects' fetches can't be told apart by order.
    const grabWrap = { ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", hallTid: GRAB_N_GO_TIDS.worcester };
    const staleGrabItem = { ...grabWrap, dishName: "Stale Grab Item" };
    let resolveStaleGrab!: (items: MenuItem[]) => void;
    const staleGrabFetch = new Promise<MenuItem[]>((resolve) => {
      resolveStaleGrab = resolve;
    });

    mockedFetchMenu.mockImplementation((tid: number) => (tid === GRAB_N_GO_TIDS.worcester ? staleGrabFetch : Promise.resolve([PIZZA])));
    const root = await renderScreen([PIZZA]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });
    // Today's Grab fetch is still pending (staleGrabFetch) -- switch it to resolve with the next
    // date's items before stepping, so the stepped-to date "wins" the race deterministically.
    mockedFetchMenu.mockImplementation((tid: number) => (tid === GRAB_N_GO_TIDS.worcester ? Promise.resolve([grabWrap]) : Promise.resolve([PIZZA])));
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).toMatch(/Grab Wrap/);

    // The first (now-stale) date's response resolves late -- must not overwrite the newer date's.
    await act(async () => {
      resolveStaleGrab([staleGrabItem]);
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Grab Wrap/);
    expect(body).not.toMatch(/Stale Grab Item/);
  });

  it("shows the Grab tab's own error text on a fetch failure, not the hall-menu MenuErrorCard", async () => {
    const root = await renderScreen([PIZZA]);
    mockedFetchMenu.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Failed to load Grab 'N Go menu:.*network down/);
    expect(body).not.toMatch(/Menu didn't load/); // the hall-menu screen's own MenuErrorCard copy
  });

  it("shows the Grab tab's own empty-state message when the day has no Grab 'N Go items", async () => {
    const root = await renderScreen([PIZZA]);
    mockedFetchMenu.mockResolvedValueOnce([]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).toMatch(/No Grab 'N Go menu/);
  });

  it("never shows an inline open/closed subtitle on the Grab tab, for today or once the date stepper moves off today (#180 moved this to HallInfoSheet)", async () => {
    mockFetchHoursAndCache.mockResolvedValueOnce({
      halls: [],
      retail: [{ name: "Worcester Grab ‘N Go", hours: { openTime: "12:00 AM", closeTime: "11:59 PM" } }],
    });
    const root = await renderScreen([PIZZA]);
    mockedFetchMenu.mockResolvedValueOnce([]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/open now/);

    mockedFetchMenu.mockResolvedValueOnce([]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/open now/);
  });

  it("preselects the Grab tab when opened via the ?meal=grab deep link (Home's GRAB 'N GO strip, grabRouteFor)", async () => {
    // Mounting fires the hall's own menu effect too (it doesn't check selectedMeal) -- branch by
    // tid, same reasoning as the date-stepper test above.
    const grabWrap = { ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", hallTid: GRAB_N_GO_TIDS.worcester };
    mockedFetchMenu.mockImplementation((tid: number) => (tid === GRAB_N_GO_TIDS.worcester ? Promise.resolve([grabWrap]) : Promise.resolve([PIZZA])));
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "worcester", meal: "grab" });
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Grab Wrap/);
    expect(mockedFetchMenu).toHaveBeenCalledWith(GRAB_N_GO_TIDS.worcester, expect.any(Date));
  });
});

describe("HallMenuScreen dish favorite star (#282)", () => {
  it("announces role and a descriptive label, not just the star glyph", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    expect(root.root.findByProps({ accessibilityLabel: "Favorite Pizza" }).props.accessibilityRole).toBe("button");
  });
});

describe("HallMenuScreen tap-to-expand dish cards (#117 -- replaces the (i) info button)", () => {
  it("doesn't show serving/macro detail or the nutrition-label link until a card is tapped", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    expect(texts(root).flat().join(" ")).not.toMatch(/FULL NUTRITION LABEL/);
  });

  it("tapping a collapsed card expands it in place: serving summary, diet chips, and the nutrition-label link all appear", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Salad" }).props.onPress();
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Per serving 1 each/);
    expect(body).toMatch(/HALAL/);
    expect(body).toMatch(/GLUTEN-FREE/);
    expect(body).toMatch(/FULL NUTRITION LABEL/);
  });

  it("tapping an already-expanded card collapses it again", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Salad" }).props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Collapse Salad" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/FULL NUTRITION LABEL/);
  });

  it("expanding a different card closes whichever one was already expanded -- at most one card open at a time", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Salad" }).props.onPress();
    });
    expect(root.root.findByProps({ accessibilityLabel: "Collapse Salad" })).toBeDefined();

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Pizza" }).props.onPress();
    });
    // Pizza is now the expanded one, and Salad's card collapsed back down on its own -- not two
    // simultaneously-open cards.
    expect(root.root.findByProps({ accessibilityLabel: "Collapse Pizza" })).toBeDefined();
    expect(root.root.findByProps({ accessibilityLabel: "Expand Salad" })).toBeDefined();
  });

  it("opens the full NutritionLabel modal (existing label screen) from the expanded card's link", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Salad" }).props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Full nutrition label for Salad" }).props.onPress();
    });
    // The modal's subtitle ("<hall> · <category>") only comes from NutritionLabel actually mounting
    // with this dish -- a more specific signal than "Salad" text alone, which the row already shows.
    expect(texts(root).flat()).toContain("Worcester · Entrees");
  });

  // #117 review, finding 1: this link is now the ONLY path to the nutrition label -- the (i) button
  // it replaced was a 44dp square. react-test-renderer does no real layout, so this can't measure
  // actual rendered pixels; it asserts the computed target from the two things that determine it
  // (the Pressable's own minHeight + its hitSlop), same class of check as the occlusion-padding
  // assertions elsewhere in this file that read `.props.style` directly.
  it("keeps the FULL NUTRITION LABEL link's effective tap target at least 44dp (minHeight + hitSlop)", async () => {
    const root = await renderScreen([PIZZA, SALAD]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Salad" }).props.onPress();
    });
    const link = root.root.findByProps({ accessibilityLabel: "Full nutrition label for Salad" });
    const flatStyle = StyleSheet.flatten(link.props.style) as { minHeight?: number };
    const effectiveHeight = (flatStyle.minHeight ?? 0) + verticalHitSlop(link.props.hitSlop);
    expect(effectiveHeight).toBeGreaterThanOrEqual(44);
  });

  it("collapses back to un-expanded when a card reappears after switching meal tabs away and back (expand state keys on dish identity alone, not meal period)", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Pizza" }).props.onPress();
    });
    // findByProps (not findAll) throws unless there's exactly one match -- confirms the card is
    // expanded (an "Expand Pizza"-labeled instance no longer exists) without counting duplicates.
    expect(() => root.root.findByProps({ accessibilityLabel: "Expand Pizza" })).toThrow();

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Breakfast menu" }).props.onPress();
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Lunch menu" }).props.onPress();
    });

    // Back on Lunch: if expand state weren't reset on tab switch, this would still be
    // "Collapse Pizza" and the line below would throw instead of resolving cleanly.
    expect(root.root.findByProps({ accessibilityLabel: "Expand Pizza" })).toBeDefined();
  });
});

// #180: the tab-row "being served now · until X" line (and its #117 wiring test above) is gone --
// serving windows now live ONLY in the hall-info bottom sheet, opened by tapping the title group.
// This replaces that describe block; the NOW-highlight behavior the old test covered is asserted
// on the sheet's own hours card below instead.
describe("HallMenuScreen hall-info sheet wiring (#180)", () => {
  it("never renders the retired tab-row 'being served now' line, even once hours resolve", async () => {
    (mockFetchHoursAndCache as jest.Mock).mockResolvedValueOnce({
      halls: [{ hallTid: 1, breakfast: null, lunch: { openTime: "12:00 AM", closeTime: "11:59 PM" }, dinner: null, latenight: null, general: null }],
      retail: [],
    });
    const root = await renderScreen([PIZZA]);
    await act(async () => {}); // flush fetchHoursAndCache's resolution
    expect(texts(root).flat().join(" ")).not.toMatch(/being served now/);
  });

  it("tapping the title group opens the hall-info sheet; tapping the backdrop closes it again", async () => {
    const root = await renderScreen([PIZZA]);
    await act(async () => {});
    expect(texts(root).flat().join(" ")).not.toMatch(/Dining Commons/); // sheet content not mounted-visible yet

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester info" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).toMatch(/Dining Commons/);

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Close" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/Dining Commons/);
  });

  it("NOW-highlights the hall's current meal period in the sheet's hours card, driven by a mocked clock -- not whatever tab happens to be selected", async () => {
    // Wed 2026-08-19, 12:30 PM local -- inside the mocked lunch window below.
    jest.setSystemTime(new Date(2026, 7, 19, 12, 30, 0, 0));
    (mockFetchHoursAndCache as jest.Mock).mockResolvedValueOnce({
      halls: [
        {
          hallTid: 1,
          breakfast: null,
          lunch: { openTime: "11:00 AM", closeTime: "2:30 PM" },
          dinner: { openTime: "5:00 PM", closeTime: "8:00 PM" },
          latenight: null,
          general: null,
        },
      ],
      retail: [],
    });
    const root = await renderScreen([PIZZA]);
    await act(async () => {});
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester info" }).props.onPress();
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/NOW/);
    expect(body).toMatch(/11:00 AM - 2:30 PM/); // lunch's own window text, next to the NOW pill
  });

  // late-night-2am-day-rollover brief, task 2 REWORK: isSelectedDateToday (line ~1236) compares
  // selectedDate against effectiveToday(now), not raw `now` -- at 12:30 AM selectedDate has already
  // rolled back to the closing day (Aug 19), and a regression back to raw `now` (Aug 20) would make
  // this comparison false right when it should be true, falling the sheet back to the static
  // MEAL_TABS/no-brunch defaults instead of the closing day's real (latenight-only) mealTabs.
  it("at 12:30 AM local, the hall-info sheet's hours rows use the closing day's real (latenight-only) mealTabs, not the static MEAL_TABS fallback", async () => {
    jest.setSystemTime(new Date(2026, 7, 20, 0, 30, 0, 0)); // Aug 20, 12:30 AM local -- selectedDate defaults to Aug 19
    (mockFetchHoursAndCache as jest.Mock).mockResolvedValueOnce({
      halls: [{ hallTid: 1, breakfast: null, lunch: null, dinner: null, latenight: { openTime: "9:00 PM", closeTime: "2:00 AM" }, general: null }],
      retail: [],
    });
    const root = await renderScreen([LATE_SNACK]); // Aug 19's only item is a latenight dish
    await act(async () => {});
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester info" }).props.onPress();
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Late Night/);
    expect(body).toMatch(/NOW/); // 12:30 AM falls inside the mocked 9 PM-2 AM window
    // The static MEAL_TABS fallback would render all 4 rows (Breakfast among them, "not served
    // here"); the closing day's real mealTabs is latenight-only, so Breakfast must not appear.
    expect(body).not.toMatch(/Breakfast/);
  });

  it("fetches this hall's events via shared's fetchEvents, not a hand-rolled call", async () => {
    await renderScreen([PIZZA]);
    await act(async () => {});
    expect(fetchEvents).toHaveBeenCalled();
  });

  // advisor review finding (#442-follow-up): get_infov2 (hoursFeed) only ever publishes TODAY's
  // hours (hallInfoHoursRows' own doc). A stepped-to OTHER day's menu items must not drive which
  // hours rows show/hide or whether lunch reads "Brunch" -- that would filter/relabel today's real
  // hours by some other day's menu shape.
  it("keeps the sheet's full breakfast/lunch/dinner/latenight layout once the date stepper moves off today, instead of filtering by that other day's own (possibly narrower) menu", async () => {
    (mockFetchHoursAndCache as jest.Mock).mockResolvedValueOnce({
      halls: [{ hallTid: 1, breakfast: null, lunch: { openTime: "11:00 AM", closeTime: "2:30 PM" }, dinner: { openTime: "5:00 PM", closeTime: "8:00 PM" }, latenight: null, general: null }],
      retail: [],
    });
    const root = await renderScreen([PIZZA]); // today: lunch only
    await act(async () => {});

    // Step forward -- the new date's menu only has a dinner item, which would derive a
    // dinner-only tab set (and hide breakfast/lunch) if the sheet wrongly used it.
    mockedFetchMenu.mockResolvedValueOnce([STEAK]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester info" }).props.onPress();
    });
    const body = texts(root).flat().join(" ");
    // Breakfast (today's hours have none published -- "not served here") still shows as a row,
    // not silently dropped because the stepped-to day's own menu has no breakfast item.
    expect(body).toMatch(/Breakfast/);
    expect(body).toMatch(/not served here/);
  });
});

describe("HallMenuScreen loading/error states (#181)", () => {
  it("shows the honest skeleton (spinner + copy, not the real dish list) while the menu fetch is pending", async () => {
    let resolveFetch!: (items: MenuItem[]) => void;
    mockedFetchMenu.mockReturnValue(
      new Promise<MenuItem[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    const pendingBody = texts(root).flat().join(" ");
    expect(pendingBody).toMatch(/Getting today's menu from UMass Dining…/);
    expect(pendingBody).not.toMatch(/Pizza/);
    // Header is known without the network -- it renders fully even while pending. The meal tab
    // labels are also known (the guessed MEAL_TABS fallback) but are shimmer placeholders, not
    // real text, until items actually lands -- see the dedicated test below.
    expect(pendingBody).toMatch(/Worcester/);
    expect(pendingBody).not.toMatch(/Lunch/);
    // #181 review finding 2: assert the skeleton bars themselves actually render, not just that
    // the dish list is absent (which an empty EmptyState would also satisfy).
    expect(root.root.findAllByProps({ testID: "skeleton-bar" }).length).toBeGreaterThan(0);

    await act(async () => {
      resolveFetch([PIZZA]);
      await Promise.resolve();
    });
    expect(texts(root).flat().join(" ")).toMatch(/Pizza/);
  });

  it("shows a shimmer placeholder for the meal tab label (not the guessed text) while items are pending, swapping to the real label once items land", async () => {
    let resolveFetch!: (items: MenuItem[]) => void;
    mockedFetchMenu.mockReturnValue(
      new Promise<MenuItem[]>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    const lunchTab = root.root.findByProps({ accessibilityLabel: "Lunch menu" });
    expect(lunchTab.findAllByType(Text)).toHaveLength(0);
    expect(lunchTab.findAllByProps({ testID: "skeleton-bar" }).length).toBeGreaterThan(0);

    await act(async () => {
      resolveFetch([PIZZA]);
      await Promise.resolve();
    });
    const resolvedLunchTab = root.root.findByProps({ accessibilityLabel: "Lunch menu" });
    expect(resolvedLunchTab.findAllByProps({ testID: "skeleton-bar" })).toHaveLength(0);
    expect(resolvedLunchTab.findAllByType(Text).map((n) => n.props.children)).toContain("Lunch");
  });

  it("shows the retry card on a fetch failure, with the exact spec copy, and TRY AGAIN refetches", async () => {
    mockedFetchMenu.mockRejectedValueOnce(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    const errorBody = texts(root).flat().join(" ");
    expect(errorBody).toMatch(/Menu didn't load/);
    expect(errorBody).toMatch(/UMass Dining didn't answer\. Check your connection, or the menu for this date may not be posted yet\./);
    expect(errorBody).not.toMatch(/Pizza/);

    mockedFetchMenu.mockResolvedValueOnce([PIZZA]);
    await act(async () => {
      // Every windowed pane independently renders the retry card (the fetch failure isn't
      // period-specific) -- scope to the active one, the only actually-tappable copy.
      activePane(root).findByProps({ accessibilityLabel: "Try again" }).props.onPress();
    });
    const retriedBody = texts(root).flat().join(" ");
    expect(retriedBody).not.toMatch(/Menu didn't load/);
    expect(retriedBody).toMatch(/Pizza/);
  });

  it("hides the SHOW SAVED COPY link on a fetch failure when no cache exists for this hall+date", async () => {
    mockedFetchMenu.mockRejectedValueOnce(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/SHOW SAVED COPY/);
  });

  it("SHOW SAVED COPY loads the cached menu on tap, when a cache exists for this hall+date", async () => {
    const today = new Date();
    mockMenuCache.set(`1|${today.toDateString()}`, { items: [SALAD], fetchedAt: new Date("2026-08-19T12:00:00.000Z").toISOString() });
    mockedFetchMenu.mockRejectedValue(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    const errorBody = texts(root).flat().join(" ");
    expect(errorBody).toMatch(/SHOW SAVED COPY FROM/);
    expect(errorBody).not.toMatch(/Salad/); // not shown yet -- still on the retry card

    await act(async () => {
      // fetchedAt is fixed at "2026-08-19T12:00:00.000Z" -- 8:00 AM Eastern (this suite runs under
      // TZ=America/New_York), matching formatTime's output for that instant. Scoped to the active
      // pane for the same reason as the "Try again" tap above -- every windowed pane renders it.
      activePane(root).findByProps({ accessibilityLabel: "Show saved copy from 8:00 AM" }).props.onPress();
    });
    const savedBody = texts(root).flat().join(" ");
    expect(savedBody).toMatch(/Salad/);
    expect(savedBody).not.toMatch(/Menu didn't load/);
  });

  it("shows the loading empty-plate bar (disabled LOG, 'add dishes once the menu loads') while pending and the plate is empty", async () => {
    mockedFetchMenu.mockReturnValue(new Promise<MenuItem[]>(() => {})); // never resolves
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Plate is empty/);
    expect(body).toMatch(/add dishes once the menu loads/);
  });

  it("shows the normal empty-plate bar on a fetch failure with an empty plate", async () => {
    mockedFetchMenu.mockRejectedValueOnce(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/search for something not on the menu/);
  });
});

describe("HallMenuScreen plate wiring", () => {
  beforeEach(() => {
    mockAddEntry.mockReset().mockResolvedValue(undefined);
  });

  // Was "does not mount the plate bar while the plate is empty" -- the bar is now always mounted
  // (it's the only entry point into the plate sheet's OFF search, needed just as much with nothing
  // staged as with something on the plate) and shows its empty-state variant instead of unmounting.
  it("mounts the plate bar, in its empty-state variant, while the plate is empty", async () => {
    const root = await renderScreen();
    expect(root.root.findAllByType(PlateBar)).toHaveLength(1);
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
    expect(texts(root).flat().join(" ")).toMatch(/Plate is empty.*search for something not on the menu/);
  });

  it("mounts the plate bar once an item is added, with the item count it reports", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    expect(root.root.findAllByType(PlateBar)).toHaveLength(1);
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(1);
  });

  // pr-reviewer catch: addToPlate used to loop `for (let i = 0; i < count; i++) addOrIncrement(...)`,
  // which silently breaks for a fractional count (looping 1.5 times isn't meaningful) -- fixed to a
  // single addOrIncrement(item, count) call. HoldSlideAddButton's onHoldEnd is the only real caller
  // that ever passes a non-1 count, so this drives it directly (see holdSlideAdd's own comment).
  it("a hold-and-drag add lands the exact fractional count on the plate, not a loop-broken one", async () => {
    const root = await renderScreen();
    holdSlideAdd(root, "Pizza", 1.5);
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(1.5);
    expect(texts(root).flat().join(" ")).toMatch(/1\.5/);
  });

  // Releasing at the bottom of the drag (CANCEL_SERVINGS, 0) must add nothing at all, not clamp
  // to some minimum count -- the whole point of the drag's cancel rung.
  it("releasing a hold-and-drag at the cancel rung (0 servings) adds nothing to the plate", async () => {
    const root = await renderScreen();
    holdSlideAdd(root, "Pizza", 0);
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
  });

  it("tracks the SectionList's bottom padding to the plate bar's measured height (floored by the filter FAB's own clearance), and keeps it once the plate empties again (the bar stays mounted, just switches to its empty-state variant)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");

    // 88 is a real, short measured bar height -- shorter than the filter FAB's own 108+48=156
    // clearance band, so the floor wins here (see plate.test.ts's listBottomPadding unit tests for
    // the boundary itself).
    act(() => {
      root.root.findByType(PlateBar).props.onLayout({ nativeEvent: { layout: { height: 88 } } });
    });
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(156);

    // Step the item back down to 0 -- the row's own stepper minus button removes it, but the bar
    // itself never unmounts, so the list's padding must hold at 156, not collapse to 0.
    stepPlate(root, "Pizza", "Remove one");
    expect(root.root.findAllByType(PlateBar)).toHaveLength(1);
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(156);
  });

  it("LOG writes one addEntry call per plate row, with servings equal to that row's stepped count, and clears the plate on success (mutation b)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    stepPlate(root, "Pizza", "Add one"); // Pizza count -> 2
    addToPlate(root, "Salad"); // Salad count -> 1

    await openSheetAndLog(root);

    expect(mockAddEntry).toHaveBeenCalledTimes(2);
    const bySource = mockAddEntry.mock.calls.map(([entry]) => [entry.source.dishName, entry.servings]);
    expect(bySource).toEqual(
      expect.arrayContaining([
        ["Pizza", 2],
        ["Salad", 1],
      ]),
    );

    // Plate cleared -> bar switches to its empty-state variant (still mounted).
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
    expect(texts(root).flat().join(" ")).toMatch(/Logged 3 items/);
    // Sub-line is the plate's own totals, captured before the plate cleared (Pizza x2 + Salad).
    expect(texts(root).flat().join(" ")).toMatch(/480 cal · 3g protein/);
  });

  it("logs an evening entry under today's LOCAL calendar day, not the UTC-rolled-over day (issue #111)", async () => {
    // 11:30 PM Eastern on Aug 20 is already 3:30 AM UTC on Aug 21 -- stamping loggedAt with
    // `.toISOString()` (UTC) would date-prefix this entry "2026-08-21", which is tomorrow from the
    // logger's own wall clock. Today's list (You pane / SqliteLogStorage) buckets by comparing
    // that prefix against the LOCAL date, so a UTC-stamped entry silently vanishes from today.
    // Assumes Eastern time -- pinned suite-wide via mobile/package.json's `test` script
    // (`TZ=America/New_York jest`; see date.test.ts's header comment for why it can't be set
    // per-test).
    jest.setSystemTime(new Date("2026-08-21T03:30:00.000Z"));

    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root);

    expect(mockAddEntry).toHaveBeenCalledTimes(1);
    const [entry] = mockAddEntry.mock.calls[0];
    expect(entry.loggedAt.startsWith("2026-08-20")).toBe(true);
  });

  it("retains the plate and surfaces a visible failure message when a LOG write rejects partway through, instead of silently clearing", async () => {
    mockAddEntry.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk full"));

    const root = await renderScreen();
    addToPlate(root, "Pizza");
    addToPlate(root, "Salad");

    await openSheetAndLog(root);

    // Plate retained, not cleared -- the bar (and both rows' stepped state) must still be there.
    expect(root.root.findAllByType(PlateBar)).toHaveLength(1);
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(2);

    // The failure banner text is actually present...
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Couldn’t log 1 of 2 items/);

    // ...and not occluded by the (still-mounted, opaque, bottom-anchored) plate bar: the banner
    // must be positioned clear of the bar's measured height, not sitting underneath it at the
    // screen's bottom edge (the PR #78/#84 occlusion-bug class, finding 2).
    act(() => {
      root.root.findByType(PlateBar).props.onLayout({ nativeEvent: { layout: { height: 88 } } });
    });
    // Toast sits 12 (artboard's bar-to-toast gap, ToastLogFailed.dc.html 94 - 82) above the bar.
    expect(findToast(root).props.bottom).toBe(100);
  });

  // failed/total are servings, not rows: a row stepped to 2 counts as 2 items on both sides.
  it("counts a multi-serving row's servings in the failure toast (first row commits, second row of 2 fails)", async () => {
    mockAddEntry.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk full"));
    const root = await renderScreen();
    addToPlate(root, "Salad"); // 1 serving, commits
    addToPlate(root, "Pizza");
    stepPlate(root, "Pizza", "Add one"); // 2 servings, rejects

    await openSheetAndLog(root);

    expect(texts(root).flat().join(" ")).toMatch(/Couldn’t log 2 of 3 items/);
  });

  it("counts a multi-serving row's servings when it commits before the failure (row of 2 commits, next row fails)", async () => {
    mockAddEntry.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk full"));
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    stepPlate(root, "Pizza", "Add one"); // 2 servings, commits
    addToPlate(root, "Salad"); // 1 serving, rejects

    await openSheetAndLog(root);

    expect(texts(root).flat().join(" ")).toMatch(/Couldn’t log 1 of 3 items/);
  });

  // #162: useGuardedLogPlate's `inFlight` ref releases in `finally`, so it releases even when
  // addEntry rejects -- the test above only proves the *banner*, not that the guard itself let go.
  // Same shape as rank.tsx's choose(): a second LOG tap must still reach addEntry, not be dropped
  // as if the first commit were still in flight.
  it("releases the LOG guard after a rejected write, so a subsequent LOG tap still logs successfully (#162)", async () => {
    mockAddEntry.mockReset().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);

    const root = await renderScreen();
    addToPlate(root, "Pizza");

    await openSheetAndLog(root);

    // First tap surfaced the failure per this screen's convention (same banner as the case above)
    // and left the plate/sheet in place -- setSheetOpen(false) only runs on the {ok:true} path.
    expect(texts(root).flat().join(" ")).toMatch(/Couldn’t log 1 of 1 item\b/);
    expect(root.root.findAllByType(PlateBar)).toHaveLength(1);

    const buttonAgain = root.root.findAllByType(Button).find((n) => typeof n.props.children === "string" && /^LOG \d+ ITEMS?$/.test(n.props.children));
    if (!buttonAgain) throw new Error("LOG N ITEMS button not found -- is the sheet still open?");
    await act(async () => {
      await buttonAgain.props.onPress();
    });

    // A second, real addEntry call landing at all (not dropped) proves the guard released despite
    // the throw, and it actually committed this time -- plate cleared, success message shown.
    expect(mockAddEntry).toHaveBeenCalledTimes(2);
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
    expect(texts(root).flat().join(" ")).toMatch(/Logged 1 item\b/);
  });

  // #147: LOG only ever disabled on an empty plate (PlateSheet's own `disabled={plate.length === 0}`
  // prop) -- nothing disabled it while a commit was already running, so a second tap landing before
  // the first's sequential addEntry() writes finished re-ran toLogEntries (fresh ids) and duplicated
  // every row. CONFIRMED via probe: addEntry called 2x for a 1-row plate. Same pattern as
  // logsScreen.test.tsx's "drops a rapid second tap" case -- a controllable deferred addEntry, two
  // synchronous presses, assert exactly one write.
  it("drops a rapid second LOG tap while the first commit is still in flight, instead of duplicating every row (#147)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");

    let resolveAddEntry!: () => void;
    mockAddEntry.mockImplementation(() => new Promise<void>((resolve) => (resolveAddEntry = resolve)));

    act(() => {
      root.root.findByType(PlateBar).props.onPress();
    });
    const button = root.root.findAllByType(Button).find((n) => typeof n.props.children === "string" && /^LOG \d+ ITEMS?$/.test(n.props.children));
    if (!button) throw new Error("LOG N ITEMS button not found -- is the sheet actually open?");

    await act(async () => {
      button.props.onPress(); // starts the guarded commit
      button.props.onPress(); // fires before the first resolves -- must be dropped, not re-run
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddEntry).toHaveBeenCalledTimes(1);

    // Let the first commit settle -- the guard must release, and the successful single write must
    // still clear the plate and show the correct count (not "0 items" from a re-run against an
    // already-emptied plate).
    await act(async () => {
      resolveAddEntry();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
    expect(texts(root).flat().join(" ")).toMatch(/Logged 1 item\b/);
  });

  // #147 (secondary symptom): a tap landing after the in-flight guard already released and the
  // plate was cleared by an earlier successful commit used to still run -- toLogEntries on an empty
  // plate writes nothing, but showed "Logged 0 items" anyway. Exercised by calling the sheet's LOG
  // handler directly once the plate is already empty (react-test-renderer's onPress bypasses the
  // real `disabled` prop -- PR #133's own review notes this suite does no hit-testing -- so this is
  // the guard itself being proven, not the disabled prop standing in for it).
  it("ignores a LOG tap on an already-empty plate instead of showing \"Logged 0 items\" (#147)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    act(() => {
      root.root.findByType(PlateBar).props.onPress();
    });
    // Two "Remove one Pizza" steppers exist once the sheet is open (the SectionList row's own, plus
    // the sheet's per-row stepper) -- either presses the same underlying stepCount call, so pressing
    // the first is enough to empty the plate while the sheet stays mounted (visible).
    act(() => {
      root.root.findAllByProps({ accessibilityLabel: "Remove one Pizza" })[0].props.onPress();
    });

    const button = root.root.findAllByType(Button).find((n) => typeof n.props.children === "string" && /^LOG \d+ ITEMS?$/.test(n.props.children));
    if (!button) throw new Error("LOG N ITEMS button not found -- is the sheet actually open?");

    await act(async () => {
      await button.props.onPress();
    });

    expect(mockAddEntry).not.toHaveBeenCalled();
    expect(texts(root).flat().join(" ")).not.toMatch(/Logged 0 items/);
  });
});

// #198: toggleDishFavorite decided add-vs-remove from the render-closure `favoriteDishKeys` state,
// which only updates after the storage round-trip's setFavoriteDishKeys commits. A second tap on the
// same star landing before that commit reads the same stale (pre-toggle) value as the first tap, so
// both took the *same* branch instead of toggling back -- CONFIRMED via probe below (addFavorite
// called 2x for a single dish, never removeFavorite, on two rapid taps that should have read as
// favorite-then-unfavorite). Same stepper-class bug #147 fixed for LOG -- fixed here via a shared
// per-key drop guard (mobile/src/lib/favoritesStorage.ts's useGuardedToggleFavorite).
describe("HallMenuScreen favorite-star double-tap guard (#198)", () => {
  beforeEach(() => {
    mockFavoritesStorage.getFavorites.mockReset().mockResolvedValue([]);
    mockFavoritesStorage.addFavorite.mockReset();
    mockFavoritesStorage.removeFavorite.mockReset();
  });

  it("drops a rapid second star tap on the same dish while the first toggle is still in flight, instead of double-deciding from stale state", async () => {
    let resolveAdd!: () => void;
    mockFavoritesStorage.addFavorite.mockImplementation(() => new Promise<void>((resolve) => (resolveAdd = resolve)));

    const root = await renderScreen();
    const star = starPressable(root, "Pizza");

    await act(async () => {
      star.props.onPress(); // starts the guarded toggle (not yet favorited -> add)
      star.props.onPress(); // fires before the first resolves -- must be dropped, not re-decided
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFavoritesStorage.addFavorite).toHaveBeenCalledTimes(1);
    expect(mockFavoritesStorage.removeFavorite).not.toHaveBeenCalled();

    // The add committing (a real DB write) is what a follow-up getFavorites read would now
    // reflect -- update the mock to match before letting it resolve, same as a real SQLite read
    // would once the INSERT actually landed.
    mockFavoritesStorage.getFavorites.mockResolvedValue([{ type: "dish", dishName: "Pizza" }]);
    await act(async () => {
      resolveAdd();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Guard released after the single add committed -- a real third tap now correctly reads
    // "favorited" and removes it, proving the guard drops rather than wedges permanently.
    await act(async () => {
      starPressable(root, "Pizza").props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFavoritesStorage.removeFavorite).toHaveBeenCalledTimes(1);
  });
});

describe("HallMenuScreen logged-toast lifecycle (device-pass finding: banner never dismisses, occludes last row)", () => {
  beforeEach(() => {
    mockAddEntry.mockReset().mockResolvedValue(undefined);
  });

  it("auto-dismisses the logged banner a few seconds after it appears", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root);

    expect(texts(root).flat().join(" ")).toMatch(/Logged 1 item/);

    // Comfortably short of any reasonable "a few seconds" timeout -- still showing.
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Logged 1 item/);

    // Comfortably past it -- gone on its own, no further interaction.
    act(() => {
      jest.advanceTimersByTime(4500);
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/Logged 1 item/);
  });

  it("a success toast is the success kind; a failure toast is the failure kind", async () => {
    const ok = await renderScreen();
    addToPlate(ok, "Pizza");
    await openSheetAndLog(ok);
    expect(findToast(ok).props.kind).toBe("success");

    mockAddEntry.mockReset().mockRejectedValueOnce(new Error("disk full"));
    const bad = await renderScreen();
    addToPlate(bad, "Pizza");
    await openSheetAndLog(bad);
    expect(findToast(bad).props.kind).toBe("failure");
    expect(findToast(bad).props.subline).toBeUndefined();
  });

  it("a failure toast does not auto-dismiss", async () => {
    mockAddEntry.mockReset().mockRejectedValueOnce(new Error("disk full"));
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root);

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(root.root.findAllByType(Toast)).toHaveLength(1);
  });

  it("tapping a failure toast dismisses it", async () => {
    mockAddEntry.mockReset().mockRejectedValueOnce(new Error("disk full"));
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root);

    act(() => {
      findToast(root).props.onDismiss();
    });
    expect(root.root.findAllByType(Toast)).toHaveLength(0);
  });

  it("editing the plate dismisses a failure toast", async () => {
    mockAddEntry.mockReset().mockRejectedValueOnce(new Error("disk full"));
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root);
    expect(root.root.findAllByType(Toast)).toHaveLength(1);

    act(() => {
      root.root.findAllByProps({ accessibilityLabel: "Add one Pizza" })[0].props.onPress();
    });
    expect(root.root.findAllByType(Toast)).toHaveLength(0);
  });

  it("keeps the list's bottom padding banner-aware while the banner alone is visible (bar never measured, plate just cleared)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root); // success: plate clears (bar stays mounted, empty-state variant), banner shows

    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
    act(() => {
      findToast(root).props.onLayout({ nativeEvent: { layout: { height: 40 } } });
    });
    // Bar unmeasured (0) still floors to the filter FAB's own 108+48=156 clearance band, plus the
    // banner's 40 on top.
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(196);
  });

  it("adds the banner's measured height on top of the bar's clearance when both are visible (failure path)", async () => {
    mockAddEntry.mockReset().mockRejectedValueOnce(new Error("disk full"));
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root); // failure: plate retained, bar stays up, banner shows too

    act(() => {
      root.root.findByType(PlateBar).props.onLayout({ nativeEvent: { layout: { height: 88 } } });
    });
    act(() => {
      findToast(root).props.onLayout({ nativeEvent: { layout: { height: 40 } } });
    });
    // 88 is still below the filter FAB's 156 clearance floor, so the bar's clearance is 156 (not
    // 88) plus the banner's 40 on top.
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(196);
  });
});

// #177: cafe/[name].tsx's "non-empty fetchMenu" branch renders this same HallMenuScreenBody
// component directly, with a café's {tid, name} (no slug) rather than a DINING_HALLS entry --
// exercised here without going through the route wrapper, same pattern PlateBar.test.tsx etc. use
// for a component in isolation.
const COFFEE: MenuItem = {
  dishName: "Coffee",
  category: "Beverages",
  mealPeriod: "allday",
  hallTid: 32,
  date: "2026-08-19",
  nutrition: nutrition(5),
  allergens: [],
  dietTags: [],
  price: "$3.00",
};

const BAGEL: MenuItem = {
  dishName: "Bagel",
  category: "Beverages",
  mealPeriod: "allday",
  hallTid: 32,
  date: "2026-08-19",
  nutrition: nutrition(250),
  allergens: [],
  dietTags: [],
  // no price -- meta line for this row must render exactly as today (styling spec)
};

async function renderCafeScreen(items: MenuItem[]) {
  mockedFetchMenu.mockResolvedValue(items);
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<HallMenuScreenBody hall={{ tid: 32, name: "People's Organic Coffee" }} />);
  });
  return root;
}

describe("HallMenuScreenBody as a café (#177 -- non-empty fetchMenu path, tid with no slug)", () => {
  it("auto-selects the single 'allday' tab a People's-Organic-shaped café has, with no static 'Lunch' default", async () => {
    const root = await renderCafeScreen([COFFEE, BAGEL]);
    // The tab reads "Daily Offerings" (#378: hallMenuTabs' cafeMealTabLabel override of the
    // "allday" period for café context, not shared's generic "All Day"), and both items show
    // without any tab tap -- a static "lunch" default would show neither, since this café has no
    // lunch tab.
    expect(texts(root).flat()).toContain("Daily Offerings");
    expect(texts(root).flat()).toContain("Coffee");
    expect(texts(root).flat()).toContain("Bagel");
  });

  it("never renders a Grab 'N Go tab for a café (no slug -- not a real DINING_HALLS entry)", async () => {
    const root = await renderCafeScreen([COFFEE]);
    expect(texts(root).flat()).not.toContain("Grab 'N Go");
  });

  it("shows the price folded into the same uniform-color meta string, and renders exactly as today (no price segment) for an unpriced one", async () => {
    const root = await renderCafeScreen([COFFEE, BAGEL]);
    const flat = texts(root).flat();
    // #378 (CafeMenuMixed.dc.html:43): price is no longer its own maroon-highlighted Text --
    // it's the leading segment of the same meta-line string as cal/protein.
    expect(flat).toContain("$3.00 · ");
    // Bagel's meta line is untouched -- calorie/protein text present, no stray price string for it.
    expect(flat).toContain(250);
    expect(flat).toContain("g protein");
  });

  // #219 review, post-#207 rebase: #207 added a REAL title-tap (i) that opens HallInfoSheet for a
  // real hall (see this file's "Worcester info" tests above). RetailLocationHours (what a café
  // actually has) has no per-meal hours breakdown to build a real hoursRows from, and the sheet's
  // title caption is hardcoded "Dining Commons" -- wrong for a café. Rather than ship a decorative
  // glyph that looks identical to the real hall one, or a functional one backed by wrong/empty
  // data, cafés get neither the glyph nor the sheet at all.
  it("renders no info-tap affordance and no hall-info sheet for a café -- HallInfoSheet's data model has no sensible café equivalent", async () => {
    const root = await renderCafeScreen([COFFEE]);
    expect(root.root.findAllByProps({ accessibilityLabel: "People's Organic Coffee info" }).length).toBe(0);
    expect(texts(root).flat().join(" ")).not.toMatch(/Dining Commons/);
  });

  // PR review finding: unlike a real hall (mealTabs is the fixed MEAL_TABS), a café's tab set is
  // derived per-day from whatever periods that day's items actually carry -- a manual tab choice
  // that survives a date step (by design, see the effect's own comment) can point at a period the
  // NEW date simply doesn't serve. That used to silently fall back to tab index 0 while selectedMeal
  // still held the now-absent value, rendering tab 0's real dishes with no tab pill highlighted --
  // that "no tab pill highlighted" symptom is the actual observable bug (content alone can look
  // identical to a legitimate single-tab café), so it's asserted directly below, not just content.
  //
  // Second-round review finding: an earlier version of this test also simulated a swipe afterward,
  // claiming it doubled as a regression test for MealTabPager's countRef/onActiveIndexChangeRef
  // fix. It didn't -- proven by mutation-testing the claim, not just re-reading the code. Every
  // fetch in this screen's effect calls setItems(null) BEFORE the new items resolve, so mealTabs
  // (derived from items) always passes through [] on every date step, which trips the
  // tabs.length===0 guard in [slug].tsx and fully unmounts MealTabPager -- it always remounts fresh
  // afterward with a brand-new PanResponder, never reusing the one built with the old, larger tab
  // count. A café can structurally never reach MealTabPager's stale-closure risk through this
  // integration path at all; that fix's own regression test lives at the MealTabPager level instead
  // (see MealTabPager.test.tsx's "stale-closure resistance" describe block), where the same
  // component instance can actually be kept mounted across a shrinking panes prop.
  it("re-resolves a stale selectedMeal when the tab set shrinks across a date step, healing both the shown content and the tab-row highlight", async () => {
    const cafeBreakfast: MenuItem = { ...COFFEE, dishName: "Oatmeal", category: "Breakfast", mealPeriod: "breakfast" };
    const cafeLunch: MenuItem = { ...COFFEE, dishName: "Sandwich", category: "Lunch", mealPeriod: "lunch" };

    mockedFetchMenu.mockResolvedValueOnce([cafeBreakfast, cafeLunch]);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreenBody hall={{ tid: 32, name: "People's Organic Coffee" }} />);
    });
    expect(texts(root).flat()).toContain("Breakfast");
    expect(texts(root).flat()).toContain("Lunch");

    // Manually select Lunch -- the tab that's about to disappear on the next date.
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Lunch menu" }).props.onPress();
    });
    expect(activePaneTexts(root).flat()).toContain("Sandwich");

    // Step to a date this café only serves breakfast on.
    mockedFetchMenu.mockResolvedValueOnce([cafeBreakfast]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });

    // The stale "lunch" selection must resolve to the only remaining tab -- not silently show
    // Breakfast's real dishes with no tab highlighted.
    expect(texts(root).flat()).not.toContain("Lunch"); // the Lunch tab itself is gone
    expect(activePaneTexts(root).flat().join(" ")).toMatch(/Oatmeal/);

    // The tab pill itself must actually be highlighted -- this is the symptom the pre-fix bug
    // produced (real content, no highlighted tab), and content matching alone can't tell the two
    // apart for a café that only ever has one tab to begin with.
    const breakfastTab = root.root.findByProps({ accessibilityLabel: "Breakfast menu" });
    const underline = breakfastTab.findAllByType(View).at(-1);
    expect(StyleSheet.flatten(underline!.props.style).backgroundColor).toBe(colors.gold500);
    const label = breakfastTab.findByType(Text);
    expect(StyleSheet.flatten(label.props.style).color).toBe(colors.maroon900);
  });

  // pr-reviewer follow-up on platesheet-search-results-parity-gap task 1: a café's selectedMeal
  // starts null (unlike a real hall's static "lunch" default, see selectedMeal's own useState) and
  // only resolves once mealTabs derives from a still-in-flight fetchMenu -- reachable because
  // PlateBar is always tappable even before that resolves (its own doc comment), and the lookup-*
  // stress fixtures open PlateSheet synchronously on mount, before fetchMenu's promise has even had
  // a chance to settle. Renders with a plain (non-awaited) `act` -- not this file's `renderCafeScreen`
  // helper, whose `await act(async ...)` would flush the mocked fetchMenu's already-resolved promise
  // and resolve selectedMeal before this test could observe the gap.
  it("shows no contextLabel at all for a café before its own selectedMeal resolves -- never falls back to the bare hall name mid-load", async () => {
    mockedFetchMenu.mockResolvedValue([COFFEE]); // deliberately not awaited/flushed below
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<HallMenuScreenBody hall={{ tid: 32, name: "People's Organic Coffee" }} stressFixture="lookup-hit" />);
    });

    // PlateSheet's header row is exactly [title Text, contextLabel Text?] -- a header with only
    // the title Text proves contextLabel was omitted (undefined), not that it rendered the wrong
    // string; asserting "no Text saying 'People's Organic Coffee'" alone couldn't tell those apart
    // from a screen where the string just happens to appear somewhere else entirely.
    const title = root.root.findByProps({ children: "Your Plate" });
    const header = title.parent!;
    expect(header.findAllByType(Text)).toHaveLength(1);

    // Flush the still-pending fetchMenu resolution inside a final act() -- left dangling past this
    // test's own synchronous act() above, it resolves later, outside any act(), and React's uncaught-
    // error path there calls window.dispatchEvent, which this environment doesn't have, crashing the
    // whole test process (not just this test).
    await act(async () => {
      await Promise.resolve();
    });
  });
});

describe("HallMenuScreen real-hall dynamic meal tabs (#442-follow-up)", () => {
  it("hides a period with no item that day (Franklin-shaped: no late night) instead of showing an empty Late tab", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL, STEAK]); // breakfast/lunch/dinner, no latenight item
    expect(root.root.findAllByProps({ accessibilityLabel: "Late menu" })).toHaveLength(0);
    expect(texts(root).flat()).not.toContain("Late");
  });

  // advisor review finding: `items` resolving to `[]` (nothing posted for the whole day, e.g. a
  // holiday) is a different case from a single hidden period -- deriveHallMealTabs would otherwise
  // return [], leaving only the Grab tab with no meal tab at all to select or highlight.
  it("falls back to the full 4-tab layout when the day's items resolve to a genuinely empty array (nothing posted, not a per-period gap)", async () => {
    const root = await renderScreen([]);
    for (const label of ["Breakfast menu", "Lunch menu", "Dinner menu", "Late menu"]) {
      expect(() => root.root.findByProps({ accessibilityLabel: label })).not.toThrow();
    }
  });

  it("re-resolves a stale selectedMeal (now hidden) to the first remaining real tab across a date step", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL, STEAK, LATE_SNACK]); // all 4 periods
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Late menu" }).props.onPress();
    });
    expect(activePaneTexts(root).flat().join(" ")).toMatch(/Late Snack/);

    // Step to a day this hall doesn't serve late night on (Franklin-shaped).
    mockedFetchMenu.mockResolvedValueOnce([PIZZA, SALAD, OATMEAL, STEAK]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });

    expect(root.root.findAllByProps({ accessibilityLabel: "Late menu" })).toHaveLength(0);
    // Healed to the first remaining real tab (Breakfast), not stuck on the vanished selection --
    // both the CONTENT shown (pr-reviewer finding: AnimatedTabUnderline's backgroundColor is
    // hardcoded gold on every tab regardless of which is active, per MealTabPager's own styles, so
    // the underline check alone can't discriminate which pane is actually active) and, for the
    // symptom the pre-fix bug itself produced, that the right pill is the one MealTabPager marks
    // active (indexOf-based underline positioning, not color).
    expect(activePaneTexts(root).flat().join(" ")).toMatch(/Oatmeal/);
    const breakfastTab = root.root.findByProps({ accessibilityLabel: "Breakfast menu" });
    const underline = breakfastTab.findAllByType(View).at(-1);
    expect(StyleSheet.flatten(underline!.props.style).backgroundColor).toBe(colors.gold500);
  });

  // The heal effect above must never treat "grab" as a stale MealPeriod selection -- Grab is a real
  // hall's own 5th tab, deliberately never a member of mealTabs (see TabSelection's own doc), so a
  // naive `mealTabs.includes(selectedMeal)` guard alone would yank the user back to mealTabs[0] on
  // every mealTabs change while they're on the Grab tab.
  it("never yanks the user off the Grab tab when mealTabs shrinks across a date step", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL, STEAK, LATE_SNACK]);
    mockedFetchMenu.mockResolvedValueOnce([{ ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", hallTid: GRAB_N_GO_TIDS.worcester }]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });

    // Date step while on Grab refetches both the hall's own items (no late night this time) and
    // Grab's own items, in that effect-declaration order.
    mockedFetchMenu.mockResolvedValueOnce([PIZZA, SALAD, OATMEAL, STEAK]);
    mockedFetchMenu.mockResolvedValueOnce([{ ...PIZZA, dishName: "Grab Wrap", category: "Grab n'Go Hot ", hallTid: GRAB_N_GO_TIDS.worcester }]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });

    // CONTENT check, not just the underline color (see the preceding test's comment on why
    // AnimatedTabUnderline's color alone can't discriminate which pane is active) -- if the guard
    // were removed, the heal effect would fire and swipe the user onto mealTabs[0] (Breakfast),
    // replacing this Grab Wrap content with Oatmeal's.
    expect(activePaneTexts(root).flat().join(" ")).toMatch(/Grab Wrap/);
    const grabTab = root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" });
    const underline = grabTab.findAllByType(View).at(-1);
    expect(StyleSheet.flatten(underline!.props.style).backgroundColor).toBe(colors.gold500);
  });
});

// #284 nit 2: an unresolved slug (only reachable via a crafted deep link, see the issue) rendered
// a bare "Unknown dining hall" string with no way back -- a dead end. Fixed by drawing the same
// back-chevron Pressable every other header-less route already uses.
describe("HallMenuScreen -- unknown slug", () => {
  it("renders a Back affordance instead of a dead end", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "totally-not-a-real-hall" });
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    expect(root.root.findAllByProps({ accessibilityLabel: "Back" }).length).toBeGreaterThan(0);
    expect(texts(root).flat()).toContain("Unknown dining hall");
  });
});

// Badge-pop-in bug: the screen's prefs state used to always start as a bare placeholder with no
// macroPresets field, so a matching dish rendered with zero badges on first paint no matter what
// the user had saved, then gained them once the async getPreferences() read resolved -- an owner-
// reported "badges appear out of nowhere" flash. Fixed by seeding initial state from
// getCachedPreferences() (preferences.ts's in-memory cache, warmed at app launch). Placed at the
// end of this file, not alongside the other renderScreen() suites above -- recordSeenMock() (seen-
// dish tracking describe) reads call counts off a module-scoped singleton never reset between
// tests, so an earlier extra render() here would throw off its "called exactly once" assertion.
describe("HallMenuScreen macro badges: no pop-in from a warm cache (#reported 2026-09-12)", () => {
  const HIGH_PROTEIN_DISH: MenuItem = { ...PIZZA, dishName: "Chicken Breast", nutrition: { ...nutrition(200), proteinG: 25 } };

  afterEach(() => {
    mockedGetCachedPreferences.mockReturnValue(undefined);
  });

  it("renders a matching dish's macro badge from the very first frame when the cache is already warm", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["high-protein"] });

    const root = await renderScreen([HIGH_PROTEIN_DISH]);

    expect(root.root.findAllByProps({ accessibilityLabel: "High Protein" }).length).toBeGreaterThan(0);
  });

  // pr-reviewer catch on the badge-tuck diff: gating the flow badge row's visibility on
  // `measured` (DishRow, halls/[slug].tsx) hid EVERY badged row's badges -- not just wrapping
  // ones -- until its onLayout/onTextLayout pair resolved. react-test-renderer never fires either
  // (nothing in this test invokes them), so under that bug this dish's badge would stay
  // permanently opacity:0 despite being present in the tree -- the presence-only assertion above
  // can't see that. Walks every ancestor's flattened style looking for a literal `opacity: 0`.
  it("renders that badge fully visible, not permanently opacity:0 pending a measurement this test never fires", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["high-protein"] });

    const root = await renderScreen([HIGH_PROTEIN_DISH]);

    let node: renderer.ReactTestInstance | null = root.root.findByProps({ accessibilityLabel: "High Protein" });
    const opacities: number[] = [];
    while (node) {
      const flat = StyleSheet.flatten(node.props?.style);
      if (flat && typeof flat.opacity === "number") opacities.push(flat.opacity);
      node = node.parent;
    }
    expect(opacities).not.toContain(0);
  });

  it("without a warm cache, the same dish renders with no macro badge (documents the gap a cold cache still leaves)", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce(undefined);

    const root = await renderScreen([HIGH_PROTEIN_DISH]);

    expect(root.root.findAllByProps({ accessibilityLabel: "High Protein" }).length).toBe(0);
  });
});

describe("DishRow meta line: fiber vs. protein (#reported 2026-09-12)", () => {
  const HIGH_FIBER_DISH: MenuItem = {
    ...PIZZA,
    dishName: "Lentil Soup",
    nutrition: { ...nutrition(200), proteinG: 10, dietaryFiberG: 5 },
  };

  afterEach(() => {
    mockedGetCachedPreferences.mockReturnValue(undefined);
  });

  it("shows fiber instead of protein when the high-fiber badge is active for this dish", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["high-fiber"] });

    const root = await renderScreen([HIGH_FIBER_DISH]);
    const flat = texts(root).flat();

    expect(flat).toContain("g fiber");
    expect(flat).not.toContain("g protein");
  });

  it("keeps showing protein for the same qualifying dish when the high-fiber preset isn't toggled on", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce({ allergensToAvoid: [], requiredDietTags: [], macroPresets: [] });

    const root = await renderScreen([HIGH_FIBER_DISH]);
    const flat = texts(root).flat();

    expect(flat).toContain("g protein");
    expect(flat).not.toContain("g fiber");
  });
});

// Badge-tuck wiring (measure-then-position, see hallMenuBadgeLayout.ts's shouldTuckBadges for the
// pure math, unit-tested on its own there). These exercise the actual onLayout/onTextLayout wiring
// react-test-renderer never fires on its own -- fired manually here, same idiom as the existing
// `.props.onLayout({ nativeEvent: { layout: { height: 88 } } })` calls elsewhere in this file.
describe("DishRow badge-tuck wiring (halls/[slug].tsx)", () => {
  const WRAP_DISH: MenuItem = { ...PIZZA, dishName: "Wrap Candidate Dish", nutrition: { ...nutrition(200), proteinG: 25 } };

  afterEach(() => {
    mockedGetCachedPreferences.mockReturnValue(undefined);
  });

  function findRowNameLine(root: renderer.ReactTestRenderer, dishName: string) {
    const nameText = root.root.findByProps({ children: dishName });
    const rowNameLine = nameText.parent;
    if (!rowNameLine) throw new Error("dish name Text has no parent");
    return { nameText, rowNameLine };
  }

  function findMacroBadgeRowStyles(rowNameLine: renderer.ReactTestInstance) {
    return rowNameLine
      .findAll((node) => node.type === View && StyleSheet.flatten(node.props.style)?.flexDirection === "row" && "gap" in (StyleSheet.flatten(node.props.style) ?? {}))
      .filter((node) => node !== rowNameLine)
      .map((node) => StyleSheet.flatten(node.props.style));
  }

  it("absolutely positions the badge row over the wrapped last line's trailing space when it fits", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["high-protein"] });
    const root = await renderScreen([WRAP_DISH]);
    const { nameText, rowNameLine } = findRowNameLine(root, WRAP_DISH.dishName);

    act(() => {
      rowNameLine.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
      nameText.props.onTextLayout({
        nativeEvent: {
          lines: [
            { x: 0, y: 0, width: 280, height: 16 },
            { x: 0, y: 16, width: 50, height: 16 },
          ],
        },
      });
    });

    const badgeRowStyles = findMacroBadgeRowStyles(rowNameLine);
    expect(badgeRowStyles).toHaveLength(1);
    expect(badgeRowStyles[0].position).toBe("absolute");
    // top centers a 15px badge glyph on the 16px-tall last line -- independent of the
    // name-to-badge gap (a spacing() value, scale-dependent, not asserted here).
    expect(badgeRowStyles[0].top).toBeCloseTo(16.5, 5);
    // left sits strictly after the last line's own trailing edge (x=0, width=50), whatever the
    // exact gap is, and comfortably inside the 300px container.
    expect(badgeRowStyles[0].left).toBeGreaterThan(50);
    expect(badgeRowStyles[0].left).toBeLessThan(300);
  });

  it("falls back to the stacked own-line layout when the badge row doesn't fit beside the wrapped last line", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["high-protein"] });
    const root = await renderScreen([WRAP_DISH]);
    const { nameText, rowNameLine } = findRowNameLine(root, WRAP_DISH.dishName);

    act(() => {
      rowNameLine.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
      nameText.props.onTextLayout({
        nativeEvent: {
          lines: [
            { x: 0, y: 0, width: 280, height: 16 },
            { x: 0, y: 16, width: 290, height: 16 },
          ],
        },
      });
    });

    const badgeRowStyles = findMacroBadgeRowStyles(rowNameLine);
    expect(badgeRowStyles).toHaveLength(1);
    expect(badgeRowStyles[0].position).not.toBe("absolute");
  });

  it("never tucks a single-line (unwrapped) name -- renders the flow badge row even once measured", async () => {
    mockedGetCachedPreferences.mockReturnValueOnce({ allergensToAvoid: [], requiredDietTags: [], macroPresets: ["high-protein"] });
    const root = await renderScreen([WRAP_DISH]);
    const { nameText, rowNameLine } = findRowNameLine(root, WRAP_DISH.dishName);

    act(() => {
      rowNameLine.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
      nameText.props.onTextLayout({ nativeEvent: { lines: [{ x: 0, y: 0, width: 120, height: 16 }] } });
    });

    const badgeRowStyles = findMacroBadgeRowStyles(rowNameLine);
    expect(badgeRowStyles).toHaveLength(1);
    expect(badgeRowStyles[0].position).not.toBe("absolute");
  });
});

// screenshot.sh has no gesture for opening the plate sheet AND typing a query, so the lookup-dish
// evidence for brief foodpro-menu-expansion task 4 depends entirely on this route-level wiring:
// `?stress=lookup-fetching` (and -miss/-rate-limited) must auto-open PlateSheet and drive it into
// the real runDirectLookup state, from navigation alone -- unit-tested here since it was previously
// unverified (the pre-existing "lookup-hit" fixture this generalizes had no test of its own either).
describe("HallMenuScreen lookup-dish stress fixtures (brief foodpro-menu-expansion task 4)", () => {
  it("stress=lookup-fetching auto-opens the plate sheet and reaches PlateSheet's real 'loading' state, from navigation alone", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "worcester", stress: "lookup-fetching" });
    const root = await renderScreen();

    // Chained effects (halls/[slug].tsx opens the sheet -> PlateSheet seeds the query -> PlateSheet
    // fires runDirectLookup) span more than one commit -- flush microtasks so they all settle.
    await act(async () => {
      await Promise.resolve();
    });

    const body = root.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .flat()
      .join(" ");
    expect(body).toMatch(/Looking up\s+flatbread/i);
  });

  // platesheet-search-results-parity-gap task 1, pr-reviewer follow-up: PlateSheet.test.tsx and
  // hallMenuTabs.test.ts only ever hand PlateSheet/plateSheetContextLabel their inputs directly --
  // neither exercises the actual [slug].tsx call site that wires selectedMeal into contextLabel,
  // which is exactly the line that regressed originally (contextLabel={hall.name} alone). This
  // reuses the same lookup-* auto-open wiring the test above already exercises, so PlateSheet is
  // actually mounted and visible through real navigation, not a direct render.
  it("wires the active meal into PlateSheet's contextLabel through real navigation (not just hall.name)", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "worcester", stress: "lookup-hit" });
    const root = await renderScreen();

    await act(async () => {
      await Promise.resolve();
    });

    expect(root.root.findByProps({ children: "Worcester · Lunch" })).toBeTruthy();
  });

  it("stress=lookup-miss auto-opens the plate sheet, resolves to a genuine miss, and adds no new message", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "worcester", stress: "lookup-miss" });
    const root = await renderScreen();

    await act(async () => {
      await Promise.resolve();
    });

    const body = root.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .flat()
      .join(" ");
    // miss is a non-change to the empty state -- no new message, no spinner-row leftover. (The
    // standing "Create a custom food" footer is gated on a completed merged search, which this
    // route-wiring fixture never runs -- its own miss-state resolution is already covered by
    // PlateSheet.test.tsx.)
    expect(body).not.toMatch(/doesn.t have this dish either/i);
    expect(body).not.toMatch(/Looking up/i);
  });

  it("stress=lookup-rate-limited auto-opens the plate sheet and reaches the rate_limited inline row", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "worcester", stress: "lookup-rate-limited" });
    const root = await renderScreen();

    await act(async () => {
      await Promise.resolve();
    });

    const body = root.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .flat()
      .join(" ");
    expect(body).toMatch(/maxed out for the hour/i);
  });
});

// Composite dish (bowl composer) -- foodpro-menu-expansion brief, task 2. compositeDishFor's
// name-keyed lookup only recognizes TERIYAKI_BOWL/ALL_ADD_INS's exact dish names (see its own
// __DEV__-gated doc comment in [slug].tsx) -- there is no real base->add-in data source yet.
describe("Composite dish (bowl composer)", () => {
  function findComposer(root: renderer.ReactTestRenderer) {
    return root.root.findByType(CompositeDishComposer);
  }

  // ALL_ADD_INS items are real catalog dishes in their own right (composite-dish-logic
  // annotation), so they're deliberately ALSO present in the hall's own menu pool for
  // compositeDishFor to resolve them from -- meaning an add-in dish name can render TWICE once the
  // composer is open: once as its own ordinary hall row, once as a composer add-in row. These two
  // helpers scope the query to the composer's own subtree so tests interact with the right one.
  function composerAdd(root: renderer.ReactTestRenderer, dishName: string) {
    act(() => {
      findComposer(root).findByProps({ accessibilityLabel: `Add ${dishName} to plate` }).props.onPress();
    });
  }
  function composerStep(root: renderer.ReactTestRenderer, dishName: string, dir: "Add one" | "Remove one") {
    act(() => {
      findComposer(root).findByProps({ accessibilityLabel: `${dir} ${dishName}` }).props.onPress();
    });
  }

  it("shows the computed base-alone -> base+every-add-in range, recomputed from the live add-in list, not a static number", async () => {
    const full = await renderScreen([TERIYAKI_BOWL, ...ALL_ADD_INS]);
    expect(texts(full).flat().join(" ")).toMatch(/260\s*–\s*440\s*cal\s*·\s*10\s*–\s*15\s*g\s*protein/);

    // Fewer add-ins in the catalog -> a narrower range, proving this is computed fresh, not a
    // number cached at fixture-build time.
    const partial = await renderScreen([TERIYAKI_BOWL, EDAMAME]);
    expect(texts(partial).flat().join(" ")).toMatch(/260\s*–\s*305\s*cal\s*·\s*10\s*–\s*14\s*g\s*protein/);
  });

  it("routes the not-yet-composed control to the composer sheet -- no hold-drag control renders on it at all", async () => {
    const root = await renderScreen([TERIYAKI_BOWL, ...ALL_ADD_INS]);
    // No HoldSlideAddButton for the composite dish's own row -- the annotation's "no servings
    // count is worth pre-choosing before add-ins exist", so hold-drag never even mounts here.
    expect(root.root.findAllByType(HoldSlideAddButton).find((b) => b.props.dishName === "Teriyaki Noodle Bowl")).toBeUndefined();
    expect(findComposer(root).props.visible).toBe(false);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Build Teriyaki Noodle Bowl" }).props.onPress();
    });

    expect(findComposer(root).props.visible).toBe(true);
    expect(findComposer(root).props.base?.dishName).toBe("Teriyaki Noodle Bowl");
    expect(findComposer(root).props.addIns.map((i: MenuItem) => i.dishName).sort()).toEqual(
      ["Edamame", "Fried Shallots", "Shredded Carrot", "Sriracha Mayo"].sort(),
    );
  });

  it("add-in rows carry their own real cal/protein, and live totals sum base + every selection, recomputed on every step", async () => {
    const root = await renderScreen([TERIYAKI_BOWL, ...ALL_ADD_INS]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Build Teriyaki Noodle Bowl" }).props.onPress();
    });

    const flatBeforeSelection = texts(root).flat();
    expect(flatBeforeSelection).toContain(45); // Edamame's own calories
    expect(flatBeforeSelection).toContain(4); // Edamame's own protein
    // Base total, nothing selected yet.
    expect(flatBeforeSelection).toContain("260");

    composerAdd(root, "Edamame"); // quick-add -> 1 unit
    expect(texts(root).flat()).toContain("305"); // 260 + 45

    composerStep(root, "Edamame", "Add one"); // -> 2 units
    expect(texts(root).flat()).toContain("350"); // 260 + 45*2
  });

  it('"Add to Plate" commits exactly one PlateEntry for the whole composed dish and closes the sheet', async () => {
    const root = await renderScreen([TERIYAKI_BOWL, ...ALL_ADD_INS]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Build Teriyaki Noodle Bowl" }).props.onPress();
    });
    composerAdd(root, "Edamame");
    composerAdd(root, "Shredded Carrot");

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add to Plate" }).props.onPress();
    });

    expect(findComposer(root).props.visible).toBe(false);
    // ONE composed dish, count 1 -- not base(1) + edamame(1) + carrot(1) = 3 separate rows.
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(1);

    // Pixel-identity proxy (screenshot is the real evidence, see PR body): once composed and
    // in-plate, the row falls straight through PlateAddControl's unmodified `inPlate` branch --
    // no HoldSlideAddButton, no bowl button, just the ordinary +/- stepper.
    expect(root.root.findAllByType(HoldSlideAddButton).find((b) => b.props.dishName === "Teriyaki Noodle Bowl")).toBeUndefined();
    expect(root.root.findByProps({ accessibilityLabel: "Remove one Teriyaki Noodle Bowl" })).toBeDefined();
    expect(root.root.findByProps({ accessibilityLabel: "Add one Teriyaki Noodle Bowl" })).toBeDefined();
  });

  it('expanding a composed, in-plate row shows "Edit add-ins", reopening the composer pre-filled with the saved selection', async () => {
    const root = await renderScreen([TERIYAKI_BOWL, ...ALL_ADD_INS]);
    act(() => root.root.findByProps({ accessibilityLabel: "Build Teriyaki Noodle Bowl" }).props.onPress());
    composerAdd(root, "Edamame");
    act(() => root.root.findByProps({ accessibilityLabel: "Add to Plate" }).props.onPress());

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Expand Teriyaki Noodle Bowl" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).toMatch(/EDIT ADD-INS/);
    // The composed row's own expand target replaces FULL NUTRITION LABEL, doesn't add to it.
    expect(root.root.findAllByProps({ accessibilityLabel: "Full nutrition label for Teriyaki Noodle Bowl" })).toHaveLength(0);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Edit add-ins for Teriyaki Noodle Bowl" }).props.onPress();
    });
    const composer = findComposer(root);
    expect(composer.props.visible).toBe(true);
    expect(composer.props.initialRecipe?.addIns.map((a: { item: MenuItem }) => a.item.dishName)).toEqual(["Edamame"]);
  });

  it("re-adds the last-saved recipe directly after stepping a composed dish back to 0, without reopening the composer", async () => {
    const root = await renderScreen([TERIYAKI_BOWL, ...ALL_ADD_INS]);
    act(() => root.root.findByProps({ accessibilityLabel: "Build Teriyaki Noodle Bowl" }).props.onPress());
    composerAdd(root, "Edamame");
    act(() => root.root.findByProps({ accessibilityLabel: "Add to Plate" }).props.onPress());
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(1);

    stepPlate(root, "Teriyaki Noodle Bowl", "Remove one"); // 1 -> 0, row removed
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
    expect(findComposer(root).props.visible).toBe(false);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add Teriyaki Noodle Bowl with your saved add-ins" }).props.onPress();
    });

    expect(root.root.findByType(PlateBar).props.itemCount).toBe(1);
    // No composer round-trip.
    expect(findComposer(root).props.visible).toBe(false);
  });
});

// Head-to-head compare (docs/briefs/head-to-head-compare.md task 3): "Rate them" on the logged toast
// opens the compare sheet, a pick records through SqliteRankingStorage and shows the "Another" toast.
describe("HallMenuScreen head-to-head compare", () => {
  const pastEntry = (dishName: string, hallTid: number, calories: number): LogEntry =>
    ({ id: `past-${dishName}-${hallTid}`, loggedAt: "2026-08-01T12:00:00.000", source: { type: "umass-menu", dishName, hallTid }, servings: 1, nutrition: nutrition(calories) }) as LogEntry;

  // addEntry persists into what getAllEntries returns, like the real storage: a plate logged now is
  // in the log by the time the screen goes looking for "dishes logged before this plate".
  function storeLog(past: LogEntry[]) {
    const stored = [...past];
    mockAddEntry.mockReset().mockImplementation(async (e: LogEntry) => {
      stored.push(e);
    });
    mockGetAllEntries.mockImplementation(async () => [...stored]);
  }

  const toastAction = (root: renderer.ReactTestRenderer) => findToast(root).props.action as { label: string; onPress: () => void } | undefined;
  const sheet = (root: renderer.ReactTestRenderer) => root.root.findByType(CompareSheet);
  const pairNames = (root: renderer.ReactTestRenderer) => (sheet(root).props.pair as { dishName: string }[]).map((d) => d.dishName);
  const sheetTexts = (root: renderer.ReactTestRenderer) =>
    sheet(root)
      .findAllByType(Text)
      .map((n) => n.props.children);
  // The Pressable behind a label inside the sheet -- a real press, so CompareSheet's own guards run.
  function sheetPress(root: renderer.ReactTestRenderer, label: string) {
    let n = sheet(root).findAllByType(Text).find((t) => t.props.children === label)!.parent;
    while (n && typeof n.props.onPress !== "function") n = n.parent;
    return n!.props.onPress as () => void;
  }

  async function logAndRate(past: LogEntry[], plateDishes = ["Pizza"], items: MenuItem[] = [PIZZA, SALAD]) {
    storeLog(past);
    const root = await renderScreen(items);
    for (const d of plateDishes) addToPlate(root, d);
    await openSheetAndLog(root);
    return root;
  }
  async function openCompare(root: renderer.ReactTestRenderer) {
    await act(async () => {
      toastAction(root)!.onPress();
    });
  }

  it("offers 'Rate them' on the logged toast when a past dish exists, and no action when none does", async () => {
    const withPast = await logAndRate([pastEntry("Soup", 3, 120)]);
    expect(toastAction(withPast)?.label).toBe("Rate them");

    const first = await logAndRate([]);
    expect(findToast(first).props.kind).toBe("success");
    expect(toastAction(first)).toBeUndefined();
  });

  it("never pairs two dishes from the same plate: a first-ever two-dish log has no action", async () => {
    const root = await logAndRate([], ["Pizza", "Salad"]);
    expect(toastAction(root)).toBeUndefined();
  });

  it("the same dish logged before is not an opponent for itself", async () => {
    const root = await logAndRate([pastEntry("Pizza", 1, 200)], ["Pizza"]);
    expect(toastAction(root)).toBeUndefined();
  });

  it("pairs the plate's least-compared dish with a past dish, never with the rest of the plate", async () => {
    mockRanking.seed([{ dishName: "Pizza", hallTid: 1, rating: 1200, comparisonCount: 5 }], []);
    const root = await logAndRate([pastEntry("Soup", 3, 120)], ["Pizza", "Salad"]);
    await openCompare(root);
    // Salad has 0 comparisons vs Pizza's 5, so Salad is the just-logged dish; Soup is the only past dish.
    expect(pairNames(root)).toEqual(["Salad", "Soup"]);
  });

  it("tapping 'Rate them' opens the compare sheet with hall and calories on each card, and dismisses the toast", async () => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)]);
    expect(sheet(root).props.visible).toBe(false);
    await openCompare(root);
    expect(sheet(root).props.visible).toBe(true);
    expect(root.root.findAllByType(Toast)).toHaveLength(0);
    expect(sheetTexts(root)).toEqual(["Which did you like more?", "Pizza", "Worcester · 200 cal", "or", "Soup", "Hampshire · 120 cal", "Skip"]);
  });

  it("a plate serving of 2 is still one dish: cards show per-serving calories and one comparison is recorded", async () => {
    storeLog([pastEntry("Soup", 3, 120)]);
    const root = await renderScreen([PIZZA, SALAD]);
    addToPlate(root, "Pizza");
    stepPlate(root, "Pizza", "Add one");
    await openSheetAndLog(root);
    await openCompare(root);
    expect(sheetTexts(root)).toContain("Worcester · 200 cal");
    await act(async () => sheetPress(root, "Pizza")());
    expect(mockRanking.saveRankedDishes.mock.calls[0][0].find((d: { dishName: string }) => d.dishName === "Pizza").comparisonCount).toBe(1);
  });

  it.each([
    ["Pizza", "Soup"],
    ["Soup", "Pizza"],
  ])("picking %s over %s records that winner on both Elo tracks, closes the sheet and shows the 'Another' toast", async (winner, loser) => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)], ["Pizza", "Salad"]); // three logged dishes, so there is another pair to offer
    await openCompare(root);
    await act(async () => sheetPress(root, winner)());

    expect(mockRanking.saveRankedDishes).toHaveBeenCalledTimes(1);
    expect(mockRanking.saveRankedFoods).toHaveBeenCalledTimes(1);
    for (const saved of [mockRanking.saveRankedDishes.mock.calls[0][0], mockRanking.saveRankedFoods.mock.calls[0][0]] as { dishName: string; rating: number; comparisonCount: number }[][]) {
      const w = saved.find((r) => r.dishName === winner)!;
      const l = saved.find((r) => r.dishName === loser)!;
      expect(w.comparisonCount).toBe(1);
      expect(l.comparisonCount).toBe(1);
      expect(w.rating).toBeGreaterThan(l.rating);
    }
    expect(sheet(root).props.visible).toBe(false);
    expect(findToast(root).props.kind).toBe("success");
    expect(findToast(root).props.message).toBe(winner);
    expect(findToast(root).props.subline).toBe("1 comparison"); // below the score gate: count only
    expect(toastAction(root)?.label).toBe("Another");
  });

  it("a double tap on a card records once", async () => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)]);
    await openCompare(root);
    const press = sheetPress(root, "Soup");
    await act(async () => {
      press();
      press();
    });
    expect(mockRanking.saveRankedDishes).toHaveBeenCalledTimes(1);
    expect(mockRanking.saveRankedFoods).toHaveBeenCalledTimes(1);
    expect(mockRanking.saveRankedDishes.mock.calls[0][0].find((d: { dishName: string }) => d.dishName === "Soup").comparisonCount).toBe(1);
  });

  // pickPair draws by index into the logged dishes (first-seen order: Soup, Pizza, Salad), three
  // Math.random() samples per candidate slot. Scripting them makes the FIRST candidate the pair
  // just shown, so a re-deal that forgets to exclude it is caught deterministically; the second
  // candidate is Salad vs Pizza.
  const idx = (i: number) => (i + 0.5) / 3;
  const SHOWN_THEN_FRESH = [1, 1, 1, 0, 0, 0, 2, 2, 2, 1, 1, 1].map(idx); // (Pizza, Soup), then (Salad, Pizza)
  async function scripted(seq: number[], fn: () => Promise<void>) {
    const queue = [...seq];
    let n = 0;
    const spy = jest.spyOn(Math, "random").mockImplementation(() => queue.shift() ?? [0.1, 0.9][n++ % 2]);
    try {
      await fn();
    } finally {
      spy.mockRestore();
    }
  }
  const sorted = (root: renderer.ReactTestRenderer) => [...pairNames(root)].sort();

  it("Skip records nothing and never re-deals the pair on screen (three dishes)", async () => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)], ["Pizza", "Salad"]);
    await openCompare(root);
    expect(sorted(root)).toEqual(["Pizza", "Soup"]);
    await scripted(SHOWN_THEN_FRESH, async () => {
      await act(async () => sheetPress(root, "Skip")());
    });

    expect(mockRanking.saveRankedDishes).not.toHaveBeenCalled();
    expect(mockRanking.saveRankedFoods).not.toHaveBeenCalled();
    expect(sheet(root).props.visible).toBe(true);
    expect(sorted(root)).toEqual(["Pizza", "Salad"]);
  });

  it("'Another' reopens the sheet on a pair other than the one just picked, and dismisses the toast (three dishes)", async () => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)], ["Pizza", "Salad"]);
    await openCompare(root);
    expect(sorted(root)).toEqual(["Pizza", "Soup"]);
    await scripted(SHOWN_THEN_FRESH, async () => {
      await act(async () => sheetPress(root, "Pizza")());
    });
    expect(toastAction(root)?.label).toBe("Another");
    await act(async () => {
      toastAction(root)!.onPress();
    });
    expect(sheet(root).props.visible).toBe(true);
    expect(root.root.findAllByType(Toast)).toHaveLength(0);
    expect(sorted(root)).toEqual(["Pizza", "Salad"]);
  });

  it("with only two logged dishes a pick's toast has no 'Another' (there is no other pair)", async () => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)]);
    await openCompare(root);
    await act(async () => sheetPress(root, "Pizza")());
    expect(findToast(root).props.message).toBe("Pizza");
    expect(mockRanking.saveRankedDishes).toHaveBeenCalledTimes(1);
    expect(toastAction(root)).toBeUndefined();
  });

  it("with only two logged dishes Skip closes the sheet and records nothing", async () => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)]);
    await openCompare(root);
    await act(async () => sheetPress(root, "Skip")());
    expect(sheet(root).props.visible).toBe(false);
    expect(mockRanking.saveRankedDishes).not.toHaveBeenCalled();
    expect(mockRanking.saveRankedFoods).not.toHaveBeenCalled();
  });

  it("a backdrop tap closes the sheet without recording anything", async () => {
    const root = await logAndRate([pastEntry("Soup", 3, 120)]);
    await openCompare(root);
    act(() => sheet(root).findByProps({ accessibilityLabel: "Close" }).props.onPress());
    expect(sheet(root).props.visible).toBe(false);
    expect(mockRanking.saveRankedDishes).not.toHaveBeenCalled();
  });

  it("a toast with an action stays 6s; one without stays 4s", async () => {
    const withAction = await logAndRate([pastEntry("Soup", 3, 120)]);
    act(() => jest.advanceTimersByTime(toastActionDwell - 100));
    expect(withAction.root.findAllByType(Toast)).toHaveLength(1);
    act(() => jest.advanceTimersByTime(200));
    expect(withAction.root.findAllByType(Toast)).toHaveLength(0);

    const without = await logAndRate([]);
    act(() => jest.advanceTimersByTime(toastDwell - 100));
    expect(without.root.findAllByType(Toast)).toHaveLength(1);
    act(() => jest.advanceTimersByTime(200));
    expect(without.root.findAllByType(Toast)).toHaveLength(0);
  });

  it("a failed log offers no action even with a past dish", async () => {
    storeLog([pastEntry("Soup", 3, 120)]);
    mockAddEntry.mockReset().mockRejectedValue(new Error("disk full"));
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root);
    expect(findToast(root).props.kind).toBe("failure");
    expect(toastAction(root)).toBeUndefined();
  });

  it("--stress compare-pair opens the sheet on first paint and picks against an in-memory store, not the device's rankings", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "franklin", stress: "compare-pair" });
    let root!: renderer.ReactTestRenderer;
    mockedFetchMenu.mockResolvedValue([PIZZA]);
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    expect(sheet(root).props.visible).toBe(true);
    expect(sheetTexts(root)).toEqual(["Which did you like more?", "French Toast", "Hampshire · 320 cal", "or", "Belgian Waffle", "Berkshire · 410 cal", "Skip"]);
    await act(async () => sheetPress(root, "French Toast")());
    expect(mockRanking.saveRankedDishes).not.toHaveBeenCalled();
    expect(findToast(root).props.message).toBe("French Toast");
    expect(findToast(root).props.subline).toBe("9.1 · 15 comparisons"); // CompareToastPicked.dc.html's sub-line
    expect(toastAction(root)?.label).toBe("Another"); // the fixture logs a third dish so there is a next pair
  });

  it("--stress compare-toast-rate mounts the 'Rate them' toast with the sheet closed; tapping it opens the fixture pair", async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ slug: "franklin", stress: "compare-toast-rate" });
    let root!: renderer.ReactTestRenderer;
    mockedFetchMenu.mockResolvedValue([PIZZA]);
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    expect(sheet(root).props.visible).toBe(false);
    expect(findToast(root).props.message).toBe("Logged 3 items");
    expect(toastAction(root)?.label).toBe("Rate them");
    act(() => jest.advanceTimersByTime(toastActionDwell + 1000)); // a fixture toast does not dismiss itself
    expect(root.root.findAllByType(Toast)).toHaveLength(1);
    await act(async () => {
      toastAction(root)!.onPress();
    });
    expect(pairNames(root)).toEqual(["French Toast", "Belgian Waffle"]);
    expect(sheet(root).props.visible).toBe(true);
  });

  it("nothing in the screen or the sheet syncs rankings off-device", () => {
    // (the screen already imports the supabase client for the dish-catalog refresh, so only the sync call is banned there)
    expect(fs.readFileSync(path.join(__dirname, "..", "app", "halls", "[slug].tsx"), "utf8")).not.toMatch(/syncDiningHallRanks/);
    expect(fs.readFileSync(path.join(__dirname, "..", "components", "CompareSheet.tsx"), "utf8")).not.toMatch(/syncDiningHallRanks|supabase/);
  });
});
