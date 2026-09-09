import { buildCustomFood, hasRequiredCoreMacros } from "./customFoodForm";

const CORE_ONLY = {
  name: "Grandma's Lasagna",
  servingSize: "1 slice",
  calories: "420",
  proteinG: "22",
  totalCarbG: "35",
  totalFatG: "18",
};

test("builds a CustomFood from just the 4 required core macros, defaulting every optional NutritionFacts field to 0", () => {
  const food = buildCustomFood(CORE_ONLY, "c1");
  expect(food).toEqual({
    id: "c1",
    name: "Grandma's Lasagna",
    servingSize: "1 slice",
    nutrition: {
      servingSize: "1 slice",
      calories: 420,
      caloriesFromFat: 0,
      totalFatG: 18,
      satFatG: 0,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 35,
      dietaryFiberG: 0,
      sugarsG: 0,
      proteinG: 22,
    },
  });
});

test("fills in the optional 'more nutrition fields' when provided", () => {
  const food = buildCustomFood(
    { ...CORE_ONLY, satFatG: "8", transFatG: "0", cholesterolMg: "60", sodiumMg: "650", dietaryFiberG: "2", sugarsG: "4", caloriesFromFat: "160" },
    "c1",
  );
  expect(food?.nutrition).toMatchObject({ satFatG: 8, cholesterolMg: 60, sodiumMg: 650, dietaryFiberG: 2, sugarsG: 4, caloriesFromFat: 160 });
});

test("includes ingredients only when non-blank", () => {
  expect(buildCustomFood({ ...CORE_ONLY, ingredients: "Pasta, sauce, cheese" }, "c1")?.ingredients).toBe("Pasta, sauce, cheese");
  expect("ingredients" in buildCustomFood(CORE_ONLY, "c1")!).toBe(false);
  expect("ingredients" in buildCustomFood({ ...CORE_ONLY, ingredients: "   " }, "c1")!).toBe(false);
});

test("returns null when name is blank or whitespace-only -- required field", () => {
  expect(buildCustomFood({ ...CORE_ONLY, name: "" }, "c1")).toBeNull();
  expect(buildCustomFood({ ...CORE_ONLY, name: "   " }, "c1")).toBeNull();
});

test("trims name and servingSize", () => {
  const food = buildCustomFood({ ...CORE_ONLY, name: "  Lasagna  ", servingSize: "  1 slice  " }, "c1");
  expect(food?.name).toBe("Lasagna");
  expect(food?.servingSize).toBe("1 slice");
});

test("defaults servingSize to '1 serving' when left blank", () => {
  const food = buildCustomFood({ ...CORE_ONLY, servingSize: "" }, "c1");
  expect(food?.servingSize).toBe("1 serving");
  expect(food?.nutrition.servingSize).toBe("1 serving");
});

test("blank or non-numeric core macro fields default to 0 rather than NaN", () => {
  const food = buildCustomFood({ ...CORE_ONLY, calories: "", proteinG: "not a number" }, "c1");
  expect(food?.nutrition.calories).toBe(0);
  expect(food?.nutrition.proteinG).toBe(0);
});

describe("hasRequiredCoreMacros", () => {
  it("is true once all 4 core macros are filled with real numbers", () => {
    expect(hasRequiredCoreMacros(CORE_ONLY)).toBe(true);
  });

  it.each(["calories", "proteinG", "totalCarbG", "totalFatG"] as const)("is false when %s is blank", (field) => {
    expect(hasRequiredCoreMacros({ ...CORE_ONLY, [field]: "" })).toBe(false);
  });

  it("is false when a core macro is whitespace-only", () => {
    expect(hasRequiredCoreMacros({ ...CORE_ONLY, calories: "   " })).toBe(false);
  });

  it("is false when a core macro is non-numeric", () => {
    expect(hasRequiredCoreMacros({ ...CORE_ONLY, proteinG: "a lot" })).toBe(false);
  });
});
