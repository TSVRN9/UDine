import type { DiningHallHours, RetailLocationHours, TimeWindow } from "@udine/shared";
import { deriveHomeHero, formatHeroLine, formatLocationChip, retailHeaderSubtitle, retailOpenStatus } from "./homeHero";

function window(openTime: string, closeTime: string): TimeWindow {
  return { openTime, closeTime };
}

function hall(overrides: Partial<DiningHallHours> = {}): DiningHallHours {
  return {
    hallTid: 1,
    breakfast: null,
    lunch: null,
    dinner: null,
    latenight: null,
    general: null,
    ...overrides,
  };
}

// Wed 2026-08-19, noon local time.
const NOON = new Date(2026, 7, 19, 12, 0, 0, 0);

describe("deriveHomeHero", () => {
  it("reports a named meal period when a hall is serving one, closing at that hall's close time", () => {
    const halls = [hall({ hallTid: 1, lunch: window("11:00 AM", "2:30 PM") })];
    const hero = deriveHomeHero(halls, NOON);
    expect(hero.kind).toBe("meal");
    if (hero.kind !== "meal") throw new Error("expected meal");
    expect(hero.period).toBe("lunch");
    expect(hero.closesAt.getHours()).toBe(14);
    expect(hero.closesAt.getMinutes()).toBe(30);
  });

  it("takes the latest close among halls sharing the same active meal period", () => {
    const halls = [
      hall({ hallTid: 1, lunch: window("11:00 AM", "1:30 PM") }),
      hall({ hallTid: 2, lunch: window("11:00 AM", "2:30 PM") }),
    ];
    const hero = deriveHomeHero(halls, NOON);
    if (hero.kind !== "meal") throw new Error("expected meal");
    expect(hero.closesAt.getHours()).toBe(14);
    expect(hero.closesAt.getMinutes()).toBe(30);
  });

  it("prefers the earliest meal period in the day when different halls serve different meals right now", () => {
    // Hall 1 still on breakfast, hall 2 already on lunch — canonical order picks breakfast.
    const halls = [
      hall({ hallTid: 1, breakfast: window("7:00 AM", "1:00 PM") }),
      hall({ hallTid: 2, lunch: window("11:00 AM", "2:00 PM") }),
    ];
    const hero = deriveHomeHero(halls, NOON);
    if (hero.kind !== "meal") throw new Error("expected meal");
    expect(hero.period).toBe("breakfast");
  });

  it("closes at the meal window's own end, not the hall's general-hours close (#104 blocker 1)", () => {
    const halls = [hall({ hallTid: 1, general: window("7:00 AM", "10:00 PM"), lunch: window("11:00 AM", "2:30 PM") })];
    const hero = deriveHomeHero(halls, NOON);
    expect(hero.kind).toBe("meal");
    if (hero.kind !== "meal") throw new Error("expected meal");
    expect(hero.period).toBe("lunch");
    expect(hero.closesAt.getHours()).toBe(14);
    expect(hero.closesAt.getMinutes()).toBe(30);
  });

  it("closes at the meal window's own end with contiguous per-meal windows and no general hours (#104 blocker 1)", () => {
    const halls = [hall({ hallTid: 1, lunch: window("11:00 AM", "2:30 PM"), dinner: window("2:30 PM", "10:00 PM") })];
    const hero = deriveHomeHero(halls, NOON);
    expect(hero.kind).toBe("meal");
    if (hero.kind !== "meal") throw new Error("expected meal");
    expect(hero.period).toBe("lunch");
    expect(hero.closesAt.getHours()).toBe(14);
    expect(hero.closesAt.getMinutes()).toBe(30);
  });

  it("reports open-with-general-hours-only when no hall has an active named meal period but one is open", () => {
    const halls = [hall({ hallTid: 3, general: window("7:00 AM", "9:00 PM") })];
    const hero = deriveHomeHero(halls, NOON);
    expect(hero.kind).toBe("open");
    if (hero.kind !== "open") throw new Error("expected open");
    expect(hero.closesAt.getHours()).toBe(21);
  });

  it("reports closed-opens-later when every hall is closed now but at least one has a future opening today", () => {
    const halls = [hall({ hallTid: 1, dinner: window("5:00 PM", "8:00 PM") })];
    const hero = deriveHomeHero(halls, NOON);
    expect(hero.kind).toBe("closed");
    if (hero.kind !== "closed") throw new Error("expected closed");
    expect(hero.opensAt.getHours()).toBe(17);
  });

  it("reports closed-for-the-day when no hall has any published window at all", () => {
    const halls = [hall({ hallTid: 1 }), hall({ hallTid: 2 })];
    const hero = deriveHomeHero(halls, NOON);
    expect(hero.kind).toBe("closedForDay");
  });

  it("reports closed-for-the-day when every window today has already closed (no opensAt to report)", () => {
    const halls = [hall({ hallTid: 1, dinner: window("5:00 PM", "8:00 PM") })];
    const lateNight = new Date(2026, 7, 19, 22, 0, 0, 0);
    const hero = deriveHomeHero(halls, lateNight);
    expect(hero.kind).toBe("closedForDay");
  });

  // Live get_infov2 data never populates `latenight` (always null — see #98's KNOWN CONSUMER
  // NOTE), but currentMealPeriod/openStatus both handle it generically for a future data source
  // (hours.ts's own doc comment) — deriveHomeHero must not silently drop it.
  it("reports a named meal period for latenight, after dinner in the scan order", () => {
    const lateNightNow = new Date(2026, 7, 19, 23, 0, 0, 0);
    const halls = [hall({ hallTid: 1, latenight: window("10:00 PM", "1:00 AM") })];
    const hero = deriveHomeHero(halls, lateNightNow);
    expect(hero.kind).toBe("meal");
    if (hero.kind !== "meal") throw new Error("expected meal");
    expect(hero.period).toBe("latenight");
    expect(hero.closesAt.getHours()).toBe(1);
  });
});

describe("formatHeroLine", () => {
  it("formats a named meal period", () => {
    const line = formatHeroLine({ kind: "meal", period: "lunch", closesAt: new Date(2026, 7, 19, 14, 30) });
    expect(line.title).toBe("LUNCH");
    expect(line.subtitle).toBe("served now · until 2:30 PM");
  });

  it("formats a named latenight period the same as any other named meal period", () => {
    const line = formatHeroLine({ kind: "meal", period: "latenight", closesAt: new Date(2026, 7, 20, 1, 0) });
    expect(line.title).toBe("LATENIGHT");
    expect(line.subtitle).toBe("served now · until 1:00 AM");
  });

  it("formats open-with-general-hours as OPEN with no meal name", () => {
    const line = formatHeroLine({ kind: "open", closesAt: new Date(2026, 7, 19, 21, 0) });
    expect(line.title).toBe("OPEN");
    expect(line.subtitle).toBe("served now · until 9:00 PM");
  });

  it("formats closed-opens-later", () => {
    const line = formatHeroLine({ kind: "closed", opensAt: new Date(2026, 7, 19, 17, 0) });
    expect(line.title).toBe("CLOSED");
    expect(line.subtitle).toBe("opens at 5:00 PM");
  });

  it("formats closed-for-the-day", () => {
    const line = formatHeroLine({ kind: "closedForDay" });
    expect(line.title).toBe("CLOSED");
    expect(line.subtitle).toBe("nothing open right now");
  });
});

describe("retailOpenStatus", () => {
  it("is open when now falls in the location's published window", () => {
    const loc: RetailLocationHours = { name: "Blue Wall Café", hours: window("8:00 AM", "6:00 PM") };
    const status = retailOpenStatus(loc, NOON);
    expect(status.open).toBe(true);
  });

  it("is closed when the location has no published hours", () => {
    const loc: RetailLocationHours = { name: "Grab'n Go", hours: null };
    const status = retailOpenStatus(loc, NOON);
    expect(status.open).toBe(false);
  });
});

describe("formatLocationChip", () => {
  it("formats an open status with its close time", () => {
    const chip = formatLocationChip({ open: true, closesAt: new Date(2026, 7, 19, 14, 30) });
    expect(chip).toEqual({ open: true, text: "OPEN · closes 2:30 PM" });
  });

  it("formats a closed status with its next open time", () => {
    const chip = formatLocationChip({ open: false, opensAt: new Date(2026, 7, 19, 7, 0) });
    expect(chip).toEqual({ open: false, text: "CLOSED · opens 7:00 AM" });
  });

  it("formats a closed status with no known open time", () => {
    const chip = formatLocationChip({ open: false, opensAt: null });
    expect(chip).toEqual({ open: false, text: "CLOSED" });
  });
});

describe("hallHeaderSubtitle", () => {
  const { hallHeaderSubtitle } = require("./homeHero") as typeof import("./homeHero");

  it("names the active meal period with its own close time", () => {
    const h = hall({ lunch: window("11:00 AM", "2:30 PM"), general: window("7:00 AM", "9:00 PM") });
    expect(hallHeaderSubtitle(h, NOON)).toBe("Lunch · being served now · until 2:30 PM");
  });

  it("falls back to plain open status when no named meal is active", () => {
    const h = hall({ general: window("7:00 AM", "9:00 PM") });
    expect(hallHeaderSubtitle(h, NOON)).toBe("Open · until 9:00 PM");
  });

  it("shows the next opening when closed, and 'Closed today' when nothing is left", () => {
    const h = hall({ dinner: window("4:30 PM", "9:00 PM") });
    expect(hallHeaderSubtitle(h, NOON)).toBe("Closed · opens 4:30 PM");
    expect(hallHeaderSubtitle(hall(), NOON)).toBe("Closed today");
  });
});

describe("retailHeaderSubtitle", () => {
  it("formats an open status lowercase, per the Grab 'N Go screen spec", () => {
    expect(retailHeaderSubtitle({ open: true, closesAt: new Date(2026, 7, 19, 19, 0) })).toBe("open now · until 7:00 PM");
  });

  it("formats a closed status with its next open time", () => {
    expect(retailHeaderSubtitle({ open: false, opensAt: new Date(2026, 7, 19, 7, 0) })).toBe("closed · opens 7:00 AM");
  });

  it("formats a closed status with no known open time", () => {
    expect(retailHeaderSubtitle({ open: false, opensAt: null })).toBe("closed today");
  });
});
