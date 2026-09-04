// PlateSheet reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { InMemoryLogStorage, searchProducts, type LogEntry, type LogStorage, type MenuItem } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { menuItemToPlateEntry, offResultToPlateEntry } from "../lib/plate";

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

// The OFF search box and the new food-history search box are both plain TextInputs -- tests that
// only care about one of them disambiguate by placeholder rather than relying on findByType(TextInput)
// returning a single match.
function offSearchInput(root: renderer.ReactTestRenderer) {
  return root.root.findByProps({ placeholder: "Search packaged foods" });
}
function historySearchInput(root: renderer.ReactTestRenderer) {
  return root.root.findByProps({ placeholder: "Search your food history" });
}

function emptyLogStorage(): LogStorage {
  return new InMemoryLogStorage();
}

async function logStorageWith(entries: LogEntry[]): Promise<LogStorage> {
  const storage = new InMemoryLogStorage();
  for (const entry of entries) await storage.addEntry(entry);
  return storage;
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
          logStorage={emptyLogStorage()}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onAddHistoryDish={() => {}}
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
          logStorage={emptyLogStorage()}
          onStep={onStep}
          onAddOffResult={() => {}}
          onAddHistoryDish={() => {}}
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
          logStorage={emptyLogStorage()}
          onStep={() => {}}
          onAddOffResult={onAddOffResult}
          onAddHistoryDish={() => {}}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });

    act(() => {
      offSearchInput(root).props.onChangeText("trail mix");
    });
    await act(async () => {
      offSearchInput(root).props.onSubmitEditing();
    });

    expect(mockedSearchProducts).toHaveBeenCalledWith("trail mix");
    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/Trail Mix/);

    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add Trail Mix to plate" }).props.onPress();
    });
    expect(onAddOffResult).toHaveBeenCalledWith({ barcode: "123", productName: "Trail Mix", nutrition: { ...DISH.nutrition, calories: 150 } });
  });

  const ZERO_TOTALS = { date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 };
  const noopProps = {
    plate: [],
    totals: ZERO_TOTALS,
    logStorage: emptyLogStorage(),
    onStep: () => {},
    onAddOffResult: () => {},
    onAddHistoryDish: () => {},
    onLog: () => {},
  };

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
      offSearchInput(root).props.onChangeText("a");
    });
    act(() => {
      offSearchInput(root).props.onSubmitEditing(); // search #1 starts, unresolved
    });
    act(() => {
      offSearchInput(root).props.onChangeText("banana");
    });
    act(() => {
      offSearchInput(root).props.onSubmitEditing(); // must be dropped -- #1 is still in flight
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
      offSearchInput(root).props.onChangeText("a");
    });
    act(() => {
      offSearchInput(root).props.onSubmitEditing(); // stale search now in flight
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
      offSearchInput(root).props.onChangeText("banana");
    });
    await act(async () => {
      offSearchInput(root).props.onSubmitEditing();
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
          logStorage={emptyLogStorage()}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onAddHistoryDish={() => {}}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    act(() => {
      offSearchInput(root).props.onChangeText("trail mix");
    });
    await act(async () => {
      offSearchInput(root).props.onSubmitEditing();
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
          logStorage={emptyLogStorage()}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onAddHistoryDish={() => {}}
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
          logStorage={emptyLogStorage()}
          onStep={() => {}}
          onAddOffResult={() => {}}
          onAddHistoryDish={() => {}}
          onLog={() => {}}
          onClose={() => {}}
        />,
      );
    });
    expect(texts(root).flat().join(" ")).not.toMatch(/est\./);
  });

  describe("food-history search (dishes logged before, not necessarily on today's menu)", () => {
    function historyEntry(dishName: string, hallTid: number, calories: number, loggedAt: string, servings = 1): LogEntry {
      return {
        id: `${dishName}-${loggedAt}`,
        loggedAt,
        source: { type: "umass-menu", dishName, hallTid },
        servings,
        nutrition: { ...DISH.nutrition, calories },
      };
    }

    it("searches local log history on submit and stages a picked dish via onAddHistoryDish, not onAddOffResult", async () => {
      const storage = await logStorageWith([historyEntry("Falafel Wrap", 3, 350, "2026-08-01T12:00:00.000Z")]);
      const onAddHistoryDish = jest.fn();
      const onAddOffResult = jest.fn();
      let root!: renderer.ReactTestRenderer;
      act(() => {
        root = renderer.create(
          <PlateSheet
            visible
            plate={[]}
            totals={ZERO_TOTALS}
            logStorage={storage}
            onStep={() => {}}
            onAddOffResult={onAddOffResult}
            onAddHistoryDish={onAddHistoryDish}
            onLog={() => {}}
            onClose={() => {}}
          />,
        );
      });

      act(() => {
        historySearchInput(root).props.onChangeText("falafel");
      });
      await act(async () => {
        historySearchInput(root).props.onSubmitEditing();
      });

      const body = texts(root).flat().join(" ");
      expect(body).toMatch(/Falafel Wrap/);

      act(() => {
        root.root.findByProps({ accessibilityLabel: "Add Falafel Wrap from your history to plate" }).props.onPress();
      });
      expect(onAddHistoryDish).toHaveBeenCalledWith({ dishName: "Falafel Wrap", hallTid: 3, nutrition: { ...DISH.nutrition, calories: 350 } });
      expect(onAddOffResult).not.toHaveBeenCalled();
    });

    it("never surfaces an OFF-sourced past log entry from the history search", async () => {
      const storage: LogStorage = new InMemoryLogStorage();
      await storage.addEntry({
        id: "off-1",
        loggedAt: "2026-08-01T12:00:00.000Z",
        source: { type: "off", barcode: "123", productName: "Trail Mix" },
        servings: 1,
        nutrition: { ...DISH.nutrition, calories: 150 },
      });
      let root!: renderer.ReactTestRenderer;
      act(() => {
        root = renderer.create(
          <PlateSheet
            visible
            plate={[]}
            totals={ZERO_TOTALS}
            logStorage={storage}
            onStep={() => {}}
            onAddOffResult={() => {}}
            onAddHistoryDish={() => {}}
            onLog={() => {}}
            onClose={() => {}}
          />,
        );
      });

      act(() => {
        historySearchInput(root).props.onChangeText("trail");
      });
      await act(async () => {
        historySearchInput(root).props.onSubmitEditing();
      });

      const body = texts(root).flat().join(" ");
      expect(body).not.toMatch(/Trail Mix/);
      expect(body).toMatch(/No matches/);
    });

    it("dedupes by dish name, surfacing only the most recent nutrition snapshot", async () => {
      const storage = await logStorageWith([
        historyEntry("Pizza", 1, 999, "2026-08-01T12:00:00.000Z", 3),
        historyEntry("Pizza", 1, 200, "2026-08-05T12:00:00.000Z", 1),
      ]);
      let root!: renderer.ReactTestRenderer;
      act(() => {
        root = renderer.create(<PlateSheet visible {...noopProps} logStorage={storage} onClose={() => {}} />);
      });

      act(() => {
        historySearchInput(root).props.onChangeText("pizza");
      });
      await act(async () => {
        historySearchInput(root).props.onSubmitEditing();
      });

      const body = texts(root).flat().join(" ");
      const pizzaRows = texts(root)
        .flat()
        .filter((t) => typeof t === "string" && t.includes("Pizza"));
      expect(pizzaRows).toHaveLength(1);
      expect(body).toMatch(/200/);
      expect(body).not.toMatch(/999/);
    });
  });
});
