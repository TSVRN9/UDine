import { artboardEnclosingStyle, artboardStyle, artboardTransitions, normalizeColor } from "./artboard";

describe("artboardStyle", () => {
  it("reads the inline style of the element whose text matches the anchor", () => {
    // Main.dc.html:74 — the hall card title
    expect(artboardStyle("Main.dc.html", "Hampshire")).toMatchObject({
      fontSize: 22,
      letterSpacing: 1,
      fontWeight: "600",
      textTransform: "uppercase",
      color: normalizeColor("#fbf7ef"),
    });
  });

  it("expands padding shorthand into RN vertical/horizontal and converts border/background", () => {
    // CafeSheet.dc.html:36 — the status pill
    expect(artboardStyle("CafeSheet.dc.html", "OPEN · TIL 6 PM")).toMatchObject({
      paddingVertical: 3,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: normalizeColor("#c99a2e"),
    });
    // CustomFoodForm.dc.html:33 — the serving-size input
    expect(artboardStyle("CustomFoodForm.dc.html", "1 shake (16oz)")).toMatchObject({
      borderWidth: 1,
      borderColor: normalizeColor("rgba(36,26,20,0.2)"),
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 14,
    });
  });

  it("picks the nth match when the same copy appears more than once", () => {
    // Main.dc.html: four hall-card badges (lines 41-89), then the café rows at 116/127/138 —
    // "OPEN · TIL 8 PM", "CLOSED · OPENS 11 AM", "OPEN · TIL 4 PM" — all contain "OPEN"
    expect(artboardStyle("Main.dc.html", "OPEN", 3).color).toBe(normalizeColor("#fbf7ef"));
    expect(artboardStyle("Main.dc.html", "OPEN", 4).color).toBe(normalizeColor("#7c2430"));
    expect(artboardStyle("Main.dc.html", "OPEN", 5).color).toBe(normalizeColor("rgba(36,26,20,0.45)"));
  });

  it("throws when the anchor is not on the artboard, so a stale citation fails loudly", () => {
    expect(() => artboardStyle("Main.dc.html", "No such copy")).toThrow(/No such copy/);
  });
});

describe("artboardEnclosingStyle", () => {
  it("climbs past a nested icon+label wrapper to the pill div that actually carries the background (SearchLookupStates.dc.html:43/46 -- 2 divs up from the label)", () => {
    expect(artboardEnclosingStyle("SearchLookupStates.dc.html", "Looking up", 2)).toMatchObject({
      backgroundColor: normalizeColor("rgba(201,154,46,0.08)"),
      borderRadius: 6,
      paddingVertical: 8,
      paddingHorizontal: 2,
    });
  });

  it("climbs one div when the icon is a direct sibling of the label, not double-wrapped (SearchLookupStates.dc.html:71/73)", () => {
    expect(artboardEnclosingStyle("SearchLookupStates.dc.html", "Live lookups", 1)).toMatchObject({
      backgroundColor: normalizeColor("rgba(36,26,20,0.05)"),
      borderRadius: 6,
      paddingVertical: 12,
      paddingHorizontal: 14,
    });
  });

  it("throws when the anchor isn't on the artboard", () => {
    expect(() => artboardEnclosingStyle("SearchLookupStates.dc.html", "No such copy", 1)).toThrow(/No such copy/);
  });
});

describe("normalizeColor", () => {
  it("canonicalizes hex, hex+alpha, and rgba() spellings to one rgba string", () => {
    expect(normalizeColor("#3B0A0F")).toBe("rgba(59,10,15,1)");
    expect(normalizeColor("#c99a2e80")).toBe(normalizeColor("rgba(201, 154, 46, 0.5)"));
    expect(normalizeColor("rgba(36,26,20,0.55)")).toBe("rgba(36,26,20,0.55)");
  });
});

describe("artboardTransitions", () => {
  it("parses every transition/animation rule in Prototype.dc.html's style block", () => {
    const t = artboardTransitions("Prototype.dc.html");
    expect(t[".pane"]).toEqual([
      { prop: "transform", ms: 340, curve: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
      { prop: "opacity", ms: 260, curve: "ease" },
      { prop: "filter", ms: 340, curve: "ease" },
    ]);
    expect(t[".sheet"]).toEqual([{ prop: "transform", ms: 300, curve: "cubic-bezier(0.22, 0.61, 0.36, 1)" }]);
    expect(t[".press"]).toEqual([{ prop: "transform", ms: 120, curve: "ease" }]);
    expect(t[".sk"]).toEqual([{ prop: "animation", ms: 1400, curve: "linear" }]);
  });
});
