import { loadFixture } from "./fixture";
import { schedule, statusLine } from "./schedule";

const fx = loadFixture();

describe("schedule matches M2 round 9", () => {
  it("lists the 15 days in date order, the chosen one open with each meal's window", () => {
    const s = schedule(fx, "W", 0);
    expect(s.days).toHaveLength(15);
    expect(s.days.slice(0, 3).map((d) => d.label)).toEqual(["Today", "Tomorrow", "Saturday, October 10"]);
    expect(s.days[0]).toMatchObject({ current: true, right: "7 AM to midnight" });
    expect(s.days[0].meals).toEqual([
      { label: "Breakfast", window: "7 AM to 11 AM" }, { label: "Lunch", window: "11 AM to 4:30 PM" },
      { label: "Dinner", window: "4:30 PM to 9 PM" }, { label: "Late night", window: "9 PM to midnight" },
      { label: "Grab 'N Go", window: "7 AM to 8 PM" },
    ]);
    expect(s.days.filter((d) => d.meals.length)).toHaveLength(1);
  });
  it("opens another day in place and closes today", () => {
    const s = schedule(fx, "W", 9);
    expect(s.days[9]).toMatchObject({ current: true, label: "Saturday, October 17", right: "7 AM to midnight" });
    expect(s.days[9].meals.map((m) => m.label)).toEqual(["Breakfast", "Lunch", "Dinner", "Late night"]);
    expect(s.days[0]).toMatchObject({ current: false, right: "", meals: [] });
  });
  it("Oct 10 says No menu posted; Oct 12 is a holiday row carrying the hours event", () => {
    expect(schedule(fx, "W", 0).days[2].right).toBe("No menu posted");
    const s = schedule(fx, "W", 4);
    expect(s.days[4].right).toBe("Holiday hours");
    expect(s.days[4].event).toEqual({ title: "Indigenous Peoples Day Hours", href: "https://www.umassdining.com/hours" });
    expect(s.days[4].meals).toEqual([]);
    expect(schedule(fx, "W", 0).days[4].right).toBe("Holiday hours");
  });
  it("a café has no holiday row and carries its building, payment and description; empty café days say so", () => {
    const wasabi = fx.places.find((p) => p.name === "Wasabi")!.key;
    const s = schedule(fx, wasabi, 0);
    expect(s.days[0].meals).toEqual([{ label: "Lunch", window: "11 AM to 4:30 PM" }, { label: "Dinner", window: "4:30 PM to 9 PM" }]);
    expect(s.days[0].right).toBe("11 AM to 9 PM");
    expect(s.days[3].right).toBe("No menu posted");
    expect(s.days[4].right).not.toBe("Holiday hours");
    expect(s.address).toBe("1 Campus Center Way");
    expect(s.mapAddress).toMatch(/^42\./);
    expect(s.payment).toMatch(/Cash/);
  });
  it("the status line is today's status, or the span on a day with a menu, or nothing", () => {
    expect(statusLine(fx, "W", 0)).toBe("Open until midnight");
    expect(statusLine(fx, "W", 9)).toBe("7 AM to midnight");
    expect(statusLine(fx, "W", 2)).toBe("");
  });
});
