import { stationIndexForOffset, topViewableSectionIndex } from "./hallMenuScrubber";
import type { MenuSection } from "./hallMenuSections";

describe("stationIndexForOffset", () => {
  it("top of the track is station 0", () => {
    expect(stationIndexForOffset(0, 200, 4)).toBe(0);
  });

  it("bottom of the track (offsetY === trackHeight) clamps to the LAST station, not N", () => {
    // floor((200/200)*4) === 4, one past the last valid index (3) -- the clamp must catch this.
    expect(stationIndexForOffset(200, 200, 4)).toBe(3);
  });

  it("middle of a 4-station track lands on station 2, not the neighboring segment", () => {
    // 200/4 = 50px per segment: station 2 spans [100, 150). 124 sits inside it.
    expect(stationIndexForOffset(124, 200, 4)).toBe(2);
  });

  it("a touch exactly on a segment boundary belongs to the segment it opens, not the one it closes", () => {
    // 100 is exactly the start of station 2's band (floor, not round) -- rounding would instead
    // place this boundary at each segment's midpoint (75/125/175), silently shifting every hit.
    expect(stationIndexForOffset(100, 200, 4)).toBe(2);
    expect(stationIndexForOffset(99, 200, 4)).toBe(1);
  });

  it("clamps a negative offset (touch dragged above the track) to 0", () => {
    expect(stationIndexForOffset(-20, 200, 4)).toBe(0);
  });

  it("a single-station track always returns 0", () => {
    expect(stationIndexForOffset(150, 200, 1)).toBe(0);
    expect(stationIndexForOffset(0, 200, 1)).toBe(0);
  });

  it("degenerates to 0 for a zero/negative station count or track height instead of dividing by zero", () => {
    expect(stationIndexForOffset(50, 200, 0)).toBe(0);
    expect(stationIndexForOffset(50, 0, 4)).toBe(0);
  });
});

describe("topViewableSectionIndex", () => {
  const sections: MenuSection[] = [
    { title: "Grill", data: [] },
    { title: "Salads", data: [] },
    { title: "Desserts", data: [] },
  ];

  it("returns the index of the first isViewable item's section", () => {
    const viewableItems = [
      { item: {}, key: "a", index: 0, isViewable: true, section: sections[1] },
      { item: {}, key: "b", index: 1, isViewable: true, section: sections[1] },
    ] as any;
    expect(topViewableSectionIndex(viewableItems, sections)).toBe(1);
  });

  it("skips a non-viewable entry ahead of the first viewable one", () => {
    const viewableItems = [
      { item: {}, key: "a", index: 0, isViewable: false, section: sections[0] },
      { item: {}, key: "b", index: 1, isViewable: true, section: sections[2] },
    ] as any;
    expect(topViewableSectionIndex(viewableItems, sections)).toBe(2);
  });

  it("returns null when nothing is viewable", () => {
    const viewableItems = [{ item: {}, key: "a", index: 0, isViewable: false, section: sections[0] }] as any;
    expect(topViewableSectionIndex(viewableItems, sections)).toBeNull();
  });

  it("returns null for an empty viewableItems list", () => {
    expect(topViewableSectionIndex([], sections)).toBeNull();
  });

  it("returns null when the reported section isn't one of `sections` (a stale event from a swapped list)", () => {
    const stale: MenuSection = { title: "Stale", data: [] };
    const viewableItems = [{ item: {}, key: "a", index: 0, isViewable: true, section: stale }] as any;
    expect(topViewableSectionIndex(viewableItems, sections)).toBeNull();
  });
});
