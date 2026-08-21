import type { RetailLocationHours, TimeWindow } from "@udine/shared";
import { findGrabNGoLocation, formatGrabStripText, grabRouteFor, grabStripState } from "./grabStrip";

function window(openTime: string, closeTime: string): TimeWindow {
  return { openTime, closeTime };
}

function retail(name: string, hours: TimeWindow | null = null): RetailLocationHours {
  return { name, hours };
}

// Wed 2026-08-19, noon local time.
const NOON = new Date(2026, 7, 19, 12, 0, 0, 0);

describe("findGrabNGoLocation", () => {
  it("matches the live feed's smart-apostrophe title (\"Worcester Grab ‘N Go\")", () => {
    const retailList = [retail("Worcester Café"), retail("Worcester Grab ‘N Go"), retail("Roots Café")];
    const found = findGrabNGoLocation(retailList, "Worcester");
    expect(found?.name).toBe("Worcester Grab ‘N Go");
  });

  it("does not cross-match a different hall's Grab 'N Go", () => {
    const retailList = [retail("Franklin Grab ‘N Go")];
    expect(findGrabNGoLocation(retailList, "Worcester")).toBeNull();
  });

  it("returns null when no Grab 'N Go entry exists for the hall", () => {
    const retailList = [retail("Worcester Café")];
    expect(findGrabNGoLocation(retailList, "Worcester")).toBeNull();
  });
});

describe("formatGrabStripText", () => {
  it('formats an open status as "open til <time>", lowercase, matching the canvas copy', () => {
    expect(formatGrabStripText({ open: true, closesAt: new Date(2026, 7, 19, 19, 0) })).toBe("open til 7:00 PM");
  });

  it('formats a closed-with-opensAt status as "closed · opens <time>"', () => {
    expect(formatGrabStripText({ open: false, opensAt: new Date(2026, 7, 19, 16, 30) })).toBe("closed · opens 4:30 PM");
  });

  it('formats closed-for-day (no opensAt) as plain "closed"', () => {
    expect(formatGrabStripText({ open: false, opensAt: null })).toBe("closed");
  });
});

describe("grabStripState", () => {
  it("reports open with hours text when the hall's Grab 'N Go window covers now", () => {
    const retailList = [retail("Worcester Grab ‘N Go", window("7:00 AM", "7:00 PM"))];
    const state = grabStripState(retailList, "Worcester", NOON);
    expect(state).toEqual({ open: true, text: "open til 7:00 PM" });
  });

  it("reports closed with opens-at text outside the window", () => {
    const retailList = [retail("Berkshire Grab ‘N Go", window("4:30 PM", "9:00 PM"))];
    const state = grabStripState(retailList, "Berkshire", NOON);
    expect(state).toEqual({ open: false, text: "closed · opens 4:30 PM" });
  });

  it("falls back to a closed, textless state when the feed has no Grab 'N Go entry for the hall", () => {
    const state = grabStripState([], "Hampshire", NOON);
    expect(state).toEqual({ open: false, text: "" });
  });
});

describe("grabRouteFor", () => {
  it("builds the #115 Grab 'N Go route path (/grab-n-go/[slug], per #115's posted route name)", () => {
    expect(grabRouteFor("worcester")).toBe("/grab-n-go/worcester");
  });
});
