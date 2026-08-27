// /cafe/[name].tsx's own wiring (#177's probe-at-tap runtime model): fetch hours, find the
// tapped location, probe fetchMenu(locationId, today) only if there's a locationId, and route to
// either the existing hall-menu screen body (non-empty) or the CafeSheet fallback (empty / no
// locationId). Same jest.mock-factory pattern as hallMenu.test.tsx (which this reuses -- the
// "menu" branch renders the real HallMenuScreenBody, so it needs the same storage mocks).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { fetchMenu, type MenuItem } from "@udine/shared";
import CafeScreen from "../app/cafe/[name]";
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
}));

jest.mock("./seenDishesStorage", () => ({
  SqliteSeenDishesStorage: jest.fn().mockImplementation(() => ({ recordSeen: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// react-native-webview needs a native module not present under jest -- CafePdfViewer (rendered
// only once a PDF row is tapped, which neither test below does) is the only importer reached from
// this screen.
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

// A mutable module-scope binding the factory reads live (not captured at hoist time) -- lets the
// "unknown name" test below point useLocalSearchParams at a name absent from the mocked hours feed
// without a second jest.mock factory.
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

beforeEach(() => {
  mockFetchHoursAndCache.mockReset().mockResolvedValue(DEFAULT_HOURS_FEED);
  mockGetCachedHours.mockReset().mockResolvedValue(null);
  mockGetCachedMenu.mockReset().mockResolvedValue(null);
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

describe("/cafe/[name] probe-at-tap routing (#177)", () => {
  it("non-empty fetchMenu -> the existing hall-menu screen body, not the fallback sheet", async () => {
    const root = await renderCafeScreen([COFFEE]);
    expect(texts(root).flat()).toContain("Coffee");
    // CafeSheet's title renders the café name in its own Text; the hall-menu screen's header does
    // too, so distinguish by CafeSheet's status-pill styling spec copy, which only it ever renders.
    expect(texts(root).flat().join(" ")).not.toMatch(/OPEN · TIL|CLOSED/);
  });

  it("empty fetchMenu -> the CafeSheet fallback, not the hall-menu screen", async () => {
    const root = await renderCafeScreen([]);
    expect(mockedFetchMenu).toHaveBeenCalledWith(32, expect.any(Date));
    expect(texts(root).flat()).toContain("People's Organic Coffee");
    expect(texts(root).flat().join(" ")).toMatch(/OPEN|CLOSED/);
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

  // PR #219 review, finding 1: neither fetch below had a `.catch` -- a rejection left the screen
  // spinning behind only a back chevron forever, plus an unhandled promise rejection. Revert either
  // `.catch` in cafe/[name].tsx and this test hangs (act(async) never settles on a resolved state)
  // instead of failing clean, which is itself the bug: a real rejected promise never resolves the
  // `hoursFeed`/`items` state either, so there was no render for `texts()` to assert against.
  //
  // #243 bug C fix note: a rejected fetchHoursAndCache now falls back to getCachedHours() (see
  // cafe/[name].tsx) -- this test pins the GENUINE dead end (fetch rejects AND no cache exists),
  // not the offline-with-a-warm-cache case, which has its own test below.
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
  it("an offline tap still resolves the café from a warm hours cache instead of erroring (#243 bug C)", async () => {
    mockFetchHoursAndCache.mockRejectedValue(new Error("network down"));
    mockGetCachedHours.mockResolvedValue({ feed: DEFAULT_HOURS_FEED, fetchedAt: "2026-08-19T12:00:00.000Z" });
    mockedFetchMenu.mockRejectedValue(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/Failed to load/);
    expect(texts(root).flat()).toContain("People's Organic Coffee");
    // Pins the fallback wiring itself (getCachedMenu actually consulted with the right args) --
    // the render-level assertions above pass through the "nothing cached" (`null`) branch alone,
    // so without this a mutation deleting the `cached ? cached.items : []` fallback and always
    // returning `[]` would stay green. The "cached menu has real items" branch's own render
    // behavior is covered by getCachedMenu's round-trip in menuHoursCache.test.ts, not end-to-end
    // here -- see the comment below for why a full render of that path isn't reachable in this file.
    expect(mockGetCachedMenu).toHaveBeenCalledWith(32, expect.any(Date));
  });

  // Note: this screen's own item-fetch effect resolves cached items fine (proven by the
  // getCachedMenu unit coverage in menuHoursCache.test.ts), but routing to "menu" here means
  // handing off to HallMenuScreenBody, which does its OWN independent fetchMenuAndRecordSeen call
  // on mount and only reads its cache manually (the "SHOW SAVED COPY" retry-card link) -- not
  // proactively. Making that mount-time fetch cache-aware is a real gap, but it's HallMenuScreenBody's
  // own behavior (shared with every real hall screen too), not something #243 asks this screen to
  // fix -- out of scope here.

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

  // #243 bug C review finding: a rejected menu probe used to set `error` unconditionally (a
  // permanent "Failed to load" screen even though `loc`'s own hours/description/standing-menu
  // HTML are already in hand). Now falls back to getCachedMenu first -- this test is the "nothing
  // cached either" case, which degrades to the CafeSheet fallback instead of a hard error, since
  // there's genuinely nothing else to show; the "a cached menu exists" case is covered above by
  // the offline-tap (#243 bug C) test.
  it("a rejected fetchMenu with no cached menu either falls back to the CafeSheet fallback, not a spinning/error dead end", async () => {
    mockedFetchMenu.mockRejectedValue(new Error("upstream 500"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/Failed to load/);
    expect(texts(root).flat()).toContain("People's Organic Coffee");
  });
});
