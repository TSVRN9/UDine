import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryLogStorage,
  exportCustomFoodsAsCsv,
  exportCustomFoodsAsJson,
  exportEntriesAsCsv,
  exportEntriesAsJson,
  exportFavoritesAsCsv,
  exportFavoritesAsJson,
  exportRankedDishesAsCsv,
  exportRankedDishesAsJson,
  exportRankedFoodsAsCsv,
  exportRankedFoodsAsJson,
} from "./storage.ts";
import type { CustomFood, Favorite, LogEntry, RankedDish, RankedFood } from "./types.ts";

function customFood(overrides: Partial<CustomFood>): CustomFood {
  return {
    id: "c1",
    name: "Grandma's Lasagna",
    servingSize: "1 slice",
    nutrition: {
      servingSize: "1 slice",
      calories: 420,
      caloriesFromFat: 0,
      totalFatG: 18,
      satFatG: 8,
      transFatG: 0,
      cholesterolMg: 60,
      sodiumMg: 650,
      totalCarbG: 35,
      dietaryFiberG: 2,
      sugarsG: 4,
      proteinG: 22,
    },
    ...overrides,
  };
}

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: "1",
    loggedAt: "2026-08-17T12:00:00.000Z",
    source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 },
    servings: 1,
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
      caloriesFromFat: 10,
      totalFatG: 5,
      satFatG: 1,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 10,
      dietaryFiberG: 1,
      sugarsG: 1,
      proteinG: 20,
    },
    ...overrides,
  };
}

test("InMemoryLogStorage addEntry/getAllEntries round-trips entries", async () => {
  const storage = new InMemoryLogStorage();
  await storage.addEntry(entry({ id: "1" }));
  await storage.addEntry(entry({ id: "2" }));
  const all = await storage.getAllEntries();
  assert.deepEqual(
    all.map((e) => e.id).sort(),
    ["1", "2"],
  );
});

test("InMemoryLogStorage addEntry overwrites an existing entry with the same id", async () => {
  const storage = new InMemoryLogStorage();
  await storage.addEntry(entry({ id: "1", servings: 1 }));
  await storage.addEntry(entry({ id: "1", servings: 3 }));
  const all = await storage.getAllEntries();
  assert.equal(all.length, 1);
  assert.equal(all[0].servings, 3);
});

test("InMemoryLogStorage removeEntry deletes only the matching entry", async () => {
  const storage = new InMemoryLogStorage();
  await storage.addEntry(entry({ id: "1" }));
  await storage.addEntry(entry({ id: "2" }));
  await storage.removeEntry("1");
  const all = await storage.getAllEntries();
  assert.deepEqual(
    all.map((e) => e.id),
    ["2"],
  );
});

test("InMemoryLogStorage removeEntry on a missing id is a no-op", async () => {
  const storage = new InMemoryLogStorage();
  await storage.addEntry(entry({ id: "1" }));
  await storage.removeEntry("does-not-exist");
  const all = await storage.getAllEntries();
  assert.equal(all.length, 1);
});

test("InMemoryLogStorage getEntriesForDate filters by the loggedAt date prefix", async () => {
  const storage = new InMemoryLogStorage();
  await storage.addEntry(entry({ id: "1", loggedAt: "2026-08-17T12:00:00.000Z" }));
  await storage.addEntry(entry({ id: "2", loggedAt: "2026-08-17T23:59:00.000Z" }));
  await storage.addEntry(entry({ id: "3", loggedAt: "2026-08-18T00:00:00.000Z" }));

  const aug17 = await storage.getEntriesForDate("2026-08-17");
  assert.deepEqual(
    aug17.map((e) => e.id).sort(),
    ["1", "2"],
  );

  const aug18 = await storage.getEntriesForDate("2026-08-18");
  assert.deepEqual(
    aug18.map((e) => e.id),
    ["3"],
  );
});

test("InMemoryLogStorage getEntriesForDate returns nothing for a date with no entries", async () => {
  const storage = new InMemoryLogStorage();
  await storage.addEntry(entry({ id: "1", loggedAt: "2026-08-17T12:00:00.000Z" }));
  assert.deepEqual(await storage.getEntriesForDate("2026-01-01"), []);
});

test("exportEntriesAsJson returns an empty array literal for no entries", () => {
  assert.equal(exportEntriesAsJson([]), "[]");
});

test("exportEntriesAsJson matches a hand-computed JSON string for a known fixture", () => {
  const entries: LogEntry[] = [
    {
      id: "a1",
      loggedAt: "2026-08-17T12:00:00.000Z",
      source: { type: "umass-menu", dishName: "Chicken Parm", hallTid: 3 },
      servings: 1.5,
      nutrition: {
        servingSize: "1 serving",
        calories: 450,
        caloriesFromFat: 120,
        totalFatG: 13,
        satFatG: 4,
        transFatG: 0,
        cholesterolMg: 65,
        sodiumMg: 800,
        totalCarbG: 40,
        dietaryFiberG: 3,
        sugarsG: 5,
        proteinG: 30,
      },
    },
  ];

  const expected = `[
  {
    "id": "a1",
    "loggedAt": "2026-08-17T12:00:00.000Z",
    "source": {
      "type": "umass-menu",
      "dishName": "Chicken Parm",
      "hallTid": 3
    },
    "servings": 1.5,
    "nutrition": {
      "servingSize": "1 serving",
      "calories": 450,
      "caloriesFromFat": 120,
      "totalFatG": 13,
      "satFatG": 4,
      "transFatG": 0,
      "cholesterolMg": 65,
      "sodiumMg": 800,
      "totalCarbG": 40,
      "dietaryFiberG": 3,
      "sugarsG": 5,
      "proteinG": 30
    }
  }
]`;

  assert.equal(exportEntriesAsJson(entries), expected);
});

test("exportEntriesAsCsv returns only the header row for no entries", () => {
  assert.equal(exportEntriesAsCsv([]), "id,loggedAt,dishName,servings,calories,proteinG,totalCarbG,totalFatG");
});

test("exportEntriesAsCsv matches a hand-computed CSV string, including quote-escaping in a dish name", () => {
  const entries: LogEntry[] = [
    {
      id: "a1",
      loggedAt: "2026-08-17T12:00:00.000Z",
      source: { type: "umass-menu", dishName: "Chicken Parm", hallTid: 3 },
      servings: 1.5,
      nutrition: {
        servingSize: "1 serving",
        calories: 450,
        caloriesFromFat: 120,
        totalFatG: 13,
        satFatG: 4,
        transFatG: 0,
        cholesterolMg: 65,
        sodiumMg: 800,
        totalCarbG: 40,
        dietaryFiberG: 3,
        sugarsG: 5,
        proteinG: 30,
      },
    },
    {
      id: "b2",
      loggedAt: "2026-08-17T13:30:00.000Z",
      source: { type: "off", barcode: "012345678905", productName: 'Trail Mix, "Deluxe" Blend' },
      servings: 1,
      nutrition: {
        servingSize: "1 bag",
        calories: 210,
        caloriesFromFat: 90,
        totalFatG: 12,
        satFatG: 2,
        transFatG: 0,
        cholesterolMg: 0,
        sodiumMg: 150,
        totalCarbG: 22,
        dietaryFiberG: 2,
        sugarsG: 8,
        proteinG: 6,
      },
    },
  ];

  const expected = [
    "id,loggedAt,dishName,servings,calories,proteinG,totalCarbG,totalFatG",
    '"a1","2026-08-17T12:00:00.000Z","Chicken Parm","1.5","450","30","40","13"',
    '"b2","2026-08-17T13:30:00.000Z","Trail Mix, ""Deluxe"" Blend","1","210","6","22","12"',
  ].join("\n");

  assert.equal(exportEntriesAsCsv(entries), expected);
});

// --- #148: ranking (rankedDishes/rankedFoods) and favorites exporters -- the same JSON/CSV release
// valve exportEntriesAsJson/Csv give the log, extended to the other two always-device-local stores
// (RankingStorage/FoodRankingStorage, FavoritesStorage — see types.ts's doc comments on all three).

test("exportRankedDishesAsJson returns an empty array literal for no dishes", () => {
  assert.equal(exportRankedDishesAsJson([]), "[]");
});

test("exportRankedDishesAsJson matches a hand-computed JSON string for a known fixture", () => {
  const dishes: RankedDish[] = [{ dishName: "Chicken Parm", hallTid: 3, rating: 1550.5, comparisonCount: 4 }];
  const expected = `[
  {
    "dishName": "Chicken Parm",
    "hallTid": 3,
    "rating": 1550.5,
    "comparisonCount": 4
  }
]`;
  assert.equal(exportRankedDishesAsJson(dishes), expected);
});

test("exportRankedDishesAsCsv returns only the header row for no dishes", () => {
  assert.equal(exportRankedDishesAsCsv([]), "dishName,hallTid,rating,comparisonCount");
});

test("exportRankedDishesAsCsv matches a hand-computed CSV string, including quote-escaping in a dish name", () => {
  const dishes: RankedDish[] = [
    { dishName: 'Trail Mix, "Deluxe" Blend', hallTid: 3, rating: 1550.5, comparisonCount: 4 },
    { dishName: "Tofu Stir Fry", hallTid: 1, rating: 1490, comparisonCount: 2 },
  ];
  const expected = [
    "dishName,hallTid,rating,comparisonCount",
    '"Trail Mix, ""Deluxe"" Blend","3","1550.5","4"',
    '"Tofu Stir Fry","1","1490","2"',
  ].join("\n");
  assert.equal(exportRankedDishesAsCsv(dishes), expected);
});

test("exportRankedFoodsAsJson returns an empty array literal for no foods", () => {
  assert.equal(exportRankedFoodsAsJson([]), "[]");
});

test("exportRankedFoodsAsJson matches a hand-computed JSON string for a known fixture", () => {
  const foods: RankedFood[] = [{ dishName: "Chicken Parm", rating: 1600, comparisonCount: 7 }];
  const expected = `[
  {
    "dishName": "Chicken Parm",
    "rating": 1600,
    "comparisonCount": 7
  }
]`;
  assert.equal(exportRankedFoodsAsJson(foods), expected);
});

test("exportRankedFoodsAsCsv returns only the header row for no foods", () => {
  assert.equal(exportRankedFoodsAsCsv([]), "dishName,rating,comparisonCount");
});

test("exportRankedFoodsAsCsv matches a hand-computed CSV string, including quote-escaping in a dish name", () => {
  const foods: RankedFood[] = [{ dishName: 'Trail Mix, "Deluxe" Blend', rating: 1600, comparisonCount: 7 }];
  const expected = ["dishName,rating,comparisonCount", '"Trail Mix, ""Deluxe"" Blend","1600","7"'].join("\n");
  assert.equal(exportRankedFoodsAsCsv(foods), expected);
});

test("exportFavoritesAsJson returns an empty array literal for no favorites", () => {
  assert.equal(exportFavoritesAsJson([]), "[]");
});

test("exportFavoritesAsJson matches a hand-computed JSON string for a known fixture, both favorite types", () => {
  const favorites: Favorite[] = [
    { type: "dish", dishName: "Chicken Parm" },
    { type: "location", hallTid: 3 },
  ];
  const expected = `[
  {
    "type": "dish",
    "dishName": "Chicken Parm"
  },
  {
    "type": "location",
    "hallTid": 3
  }
]`;
  assert.equal(exportFavoritesAsJson(favorites), expected);
});

test("exportFavoritesAsCsv returns only the header row for no favorites", () => {
  assert.equal(exportFavoritesAsCsv([]), "type,dishName,hallTid");
});

test("exportFavoritesAsCsv matches a hand-computed CSV string, both favorite types and quote-escaping in a dish name", () => {
  const favorites: Favorite[] = [
    { type: "dish", dishName: 'Trail Mix, "Deluxe" Blend' },
    { type: "location", hallTid: 3 },
  ];
  const expected = ["type,dishName,hallTid", '"dish","Trail Mix, ""Deluxe"" Blend",""', '"location","","3"'].join("\n");
  assert.equal(exportFavoritesAsCsv(favorites), expected);
});

// csvField's formula-injection guard (all export*AsCsv functions route through it) -- a dishName
// starting with =/+/-/@ would otherwise be interpreted as a live formula by Excel/Sheets when the
// export is opened there. dishName is untrusted: it round-trips through umassdining.com's feed
// HTML. Exercised via exportFavoritesAsCsv (one of the four CSV exporters that carry a dishName).
test("exportFavoritesAsCsv prefixes a leading =/+/-/@ in dishName with a tab, neutralizing formula injection", () => {
  const favorites: Favorite[] = [
    { type: "dish", dishName: "=SUM(A1:A2)" },
    { type: "dish", dishName: "+1+1" },
    { type: "dish", dishName: "-2+3" },
    { type: "dish", dishName: "@cmd" },
  ];
  const expected = [
    "type,dishName,hallTid",
    '"dish","\t=SUM(A1:A2)",""',
    '"dish","\t+1+1",""',
    '"dish","\t-2+3",""',
    '"dish","\t@cmd",""',
  ].join("\n");
  assert.equal(exportFavoritesAsCsv(favorites), expected);
});

test("exportFavoritesAsCsv leaves a dishName with =/+/-/@ NOT in the leading position untouched", () => {
  const favorites: Favorite[] = [{ type: "dish", dishName: "Mac & Cheese = Comfort" }];
  const expected = ["type,dishName,hallTid", '"dish","Mac & Cheese = Comfort",""'].join("\n");
  assert.equal(exportFavoritesAsCsv(favorites), expected);
});

test("exportCustomFoodsAsJson returns an empty array literal for no custom foods", () => {
  assert.equal(exportCustomFoodsAsJson([]), "[]");
});

test("exportCustomFoodsAsJson round-trips a known fixture, ingredients included", () => {
  const foods = [customFood({ ingredients: "Pasta, tomato sauce, cheese" })];
  assert.deepEqual(JSON.parse(exportCustomFoodsAsJson(foods)), foods);
});

test("exportCustomFoodsAsCsv returns only the header row for no custom foods", () => {
  assert.equal(exportCustomFoodsAsCsv([]), "id,name,servingSize,calories,proteinG,totalCarbG,totalFatG,ingredients");
});

test("exportCustomFoodsAsCsv matches a hand-computed CSV string, ingredients omitted when absent", () => {
  const foods = [customFood({})];
  const expected = [
    "id,name,servingSize,calories,proteinG,totalCarbG,totalFatG,ingredients",
    '"c1","Grandma\'s Lasagna","1 slice","420","22","35","18",""',
  ].join("\n");
  assert.equal(exportCustomFoodsAsCsv(foods), expected);
});

test("exportCustomFoodsAsCsv prefixes a leading =/+/-/@ in name with a tab, neutralizing formula injection", () => {
  const foods = [customFood({ name: "=SUM(A1:A2)" })];
  const expected = [
    "id,name,servingSize,calories,proteinG,totalCarbG,totalFatG,ingredients",
    '"c1","\t=SUM(A1:A2)","1 slice","420","22","35","18",""',
  ].join("\n");
  assert.equal(exportCustomFoodsAsCsv(foods), expected);
});
