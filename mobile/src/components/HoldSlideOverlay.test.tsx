// First test for this component (canvas: "servings-inline-slide", round 3 -- the pill is "ONE
// continuous stadium-shaped pill, same 44px width [as the add button it grows out of]... the +
// glyph sitting at the bottom where the button always was"). Uses react-test-renderer +
// react-native-reanimated's mocked useSharedValue/useAnimatedStyle (the latter resolves
// synchronously at render time under jest.config.js's own moduleNameMapper) the same way
// PaneHeader.test.tsx's dot tests read a Reanimated style straight off the rendered tree.
import * as Reanimated from "react-native-reanimated";
import { useSharedValue } from "react-native-reanimated";
import renderer, { act } from "react-test-renderer";
import { StyleSheet } from "react-native";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { HoldSlideOverlay } from "./HoldSlideOverlay";
import type { ButtonAnchor } from "./HoldSlideAddButton";
import { durations } from "../lib/motion";

// Same module-scope-before-any-render reasoning as paneStack.test.tsx's own comment: the worklets
// babel plugin bakes a worklet's free variables (withTiming included) into a closure at
// effect-build (render) time, so the spy must exist before the very first render.
const withTimingSpy = jest.spyOn(Reanimated, "withTiming");

afterEach(() => {
  withTimingSpy.mockClear();
});

// The real add button (HoldSlideAddButton.tsx's `addButton` style) is fs(44) -- at the artboard's
// reference width fs(44) === 44, and `measureInWindow` reports real on-screen px, so a 44x44
// anchor is what a real hold-start reports on the reference device this app is designed at.
const ANCHOR: ButtonAnchor = { x: 20, y: 500, width: 44, height: 44 };
// BUTTON_ZONE isn't exported by HoldSlideOverlay.tsx -- mirrored here as a literal, same as
// PaneHeader.test.tsx re-deriving fs(6)/fs(8) instead of importing an unexported constant.
const BUTTON_ZONE = 44;

function Harness({ anchor, count, index }: { anchor: ButtonAnchor; count: number; index: number }) {
  const liveIndex = useSharedValue(index);
  return <HoldSlideOverlay anchor={anchor} count={count} liveIndex={liveIndex} />;
}

function render(anchor: ButtonAnchor, count: number, index: number): ReactTestRendererJSON {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<Harness anchor={anchor} count={count} index={index} />);
  });
  return root.toJSON() as ReactTestRendererJSON;
}

/** DFS-collects every host View node whose flattened style carries a numeric `gap` of 3 -- unique
 * to `styles.bubbleContent` (the count readout wrapper, then the cancel-label overlay wrapper,
 * matching HoldSlideOverlay.tsx's own JSX order). */
function bubbleContentOpacities(node: ReactTestRendererJSON | ReactTestRendererJSON["children"] | null): number[] {
  if (node == null || typeof node === "string") return [];
  if (Array.isArray(node)) return node.flatMap((n) => bubbleContentOpacities(n as ReactTestRendererJSON));
  const flat = (StyleSheet.flatten(node.props.style as never) ?? {}) as { gap?: number; opacity?: number };
  const own = flat.gap === 3 && typeof flat.opacity === "number" ? [flat.opacity] : [];
  return [...own, ...bubbleContentOpacities(node.children)];
}

describe("HoldSlideOverlay mount geometry", () => {
  it("mounts with height === BUTTON_ZONE, top anchored so the + button stays exactly where it was", () => {
    const json = render(ANCHOR, 1, 5);
    const pill = json.children!.find(
      (c) => typeof c !== "string" && (StyleSheet.flatten((c as ReactTestRendererJSON).props.style as never) as { shadowColor?: string }).shadowColor,
    ) as ReactTestRendererJSON;
    const flat = StyleSheet.flatten(pill.props.style as never) as { height?: number; top?: number; width?: number };
    expect(flat.height).toBe(BUTTON_ZONE);
    // pillBottom (anchor.y + anchor.height) minus the mounted height == anchor.y itself -- the +
    // button's own top, unmoved.
    expect(flat.top).toBe(ANCHOR.y + ANCHOR.height - BUTTON_ZONE);
  });

  it("is the SAME width as the 44px add button it grows out of (canvas: servings-inline-slide round 2/3)", () => {
    const json = render(ANCHOR, 1, 5);
    const pill = json.children!.find(
      (c) => typeof c !== "string" && (StyleSheet.flatten((c as ReactTestRendererJSON).props.style as never) as { shadowColor?: string }).shadowColor,
    ) as ReactTestRendererJSON;
    const flat = StyleSheet.flatten(pill.props.style as never) as { width?: number };
    expect(flat.width).toBe(ANCHOR.width);
  });

  it("animates the grow (BUTTON_ZONE -> TRACK_HEIGHT) with durations.servingsPill via withTiming", () => {
    render(ANCHOR, 1, 5);
    const call = withTimingSpy.mock.calls.find(([toValue]) => toValue === 1);
    expect(call).toBeDefined();
    expect((call?.[1] as { duration?: number })?.duration).toBe(durations.servingsPill);
  });
});

describe("HoldSlideOverlay grow animation anchors content to the fixed bottom edge, not the moving top", () => {
  // The "+" glyph, ladder ticks, and thumb ring are positioned at their resting geometry regardless
  // of the current grow progress -- if that geometry were expressed as `top` (measured from the
  // pill's own top-left, which moves as the pill grows taller), it would place them below the
  // visible clipped area for most of the animation, popping in only once the pill is nearly fully
  // grown instead of staying pinned to the button the whole time. `bottom` (measured from the
  // pill's bottom edge, fixed on screen throughout) is what actually makes it read as the track
  // rising out of the button.
  it("positions the + glyph with `bottom`, not `top`, at a value that fits inside the button-sized mount height", () => {
    const json = render(ANCHOR, 1, 5);
    const glyph = findByStyleValue(json, "lineHeight", 22);
    expect(glyph).not.toBeNull();
    const flat = StyleSheet.flatten(glyph!.props.style as never) as { top?: number; bottom?: number; height?: number };
    expect(flat.top).toBeUndefined();
    expect(typeof flat.bottom).toBe("number");
    expect(flat.bottom! + flat.height!).toBeLessThanOrEqual(BUTTON_ZONE);
  });
});

describe("HoldSlideOverlay cancel-blend styles", () => {
  // cancelBlend only ramps across [0, 0.5) (servingsStepper.ts's own doc comment: the previous,
  // buggy behavior ramped across the full [0, 1), which bled the cancel treatment into index 0.5's
  // display window even though it reads as a valid "0.5 servings" value, not a cancel) -- this test
  // asserted the pre-fix ramp (0.5 blend at index 0.5) and was never updated when that shipped
  // (commit 7029172), so it failed independently of this file's own hold/caption changes. 0.25 is
  // the ramp's actual midpoint; 0.5 is where it's already fully resolved to "not canceling".
  it("reads cancelBlend(liveIndex) through the rendered bubble opacity: 1 at index 0 (full cancel), 0.5 at the ramp's midpoint (0.25), 0 from index 0.5 on (no cancel)", () => {
    const [countAt0, cancelAt0] = bubbleContentOpacities(render(ANCHOR, 1, 0));
    expect(countAt0).toBeCloseTo(0); // 1 - cancelBlend(0) = 1 - 1
    expect(cancelAt0).toBeCloseTo(1); // cancelBlend(0)

    const [countAtQuarter, cancelAtQuarter] = bubbleContentOpacities(render(ANCHOR, 1, 0.25));
    expect(countAtQuarter).toBeCloseTo(0.5);
    expect(cancelAtQuarter).toBeCloseTo(0.5);

    const [countAtHalf, cancelAtHalf] = bubbleContentOpacities(render(ANCHOR, 1, 0.5));
    expect(countAtHalf).toBeCloseTo(1);
    expect(cancelAtHalf).toBeCloseTo(0);

    const [countAt1, cancelAt1] = bubbleContentOpacities(render(ANCHOR, 1, 1));
    expect(countAt1).toBeCloseTo(1); // 1 - cancelBlend(1) = 1 - 0
    expect(cancelAt1).toBeCloseTo(0); // cancelBlend(1)
  });
});

/** DFS-finds the first node whose flattened style has `key === value` -- `minWidth: 90` is unique
 * to `styles.bubble`, `width: 160` (set inline at the JSX call site) is unique to the caption
 * wrapper. */
function findByStyleValue(node: ReactTestRendererJSON | ReactTestRendererJSON["children"] | null, key: string, value: number): ReactTestRendererJSON | null {
  if (node == null || typeof node === "string") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findByStyleValue(n as ReactTestRendererJSON, key, value);
      if (found) return found;
    }
    return null;
  }
  const flat = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
  if (flat[key] === value) return node;
  return findByStyleValue(node.children, key, value);
}

describe("HoldSlideOverlay bubble/caption entrance", () => {
  // The count bubble and "Slide to adjust" caption used to sit at their FINAL position at full
  // opacity from the first frame, with only the pill visibly growing underneath them -- since
  // they're the most prominent, text-bearing elements, that mismatch is what read as "fading in and
  // moving up" rather than the pill expanding. Tying their opacity/position to the same
  // heightProgress the pill grows with means they start faded/offset, same as the pill starts small
  // -- this jest-mocked useAnimatedStyle freezes at the pre-effect value (heightProgress === 0,
  // same reason the mount-geometry tests above can assert height === BUTTON_ZONE at all), which is
  // exactly the "not yet grown" state this pins.
  it("starts the bubble and caption faded out and offset, tied to heightProgress, not already at full opacity", () => {
    const json = render(ANCHOR, 1, 5);
    const bubble = findByStyleValue(json, "minWidth", 90);
    const caption = findByStyleValue(json, "width", 160);
    expect(bubble).not.toBeNull();
    expect(caption).not.toBeNull();
    const bubbleFlat = StyleSheet.flatten(bubble!.props.style as never) as { opacity?: number };
    const captionFlat = StyleSheet.flatten(caption!.props.style as never) as { opacity?: number };
    expect(bubbleFlat.opacity).toBe(0);
    expect(captionFlat.opacity).toBe(0);
  });
});
