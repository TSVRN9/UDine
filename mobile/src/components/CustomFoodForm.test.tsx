// CustomFoodForm reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// NutritionLabel.test.tsx/PlateBar.test.tsx).
//
// pr-reviewer finding on PR #367: the Save button was only gated on the name field being
// non-blank -- calories/protein/carbs/fat could all be left empty, and customFoodForm.ts's
// buildCustomFood silently defaults a blank/non-numeric core macro to 0 (that fallback is correct
// for the OPTIONAL "more nutrition fields" section, but the form never actually enforced its own
// "4 core macros required up front" claim for Save itself). These tests lock in that Save stays
// disabled until all 4 are filled with real numbers.
import renderer, { act } from "react-test-renderer";
import type { CustomFoodsStorage } from "@udine/shared";
import { CustomFoodForm } from "./CustomFoodForm";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function fakeCustomFoodsStorage(): CustomFoodsStorage {
  return { addCustomFood: jest.fn().mockResolvedValue(undefined), removeCustomFood: jest.fn(), getAllCustomFoods: jest.fn().mockResolvedValue([]) };
}

function saveButton(root: renderer.ReactTestRenderer) {
  return root.root.findByProps({ children: "Save Custom Food" });
}

function setField(root: renderer.ReactTestRenderer, label: string, value: string) {
  act(() => {
    root.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value);
  });
}

function renderForm(overrides: Partial<Parameters<typeof CustomFoodForm>[0]> = {}) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<CustomFoodForm visible customFoodsStorage={fakeCustomFoodsStorage()} onSaved={() => {}} onClose={() => {}} {...overrides} />);
  });
  return root;
}

describe("CustomFoodForm", () => {
  it("Save starts disabled with a blank form", () => {
    const root = renderForm();
    expect(saveButton(root).props.disabled).toBe(true);
  });

  it("Save stays disabled with a name but no core macros filled", () => {
    const root = renderForm();
    setField(root, "Name", "Grandma's Lasagna");
    expect(saveButton(root).props.disabled).toBe(true);
  });

  it.each(["Calories", "Protein (g)", "Carbs (g)", "Fat (g)"])("Save stays disabled while %s is still blank", (missingLabel) => {
    const root = renderForm();
    setField(root, "Name", "Grandma's Lasagna");
    for (const label of ["Calories", "Protein (g)", "Carbs (g)", "Fat (g)"]) {
      if (label !== missingLabel) setField(root, label, "10");
    }
    expect(saveButton(root).props.disabled).toBe(true);
  });

  it("Save becomes enabled once the name and all 4 core macros are filled with real numbers", () => {
    const root = renderForm();
    setField(root, "Name", "Grandma's Lasagna");
    setField(root, "Calories", "420");
    setField(root, "Protein (g)", "22");
    setField(root, "Carbs (g)", "35");
    setField(root, "Fat (g)", "18");
    expect(saveButton(root).props.disabled).toBe(false);
  });

  it("Save stays disabled when a core macro is non-numeric", () => {
    const root = renderForm();
    setField(root, "Name", "Grandma's Lasagna");
    setField(root, "Calories", "a lot");
    setField(root, "Protein (g)", "22");
    setField(root, "Carbs (g)", "35");
    setField(root, "Fat (g)", "18");
    expect(saveButton(root).props.disabled).toBe(true);
  });

  it("tapping Save while enabled persists via customFoodsStorage and calls onSaved", async () => {
    const customFoodsStorage = fakeCustomFoodsStorage();
    const onSaved = jest.fn();
    const root = renderForm({ customFoodsStorage, onSaved });
    setField(root, "Name", "Grandma's Lasagna");
    setField(root, "Calories", "420");
    setField(root, "Protein (g)", "22");
    setField(root, "Carbs (g)", "35");
    setField(root, "Fat (g)", "18");

    await act(async () => {
      saveButton(root).props.onPress();
      await Promise.resolve();
    });

    expect(customFoodsStorage.addCustomFood).toHaveBeenCalledWith(expect.objectContaining({ name: "Grandma's Lasagna", nutrition: expect.objectContaining({ calories: 420 }) }));
    expect(onSaved).toHaveBeenCalled();
  });
});
