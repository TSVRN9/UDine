import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryLogStorage, exportEntriesAsCsv, exportEntriesAsJson } from "./storage.ts";
import type { LogEntry } from "./types.ts";

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
