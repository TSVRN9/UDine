import vectors from "./vectors.json";
import { loadFixture, dishKey, shownPrice, isCafe } from "./fixture";
import type { PlaceKey } from "./types";

const fx = loadFixture();
const TODAY = "2026-10-08";

it("scores match M2 for every dish in the 15 days", () => {
  const got = fx.dishes.map((d) => `${d.name}|${d.health}|${d.carbon}`);
  const want = vectors.scores.map((s) => `${s.dish}|${s.health}|${s.carbon}`);
  expect([...new Set(got)].sort()).toEqual([...new Set(want)].sort());
});
it("a healthfulness number without an H code is unscored, and H0 is a real 0", () => {
  const unscored = vectors.scores.filter((s) => s.rawHealthfulness != null && s.health == null);
  expect(unscored.length).toBeGreaterThanOrEqual(16);
  for (const s of unscored) expect(fx.dishes.filter((d) => d.name === s.dish).some((d) => d.health === null)).toBe(true);
  expect(fx.dishes.some((d) => d.health === 0)).toBe(vectors.scores.some((s) => s.health === 0));
});
it("price shows for a café serving only", () => {
  const keyOf = Object.fromEntries(Object.entries(vectors.places).map(([k, n]) => [n, k as PlaceKey]));
  for (const p of vectors.price) {
    const place = keyOf[p.place];
    const all = Object.values(fx.days).flatMap((d) => Object.values(d[place] ?? {}).flat())
      .flatMap((s) => s!.dishes).filter((d) => d.key === dishKey(p.dish));
    const d = all.find((x) => x.price != null) ?? all[0];
    expect(d).toBeDefined();
    expect(shownPrice(place, d)).toBe(p.shown);
    expect(isCafe(place)).toBe(place.startsWith("c"));
  }
});
it("the café list and keys match M2", () => {
  const names = Object.fromEntries(fx.places.map((p) => [p.key, p.name]));
  for (const [k, n] of Object.entries(vectors.places)) expect(names[k]).toBe(n);
  expect(fx.places.filter((p) => p.key.startsWith("c"))).toHaveLength(29);
  expect(fx.places.find((p) => p.key === "c28")).toMatchObject({ name: "Charles River Campus", area: 4 });
});
it("fixed clock, days and empty days", () => {
  expect(fx.clock).toBe("2026-10-08T12:41:00-04:00");
  expect(Object.keys(fx.days)).toHaveLength(15);
  expect(fx.days["2026-10-10"]).toEqual({});
  expect(fx.days[TODAY].F!.breakfast).toBeDefined();
});
it("benchmark plate dishes exist at Worcester lunch", () => {
  const w = fx.days[TODAY].W!.lunch!.flatMap((s) => s.dishes).map((d) => d.name);
  expect(w).toEqual(expect.arrayContaining(["Beef Brisket Noodle Bowl", "Golden BBQ Chicken Thigh"]));
});
