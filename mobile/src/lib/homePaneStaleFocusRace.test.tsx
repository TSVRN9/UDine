// #243 bug B: HomePane's hours fetch has no stale-response guard, unlike halls/[slug].tsx's
// item-fetch effect (see that file's "current" flag, added for exactly this class of race --
// hallMenu.test.tsx's own "ignores a stale response for a previously-selected date" test pins it
// there). Home's `load` is wired through `useFocusEffect(load)` instead of a plain `useEffect`
// with a dependency array, so the race here is triggered by focus -> blur -> refocus (leaving the
// screen and coming back) rather than a prop/state change -- a separate file from
// homePaneOffline.test.tsx because that file's `useFocusEffect` shim only ever fires once
// (`useEffect(callback, [])`), and can't simulate a second focus. This shim instead exposes the
// registered callback/cleanup pair directly so the test can drive focus/blur by hand.
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
// react-native-webview -- no native module for it under jest (same fix as cafeScreen.test.tsx /
// homePaneOffline.test.tsx).
jest.mock("react-native-webview", () => ({ WebView: () => null }));

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({
    getFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  })),
}));

// Captures the latest `useFocusEffect(callback)` registration so the test can invoke it (a
// "focus") and its returned cleanup (a "blur") on demand, instead of only ever firing once.
type FocusCallback = () => void | (() => void);
let latestFocusCallback: FocusCallback | null = null;
jest.mock("expo-router", () => ({
  Link: require("./mockLink").mockLink,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
  useFocusEffect: (callback: FocusCallback) => {
    latestFocusCallback = callback;
  },
}));

const mockFetchHoursAndCache = jest.fn<Promise<DiningHoursFeed>, []>();
const mockGetCachedHours = jest.fn<Promise<{ feed: DiningHoursFeed; fetchedAt: string } | null>, []>();
jest.mock("../lib/menuHoursCache", () => ({
  fetchHoursAndCache: () => mockFetchHoursAndCache(),
  getCachedHours: () => mockGetCachedHours(),
}));

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children).flat().join(" ");
}

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
  mockFetchHoursAndCache.mockReset();
  mockGetCachedHours.mockReset();
  latestFocusCallback = null;
});

function focus(): (() => void) | void {
  if (!latestFocusCallback) throw new Error("useFocusEffect was never registered");
  return latestFocusCallback();
}

describe("HomePane focus race (#243 bug B)", () => {
  it("does not let a slow first focus's rejected fetch overwrite a later focus's fresh feed (stale-response guard)", async () => {
    // Focus 1: a slow fetch that will eventually reject, whose getCachedHours() fallback resolves
    // even more slowly -- long enough to land AFTER focus 2 has already succeeded.
    let rejectFirstFetch!: (e: Error) => void;
    mockFetchHoursAndCache.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirstFetch = reject;
      }),
    );
    let resolveFirstCachedHours!: (v: { feed: DiningHoursFeed; fetchedAt: string } | null) => void;
    mockGetCachedHours.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstCachedHours = resolve;
      }),
    );

    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });

    let cleanupFocus1: (() => void) | void;
    await act(async () => {
      cleanupFocus1 = focus(); // focus 1 -- kicks off the slow fetch above
    });

    // Blur (leaving the screen), then refocus -- the real trigger for this race (see file header).
    await act(async () => {
      cleanupFocus1?.();
    });

    // Focus 2: fetch resolves immediately with a fresh feed.
    mockFetchHoursAndCache.mockResolvedValueOnce(hours());
    await act(async () => {
      focus();
    });

    expect(texts(root)).toMatch(/OPEN|CLOSED/); // focus 2's fresh feed rendered

    // NOW land focus 1's stale rejection + its slow cache fallback -- a real cache with a real
    // fetchedAt, so a bug here isn't just "does hero go null", it's "does the false offline line
    // reappear over the already-fresh render".
    await act(async () => {
      rejectFirstFetch(new Error("network down"));
      resolveFirstCachedHours({ feed: hours(), fetchedAt: "2020-01-01T12:00:00.000Z" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const body = texts(root);
    // The stale focus-1 result must not win: no false offline banner, no reversion to "Couldn't
    // load dining hours" -- focus 2's already-fresh render must still stand.
    expect(body).not.toMatch(/updated/i);
    expect(body).not.toMatch(/Couldn't load dining hours/);
  });
});
