// Standing-menu-only café double-screen fix: cafe/[name].tsx no longer renders CafeSheet itself
// for a sheet-only outcome -- it calls requestCafeSheet(name) then router.back(), and HomePane
// picks the request up on its next focus (cafeSheetHandoff.ts). This is a dedicated file, not an
// addition to homePaneCafeSheet.test.tsx, because that file's useFocusEffect shim only ever fires
// once at mount (`useEffect(callback, [])`) -- before hoursFeed has loaded, so it can't simulate
// "a hand-off arrives, then Home regains focus" the way this test needs. Same
// capture-and-invoke-by-hand shim as homePaneStaleFocusRace.test.tsx.
import type { DiningHoursFeed } from "@udine/shared";

import renderer, { act } from "react-test-renderer";
import { HomePane } from "../app/index";
import { CafeSheet } from "../components/CafeSheet";
import { requestCafeSheet, takePendingCafeSheet } from "./cafeSheetHandoff";

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

jest.mock("../lib/favoritesStorage", () => ({
  SqliteFavoritesStorage: jest.fn().mockImplementation(() => ({
    getFavorites: jest.fn().mockResolvedValue([]),
    addFavorite: jest.fn(),
    removeFavorite: jest.fn(),
  })),
}));

// Captures the latest `useFocusEffect(callback)` registration so the test can invoke it (a
// "focus") on demand, instead of only ever firing once.
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
jest.mock("../lib/menuHoursCache", () => ({
  fetchHoursAndCache: () => mockFetchHoursAndCache(),
  getCachedHours: jest.fn().mockResolvedValue(null),
}));

function hours(retail: DiningHoursFeed["retail"]): DiningHoursFeed {
  return {
    halls: [
      { hallTid: 1, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
      { hallTid: 2, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
      { hallTid: 3, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
      { hallTid: 4, breakfast: null, lunch: null, dinner: null, latenight: null, general: null },
    ],
    retail,
  };
}

const STANDING_MENU_CAFE = {
  name: "Berkshire Dining Commons Café",
  hours: { openTime: "8:00 AM", closeTime: "3:00 PM" },
  locationId: 32,
  breakfastMenu: "<p>Bacon Croissant</p>",
  lunchMenu: null,
  dinnerMenu: null,
  description: "",
  address: "",
  acceptedPayment: "",
};

beforeEach(() => {
  mockFetchHoursAndCache.mockReset().mockResolvedValue(hours([STANDING_MENU_CAFE]));
  latestFocusCallback = null;
  takePendingCafeSheet(); // drain any stray request left by a prior test
});

function focus(): void {
  if (!latestFocusCallback) throw new Error("useFocusEffect was never registered");
  latestFocusCallback();
}

describe("HomePane picks up a cafe/[name] hand-off on focus", () => {
  it("opens CafeSheet for the requested café once a pending hand-off exists and Home regains focus", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    // Mount alone doesn't fire this mock's useFocusEffect (see homePaneStaleFocusRace.test.tsx's
    // own convention) -- the first real focus loads hoursFeed.
    await act(async () => {
      focus();
    });
    expect(() => root.root.findByType(CafeSheet)).toThrow(); // nothing pending yet

    // A real cafe/[name] hand-off arrives here, while Home is still mounted underneath the pushed
    // route (it never unmounts -- PaneStack keeps it alive, see PaneStack.tsx).
    requestCafeSheet("Berkshire Dining Commons Café");

    await act(async () => {
      focus(); // Home regains focus as cafe/[name] pops itself
    });

    expect(root.root.findByType(CafeSheet).props.visible).toBe(true);
    expect(root.root.findByType(CafeSheet).props.loc.name).toBe("Berkshire Dining Commons Café");
  });

  it("does nothing on a focus with no pending hand-off", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });
    await act(async () => {
      focus();
    });
    await act(async () => {
      focus();
    });

    expect(() => root.root.findByType(CafeSheet)).toThrow();
  });
});
