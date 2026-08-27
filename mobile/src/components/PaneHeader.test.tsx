import renderer, { act } from "react-test-renderer";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON, ReactTestRendererNode } from "react-test-renderer";
import { DOT_HIT_SLOP, PaneHeader } from "./PaneHeader";
import { colors, fs } from "../lib/theme";

// dotPos's width/height/backgroundColor animate via Animated.timing with useNativeDriver: false
// (they aren't native-driver properties) -- a JS-ticked animation that keeps scheduling frames
// past a bare `await act()`, tripping react-test-renderer's "environment torn down" error. Fake
// timers make the 200ms dot-morph settle deterministically inside the test instead.
function renderHeader(activeIndex: number): ReactTestRendererJSON {
  jest.useFakeTimers();
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<PaneHeader activeIndex={activeIndex} onSelectPane={() => {}} topInset={0} />);
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });
  const json = root.toJSON() as ReactTestRendererJSON;
  jest.useRealTimers();
  return json;
}

function findByAccessibilityLabel(node: ReactTestRendererNode | ReactTestRendererNode[] | null, label: string): ReactTestRendererJSON | null {
  if (node == null || typeof node === "string") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findByAccessibilityLabel(n, label);
      if (found) return found;
    }
    return null;
  }
  if ((node.props as { accessibilityLabel?: string }).accessibilityLabel === label) return node;
  return findByAccessibilityLabel(node.children, label);
}

/** The dot's actual visible size/color -- the Animated.View one level inside the `Press` tap
 * target identified by its accessibilityLabel. */
function dotStyle(json: ReactTestRendererJSON, label: string): { width?: number; height?: number; backgroundColor?: string } {
  const wrapper = findByAccessibilityLabel(json, label);
  if (!wrapper || !wrapper.children || wrapper.children.length === 0) throw new Error(`dot "${label}" not found`);
  const inner = wrapper.children[0] as ReactTestRendererJSON;
  return inner.props.style as { width?: number; height?: number; backgroundColor?: string };
}

/** The dotsRow View's own rendered `gap` -- read off the tree rather than recomputed in the test,
 * so this invariant tracks whatever PaneHeader.tsx's styles actually produce, not a parallel
 * `spacing(1.5)`/`fs(6)` calculation that could drift out of sync with a real style change. */
function dotsRowGap(node: ReactTestRendererNode | ReactTestRendererNode[] | null): number {
  if (node == null || typeof node === "string") throw new Error("dotsRow not found");
  if (Array.isArray(node)) {
    for (const n of node) {
      try {
        return dotsRowGap(n);
      } catch {
        // keep looking
      }
    }
    throw new Error("dotsRow not found");
  }
  const flat = (StyleSheet.flatten(node.props.style as never) ?? {}) as { gap?: number };
  if (typeof flat.gap === "number") return flat.gap;
  return dotsRowGap(node.children);
}

// #179 review: paneDots() in paneShell.ts computed the active-index boolean map correctly and had
// its own passing test -- but no production caller. PaneHeader derives each dot's active state
// straight from dotPos.interpolate() inline, so paneDots (and its decoy test, now deleted) could
// stay green forever while the *rendered* active-state logic silently broke. This exercises the
// real rendered output instead. Proven red: inverting PaneHeader's width/height/backgroundColor
// outputRanges (so the inactive dots read big+maroon and the active dot reads small+grey) still
// left the other 467 tests green -- only this test caught it (see PR body for the mutation run).
describe("PaneHeader dot active-state", () => {
  it("gives the active dot the bigger, maroon treatment and inactive dots the smaller, grey one", () => {
    const json = renderHeader(1); // UDINE active
    const active = dotStyle(json, "Go to UDINE");
    const inactive = dotStyle(json, "Go to SOCIAL");

    expect(active.width).toBe(fs(8));
    expect(active.height).toBe(fs(8));
    expect(active.backgroundColor).toContain("124, 36, 48"); // colors.maroon600 = #7c2430

    expect(inactive.width).toBe(fs(6));
    expect(inactive.height).toBe(fs(6));
    expect(inactive.backgroundColor).toContain("36, 26, 20"); // withOpacity(colors.ink900, 25)
  });

  it("moves the big+maroon treatment to whichever dot activeIndex points at", () => {
    const json = renderHeader(0); // SOCIAL active
    const social = dotStyle(json, "Go to SOCIAL");
    const you = dotStyle(json, "Go to YOU");

    expect(social.width).toBe(fs(8));
    expect(you.width).toBe(fs(6));
  });
});

// #179 review: commit 5fa7b15 fixed a real on-device bug (uniform hitSlop=14 on 16dp dots spaced
// 6dp apart made the leftmost dot's expanded hit-region a strict subset of its neighbor's --
// SOCIAL was never reachable) but shipped with zero test coverage. This pins the invariant that
// fix depends on, not just today's specific numbers: two adjacent dots' horizontally-expanded hit
// regions must never be able to touch, even at the row's smallest on-device gap.
describe("DOT_HIT_SLOP", () => {
  it("keeps each side's horizontal hitSlop under half the dots' row gap, so adjacent expanded hit regions can't overlap", () => {
    const gap = dotsRowGap(renderHeader(1));
    expect(DOT_HIT_SLOP.left * 2).toBeLessThan(gap);
    expect(DOT_HIT_SLOP.right * 2).toBeLessThan(gap);
  });
});

// #230: PaneHeader is pointerEvents="box-none" -- only the dots (and, implicitly, the title)
// actually capture a touch; every other point in the header's box passes straight through to
// whatever pane content is scrolled underneath. The header's own visible/opaque box is where the
// backdrop (#245 item 3) actually hides content -- fine for a dot's hitSlop to cover, since
// nothing under it is visible to tap anyway. But if a dot's hitSlop pokes even a few dp *past*
// that box, it starts eating taps aimed at content that IS genuinely visible once scrolled to that
// position -- found on the You pane's "ALL LOGS" link (#230), which was unreachable at whatever
// scroll offset put it directly under a dot's expanded hit region. Pinned as a PaneHeader-only
// invariant rather than a YouPane-specific one: a hit region that never leaves the header's own
// box can't shadow ANY pane's content at ANY scroll offset, which strictly dominates checking one
// pane's one link at rest (also not really checkable here -- react-test-renderer has no real
// layout engine, so a Card's intrinsic on-screen height isn't derivable from its style props).
//
// The assertion below compares `dotBoxHeight + hitSlop.bottom` against `titleSlotHeight` alone,
// with no `paddingTop` term on either side -- that's deliberate, not an omission. The container's
// `alignItems: "flex-start"` top-aligns the dotsRow and the titleSlot to the exact same y (both
// start right after the header's shared `paddingTop`), so a dot's hit-bottom is
// `paddingTop + dotBoxHeight + hitSlop.bottom` and the header's own visible bottom is
// `paddingTop + titleSlotHeight` -- the shared `paddingTop` cancels, leaving exactly the
// inequality below. `dotBoxHeight` is read off the dot's own Press node (found by accessibility
// label) rather than a parallel `spacing(4)` calculation, tracking `styles.dotTapTarget` even if
// it changes -- valid because Press (see its own doc comment) collapses to one node, so the style
// carrying that layout box is on the very node this test finds, not a wrapper around it.
describe("DOT_HIT_SLOP vertical", () => {
  it("keeps a dot's hitSlop-expanded touch area from reaching past the header's own visible box", () => {
    const json = renderHeader(1);
    const wrapper = findByAccessibilityLabel(json, "Go to UDINE");
    if (!wrapper) throw new Error("dot not found");
    const dotBoxHeight = (StyleSheet.flatten(wrapper.props.style as never) as { height?: number }).height ?? 0;
    const titleSlotJson = json.children![0] as ReactTestRendererJSON;
    const titleSlotHeight = (StyleSheet.flatten(titleSlotJson.props.style as never) as { height?: number }).height ?? 0;
    expect(dotBoxHeight + DOT_HIT_SLOP.bottom).toBeLessThanOrEqual(titleSlotHeight);
  });
});

// #245 item 3 (occlusion sub-problem): the fixed header sits above the pane content, and used to
// have no background at all -- scrolled content became visible through the gaps around the
// title/dots instead of being hidden behind an opaque bar. The artboard has no visually distinct
// header-bar color (title/dots just sit on the same page background), so opaque cream is the
// correct fill, not a guess.
describe("PaneHeader backdrop", () => {
  it("is opaque cream, matching the artboard's page background, so scrolled content is hidden behind it", () => {
    const json = renderHeader(1);
    const flat = StyleSheet.flatten(json.props.style as never) as { backgroundColor?: string };
    expect(flat.backgroundColor).toBe(colors.cream100);
  });
});

// #245 item 3 (static-overlap sub-problem): the three panes (Home/Social/You) hard-code
// `paddingTop: insets.top + fs(52)` as their content's top offset, sized to clear this header.
// This reads the header's OWN rendered paddingTop + title-row height off the tree (not a parallel
// fs(28)/spacing(4.5) calculation that could silently drift from a future style edit) and pins that
// fs(52) covers it at every scale, so content never starts underneath the header on first render.
describe("header height vs. the panes' fs(52) top padding", () => {
  it("is covered by fs(52) with room to spare, not exceeded", () => {
    const json = renderHeader(1);
    const containerFlat = StyleSheet.flatten(json.props.style as never) as { paddingTop?: number };
    const titleSlotJson = json.children![0] as ReactTestRendererJSON;
    const titleSlotFlat = StyleSheet.flatten(titleSlotJson.props.style as never) as { height?: number };
    const renderedHeaderHeight = (containerFlat.paddingTop ?? 0) + (titleSlotFlat.height ?? 0);
    expect(fs(52)).toBeGreaterThanOrEqual(renderedHeaderHeight);
  });
});
