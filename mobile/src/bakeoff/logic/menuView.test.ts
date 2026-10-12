import { loadFixture } from "./fixture";
import { ALLERGENS, NO_PREFS, dayCell, dayFull, dayLong, defaultMeal, hits, isOneMeal, prefSummary, mealsOf, menuItems, menuView, rowScores, type Prefs } from "./menuView";
import type { Dish, MealKey, PlaceKey } from "./types";

const fx = loadFixture();
const TODAY = "2026-10-08";
const prefs = (p: Partial<Prefs>): Prefs => ({ ...NO_PREFS, ...p });
const all = (day: string, place: PlaceKey, meal: MealKey) => fx.days[day][place]![meal]!.flatMap((s) => s.dishes);
const names = (v: { sections: { dishes: Dish[] }[] }) => v.sections.flatMap((s) => s.dishes);

// the dishes M2's Worcester lunch hides for milk (its NOTES: "The 20 milk dishes")
const W = (p: Partial<Prefs>, showAll = false) => menuView(fx, TODAY, "W", "lunch", prefs(p), showAll);

describe("menuView: allergens and diet", () => {
  it("hides every dish that lists an avoided allergen and counts them", () => {
    const v = W({ avoid: ["Fish"] });
    const removed = all(TODAY, "W", "lunch").filter((d) => d.allergens.includes("Fish"));
    expect(removed.length).toBeGreaterThan(0);
    expect(names(v).some((d) => d.allergens.includes("Fish"))).toBe(false);
    expect(v.hidden).toBe(removed.length);
    expect(names(v)).toHaveLength(all(TODAY, "W", "lunch").length - removed.length);
  });
  it("Show all returns everything, hides nothing and never reads the preference", () => {
    const p = prefs({ avoid: ["Milk"] });
    const before = JSON.stringify(p);
    const v = menuView(fx, TODAY, "W", "lunch", p, true);
    expect(names(v)).toHaveLength(all(TODAY, "W", "lunch").length);
    expect(v.hidden).toBe(0);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("a dish that lists no allergens always shows", () => {
    const blank = all(TODAY, "W", "lunch").filter((d) => d.allergens.length === 0);
    expect(blank.length).toBeGreaterThan(0);
    const v = W({ avoid: [...ALLERGENS] });
    for (const d of blank) expect(names(v)).toContain(d);
  });
  it("vegetarian keeps plant based dishes (plant implies veg)", () => {
    const plant = all(TODAY, "W", "lunch").filter((d) => d.diet & 2);
    expect(plant.length).toBeGreaterThan(0);
    const v = W({ veg: true });
    for (const d of plant) expect(names(v)).toContain(d);
    expect(names(v).every((d) => d.diet & 3)).toBe(true);
  });
  it("stations keep the feed's order and empty ones are dropped", () => {
    const feed = fx.days[TODAY].W!.lunch!.map((s) => s.name);
    expect(W({}).sections.map((s) => s.name)).toEqual(feed);
    const v = W({ avoid: [...ALLERGENS] });
    expect(v.sections.map((s) => s.name)).toEqual(feed.filter((n) => v.sections.some((s) => s.name === n)));
    expect(v.sections.every((s) => s.dishes.length > 0)).toBe(true);
  });
  it("hits lists only the avoided allergens a dish lists", () => {
    const d = all(TODAY, "W", "lunch").find((x) => x.allergens.includes("Milk") && x.allergens.length > 1)!;
    expect(hits(prefs({ avoid: ["Milk"] }), d)).toEqual(["Milk"]);
    expect(hits(prefs({}), d)).toEqual([]);
  });
});

describe("menuView: the one line over the list", () => {
  const n = (avoid: string[]) => all(TODAY, "W", "lunch").filter((d) => avoid.some((a) => d.allergens.includes(a))).length;
  it("no preferences, no line", () => expect(W({}).line).toBeNull());
  it("counts what it hides and names the allergen", () => {
    const k = n(["Milk"]);
    expect(W({ avoid: ["Milk"] }).line).toBe(`Hiding ${k} dishes that list milk`);
  });
  it("leads with the diet when one is on", () => {
    const k = W({ veg: true, avoid: ["Milk"] }).hidden;
    expect(k).toBeGreaterThan(1);
    expect(W({ veg: true, avoid: ["Milk"] }).line).toBe(`Showing vegetarian dishes, hiding ${k} that list milk`);
  });
  it("a diet alone still says so", () => expect(W({ plant: true, halal: true }).line).toBe("Showing plant based, halal dishes"));
  it("revealed, it says so and offers to hide again", () => expect(W({ avoid: ["Milk"] }, true).line).toBe("Showing all dishes"));
  it("names up to three allergens, then counts the rest", () => {
    const l = W({ avoid: ["Milk", "Eggs", "Soy", "Wheat", "Fish"] }).line!;
    expect(l).toMatch(/^Hiding \d+ dishes that list [a-z ]+, [a-z ]+, [a-z ]+ or \d+ more$/);
  });
  it("singular for one dish", () => {
    expect(menuView(fx, TODAY, "F", "lunch", prefs({ avoid: ["Tree Nuts"] }), false).line).toBe("Hiding 1 dish that lists tree nuts");
  });
});

describe("menuView: days and meals", () => {
  it("an empty day has no meals and no sections", () => {
    expect(mealsOf(fx, "2026-10-10", "W")).toEqual([]);
    expect(menuView(fx, "2026-10-10", "W", "lunch", NO_PREFS, false)).toMatchObject({ sections: [], hidden: 0, line: null });
  });
  it("meals follow M2's order, Franklin has four on Thursday and two on Sunday", () => {
    expect(mealsOf(fx, TODAY, "F")).toEqual(["breakfast", "lunch", "dinner", "grab"]);
    expect(mealsOf(fx, "2026-10-11", "F")).toEqual(["lunch", "dinner"]);
    expect(mealsOf(fx, TODAY, "W")).toEqual(["breakfast", "lunch", "dinner", "late", "grab"]);
  });
  it("the meal is kept when the new day has it, else the clock's, else all day, else the first", () => {
    expect(defaultMeal(fx, TODAY, "F", "dinner")).toBe("dinner");
    expect(defaultMeal(fx, "2026-10-11", "F", "breakfast")).toBe("lunch");
    expect(defaultMeal(fx, TODAY, "c12", "lunch")).toBe("all");
    expect(defaultMeal(fx, TODAY, "c27", "lunch")).toBe("breakfast");
  });
  it("a one-menu café has no tab row; a hall and a multi-meal café do", () => {
    expect(isOneMeal(fx, "c12")).toBe(true);
    expect(isOneMeal(fx, "c17")).toBe(true);
    expect(isOneMeal(fx, "c10")).toBe(false);
    expect(isOneMeal(fx, "W")).toBe(false);
  });
  it("the day cell and its full name", () => {
    expect([0, 1, 2, 3].map((i) => dayCell(fx, i))).toEqual(["Today", "Fri 9", "Sat 10", "Sun 11"]);
    expect(dayFull(fx, 2)).toBe("Saturday, October 10");
  });
});

describe("rowScores (Review Focus 5)", () => {
  const dish = (health: number | null, carbon: Dish["carbon"]) => ({ health, carbon }) as Dish;
  const on = { health: true, carbon: true };
  it("an unscored dish leaves nothing to draw, whatever the toggles", () => {
    expect(rowScores(dish(null, null), on)).toBeNull();
    expect(rowScores(dish(null, null), { health: true, carbon: false })).toBeNull();
  });
  it("draws only the scored kinds the toggles allow", () => {
    expect(rowScores(dish(5, null), on)).toEqual({ health: 5, carbon: null });
    expect(rowScores(dish(null, "B"), on)).toEqual({ health: null, carbon: "B" });
    expect(rowScores(dish(5, "B"), { health: false, carbon: true })).toEqual({ health: null, carbon: "B" });
    expect(rowScores(dish(5, "B"), { health: false, carbon: false })).toBeNull();
  });
  it("H0 is a real zero", () => expect(rowScores(dish(0, null), on)).toEqual({ health: 0, carbon: null }));
  it("every dish in the fixture with a raw number but no H code draws nothing", () => {
    const unscored = fx.dishes.filter((d) => d.health == null && d.carbon == null);
    expect(unscored.length).toBeGreaterThan(0);
    for (const d of unscored) expect(rowScores(d, on)).toBeNull();
  });
});

describe("menuItems", () => {
  it("flattens a view to one list: the line, then each station's head and its dishes", () => {
    const v = menuView(fx, TODAY, "W", "lunch", prefs({ avoid: ["Milk"] }), false);
    const items = menuItems(v, prefs({ avoid: ["Milk"] }), false, "");
    expect(items[0]).toEqual({ t: "note", line: v.line, revealed: false });
    expect(items.filter((i) => i.t === "head").map((i) => (i as { name: string }).name)).toEqual(v.sections.map((s) => s.name));
    expect(items.filter((i) => i.t === "dish")).toHaveLength(names(v).length);
    expect(items[1]).toMatchObject({ t: "head", si: 0 });
  });
  it("only a revealed row carries Contains, and only for the allergens you avoid", () => {
    const p = prefs({ avoid: ["Milk"] });
    const hid = menuItems(menuView(fx, TODAY, "W", "lunch", p, false), p, false, "");
    expect(hid.every((i) => i.t !== "dish" || i.contains.length === 0)).toBe(true);
    const shown = menuItems(menuView(fx, TODAY, "W", "lunch", p, true), p, true, "");
    const withMilk = shown.filter((i) => i.t === "dish" && i.contains.length);
    expect(withMilk).toHaveLength(20);
    expect(shown[0]).toEqual({ t: "note", line: "Showing all dishes", revealed: true });
  });
  it("no line, no note row; an empty day is one empty row", () => {
    expect(menuItems(menuView(fx, TODAY, "W", "lunch", NO_PREFS, false), NO_PREFS, false, "")[0].t).toBe("head");
    expect(menuItems(menuView(fx, "2026-10-10", "W", "lunch", NO_PREFS, false), NO_PREFS, false, "No menu posted for Saturday, October 10.")).toEqual([
      { t: "empty", text: "No menu posted for Saturday, October 10." },
    ]);
  });
});

describe("day labels are formatted once (Hermes Intl is a JNI call per use: ~10 ms each in the release profile)", () => {
  it("a repeated dayCell/dayFull/dayLong makes no Intl call", () => {
    dayCell(fx, 2); dayFull(fx, 2); dayLong(fx, 2);
    const spy = jest.spyOn(Date.prototype, "toLocaleDateString");
    expect([dayCell(fx, 2), dayFull(fx, 2), dayLong(fx, 2)]).toEqual(["Sat 10", "Saturday, October 10", "Saturday, October 10"]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("prefSummary: the Dietary preferences row's second line (M2 prefSummary)", () => {
  it("says Everything with no preferences", () => expect(prefSummary(NO_PREFS)).toBe("Everything"));
  it("names the diet, then what is avoided, capitalised once", () => {
    expect(prefSummary({ ...NO_PREFS, veg: true, avoid: ["Milk", "Tree Nuts"] })).toBe("Vegetarian, no milk or tree nuts");
    expect(prefSummary({ ...NO_PREFS, avoid: ["Fish"] })).toBe("No fish");
  });
  it("plant based covers vegetarian, and halal joins it", () => {
    expect(prefSummary({ ...NO_PREFS, veg: true, plant: true, halal: true, avoid: [] })).toBe("Plant based, halal");
  });
  it("counts the rest past three", () => {
    expect(prefSummary({ ...NO_PREFS, avoid: ["Milk", "Eggs", "Fish", "Soy", "Corn"] })).toBe("No milk, eggs, fish or 2 more");
  });
});
