import { applyDevParams, getBakeoffState, resetBakeoffState, setBakeoffState } from "./prefs";

beforeEach(resetBakeoffState);

it("starts with no preferences and no scores", () => {
  expect(getBakeoffState()).toEqual({ prefs: { veg: false, plant: false, halal: false, avoid: [] }, scores: { health: false, carbon: false } });
});
it("notifies subscribers and replaces the snapshot", () => {
  const before = getBakeoffState();
  setBakeoffState({ scores: { health: true, carbon: false } });
  expect(getBakeoffState()).not.toBe(before);
  expect(getBakeoffState().scores.health).toBe(true);
});
it("dev params seed prefs and toggles, and an unrelated query leaves them alone", () => {
  applyDevParams({ diet: "veg,halal", avoid: "Milk,Tree Nuts", scores: "carbon" });
  expect(getBakeoffState()).toEqual({ prefs: { veg: true, plant: false, halal: true, avoid: ["Milk", "Tree Nuts"] }, scores: { health: false, carbon: true } });
  applyDevParams({ hall: "W" });
  expect(getBakeoffState().prefs.veg).toBe(true);
});
