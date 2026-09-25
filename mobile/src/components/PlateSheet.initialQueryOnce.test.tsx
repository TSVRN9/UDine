// offline-menus-and-search: `visible` flips false then true again WITHOUT this sheet actually
// closing while the custom-food form is open (lib/plate.ts:348) -- see PlateSheet's own
// `seededInitialQueryRef` comment. Under the shipped react-native-reanimated jest mock, withTiming's
// callback fires SYNCHRONOUSLY with finished:true (same caveat PlateSheet.closeContent.test.tsx
// documents), which would flip modalVisible false the instant `visible` does -- a real, completed
// close, not the in-flight-then-cancelled tween a real device sees when the custom-food form closes
// again before the ~300ms animation finishes. Spying on withTiming and never invoking its callback
// keeps modalVisible true throughout, matching the real bug scenario this guards.
import * as Reanimated from "react-native-reanimated";

jest.spyOn(Reanimated, "withTiming").mockImplementation(((toValue: number) => toValue as unknown as ReturnType<typeof Reanimated.withTiming>) as typeof Reanimated.withTiming);

import renderer, { act } from "react-test-renderer";
import { InMemoryLogStorage, type CustomFoodsStorage, type LogStorage } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  searchProducts: jest.fn().mockResolvedValue({ results: [], hasMore: false }),
  searchFoods: jest.fn().mockResolvedValue({ results: [], hasMore: false }),
  searchBrandedFoods: jest.fn().mockResolvedValue({ results: [], hasMore: false }),
}));
jest.mock("../lib/dishCatalog", () => ({
  getCachedDishCatalog: jest.fn(),
  refreshDishCatalogIfStale: jest.fn().mockResolvedValue(undefined),
  searchCachedDishes: jest.fn(),
}));
jest.mock("../lib/customFoodsStorage", () => ({ searchCustomFoods: jest.fn().mockReturnValue([]) }));
jest.mock("../lib/menuHoursCache", () => ({ getCachedMenu: jest.fn().mockResolvedValue(null) }));

const mockedGetCachedDishCatalog = getCachedDishCatalog as jest.Mock;
const mockedSearchCachedDishes = searchCachedDishes as jest.Mock;

const NUTRITION = {
  servingSize: "1 each",
  calories: 200,
  caloriesFromFat: 0,
  totalFatG: 8,
  satFatG: 3,
  transFatG: 0,
  cholesterolMg: 10,
  sodiumMg: 400,
  totalCarbG: 24,
  dietaryFiberG: 1,
  sugarsG: 2,
  proteinG: 9,
};
const ZERO_TOTALS = { date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 };

function emptyLogStorage(): LogStorage {
  return new InMemoryLogStorage();
}
function fakeCustomFoodsStorage(): CustomFoodsStorage {
  return { addCustomFood: jest.fn(), removeCustomFood: jest.fn(), getAllCustomFoods: jest.fn().mockResolvedValue([]) };
}

function props(overrides: Partial<Parameters<typeof PlateSheet>[0]> = {}): Parameters<typeof PlateSheet>[0] {
  return {
    visible: true,
    plate: [],
    totals: ZERO_TOTALS,
    logStorage: emptyLogStorage(),
    customFoodsStorage: fakeCustomFoodsStorage(),
    hallTid: 1,
    onStep: () => {},
    onSetCount: () => {},
    onShowResultDetail: () => {},
    onOpenCustomFoodForm: () => {},
    onLog: () => {},
    onClose: () => {},
    initialQuery: "Bacon Croissant",
    ...overrides,
  };
}

function searchInput(root: renderer.ReactTestRenderer) {
  return root.root.findByProps({ placeholder: "Search for a food" });
}

beforeEach(() => {
  mockedGetCachedDishCatalog.mockReset().mockResolvedValue(null);
  mockedSearchCachedDishes.mockReset().mockReturnValue([{ dishName: "Bacon Croissant", nutrition: NUTRITION, allergens: [], dietTags: [], updatedAt: "x" }]);
});

describe("PlateSheet initialQuery seeds once per open", () => {
  it("a visible false/true round-trip with the SAME initialQuery (the custom-food-form toggle, sheet never actually closes) does not re-seed or re-search", async () => {
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<PlateSheet {...props()} />);
    });
    expect(searchInput(root).props.value).toBe("Bacon Croissant");
    expect(mockedSearchCachedDishes).toHaveBeenCalledTimes(1);

    // The user types something else entirely, over the seeded query.
    act(() => {
      searchInput(root).props.onChangeText("something else the user typed");
    });

    // The custom-food form opens (visible -> false) and closes again (visible -> true) -- the
    // withTiming spy above never fires its completion callback, so modalVisible (and the reset
    // effect it gates) never flips, exactly like a real device's cancelled-mid-tween close.
    await act(async () => {
      root.update(<PlateSheet {...props({ visible: false })} />);
    });
    await act(async () => {
      root.update(<PlateSheet {...props({ visible: true })} />);
    });

    // Not re-seeded back to "Bacon Croissant", and not re-searched a second time.
    expect(searchInput(root).props.value).toBe("something else the user typed");
    expect(mockedSearchCachedDishes).toHaveBeenCalledTimes(1);
  });
});
