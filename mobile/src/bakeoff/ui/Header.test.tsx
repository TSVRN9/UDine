import { act } from "react";
import { StyleSheet, Text } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { Header, type Labels } from "./Header";

const labels: Labels = { status: "Open until midnight", onStatus: () => {} };
const mount = () => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<Header title="Worcester" height={240} labels={labels} oldLabels={null} />); });
  return r;
};
const statusButtons = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type !== "string" && String(n.props.accessibilityLabel ?? "").endsWith("hours and directions") && n.props.hitSlop);

describe("the header's status button (the schedule's door)", () => {
  it("is at least 44 dp to touch: its line and the slop above and below it", () => {
    const b = statusButtons(mount())[0];
    expect(m2.type.status.line + b.props.hitSlop.top + b.props.hitSlop.bottom).toBeGreaterThanOrEqual(m2.size.tap);
  });
  it("gets there by slop alone, so the status line does not move", () => {
    const s = StyleSheet.flatten(statusButtons(mount())[0].props.style);
    expect(s.padding ?? s.paddingVertical ?? s.paddingTop ?? s.margin ?? s.marginTop ?? 0).toBe(0);
  });
});

// What says the day exists twice only while a day change holds the old labels: otherwise the header is drawn once, and the busy board, with its
// 85 lamps, is mounted once
let mounts = 0;
const Probe = () => { mounts++; return <Text>board</Text>; };
describe("the header's layers", () => {
  const withBoard: Labels = { ...labels, board: <Probe />, meals: { items: [{ key: "lunch", label: "Lunch" }], selected: "lunch", onSelect: () => {} }, station: { label: "Grill", onPress: () => {} }, day: { label: "Today", accessibilityLabel: "Today", onPress: () => {} } };
  const hidden = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.importantForAccessibility === "no-hide-descendants" && n.props.children);
  const draw = (old: Labels | null) => { mounts = 0; let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(<Header title="Worcester" height={240} labels={withBoard} oldLabels={old} />); }); return r; };
  it("draws the old labels' layer only while a day change holds them", () => {
    const count = (r: renderer.ReactTestRenderer, text: string) => r.root.findAll((n) => (n.type as unknown) === "Text" && n.props.children === text).length;
    const once = draw(null), twice = draw(withBoard);
    expect(count(once, "Open until midnight")).toBe(1);
    expect(count(twice, "Open until midnight")).toBe(2);
    expect(count(twice, "Today")).toBeGreaterThan(count(once, "Today"));
    expect(count(twice, "Grill")).toBe(2);
    expect(count(once, "Grill")).toBe(1);
    expect(hidden(twice).length).toBeGreaterThan(hidden(once).length);
  });
  it("mounts the board once, held or not", () => {
    draw(null);
    expect(mounts).toBe(1);
    draw(withBoard);
    expect(mounts).toBe(1);
  });
});

// M2 `#menu.cafe .mt{bottom:22px}` (a café's name sits lower: no letter, no board) and `.mt .bz{margin-top:8px}`, which keeps its 8 dp when the busy row is empty
describe("a café's title block", () => {
  const block = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && StyleSheet.flatten(n.props.style)?.bottom !== undefined && StyleSheet.flatten(n.props.style)?.position === "absolute" && StyleSheet.flatten(n.props.style)?.left === 20)[0];
  const draw = (cafe: boolean, l: Labels) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(<Header title="Wasabi" height={240} cafe={cafe} labels={l} oldLabels={null} />); }); return r; };
  it("hangs 22 above the header's foot, a hall's 50", () => {
    expect(StyleSheet.flatten(block(draw(true, labels)).props.style).bottom).toBe(22);
    expect(StyleSheet.flatten(block(draw(false, labels)).props.style).bottom).toBe(50);
  });
  it("keeps the busy row's 8 dp under the status line when it has no busy row", () => {
    const spacers = (r: renderer.ReactTestRenderer) => block(r).findAll((n) => typeof n.type === "string" && StyleSheet.flatten(n.props.style)?.height === 8 && n.props.testID === "busy-room");
    expect(spacers(draw(true, labels))).toHaveLength(1);
    expect(spacers(draw(true, { ...labels, busy: <Text>Busy</Text> }))).toHaveLength(0);
  });
});
