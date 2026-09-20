import fs from "node:fs";
import path from "node:path";
import { artboardTransitions } from "./artboard";
import { curves, durations, reanimatedPaneCurve, reanimatedEaseCurve, rnPaneCurve, toastDwell, toastRise } from "./motion";

const t = artboardTransitions("Prototype.dc.html");

function msFor(selector: string, prop: string): number {
  const entry = t[selector]?.find((e) => e.prop === prop);
  if (!entry) throw new Error(`${selector}: no "${prop}" transition in Prototype.dc.html`);
  return entry.ms;
}

function curveFor(selector: string, prop: string): string {
  const entry = t[selector]?.find((e) => e.prop === prop);
  if (!entry) throw new Error(`${selector}: no "${prop}" transition in Prototype.dc.html`);
  return entry.curve;
}

describe("durations match Prototype.dc.html's own transition/animation declarations", () => {
  it("pane: .pane transform", () => {
    expect(durations.pane).toBe(msFor(".pane", "transform"));
  });
  it("paneFade: .pane opacity", () => {
    expect(durations.paneFade).toBe(msFor(".pane", "opacity"));
  });
  it("sheet: .sheet transform", () => {
    expect(durations.sheet).toBe(msFor(".sheet", "transform"));
  });
  it("toggle: .tgl background", () => {
    expect(durations.toggle).toBe(msFor(".tgl", "background"));
  });
  it("toggle: .knob transform (same 180ms as .tgl)", () => {
    expect(durations.toggle).toBe(msFor(".knob", "transform"));
  });
  it("tab: .tab color", () => {
    expect(durations.tab).toBe(msFor(".tab", "color"));
  });
  it("tab: .tab border-color", () => {
    expect(durations.tab).toBe(msFor(".tab", "border-color"));
  });
  it("fade: .fade opacity", () => {
    expect(durations.fade).toBe(msFor(".fade", "opacity"));
  });
  it("toast: .toastbox opacity", () => {
    expect(durations.toast).toBe(msFor(".toastbox", "opacity"));
  });
  it("toast: .toastbox transform (same 260ms as its opacity; Toast.tsx enters and exits on it)", () => {
    expect(durations.toast).toBe(msFor(".toastbox", "transform"));
  });
  it("press: .press transform", () => {
    expect(durations.press).toBe(msFor(".press", "transform"));
  });
  it("press: .pressd filter (same 120ms as .press)", () => {
    expect(durations.press).toBe(msFor(".pressd", "filter"));
  });
  it("shimmer: .sk animation", () => {
    expect(durations.shimmer).toBe(msFor(".sk", "animation"));
  });
});

// titleStyle (Prototype.dc.html:1305) is a JS template string inside a <script> tag, not a CSS
// rule in a <style> block -- artboardTransitions only parses <style> blocks, so this reads the
// line directly instead, same "source as text" technique hallMenuStyleParity.test.ts already uses
// for this same file's screen code.
describe("paneTitle/paneTitleFade match Prototype.dc.html:1305's titleStyle", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "design", "Prototype.dc.html"), "utf8");
  const anchor = source.indexOf("titleStyle(j)");
  if (anchor < 0) throw new Error("Prototype.dc.html: titleStyle(j) not found -- re-extract or update this anchor, don't guess");
  const line = source.slice(anchor, anchor + 400);

  it("paneTitle: transform duration", () => {
    const m = /transition: transform (\d+)ms/.exec(line);
    expect(m).not.toBeNull();
    expect(durations.paneTitle).toBe(Number(m?.[1]));
  });
  it("paneTitleFade: opacity duration", () => {
    const m = /opacity (\d+)ms ease/.exec(line);
    expect(m).not.toBeNull();
    expect(durations.paneTitleFade).toBe(Number(m?.[1]));
  });
  it("shares the same cubic-bezier control points as every other pane transform", () => {
    const m = /cubic-bezier\(([^)]+)\)/.exec(line);
    expect(m).not.toBeNull();
    const points = m![1].split(",").map((s) => Number(s.trim()));
    expect(points).toEqual([...curves.pane]);
  });
});

// MenuLoading.dc.html:101's spinner is an inline `style="animation: spin 1s linear infinite;"` on
// an <svg>, not a <style>-block rule either.
describe("spin matches MenuLoading.dc.html's spinner", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "design", "MenuLoading.dc.html"), "utf8");

  it("spin: 1s == 1000ms", () => {
    const m = /animation:\s*spin\s+([\d.]+)(m?s)\s+linear/.exec(source);
    expect(m).not.toBeNull();
    const ms = m![2] === "ms" ? Number(m![1]) : Number(m![1]) * 1000;
    expect(durations.spin).toBe(ms);
  });
});

// SearchLookupStates.dc.html:14's spinner is a different spec from MenuLoading.dc.html's above
// (0.9s, not 1s) -- PlateSheet's search-loading state, not the menu/café-loading one.
describe("searchSpin matches SearchLookupStates.dc.html's spinner", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "design", "SearchLookupStates.dc.html"), "utf8");

  it("searchSpin: 0.9s == 900ms", () => {
    const m = /animation:\s*spin\s+([\d.]+)(m?s)\s+linear/.exec(source);
    expect(m).not.toBeNull();
    const ms = m![2] === "ms" ? Number(m![1]) : Number(m![1]) * 1000;
    expect(durations.searchSpin).toBe(ms);
  });
});

describe("the shared cubic-bezier's control points", () => {
  it.each([
    [".pane", "transform"],
    [".sheet", "transform"],
    [".knob", "transform"],
    [".toastbox", "transform"],
  ])("%s %s uses curves.pane's exact control points", (selector, prop) => {
    const curve = curveFor(selector, prop);
    const m = /cubic-bezier\(([^)]+)\)/.exec(curve);
    expect(m).not.toBeNull();
    const points = m![1].split(",").map((s) => Number(s.trim()));
    expect(points).toEqual([...curves.pane]);
  });

  it("reanimatedPaneCurve and rnPaneCurve are both real, built Easing values", () => {
    // Each library represents a built bezier curve differently (Reanimated's own
    // react-native-reanimated/mock returns a plain { factory } object, not a function; RN's real
    // Easing.bezier returns a function) -- these can't be compared for equality to each other,
    // only asserted as defined, real values. See motion.ts's own doc comment on why the raw
    // numbers, not one shared function, are the source of truth.
    expect(reanimatedPaneCurve).toBeDefined();
    expect(typeof rnPaneCurve).toBe("function");
  });
});

// Spec selectors this app doesn't have a component for yet -- pinned so a future implementer
// reaches for the existing token instead of inventing a new literal.
describe("spec selectors with no code equivalent yet", () => {
  it.each([
    [".layer", "a generic overlay layer transition -- no such surface exists in this app"],
    [".strip", "the old horizontal-strip pager, replaced by PaneStack's shared-axis shell (#179)"],
    [".fade", "no plain opacity-only fade surface exists yet -- durations.fade is ready for one"],
    [".tab", "MealTabPager's tab row underline is driven by shared position, not a timed color/border-color transition -- durations.tab is ready for one"],
  ])("%s: %s", (selector) => {
    expect(t[selector]).toBeDefined();
  });
});

describe("unspecced tokens keep their existing values (no Prototype.dc.html selector)", () => {
  it("servingsPill matches .tgl/.knob's 180ms (closest role, not itself specced)", () => {
    expect(durations.servingsPill).toBe(durations.toggle);
  });
  it("favoritePop keeps its original 90/120", () => {
    expect(durations.favoritePop).toEqual({ in: 90, out: 120 });
  });
  it("halls/[slug].tsx's row layout-animation durations keep their original values", () => {
    expect(durations.rowLayout).toBe(180);
    expect(durations.rowExpandIn).toBe(160);
    expect(durations.rowExpandOut).toBe(120);
  });
});

describe("toast dwell", () => {
  it("a success toast dismisses itself after 4s (the old logged banner's dwell)", () => {
    expect(toastDwell).toBe(4000);
  });
});

describe("toast easing and travel (.toastbox)", () => {
  it("opacity is CSS `ease`, and curves.ease is that keyword's bezier", () => {
    expect(curveFor(".toastbox", "opacity")).toBe("ease");
    expect([...curves.ease]).toEqual([0.25, 0.1, 0.25, 1]);
    expect(reanimatedEaseCurve).toBeDefined();
  });
  it("toastRise is toastStyle's translateY offset in Prototype.dc.html", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "design", "Prototype.dc.html"), "utf8");
    const m = /toastStyle:.*translateY\(' \+ \(s\.toast \? '0' : '(\d+)px'\)/.exec(src);
    expect(m).not.toBeNull();
    expect(toastRise).toBe(Number(m![1]));
  });
});
