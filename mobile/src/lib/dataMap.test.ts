import type { LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { acceptedFriendCount, alertsSubline, countLabel, deviceDataCounts, profileSummaryLine } from "./dataMap";

const NUTRITION = {
  servingSize: "1 serving",
  calories: 1,
  caloriesFromFat: 1,
  totalFatG: 1,
  satFatG: 1,
  transFatG: 0,
  cholesterolMg: 1,
  sodiumMg: 1,
  totalCarbG: 1,
  dietaryFiberG: 1,
  sugarsG: 1,
  proteinG: 1,
};

function entry(id: string): LogEntry {
  return { id, loggedAt: "2026-08-01T12:00:00.000Z", source: { type: "umass-menu", dishName: "X", hallTid: 1 }, servings: 1, nutrition: NUTRITION };
}

function rankedDish(dishName: string): RankedDish {
  return { dishName, hallTid: 1, rating: 1500, comparisonCount: 1 } as RankedDish;
}

function rankedFood(dishName: string): RankedFood {
  return { dishName, rating: 1500, comparisonCount: 1 } as RankedFood;
}

describe("deviceDataCounts", () => {
  it("counts log entries, sums ranked dishes+foods, and flattens the seen-dish map", () => {
    const counts = deviceDataCounts([entry("a"), entry("b")], [rankedDish("Pizza")], [rankedFood("Pizza"), rankedFood("Tofu")], new Map([[1, ["A", "B", "C"]], [2, ["D"]]]));
    expect(counts.logEntryCount).toBe(2);
    expect(counts.rankedCount).toBe(3); // 1 ranked dish + 2 ranked foods
    expect(counts.seenDishCount).toBe(4); // 3 at hall 1 + 1 at hall 2
  });

  it("is all zero for a fresh device", () => {
    expect(deviceDataCounts([], [], [], new Map())).toEqual({ logEntryCount: 0, rankedCount: 0, seenDishCount: 0 });
  });
});

describe("countLabel", () => {
  it("joins count and unit per the artboard's row format", () => {
    expect(countLabel(214, "entries")).toBe("214 entries");
    expect(countLabel(0, "dishes")).toBe("0 dishes");
  });
});

describe("acceptedFriendCount", () => {
  it("counts only accepted friendships, not pending ones", () => {
    expect(acceptedFriendCount([{ status: "accepted" }, { status: "pending" }, { status: "accepted" }])).toBe(2);
  });

  it("is zero with no friendships", () => {
    expect(acceptedFriendCount([])).toBe(0);
  });
});

describe("profileSummaryLine", () => {
  it("pluralizes friends correctly", () => {
    expect(profileSummaryLine("me@umass.edu", 0)).toBe("me@umass.edu · 0 friends");
    expect(profileSummaryLine("me@umass.edu", 1)).toBe("me@umass.edu · 1 friend");
    expect(profileSummaryLine("me@umass.edu", 3)).toBe("me@umass.edu · 3 friends");
  });
});

describe("alertsSubline", () => {
  it("pluralizes favorites correctly", () => {
    expect(alertsSubline(0)).toBe("keeps your 0 favorites on the server to watch menus");
    expect(alertsSubline(1)).toBe("keeps your 1 favorite on the server to watch menus");
    expect(alertsSubline(5)).toBe("keeps your 5 favorites on the server to watch menus");
  });
});
