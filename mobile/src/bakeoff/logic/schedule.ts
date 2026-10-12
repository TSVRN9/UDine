import { MEAL_ORDER, dayIsos, dayLong, hasMenu } from "./menuView";
import type { NetMode } from "./net";
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
export function schedule(fx: Fixture, place: PlaceKey, chosen: number, net: { mode: NetMode; hours: boolean } = { mode: "ok", hours: true }): Schedule {
  const p = fx.places.find((q) => q.key === place)!, g = fx.hours[place].general, cafe = isCafe(place);
  const iso0 = dayIsos(fx)[0];
  const list = hasMenu(fx, place) ? dayIsos(fx) : [iso0];   // a café without a dish menu has no days to pick, only today's hours
  const days = list.map((iso, i): SchedDay => {
    if (!hasMenu(fx, place)) return { i, label: "Today", right: net.hours && g ? span(g.openTime, g.closeTime) : "", current: true, meals: [], event: null };
    // M2: offline, the days past tomorrow are not saved; failed, nothing is known, so no row has hours and none opens
    const saved = !(net.mode === "offline" && i > 1) && net.mode !== "fail";
    const menus = saved ? fx.days[iso][place] : undefined, cur = i === chosen;
    const ev = fx.events.find((e) => eventOn(fx, e, place, i)) ?? null;
    const right = net.mode === "offline" && i > 1 ? "Not saved" : net.mode === "fail" ? "" : !menus ? "No menu posted" : ev ? "Holiday hours" : cur && g && net.hours ? span(g.openTime, g.closeTime) : "";
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

// Row heights of the schedule sheet (HoursSheet): fixed by the type scale, so the offset it opens at can be worked out before it draws.
const ROW = 48, LINE = 22, HEAD = 2 + 32 + 6, BUTTON = 44, LIST_TOP = 16 + 1, SLACK = 24;

/**
 * M2 opens the schedule already scrolled so the chosen day and its hours show at rest (`viewport` px of list). The sheet starts at
 * this offset; nothing scrolls after it is drawn. The address block's wrapped lines are estimated (a payment line is two lines).
 */
export function openOffset(s: Schedule, viewport: number): number {
  const cur = s.days.find((d) => d.current);
  if (!cur) return 0;
  const block = (d: SchedDay) => ROW + (d.meals.length ? 6 + LINE * d.meals.length : d.event ? 6 + BUTTON : 0);
  const top = HEAD + Math.max(LINE * (s.building ? 2 : 1), BUTTON) + (s.payment ? 10 + LINE * 2 : 0) + LIST_TOP;
  const bottom = top + s.days.filter((d) => d.i < cur.i).reduce((n, d) => n + block(d), 0) + block(cur);
  return Math.max(0, bottom + SLACK - viewport);
}
