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

describe("HoldSlideOverlay cancel-blend styles", () => {
  it("reads cancelBlend(liveIndex) through the rendered bubble opacity: 1 at index 0 (full cancel), 0.5 midway, 0 at index >= 1 (no cancel)", () => {
    const [countAt0, cancelAt0] = bubbleContentOpacities(render(ANCHOR, 1, 0));
    expect(countAt0).toBeCloseTo(0); // 1 - cancelBlend(0) = 1 - 1
    expect(cancelAt0).toBeCloseTo(1); // cancelBlend(0)

    const [countAtHalf, cancelAtHalf] = bubbleContentOpacities(render(ANCHOR, 1, 0.5));
    expect(countAtHalf).toBeCloseTo(0.5);
    expect(cancelAtHalf).toBeCloseTo(0.5);

    const [countAt1, cancelAt1] = bubbleContentOpacities(render(ANCHOR, 1, 1));
    expect(countAt1).toBeCloseTo(1); // 1 - cancelBlend(1) = 1 - 0
    expect(cancelAt1).toBeCloseTo(0); // cancelBlend(1)
  });
});
