jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  searchProducts: jest.fn(),
}));

import renderer, { act } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { searchProducts } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { menuItemToPlateEntry } from "../lib/plate";
import type { MenuItem } from "@udine/shared";

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
});
