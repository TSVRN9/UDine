// #181: Home's honest-skeleton + offline-render-from-cache behavior. Separate file from
// homePane.test.tsx, same reason hallMenuTabs.mealPeriodPropagation.test.ts is split from
// hallMenuTabs.test.ts -- those two existing tests deliberately no-op useFocusEffect to stay
// decoupled from network mocking; these need it to actually fire load() on mount, which needs its
// own jest.mock factories for the data it now pulls through (../lib/menuHoursCache instead of
// @udine/shared's fetchDiningHours directly).
import type { DiningHoursFeed } from "@udine/shared";

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { HomePane } from "../app/index";

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

jest.mock("../lib/auth", () => ({ signInWithGoogle: jest.fn(), signOut: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

// #245 item 8: HomePane now imports CafeSheet's own CafePdfViewer chain, which pulls in
// react-native-webview -- no native module for it under jest (same fix as cafeScreen.test.tsx).
jest.mock("react-native-webview", () => ({ WebView: () => null }));

jest.mock("expo-router", () => ({
  Link: require("./mockLink").mockLink,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
  // Unlike homePane.test.tsx's deliberate no-op, this actually fires the focus callback on mount
  // (React's own useEffect, imported fresh here rather than referencing an out-of-scope binding --
  // jest.mock factories can't close over module-level consts).
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, []),
}));

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({
    getFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  })),
}));

const mockFetchHoursAndCache = jest.fn<Promise<DiningHoursFeed>, []>();
const mockGetCachedHours = jest.fn<Promise<{ feed: DiningHoursFeed; fetchedAt: string } | null>, []>();
jest.mock("../lib/menuHoursCache", () => ({
  fetchHoursAndCache: () => mockFetchHoursAndCache(),
  getCachedHours: () => mockGetCachedHours(),
}));

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

function hours(
  overrides: Partial<DiningHoursFeed["halls"][number]> = {},
  retail: DiningHoursFeed["retail"] = [],
): DiningHoursFeed {
  return {
    halls: [
      { hallTid: 1, breakfast: null, lunch: { openTime: "11:00 AM", closeTime: "2:30 PM" }, dinner: null, latenight: null, general: null, ...overrides },
      { hallTid: 2, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
      { hallTid: 3, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
      { hallTid: 4, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
    ],
    retail,
  };
}

beforeEach(() => {
  mockFetchHoursAndCache.mockReset();
  mockGetCachedHours.mockReset();
});

describe("HomePane loading (#181)", () => {
  it("shows the honest skeleton (hall names known instantly, chip shimmers) while the first fetch is pending", async () => {
    mockFetchHoursAndCache.mockReturnValue(new Promise(() => {})); // never resolves
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Worcester/); // known instantly, no network needed
    expect(body).not.toMatch(/OPEN/); // chip text needs hoursFeed -- not rendered while pending
  });

  // #181 review finding 2 (blocking): the test above never actually asserted a SkeletonBar
  // rendered -- an empty chip satisfies "not OPEN" whether or not the skeleton is there at all
  // (reviewer reproduced: mutating `pending` to `false` left it green). This is the real assertion.
  it("actually renders SkeletonBar components (not just an empty chip) while pending", async () => {
    mockFetchHoursAndCache.mockReturnValue(new Promise(() => {}));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    // One per hall chip (4) + the hero title/subtitle skeleton (1) = 5, but the exact count isn't
    // the point -- proving at least one really renders is what the mutation above was missing.
    expect(root.root.findAllByProps({ testID: "skeleton-bar" }).length).toBeGreaterThan(0);
  });

  // #181 review finding 3 (blocking): HeroBlock used to fall back to <SkeletonBar/> whenever
  // `hero` was null, with no way to distinguish "still pending" from "failed, nothing to show" --
  // so a fetch-failed-with-no-cache render shimmered FOREVER under the error text, promising data
  // that would never arrive. Fixed: hero renders nothing (not a skeleton) once `pending` is false.
  it("does NOT keep shimmering once the fetch has genuinely failed with no cache to fall back to", async () => {
    mockFetchHoursAndCache.mockRejectedValue(new Error("network down"));
    mockGetCachedHours.mockResolvedValue(null);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Couldn't load dining hours/); // the real dead-end state
    expect(root.root.findAllByProps({ testID: "skeleton-bar" }).length).toBe(0); // not still "loading"
  });

  // #375: the Cafés & Markets row only rendered name + status chip -- the location subtitle
  // (address, e.g. "Campus Center") was dropped even though the field is already on the fetched
  // data.
  it("renders the location subtitle under each Cafés & Markets row's name (#375)", async () => {
    mockFetchHoursAndCache.mockResolvedValue(
      hours({}, [{ name: "Blue Wall", hours: { openTime: "7:00 AM", closeTime: "8:00 PM" }, address: "Campus Center" }]),
    );
    mockGetCachedHours.mockResolvedValue(null);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Campus Center/);
  });

  // #387: while `pending`, the Cafés & Markets section rendered zero rows (hoursFeed?.retail
  // defaults to []) instead of a skeleton -- the whole section silently vanished during loading.
  it("shows Cafés & Markets skeleton rows (not an empty section) while the first fetch is pending", async () => {
    mockFetchHoursAndCache.mockReturnValue(new Promise(() => {})); // never resolves
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    // A count-based assertion would be muddied by however many skeleton bars the hero/hall
    // sections already contribute -- assert directly on one of the retail skeleton rows' own bar
    // dimensions (docs/design/HomeLoading.dc.html:119: first row's 96x13 title bar), which only
    // exists once the retail section has a pending branch at all.
    expect(root.root.findAllByProps({ width: 96, height: 13 }).length).toBeGreaterThan(0);
  });
});

describe("HomePane offline (#181 — owner decision: offline is not an error state)", () => {
  it("renders from cache with an offline line and NO error text when the live fetch fails but a cache exists", async () => {
    mockFetchHoursAndCache.mockRejectedValue(new Error("network down"));
    mockGetCachedHours.mockResolvedValue({ feed: hours(), fetchedAt: "2026-08-19T12:00:00.000Z" });
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    const body = texts(root).flat().join(" ");
    expect(body).not.toMatch(/Couldn't load dining hours/);
    expect(body).toMatch(/updated 8:00 AM/); // fetchedAt, TZ=America/New_York -> 8:00 AM EDT
  });

  it("still shows the real error text when the fetch fails and no cache exists at all", async () => {
    mockFetchHoursAndCache.mockRejectedValue(new Error("network down"));
    mockGetCachedHours.mockResolvedValue(null);
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Couldn't load dining hours/);
  });

  // The discriminating case: OPEN/CLOSED must be computed live from the cached hours + the clock,
  // not frozen at cache time -- same cached feed, two different mocked "now"s, two different
  // results. A weaker test ("renders from cache") wouldn't catch a regression that cached the
  // *chip text itself* instead of the raw hours.
  it("computes OPEN/CLOSED live from the cached hours + the current clock, not frozen at cache time", async () => {
    mockFetchHoursAndCache.mockRejectedValue(new Error("network down"));
    mockGetCachedHours.mockResolvedValue({ feed: hours(), fetchedAt: "2026-08-19T12:00:00.000Z" });

    jest.useFakeTimers();
    try {
      // Inside the cached lunch window (11:00 AM - 2:30 PM local).
      jest.setSystemTime(new Date(2026, 7, 19, 12, 0, 0, 0));
      let openRoot!: renderer.ReactTestRenderer;
      await act(async () => {
        openRoot = renderer.create(<HomePane />);
      });
      expect(texts(openRoot).flat().join(" ")).toMatch(/OPEN/);

      // Outside it (evening, 8 PM local) -- same cached feed, different clock.
      jest.setSystemTime(new Date(2026, 7, 19, 20, 0, 0, 0));
      let closedRoot!: renderer.ReactTestRenderer;
      await act(async () => {
        closedRoot = renderer.create(<HomePane />);
      });
      const closedBody = texts(closedRoot).flat().join(" ");
      expect(closedBody).toMatch(/CLOSED/);
      expect(closedBody).not.toMatch(/OPEN · closes/);
    } finally {
      jest.useRealTimers();
    }
  });
});
