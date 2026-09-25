import type { LogEntry, LogStorage, NutritionFacts } from "@udine/shared";
import { getLoggedUmassDishHistory } from "./dishHistory";

function nutrition(calories: number): NutritionFacts {
  return {
    servingSize: "1 each",
    calories,
    caloriesFromFat: 0,
    totalFatG: 1,
    satFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
    sodiumMg: 0,
    totalCarbG: 1,
    dietaryFiberG: 0,
    sugarsG: 0,
    proteinG: 1,
  };
}

function fakeStorage(entries: LogEntry[]): LogStorage {
  return {
    addEntry: async () => {},
    removeEntry: async () => {},
    getEntriesForDate: async () => [],
    getAllEntries: async () => entries,
  };
}

describe("getLoggedUmassDishHistory", () => {
  it("only returns umass-menu-sourced entries, never OFF-sourced ones", async () => {
    const storage = fakeStorage([
      { id: "1", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "Pizza", hallTid: 1 }, servings: 1, nutrition: nutrition(200) },
      { id: "2", loggedAt: "2026-08-02T00:00:00.000Z", source: { type: "off", barcode: "123", productName: "Trail Mix" }, servings: 1, nutrition: nutrition(150) },
    ]);
    const results = await getLoggedUmassDishHistory(storage, 1, "");
    expect(results).toHaveLength(1);
    expect(results[0].dishName).toBe("Pizza");
  });

  // #344 review: dedup used to be hall-agnostic (by dishName alone, across every hall), which meant
  // a staged HistoryDish could carry forward a *different* hall's hallTid than the one the user is
  // currently browsing -- and that hallTid feeds server-synced hall-completion/favorite-hall
  // derivation (#94), so two halls sharing an identical dish name could misattribute credit. Search
  // is now scoped to one hall at a time.
  it("never surfaces a dish logged at a different hall than the one being searched", async () => {
    const storage = fakeStorage([
      { id: "1", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "Pizza", hallTid: 2 }, servings: 1, nutrition: nutrition(200) },
    ]);
    const results = await getLoggedUmassDishHistory(storage, 1, "pizza");
    expect(results).toHaveLength(0);
  });

  it("dedupes by dish name within the given hall, keeping the most recent occurrence's nutrition -- not whichever entry happens to come last in storage order", async () => {
    const storage = fakeStorage([
      // Deliberately out of chronological order in the array itself -- a correct implementation
      // must compare loggedAt, not just overwrite-by-iteration-order, to prove real dedup logic.
      { id: "2", loggedAt: "2026-08-05T00:00:00.000Z", source: { type: "umass-menu", dishName: "Pizza", hallTid: 1 }, servings: 1, nutrition: nutrition(200) },
      { id: "1", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "Pizza", hallTid: 1 }, servings: 3, nutrition: nutrition(999) },
    ]);
    const results = await getLoggedUmassDishHistory(storage, 1, "");
    expect(results).toHaveLength(1);
    expect(results[0].nutrition.calories).toBe(200);
  });

  it("filters by case-insensitive substring match against dish name", async () => {
    const storage = fakeStorage([
      { id: "1", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "Chicken Parm", hallTid: 1 }, servings: 1, nutrition: nutrition(200) },
      { id: "2", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "Salad", hallTid: 1 }, servings: 1, nutrition: nutrition(50) },
    ]);
    const results = await getLoggedUmassDishHistory(storage, 1, "CHICK");
    expect(results.map((r) => r.dishName)).toEqual(["Chicken Parm"]);
  });

  // offline-menus-and-search: token-AND matching (matchesQuery, @udine/shared) -- word order and
  // inserted words don't matter.
  it("matches multi-word queries across word order and inserted words", async () => {
    const storage = fakeStorage([
      { id: "1", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "White Cheese Pizza", hallTid: 1 }, servings: 1, nutrition: nutrition(200) },
      { id: "2", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "White Kidney Beans", hallTid: 1 }, servings: 1, nutrition: nutrition(150) },
    ]);
    expect((await getLoggedUmassDishHistory(storage, 1, "white pizza")).map((d) => d.dishName)).toEqual(["White Cheese Pizza"]);
    expect((await getLoggedUmassDishHistory(storage, 1, "pizza, white")).map((d) => d.dishName)).toEqual(["White Cheese Pizza"]);
  });

  it("carries hallTid and nutrition through so a result can be turned into a plate entry", async () => {
    const storage = fakeStorage([
      { id: "1", loggedAt: "2026-08-01T00:00:00.000Z", source: { type: "umass-menu", dishName: "Pizza", hallTid: 3 }, servings: 1, nutrition: nutrition(200) },
    ]);
    const [dish] = await getLoggedUmassDishHistory(storage, 3, "pizza");
    expect(dish.hallTid).toBe(3);
    expect(dish.nutrition.calories).toBe(200);
  });
});
