import { MEAL_ORDER, dayIsos, dayLong } from "./menuView";
import { MEAL_LABEL, isCafe } from "./fixture";
import { statusText } from "./status";
import { fmtT, mealWindow } from "./where";
import type { Fixture, FixtureEvent, PlaceKey } from "./types";

export interface SchedDay {
  i: number; label: string; right: string; current: boolean;
  meals: { label: string; window: string }[];
  /** the hours event that replaces the day's windows (a holiday), opened by its first link */
  event: { title: string; href: string } | null;
}
export interface Schedule { name: string; address: string; mapAddress: string | null; building: string | null; payment: string | null; description: string | null; days: SchedDay[] }

const span = (o: string, c: string) => `${fmtT(o)} to ${fmtT(c)}`;
const evDay = (fx: Fixture, e: FixtureEvent) => dayIsos(fx).indexOf(new Date(e.expires * 1000).toISOString().slice(0, 10));
/** M2 evOn: an event shows on its own day's menu, at the halls its scope names. */
export const eventOn = (fx: Fixture, e: FixtureEvent, place: PlaceKey, i: number) => !isCafe(place) && e.scope.includes(place) && evDay(fx, e) === i;

/** The status line under the name: today's status, or another day's span when the place posts a menu that day. */
export function statusLine(fx: Fixture, place: PlaceKey, i: number): string {
  const g = fx.hours[place].general;
  if (!i) return statusText(fx.hours[place], new Date(fx.clock));
  return g && fx.days[dayIsos(fx)[i]]?.[place] ? span(g.openTime, g.closeTime) : "";
}

/** M2 schedHTML: the address, then the days in date order with the chosen one open in place. */
export function schedule(fx: Fixture, place: PlaceKey, chosen: number): Schedule {
  const p = fx.places.find((q) => q.key === place)!, g = fx.hours[place].general, cafe = isCafe(place);
  const days = dayIsos(fx).map((iso, i): SchedDay => {
    const menus = fx.days[iso][place], cur = i === chosen;
    const ev = fx.events.find((e) => eventOn(fx, e, place, i)) ?? null;
    const right = !menus ? "No menu posted" : ev ? "Holiday hours" : cur && g ? span(g.openTime, g.closeTime) : "";
    const meals = menus && cur && !ev
      ? MEAL_ORDER.filter((m) => menus[m]).map((m) => {
          const w = mealWindow(fx, place, m, new Date(fx.clock));
          return { label: m === "grab" ? "Grab 'N Go" : MEAL_LABEL[m], window: w ? span(w[0], w[1]) : "" };
        })
      : [];
    const event = menus && cur && ev ? { title: ev.hoursTitle ?? ev.title, href: (ev.links.find(([l]) => l === "Holiday hours") ?? ev.links[0])[1] } : null;
    return { i, label: dayLong(fx, i), right, current: cur, meals, event };
  });
  return { name: p.name, address: p.address ?? "", mapAddress: p.mapAddress, building: cafe ? p.building : null, payment: cafe ? p.payment : null, description: cafe ? p.description : null, days };
}
