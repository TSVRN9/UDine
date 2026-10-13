import { loadFixture } from "./fixture";
import { menuState } from "./net";
import { schedule } from "./schedule";

const fx = loadFixture();

describe("menuState (M2 menuState)", () => {
  const none = new Set<string>();
  it("fail is a failure on every day", () => { expect(menuState("fail", none, "W|0", 0)).toBe("fail"); expect(menuState("fail", none, "W|5", 5)).toBe("fail"); });
  it("offline has today and tomorrow saved and no other day", () => {
    expect(menuState("offline", none, "W|0", 0)).toBe("ok");
    expect(menuState("offline", none, "W|1", 1)).toBe("ok");
    expect(menuState("offline", none, "W|2", 2)).toBe("offline");
  });
  it("slow loads a place and day once, then it is ok", () => {
    expect(menuState("slow", none, "W|0", 0)).toBe("loading");
    expect(menuState("slow", new Set(["W|0"]), "W|0", 0)).toBe("ok");
    expect(menuState("slow", new Set(["W|0"]), "W|3", 3)).toBe("loading");
  });
  it("ok is ok", () => { expect(menuState("ok", none, "W|0", 0)).toBe("ok"); });
});

describe("the schedule offline and failed (M2 schedHTML)", () => {
  const rights = (s: ReturnType<typeof schedule>) => s.days.map((d) => d.right);
  it("offline: days past tomorrow say Not saved, today and tomorrow are as online", () => {
    const on = schedule(fx, "W", 0), off = schedule(fx, "W", 0, { mode: "offline", hours: true });
    expect(rights(off).slice(0, 2)).toEqual(rights(on).slice(0, 2));
    expect(rights(off).slice(2)).toEqual(Array(13).fill("Not saved"));
  });
  it("offline: a chosen unsaved day opens no meals", () => {
    const s = schedule(fx, "W", 5, { mode: "offline", hours: true });
    expect(s.days[5].meals).toEqual([]);
    expect(s.days[5].right).toBe("Not saved");
  });
  it("fail: no day has hours or meals, and nothing says Not saved", () => {
    const s = schedule(fx, "W", 0, { mode: "fail", hours: false });
    expect(s.days.every((d) => d.meals.length === 0 && d.event === null)).toBe(true);
    expect(rights(s)).not.toContain("Not saved");
    expect(s.days[0].right).toBe("");
  });
  it("a café without a dish menu has the one Today row", () => {
    const s = schedule(fx, "c13", 0);
    expect(s.days.map((d) => d.label)).toEqual(["Today"]);
  });
});
