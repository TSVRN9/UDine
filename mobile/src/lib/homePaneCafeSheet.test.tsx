// #245 item 8: a café with no `locationId` (cafeTapTarget's own "no tid to fetch with" branch,
// see /cafe/[name].tsx) can never resolve to a real menu -- tapping it used to navigate to
// /cafe/[name] anyway, which lands on a blank screen behind the same CafeSheet fallback this test
// now expects to render inline, with no navigation at all. Same jest.mock-factory shape as
// homePaneOffline.test.tsx (this needs useFocusEffect to actually fire load() on mount).
import type { ReactNode } from "react";
import type { DiningHoursFeed } from "@udine/shared";

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { HomePane } from "../app/index";
import { CafeSheet } from "../components/CafeSheet";
import { CafePdfViewer } from "../components/CafePdfViewer";

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

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() },
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

const NO_MENU_CAFE = { name: "The Hub", hours: { openTime: "8:00 AM", closeTime: "3:00 PM" }, description: "", address: "", acceptedPayment: "" };

beforeEach(() => {
  mockFetchHoursAndCache.mockReset();
  mockPush.mockClear();
});

describe("HomePane café rows (#245 item 8)", () => {
  it("opens CafeSheet inline, with no navigation, for a café with no locationId", async () => {
    mockFetchHoursAndCache.mockResolvedValue(hours([NO_MENU_CAFE]));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });

    expect(() => root.root.findByType(CafeSheet)).toThrow(); // not mounted until a row is tapped

    const row = root.root
      .findAll((n) => typeof n.props.onPress === "function")
      .find((p) => p.findAllByType(Text).some((t) => typeof t.props.children === "string" && t.props.children === "The Hub"))!;

    await act(async () => {
      await row.props.onPress();
    });

    expect(root.root.findByType(CafeSheet).props.visible).toBe(true);
    expect(root.root.findByType(CafeSheet).props.loc.name).toBe("The Hub");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("hides CafeSheet's modal once its PDF viewer opens, instead of stacking both full-screen", async () => {
    mockFetchHoursAndCache.mockResolvedValue(hours([NO_MENU_CAFE]));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });

    const row = root.root
      .findAll((n) => typeof n.props.onPress === "function")
      .find((p) => p.findAllByType(Text).some((t) => typeof t.props.children === "string" && t.props.children === "The Hub"))!;
    await act(async () => {
      await row.props.onPress();
    });
    expect(root.root.findByType(CafeSheet).props.visible).toBe(true);

    await act(async () => {
      root.root.findByType(CafeSheet).props.onOpenPdf("https://example.com/menu.pdf", "Menu");
    });

    expect(root.root.findByType(CafePdfViewer)).toBeTruthy();
    // Bug: CafeSheet's `visible` wasn't tied to the open PDF, so its Modal kept covering the
    // screen alongside CafePdfViewer's full-screen view instead of yielding to it.
    expect(root.root.findByType(CafeSheet).props.visible).toBe(false);
  });

  it("still navigates via Link for a café that has a locationId (normal path unaffected)", async () => {
    mockFetchHoursAndCache.mockResolvedValue(hours([{ ...NO_MENU_CAFE, name: "People's Organic Coffee", locationId: 32 }]));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<HomePane />);
    });

    // No sheet ever mounts for a locationId café -- it's the route's job, not Home's.
    expect(() => root.root.findByType(CafeSheet)).toThrow();
  });
});
