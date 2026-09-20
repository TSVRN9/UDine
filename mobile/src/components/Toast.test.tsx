import fs from "node:fs";
import path from "node:path";
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text } from "react-native";
import { Toast } from "./Toast";
import { artboardEnclosingStyle, artboardStyle, normalizeColor } from "../lib/artboard";

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

  it("enters and exits on durations.toast, not a literal", () => {
    const src = fs.readFileSync(path.join(__dirname, "Toast.tsx"), "utf8");
    expect(src).toMatch(/FadeInDown\.duration\(durations\.toast\)/);
    expect(src).toMatch(/FadeOutDown\.duration\(durations\.toast\)/);
  });
});
