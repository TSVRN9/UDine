// hall-indicator-status-badge task 2: wires hallSpottedCounts.ts's per-hall counts (task 1) into
// HomePane's hall cards as a small pill. Same load()-fires-on-mount boilerplate as
// homePaneOffline.test.tsx (real useFocusEffect via useEffect), plus a mock for hallSpottedCounts
// itself -- that's the one new seam task 2 adds.
import type { DiningHoursFeed } from "@udine/shared";

import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { HomePane } from "../app/index";

// findAllByProps matches every fiber carrying a prop, composite AND host -- RN's `View` is a
// forwardRef wrapper around a host component, so a raw testID prop match double-counts each
// element (one hit for the composite, one for the host). Filtering on `n.type === View` keeps
// only the one composite instance per JSX <View>, matching this suite's own texts()-style
// convention of asserting on stable identity rather than a props map that can alias.
function badgeCount(root: renderer.ReactTestRenderer) {
  return root.root.findAll((n) => n.type === View && n.props.testID === "hall-spotted-badge").length;
}

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
jest.mock("react-native-webview", () => ({ WebView: () => null }));

jest.mock("expo-router", () => ({
  Link: require("./mockLink").mockLink,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
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

const mockHallSpottedCounts = jest.fn<Promise<Map<number, number>>, []>();
jest.mock("../lib/hallSpottedCounts", () => ({
  hallSpottedCounts: () => mockHallSpottedCounts(),
}));

function hours(): DiningHoursFeed {
  return {
    halls: [
      { hallTid: 1, breakfast: null, lunch: { openTime: "11:00 AM", closeTime: "2:30 PM" }, dinner: null, latenight: null, general: null },
      { hallTid: 2, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
      { hallTid: 3, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
      { hallTid: 4, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
    ],
    retail: [],
  };
}

beforeEach(() => {
  mockFetchHoursAndCache.mockReset().mockResolvedValue(hours());
  mockGetCachedHours.mockReset().mockResolvedValue(null);
  mockHallSpottedCounts.mockReset().mockResolvedValue(new Map());
});

describe("hall spotted-count badge (hall-indicator-status-badge task 2)", () => {
  it("loads hallSpottedCounts alongside favorites when the pane focuses", async () => {
    await act(async () => {
      renderer.create(<HomePane />);
    });
    expect(mockHallSpottedCounts).toHaveBeenCalled();
  });

  it("renders no badge at all for a hall with zero matches today (not a hidden/zero pill)", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    expect(badgeCount(root)).toBe(0);
  });

  it("renders the exact count pill only for halls with a non-zero count (Worcester tid 1)", async () => {
    mockHallSpottedCounts.mockResolvedValue(new Map([[1, 2]]));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    expect(badgeCount(root)).toBe(1);
    expect(root.root.findAll((n) => n.type === Text && n.props.children === 2).length).toBeGreaterThan(0);
  });

  it("renders one pill per hall with a non-zero count, none for the rest (Worcester tid 1, Hampshire tid 3)", async () => {
    mockHallSpottedCounts.mockResolvedValue(
      new Map([
        [1, 2],
        [3, 1],
      ]),
    );
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    expect(badgeCount(root)).toBe(2);
  });
});
