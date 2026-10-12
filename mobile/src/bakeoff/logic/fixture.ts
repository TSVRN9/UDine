import { m2Motion } from "../../lib/motion";
import { parseNet, type NetMode } from "./net";
import type { Dish, Fixture, MealKey, PlaceKey, Station } from "./types";

type Raw = Omit<Fixture, "days"> & { days: Record<string, Record<string, Record<string, [string, number[]][]>>> };

export const HALLS = ["W", "F", "H", "B"] as const;
export const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", late: "Late night", all: "All day", grab: "Grab 'N Go",
};
/** M2's norm(): lower-case, apostrophes dropped, every other run of non-alphanumerics a single space. */
export function dishKey(name: string): string {
  return name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
export const isCafe = (k: string): k is `c${number}` => k[0] === "c";
/** Halls first (W F H B), then cafés in fixture order: M2's PORD. */
export const placeOrder = (k: PlaceKey): number => (isCafe(k) ? 4 + +k.slice(1) : HALLS.indexOf(k as never));

let cached: Fixture | undefined;
export function loadFixture(): Fixture {
  if (cached) return cached;
  const raw = require("../fixture.json") as Raw;
  const days: Fixture["days"] = {};
  for (const [iso, places] of Object.entries(raw.days)) {
    days[iso] = {};
    for (const [pk, meals] of Object.entries(places)) {
      const out = (days[iso][pk as PlaceKey] = {} as Record<MealKey, Station[]>);
      for (const [mk, sts] of Object.entries(meals))
        out[mk as MealKey] = sts.map(([name, ids]) => ({ name, dishes: ids.map((i) => ({ ...raw.dishes[i], station: name })) }));
    }
  }
  return (cached = { ...raw, days });
}

export type NetFixture = Fixture & { cached?: true; asOf?: string };
/**
 * The bundled fixture as a network would hand it over (M2 `?net=`): `slow` after a delay, `offline` flagged `cached` with the clock it was
 * saved at, `fail` rejecting. The mode comes from `EXPO_PUBLIC_BAKEOFF_NET` (ok when unset or unknown).
 */
export function loadFixtureAsync(mode: NetMode = parseNet(process.env.EXPO_PUBLIC_BAKEOFF_NET)): Promise<NetFixture> {
  const fx = loadFixture();
  if (mode === "fail") return Promise.reject(new Error("bakeoff net: fail"));
  if (mode === "offline") return Promise.resolve({ ...fx, cached: true, asOf: fx.clock });
  if (mode === "slow") return new Promise((done) => setTimeout(() => done(fx), m2Motion.net.slow));
  return Promise.resolve(fx);
}

export const placeName = (k: PlaceKey): string => loadFixture().places.find((p) => p.key === k)!.name;
/** The standard window the clock is in: M2's CLOCKMEAL (lunch at 12:41). */
export function clockMeal(now: Date): MealKey {
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= 420 && m < 660 ? "breakfast" : m >= 660 && m < 990 ? "lunch" : m >= 990 && m < 1260 ? "dinner" : m >= 1260 && m < 1560 ? "late" : "lunch";
}

/** A dish's serving at a place on a day, for a plate meal; a café's all-day and Grab 'N Go menus count for the clock's meal. */
export function servingOn(fx: Fixture, iso: string, place: PlaceKey, meal: MealKey, key: string): Dish | undefined {
  const menus = fx.days[iso]?.[place] ?? {};
  const cm = clockMeal(new Date(fx.clock));
  for (const [m, stations] of Object.entries(menus) as [MealKey, Station[]][]) {
    if ((isCafe(place) && (m === "all" || m === "grab") ? cm : m) !== meal) continue;
    for (const st of stations) for (const d of st.dishes) if (d.key === key) return d;
  }
  return undefined;
}

/** The dish sheet's price line: café servings only, and only when the feed carries one. */
export const shownPrice = (place: PlaceKey, d: Dish): string | null => (isCafe(place) && d.price != null ? `$${d.price.toFixed(2)}` : null);
