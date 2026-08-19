import { initialPaneOffset, PANE_COUNT, HOME_PANE_INDEX, paneDots, paneIndexForScrollOffset } from "./paneShell";

describe("constants", () => {
  it("lands on Home (the middle pane) of 3 panes: Social, Home, You", () => {
    expect(PANE_COUNT).toBe(3);
    expect(HOME_PANE_INDEX).toBe(1);
  });
});

describe("paneIndexForScrollOffset", () => {
  it("rounds an offset to the nearest pane index", () => {
    expect(paneIndexForScrollOffset(0, 400)).toBe(0);
    expect(paneIndexForScrollOffset(400, 400)).toBe(1);
    expect(paneIndexForScrollOffset(800, 400)).toBe(2);
  });

  it("rounds a partial-scroll offset to the nearest pane", () => {
    expect(paneIndexForScrollOffset(380, 400)).toBe(1);
    expect(paneIndexForScrollOffset(220, 400)).toBe(1);
    expect(paneIndexForScrollOffset(180, 400)).toBe(0);
  });

  it("clamps an overshot offset (Android momentum) into range", () => {
    expect(paneIndexForScrollOffset(1200, 400)).toBe(2);
    expect(paneIndexForScrollOffset(-50, 400)).toBe(0);
  });

  it("returns 0 when paneWidth isn't known yet (pre-layout)", () => {
    expect(paneIndexForScrollOffset(400, 0)).toBe(0);
  });
});

describe("initialPaneOffset", () => {
  it("is HOME_PANE_INDEX panes' worth of width in", () => {
    expect(initialPaneOffset(400)).toBe(400);
  });

  it("is 0 when paneWidth isn't known yet", () => {
    expect(initialPaneOffset(0)).toBe(0);
  });
});

describe("paneDots", () => {
  it("marks only the active index as active, in pane order", () => {
    expect(paneDots(0)).toEqual([true, false, false]);
    expect(paneDots(1)).toEqual([false, true, false]);
    expect(paneDots(2)).toEqual([false, false, true]);
  });
});
