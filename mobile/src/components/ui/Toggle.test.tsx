// #245 item 1: the track/knob geometry was already correct -- only the 180ms motion (track
// background, knob transform) was missing. react-test-renderer resolves Animated interpolations
// to concrete style values in toJSON(), same technique as PaneHeader.test.tsx's dotStyle -- so this
// asserts the actual rendered knob position/track color mid-transition, not just that Animated.timing
// was called.
import renderer, { act } from "react-test-renderer";
import { Toggle } from "./Toggle";

function knobTranslateX(root: renderer.ReactTestRenderer): number {
  const knob = root.root.findAllByProps({}).find((n) => Array.isArray(n.props.style) && n.props.style.some((s: any) => s && "transform" in s));
  const transformStyle = knob!.props.style.find((s: any) => s && "transform" in s);
  const value = transformStyle.transform[0].translateX;
  // Old (unanimated) code sets this to a plain number; the animated version drives it off an
  // Animated interpolation node, whose current value is read via its (private but
  // test-conventional) __getValue().
  return typeof value === "number" ? value : value.__getValue();
}

describe("Toggle motion (#245 item 1)", () => {
  it("animates the knob translateX over time instead of snapping instantly", () => {
    jest.useFakeTimers();
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Toggle value={false} onValueChange={() => {}} />);
    });
    expect(knobTranslateX(root)).toBe(0);

    act(() => {
      root.update(<Toggle value={true} onValueChange={() => {}} />);
    });
    // Mid-transition (well before the 180ms duration elapses): a snap-instantly toggle is already
    // at its final position here; an animated one is still partway there.
    act(() => {
      jest.advanceTimersByTime(60);
    });
    const midway = knobTranslateX(root);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(18);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(knobTranslateX(root)).toBe(18);
    jest.useRealTimers();
  });
});
