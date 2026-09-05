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
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text, View, SectionList } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { fetchEvents, fetchMenu, GRAB_N_GO_TIDS, type MenuItem } from "@udine/shared";
import HallMenuScreen, { HallMenuScreenBody } from "../app/halls/[slug]";
import { PlateBar } from "../components/PlateBar";
import { Button } from "../components/ui";
import { colors } from "./theme";
import { stepDate } from "./hallMenuTabs";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";
import { SqliteFavoritesStorage } from "./favoritesStorage";

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
  // keep it real, same pattern as SocialPane.test.tsx's real isTransientPingError, so these tests
  // exercise the actual guard instead of a stand-in.
  useGuardedToggleFavorite: jest.requireActual("../lib/favoritesStorage").useGuardedToggleFavorite,
}));

jest.mock("../lib/preferences", () => ({
  getPreferences: jest.fn().mockResolvedValue({ allergensToAvoid: [], requiredDietTags: [] }),
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

function nutrition(calories: number): MenuItem["nutrition"] {
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
    proteinG: 1,
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

function starPressable(root: renderer.ReactTestRenderer, dishName: string) {
  const matches = root.root.findAll(
    (n) => typeof n.props.accessibilityLabel === "string" && (n.props.accessibilityLabel === `Favorite ${dishName}` || n.props.accessibilityLabel === `Unfavorite ${dishName}`),
  );
  return matches[0];
}

function findBannerContainer(root: renderer.ReactTestRenderer, matching: RegExp) {
  const bannerText = root.root.findAllByType(Text).find((n) => typeof n.props.children === "string" && matching.test(n.props.children));
  return bannerText?.parent ?? null;
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
// past teardown, calling setLogged on a destroyed tree and crashing the whole run with
// "window.dispatchEvent is not a function" instead of just failing the one test.
beforeEach(() => {
  jest.useFakeTimers();
  mockMenuCache.clear();
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
  it("defaults to the Lunch tab -- lunch items show, other meal periods' items don't", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL]);
    // Breakfast is windowed in as Lunch's left neighbor (mounted, hidden) -- scope to the active
    // pane so its Oatmeal doesn't leak into this "other periods' items don't show" assertion.
    const body = activePaneTexts(root).flat().join(" ");
    expect(body).toMatch(/Pizza/);
    expect(body).not.toMatch(/Oatmeal/);
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
    const root = await renderScreen([PIZZA]);
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
    // ± 1 window and is fully unmounted, not just hidden -- this assertion (and the single-match
    // findByType(SectionList) below) rely on that being true. A future reorder that puts Grab
    // anywhere but last would put Lunch back in the window (mounted, hidden) and silently break
    // both -- see activePane()'s own doc above on why a windowed-in neighbor needs scoping.
    expect(body).not.toMatch(/Pizza/); // the hall's own lunch-tab item, not shown while on the Grab tab

    const sections = root.root.findByType(SectionList).props.sections as { title: string; data: MenuItem[] }[];
    expect(sections).toEqual([{ title: "Grab n'Go Hot", data: expect.arrayContaining([expect.objectContaining({ dishName: "Grab Wrap" })]) }]);
    expect(sections[0].data).toHaveLength(1); // deduped, not two identical rows
  });

  // The single most important regression the swipe pager's windowing could introduce: Grab's own
  // fetch is deliberately lazy (only fires once selectedMeal actually becomes "grab"), and Grab's
  // pane only mounts once it's within the ± 1 window of the active tab -- cycling through the 4 real
  // meal tabs (Breakfast/Lunch/Dinner/Late) never puts Grab (the 5th, last tab) in that window, so
  // it must never fetch.
  it("never fetches Grab 'N Go while only cycling through the 4 real meal tabs (lazy fetch stays lazy under windowing)", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL]);
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

  it("shows the Grab tab's open/closed subtitle for today, and omits it once the date stepper moves off today (get_infov2 only ever publishes today's hours)", async () => {
    mockFetchHoursAndCache.mockResolvedValueOnce({
      halls: [],
      retail: [{ name: "Worcester Grab ‘N Go", hours: { openTime: "12:00 AM", closeTime: "11:59 PM" } }],
    });
    const root = await renderScreen([PIZZA]);
    mockedFetchMenu.mockResolvedValueOnce([]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).toMatch(/open now/);

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

  it("fetches this hall's events via shared's fetchEvents, not a hand-rolled call", async () => {
    await renderScreen([PIZZA]);
    await act(async () => {});
    expect(fetchEvents).toHaveBeenCalled();
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
    // Header + meal tabs are known without the network -- they render fully even while pending.
    expect(pendingBody).toMatch(/Worcester/);
    expect(pendingBody).toMatch(/Lunch/);
    // #181 review finding 2: assert the skeleton bars themselves actually render, not just that
    // the dish list is absent (which an empty EmptyState would also satisfy).
    expect(root.root.findAllByProps({ testID: "skeleton-bar" }).length).toBeGreaterThan(0);

    await act(async () => {
      resolveFetch([PIZZA]);
      await Promise.resolve();
    });
    expect(texts(root).flat().join(" ")).toMatch(/Pizza/);
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

  it("shows the error empty-plate bar ('your plate is safe') on a fetch failure with an empty plate", async () => {
    mockedFetchMenu.mockRejectedValueOnce(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HallMenuScreen />);
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/your plate is safe — it lives on this phone/);
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

  it("tracks the SectionList's bottom padding to the plate bar's measured height, and keeps it once the plate empties again (the bar stays mounted, just switches to its empty-state variant)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");

    act(() => {
      root.root.findByType(PlateBar).props.onLayout({ nativeEvent: { layout: { height: 88 } } });
    });
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(88);

    // Step the item back down to 0 -- the row's own stepper minus button removes it, but the bar
    // itself never unmounts, so the list's padding must hold at 88, not collapse to 0.
    stepPlate(root, "Pizza", "Remove one");
    expect(root.root.findAllByType(PlateBar)).toHaveLength(1);
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(88);
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
    expect(body).toMatch(/Couldn't log everything/);

    // ...and not occluded by the (still-mounted, opaque, bottom-anchored) plate bar: the banner
    // must be positioned clear of the bar's measured height, not sitting underneath it at the
    // screen's bottom edge (the PR #78/#84 occlusion-bug class, finding 2).
    act(() => {
      root.root.findByType(PlateBar).props.onLayout({ nativeEvent: { layout: { height: 88 } } });
    });
    const bannerContainer = findBannerContainer(root, /Couldn't log everything/);
    const bottomOffset = bannerContainer?.props.style?.find?.((s: { bottom?: number }) => typeof s?.bottom === "number")?.bottom ?? bannerContainer?.props.style?.bottom;
    expect(bottomOffset).toBe(88);
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
    expect(texts(root).flat().join(" ")).toMatch(/Couldn't log everything/);
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

describe("HallMenuScreen logged-banner lifecycle (device-pass finding: banner never dismisses, occludes last row)", () => {
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

  it("keeps the list's bottom padding banner-aware while the banner alone is visible (bar never measured, plate just cleared)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root); // success: plate clears (bar stays mounted, empty-state variant), banner shows

    expect(root.root.findByType(PlateBar).props.itemCount).toBe(0);
    act(() => {
      findBannerContainer(root, /Logged 1 item/)?.props.onLayout({ nativeEvent: { layout: { height: 40 } } });
    });
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(40);
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
      findBannerContainer(root, /Couldn't log everything/)?.props.onLayout({ nativeEvent: { layout: { height: 40 } } });
    });
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(128);
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
    // The tab reads "All Day" (shared's mealPeriodLabel, reused via hallMenuTabs' mealTabLabel --
    // #177 doesn't need its own override now that #175's label fix landed on main), and both items
    // show without any tab tap -- a static "lunch" default would show neither, since this café has
    // no lunch tab.
    expect(texts(root).flat()).toContain("All Day");
    expect(texts(root).flat()).toContain("Coffee");
    expect(texts(root).flat()).toContain("Bagel");
  });

  it("never renders a Grab 'N Go tab for a café (no slug -- not a real DINING_HALLS entry)", async () => {
    const root = await renderCafeScreen([COFFEE]);
    expect(texts(root).flat()).not.toContain("Grab 'N Go");
  });

  it("shows the price leading the meta line for a priced item, and renders exactly as today (no price chip) for an unpriced one", async () => {
    const root = await renderCafeScreen([COFFEE, BAGEL]);
    const flat = texts(root).flat();
    expect(flat).toContain("$3.00");
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
