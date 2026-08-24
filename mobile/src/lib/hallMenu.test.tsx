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
jest.mock("../lib/sqliteStorage", () => ({
  SqliteLogStorage: jest.fn().mockImplementation(() => ({ addEntry: jest.fn() })),
}));

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({
    getFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  })),
}));

jest.mock("../lib/preferences", () => ({
  getPreferences: jest.fn().mockResolvedValue({ allergensToAvoid: [], requiredDietTags: [] }),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ slug: "worcester" }),
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

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchMenu: jest.fn(),
  // #117: real fetchDiningHours hits the network; a resolved-empty default keeps the screen's
  // hours effect from throwing (calling .then on an unmocked jest.fn()'s undefined return) while
  // individual tests can still override with mockResolvedValueOnce for subtitle-specific cases.
  fetchDiningHours: jest.fn().mockResolvedValue({ halls: [], retail: [] }),
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

import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text, SectionList } from "react-native";
import { router } from "expo-router";
import { fetchDiningHours, fetchMenu, type MenuItem } from "@udine/shared";
import HallMenuScreen from "../app/halls/[slug]";
import { PlateBar } from "../components/PlateBar";
import { Button } from "../components/ui";
import { stepDate } from "./hallMenuTabs";
import { SqliteLogStorage } from "./sqliteStorage";
import { SqliteSeenDishesStorage } from "./seenDishesStorage";

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

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
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
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Pizza/);
    expect(body).not.toMatch(/Oatmeal/);
  });

  it("switching to the Breakfast tab shows breakfast items and hides the previously-shown lunch items", async () => {
    const root = await renderScreen([PIZZA, SALAD, OATMEAL]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Breakfast menu" }).props.onPress();
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Oatmeal/);
    expect(body).not.toMatch(/Pizza/);
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

  it("navigates to the hall's Grab 'N Go route when its tab is pressed", async () => {
    const root = await renderScreen([PIZZA]);
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Worcester Grab 'N Go menu" }).props.onPress();
    });
    expect(mockedRouterPush).toHaveBeenCalledWith("/grab-n-go/worcester");
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

describe("HallMenuScreen tab-row subtitle wiring (#117)", () => {
  it("shows 'being served now' for today+Lunch, and hides it again once the date is stepped away from today (old code showed this line unconditionally whenever hours resolved)", async () => {
    (fetchDiningHours as jest.Mock).mockResolvedValueOnce({
      halls: [{ hallTid: 1, breakfast: null, lunch: { openTime: "12:00 AM", closeTime: "11:59 PM" }, dinner: null, latenight: null, general: null }],
      retail: [],
    });
    const root = await renderScreen([PIZZA]);
    await act(async () => {}); // flush fetchDiningHours' resolution
    expect(texts(root).flat().join(" ")).toMatch(/being served now/);

    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Next day" }).props.onPress();
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/being served now/);
  });
});

describe("HallMenuScreen plate wiring", () => {
  beforeEach(() => {
    mockAddEntry.mockReset().mockResolvedValue(undefined);
  });

  it("does not mount the plate bar while the plate is empty (mutation a)", async () => {
    const root = await renderScreen();
    expect(root.root.findAllByType(PlateBar)).toHaveLength(0);
  });

  it("mounts the plate bar once an item is added, with the item count it reports", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    expect(root.root.findAllByType(PlateBar)).toHaveLength(1);
    expect(root.root.findByType(PlateBar).props.itemCount).toBe(1);
  });

  it("tracks the SectionList's bottom padding to the plate bar's measured height while it's up, and drops to 0 once the plate is empty (mutation c)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");

    act(() => {
      root.root.findByType(PlateBar).props.onLayout({ nativeEvent: { layout: { height: 88 } } });
    });
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(88);

    // Step the item back down to 0 -- the row's own stepper minus button removes it, emptying the
    // plate and unmounting the bar. The list's padding must collapse to 0, not keep the stale 88
    // that's still sitting in barHeight state (nothing re-measures a bar that no longer exists).
    stepPlate(root, "Pizza", "Remove one");
    expect(root.root.findAllByType(PlateBar)).toHaveLength(0);
    expect(root.root.findByType(SectionList).props.contentContainerStyle.paddingBottom).toBe(0);
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

    // Plate cleared -> bar gone.
    expect(root.root.findAllByType(PlateBar)).toHaveLength(0);
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

    expect(root.root.findAllByType(PlateBar)).toHaveLength(0);
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

  it("keeps the list's bottom padding banner-aware while the banner alone is visible (no bar, plate just cleared)", async () => {
    const root = await renderScreen();
    addToPlate(root, "Pizza");
    await openSheetAndLog(root); // success: plate clears, bar unmounts, banner shows

    expect(root.root.findAllByType(PlateBar)).toHaveLength(0);
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
