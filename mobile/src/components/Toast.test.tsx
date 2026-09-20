import fs from "node:fs";
import path from "node:path";
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text } from "react-native";
import { Toast, useToastDwell } from "./Toast";
import Svg, { Path } from "react-native-svg";
import { artboardEnclosingStyle, artboardStyle, artboardTag, normalizeColor } from "../lib/artboard";
import { toastActionDwell, toastDwell, toastRise } from "../lib/motion";
import { fonts } from "../lib/theme";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

type Props = React.ComponentProps<typeof Toast>;
function render(props: Pick<Props, "kind" | "message"> & Partial<Props>) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<Toast bottom={94} onDismiss={() => {}} {...props} />);
  });
  return root;
}
const pressable = (root: renderer.ReactTestRenderer) => root.root.findAllByProps({ accessibilityRole: "alert" })[0];
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;
const card = (root: renderer.ReactTestRenderer) => flat(pressable(root).props.style);
const textStyle = (root: renderer.ReactTestRenderer, children: string) => flat(root.root.findAllByType(Text).find((n) => n.props.children === children)!.props.style);
// theme.ts maps 400/500/600 to a LibreFranklin family each; there is no 700.
const familyFor = (weight: unknown) => ({ "400": fonts.body400, "500": fonts.body500, "600": fonts.body600 })[String(weight)];
const c = (v: unknown) => normalizeColor(String(v));

// The artboard's toast card is two divs above the message text (text -> column -> card).
function expectCardMatches(root: renderer.ReactTestRenderer, file: string, message: string) {
  const spec = artboardEnclosingStyle(file, message, 2);
  const s = card(root);
  expect(c(s.backgroundColor)).toBe(spec.backgroundColor);
  expect(c(s.borderColor)).toBe(spec.borderColor);
  expect(s.borderWidth).toBe(spec.borderWidth);
  expect(s.borderRadius).toBe(spec.borderRadius);
  expect(s.gap).toBe(spec.gap);
  expect(s.paddingLeft).toBe(spec.paddingLeft);
  expect(s.paddingRight).toBe(spec.paddingRight);
  expect(s.paddingTop).toBe(spec.paddingTop);
  expect(s.minHeight).toBe(60); // artboardStyle has no min-height mapping
  expect(s.shadowRadius).toBe(24);
  expect(s.shadowOpacity).toBe(0.25);
  expect((s.shadowOffset as { height: number }).height).toBe(8);
}

describe("Toast success (ToastLogged.dc.html)", () => {
  const root = () => render({ kind: "success", message: "Logged 3 items", subline: "640 cal · 65g protein" });

  it("card matches the artboard", () => {
    expectCardMatches(root(), "ToastLogged.dc.html", "Logged 3 items");
  });

  it("message and sub-line type match the artboard", () => {
    const r = root();
    const title = artboardStyle("ToastLogged.dc.html", "Logged 3 items");
    const sub = artboardStyle("ToastLogged.dc.html", "640 cal · 65g protein");
    expect(textStyle(r, "Logged 3 items").fontSize).toBe(title.fontSize);
    expect(textStyle(r, "640 cal · 65g protein").fontSize).toBe(sub.fontSize);
    expect(c(textStyle(r, "640 cal · 65g protein").color)).toBe(sub.color);
    // font-weight 600 -> the LibreFranklin 600 family (a fake-bold on a 400 family is the trap)
    expect(title.fontWeight).toBe("600");
    expect(textStyle(r, "Logged 3 items").fontFamily).toBe(familyFor(title.fontWeight));
    expect(c(textStyle(r, "Logged 3 items").color)).toBe(artboardEnclosingStyle("ToastLogged.dc.html", "Logged 3 items", 2).color);
  });

  it("gold check badge: fill and check stroke match the artboard", () => {
    const badge = artboardTag("ToastLogged.dc.html", "width: 22px; height: 22px");
    const check = artboardTag("ToastLogged.dc.html", 'd="M2.5 6.2l2.4 2.4L9.5 3.8"');
    const r = root();
    const rendered = flat(r.root.findByType(Svg).parent!.props.style);
    expect(rendered.width).toBe(badge.style.width);
    expect(rendered.height).toBe(badge.style.height);
    expect(c(rendered.backgroundColor)).toBe(badge.style.backgroundColor);
    expect(c(r.root.findByType(Path).props.stroke)).toBe(normalizeColor(check.attrs.stroke));
    expect(Number(r.root.findByType(Path).props.strokeWidth)).toBe(Number(check.attrs["stroke-width"]));
  });
});

describe("Toast failure (ToastLogFailed.dc.html)", () => {
  const message = "Couldn’t log 2 of 3 items";
  const root = () => render({ kind: "failure", message });

  it("card matches the artboard (maroon600 fill and border)", () => {
    expectCardMatches(root(), "ToastLogFailed.dc.html", message);
  });

  it("message text is paper on the fill, 14/600, and there is no sub-line", () => {
    const r = root();
    const spec = artboardEnclosingStyle("ToastLogFailed.dc.html", message, 2);
    expect(c(textStyle(r, message).color)).toBe(spec.color);
    expect(textStyle(r, message).fontFamily).toBe(familyFor(artboardStyle("ToastLogFailed.dc.html", message).fontWeight));
    expect(textStyle(r, message).fontSize).toBe(artboardStyle("ToastLogFailed.dc.html", message).fontSize);
    expect(r.root.findAllByType(Text).map((n) => n.props.children)).toEqual(["!", message]);
  });

  it("'!' badge matches the artboard", () => {
    const spec = artboardEnclosingStyle("ToastLogFailed.dc.html", "!</div>", 0);
    const bang = root().root.findAllByType(Text).find((n) => n.props.children === "!")!;
    const badge = flat(bang.parent!.props.style);
    expect(badge.width).toBe(spec.width);
    expect(badge.height).toBe(spec.height);
    expect(c(badge.backgroundColor)).toBe(spec.backgroundColor);
    // The badge div carries the "!" glyph's own type: 13px, #7c2430, weight 700.
    const glyph = flat(bang.props.style);
    expect(glyph.fontSize).toBe(spec.fontSize);
    expect(c(glyph.color)).toBe(spec.color);
    // Weight 700 cannot be mapped: theme.ts has no body700 family, so the heaviest one, 600, stands in.
    expect(spec.fontWeight).toBe("700");
    expect(glyph.fontFamily).toBe(fonts.body600);
  });
});

describe("Toast action (ToastLogged.dc.html 'Rate them', CompareToastPicked.dc.html 'Another')", () => {
  const action = (label: string, onPress = () => {}) => ({ label, onPress });
  const labelNode = (r: renderer.ReactTestRenderer, label: string) => r.root.findAllByType(Text).find((n) => n.props.children === label)!;
  const actionButton = (r: renderer.ReactTestRenderer) => r.root.findAllByProps({ accessibilityRole: "button" })[0];

  it.each([
    ["ToastLogged.dc.html", "Rate them", "Logged 3 items"],
    ["CompareToastPicked.dc.html", "Another", "French Toast"],
  ])("%s: the action is a 44-high, 12/600 uppercase maroon label right of the text", (file, label, message) => {
    const r = render({ kind: "success", message, subline: "x", action: action(label) });
    const spec = artboardStyle(file, label);
    const text = flat(labelNode(r, label).props.style);
    expect(text.fontSize).toBe(spec.fontSize);
    expect(text.letterSpacing).toBe(spec.letterSpacing);
    expect(text.textTransform).toBe(spec.textTransform);
    expect(c(text.color)).toBe(spec.color);
    expect(text.fontFamily).toBe(familyFor(spec.fontWeight));
    const box = flat(actionButton(r).props.style);
    expect(box.height).toBe(spec.height);
    expect(box.paddingHorizontal).toBe(spec.paddingHorizontal);
    // right of the text: the body (message, sub-line) comes first, the action last
    expect(pressable(r).findAllByType(Text).map((n) => n.props.children)).toEqual([message, "x", label]);
  });

  it("the card itself is unchanged by an action (same padding, border, minHeight)", () => {
    expectCardMatches(render({ kind: "success", message: "Logged 3 items", subline: "x", action: action("Rate them") }), "ToastLogged.dc.html", "Logged 3 items");
  });

  it("tapping the action calls its onPress and not onDismiss", () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    const r = render({ kind: "success", message: "x", action: action("Rate them", onPress), onDismiss });
    act(() => actionButton(r).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("CompareToastRoundDone.dc.html: the round's last toast is the same card with the winner and score and no action", () => {
    const file = "CompareToastRoundDone.dc.html";
    const r = render({ kind: "success", message: "French Toast", subline: "9.1 · 15 comparisons" });
    expectCardMatches(r, file, "9.1 · 15 comparisons"); // anchored on the sub-line: "French Toast" also names a menu row behind the scrim
    expect(r.root.findAllByType(Text).map((n) => n.props.children)).toEqual(["French Toast", "9.1 · 15 comparisons"]);
    expect(() => artboardStyle(file, "Another")).toThrow(); // the artboard has no action, so neither does the toast
    expect(() => artboardStyle(file, "Rate them")).toThrow();
    expect(actionButton(r)).toBeUndefined();
  });

  it("no action prop renders no action label", () => {
    const r = render({ kind: "success", message: "Logged 3 items", subline: "x" });
    expect(r.root.findAllByType(Text).map((n) => n.props.children)).toEqual(["Logged 3 items", "x"]);
  });
});

describe("Toast behaviour", () => {
  it("anchors at the given bottom offset", () => {
    const r = render({ kind: "failure", message: "x", bottom: 100 });
    expect(flat(pressable(r).parent!.props.style).bottom).toBe(100);
  });

  it("tapping it calls onDismiss", () => {
    const onDismiss = jest.fn();
    const r = render({ kind: "failure", message: "x", onDismiss });
    act(() => pressable(r).props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("enters and exits on durations.toast, opacity on curves.ease and transform on curves.pane, moving toastRise", () => {
    const src = fs.readFileSync(path.join(__dirname, "Toast.tsx"), "utf8");
    // Anchored to each worklet's own text, so a curve is tied to its property AND direction.
    const fn = (name: string) => src.slice(src.indexOf(`const ${name} =`), src.indexOf("};", src.indexOf(`const ${name} =`)));
    const entering = fn("toastEntering");
    const exiting = fn("toastExiting");
    expect(entering).toMatch(/opacity: withTiming\(1, \{ duration: durations\.toast, easing: reanimatedEaseCurve \}\)/);
    expect(entering).toMatch(/translateY: withTiming\(0, \{ duration: durations\.toast, easing: reanimatedPaneCurve \}\)/);
    expect(exiting).toMatch(/opacity: withTiming\(0, \{ duration: durations\.toast, easing: reanimatedEaseCurve \}\)/);
    expect(exiting).toMatch(/translateY: withTiming\(toastRise, \{ duration: durations\.toast, easing: reanimatedPaneCurve \}\)/);
    const outer = pressable(render({ kind: "failure", message: "x" })).parent!.props;
    expect(outer.entering().initialValues).toEqual({ opacity: 0, transform: [{ translateY: toastRise }] });
    expect(outer.exiting().initialValues).toEqual({ opacity: 1, transform: [{ translateY: 0 }] });
  });
});

describe("useToastDwell", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  function Host({ toast, dismiss, pinned }: { toast: { kind: "success" | "failure"; action?: unknown } | null; dismiss: (t: null) => void; pinned?: boolean }) {
    useToastDwell(toast, dismiss, pinned);
    return null;
  }
  const dismissedAfter = (toast: { kind: "success" | "failure"; action?: unknown }, ms: number, pinned = false) => {
    const dismiss = jest.fn();
    act(() => {
      renderer.create(<Host toast={toast} dismiss={dismiss} pinned={pinned} />);
    });
    act(() => jest.advanceTimersByTime(ms - 1));
    const early = dismiss.mock.calls.length;
    act(() => jest.advanceTimersByTime(2));
    return [early, dismiss.mock.calls.length];
  };
  it("dismisses a plain success at toastDwell and one with an action at toastActionDwell", () => {
    expect(dismissedAfter({ kind: "success" }, toastDwell)).toEqual([0, 1]);
    expect(dismissedAfter({ kind: "success", action: {} }, toastActionDwell)).toEqual([0, 1]);
  });
  it("never dismisses a failure or a pinned fixture toast", () => {
    expect(dismissedAfter({ kind: "failure" }, toastActionDwell * 2)).toEqual([0, 0]);
    expect(dismissedAfter({ kind: "success" }, toastDwell * 2, true)).toEqual([0, 0]);
  });
  it("cancels the pending dismissal when the host unmounts", () => {
    const dismiss = jest.fn();
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Host toast={{ kind: "success" }} dismiss={dismiss} />);
    });
    act(() => root.unmount());
    act(() => jest.advanceTimersByTime(toastActionDwell * 2));
    expect(dismiss).not.toHaveBeenCalled();
  });
  it("takes its dwell from lib/motion.ts: no numeric literal in the hook's timer", () => {
    const src = fs.readFileSync(path.join(__dirname, "Toast.tsx"), "utf8");
    const body = src.slice(src.indexOf("export function useToastDwell"), src.indexOf("interface Props"));
    expect(body).toMatch(/setTimeout\(\(\) => dismiss\(null\), toast\.action \? toastActionDwell : toastDwell\)/);
    expect(body).not.toMatch(/setTimeout\([^;]*\d/);
  });
});
