import { loadFixture, dishKey, servingOn } from "../logic/fixture";
import type { MealKey, PlaceKey } from "../logic/types";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

const fx = loadFixture();
const TODAY = "2026-10-08";
const refsFor = (meal: MealKey, name: string, places: PlaceKey[]) =>
  Object.fromEntries(places.map((p) => [p, servingOn(fx, TODAY, p, meal, dishKey(name))!]));
const BRISKET = "Beef Brisket Noodle Bowl", BBQ = "Golden BBQ Chicken Thigh";
// a Franklin lunch dish Worcester does not serve at lunch: it cannot join a Worcester plate
const worcester = new Set(fx.days[TODAY].W!.lunch!.flatMap((s) => s.dishes.map((d) => d.key)));
const franklinOnly = fx.days[TODAY].F!.lunch!.flatMap((s) => s.dishes).find((d) => !worcester.has(d.key))!;

// a fresh module (and so a fresh in-memory store) per test, over the same mocked AsyncStorage
const fresh = () => {
  let m!: typeof import("./store");
  jest.isolateModules(() => { m = require("./store"); });
  return m;
};
beforeEach(async () => { await require("@react-native-async-storage/async-storage").clear(); });

it("a conflicting-hall dish makes a second plate and moves front to it", () => {
  const s = fresh();
  s.add("lunch", BRISKET, refsFor("lunch", BRISKET, ["W"]));
  s.add("lunch", franklinOnly.name, { F: franklinOnly });
  const { plates } = s.getState();
  expect(plates.plates).toHaveLength(2);
  expect(plates.front).toBe(1);
  expect(plates.plates[1].items[0].name).toBe(franklinOnly.name);
});

it("a café item starts its own plate, never joining the hall plate", () => {
  const s = fresh();
  s.add("lunch", BRISKET, refsFor("lunch", BRISKET, ["W"]));
  const cafe = Object.entries(fx.days[TODAY]).find(([k, p]) => k.startsWith("c") && p?.all)!;
  const dish = cafe[1]!.all![0].dishes[0];
  s.add("lunch", dish.name, { [cafe[0]]: dish } as never);
  expect(s.getState().plates.plates).toHaveLength(2);
});

describe("log and undo", () => {
  const two = () => {
    const s = fresh();
    s.add("lunch", BRISKET, refsFor("lunch", BRISKET, ["W", "B"]));
    s.add("lunch", BBQ, refsFor("lunch", BBQ, ["W"]));
    s.add("lunch", franklinOnly.name, { F: franklinOnly });
    return s;
  };
  it("moves the front plate into the log, and undo puts it back at the same index", () => {
    const s = two();
    s.setFront(0);
    const before = s.getState().plates.plates;
    s.log();
    expect(s.getState().plates.plates).toHaveLength(1);
    expect(s.getState().plates.plates[0].items[0].name).toBe(franklinOnly.name);
    expect(s.getState().log).toHaveLength(1);
    expect(s.getState().log[0].items.map((i) => [i.name, i.qty])).toEqual([[BRISKET, 1], [BBQ, 1]]);
    s.undo();
    expect(s.getState().log).toHaveLength(0);
    expect(s.getState().plates.plates).toEqual(before);
    expect(s.getState().plates.front).toBe(0);
    expect(s.getState().last).toBeNull();
  });
  it("undo of a later plate restores it in the middle, not at the end", () => {
    const s = two();
    s.add("lunch", BRISKET, refsFor("lunch", BRISKET, ["W", "B"]));   // front goes back to the Worcester plate
    s.setFront(0);
    s.log();
    s.undo();
    expect(s.getState().plates.plates.map((p) => p.items[0].name)).toEqual([BRISKET, franklinOnly.name]);
    expect(s.getState().plates.front).toBe(0);
  });
  it("logs the plate's macros from the hall it is logged at", () => {
    const s = fresh();
    const refs = refsFor("lunch", BRISKET, ["W", "B"]);
    s.add("lunch", BRISKET, refs);
    s.log("B");
    expect(s.getState().log[0].place).toBe("B");
    expect(s.getState().log[0].items[0].cal).toBe(refs.B.cal);
  });
  it("an add while the receipt is up drops the receipt, so a stale Undo cannot restore over the new plate", () => {
    const s = two();
    s.log();
    expect(s.getState().last).not.toBeNull();
    s.add("lunch", BBQ, refsFor("lunch", BBQ, ["W"]));
    expect(s.getState().last).toBeNull();
    s.undo();
    expect(s.getState().log).toHaveLength(1);
  });
  it("undo with nothing to undo does nothing", () => {
    const s = two();
    const before = s.getState();
    s.undo();
    expect(s.getState()).toBe(before);
  });
});

it("show, prefs, the Charles River toggle and the log survive a reload", async () => {
  const a = fresh();
  a.setShow({ carbon: true });
  a.setPrefs({ halal: true, avoid: ["Milk", "Soy"] });
  a.setNewton(true);
  a.add("lunch", BBQ, refsFor("lunch", BBQ, ["W"]));
  a.log();
  await a.flush();
  const b = fresh();
  expect(b.getState().show).toEqual({ health: false, carbon: false });   // not read yet
  await b.hydrate();
  expect(b.getState().show).toEqual({ health: false, carbon: true });
  expect(b.getState().prefs).toEqual({ veg: false, plant: false, halal: true, avoid: ["Milk", "Soy"] });
  expect(b.getState().newton).toBe(true);
  expect(b.getState().log.map((e) => e.items[0].name)).toEqual([BBQ]);
});

it("a stored value that is not the store's shape is ignored, not trusted", async () => {
  await require("@react-native-async-storage/async-storage").setItem("bakeoff.store.v1", '{"prefs":{"veg":"yes","avoid":7},"show":null,"log":"x"}');
  const s = fresh();
  await s.hydrate();
  expect(s.getState().prefs).toEqual({ veg: false, plant: false, halal: false, avoid: [] });
  expect(s.getState().log).toEqual([]);
});

it("an add made before the reload finished is not lost to it", async () => {
  const a = fresh();
  a.setPrefs({ veg: true });
  await a.flush();
  const b = fresh();
  b.add("lunch", BBQ, refsFor("lunch", BBQ, ["W"]));
  await b.hydrate();
  expect(b.getState().prefs.veg).toBe(true);
  expect(b.getState().plates.plates).toHaveLength(1);
});

it("turning Charles River off sets its plates aside, and on brings them back as they were", () => {
  const s = fresh();
  const newton = fx.places.find((p) => p.area === 4 && fx.days[TODAY][p.key]?.lunch)!;
  const dish = fx.days[TODAY][newton.key]!.lunch![0].dishes[0];
  s.setNewton(true);
  s.add("lunch", BBQ, refsFor("lunch", BBQ, ["W"]));
  s.add("lunch", dish.name, { [newton.key]: dish } as never);
  const both = s.getState().plates.plates;
  expect(both).toHaveLength(2);
  s.setNewton(false);
  expect(s.getState().plates.plates.map((p) => p.items[0].name)).toEqual([BBQ]);
  expect(s.getState().plates.front).toBe(0);
  s.setNewton(true);
  expect(s.getState().plates.plates).toEqual(both);
});

describe("dev params (screenshots)", () => {
  it("seed prefs and toggles, and an unrelated query leaves them alone", async () => {
    const s = fresh();
    await s.applyDevParams({ diet: "veg,halal", avoid: "Milk,Tree Nuts", scores: "carbon" });
    expect(s.getState().prefs).toEqual({ veg: true, plant: false, halal: true, avoid: ["Milk", "Tree Nuts"] });
    expect(s.getState().show).toEqual({ health: false, carbon: true });
    await s.applyDevParams({ hall: "W" });
    expect(s.getState().prefs.veg).toBe(true);
  });
  it("seeds plates, half quantities and a logged plate", async () => {
    const s = fresh();
    await s.applyDevParams({ plate: "W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2;F:lunch:" + dishKey(franklinOnly.name) + "*h", logged: "1" });
    const st = s.getState();
    expect(st.log).toHaveLength(1);
    expect(st.log[0].items.map((i) => [i.name, i.qty])).toEqual([[BRISKET, 1], [BBQ, 2]]);
    expect(st.plates.plates.map((p) => p.items.map((i) => i.qty))).toEqual([[0.5]]);
    expect(st.last).toBeNull();
  });
});

it("persists only prefs, show, newton and the log: never the plate in progress, the receipt or the set-aside plates", async () => {
  const s = fresh();
  s.add("lunch", BBQ, refsFor("lunch", BBQ, ["W"]));
  s.setPrefs({ veg: true });
  s.log();
  s.add("lunch", BRISKET, refsFor("lunch", BRISKET, ["W", "B"]));
  s.setNewton(true);
  await s.flush();
  const kept = JSON.parse((await require("@react-native-async-storage/async-storage").getItem("bakeoff.store.v1")) as string);
  expect(Object.keys(kept).sort()).toEqual(["log", "newton", "prefs", "show"]);
});
