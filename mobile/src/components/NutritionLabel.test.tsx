// NutritionLabel reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import type { NutritionFacts } from "@udine/shared";
import { NutritionLabel } from "./NutritionLabel";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

const NUTRITION: NutritionFacts = {
  servingSize: "1 each",
  calories: 127,
  caloriesFromFat: 26,
  totalFatG: 2.9,
  satFatG: 0.5,
  transFatG: 0,
  cholesterolMg: 50.9,
  sodiumMg: 237.2,
  totalCarbG: 20.4,
  dietaryFiberG: 1,
  sugarsG: 3.4,
  proteinG: 5.3,
  totalFatDv: 4,
  satFatDv: null,
  cholesterolDv: null,
  sodiumDv: 10,
  totalCarbDv: 16,
  dietaryFiberDv: 3,
  sugarsDv: null,
  proteinDv: 9,
};

describe("NutritionLabel", () => {
  it("renders the dish name, calories, DV rows, and allergen/diet chips when visible", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <NutritionLabel visible dishName="French Toast" nutrition={NUTRITION} allergens={["Milk", "Wheat"]} dietTags={["Vegetarian"]} onClose={() => {}} />,
      );
    });

    const body = texts(root).flat().join(" ");
    expect(body).toMatch(/French Toast/);
    expect(body).toMatch(/127/);
    expect(body).toMatch(/Sodium/);
    expect(body).toMatch(/10%/);
    expect(body).toMatch(/Milk/);
    expect(body).toMatch(/Vegetarian/);
  });

  it("calls onClose from the header Close control", () => {
    const onClose = jest.fn();
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(
        <NutritionLabel visible dishName="French Toast" nutrition={NUTRITION} allergens={[]} dietTags={[]} onClose={onClose} />,
      );
    });
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Close" }).props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
