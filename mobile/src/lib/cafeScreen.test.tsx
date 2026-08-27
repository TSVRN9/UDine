// /cafe/[name].tsx's own wiring (#177's probe-at-tap runtime model): fetch hours, find the
// tapped location, probe fetchMenu(locationId, today) only if there's a locationId, and route to
// either the existing hall-menu screen body (non-empty) or the CafeSheet fallback (empty / no
// locationId). Same jest.mock-factory pattern as hallMenu.test.tsx (which this reuses -- the
// "menu" branch renders the real HallMenuScreenBody, so it needs the same storage mocks).
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
  fetchDiningHours: jest.fn(),
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

// A mutable module-scope binding the factory reads live (not captured at hoist time) -- lets the
// "unknown name" test below point useLocalSearchParams at a name absent from the mocked hours feed
// without a second jest.mock factory.
let mockSearchParamName = "People's Organic Coffee";
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ name: encodeURIComponent(mockSearchParamName) }),
  useFocusEffect: (_callback: () => void) => {},
  router: { back: jest.fn(), push: jest.fn() },
}));

import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { fetchDiningHours, fetchMenu, type MenuItem } from "@udine/shared";
import CafeScreen from "../app/cafe/[name]";

const mockedFetchMenu = fetchMenu as jest.Mock;
const mockedFetchDiningHours = fetchDiningHours as jest.Mock;

beforeEach(() => {
  mockedFetchDiningHours.mockResolvedValue(DEFAULT_HOURS_FEED);
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
  it("a rejected fetchDiningHours shows an error instead of spinning forever", async () => {
    mockedFetchDiningHours.mockRejectedValue(new Error("network down"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Failed to load.*network down/);
  });

  it("a rejected fetchMenu (via fetchMenuAndRecordSeen) shows an error instead of spinning forever", async () => {
    mockedFetchMenu.mockRejectedValue(new Error("upstream 500"));
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<CafeScreen />);
    });
    expect(texts(root).flat().join(" ")).toMatch(/Failed to load.*upstream 500/);
  });
});
