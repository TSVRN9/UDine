// PlateSheet reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx).
import renderer, { act } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { searchProducts } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { menuItemToPlateEntry, offResultToPlateEntry } from "../lib/plate";
import type { MenuItem } from "@udine/shared";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  searchProducts: jest.fn(),
}));

const mockedSearchProducts = searchProducts as jest.Mock;

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

const DISH: MenuItem = {
  dishName: "Pizza",
  category: "Entrees",
  mealPeriod: "lunch",
  hallTid: 1,
  date: "2026-08-19",
  nutrition: {
    servingSize: "1 slice",
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
  },
  allergens: [],
  dietTags: [],
};

describe("PlateSheet", () => {
  it("renders plate rows, totals, and a LOG N ITEMS button sized to total item count", () => {
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 3 }];
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateSheet
          visible
          plate={plate}
          totals={{ date: "x", calories: 600, proteinG: 27, totalCarbG: 72, totalFatG: 24 }}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onLogOffResult={async () => true}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Pizza/);
    expect(body).toMatch(/600/);
    expect(body).toMatch(/LOG 3 ITEMS/);
  });

  it("calls onStep with the row's key and +1/-1 from its stepper buttons", () => {
    const onStep = jest.fn();
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 2 }];
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateSheet
          visible
          plate={plate}
          totals={{ date: "x", calories: 400, proteinG: 18, totalCarbG: 48, totalFatG: 16 }}
          onStep={onStep}
          onAddOffResult={() => {}}
          onLogOffResult={async () => true}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add one Pizza" }).props.onPress();
    });
    expect(onStep).toHaveBeenCalledWith(plate[0].key, 1);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Remove one Pizza" }).props.onPress();
    });
    expect(onStep).toHaveBeenCalledWith(plate[0].key, -1);
  });

  it("searches OpenFoodFacts on submit and adds a picked result via onAddOffResult", async () => {
    mockedSearchProducts.mockResolvedValue([
      { barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } },
    ]);
    const onAddOffResult = jest.fn();
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateSheet
          visible
          plate={[]}
          totals={{ date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 }}
          onStep={() => {}}
          onAddOffResult={onAddOffResult}
          onLogOffResult={async () => true}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });

    act(() => {
      root.root.findByType(TextInput).props.onChangeText("trail mix");
    });
    await act(async () => {
      root.root.findByType(TextInput).props.onSubmitEditing();
    });

    expect(mockedSearchProducts).toHaveBeenCalledWith("trail mix");
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Trail Mix/);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add Trail Mix to plate" }).props.onPress();
    });
    expect(onAddOffResult).toHaveBeenCalledWith({ barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } });
  });

  // The direct-log path: logging a single OFF result (e.g. a piece of fruit) with nothing else
  // staged, without detouring through the plate/LOG N ITEMS flow -- see PlateSheet's own doc on
  // onLogOffResult.
  describe("logging a single OFF search result directly", () => {
    const TRAIL_MIX = { barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } };

    async function renderWithSearchResult(onLogOffResult: (result: typeof TRAIL_MIX) => Promise<boolean>, onAddOffResult = jest.fn()) {
      mockedSearchProducts.mockResolvedValue([TRAIL_MIX]);
      let root!: renderer.ReactTestRenderer;
      act(() => {
        root = renderer.create(
          <PlateSheet
            visible
            plate={[]}
            totals={{ date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 }}
            onStep={() => {}}
            onAddOffResult={onAddOffResult}
            onLogOffResult={onLogOffResult}
            onLog={() => {}}
            onClose={() => {}}
          />,
        );
      });
      act(() => {
        root.root.findByType(TextInput).props.onChangeText("trail mix");
      });
      await act(async () => {
        root.root.findByType(TextInput).props.onSubmitEditing();
      });
      return { root, onAddOffResult };
    }

    it("calls onLogOffResult with the tapped result, not onAddOffResult -- it's a parallel action, not a detour through the plate", async () => {
      const onLogOffResult = jest.fn().mockResolvedValue(true);
      const { root, onAddOffResult } = await renderWithSearchResult(onLogOffResult);

      await act(async () => {
        root.root.findByProps({ accessibilityLabel: "Log Trail Mix now, without adding the rest of the plate" }).props.onPress();
      });

      expect(onLogOffResult).toHaveBeenCalledWith(TRAIL_MIX);
      expect(onAddOffResult).not.toHaveBeenCalled();
    });

    it("shows an inline 'Logged' confirmation on the result row when onLogOffResult resolves true, without closing the sheet", async () => {
      const onClose = jest.fn();
      const onLogOffResult = jest.fn().mockResolvedValue(true);
      mockedSearchProducts.mockResolvedValue([TRAIL_MIX]);
      let root!: renderer.ReactTestRenderer;
      act(() => {
        root = renderer.create(
          <PlateSheet
            visible
            plate={[]}
            totals={{ date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 }}
            onStep={() => {}}
            onAddOffResult={() => {}}
            onLogOffResult={onLogOffResult}
            onLog={() => {}}
            onClose={onClose}
          />,
        );
      });
      act(() => {
        root.root.findByType(TextInput).props.onChangeText("trail mix");
      });
      await act(async () => {
        root.root.findByType(TextInput).props.onSubmitEditing();
      });
      await act(async () => {
        root.root.findByProps({ accessibilityLabel: "Log Trail Mix now, without adding the rest of the plate" }).props.onPress();
      });

      expect(texts(root).flat().join(" ")).toMatch(/Trail Mix.*Logged/);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("shows an inline failure message on the result row when onLogOffResult resolves false", async () => {
      const onLogOffResult = jest.fn().mockResolvedValue(false);
      const { root } = await renderWithSearchResult(onLogOffResult);

      await act(async () => {
        root.root.findByProps({ accessibilityLabel: "Log Trail Mix now, without adding the rest of the plate" }).props.onPress();
      });

      expect(texts(root).flat().join(" ")).toMatch(/Couldn't log — try again/);
    });
  });

  const ZERO_TOTALS = { date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 };
  const noopProps = { plate: [], totals: ZERO_TOTALS, onStep: () => {}, onAddOffResult: () => {}, onLogOffResult: async () => true, onLog: () => {} };

  // #198: onSubmitEditing had no guard against a search already in flight -- the Search BUTTON
  // already disables on `searching`, but hitting Enter/the keyboard's search key went straight to
  // runSearch regardless, so mashing Enter while typing fired overlapping searchProducts calls.
  it("#198: a second Enter while a search is already in flight is ignored, not fired as an overlapping request", async () => {
    // This file has no shared beforeEach mock reset (earlier tests assert with toHaveBeenCalledWith,
    // never a call count) -- clear here since this is the first test that counts calls.
    mockedSearchProducts.mockClear();
    let resolveFirst!: (v: unknown) => void;
    mockedSearchProducts.mockImplementation(() => new Promise((resolve) => (resolveFirst = resolve)));
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<PlateSheet visible {...noopProps} onClose={() => {}} />);
    });

    act(() => {
      root.root.findByType(TextInput).props.onChangeText("a");
    });
    act(() => {
      root.root.findByType(TextInput).props.onSubmitEditing(); // search #1 starts, unresolved
    });
    act(() => {
      root.root.findByType(TextInput).props.onChangeText("banana");
    });
    act(() => {
      root.root.findByType(TextInput).props.onSubmitEditing(); // must be dropped -- #1 is still in flight
    });

    expect(mockedSearchProducts).toHaveBeenCalledTimes(1);
    expect(mockedSearchProducts).toHaveBeenCalledWith("a");

    await act(async () => {
      resolveFirst([]);
      await Promise.resolve();
    });
  });

  // #198: a stale search left in flight when the sheet closes had nothing invalidating it -- if the
  // user reopens and runs a different, faster search, the stale one resolving afterward silently
  // overwrote the fresh results with an answer to a query the box no longer even shows.
  it("#198: a stale search left in flight when the sheet closes doesn't clobber a fresh search run after reopening", async () => {
    let resolveStale!: (v: unknown) => void;
    mockedSearchProducts.mockImplementationOnce(() => new Promise((resolve) => (resolveStale = resolve)));

    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<PlateSheet visible {...noopProps} onClose={() => {}} />);
    });
    act(() => {
      root.root.findByType(TextInput).props.onChangeText("a");
    });
    act(() => {
      root.root.findByType(TextInput).props.onSubmitEditing(); // stale search now in flight
    });

    // Sheet closes before the stale search resolves...
    act(() => {
      root.update(<PlateSheet visible={false} {...noopProps} onClose={() => {}} />);
    });
    // ...then reopens, and the user runs a different, faster search.
    mockedSearchProducts.mockResolvedValueOnce([{ barcode: "999", productName: "Banana Chips", nutrition: DISH.nutrition }]);
    act(() => {
      root.update(<PlateSheet visible {...noopProps} onClose={() => {}} />);
    });
    act(() => {
      root.root.findByType(TextInput).props.onChangeText("banana");
    });
    await act(async () => {
      root.root.findByType(TextInput).props.onSubmitEditing();
      await Promise.resolve();
    });
    expect(texts(root).flat().join(" ")).toMatch(/Banana Chips/);

    // The stale first search finally resolves -- must not clobber the fresh results now showing.
    await act(async () => {
      resolveStale([{ barcode: "1", productName: "STALE RESULT", nutrition: DISH.nutrition }]);
      await Promise.resolve();
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Banana Chips/);
    expect(body).not.toMatch(/STALE RESULT/);
  });

  it("flags a per-100g-estimated OFF result on both the search-result row and once it's a plate row", async () => {
    // shared/src/openFoodFacts.ts's searchProducts marks a per-100g fallback with the literal
    // servingSize "per 100g" -- this is the finding-4 fix: that marker previously existed in shared
    // but nothing in the UI read it, so 100g numbers silently logged as "1 serving".
    mockedSearchProducts.mockResolvedValue([
      { barcode: "999", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150, servingSize: "per 100g" } },
    ]);
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateSheet
          visible
          plate={[]}
          totals={{ date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 }}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onLogOffResult={async () => true}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    act(() => {
      root.root.findByType(TextInput).props.onChangeText("trail mix");
    });
    await act(async () => {
      root.root.findByType(TextInput).props.onSubmitEditing();
    });
    expect(texts(root).flat().join(" ")).toMatch(/est\. per 100g/);

    // Once it's on the plate (a row the parent passes back in via the `plate` prop), the same
    // estimate flag must still show -- this is where a real user actually sees the number they're
    // about to log, not just in the pre-pick search results.
    let plateRoot!: renderer.ReactTestRenderer;
    act(() => {
      plateRoot = renderer.create(
        <PlateSheet
          visible
          plate={[offResultToPlateEntry({ barcode: "999", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150, servingSize: "per 100g" } })]}
          totals={{ date: "x", calories: 150, proteinG: 9, totalCarbG: 24, totalFatG: 8 }}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onLogOffResult={async () => true}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    expect(texts(plateRoot).flat().join(" ")).toMatch(/est\. per 100g/);
  });

  it("does not flag a normal per-serving plate row as an estimate", () => {
    const plate = [{ ...menuItemToPlateEntry(DISH), count: 1 }]; // DISH.nutrition.servingSize is "1 slice"
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <PlateSheet
          visible
          plate={plate}
          totals={{ date: "x", calories: 200, proteinG: 9, totalCarbG: 24, totalFatG: 8 }}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onLogOffResult={async () => true}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/est\./);
  });
});
