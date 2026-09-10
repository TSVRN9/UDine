import {
  CANCEL_SERVINGS,
  DRAG_STEP_COUNT,
  DRAG_STEP_PX,
  MAX_DRAG_SERVINGS,
  cancelBlend,
  dragContinuousIndex,
  formatServings,
  parseServingsInput,
  servingsFromDrag,
} from "./servingsStepper";

describe("formatServings", () => {
  it("renders whole numbers bare", () => {
    expect(formatServings(1)).toBe("1");
    expect(formatServings(2)).toBe("2");
    expect(formatServings(0)).toBe("0");
  });

  it("renders fractional counts to one decimal place", () => {
    expect(formatServings(1.5)).toBe("1.5");
    expect(formatServings(0.5)).toBe("0.5");
  });

  it("rounds off floating-point noise instead of printing it", () => {
    // 0.1 + 0.2 style repeated-addition noise -- toFixed(1) is what actually absorbs this,
    // not any rounding in formatServings itself, but the contract is "never shows raw noise".
    expect(formatServings(1.2000000000000002)).toBe("1.2");
  });
});

describe("parseServingsInput", () => {
  it("parses a plain decimal", () => {
    expect(parseServingsInput("2.5")).toBe(2.5);
    expect(parseServingsInput("3")).toBe(3);
  });

  it("trims surrounding whitespace", () => {
    expect(parseServingsInput(" 1.5 ")).toBe(1.5);
  });

  it("rounds to 2 decimal places", () => {
    expect(parseServingsInput("1.239")).toBe(1.24);
  });

  it("returns null for an empty field rather than 0", () => {
    // Number("") is 0, and setCount treats count <= 0 as "remove the row" -- clearing the
    // field and blurring must not silently delete the plate entry.
    expect(parseServingsInput("")).toBeNull();
    expect(parseServingsInput("   ")).toBeNull();
  });

  it("returns null for zero and negative values", () => {
    expect(parseServingsInput("0")).toBeNull();
    expect(parseServingsInput("-1")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseServingsInput("abc")).toBeNull();
  });
});

describe("servingsFromDrag", () => {
  it("returns the starting count with no movement", () => {
    expect(servingsFromDrag(1, 0)).toBe(1);
  });

  it("increases when dragging up (negative translationY)", () => {
    expect(servingsFromDrag(1, -DRAG_STEP_PX)).toBe(1.5);
    expect(servingsFromDrag(1, -DRAG_STEP_PX * 2)).toBe(2);
  });

  it("decreases when dragging down (positive translationY)", () => {
    expect(servingsFromDrag(1, DRAG_STEP_PX)).toBe(0.5);
  });

  it("snaps partial movement to the nearest half-step", () => {
    expect(servingsFromDrag(1, -(DRAG_STEP_PX * 1.6))).toBe(2);
    expect(servingsFromDrag(1, -(DRAG_STEP_PX * 1.2))).toBe(1.5);
  });

  it("clamps to CANCEL_SERVINGS (0) on the low end, not MIN_DRAG_SERVINGS", () => {
    expect(servingsFromDrag(1, DRAG_STEP_PX * 10)).toBe(CANCEL_SERVINGS);
  });

  it("reaches the cancel point one step below the smallest addable count", () => {
    expect(servingsFromDrag(0.5, DRAG_STEP_PX)).toBe(CANCEL_SERVINGS);
  });

  it("clamps to MAX_DRAG_SERVINGS on the high end", () => {
    expect(servingsFromDrag(1, -DRAG_STEP_PX * 100)).toBe(MAX_DRAG_SERVINGS);
  });
});

describe("dragContinuousIndex", () => {
  it("starts at the index matching the starting count, unrounded", () => {
    // startCount 1 is 2 half-steps above CANCEL_SERVINGS (0) -> index 2 of 10.
    expect(dragContinuousIndex(1, 0)).toBe(2);
  });

  it("moves continuously, not just at half-step boundaries", () => {
    expect(dragContinuousIndex(1, -DRAG_STEP_PX / 2)).toBeCloseTo(2.5);
  });

  it("clamps to 0 at CANCEL_SERVINGS instead of going negative", () => {
    expect(dragContinuousIndex(1, DRAG_STEP_PX * 100)).toBe(0);
  });

  it("clamps to DRAG_STEP_COUNT at MAX_DRAG_SERVINGS instead of overshooting", () => {
    expect(dragContinuousIndex(1, -DRAG_STEP_PX * 100)).toBe(DRAG_STEP_COUNT);
  });
});

describe("cancelBlend", () => {
  it("is 0 (not canceling) at or above the first addable rung (index 1)", () => {
    expect(cancelBlend(1)).toBe(0);
    expect(cancelBlend(2)).toBe(0);
  });

  it("is 0 across the entire display window of the first addable rung (0.5 servings) -- index [0.5, 1.5) all round to 0.5 servings, none of it should show cancel bleed", () => {
    expect(cancelBlend(0.5)).toBe(0);
    expect(cancelBlend(0.75)).toBe(0);
    expect(cancelBlend(1.4)).toBe(0);
  });

  it("ramps continuously only across the actual snap boundary (index 0 to 0.5) between the cancel rung and the first addable rung", () => {
    expect(cancelBlend(0.25)).toBeCloseTo(0.5);
    expect(cancelBlend(0.1)).toBeCloseTo(0.8);
  });

  it("is exactly 1 (fully canceling) at the cancel rung itself", () => {
    expect(cancelBlend(0)).toBe(1);
  });

  it("clamps at 1 rather than exceeding it for an index below the cancel rung", () => {
    expect(cancelBlend(-1)).toBe(1);
  });
});
